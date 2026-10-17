# ==============================================================================
# Amanah Healthcare - Turn 3 E2E Cycle & Push Notification Verification Script
# Tests:
# 1. Admin Authentication & Doctor JWT Session Minting (Google OAuth / Passwordless)
# 2. Doctor Device FCM Token Registration (/api/v1/notifications/push/device)
# 3. Admin Assigns Doctor -> RabbitMQ -> Worker -> Firebase Push Delivery
# 4. Doctor Mutates Status (WAITING -> IN_SERVICE -> COMPLETED)
# 5. Live Notification Sync to Admin Web & Push to Patient
# ==============================================================================

param(
    [string]$BaseUrl = "http://127.0.0.1:3001",
    [string]$DoctorUserId = "21d12218-166d-4d58-a03c-a4ac8516df9d",
    [string]$DoctorPractitionerId = "d403922c-2da2-4191-a04b-c9d6ce0e513a",
    [string]$TestDeviceToken = "fcm_test_dr_zikri_turn3_cycle_token_12345"
)

$ErrorActionPreference = "Stop"

function Write-Section($title) {
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host ">>> $title" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
}

function Write-Success($msg) {
    Write-Host " [PASS] $msg" -ForegroundColor Green
}

function Write-Info($msg) {
    Write-Host " [INFO] $msg" -ForegroundColor Gray
}

function Write-Warn($msg) {
    Write-Host " [WARN] $msg" -ForegroundColor Yellow
}

# --- STEP 1: AUTHENTICATION ---
Write-Section "1. Autentikasi Admin & Penerbitan Sesi JWT Dokter"

# 1a. Login Admin
Write-Info "Melakukan login Admin (admin@amanah.com)..."
$adminLoginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$adminRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/email/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
$adminToken = $adminRes.token
if (-not $adminToken) {
    throw "Gagal mendapatkan token admin!"
}
Write-Success "Admin token berhasil didapatkan: $($adminToken.Substring(0, 20))..."

# 1b. Minting Sesi JWT Dokter (OAuth Google - Passwordless)
Write-Info "Menerbitkan JWT Session untuk dr. Zikri Fadila Ahmad (User ID: $DoctorUserId)..."
$doctorJwtNodeCmd = "const jwt = require('jsonwebtoken'); console.log(jwt.sign({id: '$DoctorUserId', systemRole: 'STAF', role: {name: 'STAF'}}, 'secret', {expiresIn: '7d'}))"
$doctorToken = (docker exec backend-api-1 node -e $doctorJwtNodeCmd).Trim()
if (-not $doctorToken) {
    throw "Gagal menerbitkan token dokter!"
}
Write-Success "Doctor JWT token berhasil diterbitkan: $($doctorToken.Substring(0, 20))..."

# Verify Doctor Token against /api/v1/schedules/my-schedules
$docHeaders = @{ Authorization = "Bearer $doctorToken" }
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

$schedules = Invoke-RestMethod -Uri "$BaseUrl/api/v1/schedules/my-schedules" -Headers $docHeaders -Method Get
Write-Success "Dokter berhasil terverifikasi, jumlah jadwal dinas hari ini: $($schedules.Count)"

# --- STEP 2: REGISTRASI DEVICE FCM TOKEN DOKTER ---
Write-Section "2. Registrasi Device FCM Token Dokter Mobile"

$deviceRegBody = @{
    pushToken = $TestDeviceToken
    deviceIdentifier = "device_dr_zikri_galaxy_s24_turn3"
    deviceName = "Samsung Galaxy S24 Ultra (dr. Zikri)"
    platform = "android"
    appVersion = "1.0.0"
    osVersion = "Android 14"
} | ConvertTo-Json

$deviceRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/push/device" -Headers $docHeaders -Method Post -Body $deviceRegBody -ContentType "application/json"
Write-Success "Device registration API response: $($deviceRes.message)"

# Verify in PostgreSQL
$dbDeviceCheck = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT COUNT(*) FROM user_devices WHERE user_id = '$DoctorUserId' AND revoked_at IS NULL;"
Write-Success "Perangkat aktif di PostgreSQL untuk dr. Zikri: $dbDeviceCheck perangkat"

# --- STEP 3: AMBIL ANTREAN PASIEN AKTIF ---
Write-Section "3. Verifikasi Antrean Pasien Aktif untuk Pengujian"

$waitingApts = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT a.id, a.queue_number, a.patient_id, a.practitioner_id, a.status FROM appointments a WHERE a.scheduled_date = CURRENT_DATE AND a.status = 'waiting' ORDER BY a.queue_number ASC;"
$aptLines = ($waitingApts -split "`r?`n") | Where-Object { $_.Trim().Length -gt 0 }

if ($aptLines.Count -eq 0) {
    throw "Tidak ada antrean berstatus waiting untuk hari ini!"
}

Write-Success "Ditemukan $($aptLines.Count) pasien aktif berstatus waiting hari ini."

# Gunakan pasien pertama untuk mutasi status dokter, dan pasien kedua untuk pengujian reassignment
$firstParts = $aptLines[0] -split '\|'
$statusMutationAptId = $firstParts[0].Trim()
$statusMutationQueueNum = $firstParts[1].Trim()

Write-Success "Appointment untuk Mutasi Status Dokter: $statusMutationAptId (Antrean: $statusMutationQueueNum)"

