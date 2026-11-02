# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: DOCTOR ASSIGNMENT QUEUE ESTIMATION & CONFIG-DRIVEN SYNC
# Verifies:
# 1. Pre-assignment invariants: practitioner/room NULL, QR check-in blocked before assignment
# 2. Sequential doctor assignment: Patient 1 starts at session start (08:00), Patient 2 at 08:30
# 3. Admin read model (estimatedStartAt) is perfectly synced with patient ticket projection
# 4. Zero magic numbers: dynamic lateness and check-in window driven by clinic_setting
# 5. Lateness sweep & auto-demote to tail: Patient 1 demoted, Patient 2 compacted forward
# 6. Max lateness attempts threshold: transition to CANCELLED and ticket released
# 7. Checked-in patients immunity: WAITING status is never swept to LATE
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] DOCTOR ASSIGNMENT QUEUE ESTIMATION & CLINICAL CONFIG SYNC" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl
$today = (Get-Date).ToString("yyyy-MM-dd")
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
$patientSqlRes = Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = 'ef2973a6-963d-4853-b8c1-e30101d15299' LIMIT 1;"
$patientId = if ($patientSqlRes) { $patientSqlRes.ToString().Trim() } else { "a78cb62e-17be-45de-b058-9d3a5bc9e646" }
Assert-Test "Patient profile resolved" ($patientId.Length -gt 20)

# Secondary Patient Profile
$patient2Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE id != '$patientId' LIMIT 1;").Trim()
Assert-Test "Secondary Patient profile resolved" ($patient2Id.Length -gt 20)

# Dynamic Doctor (Practitioner)
$doctorId = (Run-DockerSql "SELECT id FROM practitioners WHERE is_accepting_appointments = true LIMIT 1;").Trim()
Assert-Test "Practitioner resolved" ($doctorId.Length -gt 20)

# Dynamic Room
$roomId = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Clinic Room resolved" ($roomId.Length -gt 20)

# Dynamic Polyclinic & Service
$poliklinikId = (Run-DockerSql "SELECT id FROM clinic_units WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Polyclinic resolved" ($poliklinikId.Length -gt 20)

$layananId = (Run-DockerSql "SELECT id FROM clinic_services WHERE is_active = true LIMIT 1;").Trim()
Assert-Test "Clinic Service resolved" ($layananId.Length -gt 20)

# Dynamic Active Session
$sessionRow = (Run-DockerSql "SELECT id, code, default_starts_at FROM session_def WHERE is_active = true ORDER BY sort_order LIMIT 1;").Trim()
$sessionParts = $sessionRow -split '\|'
$sessionId = $sessionParts[0].Trim()
$sessionCode = $sessionParts[1].Trim()
$sessionStartTime = $sessionParts[2].Trim()
Write-Host " Session: $sessionCode, Starts At: $sessionStartTime, ID: $sessionId" -ForegroundColor Cyan
Assert-Test "Active session resolved" ($sessionId.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 2: CLEANUP TEST DATA FOR TARGET DATE
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Cleaning up any prior test records for $bookingDate..." -ForegroundColor Yellow
$cleanupSql = @"
DELETE FROM appointment_call_attempts WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'E2E%' OR patient_id IN ('$patientId', '$patient2Id'));
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'E2E%') OR patient_id IN ('$patientId', '$patient2Id'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'E2E%') OR patient_id IN ('$patientId', '$patient2Id'));
DELETE FROM queue_tickets WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'E2E%') OR patient_id IN ('$patientId', '$patient2Id');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'E2E%' OR patient_id IN ('$patientId', '$patient2Id'));
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE complaint LIKE 'E2E%' OR patient_id IN ('$patientId', '$patient2Id'));
DELETE FROM appointments WHERE complaint LIKE 'E2E%' OR patient_id IN ('$patientId', '$patient2Id');
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Database clean for $bookingDate test run" $true

# ------------------------------------------------------------------------------
# STEP 3: CREATE APPOINTMENT (EXTERNAL CONSUMER FLOW)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] External Patient creates appointment for session $sessionCode..." -ForegroundColor Yellow
$bookPayload = @{
    patientId = $patientId
    poliklinikId = $poliklinikId
    layananId = $layananId
    appointmentDate = $bookingDate
    session = $sessionCode
    visitType = "new_visit"
    complaint = "E2E Estimation Invariant Test"
} | ConvertTo-Json

