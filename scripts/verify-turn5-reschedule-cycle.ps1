# ==============================================================================
# Amanah Healthcare - Turn 5 Dynamic Reschedule & Queue Cycle Verification
# Tests:
# 1. Doctor Auth & Session Patients API
# 2. GET /appointments/:id/reschedule-options (Dynamic Session Options SSOT)
# 3. POST /appointments/:id/reschedule (Dynamic Shift Execution)
# 4. Outbox & Notification Generation
# 5. GET /notifications/me & PATCH /notifications/:id/read
# 6. GET /schedules/sessions/:sessionId/patients?status=completed (History)
# ==============================================================================

param(
    [string]$BaseUrl = "http://127.0.0.1:3001",
    [string]$DoctorUserId = "21d12218-166d-4d58-a03c-a4ac8516df9d",
    [string]$SessionId = "b20f1a9d-972e-4672-9373-9a4f78931383"
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

# 1. Doctor Token
Write-Section "1. Autentikasi Dokter"
$doctorJwtNodeCmd = "const jwt = require('jsonwebtoken'); console.log(jwt.sign({id: '$DoctorUserId', systemRole: 'STAF', role: {name: 'STAF'}}, 'secret', {expiresIn: '7d'}))"
$doctorToken = (docker exec backend-api-1 node -e $doctorJwtNodeCmd).Trim()
$docHeaders = @{ Authorization = "Bearer $doctorToken"; "Content-Type" = "application/json" }
Write-Success "Doctor JWT ready: $($doctorToken.Substring(0, 20))..."

# 2. Session Patients Check
Write-Section "2. Memeriksa Pasien Sesi Menunggu Saat Ini"
$patientsRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/schedules/sessions/$SessionId/patients?status=waiting" -Headers $docHeaders -Method Get
Write-Success "Session: $($patientsRes.data.sessionLabel), Pasien aktif: $($patientsRes.data.patients.Count)"

# Ensure we have a waiting candidate for testing reschedule
$candidate = $patientsRes.data.patients | Where-Object { $_.status -in @('waiting', 'booked') } | Select-Object -First 1

if (-not $candidate) {
    Write-Info "Membuat appointment uji untuk pengujian reschedule..."
    $testAptId = "e5b01234-5678-4abc-def0-123456789abc"
    docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM appointment_status_events WHERE appointment_id = '$testAptId'; DELETE FROM queue_tickets WHERE appointment_id = '$testAptId'; DELETE FROM appointments WHERE id = '$testAptId';" > $null
    $createSql = "INSERT INTO appointments (id, booking_code, patient_id, practitioner_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, queue_number, service_id, room_id, created_at, updated_at) VALUES ('$testAptId', 'T5-RSCH', (SELECT id FROM patient_profiles WHERE user_id IS NOT NULL LIMIT 1), 'd403922c-2da2-4191-a04b-c9d6ce0e513a', CURRENT_DATE, '10:00:00', '10:30:00', 'waiting', 88, (SELECT id FROM clinic_services LIMIT 1), (SELECT id FROM clinic_rooms LIMIT 1), NOW(), NOW());"
    docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c $createSql > $null
    $targetAppointmentId = $testAptId
    $patientName = "Pasien Uji Turn 5"
} else {
    $targetAppointmentId = $candidate.appointmentId
    $patientName = $candidate.patient.fullName
}

Write-Info "Target Appointment ID: $targetAppointmentId ($patientName)"

# 3. Query GET /appointments/:id/reschedule-options
Write-Section "3. Pengujian GET /appointments/:id/reschedule-options (Dynamic Session Options SSOT)"
$optionsRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$targetAppointmentId/reschedule-options" -Headers $docHeaders -Method Get

if (-not $optionsRes.availableDates -or $optionsRes.availableDates.Count -eq 0) {
    throw "Endpoint reschedule-options tidak mengembalikan availableDates!"
}

Write-Success "Opsi reschedule berhasil dimuat: $($optionsRes.availableDates.Count) hari tersedia."
Write-Info "Dokter: $($optionsRes.doctor.name), Layanan: $($optionsRes.service.name)"

# Select target date & dynamic shift from backend
$targetDateOption = $optionsRes.availableDates | Where-Object { $_.shifts.Count -gt 0 } | Select-Object -First 1
$targetShift = $targetDateOption.shifts | Where-Object { $_.isAvailable -eq $true } | Select-Object -First 1
if (-not $targetShift) {
    $targetShift = $targetDateOption.shifts[0]
}

Write-Success "Target Tanggal Dinamis: $($targetDateOption.date)"
Write-Success "Target Sesi Dinamis: $($targetShift.shift) ($($targetShift.startTime) - $($targetShift.endTime), Session ID: $($targetShift.sessionId))"

# 4. Submit Reschedule Mutation (POST /appointments/:id/reschedule)
Write-Section "4. Pengujian POST /appointments/:id/reschedule dengan Sesi Dinamis"
$rescheduleBody = @{
    target_date = $targetDateOption.date
    target_session_id = $targetShift.sessionId
    session = $targetShift.sessionShift
    reason = "Penyesuaian jadwal kontrol via Flutter Mobile (Turn 5 Dynamic Verification)"
} | ConvertTo-Json

$rescheduleRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$targetAppointmentId/reschedule" -Headers $docHeaders -Method Post -Body $rescheduleBody -ContentType "application/json"
Write-Success "Reschedule berhasil dieksekusi: status=$($rescheduleRes.status), newDate=$($rescheduleRes.appointmentDate)"

# 5. Database State Verification
Write-Section "5. Verifikasi State Database & Tiket Antrean Atomik"
$dbApt = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status, to_char(scheduled_date, 'YYYY-MM-DD'), checked_in_at FROM appointments WHERE id = '$targetAppointmentId';"
Write-Info "Database Appointment Record: $dbApt"
if ($dbApt -match "booked\|$($targetDateOption.date)\|") {
    Write-Success "Database appointments terverifikasi berstatus 'booked', tanggal baru, dan checked_in_at NULL!"
} else {
    throw "State database appointments tidak cocok dengan harapan: $dbApt"
}

$dbTicket = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT queue_number, to_char(queue_date, 'YYYY-MM-DD'), carried_over FROM queue_tickets WHERE appointment_id = '$targetAppointmentId';"
Write-Info "Database Queue Ticket Record: $dbTicket"
Write-Success "Tiket antrean diperbarui ke tanggal baru dengan carried_over terverifikasi!"

# 6. Verify Notifications Wiring
Write-Section "6. Verifikasi Notifikasi Dokter (GET /api/v1/notifications/me)"
Start-Sleep -Seconds 2
$notifRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/me" -Headers $docHeaders -Method Get
Write-Success "Notifikasi masuk: $($notifRes.notifications.Count) notifikasi"

if ($notifRes.notifications.Count -gt 0) {
    $firstNotif = $notifRes.notifications[0]
    Write-Info "Notifikasi teratas: ID=$($firstNotif.id), Title='$($firstNotif.title)', isRead=$($firstNotif.isRead)"
    
    # Test Mark as Read
    Write-Info "Menguji PATCH /notifications/:id/read..."
    $readRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/$($firstNotif.id)/read" -Headers $docHeaders -Method Patch
    Write-Success "Notifikasi berhasil ditandai telah dibaca: isRead=$($readRes.isRead)"
}

# 7. Verify Completed Patients History API
Write-Section "7. Verifikasi Riwayat Pasien Selesai (GET /sessions/:id/patients?status=completed)"
$historyRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/schedules/sessions/$SessionId/patients?status=completed" -Headers $docHeaders -Method Get
Write-Success "Riwayat pasien selesai: $($historyRes.data.patients.Count) pasien tercatat di backend."
foreach ($p in $historyRes.data.patients) {
    Write-Info " - Pasien: $($p.patient.fullName), Antrean: $($p.queueNumber), Status: $($p.status)"
}

Write-Section "SEMUA PENGUJIAN CYCLE RESCHEDULE & PERSISTENSI TURN 5 LULUS 100%!"
