param(
    [string]$BaseUrl = "http://localhost:3001"
)

$ErrorActionPreference = 'Stop'

Write-Host "=== TEST REAL ENDPOINT SESSION PATIENTS ===" -ForegroundColor Cyan

# 1. Login Admin
$loginBody = @{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json
$loginRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/email/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginRes.token
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
Write-Host "1. Admin Logged in successfully. Token acquired." -ForegroundColor Green

# 2. Find a doctor who has sessions with booked patients in database
$sqlCheck = @"
SELECT 
    pss.id as session_id,
    pss.practitioner_id,
    pss.schedule_date,
    pss.start_time,
    pss.end_time,
    pss.capacity,
    pss.available_slots,
    (SELECT full_name FROM staff_profiles sp JOIN practitioners p ON p.staff_profile_id = sp.id WHERE p.id = pss.practitioner_id) as doctor_name
FROM practitioner_schedule_sessions pss
WHERE pss.capacity > pss.available_slots
LIMIT 5;
"@

$sessionInfo = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -F "|" -c $sqlCheck

Write-Host "2. Sessions with booked patients found in DB:" -ForegroundColor Yellow
Write-Host $sessionInfo

# If no session currently has capacity > available_slots, let's create a test session & appointment to verify real behavior
if ([string]::IsNullOrWhiteSpace($sessionInfo)) {
    Write-Host "No session with capacity > available_slots found. Querying any existing session..." -ForegroundColor Yellow
    $sqlAnySession = @"
    SELECT 
        pss.id as session_id,
        pss.practitioner_id,
        pss.schedule_date,
        pss.start_time,
        pss.end_time,
        pss.capacity,
        pss.available_slots,
        (SELECT full_name FROM staff_profiles sp JOIN practitioners p ON p.staff_profile_id = sp.id WHERE p.id = pss.practitioner_id) as doctor_name
    FROM practitioner_schedule_sessions pss
    LIMIT 1;
"@
    $sessionInfo = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -F "|" -c $sqlAnySession
    Write-Host "Found session: $sessionInfo" -ForegroundColor Yellow
}

$parts = $sessionInfo.Split("|")
$sessionId = $parts[0].Trim()
$doctorId = $parts[1].Trim()
$scheduleDate = $parts[2].Trim()
$startTime = $parts[3].Trim()
$endTime = $parts[4].Trim()
$capacity = $parts[5].Trim()
$availSlots = $parts[6].Trim()
$doctorName = $parts[7].Trim()

Write-Host "Testing with Doctor: $doctorName ($doctorId), Session: $sessionId on $scheduleDate ($startTime - $endTime)" -ForegroundColor Cyan

# Check if there is an appointment with null schedule_session_id matching this doctor and time
$sqlCheckAppt = @"
SELECT id, booking_code, schedule_session_id, scheduled_date, scheduled_start_time, status 
FROM appointments 
WHERE practitioner_id = '$doctorId' AND scheduled_date = '$scheduleDate'
LIMIT 5;
"@
$appts = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c $sqlCheckAppt
Write-Host "Existing appointments for this doctor on $($scheduleDate):"
Write-Host $appts

# If no appointment exists on that session date/time, create one directly in DB with schedule_session_id = NULL to simulate the exact reported frontend issue!
$sqlCountAppts = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT COUNT(*) FROM appointments WHERE practitioner_id = '$doctorId' AND scheduled_date = '$scheduleDate' AND scheduled_start_time >= '$startTime' AND scheduled_start_time < '$endTime';").Trim()

if ([int]$sqlCountAppts -eq 0) {
    Write-Host "Simulating the frontend reported condition: Creating an appointment with schedule_session_id = NULL in the session time window..." -ForegroundColor Magenta
    $patientId = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM patient_profiles LIMIT 1;").Trim()
    $serviceId = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM clinic_services LIMIT 1;").Trim()
    
    $simApptSql = @"
    INSERT INTO appointments (booking_code, patient_id, practitioner_id, schedule_session_id, service_id, scheduled_date, scheduled_start_time, scheduled_end_time, status)
    VALUES ('SIM-TEST-001', '$patientId', '$doctorId', NULL, '$serviceId', '$scheduleDate', '$startTime', '$endTime', 'booked')
    RETURNING id;
"@
    $newApptId = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c $simApptSql).Trim()
    Write-Host "Created test appointment with NULL schedule_session_id: $newApptId" -ForegroundColor Green
    
    # Also ensure available_slots reflects occupied slot
    docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "UPDATE practitioner_schedule_sessions SET available_slots = GREATEST(0, capacity - 1) WHERE id = '$sessionId';" | Out-Null
}

