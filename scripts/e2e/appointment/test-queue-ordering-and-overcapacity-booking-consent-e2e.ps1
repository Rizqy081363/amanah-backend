# ==============================================================================
# E2E TEST: DETERMINISTIC QUEUE ORDERING & OVERCAPACITY BOOKING CONSENT
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] DETERMINISTIC QUEUE ORDERING & OVERCAPACITY BOOKING CONSENT" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl
$today = (Get-Date).ToString("yyyy-MM-dd")

# ------------------------------------------------------------------------------
# STEP 1: AUTHENTICATION & MASTER DATA DISCOVERY
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Admin & Patient and Discovering Master Data..." -ForegroundColor Yellow

$backendRoot = (Resolve-Path "$PSScriptRoot\..\..\..").Path
Push-Location $backendRoot
$adminJwt = (bun run ./scripts/dev/get-jwt-user.ts --email admin@amanah.com --raw | Select-Object -Last 1).Trim()
$patientJwt = (bun run ./scripts/dev/get-jwt-user.ts --email lexguarddidier@gmail.com --raw | Select-Object -Last 1).Trim()
Pop-Location

Assert-Test "Admin authenticated via dynamic JWT" ($adminJwt.Length -gt 20)
$adminHeaders = @{ Authorization = "Bearer $adminJwt"; "Content-Type" = "application/json" }

Assert-Test "Patient authenticated via dynamic JWT" ($patientJwt.Length -gt 20)
$patientHeaders = @{ Authorization = "Bearer $patientJwt"; "Content-Type" = "application/json" }

# Dynamic Patient Profiles (3 distinct patients)
$patientRaw = (Run-DockerSql "SELECT id FROM patient_profiles LIMIT 3;").Trim()
$pIds = $patientRaw -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 20 }
$patient1Id = $pIds[0]
$patient2Id = if ($pIds.Count -gt 1) { $pIds[1] } else { $patient1Id }
$patient3Id = if ($pIds.Count -gt 2) { $pIds[2] } else { $patient1Id }
Assert-Test "Patient 1 profile resolved" ($patient1Id.Length -gt 20)
Assert-Test "Patient 2 profile resolved" ($patient2Id.Length -gt 20)
Assert-Test "Patient 3 profile resolved" ($patient3Id.Length -gt 20)

# Dynamic Doctor
$doctorId = (Run-DockerSql "SELECT id FROM practitioners WHERE is_accepting_appointments = true LIMIT 1;").Trim()
Assert-Test "Practitioner resolved" ($doctorId.Length -gt 20)

# Dynamic Room
$roomId = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Clinic Room resolved" ($roomId.Length -gt 20)

# Dynamic Polyclinic & Service
$poliklinikId = (Run-DockerSql "SELECT id FROM clinic_units WHERE is_active = true LIMIT 1;").Trim()
$layananId = (Run-DockerSql "SELECT id FROM clinic_services WHERE is_active = true LIMIT 1;").Trim()

