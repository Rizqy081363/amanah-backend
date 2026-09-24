# ==============================================================================
# AMANAH HEALTHCARE BACKEND - SCHEDULE V2 PROJECTION & AVAILABILITY E2E TEST SUITE
# Verifies end-to-end CRUD, arbitrary start times, backend interval projection,
# OCCUPIED status semantics, admin duration policy, and delete guard safety.
# ==============================================================================

param(
    [string]$BaseUrl = $env:E2E_BASE_URL
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. "$PSScriptRoot\common.ps1"
$baseUrl = if ([string]::IsNullOrWhiteSpace($BaseUrl)) { Get-E2EBaseUrl } else { $BaseUrl.TrimEnd('/') }
$passed = 0
$failed = 0

function Assert-Check([string]$name, [bool]$condition, [string]$details = "") {
    if ($condition) {
        Write-Host " [PASS] $name" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $name - $details" -ForegroundColor Red
        $global:failed++
    }
}

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " STARTING SCHEDULE V2 PROJECTION & AVAILABILITY VERIFICATION" -ForegroundColor Cyan
Write-Host " Target Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

Wait-E2EApiReady -url $baseUrl

# ------------------------------------------------------------------------------
# 1. AUTHENTICATION SETUP
# ------------------------------------------------------------------------------
Write-Host "`n=== 1. Authentication Setup ===" -ForegroundColor Yellow

# 1.1 Doctor Login
$docLoginBody = @{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$docAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $docLoginBody -ContentType "application/json"
$docToken = $docAuth.token
$docHeaders = @{ "Authorization" = "Bearer $docToken" }
Assert-Check "Doctor Login -> Bearer Token Acquired" ($null -ne $docToken -and $docToken.Length -gt 20)

# 1.2 Admin Login
$adminLoginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$adminAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
$adminToken = $adminAuth.token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
Assert-Check "Admin Login -> Bearer Token Acquired" ($null -ne $adminToken -and $adminToken.Length -gt 20)

# ------------------------------------------------------------------------------
# 2. GET SCHEDULE CONTEXTS (Backend-Owned Boundaries & Effective Duration)
# ------------------------------------------------------------------------------
Write-Host "`n=== 2. Testing GET /api/v1/schedules/contexts ===" -ForegroundColor Yellow

# 2.1 Unauthenticated request returns 401
$unauthContextStatus = curl.exe -s -o /dev/null -w "%{http_code}" "$baseUrl/api/v1/schedules/contexts?date=2026-09-28"
Assert-Check "GET /api/v1/schedules/contexts (No Auth) -> 401 Unauthorized" ($unauthContextStatus -eq "401")

# 2.2 Doctor requests contexts
$contexts = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/contexts?date=2026-09-28" -Method Get -Headers $docHeaders
Assert-Check "GET /api/v1/schedules/contexts succeeds and returns 4 contexts" ($contexts.Count -eq 4)

$morningCtx = $contexts | Where-Object { $_.contextId -eq "morning" }
Assert-Check "Morning context exists with 06:00 - 12:00 boundaries" (
    $morningCtx.boundaryStartTime -eq "06:00" -and $morningCtx.boundaryEndTime -eq "12:00"
)
Assert-Check "Morning context has effective consultation duration (default 30 mins)" (
    $morningCtx.effectiveConsultationDurationMinutes -eq 30
)
Assert-Check "Morning context allows 1-minute start precision (arbitrary start times)" (
    $morningCtx.allowedStartPrecisionMinutes -eq 1
)
Assert-Check "Doctor cannot edit duration (durationEditableByCurrentUser = false)" (
    $morningCtx.durationEditableByCurrentUser -eq $false
)

$practitionerId = $morningCtx.practitionerId
Assert-Check "Context includes valid practitioner ID" ($null -ne $practitionerId -and $practitionerId.Length -gt 10)

# 2.3 Admin requests contexts -> requires staffId for non-practitioner admin
$adminNoStaffStatus = $null
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/contexts?date=2026-09-28" -Method Get -Headers $adminHeaders
    $adminNoStaffStatus = 200
} catch {
    $adminNoStaffStatus = [int]$_.Exception.Response.StatusCode
}
Assert-Check "Admin without staffId is rejected with 403 Forbidden" ($adminNoStaffStatus -eq 403)

$adminContexts = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/contexts?date=2026-09-28&staffId=$practitionerId" -Method Get -Headers $adminHeaders
Assert-Check "Admin with staffId requests contexts -> durationEditableByCurrentUser is true" (
    $adminContexts[0].durationEditableByCurrentUser -eq $true
)

# ------------------------------------------------------------------------------
# 3. GET PROJECTION PREVIEW (Arbitrary Start Time & Interval Mathematics)
# ------------------------------------------------------------------------------
Write-Host "`n=== 3. Testing GET /api/v1/schedules/projection (Preview & Arbitrary Start) ===" -ForegroundColor Yellow

# 3.1 Start 08:45 in morning (06:00-12:00) with duration 30
# 08:45 to 12:00 = 195 minutes -> floor(195/30) = 6 intervals (180 mins), ending at 11:45
$proj1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/projection?date=2026-09-28&scheduleContextId=morning&startTime=08:45" -Method Get -Headers $docHeaders

Assert-Check "Projection selectedStartTime is preserved as 08:45 (NO hourly rounding)" ($proj1.selectedStartTime -eq "08:45")
Assert-Check "Projection capacity is 6 intervals" ($proj1.capacity -eq 6)
Assert-Check "Projected end time is 11:45" ($proj1.projectedEndTime -eq "11:45")
Assert-Check "Interval 1 starts at 08:45 and ends at 09:15" (
    $proj1.intervals[0].startTime -eq "08:45" -and $proj1.intervals[0].endTime -eq "09:15"
)
Assert-Check "Interval 6 starts at 11:15 and ends at 11:45" (
    $proj1.intervals[5].startTime -eq "11:15" -and $proj1.intervals[5].endTime -eq "11:45"
)
Assert-Check "Interval status is OPEN with Indonesian label 'Buka'" (
    $proj1.intervals[0].status -eq "OPEN" -and $proj1.intervals[0].displayLabel -eq "Buka"
)

# 3.2 Start 09:40 in morning (06:00-12:00) with duration 30
# 09:40 to 12:00 = 140 minutes -> floor(140/30) = 4 intervals, ending at 11:40
$proj2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/projection?date=2026-09-28&scheduleContextId=morning&startTime=09:40" -Method Get -Headers $docHeaders
Assert-Check "Start 09:40 produces 4 intervals ending at 11:40" (
    $proj2.capacity -eq 4 -and $proj2.projectedEndTime -eq "11:40" -and $proj2.intervals[0].startTime -eq "09:40"
)

# ------------------------------------------------------------------------------
# 4. PROJECTION VALIDATION & ERROR HANDLING
# ------------------------------------------------------------------------------
Write-Host "`n=== 4. Testing Projection Validation & Error Handlers ===" -ForegroundColor Yellow

# 4.1 Start outside boundary (13:00 for morning 06:00-12:00) -> 422
$outBoundaryStatus = $null
$outBoundaryCode = ""
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/projection?date=2026-09-28&scheduleContextId=morning&startTime=13:00" -Method Get -Headers $docHeaders
    $outBoundaryStatus = 200
} catch {
    $outBoundaryStatus = [int]$_.Exception.Response.StatusCode
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    $outBoundaryCode = $errBody.code
}
Assert-Check "Start outside boundary returns 422 with START_OUTSIDE_BOUNDARY" (
    $outBoundaryStatus -eq 422 -and $outBoundaryCode -eq "START_OUTSIDE_BOUNDARY"
)