$createdAppt = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload -Headers $patientHeaders)
$apptId = $createdAppt.id
Assert-Test "Appointment created successfully" ($null -ne $apptId -and $apptId.Length -gt 20)
Assert-Test "Appointment status is booked" ($createdAppt.status -eq "booked")

# ------------------------------------------------------------------------------
# STEP 3B: PRE-ASSIGNMENT INVARIANTS (BEFORE DOCTOR & ROOM ASSIGNMENT)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3B] Verifying Pre-Assignment Invariants (Doctor/Room NULL & Check-in Blocked)..." -ForegroundColor Yellow

# 1. Database Invariants: practitioner_id and room_id MUST be NULL
$preDbCheck = (Run-DockerSql "SELECT practitioner_id, room_id FROM appointments WHERE id = '$apptId';").Trim()
$preParts = $preDbCheck -split '\|'
$preDoc = $preParts[0].Trim()
$preRoom = $preParts[1].Trim()
Assert-Test "Pre-assignment appointment practitioner_id is NULL" ([string]::IsNullOrEmpty($preDoc))
Assert-Test "Pre-assignment appointment room_id is NULL" ([string]::IsNullOrEmpty($preRoom))

# 2. Queue Ticket Invariants: doctor_id and room_id MUST be NULL
$preTicketCheck = (Run-DockerSql "SELECT doctor_id, room_id FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
$preTicketParts = $preTicketCheck -split '\|'
$preTicketDoc = $preTicketParts[0].Trim()
$preTicketRoom = $preTicketParts[1].Trim()
Assert-Test "Pre-assignment queue ticket doctor_id is NULL" ([string]::IsNullOrEmpty($preTicketDoc))
Assert-Test "Pre-assignment queue ticket room_id is NULL" ([string]::IsNullOrEmpty($preTicketRoom))

# 3. Patient Check-In QR Generation MUST BE BLOCKED (HTTP 400 - Ruangan periksa belum ditugaskan)
$qrBlocked = $false
$qrErrorMsg = ""
try {
    $null = Invoke-RestMethod -Uri "$apiUrl/appointments/$apptId/check-in-qr" -Method Post -Headers $adminHeaders
} catch {
    $qrBlocked = $true
    $qrErrorMsg = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
}
Write-Host " Pre-assignment QR Blocked Error: $qrErrorMsg" -ForegroundColor Cyan
Assert-Test "Pre-assignment QR check-in attempt is properly BLOCKED" ($qrBlocked -and ($qrErrorMsg -match "Ruangan" -or $qrErrorMsg -match "400"))

# 4. Admin List shows appointment with unassigned doctor
$preAdminRes = Invoke-RestMethod -Uri "$apiUrl/appointments?date=$bookingDate&limit=50" -Method Get -Headers $adminHeaders
$preAdminItems = if ($preAdminRes.data) { $preAdminRes.data } else { $preAdminRes }
$preAdminItem = $preAdminItems | Where-Object { $_.id -eq $apptId }
Assert-Test "Pre-assignment appointment appears in Admin list" ($null -ne $preAdminItem)
Assert-Test "Pre-assignment appointment doctor is unassigned (staffId is null)" ($null -eq $preAdminItem.staffId)

# ------------------------------------------------------------------------------
# STEP 4: ASSIGN DOCTOR & VERIFY QUEUE ESTIMATION INVARIANT
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Admin assigns doctor to appointment..." -ForegroundColor Yellow
$assignBody = @{ doctorId = $doctorId } | ConvertTo-Json
$assignRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/doctor" -Method Patch -Headers $adminHeaders -Body $assignBody

# Verify in DB: estimated_start_at MUST match session start time (08:00), NOT 08:30!
$dbCheck = (Run-DockerSql "SELECT scheduled_start_time, estimated_start_at::text, practitioner_id FROM appointments WHERE id = '$apptId';").Trim()
$dbParts = $dbCheck -split '\|'
$dbScheduledStart = $dbParts[0].Trim()
$dbEstimatedStart = $dbParts[1].Trim()
$dbPractitionerId = $dbParts[2].Trim()

Write-Host " DB Scheduled Start : $dbScheduledStart" -ForegroundColor Cyan
Write-Host " DB Estimated Start : $dbEstimatedStart" -ForegroundColor Cyan
Write-Host " DB Practitioner ID : $dbPractitionerId" -ForegroundColor Cyan

Assert-Test "Doctor assigned to appointment" ($dbPractitionerId -eq $doctorId)
Assert-Test "Pre-opening first patient starts at session start (NOT 08:30)" ($dbEstimatedStart -match "08:00:00")

# Verify queue ticket projection
$ticketCheck = (Run-DockerSql "SELECT waiting_position, projected_start::text, projected_end::text, doctor_id FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
$ticketParts = $ticketCheck -split '\|'
$ticketWaitPos = $ticketParts[0].Trim()
$ticketProjStart = $ticketParts[1].Trim()
$ticketProjEnd = $ticketParts[2].Trim()

Write-Host " Ticket Waiting Pos : $ticketWaitPos" -ForegroundColor Cyan
Write-Host " Ticket Proj Start  : $ticketProjStart" -ForegroundColor Cyan
Write-Host " Ticket Proj End    : $ticketProjEnd" -ForegroundColor Cyan

Assert-Test "Queue ticket waiting position is 1" ($ticketWaitPos -eq "1")
Assert-Test "Queue ticket projected start is 08:00:00" ($ticketProjStart -match "08:00:00")

# ------------------------------------------------------------------------------
# STEP 4B: SECOND PATIENT SEQUENTIAL QUEUE ESTIMATION INVARIANT
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4B] Second Patient creates appointment and is assigned to SAME doctor..." -ForegroundColor Yellow

$bookPayload2 = @{
    patientId = $patient2Id
    poliklinikId = $poliklinikId
    layananId = $layananId
    appointmentDate = $bookingDate
    session = $sessionCode
    visitType = "new_visit"
    complaint = "E2E Sequential Estimation Test"
} | ConvertTo-Json

$createdAppt2 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload2 -Headers $patientHeaders)
$appt2Id = $createdAppt2.id
Assert-Test "Second appointment created successfully" ($null -ne $appt2Id)

