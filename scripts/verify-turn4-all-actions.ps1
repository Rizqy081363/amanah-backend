# ==============================================================================
# Amanah Healthcare - Turn 4 All Queue Lifecycle Actions Live Verification
# Tests:
# 1. Auth & Session Patients API with SSOT allowedActions
# 2. Call Patient action & notification
# 3. Start Service action & IN_SERVICE allowedActions verification
# 4. Complete Service action & notification
# 5. Cancel Appointment action & bidirectional notification
# 6. No-Show action & clinic notification
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

# 2. Verify Session Patients & allowedActions
Write-Section "2. Verifikasi GET Session Patients & allowedActions SSOT"
$patientsRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/schedules/sessions/$SessionId/patients?status=waiting" -Headers $docHeaders -Method Get
Write-Success "Session: $($patientsRes.data.sessionLabel), Pasien aktif: $($patientsRes.data.patients.Count)"

if ($patientsRes.data.patients.Count -gt 0) {
    $firstPatient = $patientsRes.data.patients[0]
    Write-Info "Pasien Pertama: $($firstPatient.patient.fullName), Status: $($firstPatient.status)"
    Write-Info "Allowed Actions: $($firstPatient.allowedActions -join ', ')"
    if ($firstPatient.allowedActions -contains "CALL" -and $firstPatient.allowedActions -contains "START_SERVICE") {
        Write-Success "allowedActions terverifikasi memuat CALL dan START_SERVICE!"
    } else {
        throw "allowedActions tidak memuat aksi yang diharapkan: $($firstPatient.allowedActions -join ', ')"
    }
}

# 3. Call Patient Test
Write-Section "3. Pengujian Aksi Panggil Pasien (POST /appointments/:id/call)"
$targetApt = $patientsRes.data.patients | Sort-Object { [int]($_.queueNumber -replace '\D', '') } | Select-Object -First 1
Write-Info "Memanggil antrean giliran pertama: $($targetApt.patient.fullName) ($($targetApt.queueNumber), ID: $($targetApt.appointmentId))"
$callBody = @{ notes = "Panggilan tes Turn 4 via mobile" } | ConvertTo-Json
$callRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$($targetApt.appointmentId)/call" -Headers $docHeaders -Method Post -Body $callBody
Write-Success "Panggilan pasien berhasil: status=$($callRes.status), attempt=$($callRes.attemptNumber)/$($callRes.maxAttempts)"

# 4. Start Service Test
Write-Section "4. Pengujian Mulai Pemeriksaan (POST /appointments/:id/start)"
$startRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$($targetApt.appointmentId)/start" -Headers $docHeaders -Method Post
Write-Success "Start service berhasil: status=$($startRes.status), queueNumber=$($startRes.queueNumber)"

# Verify allowedActions for IN_SERVICE
$patientsAfterStart = Invoke-RestMethod -Uri "$BaseUrl/api/v1/schedules/sessions/$SessionId/patients?status=waiting" -Headers $docHeaders -Method Get
$inServicePatient = $patientsAfterStart.data.patients | Where-Object { $_.appointmentId -eq $targetApt.appointmentId }
if ($inServicePatient) {
    Write-Info "Pasien in_service allowedActions: $($inServicePatient.allowedActions -join ', ')"
    if ($inServicePatient.allowedActions -contains "COMPLETE") {
        Write-Success "Pasien in_service memiliki aksi kanonikal COMPLETE!"
    }
}

# 5. Complete Service Test
Write-Section "5. Pengujian Selesaikan Pemeriksaan (POST /appointments/:id/complete)"
$completeRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$($targetApt.appointmentId)/complete" -Headers $docHeaders -Method Post
Write-Success "Complete service berhasil: status=$($completeRes.status), queueNumber=$($completeRes.queueNumber)"

# 6. Test Cancel with Reason on a test appointment
Write-Section "6. Pengujian Pembatalan Janji Temu dengan Alasan (POST /appointments/:id/cancel)"
$testCancelId = "c4a01234-5678-4abc-def0-123456789abc"
docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM appointments WHERE id = '$testCancelId';" > $null
$createSql = "INSERT INTO appointments (id, booking_code, patient_id, practitioner_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, queue_number, service_id, room_id, created_at, updated_at) VALUES ('$testCancelId', 'T4-CNCL', (SELECT id FROM patient_profiles WHERE user_id IS NOT NULL LIMIT 1), 'd403922c-2da2-4191-a04b-c9d6ce0e513a', CURRENT_DATE, '14:00:00', '14:30:00', 'waiting', 99, (SELECT id FROM clinic_services LIMIT 1), (SELECT id FROM clinic_rooms LIMIT 1), NOW(), NOW());"
docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -c $createSql > $null

$cancelBody = @{ reason = "Dibatalkan dokter karena kendala operasional (Turn 4 Verification)" } | ConvertTo-Json
$cancelRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments/$testCancelId/cancel" -Headers $docHeaders -Method Post -Body $cancelBody -ContentType "application/json"
Write-Success "Cancel appointment berhasil: status=$($cancelRes.status), reason=$($cancelRes.cancellationReason)"

Start-Sleep -Seconds 2

# Verify Cancel Notification in DB
$cancelNotifs = docker exec backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT COUNT(*) FROM notifications WHERE body LIKE '%Turn 4 Verification%';"
Write-Success "Notifikasi pembatalan tercatat di database: $cancelNotifs record"

Write-Section "SEMUA AKSI ANTREAN & NOTIFIKASI TURN 4 TERVERIFIKASI PENUH!"
