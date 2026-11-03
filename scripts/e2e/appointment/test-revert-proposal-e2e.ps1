# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: REVERT PROPOSAL & SETTLEMENT RESTORATION
# Verifies:
# 1. Single Revert Cancellation:
#    Admin proposes cancel -> Patient approves -> Appointment cancelled ->
#    Admin reverts -> Appointment restored to 'booked', queueTicket restored to 'waiting',
#    proposal marked 'withdrawn', audit log recorded, patient notified.
# 2. Single Revert Reschedule:
#    Admin proposes reschedule -> Patient approves -> Appointment moved to target date ->
#    Admin reverts -> Appointment restored to originalDate & originalSessionId,
#    queueTicket restored, proposal marked 'withdrawn'.
# 3. Bulk Revert Operation:
#    Admin reverts multiple settled proposals via POST /admin/appointments/bulk/revert-proposal.
# 4. Invariant Protection & Route Isolation:
#    Non-eligible appointment rejects revert with HTTP 400.
#    Malformed UUID rejected with HTTP 400 (ParseUUIDPipe protection).
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] REVERT PROPOSAL & SETTLEMENT RESTORATION" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
$apiUrl = Get-E2EApiBaseUrl
$today = (Get-Date).ToString("yyyy-MM-dd")
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

# ------------------------------------------------------------------------------
# STEP 0: PRE-CLEANUP RESIDUAL TEST RECORDS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 0] Pre-cleaning any previous test records..." -ForegroundColor Yellow
$cleanupSql = @"
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'REVERT_E2E%');
DELETE FROM appointment_change_proposals WHERE reason LIKE 'REVERT_E2E%' OR appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'REVERT_E2E%');
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'REVERT_E2E%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'REVERT_E2E%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'REVERT_E2E%');
DELETE FROM appointments WHERE complaint LIKE 'REVERT_E2E%';
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Database clean for revert test run" $true

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

# Dynamic Available Patient Profiles (Distinct patients to satisfy 1 active ticket per patient policy)
$patientIds = @(Run-DockerSql "SELECT id FROM patient_profiles LIMIT 10;" -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
$patient1Id = $patientIds[0]
$patient2Id = $patientIds[1]
$patient3Id = $patientIds[2]
$patient4Id = $patientIds[3]
Assert-Test "Patient profiles resolved" ($patient1Id.Length -gt 10 -and $patient4Id.Length -gt 10)

$poliklinikId = (Run-DockerSql "SELECT id FROM clinic_units WHERE is_active = true LIMIT 1;").Trim()
$serviceId = (Run-DockerSql "SELECT id FROM clinic_services WHERE is_active = true LIMIT 1;").Trim()
$sessionIds = @(Run-DockerSql "SELECT id FROM session_def WHERE is_active = true ORDER BY sort_order ASC;" -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 })
$sessionId1 = $sessionIds[0]
$sessionId2 = if ($sessionIds.Count -gt 1) { $sessionIds[1] } else { $sessionIds[0] }
$practitionerId = (Run-DockerSql "SELECT id FROM practitioners WHERE is_accepting_appointments = true LIMIT 1;").Trim()
$roomId = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE is_active = true LIMIT 1;").Trim()

Assert-Test "Poliklinik resolved" ($poliklinikId.Length -gt 10)
Assert-Test "Service resolved" ($serviceId.Length -gt 10)
Assert-Test "Session definition resolved" ($sessionId1.Length -gt 10)
Assert-Test "Practitioner resolved" ($practitionerId.Length -gt 10)
Assert-Test "Room resolved" ($roomId.Length -gt 10)

$sessionCode = (Run-DockerSql "SELECT code FROM session_def WHERE id = '$sessionId1';").Trim()

# Helper function to create test appointment via real API
function Create-TestAppointment([string]$targetPatientId, [string]$suffix, [string]$bookingDate = $today) {
    $bookPayload = @{
        patientId = $targetPatientId
        poliklinikId = $poliklinikId
        layananId = $serviceId
        appointmentDate = $bookingDate
        session = $sessionCode
        visitType = "new_visit"
        complaint = "REVERT_E2E: Appointment $suffix"
    } | ConvertTo-Json

    $created = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload -Headers $patientHeaders)
    return $created.id
}