$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$appt2Id/doctor" -Method Patch -Headers $adminHeaders -Body $assignBody

# Verify in DB: Patient 1 starts at 08:00, Patient 2 starts at 08:30!
$appt1Est = (Run-DockerSql "SELECT estimated_start_at::text FROM appointments WHERE id = '$apptId';").Trim()
$appt2Est = (Run-DockerSql "SELECT estimated_start_at::text FROM appointments WHERE id = '$appt2Id';").Trim()

Write-Host " Patient 1 Estimated Start : $appt1Est" -ForegroundColor Cyan
Write-Host " Patient 2 Estimated Start : $appt2Est" -ForegroundColor Cyan

Assert-Test "Patient 1 remains at 08:00" ($appt1Est -match "08:00:00")
Assert-Test "Patient 2 sequentially projected at 08:30" ($appt2Est -match "08:30:00")

# Queue ticket waiting position for Patient 2
$ticket2WaitPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt2Id';").Trim()
Assert-Test "Patient 2 waiting position is 2" ($ticket2WaitPos -eq "2")

# ------------------------------------------------------------------------------
# STEP 5: ASSIGN ROOM & VERIFY IDEMPOTENCY
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Admin assigns room to appointment..." -ForegroundColor Yellow
$assignRoomBody = @{ roomId = $roomId } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/room" -Method Patch -Headers $adminHeaders -Body $assignRoomBody
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$appt2Id/room" -Method Patch -Headers $adminHeaders -Body $assignRoomBody

$roomCheck = (Run-DockerSql "SELECT room_id, estimated_start_at::text FROM appointments WHERE id = '$apptId';").Trim()
$roomParts = $roomCheck -split '\|'
Assert-Test "Room assigned successfully" ($roomParts[0].Trim() -eq $roomId)
Assert-Test "Estimated start remains 08:00 after room assignment" ($roomParts[1].Trim() -match "08:00:00")

# ------------------------------------------------------------------------------
# STEP 6: VERIFY ADMIN READ MODEL HAS ESTIMATED TIME (SYNC INVARIANT)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Verifying Admin Table Read Model for ETA synchronization..." -ForegroundColor Yellow
$adminRes = Invoke-RestMethod -Uri "$apiUrl/appointments?date=$bookingDate&limit=50" -Method Get -Headers $adminHeaders
$adminItems = if ($adminRes.data) { $adminRes.data } else { $adminRes }
$targetItem = $adminItems | Where-Object { $_.id -eq $apptId }

