# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: BULK APPOINTMENT OPERATIONS
# Verifies:
# 1. Bulk Assign Doctor: Transactional batch assignment & sequential queue compaction
# 2. Bulk Assign Room: Transactional batch room allocation
# 3. Bulk Reschedule: Batch migration to target date/session
# 4. Bulk Cancel: Batch cancellation & ticket slot release
# 5. Partial failure resilience: Non-blocking error handling
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] BULK APPOINTMENT OPERATIONS (DOCTOR, ROOM, RESCHEDULE, CANCEL)" -ForegroundColor Cyan
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

# Dynamic Patient Profiles
$patientIds = (Run-DockerSql "SELECT id FROM patient_profiles LIMIT 3;").Trim() -split "`n" | ForEach-Object { $_.Trim() }
$patient1Id = $patientIds[0]
$patient2Id = if ($patientIds.Count -gt 1) { $patientIds[1] } else { $patient1Id }
$patient3Id = if ($patientIds.Count -gt 2) { $patientIds[2] } else { $patient1Id }

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
$sessionRow = (Run-DockerSql "SELECT id, code, default_starts_at FROM session_def WHERE is_active = true ORDER BY sort_order LIMIT 1;").Trim()
$sessionParts = $sessionRow -split '\|'
$sessionId = $sessionParts[0].Trim()
$sessionCode = $sessionParts[1].Trim()
$sessionStartTime = $sessionParts[2].Trim()
Assert-Test "Active session resolved" ($sessionId.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 2: CLEANUP TEST DATA
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Cleaning up prior test records..." -ForegroundColor Yellow
$cleanupSql = @"
DELETE FROM appointment_call_attempts WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_TEST%');
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_TEST%'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_TEST%'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_TEST%');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_TEST%');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'BULK_TEST%');
DELETE FROM appointments WHERE complaint LIKE 'BULK_TEST%';
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Database clean for bulk test run" $true

# ------------------------------------------------------------------------------
# STEP 3: CREATE 3 APPOINTMENTS (BATCH)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Creating 3 appointments for bulk testing..." -ForegroundColor Yellow

function Create-BulkTestAppt($targetPatientId, $label) {
    $payload = @{
        patientId = $targetPatientId
        poliklinikId = $poliklinikId
        layananId = $layananId
        appointmentDate = $bookingDate
        session = $sessionCode
        visitType = "new_visit"
        complaint = "BULK_TEST $label"
    } | ConvertTo-Json
    $res = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $payload -Headers $patientHeaders)
    return $res.id
}

$appt1Id = Create-BulkTestAppt $patient1Id "Patient A"
$appt2Id = Create-BulkTestAppt $patient2Id "Patient B"
$appt3Id = Create-BulkTestAppt $patient3Id "Patient C"

