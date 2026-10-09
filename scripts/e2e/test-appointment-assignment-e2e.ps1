$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

$apiBaseUrl = Get-E2EApiBaseUrl
$adminEmail = Get-ConfigValue "ADMIN_EMAIL" "admin@amanah.com"
$adminPassword = Get-ConfigValue "ADMIN_PASSWORD" "secret123"

$loginPayload = @{
    email = $adminEmail
    password = $adminPassword
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$apiBaseUrl/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$token = $loginRes.token
if (-not $token) {
    throw "Failed to acquire admin token"
}

$headers = @{
    Authorization = "Bearer $token"
    ContentType = "application/json"
}

$targetAptId = "49cddd56-76d2-4e0d-90ca-0a4164a05bf3"

function Query-Database([string]$query) {
    $res = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -F "|" -c $query
    return $res.Trim()
}

$doctorCandidatesRes = Invoke-RestMethod -Uri "$apiBaseUrl/admin/appointments/$targetAptId/candidates/doctors" -Method Get -Headers $headers
if (-not $doctorCandidatesRes.groups -or $doctorCandidatesRes.groups.Count -eq 0) {
    throw "No doctor candidate groups found"
}

$firstGroup = $doctorCandidatesRes.groups[0]
if (-not $firstGroup.doctors -or $firstGroup.doctors.Count -eq 0) {
    throw "No doctors available in candidate group"
}

$firstDoctor = $firstGroup.doctors[0]
$firstDoctorId = $firstDoctor.id

$assignDocBody = @{
    doctorId = $firstDoctorId
} | ConvertTo-Json

$assignDocRes = Invoke-RestMethod -Uri "$apiBaseUrl/admin/appointments/$targetAptId/doctor" -Method Patch -Headers $headers -Body $assignDocBody -ContentType "application/json"
if ($assignDocRes.data.doctorName -eq $null -and $assignDocRes.data.practitionerId -ne $firstDoctorId) {
    throw "Doctor assignment response did not match expected doctor"
}

$dbDocCheck = Query-Database "SELECT practitioner_id FROM appointments WHERE id = '$targetAptId';"
if ($dbDocCheck -ne $firstDoctorId) {
    throw "DB assertion failed: appointments.practitioner_id is $dbDocCheck, expected $firstDoctorId"
}

$dbQueueDocCheck = Query-Database "SELECT doctor_id FROM queue_tickets WHERE appointment_id = '$targetAptId';"
if ($dbQueueDocCheck -ne $firstDoctorId) {
    throw "DB assertion failed: queue_tickets.doctor_id is $dbQueueDocCheck, expected $firstDoctorId"
}

$docCandidatesAfterAssign = Invoke-RestMethod -Uri "$apiBaseUrl/admin/appointments/$targetAptId/candidates/doctors" -Method Get -Headers $headers
$secondDoctor = $null
foreach ($grp in $docCandidatesAfterAssign.groups) {
    foreach ($doc in $grp.doctors) {
        if ($doc.id -ne $firstDoctorId) {
            $secondDoctor = $doc
            break
        }
    }
    if ($secondDoctor) { break }
}

if (-not $secondDoctor) {
    throw "Could not find a second doctor candidate to test reassignment"
}

$secondDoctorId = $secondDoctor.id

$changeDocBody = @{
    doctorId = $secondDoctorId
    reason = "Reassigned via automated e2e test"
} | ConvertTo-Json

$changeDocRes = Invoke-RestMethod -Uri "$apiBaseUrl/admin/appointments/$targetAptId/doctor" -Method Patch -Headers $headers -Body $changeDocBody -ContentType "application/json"

$dbDocChangeCheck = Query-Database "SELECT practitioner_id FROM appointments WHERE id = '$targetAptId';"
if ($dbDocChangeCheck -ne $secondDoctorId) {
    throw "DB assertion failed: appointments.practitioner_id is $dbDocChangeCheck, expected $secondDoctorId"
}

$dbQueueDocChangeCheck = Query-Database "SELECT doctor_id FROM queue_tickets WHERE appointment_id = '$targetAptId';"
if ($dbQueueDocChangeCheck -ne $secondDoctorId) {
    throw "DB assertion failed: queue_tickets.doctor_id is $dbQueueDocChangeCheck, expected $secondDoctorId"
}

$roomCandidatesRes = Invoke-RestMethod -Uri "$apiBaseUrl/admin/appointments/$targetAptId/candidates/rooms" -Method Get -Headers $headers
$availableRooms = @($roomCandidatesRes | Where-Object { $_.isAvailable -eq $true })
if ($availableRooms.Count -lt 2) {
    throw "Need at least 2 available rooms to test assign and change room, found $($availableRooms.Count)"
}

$firstRoom = $availableRooms[0]
$secondRoom = $availableRooms[1]

$assignRoomBody = @{
    roomId = $firstRoom.id
} | ConvertTo-Json

$assignRoomRes = Invoke-RestMethod -Uri "$apiBaseUrl/admin/appointments/$targetAptId/room" -Method Patch -Headers $headers -Body $assignRoomBody -ContentType "application/json"

$dbRoomCheck = Query-Database "SELECT room_id FROM appointments WHERE id = '$targetAptId';"
if ($dbRoomCheck -ne $firstRoom.id) {
    throw "DB assertion failed: appointments.room_id is $dbRoomCheck, expected $($firstRoom.id)"
}

$dbQueueRoomCheck = Query-Database "SELECT room_id FROM queue_tickets WHERE appointment_id = '$targetAptId';"
if ($dbQueueRoomCheck -ne $firstRoom.id) {
    throw "DB assertion failed: queue_tickets.room_id is $dbQueueRoomCheck, expected $($firstRoom.id)"
}

$changeRoomBody = @{
    roomId = $secondRoom.id
} | ConvertTo-Json

$changeRoomRes = Invoke-RestMethod -Uri "$apiBaseUrl/admin/appointments/$targetAptId/room" -Method Patch -Headers $headers -Body $changeRoomBody -ContentType "application/json"

$dbRoomChangeCheck = Query-Database "SELECT room_id FROM appointments WHERE id = '$targetAptId';"
if ($dbRoomChangeCheck -ne $secondRoom.id) {
    throw "DB assertion failed: appointments.room_id is $dbRoomChangeCheck, expected $($secondRoom.id)"
}

$dbQueueRoomChangeCheck = Query-Database "SELECT room_id FROM queue_tickets WHERE appointment_id = '$targetAptId';"
if ($dbQueueRoomChangeCheck -ne $secondRoom.id) {
    throw "DB assertion failed: queue_tickets.room_id is $dbQueueRoomChangeCheck, expected $($secondRoom.id)"
}

$finalDbState = Query-Database "SELECT practitioner_id, room_id, queue_number FROM appointments WHERE id = '$targetAptId';"
$finalQueueState = Query-Database "SELECT doctor_id, room_id, queue_number FROM queue_tickets WHERE appointment_id = '$targetAptId';"

Write-Host "=========================================================="
Write-Host "ALL APPOINTMENT ASSIGNMENT SCENARIOS PASSED SUCCESSFULLY"
Write-Host "Appointments table DB state: $finalDbState"
Write-Host "Queue tickets table DB state: $finalQueueState"
Write-Host "=========================================================="