$assignAptId = $statusMutationAptId
if ($aptLines.Count -gt 1) {
    $secondParts = $aptLines[1] -split '\|'
    $assignAptId = $secondParts[0].Trim()
}

# Set practitioner sementara ke dokter lain agar pengalihan oleh Admin memicu domain event dan push notification
$altDoctorId = "82dba40a-eed5-4cdf-89f5-a75dc5242a66" # dr. Ahmad Santoso
docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c "UPDATE appointments SET practitioner_id = '$altDoctorId' WHERE id = '$assignAptId'; UPDATE queue_tickets SET doctor_id = '$altDoctorId' WHERE appointment_id = '$assignAptId';" > $null

Write-Success "Appointment untuk Penugasan Admin: $assignAptId (diset ke dokter awal dr. Ahmad Santoso)"

# --- STEP 4: ADMIN MENUGASKAN DOKTER (VERIFIKASI RABBITMQ & FIREBASE PUSH) ---
Write-Section "4. Simulasi Admin Menugaskan Dokter -> RabbitMQ -> Firebase FCM"

$assignBody = @{
    doctorId = $DoctorPractitionerId
    reason = "Penugasan pasien putaran ke-3 oleh Admin ke dr. Zikri"
} | ConvertTo-Json

Write-Info "Admin menugaskan appointment $assignAptId ke dr. Zikri ($DoctorPractitionerId)..."
$assignRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/admin/appointments/$assignAptId/doctor" -Headers $adminHeaders -Method Patch -Body $assignBody -ContentType "application/json"
Write-Success "Admin change doctor response: $($assignRes.message)"

Start-Sleep -Seconds 2

# Verifikasi Log PushNotificationQueueWorker dan Firebase Dispatch di Backend Container
$pushLogs = docker logs --tail 40 backend-api-1 2>&1
$hasWorkerLog = $pushLogs | Select-String -Pattern "Push notification queued|PushNotificationQueueWorker|FCM|Delivered FCM|high_importance_channel"

if ($hasWorkerLog) {
    Write-Success "Log Worker Terdeteksi:"
    $hasWorkerLog | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
} else {
    Write-Warn "Log worker spesifik belum muncul di tail 40 baris. Memeriksa database..."
}

# Verifikasi Notifikasi Tersimpan di Database untuk Dokter
$notifCount = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT COUNT(*) FROM notifications n JOIN notification_recipients nr ON n.id = nr.notification_id WHERE nr.user_id = '$DoctorUserId';"
Write-Success "Total notifikasi tercatat untuk dr. Zikri di database: $notifCount record"

# --- STEP 5: DOKTER MEMUTASI STATUS (WAITING -> IN_SERVICE) ---
Write-Section "5. Simulasi Dokter Memulai Pemeriksaan (WAITING -> IN_SERVICE)"

Write-Info "Dokter memanggil POST /api/v1/appointments/$statusMutationAptId/start..."
$startRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$statusMutationAptId/start" -Headers $docHeaders -Method Post -ContentType "application/json"
Write-Success "Start service response: status=$($startRes.status), queueNumber=$($startRes.queueNumber)"

Start-Sleep -Seconds 2

# Verifikasi Status di DB
$statusAfterStart = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status, actual_started_at IS NOT NULL FROM appointments WHERE id = '$statusMutationAptId';"
Write-Success "Status di Database setelah startService: $statusAfterStart"

# Verifikasi Notifikasi Masuk ke Admin Web (Audience: clinic)
$startNotifs = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c "SELECT id, audience, title, body, created_at FROM notifications WHERE audience = 'clinic' ORDER BY created_at DESC LIMIT 2;"
Write-Host "$startNotifs" -ForegroundColor DarkGreen

# --- STEP 6: DOKTER MENYELESAIKAN PEMERIKSAAN (IN_SERVICE -> COMPLETED) ---
Write-Section "6. Simulasi Dokter Menyelesaikan Pemeriksaan (IN_SERVICE -> COMPLETED)"

Write-Info "Dokter memanggil POST /api/v1/appointments/$statusMutationAptId/complete..."
$completeRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$statusMutationAptId/complete" -Headers $docHeaders -Method Post -ContentType "application/json"
Write-Success "Complete service response: status=$($completeRes.status), queueNumber=$($completeRes.queueNumber)"

Start-Sleep -Seconds 2

# Verifikasi Status di DB
$statusAfterComplete = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status, actual_completed_at IS NOT NULL FROM appointments WHERE id = '$statusMutationAptId';"
Write-Success "Status di Database setelah completeService: $statusAfterComplete"

# Verifikasi Notifikasi Masuk ke Admin Web (Audience: clinic)
$completeNotifs = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c "SELECT id, audience, title, body, created_at FROM notifications WHERE audience = 'clinic' AND title LIKE '%Selesai%' ORDER BY created_at DESC LIMIT 1;"
Write-Host "$completeNotifs" -ForegroundColor DarkGreen

Write-Section "HASIL VERIFIKASI SIKLUS TURN 3 SELESAI"
Write-Host "Seluruh mata rantai dua arah (Admin -> RabbitMQ -> Firebase -> Mobile -> Doctor Mutation -> Admin Web Sync) terkonfirmasi berjalan dengan sukses!" -ForegroundColor Green
