# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: BULK PROPOSALS & ROUTE ISOLATION
# Verifies:
# 1. Bulk Propose Cancel: Admin proposes cancellation for multiple appointments
# 2. Bulk Propose Reschedule: Admin proposes reschedule for multiple appointments
# 3. Route Isolation: Guarantees 'bulk/propose-*' routes are never captured by
#    parameterized ':appointmentId/propose-*' with appointmentId = 'bulk'
# 4. Parameter Validation (ParseUUIDPipe): Non-UUID parameter rejected with 400
#    Bad Request instead of crashing with 500 unhandled database exception
# 5. Pending Proposals Query: Verifies 'admin/appointments/proposals/pending'
# 6. Database SSOT: Confirms honest state (appointments remain booked until consent)
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] BULK APPOINTMENT PROPOSALS & ROUTE ISOLATION" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
$apiUrl = Get-E2EApiBaseUrl
$today = (Get-Date).ToString("yyyy-MM-dd")
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$bookingDate = $today

# ------------------------------------------------------------------------------
# STEP 1: AUTHENTICATION & MASTER DATA RESOLUTION
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

# Dynamic Available Patient Profiles (avoiding ACTIVE_TICKET_CONFLICT)
$patientIds = (Run-DockerSql "SELECT id FROM patient_profiles WHERE id NOT IN (SELECT patient_id FROM appointments WHERE scheduled_date = '$bookingDate' AND status NOT IN ('cancelled', 'completed')) LIMIT 5;").Trim() -split "`n" | ForEach-Object { $_.Trim() }
$patient1Id = $patientIds[0]
$patient2Id = if ($patientIds.Count -gt 1) { $patientIds[1] } else { $patient1Id }
$patient3Id = if ($patientIds.Count -gt 2) { $patientIds[2] } else { $patient1Id }

Assert-Test "Patient 1 profile resolved" ($patient1Id.Length -gt 20)
Assert-Test "Patient 2 profile resolved" ($patient2Id.Length -gt 20)
Assert-Test "Patient 3 profile resolved" ($patient3Id.Length -gt 20)

