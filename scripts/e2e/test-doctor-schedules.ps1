# ==============================================================================
# AMANAH HEALTHCARE BACKEND - DOCTOR SCHEDULES REALITY CHECK TEST SUITE
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
$baseUrl = Get-E2EBaseUrl
$passed = 0
$failed = 0

function Assert-Test([string]$name, [bool]$condition, [string]$details = "") {
    if ($condition) {
        Write-Host " [PASS] $name" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $name - $details" -ForegroundColor Red
        $global:failed++
    }
}

Write-Host "=== 1. Authentication Setup ===" -ForegroundColor Cyan

# 1.1 Login as Staff Doctor
$staffLoginBody = @{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$staffAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $staffLoginBody -ContentType "application/json"
$staffToken = $staffAuth.token
$staffHeaders = @{ "Authorization" = "Bearer $staffToken" }
Assert-Test "Staff Doctor authentication successful" ($null -ne $staffToken -and $staffToken.Length -gt 20)

Write-Host "`n=== 2. Room Reference Endpoint ===" -ForegroundColor Cyan

# 2.1 GET /api/v1/schedules/reference/rooms
$rooms = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/reference/rooms" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/schedules/reference/rooms returns non-empty list" ($rooms.Count -gt 0)
Assert-Test "Room structure has code, name, and isOccupied" ($null -ne $rooms[0].code -and $null -ne $rooms[0].name -and $null -ne $rooms[0].isOccupied)

$roomId = $rooms[0].id

Write-Host "`n=== 3. My Schedules & Calendar Summary ===" -ForegroundColor Cyan

# 3.1 GET /api/v1/schedules/my-schedules
$mySchedules = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/my-schedules" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/schedules/my-schedules succeeds" ($null -ne $mySchedules)

# 3.2 GET /api/v1/schedules/calendar-summary?month=2026-08
$calSummary = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/calendar-summary?month=2026-08" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/schedules/calendar-summary returns month '2026-08'" ($calSummary.month -eq "2026-08")
Assert-Test "Calendar summary has 31 days for August" ($calSummary.days.Count -eq 31)

Write-Host "`n=== 4. Day Settings Management ===" -ForegroundColor Cyan

# 4.1 GET /api/v1/schedules/day-settings?date=2026-08-26
$daySetting = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/day-settings?date=2026-08-26" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/schedules/day-settings returns targetQuota and isCuti" ($null -ne $daySetting.targetQuota -and $null -ne $daySetting.isCuti)

# 4.2 PUT /api/v1/schedules/day-settings
$updateSettingBody = @{
    date = "2026-08-26"
    targetQuota = 14
    isCuti = $false
    cutiReason = $null
} | ConvertTo-Json

$updatedSetting = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/day-settings" -Method Put -Body $updateSettingBody -ContentType "application/json" -Headers $staffHeaders
Assert-Test "PUT /api/v1/schedules/day-settings updates targetQuota to 14" ($updatedSetting.targetQuota -eq 14)

Write-Host "`n=== 5. Schedule Creation & Conflict Detection ===" -ForegroundColor Cyan

# 5.1 POST /api/v1/schedules (Create schedule for 2026-08-26 at 06:00 - 08:00)
$newSessionBody = @{
    date = "2026-08-26"
    sessionType = "Pagi"
    startTime = "06:00"
    endTime = "08:00"
    roomId = $roomId
    capacity = 10
    notes = "E2E Reality Check Session"
} | ConvertTo-Json

$createdSession = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules" -Method Post -Body $newSessionBody -ContentType "application/json" -Headers $staffHeaders
$sessionId = $createdSession.id
Assert-Test "POST /api/v1/schedules creates session with valid ID" ($null -ne $sessionId)
Assert-Test "Session timeRange formatted correctly" ($createdSession.timeRange -eq "06:00 - 08:00 WIB")
Assert-Test "Session status is Buka" ($createdSession.status -eq "Buka")

# 5.2 Conflict Check: Attempt to create overlapping session on same doctor and date
$conflictBody = @{
    date = "2026-08-26"
    sessionType = "Pagi"
    startTime = "07:00"
    endTime = "09:00"
    roomId = $roomId
    capacity = 5
} | ConvertTo-Json

$conflictCaught = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules" -Method Post -Body $conflictBody -ContentType "application/json" -Headers $staffHeaders
} catch {
    $conflictCaught = $_.Exception.Response.StatusCode.value__ -eq 409
}
Assert-Test "POST /api/v1/schedules rejects overlapping session with 409 Conflict" $conflictCaught

Write-Host "`n=== 6. Schedule Update, Booked Patients & Deletion ===" -ForegroundColor Cyan

# 6.1 PATCH /api/v1/schedules/:id
$patchBody = @{
    capacity = 15
    notes = "Updated notes during E2E"
} | ConvertTo-Json

$patchedSession = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/$sessionId" -Method Patch -Body $patchBody -ContentType "application/json" -Headers $staffHeaders
Assert-Test "PATCH /api/v1/schedules/:id updates capacity to 15" ($patchedSession.capacity -eq 15)

# 6.2 GET /api/v1/schedules/:id/booked-patients
$bookedPatients = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/$sessionId/booked-patients" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/schedules/:id/booked-patients returns array" ($null -ne $bookedPatients)

# 6.3 DELETE /api/v1/schedules/:id
$deleteStatus = curl.exe -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $staffToken" "$baseUrl/api/v1/schedules/$sessionId"
Assert-Test "DELETE /api/v1/schedules/:id returns 204 No Content" ($deleteStatus -eq "204")

Write-Host "`n=== Final Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $passed, Failed: $failed"
if ($failed -gt 0) {
    exit 1
}
