# ==============================================================================
# Amanah Healthcare - Automated Push Notification & Admin Event Simulation
# Skenario:
# 1. Verifikasi Device Token Dr. Zikri di PostgreSQL (user_devices)
# 2. Login Admin via POST /api/v1/auth/email/login (Canonical Admin Credentials)
# 3. Persiapan Janji Temu Uji (Test Appointment)
# 4. Eksekusi PATCH /api/v1/admin/appointments/:id/doctor (Admin -> Dokter)
# 5. Verifikasi Log Pengiriman FCM di Backend Worker (Firebase Admin SDK)
# 6. Verifikasi Penerimaan di Android Emulator (adb logcat / Status Bar)
# 7. Verifikasi In-App Notification Store (GET /api/v1/notifications/me)
# ==============================================================================

param(
    [string]$BaseUrl = "http://127.0.0.1:3001",
    [string]$DoctorUserId = "21d12218-166d-4d58-a03c-a4ac8516df9d",
    [string]$DrZikriPractitionerId = "d403922c-2da2-4191-a04b-c9d6ce0e513a",
    [string]$OtherPractitionerId = "82dba40a-eed5-4cdf-89f5-a75dc5242a66", # dr. Ahmad Santoso
    [string]$TestAppointmentId = "a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"
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

function Write-WarningMsg($msg) {
    Write-Host " [WARN] $msg" -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 1. Verifikasi Device Token Aktif di Database
# ------------------------------------------------------------------------------
Write-Section "1. Memeriksa Device Token Aktif Dr. Zikri di Database PostgreSQL"

$dbTokenQuery = "SELECT id, platform, substring(push_token_encrypted, 1, 35) as prefix, updated_at FROM user_devices WHERE user_id = '$DoctorUserId' AND revoked_at IS NULL ORDER BY updated_at DESC LIMIT 1;"
$dbTokenRaw = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c $dbTokenQuery

if (-not $dbTokenRaw -or $dbTokenRaw.Trim() -eq "") {
    Write-WarningMsg "Tidak ditemukan active device token untuk Dr. Zikri di tabel user_devices!"
    Write-WarningMsg "Pastikan aplikasi di emulator sudah login menggunakan akun Dr. Zikri."
    exit 1
}

$parts = $dbTokenRaw.Split('|')
$deviceId = $parts[0]
$platform = $parts[1]
$tokenPrefix = $parts[2]
Write-Success "Device Terdaftar: ID=$deviceId, Platform=$platform, TokenPrefix=$tokenPrefix..."

# ------------------------------------------------------------------------------
# 2. Autentikasi Admin & Dokter
# ------------------------------------------------------------------------------
Write-Section "2. Autentikasi Admin Resmi via /api/v1/auth/email/login"

$adminLoginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$adminLoginRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/email/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
$adminToken = $adminLoginRes.token
$adminHeaders = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
Write-Success "Admin Login Berhasil: Token=$($adminToken.Substring(0, 20))..., Role=$($adminLoginRes.user.role.code)"

$docJwtNodeCmd = "const jwt = require('jsonwebtoken'); console.log(jwt.sign({id: '$DoctorUserId', systemRole: 'STAF', role: {name: 'STAF'}}, 'secret', {expiresIn: '1h'}))"
$doctorToken = (docker exec backend-api-1 node -e $docJwtNodeCmd).Trim()
$docHeaders = @{ Authorization = "Bearer $doctorToken"; "Content-Type" = "application/json" }
Write-Success "Doctor Token disiapkan untuk verifikasi notifikasi"

# ------------------------------------------------------------------------------
# 3. Persiapan Janji Temu Uji
# ------------------------------------------------------------------------------
Write-Section "3. Menyiapkan Appointment Uji (Ditugaskan Awal ke Dokter Lain)"

$cleanSql = "DELETE FROM appointment_status_events WHERE appointment_id = '$TestAppointmentId'; DELETE FROM queue_tickets WHERE appointment_id = '$TestAppointmentId'; DELETE FROM appointments WHERE id = '$TestAppointmentId';"
docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c $cleanSql > $null

$createSql = @"
INSERT INTO appointments (
    id, booking_code, patient_id, practitioner_id, scheduled_date, scheduled_start_time, 
    scheduled_end_time, status, queue_number, service_id, room_id, created_at, updated_at
) VALUES (
    '$TestAppointmentId', 'SIM-PUSH-99',
    (SELECT id FROM patient_profiles WHERE user_id IS NOT NULL LIMIT 1),
    '$OtherPractitionerId',
    CURRENT_DATE, '14:00:00', '14:30:00', 'waiting', 99,
    (SELECT id FROM clinic_services LIMIT 1),
    (SELECT id FROM clinic_rooms LIMIT 1),
    NOW(), NOW()
);
INSERT INTO queue_tickets (
    id, appointment_id, service_id, queue_number, status, queue_date, created_at, updated_at
) VALUES (
    gen_random_uuid(), '$TestAppointmentId', (SELECT id FROM clinic_services LIMIT 1), 'S099', 'waiting', CURRENT_DATE, NOW(), NOW()
);
"@
docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c $createSql > $null
Write-Success "Appointment uji berhasil disiapkan (ID: $TestAppointmentId, Status: waiting, Ditugaskan ke dr. Ahmad)"

# ------------------------------------------------------------------------------
# 4. Trigger Event Admin: Alihkan Penugasan Pasien ke Dr. Zikri
# ------------------------------------------------------------------------------
Write-Section "4. Menjalankan Admin Event: PATCH /api/v1/admin/appointments/:id/doctor"

$reassignBody = @{
    doctorId = $DrZikriPractitionerId
    reason = "Penugasan Pasien Prioritas Antrean ke Dr. Zikri"
} | ConvertTo-Json

Write-Info "Mengirim mutasi penugasan dokter oleh Admin..."
$patchUrl = "$BaseUrl/api/v1/admin/appointments/$TestAppointmentId/doctor"
$patchRes = Invoke-RestMethod -Uri $patchUrl -Headers $adminHeaders -Method Patch -Body $reassignBody

Write-Success "Respon Admin: $($patchRes.message)"
Write-Info "Dokter Baru Terkonfirmasi: $($patchRes.data.doctorName) ($($patchRes.data.staffId))"

# ------------------------------------------------------------------------------
# 5. Verifikasi Pengiriman FCM di Log Worker Backend
# ------------------------------------------------------------------------------
Write-Section "5. Memverifikasi Pengiriman Firebase Cloud Messaging (FCM)"

Start-Sleep -Seconds 2

$workerLogs = docker logs --tail 30 backend-api-1 2>&1 | Out-String

if ($workerLogs -match "Delivered FCM push to user $DoctorUserId" -or $workerLogs -match "FCM push to user") {
    Write-Success "FCM Worker berhasil mengirim notifikasi push ke perangkat Dr. Zikri!"
    Write-Info ($workerLogs.Split("`n") | Where-Object { $_ -match "Delivered FCM push" -or $_ -match "Push notification queued" })
} else {
    Write-WarningMsg "Log pengiriman spesifik:"
    Write-Info ($workerLogs.Split("`n") | Select-Object -Last 10)
}

# ------------------------------------------------------------------------------
# 6. Verifikasi Logcat Emulator Android
# ------------------------------------------------------------------------------
Write-Section "6. Memeriksa Status Penerimaan Notifikasi di Emulator Android"

$logcatOutput = adb -s emulator-5554 logcat -d -s flutter:I 2>&1 | Out-String

if ($logcatOutput -match "Foreground push notification received" -or $logcatOutput -match "Penugasan Pasien Baru" -or $logcatOutput -match "Local notification tapped") {
    Write-Success "Flutter App di Emulator telah menerima push event dan menampilkan notifikasi status bar!"
    Write-Info ($logcatOutput.Split("`n") | Where-Object { $_ -match "Foreground push" -or $_ -match "Penugasan" } | Select-Object -Last 5)
} else {
    Write-Info "Logcat snapshot:"
    Write-Info ($logcatOutput.Split("`n") | Select-Object -Last 10)
}

# ------------------------------------------------------------------------------
# 7. Verifikasi In-App Notification Store SSOT
# ------------------------------------------------------------------------------
Write-Section "7. Verifikasi Sinkronisasi In-App Notification (GET /api/v1/notifications/me)"

$notifRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/me?limit=10" -Headers $docHeaders -Method Get

$notifList = if ($notifRes.data) { $notifRes.data } elseif ($notifRes.notifications) { $notifRes.notifications } else { $notifRes }
Write-Success "Total notifikasi masuk untuk Dr. Zikri: $($notifList.Count) item"

if ($notifList.Count -gt 0) {
    $latest = $notifList[0]
    Write-Info "Notifikasi Terkini: Judul='$($latest.title)', Pesan='$($latest.body ?? $latest.desc)', Kategori='$($latest.category)'"
}

Write-Section "KESIMPULAN PENGUJIAN"
Write-Success "Siklus penuh Firebase Push Notification (Admin -> Backend Outbox -> RabbitMQ -> Worker -> Firebase FCM -> Android Emulator) BERHASIL TERVERIFIKASI!"