# 4.2 Start leaves no capacity (11:50 with 30m duration before 12:00) -> 422
$noCapStatus = $null
$noCapCode = ""
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/projection?date=2026-09-28&scheduleContextId=morning&startTime=11:50" -Method Get -Headers $docHeaders
    $noCapStatus = 200
} catch {
    $noCapStatus = [int]$_.Exception.Response.StatusCode
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    $noCapCode = $errBody.code
}
Assert-Check "Start with insufficient duration returns 422 with DURATION_LEAVES_NO_CAPACITY" (
    $noCapStatus -eq 422 -and $noCapCode -eq "DURATION_LEAVES_NO_CAPACITY"
)

# ------------------------------------------------------------------------------
# 5. CREATE AVAILABILITY (POST /api/v1/schedules/availability - NO manual endTime)
# ------------------------------------------------------------------------------
Write-Host "`n=== 5. Testing POST /api/v1/schedules/availability (Doctor Workflow) ===" -ForegroundColor Yellow

# Ensure clean slate for test date 2026-09-28
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "DELETE FROM practitioner_schedule_sessions WHERE practitioner_id = '$practitionerId' AND schedule_date = '2026-09-28';" | Out-Null

$createPayload = @{
    date = "2026-09-28"
    scheduleContextId = "morning"
    startTime = "08:45"
    notes = "Praktik Poli Pagi V2 Projection Test"
} | ConvertTo-Json

$created = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/availability" -Method Post -Body $createPayload -ContentType "application/json" -Headers $docHeaders

$sessionId = $created.schedule.id
Assert-Check "POST /availability creates schedule without client-supplied endTime" ($null -ne $sessionId)
Assert-Check "Persisted startTime is 08:45" ($created.schedule.startTime -eq "08:45")
Assert-Check "Persisted endTime is derived as 11:45" ($created.schedule.endTime -eq "11:45")
Assert-Check "Persisted capacity is 6" ($created.schedule.capacity -eq 6)
Assert-Check "Optimistic concurrency version tag is returned" ($null -ne $created.schedule.version)
Assert-Check "Response includes canonical projection with 6 intervals" ($created.projection.intervals.Count -eq 6)