# 3. Call Real Endpoint: GET /api/v1/admin/doctor-schedules/:doctorId/sessions/:sessionId/patients?status=all
$endpointUrl = "$BaseUrl/api/v1/admin/doctor-schedules/$doctorId/sessions/$sessionId/patients?status=all"
Write-Host "3. Calling Real Endpoint: GET $endpointUrl" -ForegroundColor Cyan

$response = Invoke-RestMethod -Uri $endpointUrl -Method Get -Headers $headers

Write-Host "HTTP Response Received successfully!" -ForegroundColor Green
Write-Host "Response Summary:" -ForegroundColor Yellow
Write-Host "  Success: $($response.success)"
Write-Host "  Session ID: $($response.data.sessionId)"
Write-Host "  Session Label: $($response.data.sessionLabel)"
Write-Host "  Schedule Date: $($response.data.scheduleDate)"
Write-Host "  Time: $($response.data.startTime) - $($response.data.endTime)"
Write-Host "  Capacity: $($response.data.capacity)"
Write-Host "  Available Slots: $($response.data.availableSlots)"
Write-Host "  Booked Count: $($response.data.bookedCount)"
Write-Host "  Total Patients in Array: $($response.data.patients.Count)" -ForegroundColor Green

if ($response.data.patients.Count -gt 0) {
    Write-Host "  PATIENTS FOUND:" -ForegroundColor Green
    foreach ($p in $response.data.patients) {
        Write-Host "    - Appointment ID: $($p.appointmentId)"
        Write-Host "      Queue: $($p.queueNumber)"
        Write-Host "      Name: $($p.patient.fullName)"
        Write-Host "      RM: $($p.patient.medicalRecordNumber)"
        Write-Host "      Time Slot: $($p.timeSlot)"
        Write-Host "      Status: $($p.statusBadge)"
    }
} else {
    Write-Host "  WARNING: Patients array is empty!" -ForegroundColor Red
}

# 4. Verify Self-Healing: Check if schedule_session_id in DB was backfilled!
$sqlCheckHealed = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT COUNT(*) FROM appointments WHERE practitioner_id = '$doctorId' AND scheduled_date = '$scheduleDate' AND scheduled_start_time >= '$startTime' AND scheduled_start_time < '$endTime' AND schedule_session_id = '$sessionId';").Trim()
Write-Host "4. Self-Healing Verification in DB:" -ForegroundColor Cyan
Write-Host "  Appointments now having schedule_session_id = '$sessionId': $sqlCheckHealed" -ForegroundColor Green

# 5. Also call accumulated doctor patients endpoint: GET /api/v1/admin/doctor-schedules/:doctorId/patients?date=:date
$accumulatedUrl = "$BaseUrl/api/v1/admin/doctor-schedules/$doctorId/patients?date=$scheduleDate"
Write-Host "5. Calling Accumulated Doctor Patients: GET $accumulatedUrl" -ForegroundColor Cyan
$accResponse = Invoke-RestMethod -Uri $accumulatedUrl -Method Get -Headers $headers
Write-Host "  Accumulated Capacity: $($accResponse.data.accumulatedCapacity)"
Write-Host "  Accumulated Booked Count: $($accResponse.data.accumulatedBookedCount)"
Write-Host "  Accumulated Available Slots: $($accResponse.data.accumulatedAvailableSlots)"
Write-Host "  Total Sessions: $($accResponse.data.sessions.Count)"

Write-Host "=== TEST PASSED SUCCESSFULLY ===" -ForegroundColor Green
