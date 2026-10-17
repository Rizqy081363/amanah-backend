# Verification Script: Doctor Roster Explicit Persistence & Zero-Active Sessions Bug Test

$ErrorActionPreference = "Stop"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " TEST: Explicit Roster Persistence (Zero-Active & Override States)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

$baseUrl = "http://127.0.0.1:3001/api/v1"

# 1. Login as doctor
$loginRes = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body (@{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"

$token = $loginRes.token
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "Logged in as Doctor: $($loginRes.user.name)" -ForegroundColor Green

# 2. GET current roster
$roster = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Get -Headers $headers
Write-Host "Initial Roster - HasAnyOverride: $($roster.hasAnyOverride)" -ForegroundColor Yellow

# 3. TEST CASE A: Turn OFF ALL 28 sessions (The Exact Bug Scenario)
Write-Host "`n--> [TEST A] Setting ALL 28 sessions to isActive: false..." -ForegroundColor Cyan

$allOffAssignments = @()
foreach ($d in $roster.days) {
    foreach ($s in $d.sessions) {
        $allOffAssignments += @{
            dow = $d.dow
            sessionId = $s.sessionId
            isActive = $false
        }
    }
}

$putBodyA = @{
    assignments = $allOffAssignments
    reason = "Dokter meliburkan seluruh sesi praktik minggu ini (all sessions OFF)"
} | ConvertTo-Json -Depth 5

$putResA = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Put -Headers $headers -Body $putBodyA

if ($putResA.hasAnyOverride -ne $true) {
    throw "FAIL: Expected hasAnyOverride to be true when doctor explicitly configured roster, got: $($putResA.hasAnyOverride)"
}

$activeCountA = ($putResA.days | ForEach-Object { $_.sessions } | Where-Object { $_.isActive -eq $true } | Measure-Object).Count
if ($activeCountA -ne 0) {
    throw "FAIL: Expected 0 active sessions after turning all OFF, got: $activeCountA"
}
Write-Host "PUT Response: hasAnyOverride=$($putResA.hasAnyOverride), activeSessions=$activeCountA (PASS)" -ForegroundColor Green

# 4. Immediate GET /my-roster to verify it DOES NOT revert
Write-Host "`n--> [TEST A.2] Verifying GET /my-roster does NOT revert to clinic template..." -ForegroundColor Cyan
$getResA = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Get -Headers $headers

if ($getResA.hasAnyOverride -ne $true) {
    throw "FAIL: GET /my-roster reverted hasAnyOverride to false!"
}

$getActiveCountA = ($getResA.days | ForEach-Object { $_.sessions } | Where-Object { $_.isActive -eq $true } | Measure-Object).Count
if ($getActiveCountA -ne 0) {
    throw "FAIL: GET /my-roster reverted active sessions back to template! Count: $getActiveCountA"
}
Write-Host "GET /my-roster: hasAnyOverride=$($getResA.hasAnyOverride), activeSessions=$getActiveCountA (PERSISTED SUCCESSFULLY!)" -ForegroundColor Green

# 5. TEST CASE B: Turn ON exactly 2 sessions
Write-Host "`n--> [TEST B] Setting exactly 2 sessions to isActive: true..." -ForegroundColor Cyan
$twoOnAssignments = @()
$counter = 0
foreach ($d in $roster.days) {
    foreach ($s in $d.sessions) {
        $counter++
        $isAct = ($counter -le 2)
        $twoOnAssignments += @{
            dow = $d.dow
            sessionId = $s.sessionId
            isActive = $isAct
        }
    }
}

$putBodyB = @{
    assignments = $twoOnAssignments
    reason = "Dokter mengaktifkan 2 sesi praktik"
} | ConvertTo-Json -Depth 5

$putResB = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Put -Headers $headers -Body $putBodyB
$activeCountB = ($putResB.days | ForEach-Object { $_.sessions } | Where-Object { $_.isActive -eq $true } | Measure-Object).Count

if ($activeCountB -ne 2) {
    throw "FAIL: Expected 2 active sessions, got: $activeCountB"
}
Write-Host "PUT Response: hasAnyOverride=$($putResB.hasAnyOverride), activeSessions=$activeCountB (PASS)" -ForegroundColor Green

$getResB = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Get -Headers $headers
$getActiveCountB = ($getResB.days | ForEach-Object { $_.sessions } | Where-Object { $_.isActive -eq $true } | Measure-Object).Count
if ($getActiveCountB -ne 2) {
    throw "FAIL: GET /my-roster did not return 2 active sessions, got: $getActiveCountB"
}
Write-Host "GET /my-roster: activeSessions=$getActiveCountB (PERSISTED SUCCESSFULLY!)" -ForegroundColor Green

# 6. TEST CASE C: DELETE /my-roster (Reset to Template)
Write-Host "`n--> [TEST C] Resetting roster to clinic template via DELETE..." -ForegroundColor Cyan
$delRes = Invoke-RestMethod -Uri "$baseUrl/schedules/my-roster" -Method Delete -Headers $headers

if ($delRes.hasAnyOverride -ne $false) {
    throw "FAIL: Expected hasAnyOverride to be false after reset, got: $($delRes.hasAnyOverride)"
}

$templateActiveCount = ($delRes.days | ForEach-Object { $_.sessions } | Where-Object { $_.isActive -eq $true } | Measure-Object).Count
Write-Host "DELETE Response: hasAnyOverride=$($delRes.hasAnyOverride), activeSessions=$templateActiveCount (RESET TO CLINIC TEMPLATE SUCCESS)" -ForegroundColor Green

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host " ALL PERSISTENCE AND MUTATION TESTS PASSED 100%!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