# Verify directly in PostgreSQL
$dbSessionRow = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT start_time, end_time, capacity FROM practitioner_schedule_sessions WHERE id = '$sessionId';"
Assert-Check "PostgreSQL row verifies 08:45:00 | 11:45:00 | 6" ($dbSessionRow.Trim() -eq "08:45:00|11:45:00|6")

# 5.2 Conflict Check: Attempt overlapping session on same doctor/date -> 409
$conflictStatus = $null
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/availability" -Method Post -Body $createPayload -ContentType "application/json" -Headers $docHeaders
    $conflictStatus = 200
} catch {
    $conflictStatus = [int]$_.Exception.Response.StatusCode
}
Assert-Check "Overlapping availability rejected with 409 Conflict" ($conflictStatus -eq 409)

# ------------------------------------------------------------------------------
# 6. READ / RETRIEVE CREATED AVAILABILITY
# ------------------------------------------------------------------------------
Write-Host "`n=== 6. Testing GET /api/v1/schedules/my-schedules ===" -ForegroundColor Yellow

$mySchedules = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/my-schedules?date=2026-09-28" -Method Get -Headers $docHeaders
$foundSession = $mySchedules | Where-Object { $_.id -eq $sessionId }

Assert-Check "GET /my-schedules returns the newly created session" ($null -ne $foundSession)
Assert-Check "Session formatted timeRange is '08:45 - 11:45 WIB'" ($foundSession.timeRange -eq "08:45 - 11:45 WIB")
Assert-Check "Session status is 'Buka'" ($foundSession.status -eq "Buka")

# ------------------------------------------------------------------------------
# 7. ADMIN DURATION POLICY MUTATION (Admin Authority & Dynamic Forecast)
# ------------------------------------------------------------------------------
Write-Host "`n=== 7. Testing Admin Duration Policy (PATCH /duration) ===" -ForegroundColor Yellow

# 7.1 Non-admin (doctor) forbidden from changing duration
$docDurationStatus = $null
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$practitionerId/duration" -Method Patch -Body (@{ consultationDurationMinutes = 20 } | ConvertTo-Json) -ContentType "application/json" -Headers $docHeaders
    $docDurationStatus = 200
} catch {
    $docDurationStatus = [int]$_.Exception.Response.StatusCode
}
Assert-Check "Doctor calling PATCH /admin/doctor-schedules/:id/duration -> 403 Forbidden" ($docDurationStatus -eq 403)

# 7.2 Admin updates consultation duration to 20 minutes
$adminDurationRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$practitionerId/duration" -Method Patch -Body (@{ consultationDurationMinutes = 20; startPrecisionMinutes = 1 } | ConvertTo-Json) -ContentType "application/json" -Headers $adminHeaders
Assert-Check "Admin updates consultation duration to 20 minutes (200 OK)" ($null -ne $adminDurationRes)

# Direct DB check on practitioner table
$dbPolicyCheck = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT consultation_duration_minutes, start_precision_minutes FROM practitioners WHERE id = '$practitionerId';"
Assert-Check "PostgreSQL verifies practitioner duration updated to 20 mins" ($dbPolicyCheck.Trim() -eq "20|1")

# 7.3 Doctor fetches contexts again -> now reflects 20 mins
$updatedContexts = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/contexts?date=2026-09-28" -Method Get -Headers $docHeaders
$updatedMorning = $updatedContexts | Where-Object { $_.contextId -eq "morning" }
Assert-Check "Doctor context immediately reflects new 20 min consultation duration" (
    $updatedMorning.effectiveConsultationDurationMinutes -eq 20
)

# 7.4 Projection preview with 20 mins:
# 08:45 to 12:00 = 195 minutes -> floor(195 / 20) = 9 intervals!
# 08:45-09:05, 09:05-09:25, ..., 11:25-11:45
$proj20Min = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/projection?date=2026-09-28&scheduleContextId=morning&startTime=08:45" -Method Get -Headers $docHeaders
Assert-Check "Projection with 20 min duration produces 9 intervals" ($proj20Min.capacity -eq 9)
Assert-Check "Interval 1 is 08:45 - 09:05" (
    $proj20Min.intervals[0].startTime -eq "08:45" -and $proj20Min.intervals[0].endTime -eq "09:05"
)

# Reset duration back to 30 mins
Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$practitionerId/duration" -Method Patch -Body (@{ consultationDurationMinutes = 30; startPrecisionMinutes = 1 } | ConvertTo-Json) -ContentType "application/json" -Headers $adminHeaders | Out-Null

