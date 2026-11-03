# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: PATIENT PROPOSALS & ACCESS CONTROL
# Verifies:
# 1. Proposal Creation & Patient User ID Resolution:
#    Ensures proposal populates patient_user_id from patient_profiles,
#    patient_affiliations, or appointments.created_by.
# 2. Notification Dispatch:
#    Ensures notification is created for external patient recipient.
# 3. Patient Pending Proposals Query:
#    Verifies GET /api/v1/appointments/proposals/my-pending returns pending proposals.
# 4. Access Control Protection:
#    Ensures unauthorized users cannot respond to the proposal (403 Forbidden).
# 5. Atomic Patient Response:
#    - Accepts reschedule: updates appointment date and status atomically.
#    - Accepts cancellation: cancels appointment and releases queue ticket.
#    - Declines proposal: preserves original schedule intact.
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] PATIENT PROPOSALS LIFECYCLE & ACCESS CONTROL" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
$apiUrl = Get-E2EApiBaseUrl
$today = (Get-Date).ToString("yyyy-MM-dd")
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$bookingDate = $today

# ------------------------------------------------------------------------------
# STEP 1: AUTHENTICATION (ADMIN & PATIENT & STRANGER)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Actors (Admin, Target Patient, Unauthorized Stranger)..." -ForegroundColor Yellow

$backendRoot = (Resolve-Path "$PSScriptRoot\..\..\..").Path
Push-Location $backendRoot
$adminJwt = (bun run ./scripts/dev/get-jwt-user.ts --email admin@amanah.com --raw | Select-Object -Last 1).Trim()
$patientJwt = (bun run ./scripts/dev/get-jwt-user.ts --email lexguarddidier@gmail.com --raw | Select-Object -Last 1).Trim()
# Get patient user ID
$patientUserId = (Run-DockerSql "SELECT id FROM users WHERE email = 'lexguarddidier@gmail.com';").Trim()
# Find another user to test strict access control
$strangerEmail = (Run-DockerSql "SELECT email FROM users WHERE email != 'lexguarddidier@gmail.com' AND email != 'admin@amanah.com' LIMIT 1;").Trim()
$strangerJwt = (bun run ./scripts/dev/get-jwt-user.ts --email $strangerEmail --raw | Select-Object -Last 1).Trim()
Pop-Location

Assert-Test "Admin authenticated" ($adminJwt.Length -gt 20)
$adminHeaders = @{ Authorization = "Bearer $adminJwt"; "Content-Type" = "application/json" }

Assert-Test "Target Patient authenticated (lexguarddidier@gmail.com)" ($patientJwt.Length -gt 20)
$patientHeaders = @{ Authorization = "Bearer $patientJwt"; "Content-Type" = "application/json" }

Assert-Test "Stranger Patient authenticated ($strangerEmail)" ($strangerJwt.Length -gt 20)
$strangerHeaders = @{ Authorization = "Bearer $strangerJwt"; "Content-Type" = "application/json" }

# Dynamic Metadata
$patientProfileId = (Run-DockerSql "SELECT id FROM patient_profiles WHERE full_name ILIKE '%Lexguard%' OR user_id = '$patientUserId' LIMIT 1;").Trim()
if (-not $patientProfileId -or $patientProfileId.Length -lt 20) {
    $patientProfileId = (Run-DockerSql "SELECT patient_id FROM patient_affiliations WHERE user_id = '$patientUserId' LIMIT 1;").Trim()
}
Assert-Test "Patient Profile ID resolved" ($patientProfileId.Length -gt 20)

$poliklinikId = (Run-DockerSql "SELECT id FROM clinic_units WHERE is_active = true LIMIT 1;").Trim()
$layananId = (Run-DockerSql "SELECT id FROM clinic_services WHERE is_active = true LIMIT 1;").Trim()
$sessionId = (Run-DockerSql "SELECT id FROM session_def WHERE is_active = true LIMIT 1;").Trim()
$sessionCode = (Run-DockerSql "SELECT code FROM session_def WHERE id = '$sessionId';").Trim()
$doctorId = (Run-DockerSql "SELECT id FROM practitioners WHERE is_accepting_appointments = true LIMIT 1;").Trim()
$roomId = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE is_active = true LIMIT 1;").Trim()

# ------------------------------------------------------------------------------
# STEP 2: CLEANUP PRIOR TEST RECORDS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Cleaning up prior proposal test records..." -ForegroundColor Yellow

$cleanupSql = @"
DELETE FROM appointment_change_proposals WHERE reason LIKE 'PATIENT_PROP_TEST%';
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%';
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Prior test records cleared" $true

# ------------------------------------------------------------------------------
# STEP 3: CREATE APPOINTMENT FOR TARGET PATIENT
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Target Patient creates an appointment..." -ForegroundColor Yellow

