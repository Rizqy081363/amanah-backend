# Test Rate Limiting & Abuse Defense Suite (Fase 6)
# Validates X-RateLimit-* headers, tiering, 429 throttling, and RFC 7807 problem details

param(
    [string]$BaseUrl = $env:E2E_BASE_URL
)

. "$PSScriptRoot\common.ps1"
$BaseUrl = if ([string]::IsNullOrWhiteSpace($BaseUrl)) { Get-E2EBaseUrl } else { $BaseUrl.TrimEnd('/') }

$ErrorActionPreference = "Stop"
$passed = 0
$failed = 0

function Assert-Condition {
    param([bool]$Condition, [string]$Message)
    if ($Condition) {
        Write-Host "  [PASS] $Message" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "  [FAIL] $Message" -ForegroundColor Red
        $script:failed++
    }
}

function Get-HeaderValue {
    param($Headers, [string]$Name)
    $val = $Headers[$Name]
    if ($null -eq $val) { return $null }
    if ($val -is [System.Array]) { return [string]$val[0] }
    return [string]$val
}

function Get-ResponseText {
    param($Response)
    if ($null -eq $Response -or $null -eq $Response.Content) { return "" }
    if ($Response.Content -is [byte[]]) {
        return [System.Text.Encoding]::UTF8.GetString($Response.Content)
    }
    return [string]$Response.Content
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " Running E2E Test Suite: Rate Limiting & Abuse   " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# -------------------------------------------------------------
# 1. Standard Read Request & Headers Verification
# -------------------------------------------------------------
Write-Host "`n1. Testing Default Tier Rate Limit Headers..." -ForegroundColor Yellow

$response = Invoke-WebRequest -Uri "$BaseUrl/api/v1/clinics" -Method Get -SkipHttpErrorCheck

Assert-Condition ($response.StatusCode -eq 200) "GET /api/v1/clinics returns HTTP 200"

$limitHeader = Get-HeaderValue $response.Headers 'X-RateLimit-Limit'
$remainingHeader = Get-HeaderValue $response.Headers 'X-RateLimit-Remaining'
$resetHeader = Get-HeaderValue $response.Headers 'X-RateLimit-Reset'

Assert-Condition ($limitHeader -ne $null -and [int]$limitHeader -eq 120) "X-RateLimit-Limit is 120 for default tier (got $limitHeader)"
Assert-Condition ($remainingHeader -ne $null -and [int]$remainingHeader -le 120) "X-RateLimit-Remaining is present and decremented (got $remainingHeader)"
Assert-Condition ($resetHeader -ne $null -and [int64]$resetHeader -gt 0) "X-RateLimit-Reset is a valid epoch timestamp (got $resetHeader)"

# -------------------------------------------------------------
# 2. Health Check Immunity
# -------------------------------------------------------------
Write-Host "`n2. Testing Health Probes Immunity from Rate Limiting..." -ForegroundColor Yellow

$healthLive = Invoke-WebRequest -Uri "$BaseUrl/health/live" -Method Get -SkipHttpErrorCheck
Assert-Condition ($healthLive.StatusCode -eq 200) "GET /health/live returns HTTP 200"

$healthReady = Invoke-WebRequest -Uri "$BaseUrl/health/ready" -Method Get -SkipHttpErrorCheck
Assert-Condition ($healthReady.StatusCode -eq 200) "GET /health/ready returns HTTP 200"

# -------------------------------------------------------------
# 3. Auth Tier Stricter Rate Limiting (10 req/min) & Throttling
# -------------------------------------------------------------
Write-Host "`n3. Testing Auth Tier Rate Limiting & 429 Throttling..." -ForegroundColor Yellow

# Use a unique simulated client IP so tests are idempotent and independent
$simulatedIp = "192.0.2." + (Get-Random -Minimum 10 -Maximum 240)

$authUrl = "$BaseUrl/api/auth/sign-in/email"
$authBody = @{
    email = "unregistered-test-user@amanah.local"
    password = "WrongPassword123!"
} | ConvertTo-Json

$initialAuthRes = Invoke-WebRequest -Uri $authUrl -Method Post -Body $authBody -ContentType "application/json" -Headers @{ "X-Forwarded-For" = $simulatedIp } -SkipHttpErrorCheck

$authLimit = Get-HeaderValue $initialAuthRes.Headers 'X-RateLimit-Limit'
Assert-Condition ($authLimit -eq "30") "Auth route enforces AUTH tier limit of 30 (got $authLimit)"

$maxAttempts = [int]$authLimit + 1
Write-Host "  Firing rapid requests to exhaust the $authLimit request allowance for $simulatedIp..." -ForegroundColor DarkGray
$blockedResponse = $null

for ($i = 1; $i -le $maxAttempts; $i++) {
    $res = Invoke-WebRequest -Uri $authUrl -Method Post -Body $authBody -ContentType "application/json" -Headers @{ "X-Forwarded-For" = $simulatedIp } -SkipHttpErrorCheck
    if ($res.StatusCode -eq 429) {
        $blockedResponse = $res
        break
    }
}

Assert-Condition ($blockedResponse -ne $null) "Request was throttled after exceeding tier allowance"
Assert-Condition ($blockedResponse.StatusCode -eq 429) "Throttled request returned HTTP 429 Too Many Requests"

$retryAfter = Get-HeaderValue $blockedResponse.Headers 'Retry-After'
Assert-Condition ($retryAfter -ne $null -and [int]$retryAfter -gt 0) "Retry-After header is present with positive seconds (got $retryAfter)"

# Parse RFC 7807 Problem Details
$errorJson = (Get-ResponseText $blockedResponse) | ConvertFrom-Json
Assert-Condition ($errorJson.code -eq "RATE_LIMIT_EXCEEDED") "Problem Details contains machine code 'RATE_LIMIT_EXCEEDED' (got $($errorJson.code))"
Assert-Condition ($errorJson.status -eq 429) "Problem Details status is 429 (got $($errorJson.status))"
Assert-Condition ($errorJson.type -like "*rate_limit_exceeded*") "Problem Details type URI indicates rate_limit_exceeded (got $($errorJson.type))"
Assert-Condition ($errorJson.traceId -ne $null) "Problem Details contains correlation traceId (got $($errorJson.traceId))"

# -------------------------------------------------------------
# 4. Identity & Source Isolation (Different IP has independent quota)
# -------------------------------------------------------------
Write-Host "`n4. Testing Source Isolation Across Clients..." -ForegroundColor Yellow

$freshIp = "192.0.2." + (Get-Random -Minimum 10 -Maximum 240)
$freshClientRes = Invoke-WebRequest -Uri $authUrl -Method Post -Body $authBody -ContentType "application/json" -Headers @{ "X-Forwarded-For" = $freshIp } -SkipHttpErrorCheck

Assert-Condition ($freshClientRes.StatusCode -ne 429) "Independent client ($freshIp) is NOT blocked by exhausted client"
$freshRemaining = Get-HeaderValue $freshClientRes.Headers 'X-RateLimit-Remaining'
Assert-Condition ($freshRemaining -ne $null -and [int]$freshRemaining -ge 8) "Independent client has fresh quota remaining (got $freshRemaining)"

# -------------------------------------------------------------
# Summary
# -------------------------------------------------------------
Write-Host "`n=================================================" -ForegroundColor Cyan
Write-Host " Rate Limiting Test Summary: Passed: $passed, Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "=================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
