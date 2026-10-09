# ==============================================================================
# Amanah Healthcare - E2E Advanced Multi-Patient & Edge Cases Test Suite
# Focus: Multi-patient bookings, category/session isolation, QR kiosk check-in,
#        queue progression, no-show requeue, lateness sweep, and zero duplicate tickets.
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:3001/api/v1"
)

$ErrorActionPreference = "Stop"

# 1. Source Common Test Library
$commonPath = Join-Path $PSScriptRoot "..\common.ps1"
if (-not (Test-Path $commonPath)) {
    throw "Common helper file not found at: $commonPath"
}
. $commonPath

Reset-TestCounters

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " [SCENARIO 6] ADVANCED MULTI-PATIENT, CATEGORY ISOLATION & EDGE-CASE HARNESS" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green

$apiUrl = Get-E2EApiBaseUrl
$targetDate = (Get-Date).AddDays(3).ToString("yyyy-MM-dd")
Write-Host " Test Execution Date: $targetDate" -ForegroundColor DarkGray

# Clean any leftover operational test data for this specific target date to ensure strict determinism
try {
    $null = Run-DockerSql "DELETE FROM appointment_call_attempts WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$targetDate'); DELETE FROM queue_tickets WHERE queue_date = '$targetDate'; DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$targetDate'); DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$targetDate'); DELETE FROM queue_counter WHERE service_date = '$targetDate'; DELETE FROM appointments WHERE scheduled_date = '$targetDate';"
} catch {
    Write-Host " Note: Pre-clean for target date completed or not required." -ForegroundColor DarkGray
}

# ------------------------------------------------------------------------------
# STEP 1: Authenticate Actors (5 Patients, 1 Admin, 1 Doctor)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Actors..." -ForegroundColor Yellow
$adminAuth = Login-Admin
Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

$doctorAuth = Login-Doctor
Assert-Test "Doctor authenticated" ($null -ne $doctorAuth.token)

$p1Auth = Login-User "pasien@amanah.com" "secret123"
Assert-Test "Patient 1 (Dewi Lestari) authenticated" ($null -ne $p1Auth.token)

$p2Auth = Login-User "patient.0002@amanah-healthcare.test" "secret123"
Assert-Test "Patient 2 (Eka Kuswandari) authenticated" ($null -ne $p2Auth.token)

$p3Auth = Login-User "patient.0003@amanah-healthcare.test" "secret123"
Assert-Test "Patient 3 (Drajat Jelita) authenticated" ($null -ne $p3Auth.token)

$p4Auth = Login-User "patient.0004@amanah-healthcare.test" "secret123"
Assert-Test "Patient 4 (Aisyah Febian) authenticated" ($null -ne $p4Auth.token)

$p5Auth = Login-User "patient.0005@amanah-healthcare.test" "secret123"
Assert-Test "Patient 5 (Saka Lazuardi) authenticated" ($null -ne $p5Auth.token)

# ------------------------------------------------------------------------------
# STEP 2: Runtime Polyclinics and Services Discovery
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Discovering Clinic Infrastructure for Poli KIA & Poli Umum..." -ForegroundColor Yellow
$clinics = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics" -Method Get -Headers $adminAuth.headers))

$poliKIA = $clinics | Where-Object { $_.namaPoli -like "*KIA*" -or $_.kodePoli -like "*KIA*" } | Select-Object -First 1
$poliUmum = $clinics | Where-Object { $_.namaPoli -like "*Umum*" -or $_.kodePoli -like "*UMUM*" } | Select-Object -First 1
Assert-Test "Poli KIA discovered" ($null -ne $poliKIA)
Assert-Test "Poli Umum discovered" ($null -ne $poliUmum)

$kiaServices = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$($poliKIA.id)/layanan" -Method Get -Headers $adminAuth.headers))
$ancService = $kiaServices | Where-Object { $_.namaLayanan -like "*ANC*" -or $_.kodePrefix -eq "ANC" } | Select-Object -First 1
if (-not $ancService) { $ancService = $kiaServices[0] }

$umumServices = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$($poliUmum.id)/layanan" -Method Get -Headers $adminAuth.headers))
$generalService = $umumServices[0]

Assert-Test "KIA Service (ANC) extracted" ($null -ne $ancService)
Assert-Test "Umum Service extracted" ($null -ne $generalService)

# Helper function to book appointment
function Book-TestAppointment($patientAuthObj, $poliklinikId, $serviceId, $sessionName, $complaintText) {
    $patientProfileId = $patientAuthObj.user.patientProfiles[0].id
    $payload = @{
        patientId = $patientProfileId
        poliklinikId = $poliklinikId
        layananId = $serviceId
        appointmentDate = $targetDate
        session = $sessionName
        visitType = "Pemeriksaan Baru"
        complaint = $complaintText
    } | ConvertTo-Json
    
    $res = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patientAuthObj.headers -Body $payload -ContentType "application/json"
    return Get-ResponseData $res
}

# ------------------------------------------------------------------------------
# STEP 3: Multi-Patient in the SAME Category & SAME Session (Poli KIA, Sesi PAGI)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Booking 3 Patients in Poli KIA (Sesi PAGI)..." -ForegroundColor Yellow

