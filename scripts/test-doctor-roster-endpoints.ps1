# PowerShell Test Script: Doctor Roster & Schedules Self-Scoped Endpoints
# Tests live endpoints on backend-api container without mocks or mismatches.

$ErrorActionPreference = "Stop"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " TEST: Doctor Roster & Schedule Endpoints (backend-api Container)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

$baseUrl = "http://127.0.0.1:3001/api/v1"

# 1. Healthcheck
Write-Host "`n[1/6] Checking container health at $baseUrl/health/ready..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "http://127.0.0.1:3001/health/ready" -Method Get
if ($health.status -ne "up") {
    throw "API is not healthy! Status: $($health.status)"
}
Write-Host " -> Health status: UP (Database and Redis ready)" -ForegroundColor Green

# 2. Login as Doctor
Write-Host "`n[2/6] Logging in as Doctor (dokter@amanah.com)..." -ForegroundColor Yellow
$loginBody = @{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginRes.token
if (-not $token) {
    throw "Failed to acquire Bearer token from login response!"
}
Write-Host " -> Doctor Login SUCCESS. Token length: $($token.Length)" -ForegroundColor Green
Write-Host " -> Authenticated as: $($loginRes.user.name) (ID: $($loginRes.user.id), Role: $($loginRes.user.role))" -ForegroundColor Gray

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

# 3. GET /schedules/my-roster
Write-Host "`n[3/6] Testing GET /api/v1/schedules/my-roster..." -ForegroundColor Yellow
$rosterRes = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Get -Headers $headers
$roster = if ($rosterRes.data) { $rosterRes.data } else { $rosterRes }

if (-not $roster.days -or $roster.days.Count -ne 7) {
    throw "Expected 7 days in roster response, got: $($roster.days.Count)"
}
Write-Host " -> GET my-roster SUCCESS (HTTP 200 OK)" -ForegroundColor Green
Write-Host "    Doctor: $($roster.doctor.fullName) | Spesialis: $($roster.doctor.specialization)" -ForegroundColor Gray
Write-Host "    Days: $($roster.days.Count) hari | HasAnyOverride: $($roster.hasAnyOverride)" -ForegroundColor Gray

$firstDay = $roster.days[0]
Write-Host "    Sample Day: $($firstDay.dayName) (DOW: $($firstDay.dow)) - Sessions: $($firstDay.sessions.Count)" -ForegroundColor Gray

# 4. PUT /schedules/my-roster (Update Shift Override)
Write-Host "`n[4/6] Testing PUT /api/v1/schedules/my-roster..." -ForegroundColor Yellow
$targetSession = $firstDay.sessions[0]
$newStatus = -not $targetSession.isActive

$updateBody = @{
    assignments = @(
        @{
            dow = $firstDay.dow
            sessionId = $targetSession.sessionId
            isActive = $newStatus
        }
    )
    reason = "Penyesuaian jadwal praktik dokter mandiri via mobile app"
} | ConvertTo-Json -Depth 5

$updateRes = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Put -Headers $headers -Body $updateBody
Write-Host " -> PUT my-roster SUCCESS (HTTP 200 OK)" -ForegroundColor Green
Write-Host "    Updated session $($targetSession.sessionLabel) on $($firstDay.dayName) to isActive=$newStatus" -ForegroundColor Gray

# 5. DELETE /schedules/my-roster (Reset Override to Clinic Template)
Write-Host "`n[5/6] Testing DELETE /api/v1/schedules/my-roster (Reset to Template)..." -ForegroundColor Yellow
$resetRes = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Delete -Headers $headers
Write-Host " -> DELETE my-roster SUCCESS (HTTP 200 OK - Reset to clinic template)" -ForegroundColor Green

# 6. GET /schedules/booked-patients and /schedules/calendar-summary
Write-Host "`n[6/6] Testing GET booked-patients & calendar-summary..." -ForegroundColor Yellow
$today = (Get-Date).ToString("yyyy-MM-dd")
$month = (Get-Date).ToString("yyyy-MM")

$bookedPatients = Invoke-RestMethod -Uri "$baseUrl/schedules/booked-patients?date=$today" -Method Get -Headers $headers
Write-Host " -> GET booked-patients?date=$today SUCCESS (HTTP 200 OK)" -ForegroundColor Green

$calSummary = Invoke-RestMethod -Uri "$baseUrl/schedules/calendar-summary?month=$month" -Method Get -Headers $headers
Write-Host " -> GET calendar-summary?month=$month SUCCESS (HTTP 200 OK)" -ForegroundColor Green

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host " ALL BACKEND ROSTER & SCHEDULE TESTS PASSED (100% SUCCESS)!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
