# ==============================================================================
# AMANAH HEALTHCARE BACKEND - DOCTOR SCHEDULE MANAGEMENT REALITY CHECK SUITE
# Ticket: BE-SCHED-001 (Commander Protocol Verification)
# ==============================================================================

param(
    [string]$BaseUrl = $env:E2E_BASE_URL
)

. "$PSScriptRoot\common.ps1"

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
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
Write-Host " STARTING REAL LIVE ENDPOINT VERIFICATION (TICKET: BE-SCHED-001)" -ForegroundColor Cyan
Write-Host " Target Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 0. Wait for API readiness
Wait-E2EApiReady -url $baseUrl

# ------------------------------------------------------------------------------
# 1. SECURITY & RBAC ENFORCEMENT
# ------------------------------------------------------------------------------
Write-Host "`n=== 1. Security & RBAC Enforcement Gate ===" -ForegroundColor Yellow

# 1.1 Unauthenticated request must return 401
$unauthStatus = curl.exe -s -o /dev/null -w "%{http_code}" "$baseUrl/api/v1/admin/doctor-schedules"
Assert-Check "GET /api/v1/admin/doctor-schedules (No Token) -> 401 Unauthorized" ($unauthStatus -eq "401")

# 1.2 Non-admin (Patient or Doctor) role must return 403 Forbidden
$docLogin = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = "dokter@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$docToken = $docLogin.token
$forbiddenStatus = curl.exe -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $docToken" "$baseUrl/api/v1/admin/doctor-schedules"
Assert-Check "GET /api/v1/admin/doctor-schedules (Doctor Token) -> 403 Forbidden" ($forbiddenStatus -eq "403")

# 1.3 Admin Login for privileged operations
$adminLogin = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$adminToken = $adminLogin.token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
Assert-Check "Admin Login -> Bearer Token Acquired" ($null -ne $adminToken -and $adminToken.Length -gt 20)

# ------------------------------------------------------------------------------
# 2. ENDPOINT: GET /api/v1/admin/doctor-schedules (Admin Overview & Filter Cards)
# ------------------------------------------------------------------------------
Write-Host "`n=== 2. Testing GET /api/v1/admin/doctor-schedules (Live Admin Card Overview) ===" -ForegroundColor Yellow

# Measure latency using curl for pure HTTP round-trip timing
$curlTime = curl.exe -s -o /dev/null -w "%{time_total}" -H "Authorization: Bearer $adminToken" "$baseUrl/api/v1/admin/doctor-schedules?page=1&limit=6"
$latencyMs = [int]([double]$curlTime * 1000)
$schedulesOverview = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?page=1&limit=6" -Method Get -Headers $adminHeaders

Assert-Check "GET /api/v1/admin/doctor-schedules succeeds (200 OK)" ($schedulesOverview.success -eq $true)
Assert-Check "Response latency under operational budget (< 500ms)" ($latencyMs -lt 500) "Actual: ${latencyMs}ms"
Assert-Check "Overview contains doctors array" ($null -ne $schedulesOverview.data.doctors -and $schedulesOverview.data.doctors.Count -ge 1)
Assert-Check "Overview contains pagination metadata" ($schedulesOverview.data.meta.page -eq 1 -and $schedulesOverview.data.meta.limit -eq 6)

$targetDoc = $schedulesOverview.data.doctors[0]
$practitionerId = $targetDoc.practitioner_id
Assert-Check "Doctor card has required fields (nama_dokter, spesialisasi, status_dokter, slot_tersedia, kapasitas_per_hari)" (
    $null -ne $targetDoc.nama_dokter -and
    $null -ne $targetDoc.spesialisasi -and
    $null -ne $targetDoc.status_dokter -and
    $null -ne $targetDoc.slot_tersedia -and
    $null -ne $targetDoc.kapasitas_per_hari
)

# 2.2 Filter by search
$searchFiltered = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?search=$([System.Web.HttpUtility]::UrlEncode($targetDoc.nama_dokter))" -Method Get -Headers $adminHeaders
Assert-Check "GET /api/v1/admin/doctor-schedules?search=... returns matching doctor" ($searchFiltered.data.doctors.Count -ge 1)

# 2.3 Filter options endpoint (BR-007)
$filterOptionsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/filter-options" -Method Get -Headers $adminHeaders
Assert-Check "GET /api/v1/admin/doctor-schedules/filter-options succeeds (200 OK)" ($filterOptionsRes.success -eq $true)
Assert-Check "Filter options contains poliklinik array" ($null -ne $filterOptionsRes.data.poliklinik -and $filterOptionsRes.data.poliklinik.Count -ge 1)
Assert-Check "Filter options contains spesialisasi array" ($null -ne $filterOptionsRes.data.spesialisasi -and $filterOptionsRes.data.spesialisasi.Count -ge 1)
Assert-Check "Filter options contains statuses array with 4 items" ($filterOptionsRes.data.statuses.Count -eq 4)