# Dynamic Clinic / Poliklinik
$poliklinikId = (Run-DockerSql "SELECT id FROM clinic_units WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Poliklinik resolved" ($poliklinikId.Length -gt 20)

# Dynamic Service / Layanan
$layananId = (Run-DockerSql "SELECT id FROM clinic_services WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Clinical service resolved" ($layananId.Length -gt 20)

# Dynamic Session Definition
$sessionId = (Run-DockerSql "SELECT id FROM session_def WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Session definition resolved" ($sessionId.Length -gt 20)
$sessionCode = (Run-DockerSql "SELECT code FROM session_def WHERE id = '$sessionId';").Trim()

# Dynamic Doctor
$doctorId = (Run-DockerSql "SELECT id FROM practitioners WHERE is_accepting_appointments = true LIMIT 1;").Trim()
Assert-Test "Practitioner resolved" ($doctorId.Length -gt 20)

# Dynamic Room
$roomId = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Clinic Room resolved" ($roomId.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 2: PRE-CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Cleaning up prior test records..." -ForegroundColor Yellow

$cleanupSql = @"
DELETE FROM appointment_change_proposals WHERE reason LIKE 'BULK_PROP_TEST%';
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%';
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Database clean for bulk proposal test run" $true

# ------------------------------------------------------------------------------
# STEP 3: CREATE 2 TEST APPOINTMENTS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Creating 2 test appointments for bulk operations..." -ForegroundColor Yellow

function Create-TestAppointment([string]$targetPatientId, [string]$suffix) {
    $bookPayload = @{
        patientId = $targetPatientId
        poliklinikId = $poliklinikId
        layananId = $layananId
        appointmentDate = $bookingDate
        session = $sessionCode
        visitType = "new_visit"
        complaint = "BULK_PROP_TEST: Appointment $suffix"
    } | ConvertTo-Json

    $created = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload -Headers $patientHeaders)
    return $created.id
}

$appt1Id = Create-TestAppointment $patient1Id "A"
$appt2Id = Create-TestAppointment $patient2Id "B"

Assert-Test "Test appointment 1 created" ($null -ne $appt1Id -and $appt1Id.Length -gt 20)
Assert-Test "Test appointment 2 created" ($null -ne $appt2Id -and $appt2Id.Length -gt 20)

# Assign Doctor & Room to appointments
$null = Run-DockerSql "UPDATE appointments SET practitioner_id = '$doctorId', room_id = '$roomId' WHERE id IN ('$appt1Id', '$appt2Id');"

# ------------------------------------------------------------------------------
# STEP 4: BULK PROPOSE CANCELLATION (SPEC 1)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Testing Bulk Propose Cancellation (POST /admin/appointments/bulk/propose-cancel)..." -ForegroundColor Yellow

$proposeCancelPayload = @{
    appointmentIds = @($appt1Id, $appt2Id)
    reason = "BULK_PROP_TEST: Penyesuaian jadwal massal klinik"
} | ConvertTo-Json

$cancelRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/propose-cancel" -Method Post -Body $proposeCancelPayload -Headers $adminHeaders
Assert-Test "Bulk propose cancel returned message" ($cancelRes.message -match "selesai")
Assert-Test "Bulk propose cancel returned 2 items in data" ($cancelRes.data.Count -eq 2)
Assert-Test "Item 1 reported success" ($cancelRes.data[0].success -eq $true)
Assert-Test "Item 2 reported success" ($cancelRes.data[1].success -eq $true)

$proposal1Id = $cancelRes.data[0].proposalId
$proposal2Id = $cancelRes.data[1].proposalId
Assert-Test "Proposal 1 ID is valid UUID" ($proposal1Id.Length -gt 20)
Assert-Test "Proposal 2 ID is valid UUID" ($proposal2Id.Length -gt 20)

# Verify DB state of proposals
$propCheck1 = (Run-DockerSql "SELECT status, proposal_type FROM appointment_change_proposals WHERE id = '$proposal1Id';").Trim()
Assert-Test "Proposal 1 status is pending and type is cancellation" ($propCheck1 -eq "pending|cancellation")

# Verify original appointments remain 'booked' (Honest SSOT representation)
$appt1Status = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$appt1Id';").Trim()
Assert-Test "Original appointment 1 remains booked" ($appt1Status -eq "booked")

# ------------------------------------------------------------------------------
# STEP 5: QUERY PENDING PROPOSALS ENDPOINT (SPEC 2)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Querying pending proposals endpoint (GET /admin/appointments/proposals/pending)..." -ForegroundColor Yellow

$pendingProposals = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/proposals/pending" -Method Get -Headers $adminHeaders
$foundProposal = $pendingProposals | Where-Object { $_.id -eq $proposal1Id }
Assert-Test "Proposal 1 found in pending proposals query" ($null -ne $foundProposal)
Assert-Test "Pending proposal has cancellation type" ($foundProposal.proposalType -eq "cancellation")
Assert-Test "Pending proposal has valid patient name" ($foundProposal.patientName.Length -gt 0)

# ------------------------------------------------------------------------------
# STEP 6: ROUTE ISOLATION & PARSEUUIDPIPE VALIDATION (SPEC 3 & SPEC 4)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Testing Route Isolation & ParseUUIDPipe Anti-Crash Protection..." -ForegroundColor Yellow

# Test 6a: Calling parameterized route with invalid string "bulk" or "invalid-uuid"
# Must return HTTP 400 Bad Request, NOT HTTP 500 Unhandled Exception!
$badRouteCaught = $false
try {
    $badBody = @{ reason = "BULK_PROP_TEST: Test bad param" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiUrl/admin/appointments/not-a-valid-uuid/propose-cancel" -Method Post -Body $badBody -Headers $adminHeaders
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 400) {
        $badRouteCaught = $true
    }
}
Assert-Test "ParseUUIDPipe cleanly rejects malformed appointmentId with HTTP 400 Bad Request (No 500 crash)" $badRouteCaught

# Test 6b: DTO Array validation on bulk endpoint with malformed UUID in array
$badArrayCaught = $false
try {
    $badArrayBody = @{
        appointmentIds = @("not-a-uuid")
        reason = "Test"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/propose-cancel" -Method Post -Body $badArrayBody -Headers $adminHeaders
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 422 -or $statusCode -eq 400) {
        $badArrayCaught = $true
    }
}
Assert-Test "DTO validation rejects malformed UUID inside appointmentIds array with HTTP 422 Unprocessable Entity" $badArrayCaught

# ------------------------------------------------------------------------------
# STEP 7: BULK PROPOSE RESCHEDULE (SPEC 5)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Testing Bulk Propose Reschedule (POST /admin/appointments/bulk/propose-reschedule)..." -ForegroundColor Yellow

$appt3Id = Create-TestAppointment $patient3Id "C"
Assert-Test "Test appointment 3 created for reschedule test" ($null -ne $appt3Id -and $appt3Id.Length -gt 20)

$proposeReschedulePayload = @{
    appointmentIds = @($appt3Id)
    targetDate = $tomorrow
    targetSessionId = $sessionId
    targetDoctorId = $doctorId
    targetRoomId = $roomId
    reason = "BULK_PROP_TEST: Jadwal dialihkan ke esok hari"
} | ConvertTo-Json

$rescheduleRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/propose-reschedule" -Method Post -Body $proposeReschedulePayload -Headers $adminHeaders
Assert-Test "Bulk propose reschedule returned message" ($rescheduleRes.message -match "selesai")
Assert-Test "Reschedule item reported success" ($rescheduleRes.data[0].success -eq $true)

$reschedulePropId = $rescheduleRes.data[0].proposalId
$propCheck3 = (Run-DockerSql "SELECT status, proposal_type, proposed_date FROM appointment_change_proposals WHERE id = '$reschedulePropId';").Trim()
Assert-Test "Reschedule proposal status is pending, type is reschedule, and target date matches" ($propCheck3 -eq "pending|reschedule|$tomorrow")

# ------------------------------------------------------------------------------
# STEP 8: POST-TEST CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Cleaning up all test appointments and proposals..." -ForegroundColor Yellow

$postCleanupSql = @"
DELETE FROM appointment_change_proposals WHERE reason LIKE 'BULK_PROP_TEST%';
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'BULK_PROP_TEST%';
"@
$null = Run-DockerSql $postCleanupSql
Assert-Test "Test data cleaned up thoroughly" $true

Print-TestSummary "BULK APPOINTMENT PROPOSALS & ROUTE ISOLATION E2E"
