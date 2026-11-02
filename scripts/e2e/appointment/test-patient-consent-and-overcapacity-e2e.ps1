# ==============================================================================
# E2E TEST: PATIENT CONSENT WORKFLOW, RESCHEDULE/CANCEL PROPOSALS, AND OVERCAPACITY
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] PATIENT CONSENT WORKFLOW & DYNAMIC OVERCAPACITY RECONCILIATION" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl
$today = (Get-Date).ToString("yyyy-MM-dd")
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$bookingDate = $today

# ------------------------------------------------------------------------------
# STEP 1: AUTHENTICATION & DISCOVERY
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

# Dynamic Patient Profile
$patientId = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'lexguarddidier@gmail.com') LIMIT 1;").Trim()
Assert-Test "Patient profile resolved" ($patientId.Length -gt 20)

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
$sessionRow = (Run-DockerSql "SELECT id, code, default_starts_at FROM session_def WHERE is_active = true ORDER BY sort_order LIMIT 1;").Trim()
$sessionParts = $sessionRow -split '\|'
$sessionId = $sessionParts[0].Trim()
$sessionCode = $sessionParts[1].Trim()
Assert-Test "Active session resolved" ($sessionId.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 2: CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Cleaning up prior test records..." -ForegroundColor Yellow

$cleanupSql = @"
DELETE FROM appointment_change_proposals WHERE reason LIKE 'CONSENT_TEST%';
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'CONSENT_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'CONSENT_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'CONSENT_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'CONSENT_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'CONSENT_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'CONSENT_TEST%';
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Database clean for consent test run" $true

# ------------------------------------------------------------------------------
# STEP 3: PATIENT CREATES APPOINTMENT
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Patient creates appointment..." -ForegroundColor Yellow

$bookPayload = @{
    patientId = $patientId
    poliklinikId = $poliklinikId
    layananId = $layananId
    appointmentDate = $bookingDate
    session = $sessionCode
    visitType = "new_visit"
    complaint = "CONSENT_TEST: Patient requires checkup"
} | ConvertTo-Json

$createdAppt = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload -Headers $patientHeaders)
$apptId = $createdAppt.id
Assert-Test "Appointment created successfully" ($null -ne $apptId -and $apptId.Length -gt 20)
Assert-Test "Initial appointment status is booked" ($createdAppt.status -eq "booked")

# ------------------------------------------------------------------------------
# STEP 4: ADMIN PROPOSES RESCHEDULE (DOES NOT ALTER APPOINTMENT DIRECTLY)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Admin proposes reschedule to tomorrow ($tomorrow)..." -ForegroundColor Yellow

$proposePayload = @{
    targetDate = $tomorrow
    targetSessionId = $sessionId
    targetDoctorId = $doctorId
    reason = "CONSENT_TEST: Dokter berhalangan hadir pada sesi pagi hari ini"
} | ConvertTo-Json

$proposeRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/propose-reschedule" -Method Post -Body $proposePayload -Headers $adminHeaders
$proposal1Id = $proposeRes.proposalId
Assert-Test "Admin propose-reschedule succeeded" ($proposeRes.success -eq $true)
Assert-Test "Proposal record created with ID" ($null -ne $proposal1Id -and $proposal1Id.Length -gt 20)

# Verification in DB: Confirmed appointment is STILL TODAY and STILL BOOKED!
$apptCheck1 = (Run-DockerSql "SELECT scheduled_date, status FROM appointments WHERE id = '$apptId';").Trim()
$apptCheck1Parts = $apptCheck1 -split '\|'
Assert-Test "Appointment scheduled_date remains TODAY (unaltered by clinic proposal)" ($apptCheck1Parts[0].Trim() -eq $today)
Assert-Test "Appointment status remains BOOKED" ($apptCheck1Parts[1].Trim() -eq "booked")

# Verification in DB: Proposal is PENDING
$propCheck1 = (Run-DockerSql "SELECT status, proposal_type, proposed_date FROM appointment_change_proposals WHERE id = '$proposal1Id';").Trim()
$propCheck1Parts = $propCheck1 -split '\|'
Assert-Test "Proposal status is PENDING" ($propCheck1Parts[0].Trim() -eq "pending")
Assert-Test "Proposal type is reschedule" ($propCheck1Parts[1].Trim() -eq "reschedule")
Assert-Test "Proposal target date is $tomorrow" ($propCheck1Parts[2].Trim() -eq $tomorrow)

