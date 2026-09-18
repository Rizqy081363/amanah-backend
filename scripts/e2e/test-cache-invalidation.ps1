$ErrorActionPreference = "Continue"
. "$PSScriptRoot\common.ps1"
$BaseUrl = Get-E2EBaseUrl
$passed = 0
$failed = 0

function Assert-Test([string]$description, [bool]$condition) {
    if ($condition) {
        Write-Host " [PASS] $description" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $description" -ForegroundColor Red
        $global:failed++
    }
}

function Get-HeaderVal($response, [string]$headerName) {
    $val = $response.Headers[$headerName]
    if ($null -eq $val) {
        return ""
    }
    if ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) {
        foreach ($item in $val) {
            return [string]$item
        }
    }
    return [string]$val
}

Write-Host "=== Phase 3: High-Performance Query Caching & Proactive Invalidation Verification ===" -ForegroundColor Cyan

# 0. Setup: Authenticate Admin for Mutating Requests
$loginRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body '{"email":"admin@amanah.com","password":"secret123"}' `
    -ContentType "application/json" `
    -SkipHttpErrorCheck
$token = ($loginRes.Content | ConvertFrom-Json).token
$authHeaders = @{ "Authorization" = "Bearer $token" }

# ------------------------------------------------------------------------------
# 1. Live Queue Display Cache (GET /api/v1/appointments/queue/display)
# ------------------------------------------------------------------------------
Write-Host "`n--- 1. Live Queue Display: Cache MISS -> HIT Lifecycle ---" -ForegroundColor Yellow

$display1 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/queue/display" `
    -Method Get `
    -SkipHttpErrorCheck

$is200_1 = $display1.StatusCode -eq 200
$lookup1 = Get-HeaderVal $display1 "X-Cache-Lookup"
$etag1 = Get-HeaderVal $display1 "ETag"
$cc1 = Get-HeaderVal $display1 "Cache-Control"

Assert-Test "First display queue request returns 200 OK" $is200_1
Assert-Test "First display queue request indicates X-Cache-Lookup: MISS or HIT" ($lookup1 -in "MISS", "HIT")
Assert-Test "Display queue carries ETag validator" (-not [string]::IsNullOrEmpty($etag1))
Assert-Test "Display queue has public Cache-Control header" ($cc1 -like "*public*max-age*")

$display2 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/queue/display" `
    -Method Get `
    -SkipHttpErrorCheck

$is200_2 = $display2.StatusCode -eq 200
$lookup2 = Get-HeaderVal $display2 "X-Cache-Lookup"
$etag2 = Get-HeaderVal $display2 "ETag"

Assert-Test "Second display queue request returns 200 OK" $is200_2
Assert-Test "Second display queue request indicates X-Cache-Lookup: HIT" ($lookup2 -eq "HIT")
Assert-Test "Second display queue returns identical ETag" ($etag2 -eq $etag1)

# ------------------------------------------------------------------------------
# 2. Conditional Request & 304 Not Modified (API-153)
# ------------------------------------------------------------------------------
Write-Host "`n--- 2. Conditional Retrieval: 304 Not Modified (API-153) ---" -ForegroundColor Yellow

$display304 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/queue/display" `
    -Method Get `
    -Headers @{ "If-None-Match" = $etag1 } `
    -SkipHttpErrorCheck

$is304 = $display304.StatusCode -eq 304
Assert-Test "Conditional GET with matching ETag returns 304 Not Modified" $is304

# ------------------------------------------------------------------------------
# 3. Clinics Catalog Caching (GET /api/v1/clinics)
# ------------------------------------------------------------------------------
Write-Host "`n--- 3. Clinics Catalog Caching ---" -ForegroundColor Yellow

$clinics1 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/clinics" -Method Get -SkipHttpErrorCheck
$clinics2 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/clinics" -Method Get -SkipHttpErrorCheck
$cLookup2 = Get-HeaderVal $clinics2 "X-Cache-Lookup"
$cEtag2 = Get-HeaderVal $clinics2 "ETag"

Assert-Test "Clinics list returns 200 OK" ($clinics2.StatusCode -eq 200)
Assert-Test "Repeated clinics request served with X-Cache-Lookup: HIT" ($cLookup2 -eq "HIT")
Assert-Test "Clinics list carries ETag" (-not [string]::IsNullOrEmpty($cEtag2))

# ------------------------------------------------------------------------------
# 4. Clinic Analytics Private Caching (API-150)
# ------------------------------------------------------------------------------
Write-Host "`n--- 4. Clinic Analytics: Private Cache (API-150) ---" -ForegroundColor Yellow

$summary1 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/clinics/analytics/summary" `
    -Method Get `
    -Headers $authHeaders `
    -SkipHttpErrorCheck

$summary2 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/clinics/analytics/summary" `
    -Method Get `
    -Headers $authHeaders `
    -SkipHttpErrorCheck

$sLookup2 = Get-HeaderVal $summary2 "X-Cache-Lookup"
$sCc2 = Get-HeaderVal $summary2 "Cache-Control"

Assert-Test "Analytics summary returns 200 OK" ($summary2.StatusCode -eq 200)
Assert-Test "Analytics summary has private Cache-Control header (API-150)" ($sCc2 -like "*private*")
Assert-Test "Repeated analytics summary served with X-Cache-Lookup: HIT" ($sLookup2 -eq "HIT")

# ------------------------------------------------------------------------------
# 5. Proactive Invalidation on Mutation (ARC-088, API-155)
# ------------------------------------------------------------------------------
Write-Host "`n--- 5. Proactive Cache Invalidation on Mutation (ARC-088, API-155) ---" -ForegroundColor Yellow

# Fetch first appointment
$aptsRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments" -Method Get -Headers $authHeaders -SkipHttpErrorCheck
$apts = $aptsRes.Content | ConvertFrom-Json
$targetApt = if ($null -ne $apts.data) { $apts.data[0] } else { $apts[0] }

# Mutate appointment status (e.g. check-in)
$mutateRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/$($targetApt.id)/check-in" `
    -Method Patch `
    -Headers $authHeaders `
    -SkipHttpErrorCheck

Assert-Test "Appointment mutation completes successfully" ($mutateRes.StatusCode -eq 200)

# Check display queue after mutation -> MUST be MISS (proactively purged)
$displayAfter = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/queue/display" `
    -Method Get `
    -SkipHttpErrorCheck

$lookupAfter = Get-HeaderVal $displayAfter "X-Cache-Lookup"
Assert-Test "Display queue cache was proactively purged on mutation (X-Cache-Lookup: MISS)" ($lookupAfter -eq "MISS")

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Phase 3 Cache Invalidation Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 }
