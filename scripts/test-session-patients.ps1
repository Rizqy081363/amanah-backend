$ErrorActionPreference = "Stop"

Write-Host "=== 1. Login Admin ===" -ForegroundColor Cyan
$loginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/auth/email/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody

$token = $loginResponse.token
if (-not $token) {
    $token = $loginResponse.data.token
}
if (-not $token) {
    Write-Host "Login response payload:" ($loginResponse | ConvertTo-Json)
    throw "Failed to get access token from login response"
}
Write-Host "Login success. Token acquired." -ForegroundColor Green

$headers = @{
    "Authorization" = "Bearer $token"
}

Write-Host "`n=== 2. Test Doctor Schedule Detail ===" -ForegroundColor Cyan
$doctorId = "aa017308-8632-4870-aa9d-c4e83e294931"
$testDate = "2026-10-10"
$scheduleUrl = "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/$doctorId`?date=$testDate&month=2026-10"

$scheduleDetail = Invoke-RestMethod -Uri $scheduleUrl -Method Get -Headers $headers
Write-Host "Schedule detail fetched successfully: Status 200 OK" -ForegroundColor Green

$sessions = $scheduleDetail.data.sesi_harian
Write-Host "Total sesi_harian count: $($sessions.Count)" -ForegroundColor Yellow

if ($sessions.Count -eq 0) {
    Write-Host "No sessions found for date $testDate, checking all sesi_harian..." -ForegroundColor Yellow
} else {
    foreach ($s in $sessions) {
        Write-Host "Session: id=$($s.id) | label=$($s.session_label) | tanggal=$($s.tanggal) | shift=$($s.session_shift)" -ForegroundColor White
    }
}

$targetSession = $sessions[0]
if (-not $targetSession) {
    throw "No target session found to test patients endpoint"
}

Write-Host "`n=== 3. Test Session Patients (Pure UUID + Date query param) ===" -ForegroundColor Cyan
$sessionId = $targetSession.id
$patientsUrl = "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/$doctorId/sessions/$sessionId/patients?date=$testDate"
Write-Host "Requesting: $patientsUrl" -ForegroundColor White

$patientsResponse = Invoke-RestMethod -Uri $patientsUrl -Method Get -Headers $headers
Write-Host "Session Patients response: Status 200 OK" -ForegroundColor Green
Write-Host "Response Summary:" -ForegroundColor Yellow
Write-Host "  sessionId: $($patientsResponse.data.sessionId)"
Write-Host "  sessionLabel: $($patientsResponse.data.sessionLabel)"
Write-Host "  scheduleDate: $($patientsResponse.data.scheduleDate)"
Write-Host "  bookedCount: $($patientsResponse.data.bookedCount)"
Write-Host "  patients count: $($patientsResponse.data.patients.Count)"

Write-Host "`n=== 4. Test Backward Compatibility with legacy 'roster-' ID format ===" -ForegroundColor Cyan
$legacyRosterId = "roster-$sessionId-$testDate"
$legacyUrl = "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/$doctorId/sessions/$legacyRosterId/patients"
Write-Host "Requesting: $legacyUrl" -ForegroundColor White

$legacyResponse = Invoke-RestMethod -Uri $legacyUrl -Method Get -Headers $headers
Write-Host "Legacy Roster Session Patients response: Status 200 OK" -ForegroundColor Green
Write-Host "Legacy bookedCount: $($legacyResponse.data.bookedCount)" -ForegroundColor Green

Write-Host "`n=== ALL BACKEND TESTS PASSED SUCCESSFULLY! ===" -ForegroundColor Green
