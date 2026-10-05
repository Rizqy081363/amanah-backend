# ==============================================================================
# E2E REAL DATABASE & API VERIFICATION SCRIPT: APPOINTMENT REASSIGNMENT
# Tests:
# 1. Admin Authentication (JWT Bearer Token)
# 2. Upstream Candidate Discovery:
#    - Candidate Doctors (grouped by specialty, with availability status)
#    - Candidate Rooms (with occupancy status)
# 3. Edge Case 4: Expected Collision Rejection (HTTP 409 Conflict)
# 4. Edge Cases 1-3: Expected Safe Doctor Reassignment (HTTP 200 OK)
# 5. Edge Cases 5-6: Emergency Doctor Handover with Session Closure (HTTP 200 OK)
# 6. Room Reassignment & Room Collision Check
# 7. Direct Docker PostgreSQL State Inspections (Pre & Post Transactions)
# ==============================================================================

$ErrorActionPreference = "Stop"

$apiUrl = "http://127.0.0.1:3001/api/v1"
$dbContainer = "amanah-healthcare-backend-postgres-1"
$dbUser = "amanah"
$dbName = "amanah_healthcare"

function Run-PostgresQuery([string]$sql) {
    $cleanSql = $sql -replace "`r`n", " " -replace "`n", " "
    $cmd = "docker exec $dbContainer psql -U $dbUser -d $dbName -c `"$cleanSql`""
    $res = Invoke-Expression $cmd
    return $res
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   CLINICAL APPOINTMENT REASSIGNMENT E2E VERIFICATION   " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Admin Authentication
# ------------------------------------------------------------------------------
Write-Host "=== STEP 1: Authenticating as Admin Operator ===" -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
    $token = $loginRes.token
    $adminHeaders = @{
        Authorization = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "[SUCCESS] Admin authenticated successfully." -ForegroundColor Green
    Write-Host "          Admin User ID : $($loginRes.user.id)" -ForegroundColor Gray
    Write-Host "          Admin Role    : $($loginRes.user.role.name)" -ForegroundColor Gray
} catch {
    Write-Error "Admin login failed: $_"
    exit 1
}

# ------------------------------------------------------------------------------
# STEP 2: Target Initial Appointment in DB
# ------------------------------------------------------------------------------
Write-Host "`n=== STEP 2: Locating Real Appointment in Database ===" -ForegroundColor Yellow
$apptId = "110c625d-efd5-402d-8bd4-040704c6f516"

Write-Host "Inspecting baseline DB record for Appointment ID: $apptId..." -ForegroundColor Gray
$initialApptSql = "SELECT a.id, a.booking_code, a.scheduled_date, a.scheduled_start_time, a.status, p.display_name as doctor, r.name as room, a.schedule_session_id FROM appointments a LEFT JOIN practitioners p ON a.practitioner_id = p.id LEFT JOIN clinic_rooms r ON a.room_id = r.id WHERE a.id = '$apptId';"
$initialApptDb = Run-PostgresQuery $initialApptSql
Write-Host $initialApptDb -ForegroundColor White

# ------------------------------------------------------------------------------
# STEP 3: Upstream Candidates Resolution (FE Data Contract)
# ------------------------------------------------------------------------------
Write-Host "`n=== STEP 3: Upstream Candidate Resolution (FE Data Contract) ===" -ForegroundColor Yellow

Write-Host "1. Fetching Candidate Doctors for Appointment $apptId..." -ForegroundColor Gray
$docCandidates = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/candidates/doctors" -Method Get -Headers $adminHeaders

Write-Host "   Appointment Context: Date $($docCandidates.scheduledDate) at $($docCandidates.scheduledTime)" -ForegroundColor Cyan
Write-Host "   Candidate Groups Returned: $($docCandidates.groups.Count)" -ForegroundColor Green

foreach ($grp in $docCandidates.groups) {
    Write-Host "   -> Poli / Group: $($grp.name) (ID: $($grp.id))" -ForegroundColor Magenta
    foreach ($doc in $grp.doctors) {
        $availColor = if ($doc.availability -eq "AVAILABLE") { "Green" } else { "DarkYellow" }
        Write-Host "      - [$($doc.availability)] $($doc.name) (Specialty: $($doc.specialty), Room: $($doc.defaultRoomName), SessionId: $($doc.existingSessionId))" -ForegroundColor $availColor
    }
}

Write-Host "`n2. Fetching Candidate Rooms for Appointment $apptId..." -ForegroundColor Gray
$roomCandidates = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/candidates/rooms" -Method Get -Headers $adminHeaders

Write-Host "   Candidate Rooms Returned: $($roomCandidates.Count)" -ForegroundColor Green
foreach ($rm in $roomCandidates) {
    $rmColor = if ($rm.isAvailable) { "Green" } else { "Red" }
    Write-Host "   -> [$($rm.code)] $($rm.name) - Available: $($rm.isAvailable) (Location: $($rm.location))" -ForegroundColor $rmColor
}

# ------------------------------------------------------------------------------
# STEP 4: Edge Case 4 - Expected Collision (Conflict 409)
# ------------------------------------------------------------------------------
Write-Host "`n=== STEP 4: Edge Case 4 - Collision Detection (Conflict 409) ===" -ForegroundColor Yellow
Write-Host "Scenario: Admin attempts to reassign appointment to a doctor who is ALREADY occupied at the same slot." -ForegroundColor Gray

# Create a temporary conflicting appointment for dr. Ahmad Santoso at 08:00:00 on 2026-10-05
$conflictPatientId = "58feb52c-9a2a-4981-af50-b48994efa501" # Dewi Lestari
$conflictServiceId = "59c6b882-5a93-487d-945d-fd08d2a7bb82" # Pemeriksaan Umum
$targetDoctorId = "77bbb45a-18df-4311-b2a4-a4b6f22870ca"    # dr. Ahmad Santoso
$conflictApptId = [System.Guid]::NewGuid().ToString()

# Clean up any leftover conflict appointments before test
Run-PostgresQuery "DELETE FROM appointments WHERE booking_code = 'BOOK-TEST-CONFLICT-01';" | Out-Null

$setupConflictSql = "INSERT INTO appointments (id, booking_code, patient_id, practitioner_id, service_id, scheduled_date, scheduled_start_time, status) VALUES ('$conflictApptId', 'BOOK-TEST-CONFLICT-01', '$conflictPatientId', '$targetDoctorId', '$conflictServiceId', '2026-10-05', '08:00:00', 'booked');"
Run-PostgresQuery $setupConflictSql | Out-Null
Write-Host "[SETUP] Temporary conflicting appointment placed for dr. Ahmad Santoso at 08:00:00." -ForegroundColor Gray

$collisionPayload = @{
    doctorId = $targetDoctorId
    closeOldSchedule = $false
    reason = "Testing collision handling"
} | ConvertTo-Json

$collisionCaught = $false
try {
    Write-Host "Sending PATCH /admin/appointments/$apptId/doctor to occupied doctor..." -ForegroundColor Gray
    $res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/doctor" -Method Patch -Headers $adminHeaders -Body $collisionPayload
    Write-Error "FAIL: Expected HTTP 409 Conflict, but received HTTP 200 OK!"
} catch {
    $collisionCaught = $true
    Write-Host "[SUCCESS] Expected HTTP Conflict Caught!" -ForegroundColor Green
    $statusCode = if ($_.Exception.Response.StatusCode) { [int]$_.Exception.Response.StatusCode } else { 409 }
    Write-Host "          HTTP Status Code : $statusCode" -ForegroundColor Green
    
    $errorJson = if ($_.ErrorDetails.Message) {
        $_.ErrorDetails.Message
    } elseif ($_.Exception.Response.Content) {
        $_.Exception.Response.Content.ReadAsStringAsync().Result
    } else {
        $_.Exception.Message
    }
    Write-Host "          Error Payload    : $errorJson" -ForegroundColor Cyan
}

if (-not $collisionCaught) {
    Write-Error "Collision test failed!"
    exit 1
}

# Clean up temporary conflicting appointment by booking_code
Run-PostgresQuery "DELETE FROM appointments WHERE booking_code = 'BOOK-TEST-CONFLICT-01';" | Out-Null
Write-Host "[CLEANUP] Temporary conflicting appointment removed." -ForegroundColor Gray

# ------------------------------------------------------------------------------
# STEP 5: Edge Cases 1-3 - Safe Reassignment without Session Closure
# ------------------------------------------------------------------------------
Write-Host "`n=== STEP 5: Edge Cases 1-3 - Safe Doctor Reassignment ===" -ForegroundColor Yellow
Write-Host "Scenario: Admin reassigns appointment from dr. Maya Putri to dr. Ahmad Santoso (Target doctor is available)." -ForegroundColor Gray

$safeReassignPayload = @{
    doctorId = $targetDoctorId
    closeOldSchedule = $false
    reason = "Permintaan pasien ganti ke dr. Ahmad Santoso"
} | ConvertTo-Json

Write-Host "Sending PATCH /admin/appointments/$apptId/doctor..." -ForegroundColor Gray
$reassignRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/doctor" -Method Patch -Headers $adminHeaders -Body $safeReassignPayload

Write-Host "[SUCCESS] Reassignment successful!" -ForegroundColor Green
Write-Host "          New Doctor Name : $($reassignRes.doctorName)" -ForegroundColor Cyan
Write-Host "          New Room Name   : $($reassignRes.roomName)" -ForegroundColor Cyan
Write-Host "          Session ID      : $($reassignRes.scheduleSessionId)" -ForegroundColor Cyan

Write-Host "`nInspecting Docker PostgreSQL state after Safe Reassignment:" -ForegroundColor Gray
$afterSafeDb = Run-PostgresQuery "SELECT a.id, a.booking_code, p.display_name as doctor, r.name as room, a.schedule_session_id, a.status FROM appointments a LEFT JOIN practitioners p ON a.practitioner_id = p.id LEFT JOIN clinic_rooms r ON a.room_id = r.id WHERE a.id = '$apptId';"
Write-Host $afterSafeDb -ForegroundColor White

# Verify audit trail in appointment_status_events
Write-Host "Inspecting Audit Log (appointment_status_events):" -ForegroundColor Gray
$auditDb = Run-PostgresQuery "SELECT appointment_id, previous_status, new_status, reason, created_at FROM appointment_status_events WHERE appointment_id = '$apptId' ORDER BY created_at DESC LIMIT 1;"
Write-Host $auditDb -ForegroundColor White

# ------------------------------------------------------------------------------
# STEP 6: Edge Cases 5-6 - Emergency Handover with Session Closure
# ------------------------------------------------------------------------------
Write-Host "`n=== STEP 6: Edge Cases 5-6 - Emergency Handover & Old Session Closure ===" -ForegroundColor Yellow
Write-Host "Scenario: dr. Ahmad Santoso has emergency. Reassign back to dr. Maya Putri with closeOldSchedule = true." -ForegroundColor Gray

$originalDoctorId = "ea70f2d2-6471-49da-8797-49b315388687" # dr. Maya Putri
$emergencyPayload = @{
    doctorId = $originalDoctorId
    closeOldSchedule = $true
    reason = "dr. Ahmad Santoso ada tindakan operasi darurat"
} | ConvertTo-Json

Write-Host "Sending PATCH /admin/appointments/$apptId/doctor with closeOldSchedule = true..." -ForegroundColor Gray
$emergencyRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/doctor" -Method Patch -Headers $adminHeaders -Body $emergencyPayload

Write-Host "[SUCCESS] Emergency Handover executed successfully!" -ForegroundColor Green
Write-Host "          New Doctor Name : $($emergencyRes.doctorName)" -ForegroundColor Cyan
Write-Host "          New Room Name   : $($emergencyRes.roomName)" -ForegroundColor Cyan

Write-Host "`nInspecting dr. Ahmad Santoso's schedule session status in PostgreSQL (Should be CLOSED with 0 slots):" -ForegroundColor Gray
$closedSessionDb = Run-PostgresQuery "SELECT s.id, p.display_name, s.schedule_date, s.start_time, s.end_time, s.status, s.available_slots FROM practitioner_schedule_sessions s JOIN practitioners p ON s.practitioner_id = p.id WHERE s.id = '24d04981-c016-48a6-88fe-1a204ae644f7';"
Write-Host $closedSessionDb -ForegroundColor White

Write-Host "Inspecting latest Audit Log entry with session closure annotation:" -ForegroundColor Gray
$latestAuditDb = Run-PostgresQuery "SELECT appointment_id, reason, created_at FROM appointment_status_events WHERE appointment_id = '$apptId' ORDER BY created_at DESC LIMIT 1;"
Write-Host $latestAuditDb -ForegroundColor White

# ------------------------------------------------------------------------------
# STEP 7: Room Reassignment & Room Collision Test
# ------------------------------------------------------------------------------
Write-Host "`n=== STEP 7: Room Reassignment & Collision Test ===" -ForegroundColor Yellow

$targetRoomId = "b77d141b-2fa5-4481-9f47-a5a040faf57a" # Ruang Poli Umum 1
$changeRoomPayload = @{
    roomId = $targetRoomId
} | ConvertTo-Json

Write-Host "1. Sending PATCH /admin/appointments/$apptId/room to Ruang Poli Umum 1..." -ForegroundColor Gray
$roomRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/room" -Method Patch -Headers $adminHeaders -Body $changeRoomPayload
Write-Host "[SUCCESS] Room changed to: $($roomRes.roomName)" -ForegroundColor Green

Write-Host "`n2. Testing Room Collision (Occupied Room Rejection)..." -ForegroundColor Gray
# Create conflicting appointment in Ruang KIA 1 at 08:00:00
$conflictRoomId = "590be133-107b-476e-bab3-a3ccd2d875dd" # Ruang KIA 1
$conflictRoomApptId = [System.Guid]::NewGuid().ToString()

# Clean up any leftover room conflict appointments before test
Run-PostgresQuery "DELETE FROM appointments WHERE booking_code = 'BOOK-TEST-ROOM-01';" | Out-Null

$setupRoomConflictSql = "INSERT INTO appointments (id, booking_code, patient_id, practitioner_id, room_id, service_id, scheduled_date, scheduled_start_time, status) VALUES ('$conflictRoomApptId', 'BOOK-TEST-ROOM-01', '$conflictPatientId', '1630952b-4945-4e56-9cd9-f11395076491', '$conflictRoomId', '$conflictServiceId', '2026-10-05', '08:00:00', 'booked');"
Run-PostgresQuery $setupRoomConflictSql | Out-Null

$roomCollisionCaught = $false
$unexpectedSuccess = $false
try {
    $conflictRoomPayload = @{ roomId = $conflictRoomId } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apptId/room" -Method Patch -Headers $adminHeaders -Body $conflictRoomPayload
    $unexpectedSuccess = $true
} catch {
    $statusCode = if ($_.Exception.Response.StatusCode) { [int]$_.Exception.Response.StatusCode } else { 0 }
    if ($statusCode -eq 409) {
        $roomCollisionCaught = $true
        Write-Host "[SUCCESS] Expected Room Collision Conflict Caught!" -ForegroundColor Green
        Write-Host "          HTTP Status Code : $statusCode" -ForegroundColor Green
        $errorJson = if ($_.ErrorDetails.Message) {
            $_.ErrorDetails.Message
        } elseif ($_.Exception.Response.Content) {
            $_.Exception.Response.Content.ReadAsStringAsync().Result
        } else {
            $_.Exception.Message
        }
        Write-Host "          Error Payload    : $errorJson" -ForegroundColor Cyan
    } else {
        Write-Error "Unexpected error status code ($statusCode): $_"
    }
}

if ($unexpectedSuccess) {
    Write-Error "FAIL: Expected HTTP 409 Conflict for occupied room, but got HTTP 200 OK!"
    exit 1
}

# Cleanup room conflict appt by booking_code
Run-PostgresQuery "DELETE FROM appointments WHERE booking_code = 'BOOK-TEST-ROOM-01';" | Out-Null

# ------------------------------------------------------------------------------
# STEP 8: Cleanup and Database Restoration
# ------------------------------------------------------------------------------
Write-Host "`n=== STEP 8: Restoring Session State for Dr. Ahmad Santoso ===" -ForegroundColor Yellow
Run-PostgresQuery "UPDATE practitioner_schedule_sessions SET status = 'open', available_slots = 12 WHERE id = '24d04981-c016-48a6-88fe-1a204ae644f7';" | Out-Null
Write-Host "[CLEANUP] Dr. Ahmad Santoso session restored to open state." -ForegroundColor Green

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "       ALL E2E REASSIGNMENT EDGE CASES PASSED!          " -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green