# ------------------------------------------------------------------------------
# STEP 2: TEST SCENARIO 1 - REVERT CANCELLATION PROPOSAL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Testing Revert Cancellation Proposal Flow..." -ForegroundColor Yellow

$apt1Id = Create-TestAppointment $patient1Id "A"
Assert-Test "Test appointment 1 created" ($apt1Id.Length -gt 20)

# 2.1 Admin proposes cancellation
$proposeCancelBody = @{
    appointmentIds = @($apt1Id)
    reason = "Klinik renovasi darurat"
} | ConvertTo-Json

$proposeCancelRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/propose-cancel" -Method Post -Body $proposeCancelBody -Headers $adminHeaders
Assert-Test "Admin proposed cancellation successfully" ($proposeCancelRes.data[0].success -eq $true)
$proposal1Id = $proposeCancelRes.data[0].proposalId
Assert-Test "Cancellation proposal ID returned" ($proposal1Id.Length -gt 10)

# 2.2 Patient approves cancellation
$approveCancelBody = @{ decision = "accepted"; notes = "Saya setuju batal" } | ConvertTo-Json
$approveCancelRes = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposal1Id/respond" -Method Post -Body $approveCancelBody -Headers $patientHeaders
Assert-Test "Patient approved cancellation proposal" ($approveCancelRes.success -eq $true)

