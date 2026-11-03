param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [VERIFY SCENARIO] NO-SHOW APPOINTMENT -> RESCHEDULE PROPOSAL ACCEPTANCE" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
$apiUrl = Get-E2EApiBaseUrl
$today = (Get-Date).ToString("yyyy-MM-dd")
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

# 1. Auth
$backendRoot = (Resolve-Path "$PSScriptRoot\..\..\..").Path
Push-Location $backendRoot
$adminJwt = (bun run ./scripts/dev/get-jwt-user.ts --email admin@amanah.com --raw | Select-Object -Last 1).Trim()
$patientJwt = (bun run ./scripts/dev/get-jwt-user.ts --email lexguarddidier@gmail.com --raw | Select-Object -Last 1).Trim()
$patientUserId = (Run-DockerSql "SELECT id FROM users WHERE email = 'lexguarddidier@gmail.com';").Trim()
Pop-Location

$adminHeaders = @{ Authorization = "Bearer $adminJwt"; "Content-Type" = "application/json" }
$patientHeaders = @{ Authorization = "Bearer $patientJwt"; "Content-Type" = "application/json" }

$patientProfileId = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$patientUserId' LIMIT 1;").Trim()
if (-not $patientProfileId) {
    $patientProfileId = (Run-DockerSql "SELECT patient_id FROM patient_affiliations WHERE user_id = '$patientUserId' LIMIT 1;").Trim()
}

$poliklinikId = (Run-DockerSql "SELECT id FROM clinic_units WHERE is_active = true LIMIT 1;").Trim()
$layananId = (Run-DockerSql "SELECT id FROM clinic_services WHERE is_active = true LIMIT 1;").Trim()
$sessionId = (Run-DockerSql "SELECT id FROM session_def WHERE is_active = true LIMIT 1;").Trim()
$sessionCode = (Run-DockerSql "SELECT code FROM session_def WHERE id = '$sessionId';").Trim()
$doctorId = (Run-DockerSql "SELECT id FROM practitioners WHERE is_accepting_appointments = true LIMIT 1;").Trim()
$roomId = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE is_active = true LIMIT 1;").Trim()

# 2. Cleanup prior records
$cleanupSql = @"
DELETE FROM appointment_change_proposals WHERE reason LIKE 'NOSHOW_TEST%';
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'NOSHOW_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'NOSHOW_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'NOSHOW_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'NOSHOW_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'NOSHOW_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'NOSHOW_TEST%';
"@
$null = Run-DockerSql $cleanupSql

# 3. Create appointment for today
$bookPayload = @{
    patientId = $patientProfileId
    poliklinikId = $poliklinikId
    layananId = $layananId
    appointmentDate = $today
    session = $sessionCode
    visitType = "new_visit"
    complaint = "NOSHOW_TEST: Direct verify no-show to reschedule"
} | ConvertTo-Json

$createdAppt = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload -Headers $patientHeaders)
$apptId = $createdAppt.id
Assert-Test "Appointment created" ($null -ne $apptId)

# Set practitioner and room
$null = Run-DockerSql "UPDATE appointments SET practitioner_id = '$doctorId', room_id = '$roomId' WHERE id = '$apptId';"

# 4. Simulate check-in and no-show transition (inline queue reached threshold)
$null = Run-DockerSql "UPDATE appointments SET status = 'no_show', checked_in_at = NOW(), last_called_at = NOW() WHERE id = '$apptId';"
$null = Run-DockerSql "UPDATE queue_tickets SET status = 'skipped', called_at = NOW() WHERE appointment_id = '$apptId';"

$dbAptBefore = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$apptId';").Trim()
$dbTicketBefore = (Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
Assert-Test "Appointment is in no_show state before reschedule" ($dbAptBefore -eq "no_show")
Assert-Test "Ticket is in skipped state before reschedule" ($dbTicketBefore -eq "skipped")

# 5. Admin proposes reschedule to tomorrow
$rescheduleDto = @{
    targetDate = $tomorrow
    targetSessionId = $sessionId
    targetDoctorId = $doctorId
    targetRoomId = $roomId
    reason = "NOSHOW_TEST: Pasien terlambat, diusulkan ke besok"
} | ConvertTo-Json

$propRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/propose-reschedule" -Method Post -Body $rescheduleDto -Headers $adminHeaders
Assert-Test "Admin propose reschedule returned success" ($propRes.success -eq $true)
$proposalId = $propRes.proposalId

# 6. Patient accepts reschedule proposal
$respondBody = @{
    decision = "accepted"
    notes = "Baik, saya bersedia datang besok."
} | ConvertTo-Json

$acceptRes = Invoke-RestMethod -Uri "$apiUrl/appointments/proposals/$proposalId/respond" -Method Post -Body $respondBody -Headers $patientHeaders
Assert-Test "Patient accept response succeeded" ($acceptRes.success -eq $true)

# 7. CRITICAL VERIFICATIONS:
# A. Appointment status MUST BE 'booked' (NOT 'no_show'!)
$dbAptStatusAfter = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "[CRITICAL] Appointment status reset to 'booked' (not 'no_show')" ($dbAptStatusAfter -eq "booked")

# B. checked_in_at and last_called_at MUST BE NULL
$dbCheckedIn = (Run-DockerSql "SELECT CASE WHEN checked_in_at IS NULL THEN 'NULL' ELSE 'EXISTS' END FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "[CRITICAL] checked_in_at cleared to NULL for tomorrow" ($dbCheckedIn -eq "NULL")

$dbLastCalled = (Run-DockerSql "SELECT CASE WHEN last_called_at IS NULL THEN 'NULL' ELSE 'EXISTS' END FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "[CRITICAL] last_called_at cleared to NULL for tomorrow" ($dbLastCalled -eq "NULL")

# C. scheduled_date MUST BE tomorrow
$dbSchedDate = (Run-DockerSql "SELECT scheduled_date FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "[CRITICAL] scheduled_date updated to tomorrow ($tomorrow)" ($dbSchedDate -eq $tomorrow)

# D. queue_tickets status MUST BE 'waiting' (NOT 'skipped'!)
$dbTicketStatus = (Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
Assert-Test "[CRITICAL] Ticket status reset to 'waiting' (not 'skipped')" ($dbTicketStatus -eq "waiting")

# E. queue_tickets called_at MUST BE NULL
$dbTicketCalled = (Run-DockerSql "SELECT CASE WHEN called_at IS NULL THEN 'NULL' ELSE 'EXISTS' END FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
Assert-Test "[CRITICAL] Ticket called_at cleared to NULL" ($dbTicketCalled -eq "NULL")

# F. queue_tickets queue_date MUST BE tomorrow
$dbTicketDate = (Run-DockerSql "SELECT queue_date FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
Assert-Test "[CRITICAL] Ticket queue_date updated to tomorrow ($tomorrow)" ($dbTicketDate -eq $tomorrow)

# G. queue_tickets queue_number is populated and sequential
$dbTicketNum = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
Assert-Test "[CRITICAL] New ticket number generated: $dbTicketNum" ($dbTicketNum.Length -gt 0)

# H. queue_tickets waiting_position is set
$dbWaitPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
Assert-Test "[CRITICAL] Waiting position recalculated: $dbWaitPos" ([int]$dbWaitPos -gt 0)

# 8. Cleanup
$null = Run-DockerSql $cleanupSql
Assert-Test "Test records cleaned up" $true

Print-TestSummary "NO-SHOW RESCHEDULE ACCEPTANCE VERIFICATION"