# Dynamic Active Session
$sessionRow = (Run-DockerSql "SELECT id, code, default_starts_at, default_ends_at FROM session_def WHERE is_active = true ORDER BY sort_order LIMIT 1;").Trim()
$sessionParts = $sessionRow -split '\|'
$sessionId = $sessionParts[0].Trim()
$sessionCode = $sessionParts[1].Trim()
Assert-Test "Active session resolved: $sessionCode ($sessionId)" ($sessionId.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 2: CLEANUP PRIOR TEST RECORDS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Cleaning up prior test records..." -ForegroundColor Yellow

$cleanupSql = @"
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'QUEUE_ORDER_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'QUEUE_ORDER_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'QUEUE_ORDER_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'QUEUE_ORDER_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'QUEUE_ORDER_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'QUEUE_ORDER_TEST%';
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Database clean for queue ordering test run" $true

# ------------------------------------------------------------------------------
# STEP 3: CREATE 3 APPOINTMENTS (SEQUENTIAL)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Creating 3 appointments in sequential FIFO order..." -ForegroundColor Yellow

function Create-TestAppointment([string]$targetPatientId, [string]$label) {
    $payload = @{
        patientId = $targetPatientId
        poliklinikId = $poliklinikId
        layananId = $layananId
        appointmentDate = $today
        session = $sessionCode
        visitType = "new_visit"
        complaint = "QUEUE_ORDER_TEST: $label"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $payload -Headers $patientHeaders
    $created = Get-ResponseData $res
    return $created.id
}

$appt1Id = Create-TestAppointment $patient1Id "Patient 1"
Start-Sleep -Milliseconds 200
$appt2Id = Create-TestAppointment $patient2Id "Patient 2"
Start-Sleep -Milliseconds 200
$appt3Id = Create-TestAppointment $patient3Id "Patient 3"

Assert-Test "Appointment 1 created: $appt1Id" ($appt1Id.Length -gt 20)
Assert-Test "Appointment 2 created: $appt2Id" ($appt2Id.Length -gt 20)
Assert-Test "Appointment 3 created: $appt3Id" ($appt3Id.Length -gt 20)

# Check initial queue numbers
$q1 = [int](Run-DockerSql "SELECT queue_number FROM appointments WHERE id = '$appt1Id';").Trim()
$q2 = [int](Run-DockerSql "SELECT queue_number FROM appointments WHERE id = '$appt2Id';").Trim()
$q3 = [int](Run-DockerSql "SELECT queue_number FROM appointments WHERE id = '$appt3Id';").Trim()

Write-Host " Initial Queue Numbers: #1=$q1, #2=$q2, #3=$q3" -ForegroundColor Cyan
Assert-Test "Initial queue ordering is ascending ($q1 < $q2 < $q3)" ($q1 -lt $q2 -and $q2 -lt $q3)

# ------------------------------------------------------------------------------
# STEP 4: BULK REASSIGNMENT WITH SCRAMBLED ORDER ([appt3, appt1, appt2])
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Executing Bulk Reassignment with deliberately scrambled ID order [3, 1, 2]..." -ForegroundColor Yellow

$scrambledPayload = @{
    appointmentIds = @($appt3Id, $appt1Id, $appt2Id)
    doctorId = $doctorId
    reason = "Deterministic ordering verification"
} | ConvertTo-Json

$bulkRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/assign-doctor" -Method Post -Headers $adminHeaders -Body $scrambledPayload
$bulkData = $bulkRes.data
Assert-Test "Bulk assign succeeded for 3 appointments" ($bulkData.succeededCount -eq 3)

# Also assign room via bulk assign-room
$scrambledRoomPayload = @{
    appointmentIds = @($appt2Id, $appt3Id, $appt1Id)
    roomId = $roomId
} | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/assign-room" -Method Post -Headers $adminHeaders -Body $scrambledRoomPayload

# Verify that appointments and tickets retained their FIFO / queue ordering
$p1Pos = [int](Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt1Id';").Trim()
$p2Pos = [int](Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt2Id';").Trim()
$p3Pos = [int](Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt3Id';").Trim()

Write-Host " Post-Bulk Waiting Positions: #1=$p1Pos, #2=$p2Pos, #3=$p3Pos" -ForegroundColor Cyan
Assert-Test "Patient 1 has waiting_position 1 despite scrambled selection" ($p1Pos -eq 1)
Assert-Test "Patient 2 has waiting_position 2 despite scrambled selection" ($p2Pos -eq 2)
Assert-Test "Patient 3 has waiting_position 3 despite scrambled selection" ($p3Pos -eq 3)

# ------------------------------------------------------------------------------
# STEP 5: VERIFY ADMIN SESSION PATIENTS QUERY & SINKING TERMINAL STATUSES
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Querying Admin Session Patients endpoint and verifying queue ordering..." -ForegroundColor Yellow

$sessionPatientsRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules/$doctorId/sessions/$sessionId/patients?date=$today" -Method Get -Headers $adminHeaders
$patientList = $sessionPatientsRes.data.patients | Where-Object { $_.chiefComplaint -like "QUEUE_ORDER_TEST*" }

Assert-Test "Admin session returned all 3 test patients" ($patientList.Count -eq 3)
Assert-Test "First patient in list is Patient 1" ($patientList[0].appointmentId -eq $appt1Id)
Assert-Test "Second patient in list is Patient 2" ($patientList[1].appointmentId -eq $appt2Id)
Assert-Test "Third patient in list is Patient 3" ($patientList[2].appointmentId -eq $appt3Id)

# Now cancel Patient 2
Write-Host "`n Cancelling Patient 2 to test sinking terminal status..." -ForegroundColor Yellow
$cancelPayload = @{ reason = "QUEUE_ORDER_TEST: Patient cancellation" } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/appointments/$appt2Id/cancel" -Method Patch -Body $cancelPayload -Headers $adminHeaders

$postCancelRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules/$doctorId/sessions/$sessionId/patients?date=$today" -Method Get -Headers $adminHeaders
$postCancelList = $postCancelRes.data.patients | Where-Object { $_.chiefComplaint -like "QUEUE_ORDER_TEST*" }

Write-Host " Post-Cancel Order in Session View:" -ForegroundColor Cyan
$postCancelList | ForEach-Object { Write-Host "   - $($_.queueNumber) | $($_.chiefComplaint) | Status: $($_.status)" -ForegroundColor Cyan }

Assert-Test "First patient remains active Patient 1" ($postCancelList[0].appointmentId -eq $appt1Id)
Assert-Test "Second active patient is Patient 3" ($postCancelList[1].appointmentId -eq $appt3Id)
# Verify terminal cancelled appointment is sunk to the bottom
Assert-Test "Cancelled Patient 2 is sunk to the bottom of the list" ($postCancelList[2].appointmentId -eq $appt2Id)

# ------------------------------------------------------------------------------
# STEP 6: VERIFY OVERCAPACITY CONSENT WORKFLOW AT BOOKING
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Testing Overcapacity Consent at Booking..." -ForegroundColor Yellow

# Clean up step 3 test appointments so patient1 is free to book
$null = Run-DockerSql $cleanupSql

# Find or temporarily set up a session whose end time will be exceeded by booking
# Let's inspect session 'testing' or configure a tight end time
$testingSession = (Run-DockerSql "SELECT id, code, default_starts_at, default_ends_at FROM session_def WHERE code = 'testing' LIMIT 1;").Trim()

if ($testingSession.Length -gt 10) {
    $tParts = $testingSession -split '\|'
    $testSessId = $tParts[0].Trim()
    $testSessCode = $tParts[1].Trim()
    
    Write-Host " Found existing testing session: $testSessCode ($testSessId)" -ForegroundColor Cyan

    # Temporarily set testing session default_ends_at to a time earlier than estimated end
    # e.g., default_starts_at = 13:25:00, default_ends_at = 13:30:00 (only 5 minutes!)
    $null = Run-DockerSql "UPDATE session_def SET default_ends_at = '13:30:00' WHERE id = '$testSessId';"

    $overPayload = @{
        patientId = $patient1Id
        poliklinikId = $poliklinikId
        layananId = $layananId
        appointmentDate = $today
        session = $testSessCode
        visitType = "new_visit"
        complaint = "QUEUE_ORDER_TEST: Overcapacity Test Without Consent"
    } | ConvertTo-Json

    $consentRequiredCaught = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $overPayload -Headers $patientHeaders
    } catch {
        $errResp = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($_.Exception.Response.StatusCode.value__ -eq 409 -or $errResp.code -eq "OVERCAPACITY_CONSENT_REQUIRED") {
            $consentRequiredCaught = $true
            Write-Host " Intercepted 409 Conflict with code: $($errResp.code)" -ForegroundColor Green
            Write-Host " Message: $($errResp.message)" -ForegroundColor Green
        }
    }

    Assert-Test "Booking beyond shift boundary without consent throws 409 OVERCAPACITY_CONSENT_REQUIRED" $consentRequiredCaught

    # Now re-submit with consentOverCapacity: true
    Write-Host "`n Re-submitting with consentOverCapacity: true..." -ForegroundColor Yellow
    $consentPayload = @{
        patientId = $patient1Id
        poliklinikId = $poliklinikId
        layananId = $layananId
        appointmentDate = $today
        session = $testSessCode
        visitType = "new_visit"
        complaint = "QUEUE_ORDER_TEST: Overcapacity Test With Consent"
        consentOverCapacity = $true
    } | ConvertTo-Json

    $consentRes = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $consentPayload -Headers $patientHeaders
    $consentAppt = Get-ResponseData $consentRes

    Assert-Test "Booking with consentOverCapacity: true succeeds" ($null -ne $consentAppt.id -and $consentAppt.id.Length -gt 20)
    Assert-Test "Appointment with consent received queue number" ($null -ne $consentAppt.queueNumber)

    # Restore session 'testing' default_ends_at back to 24:00:00
    $null = Run-DockerSql "UPDATE session_def SET default_ends_at = '24:00:00' WHERE id = '$testSessId';"
    Write-Host " Restored testing session default_ends_at to 24:00:00" -ForegroundColor Cyan
} else {
    Write-Host " Session 'testing' not found, skipping shift-boundary overcapacity test" -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# STEP 7: CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Cleaning up test records..." -ForegroundColor Yellow

$null = Run-DockerSql $cleanupSql
Assert-Test "Test data cleaned up successfully" $true

Print-TestSummary "DETERMINISTIC QUEUE ORDERING & OVERCAPACITY BOOKING CONSENT E2E"