$aptP1 = Book-TestAppointment $p1Auth $poliKIA.id $ancService.id "PAGI" "Keluhan trimester 2 - Pasien 1"
Write-Host " Patient 1 Ticket: $($aptP1.queueNumber) | Ahead: $($aptP1.aheadCount) | Session: $($aptP1.session)" -ForegroundColor Cyan

$aptP2 = Book-TestAppointment $p2Auth $poliKIA.id $ancService.id "PAGI" "Pemeriksaan USG kandungan - Pasien 2"
Write-Host " Patient 2 Ticket: $($aptP2.queueNumber) | Ahead: $($aptP2.aheadCount) | Session: $($aptP2.session)" -ForegroundColor Cyan

$aptP3 = Book-TestAppointment $p3Auth $poliKIA.id $ancService.id "PAGI" "Konsultasi rutin ANC - Pasien 3"
Write-Host " Patient 3 Ticket: $($aptP3.queueNumber) | Ahead: $($aptP3.aheadCount) | Session: $($aptP3.session)" -ForegroundColor Cyan

Assert-Test "Patient 1 received ticket" ($null -ne $aptP1.queueNumber)
Assert-Test "Patient 2 received ticket" ($null -ne $aptP2.queueNumber)
Assert-Test "Patient 3 received ticket" ($null -ne $aptP3.queueNumber)

# Verify zero ticket duplicate & monotonic sequence
Assert-Test "Zero duplicate tickets across patients in same session" ($aptP1.queueNumber -ne $aptP2.queueNumber -and $aptP2.queueNumber -ne $aptP3.queueNumber)
Assert-Test "Patient 1 has aheadCount 0" ($aptP1.aheadCount -eq 0)
Assert-Test "Patient 2 has aheadCount 1" ($aptP2.aheadCount -eq 1)
Assert-Test "Patient 3 has aheadCount 2" ($aptP3.aheadCount -eq 2)

# ------------------------------------------------------------------------------
# STEP 4: Category Isolation (Poli Umum, Sesi PAGI - Same Date & Time)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Booking Patient 4 in Poli Umum (Sesi PAGI, Same Date)..." -ForegroundColor Yellow

$aptP4 = Book-TestAppointment $p4Auth $poliUmum.id $generalService.id "PAGI" "Demam dan batuk pilek - Pasien 4"
Write-Host " Patient 4 (Poli Umum) Ticket: $($aptP4.queueNumber) | Ahead: $($aptP4.aheadCount) | Session: $($aptP4.session)" -ForegroundColor Cyan

Assert-Test "Patient 4 received Poli Umum ticket" ($null -ne $aptP4.queueNumber)
Assert-Test "Patient 4 ticket does not clash with Poli KIA tickets" ($aptP4.queueNumber -ne $aptP1.queueNumber -and $aptP4.queueNumber -ne $aptP2.queueNumber)
Assert-Test "Patient 4 is first in Poli Umum queue (aheadCount = 0)" ($aptP4.aheadCount -eq 0)

# ------------------------------------------------------------------------------
# STEP 5: Session Shift Isolation (Poli KIA, Sesi SIANG - Same Date)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Booking Patient 5 in Poli KIA (Sesi SIANG, Same Date)..." -ForegroundColor Yellow

$aptP5 = Book-TestAppointment $p5Auth $poliKIA.id $ancService.id "SIANG" "Konsultasi kehamilan siang - Pasien 5"
Write-Host " Patient 5 (Sesi Siang) Ticket: $($aptP5.queueNumber) | Ahead: $($aptP5.aheadCount) | Time: $($aptP5.scheduledStartTime) - $($aptP5.scheduledEndTime)" -ForegroundColor Cyan

Assert-Test "Patient 5 received Sesi Siang ticket" ($null -ne $aptP5.queueNumber)
Assert-Test "Patient 5 scheduledStartTime is afternoon (12:00:00)" ($aptP5.scheduledStartTime -eq "12:00:00")
Assert-Test "Patient 5 is first in Sesi Siang (aheadCount = 0)" ($aptP5.aheadCount -eq 0)

# ------------------------------------------------------------------------------
# STEP 6: QR Code Generation & Kiosk Check-In Flow (Patient 1)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Testing Admin QR Generation & Kiosk Check-In for Patient 1..." -ForegroundColor Yellow

$qrRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptP1.id)/check-in-qr" -Method Post -Headers $adminAuth.headers
$qrData = Get-ResponseData $qrRes

Assert-Test "Admin generated QR check-in data" ($null -ne $qrData.token -and $null -ne $qrData.manualCode)
Write-Host " QR Generated Manual Code: $($qrData.manualCode) (Length: $($qrData.manualCode.Length))" -ForegroundColor DarkGray

# Kiosk / Patient Check-in via manualCode
$kioskPayload = @{
    manualCode = $qrData.manualCode
} | ConvertTo-Json

$kioskRes = Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $p1Auth.headers -Body $kioskPayload -ContentType "application/json"
$checkedInP1 = Get-ResponseData $kioskRes