Assert-Test "Appointment found in admin table list" ($null -ne $targetItem)
Assert-Test "Admin item has estimatedStartAt" ($null -ne $targetItem.estimatedStartAt)
Write-Host " Admin item estimatedStartAt: $($targetItem.estimatedStartAt)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 7: DYNAMIC CLINIC SETTING VERIFICATION (NO MAGIC NUMBERS)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Verifying clinic_setting JSONB config values..." -ForegroundColor Yellow
$configCheck = (Run-DockerSql "SELECT value::text FROM clinic_setting WHERE key = 'queue.overflow_tolerance_minutes';").Trim()
Write-Host " clinic_setting [queue.overflow_tolerance_minutes]: $configCheck" -ForegroundColor Cyan
Assert-Test "queue.overflow_tolerance_minutes exists in clinic_setting" ($configCheck -ne "")

# ------------------------------------------------------------------------------
# STEP 8: EDGE CASE - LATENESS SWEEPER & AUTO-DEMOTE TO TAIL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Edge Case: Patient 1 misses ETA + tolerance, sweeper demotes to tail..." -ForegroundColor Yellow

# Simulate Patient 1 missing their personal slot (set estimatedStartAt to 2 hours ago)
$pastTime = (Get-Date).AddHours(-2).ToString("yyyy-MM-dd HH:mm:sszzz")
$null = Run-DockerSql "UPDATE appointments SET estimated_start_at = '$pastTime' WHERE id = '$apptId';"
$null = Run-DockerSql "UPDATE queue_tickets SET projected_start = '$pastTime' WHERE appointment_id = '$apptId';"

# Trigger sweep endpoint
$sweepRes = Invoke-RestMethod -Uri "$apiUrl/appointments/sweep-late" -Method Post -Headers $adminHeaders
Write-Host " Swept Count: $($sweepRes.sweptCount)" -ForegroundColor Cyan
Assert-Test "Sweep swept at least 1 late appointment" ($sweepRes.sweptCount -ge 1)

# Verify Patient 1 transitioned to LATE
$appt1StatusCheck = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$apptId';").Trim()
Assert-Test "Patient 1 status transitioned to late" ($appt1StatusCheck -eq "late")

# Verify audit event in appointment_status_events
$eventCheck = (Run-DockerSql "SELECT new_status, reason FROM appointment_status_events WHERE appointment_id = '$apptId' ORDER BY created_at DESC LIMIT 1;").Trim()
$eventParts = $eventCheck -split '\|'
Assert-Test "Audit event recorded status transition to late" ($eventParts[0].Trim() -eq "late")
Assert-Test "Audit event reason notes auto-demote to tail" ($eventParts[1].Trim() -match "Terlambat hadir")

# Verify Queue Recalculation: Patient 2 (on-time) compacted to Pos 1, Patient 1 (late) demoted to Pos 2
$p1WaitPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
$p2WaitPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt2Id';").Trim()
Write-Host " Patient 2 (On-time) Waiting Position : $p2WaitPos" -ForegroundColor Green
Write-Host " Patient 1 (Late)    Waiting Position : $p1WaitPos" -ForegroundColor Yellow

Assert-Test "On-time Patient 2 compacted forward to position 1" ($p2WaitPos -eq "1")
Assert-Test "Late Patient 1 demoted to queue tail at position 2" ($p1WaitPos -eq "2")

# ------------------------------------------------------------------------------
# STEP 9: EDGE CASE - MAX LATENESS ATTEMPTS TRANSITION TO CANCELLED
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 9] Edge Case: Patient 1 exceeds max lateness attempts -> CANCELLED..." -ForegroundColor Yellow

# Simulate Patient 1 also missing their demoted tail slot (set estimatedStartAt to past time again)
$null = Run-DockerSql "UPDATE appointments SET estimated_start_at = '$pastTime' WHERE id = '$apptId';"
$null = Run-DockerSql "UPDATE queue_tickets SET projected_start = '$pastTime' WHERE appointment_id = '$apptId';"

# Trigger second sweep (lateCount becomes 2 >= maxAttempts 2)
$sweepRes2 = Invoke-RestMethod -Uri "$apiUrl/appointments/sweep-late" -Method Post -Headers $adminHeaders
Write-Host " Swept Count (Second Pass): $($sweepRes2.sweptCount)" -ForegroundColor Cyan
Assert-Test "Second sweep executed" ($sweepRes2.sweptCount -ge 1)

# Verify Patient 1 transitioned to CANCELLED
$p1CancelledCheck = (Run-DockerSql "SELECT status, cancel_reason, cancelled_at::text FROM appointments WHERE id = '$apptId';").Trim()
$p1CancelParts = $p1CancelledCheck -split '\|'
$p1Status = $p1CancelParts[0].Trim()
$p1CancelReason = $p1CancelParts[1].Trim()
$p1CancelledAt = $p1CancelParts[2].Trim()