# ------------------------------------------------------------------------------
# 3. ENDPOINT: GET /api/v1/admin/doctor-schedules/:practitionerId (Monthly Calendar Matrix)
# ------------------------------------------------------------------------------
Write-Host "`n=== 3. Testing GET /api/v1/admin/doctor-schedules/:practitionerId (Monthly & 24h Grid) ===" -ForegroundColor Yellow

$detailRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)?month=09&year=2026" -Method Get -Headers $adminHeaders
Assert-Check "GET /api/v1/admin/doctor-schedules/:id succeeds (200 OK)" ($detailRes.success -eq $true)
Assert-Check "Detail has monthly_schedule matrix with 30 days for September" ($detailRes.data.monthly_schedule.Count -eq 30)
Assert-Check "Day cells have day, date, status, notes" (
    $detailRes.data.monthly_schedule[0].day -eq 1 -and
    $null -ne $detailRes.data.monthly_schedule[0].date -and
    $null -ne $detailRes.data.monthly_schedule[0].status
)
Assert-Check "Detail has sesi_harian array" ($null -ne $detailRes.data.sesi_harian)

# 3.2 Not Found scenario
$notFoundStatus = curl.exe -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $adminToken" "$baseUrl/api/v1/admin/doctor-schedules/00000000-0000-0000-0000-000000000000"
Assert-Check "GET with non-existent UUID -> 404 Not Found" ($notFoundStatus -eq "404")

# ------------------------------------------------------------------------------
# 4. ENDPOINT: PUT /api/v1/admin/doctor-schedules/:practitionerId (Operational Override & Cuti)
# ------------------------------------------------------------------------------
Write-Host "`n=== 4. Testing PUT /api/v1/admin/doctor-schedules/:practitionerId (Cuti Mutation & Persistence) ===" -ForegroundColor Yellow

$cutiBody = @{
    is_cuti = $true
    cuti_reason = "E2E Reality Check Cuti Emergency"
    cuti_start = "2026-10-01"
    cuti_end = "2026-10-03"
    status_jadwal = "Cuti"
    slot_tersedia = 0
    kapasitas_per_hari = 25
} | ConvertTo-Json

$putRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)" -Method Put -Body $cutiBody -ContentType "application/json" -Headers $adminHeaders
Assert-Check "PUT /api/v1/admin/doctor-schedules/:id succeeds" ($putRes.success -eq $true -and $putRes.data.is_cuti -eq $true)

# 4.2 DIRECT DATABASE VERIFICATION VIA DOCKER
$dbCutiCheck = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT is_leave, leave_reason FROM practitioner_schedule_day_settings WHERE practitioner_id = '$($practitionerId)' AND schedule_date = '2026-10-01';"
Assert-Check "PostgreSQL direct query verifies is_leave=t in Docker database" ($dbCutiCheck.Trim() -like "t|*") "Actual DB row: $dbCutiCheck"

# Revert Cuti
$revertBody = @{
    is_cuti = $false
    cuti_reason = $null
    status_jadwal = "Buka"
    slot_tersedia = 20
    kapasitas_per_hari = 25
} | ConvertTo-Json
$revertRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)" -Method Put -Body $revertBody -ContentType "application/json" -Headers $adminHeaders
Assert-Check "Revert Cuti succeeds and resets is_cuti to false" ($revertRes.data.is_cuti -eq $false)

# 4.3 RUANG PRAKTIK PERSISTENCE VERIFICATION (BR-003)
$roomUpdateBody = @{
    ruang_praktik = "Poli Umum, Ruang 101"
    date = "2026-10-01"
} | ConvertTo-Json
$roomUpdateRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)" -Method Put -Body $roomUpdateBody -ContentType "application/json" -Headers $adminHeaders
Assert-Check "PUT with ruang_praktik succeeds" ($roomUpdateRes.success -eq $true)
$dbRoomCheck = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT cr.name FROM practitioners p JOIN clinic_rooms cr ON p.default_room_id = cr.id WHERE p.id = '$($practitionerId)';"
Assert-Check "PostgreSQL verifies default_room_id persisted on practitioner" ($dbRoomCheck.Trim() -like "*Poli Umum*") "Actual room in DB: $dbRoomCheck"