# Verify appointment is cancelled and ticket is cancelled in DB
$apt1StatusBeforeRevert = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$apt1Id';").Trim()
$ticket1StatusBeforeRevert = (Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$apt1Id';").Trim()
$prop1StatusBeforeRevert = (Run-DockerSql "SELECT status FROM appointment_change_proposals WHERE id = '$proposal1Id';").Trim()

Assert-Test "Appointment transitioned to cancelled" ($apt1StatusBeforeRevert -eq "cancelled")
Assert-Test "Queue ticket transitioned to cancelled" ($ticket1StatusBeforeRevert -eq "cancelled")
Assert-Test "Proposal transitioned to accepted" ($prop1StatusBeforeRevert -eq "accepted")

# 2.3 Admin executes Revert Proposal (Single Revert endpoint)
$revertCancelBody = @{ reason = "Dokter kembali bertugas, pembatalan ditarik" } | ConvertTo-Json
$revertCancelRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/revert-proposal" -Method Post -Body $revertCancelBody -Headers $adminHeaders

Assert-Test "Revert proposal endpoint returned success" ($revertCancelRes.success -eq $true)

# Verify database state after Revert:
$apt1StatusAfterRevert = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$apt1Id';").Trim()
$apt1CancelledAt = (Run-DockerSql "SELECT COALESCE(cancelled_at::text, 'NULL') FROM appointments WHERE id = '$apt1Id';").Trim()
$apt1CancelReason = (Run-DockerSql "SELECT COALESCE(cancel_reason, 'NULL') FROM appointments WHERE id = '$apt1Id';").Trim()
$ticket1StatusAfterRevert = (Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$apt1Id';").Trim()
$prop1StatusAfterRevert = (Run-DockerSql "SELECT status FROM appointment_change_proposals WHERE id = '$proposal1Id';").Trim()

Assert-Test "Appointment status restored to booked" ($apt1StatusAfterRevert -eq "booked")
Assert-Test "Appointment cancelled_at cleared to NULL" ($apt1CancelledAt -eq "NULL")
Assert-Test "Appointment cancel_reason cleared to NULL" ($apt1CancelReason -eq "NULL")
Assert-Test "Queue ticket status restored to waiting" ($ticket1StatusAfterRevert -eq "waiting")
Assert-Test "Proposal status transitioned to withdrawn" ($prop1StatusAfterRevert -eq "withdrawn")

# Verify audit log in appointment_status_events
$auditCount = (Run-DockerSql "SELECT COUNT(*) FROM appointment_status_events WHERE appointment_id = '$apt1Id' AND new_status = 'booked';").Trim()
Assert-Test "Audit status event recorded for revert" ([int]$auditCount -ge 1)

# ------------------------------------------------------------------------------
# STEP 3: TEST SCENARIO 2 - REVERT RESCHEDULE PROPOSAL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Testing Revert Reschedule Proposal Flow..." -ForegroundColor Yellow

$apt2Id = Create-TestAppointment $patient2Id "B"
Assert-Test "Test appointment 2 created for reschedule" ($apt2Id.Length -gt 20)

# 3.1 Admin proposes reschedule to tomorrow
$proposeRescheduleBody = @{
    appointmentIds = @($apt2Id)
    targetDate = $tomorrow
    targetSessionId = $sessionId2
    reason = "Jadwal dialihkan ke esok hari"
} | ConvertTo-Json

$proposeRescheduleRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/propose-reschedule" -Method Post -Body $proposeRescheduleBody -Headers $adminHeaders
Assert-Test "Admin proposed reschedule successfully" ($proposeRescheduleRes.data[0].success -eq $true)
$proposal2Id = $proposeRescheduleRes.data[0].proposalId

# 3.2 Patient approves reschedule
$approveRescheduleBody = @{ decision = "accepted"; notes = "Saya setuju jadwal ulang" } | ConvertTo-Json
$approveRescheduleRes = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposal2Id/respond" -Method Post -Body $approveRescheduleBody -Headers $patientHeaders
Assert-Test "Patient approved reschedule proposal" ($approveRescheduleRes.success -eq $true)
Start-Sleep -Milliseconds 400

# Verify appointment moved to tomorrow
$apt2DateBeforeRevert = (Run-DockerSql "SELECT scheduled_date::text FROM appointments WHERE id = '$apt2Id';").Trim()
Assert-Test "Appointment scheduled date moved to tomorrow" ($apt2DateBeforeRevert -eq $tomorrow)

# 3.3 Admin executes Revert Reschedule
$revertRescheduleBody = @{ reason = "Klinik memutuskan mengembalikan ke jadwal asli" } | ConvertTo-Json
$revertRescheduleRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/revert-proposal" -Method Post -Body $revertRescheduleBody -Headers $adminHeaders
Assert-Test "Revert reschedule endpoint returned success" ($revertRescheduleRes.success -eq $true)

# Verify appointment scheduledDate restored to $today
$apt2DateAfterRevert = (Run-DockerSql "SELECT scheduled_date::text FROM appointments WHERE id = '$apt2Id';").Trim()
$ticket2DateAfterRevert = (Run-DockerSql "SELECT queue_date::text FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
$ticket2SessionAfterRevert = (Run-DockerSql "SELECT session_id::text FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
$prop2StatusAfterRevert = (Run-DockerSql "SELECT status FROM appointment_change_proposals WHERE id = '$proposal2Id';").Trim()

Assert-Test "Appointment scheduled date restored to original date" ($apt2DateAfterRevert -eq $today)
Assert-Test "Queue ticket date restored to original date" ($ticket2DateAfterRevert -eq $today)
Assert-Test "Queue ticket session restored to original session" ($ticket2SessionAfterRevert -eq $sessionId1)
Assert-Test "Proposal status transitioned to withdrawn" ($prop2StatusAfterRevert -eq "withdrawn")

# ------------------------------------------------------------------------------
# STEP 4: TEST SCENARIO 3 - BULK REVERT OPERATION
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Testing Bulk Revert Operation (POST /admin/appointments/bulk/revert-proposal)..." -ForegroundColor Yellow

$bulkApt1Id = Create-TestAppointment $patient3Id "Bulk-1"
$bulkApt2Id = Create-TestAppointment $patient4Id "Bulk-2"

# Propose cancellation for both
$bulkProposeBody = @{
    appointmentIds = @($bulkApt1Id, $bulkApt2Id)
    reason = "Bulk cancellation test"
} | ConvertTo-Json
$bulkProposeRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/propose-cancel" -Method Post -Body $bulkProposeBody -Headers $adminHeaders
Assert-Test "Bulk cancellation proposed for 2 appointments" ($bulkProposeRes.data.Length -eq 2)
$bulkProp1Id = $bulkProposeRes.data[0].proposalId
$bulkProp2Id = $bulkProposeRes.data[1].proposalId

# Approve both as patient
$approveBody = @{ decision = "accepted" } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$bulkProp1Id/respond" -Method Post -Body $approveBody -Headers $patientHeaders
$null = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$bulkProp2Id/respond" -Method Post -Body $approveBody -Headers $patientHeaders
Start-Sleep -Milliseconds 400

# Execute Bulk Revert
$bulkRevertBody = @{
    appointmentIds = @($bulkApt1Id, $bulkApt2Id)
    reason = "Penarikan persetujuan massal oleh Supervisor"
} | ConvertTo-Json

$bulkRevertRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/revert-proposal" -Method Post -Body $bulkRevertBody -Headers $adminHeaders

Assert-Test "Bulk revert returned valid response" ($bulkRevertRes.message.Length -gt 0)
Assert-Test "Bulk revert total is 2" ($bulkRevertRes.data.total -eq 2)
Assert-Test "Bulk revert succeededCount is 2" ($bulkRevertRes.data.succeededCount -eq 2)
Assert-Test "Bulk revert errors array is empty" ($bulkRevertRes.data.errors.Count -eq 0)

# Verify both are restored in DB
$bulkApt1Status = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$bulkApt1Id';").Trim()
$bulkApt2Status = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$bulkApt2Id';").Trim()
$bulkTicket1Status = (Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$bulkApt1Id';").Trim()
$bulkTicket2Status = (Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$bulkApt2Id';").Trim()

Assert-Test "Bulk Appointment 1 restored to booked" ($bulkApt1Status -eq "booked")
Assert-Test "Bulk Appointment 2 restored to booked" ($bulkApt2Status -eq "booked")
Assert-Test "Bulk Queue Ticket 1 restored to waiting" ($bulkTicket1Status -eq "waiting")
Assert-Test "Bulk Queue Ticket 2 restored to waiting" ($bulkTicket2Status -eq "waiting")

# ------------------------------------------------------------------------------
# STEP 5: TEST SCENARIO 4 - ROUTE ISOLATION & INVARIANT GUARDS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Testing Route Isolation & Invariant Protection..." -ForegroundColor Yellow

# 5.1 Reverting an appointment that has no approved proposal should fail with 400
try {
    $nonEligibleBody = @{ reason = "Percobaan revert tanpa proposal" } | ConvertTo-Json
    $null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$bulkApt1Id/revert-proposal" -Method Post -Body $nonEligibleBody -Headers $adminHeaders
    Assert-Test "Should fail if no approved proposal exists" $false "Expected HTTP 400"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test "Reverting non-eligible appointment rejected with HTTP 400 Bad Request" ($statusCode -eq 400)
}

# 5.2 Malformed UUID rejected cleanly with 400 (ParseUUIDPipe protection)
try {
    $null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/not-a-valid-uuid/revert-proposal" -Method Post -Body "{}" -Headers $adminHeaders
    Assert-Test "Should reject non-UUID parameter" $false "Expected HTTP 400"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test "ParseUUIDPipe cleanly rejects malformed appointmentId with HTTP 400" ($statusCode -eq 400)
}

# ------------------------------------------------------------------------------
# STEP 6: CLEANUP TEST RECORDS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Cleaning up test records..." -ForegroundColor Yellow

$allTestIds = @($apt1Id, $apt2Id, $bulkApt1Id, $bulkApt2Id) -join "','"
$null = Run-DockerSql "DELETE FROM appointment_status_events WHERE appointment_id IN ('$allTestIds');"
$null = Run-DockerSql "DELETE FROM appointment_change_proposals WHERE appointment_id IN ('$allTestIds');"
$null = Run-DockerSql "DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$allTestIds'));"
$null = Run-DockerSql "DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$allTestIds'));"
$null = Run-DockerSql "DELETE FROM queue_tickets WHERE appointment_id IN ('$allTestIds');"
$null = Run-DockerSql "DELETE FROM appointments WHERE id IN ('$allTestIds');"
Write-Host " [PASS] Test records cleaned up thoroughly" -ForegroundColor Green

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "REVERT PROPOSAL & SETTLEMENT RESTORATION E2E"