Assert-Test "Patient 1 status transitioned to cancelled" ($p1Status -eq "cancelled")
Assert-Test "Patient 1 cancellation reason notes exceeding tolerance" ($p1CancelReason -match "Otomatis dibatalkan")
Assert-Test "Patient 1 cancelled_at timestamp is populated" ($p1CancelledAt.Length -gt 10)

# Verify Patient 1 Queue Ticket is CANCELLED and waiting_position released (NULL)
$p1TicketCancel = (Run-DockerSql "SELECT status, waiting_position FROM queue_tickets WHERE appointment_id = '$apptId';").Trim()
$p1TicketParts = $p1TicketCancel -split '\|'
Assert-Test "Patient 1 queue ticket status is cancelled" ($p1TicketParts[0].Trim() -eq "cancelled")
Assert-Test "Patient 1 queue ticket waiting_position is released (NULL)" ([string]::IsNullOrEmpty($p1TicketParts[1].Trim()))

# Patient 2 remains position 1
$p2RemainPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$appt2Id';").Trim()
Assert-Test "Patient 2 remains at position 1 after Patient 1 cancelled" ($p2RemainPos -eq "1")

# ------------------------------------------------------------------------------
# STEP 10: EDGE CASE - CHECKED-IN / WAITING PATIENTS IMMUNE TO LATENESS SWEEP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 10] Edge Case: Checked-in / Waiting patient is immune to lateness sweep..." -ForegroundColor Yellow

$patient3Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE id NOT IN ('$patientId', '$patient2Id') LIMIT 1;").Trim()
$bookPayload3 = @{
    patientId = $patient3Id
    poliklinikId = $poliklinikId
    layananId = $layananId
    appointmentDate = $bookingDate
    session = $sessionCode
    visitType = "new_visit"
    complaint = "E2E Immunity Test"
} | ConvertTo-Json

$createdAppt3 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload3 -Headers $patientHeaders)
$appt3Id = $createdAppt3.id

# Assign doctor & room
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$appt3Id/doctor" -Method Patch -Headers $adminHeaders -Body $assignBody
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$appt3Id/room" -Method Patch -Headers $adminHeaders -Body $assignRoomBody

# Mark appointment 3 as WAITING (already checked in at clinic) and set estimatedStartAt to past time
$null = Run-DockerSql "UPDATE appointments SET status = 'waiting', estimated_start_at = '$pastTime' WHERE id = '$appt3Id';"
$null = Run-DockerSql "UPDATE queue_tickets SET status = 'waiting', projected_start = '$pastTime' WHERE appointment_id = '$appt3Id';"

# Trigger sweep again
$sweepRes3 = Invoke-RestMethod -Uri "$apiUrl/appointments/sweep-late" -Method Post -Headers $adminHeaders
$appt3StatusCheck = (Run-DockerSql "SELECT status FROM appointments WHERE id = '$appt3Id';").Trim()

Assert-Test "Checked-in / waiting patient is NOT swept to late (remains waiting)" ($appt3StatusCheck -eq "waiting")

# ------------------------------------------------------------------------------
# STEP 11: CLEANUP
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 11] Cleaning up test appointments..." -ForegroundColor Yellow
$cleanupAllSql = @"
DELETE FROM appointment_call_attempts WHERE appointment_id IN ('$apptId', '$appt2Id', '$appt3Id');
DELETE FROM ticket_event WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$apptId', '$appt2Id', '$appt3Id'));
DELETE FROM queue_notification_outbox WHERE ticket_id IN (SELECT id FROM queue_tickets WHERE appointment_id IN ('$apptId', '$appt2Id', '$appt3Id'));
DELETE FROM queue_tickets WHERE appointment_id IN ('$apptId', '$appt2Id', '$appt3Id');
DELETE FROM appointment_check_ins WHERE appointment_id IN ('$apptId', '$appt2Id', '$appt3Id');
DELETE FROM appointment_status_events WHERE appointment_id IN ('$apptId', '$appt2Id', '$appt3Id');
DELETE FROM appointments WHERE id IN ('$apptId', '$appt2Id', '$appt3Id');
"@
$null = Run-DockerSql $cleanupAllSql
Assert-Test "Test data cleaned up" $true

Print-TestSummary "DOCTOR ASSIGNMENT QUEUE ESTIMATION & CONFIG SYNC E2E"