# ------------------------------------------------------------------------------
# 5. ENDPOINT: PATCH /api/v1/admin/doctor-schedules/:practitionerId/day-status (Single Day Override)
# ------------------------------------------------------------------------------
Write-Host "`n=== 5. Testing PATCH /api/v1/admin/doctor-schedules/:practitionerId/day-status ===" -ForegroundColor Yellow

$dayOverrideBody = @{
    date = "2026-10-05"
    status = "Cuti"
    reason = "Dinas Luar Kota Reality Test"
} | ConvertTo-Json

$dayPatchRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)/day-status" -Method Patch -Body $dayOverrideBody -ContentType "application/json" -Headers $adminHeaders
Assert-Check "PATCH /day-status succeeds (200 OK)" ($dayPatchRes.success -eq $true -and $dayPatchRes.data.status -eq "Cuti")

# Direct DB check for day status
$dbDayCheck = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT is_leave, leave_reason FROM practitioner_schedule_day_settings WHERE practitioner_id = '$($practitionerId)' AND schedule_date = '2026-10-05';"
Assert-Check "PostgreSQL verifies day-status persisted as LEAVE" ($dbDayCheck.Trim() -like "t|*") "Actual DB row: $dbDayCheck"

# ------------------------------------------------------------------------------
# 6. ENDPOINT: POST, PATCH, DELETE /api/v1/admin/doctor-schedules/:practitionerId/sessions
# ------------------------------------------------------------------------------
Write-Host "`n=== 6. Testing Sessions Lifecycle (POST, PATCH, DELETE & Conflicts) ===" -ForegroundColor Yellow

# 6.1 Validation check: Missing fields
$invalidSessionBody = @{
    schedule_date = "2026-10-15"
    nama_sesi = "Sesi Pagi"
} | ConvertTo-Json

$badReqStatus = $null
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)/sessions" -Method Post -Body $invalidSessionBody -ContentType "application/json" -Headers $adminHeaders
    $badReqStatus = 200
} catch {
    $badReqStatus = [int]$_.Exception.Response.StatusCode
}
Assert-Check "POST session with missing required times -> 422 Unprocessable Entity (Validation Error)" ($badReqStatus -eq 422 -or $badReqStatus -eq 400)

# Ensure clean slate for test date 2026-10-15
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "DELETE FROM practitioner_schedule_sessions WHERE practitioner_id = '$($practitionerId)' AND schedule_date = '2026-10-15';" | Out-Null

# 6.2 Valid session creation
$newSessionBody = @{
    schedule_date = "2026-10-15"
    nama_sesi = "Sesi Malam Reality"
    jam_mulai = "19:00"
    jam_selesai = "21:30"
    kuota_pasien = 12
    slot_tersedia = 12
    status_sesi = "Buka"
    ruang = "Poli Umum, Ruang 101"
} | ConvertTo-Json

$createSessionRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)/sessions" -Method Post -Body $newSessionBody -ContentType "application/json" -Headers $adminHeaders
$newSessionId = $createSessionRes.data.id
Assert-Check "POST session succeeds (201 Created) and returns UUID" ($null -ne $newSessionId -and $createSessionRes.success -eq $true)

# Verify in PostgreSQL
$dbSessionCheck = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT id, start_time, end_time, capacity FROM practitioner_schedule_sessions WHERE id = '$($newSessionId)';"
Assert-Check "PostgreSQL verifies session row persisted in database" ($dbSessionCheck.Trim() -like "$newSessionId|*") "DB row: $dbSessionCheck"

# 6.3 Conflict Check: Overlapping session on same doctor and date
$overlappingBody = @{
    schedule_date = "2026-10-15"
    nama_sesi = "Sesi Bentrok"
    jam_mulai = "20:00"
    jam_selesai = "22:00"
    kuota_pasien = 5
    slot_tersedia = 5
} | ConvertTo-Json

$conflictStatus = $null
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)/sessions" -Method Post -Body $overlappingBody -ContentType "application/json" -Headers $adminHeaders
    $conflictStatus = 200
} catch {
    $conflictStatus = [int]$_.Exception.Response.StatusCode
}
Assert-Check "POST overlapping session rejected with 409 Conflict" ($conflictStatus -eq 409)