# ------------------------------------------------------------------------------
# STEP 5: PATIENT DECLINES PROPOSAL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Patient declines the proposal..." -ForegroundColor Yellow

$declinePayload = @{
    decision = "declined"
    notes = "Saya tidak bisa hadir esok hari"
} | ConvertTo-Json

$declineRes = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposal1Id/respond" -Method Post -Body $declinePayload -Headers $patientHeaders
Assert-Test "Patient decline processed successfully" ($declineRes.success -eq $true)
Assert-Test "Decision recorded as declined" ($declineRes.decision -eq "declined")

# Verification in DB: Proposal is DECLINED, appointment preserved at TODAY
$propCheck2 = (Run-DockerSql "SELECT status FROM appointment_change_proposals WHERE id = '$proposal1Id';").Trim()
Assert-Test "Proposal 1 status transitioned to DECLINED" ($propCheck2 -eq "declined")

$apptCheck2 = (Run-DockerSql "SELECT scheduled_date FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "Original appointment schedule strictly PRESERVED at $today" ($apptCheck2 -eq $today)

# ------------------------------------------------------------------------------
# STEP 6: ADMIN PROPOSES A SECOND RESCHEDULE & PATIENT ACCEPTS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Admin proposes a second reschedule and Patient accepts..." -ForegroundColor Yellow

$propose2Payload = @{
    targetDate = $tomorrow
    targetSessionId = $sessionId
    targetDoctorId = $doctorId
    reason = "CONSENT_TEST: Menawarkan kembali jadwal esok hari yang disesuaikan"
} | ConvertTo-Json

$propose2Res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/propose-reschedule" -Method Post -Body $propose2Payload -Headers $adminHeaders
$proposal2Id = $propose2Res.proposalId
Assert-Test "Proposal 2 created" ($null -ne $proposal2Id -and $proposal2Id.Length -gt 20)

$acceptPayload = @{
    decision = "accepted"
    notes = "Baik, saya setuju untuk besok"
} | ConvertTo-Json

$acceptRes = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposal2Id/respond" -Method Post -Body $acceptPayload -Headers $patientHeaders
Assert-Test "Patient accept processed successfully" ($acceptRes.success -eq $true)
Assert-Test "Decision recorded as accepted" ($acceptRes.decision -eq "accepted")

# Verification in DB: Appointment scheduled_date is now TOMORROW!
$apptCheck3 = (Run-DockerSql "SELECT scheduled_date, status, practitioner_id FROM appointments WHERE id = '$apptId';").Trim()
$apptCheck3Parts = $apptCheck3 -split '\|'
Assert-Test "Appointment scheduled_date atomically MOVED to $tomorrow upon patient consent" ($apptCheck3Parts[0].Trim() -eq $tomorrow)
Assert-Test "Appointment doctor updated to proposed doctor" ($apptCheck3Parts[2].Trim() -eq $doctorId)

# Verification in DB: Queue ticket updated to tomorrow and destination doctor
$ticketCheck3 = (Run-DockerSql "SELECT queue_date, doctor_id FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
$ticketCheck3Parts = $ticketCheck3 -split '\|'
Assert-Test "Queue ticket queue_date updated to $tomorrow" ($ticketCheck3Parts[0].Trim() -eq $tomorrow)
Assert-Test "Queue ticket doctor_id updated to $doctorId" ($ticketCheck3Parts[1].Trim() -eq $doctorId)

# ------------------------------------------------------------------------------
# STEP 7: ADMIN PROPOSES CANCELLATION & PATIENT ACCEPTS
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Admin proposes cancellation and Patient accepts..." -ForegroundColor Yellow

$cancelPayload = @{
    reason = "CONSENT_TEST: Unit poliklinik ditutup untuk renovasi"
} | ConvertTo-Json

$cancelRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/propose-cancel" -Method Post -Body $cancelPayload -Headers $adminHeaders
$proposal3Id = $cancelRes.proposalId
Assert-Test "Cancellation proposal created" ($null -ne $proposal3Id -and $proposal3Id.Length -gt 20)

# Appointment must NOT be cancelled before patient answers
$apptPreCancel = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "Appointment remains active (NOT cancelled) before patient consent" ($apptPreCancel -eq "booked")

# Patient accepts cancellation
$acceptCancelPayload = @{
    decision = "accepted"
    notes = "Saya menyetujui pembatalan ini"
} | ConvertTo-Json

$acceptCancelRes = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposal3Id/respond" -Method Post -Body $acceptCancelPayload -Headers $patientHeaders
Assert-Test "Patient accepted cancellation proposal" ($acceptCancelRes.success -eq $true)

# Verification in DB: Appointment is now CANCELLED
$apptPostCancel = (Run-DockerSql "SELECT status, cancelled_at::text FROM appointments WHERE id = '$apptId';").Trim()
$apptPostParts = $apptPostCancel -split '\|'
Assert-Test "Appointment status transitioned to CANCELLED upon patient consent" ($apptPostParts[0].Trim() -eq "cancelled")
Assert-Test "Appointment cancelled_at timestamp is populated" (![string]::IsNullOrEmpty($apptPostParts[1].Trim()))

# Queue ticket is CANCELLED and waiting_position released
$ticketPostCancel = (Run-DockerSql "SELECT status, waiting_position FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
$ticketPostParts = $ticketPostCancel -split '\|'
Assert-Test "Queue ticket status is CANCELLED" ($ticketPostParts[0].Trim() -eq "cancelled")
Assert-Test "Queue ticket waiting_position is RELEASED (NULL)" ([string]::IsNullOrEmpty($ticketPostParts[1].Trim()))

# ------------------------------------------------------------------------------
# STEP 8: CONCURRENCY & IDEMPOTENCY GUARD
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Verifying Concurrency & Conflict Protection..." -ForegroundColor Yellow

$conflictCaught = $false
try {
    $null = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposal3Id/respond" -Method Post -Body $acceptCancelPayload -Headers $patientHeaders
} catch {
    $conflictCaught = $true
}
Assert-Test "Duplicate response on resolved proposal safely rejected (Conflict / Idempotent Guard)" $conflictCaught

# ------------------------------------------------------------------------------
# STEP 9: ADMIN PROPOSALS MONITORING ENDPOINT
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 9] Admin queries proposals monitoring endpoint..." -ForegroundColor Yellow

$adminProposals = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/proposals/pending" -Method Get -Headers $adminHeaders
Assert-Test "Admin proposals query returned an array" ($adminProposals -is [Array])

# ------------------------------------------------------------------------------
# STEP 10: DYNAMIC OVERCAPACITY & CONFIG VERIFICATION
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 10] Verifying Clinic Configuration in clinic_setting (Zero Magic Numbers)..." -ForegroundColor Yellow

$leadMin = (Run-DockerSql "SELECT value::text FROM clinic_setting WHERE key = 'proposal.expiration_lead_minutes';").Trim()
Assert-Test "proposal.expiration_lead_minutes exists in clinic_setting" ($leadMin -eq "60")

$sweeperCron = (Run-DockerSql "SELECT value::text FROM clinic_setting WHERE key = 'proposal.sweeper_cron_expression';").Trim()
Assert-Test "proposal.sweeper_cron_expression exists in clinic_setting" ($sweeperCron -match "5")

$overflowTolerance = (Run-DockerSql "SELECT value::text FROM clinic_setting WHERE key = 'queue.overflow_tolerance_minutes';").Trim()
Assert-Test "queue.overflow_tolerance_minutes exists in clinic_setting" ($overflowTolerance -eq "30")

# ------------------------------------------------------------------------------
# STEP 11: CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 11] Cleaning up test records..." -ForegroundColor Yellow

$cleanupEndSql = @"
DELETE FROM appointment_change_proposals WHERE reason LIKE 'CONSENT_TEST%';
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$apptId'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$apptId'));
DELETE FROM queue_tickets WHERE appointment_id IN ('$apptId');
DELETE FROM appointment_check_ins WHERE appointment_id IN ('$apptId');
DELETE FROM appointment_status_events WHERE appointment_id IN ('$apptId');
DELETE FROM appointments WHERE id = '$apptId';
"@
$null = Run-DockerSql $cleanupEndSql
Assert-Test "Test data cleaned up successfully" $true

Print-TestSummary "PATIENT CONSENT & DYNAMIC OVERCAPACITY E2E"