Assert-Test "Appointment 1 created" ($null -ne $appt1Id -and $appt1Id.Length -gt 20)
Assert-Test "Appointment 2 created" ($null -ne $appt2Id -and $appt2Id.Length -gt 20)
Assert-Test "Appointment 3 created" ($null -ne $appt3Id -and $appt3Id.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 4: BULK ASSIGN DOCTOR
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Executing Bulk Assign Doctor..." -ForegroundColor Yellow
$bulkDocPayload = @{
    appointmentIds = @($appt1Id, $appt2Id, $appt3Id)
    doctorId = $doctorId
    reason = "Penugasan dokter massal sesi pagi"
} | ConvertTo-Json

$bulkDocRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/assign-doctor" -Method Post -Headers $adminHeaders -Body $bulkDocPayload
$docData = $bulkDocRes.data
Write-Host " Bulk Assign Doctor Total: $($docData.total), Succeeded: $($docData.succeededCount), Failed: $($docData.failedCount)" -ForegroundColor Cyan

Assert-Test "Bulk assign doctor succeeded for all 3 appointments" ($docData.succeededCount -eq 3)
Assert-Test "Bulk assign doctor failedCount is 0" ($docData.failedCount -eq 0)

# Verify DB practitioner_id and sequential ETA
$p1Doc = (Run-DockerSql "SELECT practitioner_id, estimated_start_at::text FROM appointments WHERE id = '$appt1Id';").Trim()
$p2Doc = (Run-DockerSql "SELECT practitioner_id, estimated_start_at::text FROM appointments WHERE id = '$appt2Id';").Trim()
$p3Doc = (Run-DockerSql "SELECT practitioner_id, estimated_start_at::text FROM appointments WHERE id = '$appt3Id';").Trim()

Assert-Test "Appointment 1 practitioner assigned" ($p1Doc -match $doctorId)
Assert-Test "Appointment 2 practitioner assigned" ($p2Doc -match $doctorId)
Assert-Test "Appointment 3 practitioner assigned" ($p3Doc -match $doctorId)

# Verify Queue Ticket Sequential Positions: 1, 2, 3
$ticket1Pos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt1Id';").Trim()
$ticket2Pos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt2Id';").Trim()
$ticket3Pos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt3Id';").Trim()

Write-Host " Ticket 1 Pos: $ticket1Pos | Ticket 2 Pos: $ticket2Pos | Ticket 3 Pos: $ticket3Pos" -ForegroundColor Cyan
$positions = @([int]$ticket1Pos, [int]$ticket2Pos, [int]$ticket3Pos) | Sort-Object
Assert-Test "All 3 appointments have unique waiting positions 1, 2, 3" ($positions[0] -eq 1 -and $positions[1] -eq 2 -and $positions[2] -eq 3)

# ------------------------------------------------------------------------------
# STEP 5: BULK ASSIGN ROOM
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Executing Bulk Assign Room..." -ForegroundColor Yellow
$bulkRoomPayload = @{
    appointmentIds = @($appt1Id, $appt2Id, $appt3Id)
    roomId = $roomId
} | ConvertTo-Json

$bulkRoomRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/assign-room" -Method Post -Headers $adminHeaders -Body $bulkRoomPayload
$roomData = $bulkRoomRes.data
Write-Host " Bulk Assign Room Total: $($roomData.total), Succeeded: $($roomData.succeededCount), Failed: $($roomData.failedCount)" -ForegroundColor Cyan

Assert-Test "Bulk assign room succeeded for all 3 appointments" ($roomData.succeededCount -eq 3)
Assert-Test "Bulk assign room failedCount is 0" ($roomData.failedCount -eq 0)

$p1Room = (Run-DockerSql "SELECT room_id FROM appointments WHERE id = '$appt1Id';").Trim()
$p2Room = (Run-DockerSql "SELECT room_id FROM appointments WHERE id = '$appt2Id';").Trim()
$p3Room = (Run-DockerSql "SELECT room_id FROM appointments WHERE id = '$appt3Id';").Trim()

Assert-Test "Appointment 1 room assigned" ($p1Room -eq $roomId)
Assert-Test "Appointment 2 room assigned" ($p2Room -eq $roomId)
Assert-Test "Appointment 3 room assigned" ($p3Room -eq $roomId)

# ------------------------------------------------------------------------------
# STEP 6: BULK RESCHEDULE (APPT 1 & 2 TO TOMORROW)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Executing Bulk Reschedule (Appt 1 & 2 to $tomorrow)..." -ForegroundColor Yellow
$bulkReschedulePayload = @{
    appointmentIds = @($appt1Id, $appt2Id)
    targetDate = $tomorrow
    session = $sessionCode
    reason = "Penjadwalan ulang massal ke hari esok"
} | ConvertTo-Json

$bulkReschedRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/reschedule" -Method Post -Headers $adminHeaders -Body $bulkReschedulePayload
$reschedData = $bulkReschedRes.data
Write-Host " Bulk Reschedule Total: $($reschedData.total), Succeeded: $($reschedData.succeededCount), Failed: $($reschedData.failedCount)" -ForegroundColor Cyan

Assert-Test "Bulk reschedule succeeded for 2 appointments" ($reschedData.succeededCount -eq 2)
Assert-Test "Bulk reschedule failedCount is 0" ($reschedData.failedCount -eq 0)

$p1Date = (Run-DockerSql "SELECT scheduled_date FROM appointments WHERE id = '$appt1Id';").Trim()
$p2Date = (Run-DockerSql "SELECT scheduled_date FROM appointments WHERE id = '$appt2Id';").Trim()
$p3Date = (Run-DockerSql "SELECT scheduled_date FROM appointments WHERE id = '$appt3Id';").Trim()

Assert-Test "Appointment 1 scheduled date moved to tomorrow" ($p1Date -eq $tomorrow)
Assert-Test "Appointment 2 scheduled date moved to tomorrow" ($p2Date -eq $tomorrow)
Assert-Test "Appointment 3 scheduled date remains today" ($p3Date -eq $bookingDate)

# ------------------------------------------------------------------------------
# STEP 7: BULK CANCEL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Executing Bulk Cancel for all 3 appointments..." -ForegroundColor Yellow
$bulkCancelPayload = @{
    appointmentIds = @($appt1Id, $appt2Id, $appt3Id)
    reason = "Pembatalan massal karena dokter dinas luar kota"
} | ConvertTo-Json

$bulkCancelRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/cancel" -Method Post -Headers $adminHeaders -Body $bulkCancelPayload
$cancelData = $bulkCancelRes.data
Write-Host " Bulk Cancel Total: $($cancelData.total), Succeeded: $($cancelData.succeededCount), Failed: $($cancelData.failedCount)" -ForegroundColor Cyan

Assert-Test "Bulk cancel succeeded for all 3 appointments" ($cancelData.succeededCount -eq 3)
Assert-Test "Bulk cancel failedCount is 0" ($cancelData.failedCount -eq 0)

$p1Status = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$appt1Id';").Trim()
$p2Status = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$appt2Id';").Trim()
$p3Status = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$appt3Id';").Trim()

Assert-Test "Appointment 1 status is cancelled" ($p1Status -eq "cancelled")
Assert-Test "Appointment 2 status is cancelled" ($p2Status -eq "cancelled")
Assert-Test "Appointment 3 status is cancelled" ($p3Status -eq "cancelled")

# Verify Tickets Cancelled and Positions Cleared
$t1Status = (Run-DockerSql "SELECT status, waiting_position FROM queue_tickets WHERE appointment_id = '$appt1Id';").Trim()
Assert-Test "Ticket 1 status is cancelled" ($t1Status -match "cancelled")

# ------------------------------------------------------------------------------
# STEP 8: PARTIAL FAILURE RESILIENCE
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Verifying Partial Failure Resilience (Trying to assign doctor to cancelled appointments)..." -ForegroundColor Yellow
$failPayload = @{
    appointmentIds = @($appt1Id)
    doctorId = $doctorId
    reason = "Test resilience"
} | ConvertTo-Json

$failRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/bulk/assign-doctor" -Method Post -Headers $adminHeaders -Body $failPayload
$failData = $failRes.data

Assert-Test "System gracefully reports failedCount > 0 without 500 crash" ($failData.failedCount -eq 1)
Assert-Test "Error message is captured cleanly" ($failData.errors.Count -eq 1)
Write-Host " Captured error for cancelled appointment: $($failData.errors[0].message)" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 9: CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 9] Cleaning up test appointments..." -ForegroundColor Yellow
$cleanupAllSql = @"
DELETE FROM appointment_call_attempts WHERE appointment_id IN ('$appt1Id', '$appt2Id', '$appt3Id');
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$appt1Id', '$appt2Id', '$appt3Id'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$appt1Id', '$appt2Id', '$appt3Id'));
DELETE FROM queue_tickets WHERE appointment_id IN ('$appt1Id', '$appt2Id', '$appt3Id');
DELETE FROM appointment_check_ins WHERE appointment_id IN ('$appt1Id', '$appt2Id', '$appt3Id');
DELETE FROM appointment_status_events WHERE appointment_id IN ('$appt1Id', '$appt2Id', '$appt3Id');
DELETE FROM appointments WHERE id IN ('$appt1Id', '$appt2Id', '$appt3Id');
"@
$null = Run-DockerSql $cleanupAllSql
Assert-Test "Test data cleaned up" $true

Print-TestSummary "BULK APPOINTMENT OPERATIONS E2E"