# 6.4 PATCH /sessions/:sessionId (BR-005)
$patchSessionBody = @{
    nama_sesi = "Sesi Malam Diperbarui"
    jam_mulai = "19:15"
    jam_selesai = "21:45"
    kuota_pasien = 15
    slot_tersedia = 14
    status_sesi = "Buka"
} | ConvertTo-Json
$patchSessionRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)/sessions/$($newSessionId)" -Method Patch -Body $patchSessionBody -ContentType "application/json" -Headers $adminHeaders
Assert-Check "PATCH session succeeds (200 OK)" ($patchSessionRes.success -eq $true -and $patchSessionRes.data.capacity -eq 15)

$dbPatchCheck = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT start_time, end_time, capacity FROM practitioner_schedule_sessions WHERE id = '$($newSessionId)';"
Assert-Check "PostgreSQL verifies updated start_time, end_time, capacity" ($dbPatchCheck.Trim() -like "19:15:00|21:45:00|15") "DB row: $dbPatchCheck"

# 6.5 Relational Delete Safety (BR-004)
$dummyAptId = [System.Guid]::NewGuid().ToString()
$patientProfileId = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM patient_profiles LIMIT 1;").Trim()
$serviceId = (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM clinic_services LIMIT 1;").Trim()
$bookingCode = "APT-TEST-" + (Get-Random -Minimum 1000 -Maximum 9999)

docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "INSERT INTO appointments (id, patient_id, practitioner_id, service_id, schedule_session_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, booking_code) VALUES ('$dummyAptId', '$patientProfileId', '$practitionerId', '$serviceId', '$newSessionId', '2026-10-15', '19:15:00', '21:45:00', 'booked', '$bookingCode');" | Out-Null

$conflictDeleteStatus = $null
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)/sessions/$($newSessionId)" -Method Delete -Headers $adminHeaders
    $conflictDeleteStatus = 200
} catch {
    $conflictDeleteStatus = [int]$_.Exception.Response.StatusCode
}
Assert-Check "DELETE session with active booked appointment rejected with 409 Conflict" ($conflictDeleteStatus -eq 409)

# Remove the test appointment
docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c "DELETE FROM appointments WHERE id = '$dummyAptId';" | Out-Null

# 6.6 DELETE /sessions/:sessionId without active bookings (BR-004 Success)
$deleteSessionRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)/sessions/$($newSessionId)" -Method Delete -Headers $adminHeaders
Assert-Check "DELETE session without active bookings succeeds (200 OK)" ($deleteSessionRes.success -eq $true)

$dbDeletedCheck = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c "SELECT COUNT(*) FROM practitioner_schedule_sessions WHERE id = '$($newSessionId)';"
Assert-Check "PostgreSQL verifies session row is deleted" ($dbDeletedCheck.Trim() -eq "0")

# ------------------------------------------------------------------------------
# 7. ENDPOINT: GET /api/v1/clinical/practitioners (Patient Consumer Lookup)
# ------------------------------------------------------------------------------
Write-Host "`n=== 7. Testing GET /api/v1/clinical/practitioners (Patient Booking Domain) ===" -ForegroundColor Yellow

$clinicalRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinical/practitioners" -Method Get
Assert-Check "GET /api/v1/clinical/practitioners accessible without auth (200 OK)" ($clinicalRes.success -eq $true)
Assert-Check "Clinical practitioners returns non-empty list" ($clinicalRes.data.Count -ge 1)
$firstPrac = $clinicalRes.data[0]
Assert-Check "Patient practitioner card has required fields (id, name, spec, schedule, is_available)" (
    $null -ne $firstPrac.id -and
    $null -ne $firstPrac.name -and
    $null -ne $firstPrac.spec -and
    $null -ne $firstPrac.schedule -and
    $null -ne $firstPrac.is_available
)

# ------------------------------------------------------------------------------
# 8. PERFORMANCE & STABILITY CHECK
# ------------------------------------------------------------------------------
Write-Host "`n=== 8. Operational Stability & Rate Limit Probe ===" -ForegroundColor Yellow

$rapidSuccessCount = 0
for ($i = 1; $i -le 20; $i++) {
    $code = curl.exe -s -o /dev/null -w "%{http_code}" "$baseUrl/api/v1/clinical/practitioners"
    if ($code -eq "200") { $rapidSuccessCount++ }
}
Assert-Check "20 rapid clinical requests handled cleanly without 500 errors" ($rapidSuccessCount -eq 20) "Success: $rapidSuccessCount/20"

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host " REALITY VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host " Passed: $passed, Failed: $failed" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    Write-Host " VERIFICATION FAILED: $failed checks failed. Check output above." -ForegroundColor Red
    exit 1
} else {
    Write-Host " ALL CHECKS PASSED: Real system behaves as specified in BE-SCHED-001." -ForegroundColor Green
    exit 0
}