# ------------------------------------------------------------------------------
# 8. APPOINTMENT OCCUPATION & INTERVAL STATUS (OPEN -> OCCUPIED / Terisi)
# ------------------------------------------------------------------------------
Write-Host "`n=== 8. Testing Occupied Interval Status & Patient Booking Safe View ===" -ForegroundColor Yellow

$testAptId = [System.Guid]::NewGuid().ToString()
$patientProfileId = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM patient_profiles LIMIT 1;").Trim()
$serviceId = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM clinic_services LIMIT 1;").Trim()
$queueTicketId = [System.Guid]::NewGuid().ToString()

# Insert appointment in the first interval (08:45 to 09:15)
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "INSERT INTO appointments (id, patient_id, practitioner_id, service_id, schedule_session_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, booking_code) VALUES ('$testAptId', '$patientProfileId', '$practitionerId', '$serviceId', '$sessionId', '2026-09-28', '08:45:00', '09:15:00', 'booked', 'APT-V2-001');" | Out-Null
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "INSERT INTO queue_tickets (id, appointment_id, service_id, queue_date, queue_number, status) VALUES ('$queueTicketId', '$testAptId', '$serviceId', '2026-09-28', 'A-01', 'waiting');" | Out-Null

# Projection preview now evaluates active appointment
$occProj = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/projection?date=2026-09-28&scheduleContextId=morning&startTime=08:45" -Method Get -Headers $docHeaders
Assert-Check "Interval 1 (08:45-09:15) status is OCCUPIED" ($occProj.intervals[0].status -eq "OCCUPIED")
Assert-Check "Interval 1 displayLabel is 'Terisi'" ($occProj.intervals[0].displayLabel -eq "Terisi")
Assert-Check "Interval 1 includes appointmentRef with ID and queueNumber A-01" (
    $occProj.intervals[0].appointmentRef.appointmentId -eq $testAptId -and $occProj.intervals[0].appointmentRef.queueNumber -eq "A-01"
)
Assert-Check "Interval 2 (09:15-09:45) remains OPEN / Buka" (
    $occProj.intervals[1].status -eq "OPEN" -and $occProj.intervals[1].displayLabel -eq "Buka"
)

# ------------------------------------------------------------------------------
# 9. RELATIONAL SAFETY ON DELETE
# ------------------------------------------------------------------------------
Write-Host "`n=== 9. Testing Relational Safety on Delete ===" -ForegroundColor Yellow

# 9.1 Deleting session with active appointment must be rejected with 409
$deleteConflictStatus = $null
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/$sessionId" -Method Delete -Headers $docHeaders
    $deleteConflictStatus = 200
} catch {
    $deleteConflictStatus = [int]$_.Exception.Response.StatusCode
}
Assert-Check "DELETE /schedules/:id with active appointment rejected with 409 Conflict" ($deleteConflictStatus -eq 409)

# 9.2 Remove appointment and delete session cleanly
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "DELETE FROM queue_tickets WHERE id = '$queueTicketId';" | Out-Null
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "DELETE FROM appointments WHERE id = '$testAptId';" | Out-Null

$cleanDeleteStatus = curl.exe -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $docToken" "$baseUrl/api/v1/schedules/$sessionId"
Assert-Check "DELETE /schedules/:id after removing appointment returns 204 No Content" ($cleanDeleteStatus -eq "204")

# Verify in DB
$dbSessionCount = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT COUNT(*) FROM practitioner_schedule_sessions WHERE id = '$sessionId';"
Assert-Check "PostgreSQL verifies session row is permanently deleted" ($dbSessionCount.Trim() -eq "0")

# ------------------------------------------------------------------------------
# 10. ADMIN TIMELINE & SERIALIZED INTERVALS (Next.js Detail Sheet Consumer)
# ------------------------------------------------------------------------------
Write-Host "`n=== 10. Testing Admin Monthly Detail Sheet & Timeline Intervals ===" -ForegroundColor Yellow

$adminDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)?month=09&year=2026" -Method Get -Headers $adminHeaders
Assert-Check "Admin doctor detail succeeds (200 OK)" ($adminDetail.success -eq $true)
Assert-Check "Admin detail contains timeline_intervals array" ($null -ne $adminDetail.data.timeline_intervals)
Assert-Check "Admin doctor status uses canonical set (Buka, Terisi, Tutup) - never Penuh" (
    $adminDetail.data.status_dokter -in @("Buka", "Terisi", "Tutup")
)

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host " SCHEDULE V2 VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host " Passed: $passed, Failed: $failed" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    Write-Host " VERIFICATION FAILED: $failed checks failed." -ForegroundColor Red
    exit 1
} else {
    Write-Host " ALL CHECKS PASSED: Schedule V2 projection engine verified live." -ForegroundColor Green
    exit 0
}
