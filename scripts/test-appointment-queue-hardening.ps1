$ErrorActionPreference = "Stop"

$apiUrl = "http://127.0.0.1:3001/api/v1"
$dbContainer = "backend-postgres-1"
$dbUser = "amanah"
$dbName = "amanah_healthcare"

function Run-Sql([string]$sql) {
    $cleanSql = $sql -replace "`r`n", " " -replace "`n", " "
    $cmd = "docker exec -i $dbContainer psql -U $dbUser -d $dbName -t -A -c `"$cleanSql`""
    $res = Invoke-Expression $cmd
    return $res
}

Write-Host "Authenticating as Admin..."
$loginPayload = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$token = $loginRes.token
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
Write-Host "Admin authenticated successfully."

$targetAptId = "0ab28581-fd98-43d2-af70-2963ac65978c"
Run-Sql "UPDATE appointments SET status = 'waiting', actual_started_at = NULL, actual_completed_at = NULL, last_called_at = NULL WHERE id = '$targetAptId';"

Write-Host "TEST 1: Call Patient (E4 - Repeated Operational Action)"
for ($i = 1; $i -le 4; $i++) {
    $callRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetAptId/call" -Method Post -Headers $headers -Body (@{ notes = "Call attempt $i" } | ConvertTo-Json)
    $lastCalled = Run-Sql "SELECT last_called_at FROM appointments WHERE id = '$targetAptId';"
    if ([string]::IsNullOrWhiteSpace($lastCalled)) {
        throw "Assertion failed: last_called_at was not updated on call $i"
    }
    $currentStatus = Run-Sql "SELECT status FROM appointments WHERE id = '$targetAptId';"
    if ($currentStatus.Trim() -ne "waiting") {
        throw "Assertion failed: status mutated during call $i to $currentStatus"
    }
    Write-Host "Call attempt $i succeeded. Status remains waiting, last_called_at recorded."
}

Write-Host "TEST 2: Call Non-Callable Patient (E5 - Completed Status)"
$completedAptId = "659bd136-629f-413a-84f3-22c42e818d43"
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/$completedAptId/call" -Method Post -Headers $headers -Body (@{ notes = "Invalid call" } | ConvertTo-Json)
    throw "Assertion failed: Expected 400 Bad Request when calling completed appointment"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -ne 400) {
        throw "Expected status 400, got $statusCode"
    }
    Write-Host "Call on completed appointment rejected with HTTP 400 Bad Request."
}

Write-Host "TEST 3: Start Service (WAITING -> IN_SERVICE)"
$startRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetAptId/start" -Method Post -Headers $headers
$startedStatus = Run-Sql "SELECT status FROM appointments WHERE id = '$targetAptId';"
$startedAt = Run-Sql "SELECT actual_started_at FROM appointments WHERE id = '$targetAptId';"
if ($startedStatus.Trim() -ne "in_service" -or [string]::IsNullOrWhiteSpace($startedAt)) {
    throw "Assertion failed: Appointment did not transition to in_service or actual_started_at is null"
}
Write-Host "Start service succeeded. Status: in_service, actual_started_at recorded."

Write-Host "TEST 4: Stale Status Conflict on Start (E2 - 409 Conflict)"
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/$targetAptId/start" -Method Post -Headers $headers
    throw "Assertion failed: Expected 409 Conflict when starting already in_service appointment"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -ne 409) {
        throw "Expected status 409, got $statusCode"
    }
    Write-Host "Duplicate start service rejected with HTTP 409 Conflict."
}

Write-Host "TEST 5: Complete Service (IN_SERVICE -> COMPLETED)"
$completeRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetAptId/complete" -Method Post -Headers $headers
$completedStatus = Run-Sql "SELECT status FROM appointments WHERE id = '$targetAptId';"
$completedAt = Run-Sql "SELECT actual_completed_at FROM appointments WHERE id = '$targetAptId';"
if ($completedStatus.Trim() -ne "completed" -or [string]::IsNullOrWhiteSpace($completedAt)) {
    throw "Assertion failed: Appointment did not transition to completed or actual_completed_at is null"
}
Write-Host "Complete service succeeded. Status: completed, actual_completed_at recorded."

Write-Host "TEST 6: Stale Status Conflict on Complete (E3 - 409 Conflict)"
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/$targetAptId/complete" -Method Post -Headers $headers
    throw "Assertion failed: Expected 409 Conflict when completing already completed appointment"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -ne 409) {
        throw "Expected status 409, got $statusCode"
    }
    Write-Host "Duplicate complete service rejected with HTTP 409 Conflict."
}

Write-Host "TEST 7: Cancel Appointment (WAITING -> CANCELLED)"
$cancelTargetId = "801a47a1-e3e8-454e-b920-d926f4a66a1d"
Run-Sql "UPDATE appointments SET status = 'waiting', cancelled_at = NULL, cancel_reason = NULL WHERE id = '$cancelTargetId';"
$cancelRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$cancelTargetId/cancel" -Method Post -Headers $headers -Body (@{ reason = "Patient cancelled" } | ConvertTo-Json)
$cancelledStatus = Run-Sql "SELECT status FROM appointments WHERE id = '$cancelTargetId';"
$cancelledAt = Run-Sql "SELECT cancelled_at FROM appointments WHERE id = '$cancelTargetId';"
if ($cancelledStatus.Trim() -ne "cancelled" -or [string]::IsNullOrWhiteSpace($cancelledAt)) {
    throw "Assertion failed: Appointment did not transition to cancelled"
}
Write-Host "Cancel succeeded. Status: cancelled, cancelled_at recorded."

try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/$cancelTargetId/cancel" -Method Post -Headers $headers
    throw "Assertion failed: Expected 409 Conflict when cancelling already cancelled appointment"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -ne 409) {
        throw "Expected status 409, got $statusCode"
    }
    Write-Host "Duplicate cancel rejected with HTTP 409 Conflict."
}

Write-Host "TEST 8: Lateness Sweep (E7, E8, E9)"
$sweepOverdueId = [guid]::NewGuid().ToString()
$sweepFreshId = [guid]::NewGuid().ToString()
$pracId = Run-Sql "SELECT id FROM practitioners LIMIT 1;"
$patientId = Run-Sql "SELECT id FROM patient_profiles LIMIT 1;"
$serviceId = Run-Sql "SELECT id FROM clinic_services LIMIT 1;"

$past25h = (Get-Date).AddHours(-25).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss+00")
$past23h = (Get-Date).AddHours(-23).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss+00")

Run-Sql "INSERT INTO appointments (id, booking_code, patient_id, practitioner_id, service_id, scheduled_date, scheduled_start_time, queue_number, status, estimated_start_at, estimated_end_at) VALUES ('$sweepOverdueId', 'SWEEP-OVERDUE', '$patientId', '$pracId', '$serviceId', '2026-10-05', '08:00:00', 98, 'waiting', '$past25h', '$past25h');"
Run-Sql "INSERT INTO appointments (id, booking_code, patient_id, practitioner_id, service_id, scheduled_date, scheduled_start_time, queue_number, status, estimated_start_at, estimated_end_at) VALUES ('$sweepFreshId', 'SWEEP-FRESH', '$patientId', '$pracId', '$serviceId', '2026-10-05', '10:00:00', 99, 'waiting', '$past23h', '$past23h');"

$sweepRes1 = Invoke-RestMethod -Uri "$apiUrl/appointments/sweep-late" -Method Post -Headers $headers
$overdueStatus = Run-Sql "SELECT status FROM appointments WHERE id = '$sweepOverdueId';"
$freshStatus = Run-Sql "SELECT status FROM appointments WHERE id = '$sweepFreshId';"

if ($overdueStatus.Trim() -ne "late") {
    throw "Assertion failed: 25h overdue appointment was not marked late. Status: $overdueStatus"
}
if ($freshStatus.Trim() -ne "waiting") {
    throw "Assertion failed: 23h appointment should remain waiting. Status: $freshStatus"
}
Write-Host "First sweep succeeded. 25h overdue appointment marked 'late'. 23h appointment remains 'waiting'."

$sweepRes2 = Invoke-RestMethod -Uri "$apiUrl/appointments/sweep-late" -Method Post -Headers $headers
if ($sweepRes2.sweptCount -ne 0) {
    throw "Assertion failed: Second sweep should be idempotent and sweep 0 rows. Swept: $($sweepRes2.sweptCount)"
}
Write-Host "Second sweep succeeded. Idempotent: 0 rows swept."

Run-Sql "DELETE FROM appointments WHERE id IN ('$sweepOverdueId', '$sweepFreshId');"
Run-Sql "UPDATE appointments SET status = 'waiting', actual_started_at = NULL, actual_completed_at = NULL WHERE id = '$targetAptId';"
Run-Sql "UPDATE appointments SET status = 'waiting', cancelled_at = NULL, cancel_reason = NULL WHERE id = '$cancelTargetId';"

Write-Host "`nALL 8 REALTIME OPERATIONAL AND EDGE-CASE TESTS PASSED PERFECTLY!"