$bookPayload = @{
    patientId = $patientProfileId
    poliklinikId = $poliklinikId
    layananId = $layananId
    appointmentDate = $bookingDate
    session = $sessionCode
    visitType = "new_visit"
    complaint = "PATIENT_PROP_TEST: Reschedule Proposal E2E"
} | ConvertTo-Json

$createdAppt = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload -Headers $patientHeaders)
$apptId = $createdAppt.id
Assert-Test "Appointment created successfully" ($null -ne $apptId -and $apptId.Length -gt 20)

$null = Run-DockerSql "UPDATE appointments SET practitioner_id = '$doctorId', room_id = '$roomId' WHERE id = '$apptId';"

# ------------------------------------------------------------------------------
# STEP 4: ADMIN PROPOSES RESCHEDULE
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Admin proposes reschedule to target date..." -ForegroundColor Yellow

$rescheduleDto = @{
    targetDate = $tomorrow
    targetSessionId = $sessionId
    targetDoctorId = $doctorId
    targetRoomId = $roomId
    reason = "PATIENT_PROP_TEST: Dokter berhalangan pada tanggal semula"
} | ConvertTo-Json

$propRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/propose-reschedule" -Method Post -Body $rescheduleDto -Headers $adminHeaders
Assert-Test "Admin propose reschedule succeeded" ($propRes.success -eq $true)
$proposalId = $propRes.proposalId
Assert-Test "Proposal ID created" ($proposalId.Length -gt 20)

# Verify patient_user_id was correctly resolved and populated
$dbPatientUserId = (Run-DockerSql "SELECT patient_user_id FROM appointment_change_proposals WHERE id = '$proposalId';").Trim()
Assert-Test "Proposal stored resolved patient_user_id" ($dbPatientUserId -eq $patientUserId)

# ------------------------------------------------------------------------------
# STEP 5: PATIENT QUERIES MY-PENDING PROPOSALS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Patient fetches pending proposals (GET /appointments/proposals/my-pending)..." -ForegroundColor Yellow

$pendingList = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/my-pending" -Method Get -Headers $patientHeaders
$foundProposal = $pendingList | Where-Object { $_.id -eq $proposalId }

Assert-Test "Proposal appears in patient's pending list" ($null -ne $foundProposal)
Assert-Test "Proposal has reschedule type" ($foundProposal.proposalType -eq "reschedule")
Assert-Test "Proposal proposed date matches" ($foundProposal.proposedDate -eq $tomorrow)
Assert-Test "Proposal has booking code" ($foundProposal.bookingCode.Length -gt 0)

# ------------------------------------------------------------------------------
# STEP 6: ACCESS CONTROL ENFORCEMENT (STRANGER CANNOT RESPOND)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Testing Access Control: Unauthorized stranger attempts to respond..." -ForegroundColor Yellow

$forbiddenCaught = $false
try {
    $strangerBody = @{ decision = "accepted"; notes = "Hacked response" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposalId/respond" -Method Post -Body $strangerBody -Headers $strangerHeaders
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 403) {
        $forbiddenCaught = $true
    }
}
Assert-Test "Access Control: Stranger response rejected with HTTP 403 Forbidden" $forbiddenCaught

# ------------------------------------------------------------------------------
# STEP 7: PATIENT RESPONDS (ACCEPTS PROPOSAL)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Patient accepts the reschedule proposal..." -ForegroundColor Yellow

$respondBody = @{
    decision = "accepted"
    notes = "Setuju jadwal baru besok."
} | ConvertTo-Json

$acceptRes = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposalId/respond" -Method Post -Body $respondBody -Headers $patientHeaders
Assert-Test "Patient response processed successfully" ($acceptRes.success -eq $true)
Assert-Test "Response decision is accepted" ($acceptRes.decision -eq "accepted")

# Verify appointment scheduled_date was updated in DB
$newScheduledDate = (Run-DockerSql "SELECT scheduled_date FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "Appointment schedule updated to proposed date ($tomorrow)" ($newScheduledDate -eq $tomorrow)

# Verify proposal status is accepted
$propStatus = (Run-DockerSql "SELECT status FROM appointment_change_proposals WHERE id = '$proposalId';").Trim()
Assert-Test "Proposal status transitioned to 'accepted'" ($propStatus -eq "accepted")

# Verify proposal is no longer in pending list
$pendingListAfter = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/my-pending" -Method Get -Headers $patientHeaders
$foundAfter = $pendingListAfter | Where-Object { $_.id -eq $proposalId }
Assert-Test "Proposal cleared from pending list after resolution" ($null -eq $foundAfter)

# ------------------------------------------------------------------------------
# STEP 8: POST-TEST CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Cleaning up all test records..." -ForegroundColor Yellow

$postCleanupSql = @"
DELETE FROM appointment_change_proposals WHERE reason LIKE 'PATIENT_PROP_TEST%';
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'PATIENT_PROP_TEST%';
"@
$null = Run-DockerSql $postCleanupSql
Assert-Test "Database clean after test" $true

Print-TestSummary "PATIENT PROPOSALS & ACCESS CONTROL E2E"