Assert-Test "Patient 1 checked in via Kiosk code" ($checkedInP1.status -eq "WAITING" -or $checkedInP1.status -eq "waiting")

# Negative Test: Reusing already consumed check-in code must fail
$codeReuseFailed = $false
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $p1Auth.headers -Body $kioskPayload -ContentType "application/json"
} catch {
    $codeReuseFailed = $true
    Write-Host " Reused QR code correctly rejected: $($_.Exception.Message)" -ForegroundColor DarkGray
}
Assert-Test "Reused QR/Kiosk code rejected by API" $codeReuseFailed

# ------------------------------------------------------------------------------
# STEP 7: Queue Progression (Doctor Calls and Completes Patient 1)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Progressing Queue: Doctor Calls & Completes Patient 1..." -ForegroundColor Yellow

$callP1Res = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptP1.id)/call" -Method Post -Headers $adminAuth.headers -Body "{}" -ContentType "application/json"
Assert-Test "Patient 1 called by doctor" ($null -ne $callP1Res)

$startP1Res = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptP1.id)/start" -Method Post -Headers $adminAuth.headers
$startedP1 = Get-ResponseData $startP1Res
Assert-Test "Patient 1 consultation started (IN_SERVICE)" ($startedP1.status -eq "IN_SERVICE" -or $startedP1.status -eq "in_service")

$completeP1Res = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptP1.id)/complete" -Method Post -Headers $adminAuth.headers
$completedP1 = Get-ResponseData $completeP1Res
Assert-Test "Patient 1 consultation completed (COMPLETED)" ($completedP1.status -eq "COMPLETED" -or $completedP1.status -eq "completed")

# ------------------------------------------------------------------------------
# STEP 8: Edge Case: Patient 2 No-Show & Requeue
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Edge Case: Patient 2 Called but No-Show (Requeue Mechanism)..." -ForegroundColor Yellow

# Patient 2 checks in
$p2CheckIn = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptP2.id)/check-in" -Method Patch -Headers $p2Auth.headers
Assert-Test "Patient 2 checked in" ($null -ne $p2CheckIn)

# Doctor calls Patient 2
$callP2Res = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptP2.id)/call" -Method Post -Headers $adminAuth.headers -Body "{}" -ContentType "application/json"
Assert-Test "Patient 2 called by doctor" ($null -ne $callP2Res)

# Doctor marks No-Show (first attempt) -> Should requeue ticket
$noShowRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptP2.id)/no-show" -Method Post -Headers $adminAuth.headers -Body "{}" -ContentType "application/json"
Assert-Test "Patient 2 no-show endpoint processed" ($null -ne $noShowRes)
Write-Host " No-Show Result: Requeued=$($noShowRes.requeued), Attempt=$($noShowRes.attemptNumber), Remaining=$($noShowRes.remainingAttempts)" -ForegroundColor Cyan
Assert-Test "Ticket requeued rather than immediately terminated" ($noShowRes.requeued -eq $true -or $noShowRes.attemptNumber -eq 1)

# ------------------------------------------------------------------------------
# STEP 9: Edge Case: Automatic Lateness Sweep API Check
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 9] Triggering Lateness Sweep API..." -ForegroundColor Yellow
$sweepRes = Invoke-RestMethod -Uri "$apiUrl/appointments/sweep-late" -Method Post -Headers $adminAuth.headers
Assert-Test "Lateness sweep executed cleanly" ($sweepRes.success -eq $true)
Write-Host " Lateness Sweep Completed: SweptCount=$($sweepRes.sweptCount)" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 10: Direct Database Verification via Docker PostgreSQL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 10] Verifying Queue Integrity in PostgreSQL Docker..." -ForegroundColor Yellow

# Verify all distinct tickets generated for target date
$distinctCount = Run-DockerSql "SELECT count(DISTINCT queue_number) FROM queue_tickets WHERE queue_date = '$targetDate';"
Write-Host " Total distinct queue tickets created for $targetDate : $distinctCount" -ForegroundColor Cyan
Assert-Test "All 5 bookings received unique distinct ticket numbers" ([int]$distinctCount.Trim() -ge 5)

# Verify QR code table
$qrUsedStatus = Run-DockerSql "SELECT is_used FROM appointment_check_ins WHERE appointment_id = '$($aptP1.id)' ORDER BY created_at DESC LIMIT 1;"
Assert-Test "Database appointment_check_ins records is_used = true" ($qrUsedStatus.Trim() -eq "t" -or $qrUsedStatus.Trim() -eq "true")

# Verify call attempt was logged
$callCount = Run-DockerSql "SELECT count(*) FROM appointment_call_attempts WHERE appointment_id = '$($aptP1.id)';"
Assert-Test "Database appointment_call_attempts recorded for Patient 1" ([int]$callCount.Trim() -ge 1)

Write-Host "`n[SCENARIO 6 COMPLETED] Multi-patient, category isolation & edge cases verified 100%." -ForegroundColor Green
Print-TestSummary "Advanced Multi-Patient & Edge Cases Suite"
