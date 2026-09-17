# ==============================================================================
# AMANAH HEALTHCARE BACKEND - PHASE 1 VERIFICATION (RFC 7807 & TRACING)
# ==============================================================================

$ErrorActionPreference = 'Stop'
$baseUrl = "http://localhost:3001"
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

Write-Host "=== 1. Correlation ID Propagation on Success Responses ===" -ForegroundColor Cyan
$homeRaw = (curl.exe -s -i "$baseUrl/") -join "`n"
$c1 = $homeRaw -match "x-correlation-id:\s*([a-f0-9\-]+)"
Assert-Test "GET / -> returns x-correlation-id header" $c1

$customTrace = "my-custom-trace-uuid-999"
$echoRaw = (curl.exe -s -i -H "x-correlation-id: $customTrace" "$baseUrl/") -join "`n"
$c2 = $echoRaw -match "x-correlation-id:\s*$customTrace"
Assert-Test "GET / with custom x-correlation-id -> echoes back exactly in header" $c2

Write-Host "`n=== 2. RFC 7807 Problem Details on 404 Not Found ===" -ForegroundColor Cyan
$notFoundRaw = (curl.exe -s -i -H "x-correlation-id: $customTrace" "$baseUrl/api/v1/unknown-resource-xyz") -join "`n"
$notFoundParts = $notFoundRaw -split "`n`n|`r`n`r`n"
$notFoundHeaders = $notFoundParts[0]
$notFoundBody = $notFoundParts[1] | ConvertFrom-Json

$c3 = $notFoundHeaders -match "Content-Type:\s*application/problem\+json"
Assert-Test "404 response -> Content-Type is application/problem+json" $c3

$c4 = $notFoundHeaders -match "Cache-Control:\s*no-store"
Assert-Test "404 response -> Cache-Control is no-store" $c4

$c5 = $notFoundHeaders -match "x-correlation-id:\s*$customTrace"
Assert-Test "404 response -> x-correlation-id header matches custom trace" $c5

$c6 = $notFoundBody.status -eq 404
Assert-Test "404 problem details -> status is 404" $c6

$c7 = $notFoundBody.code -eq "NOT_FOUND"
Assert-Test "404 problem details -> code is NOT_FOUND" $c7

$c8 = $notFoundBody.traceId -eq $customTrace
Assert-Test "404 problem details -> traceId matches custom trace" $c8

$c9 = $notFoundBody.type -like "https://amanah.health/errors/*"
Assert-Test "404 problem details -> type starts with https://amanah.health/errors" $c9

$c10 = $notFoundBody.instance -eq "/api/v1/unknown-resource-xyz"
Assert-Test "404 problem details -> instance matches request URL" $c10

Write-Host "`n=== 3. RFC 7807 Problem Details on 422 Validation Error ===" -ForegroundColor Cyan
$valRaw = (curl.exe -s -i -H "Content-Type: application/json" -d "{}" "$baseUrl/api/v1/auth/email/login") -join "`n"
$valParts = $valRaw -split "`n`n|`r`n`r`n"
$valHeaders = $valParts[0]
$valBody = $valParts[1] | ConvertFrom-Json

$c11 = $valHeaders -match "Content-Type:\s*application/problem\+json"
Assert-Test "422 response -> Content-Type is application/problem+json" $c11

$c12 = $valBody.status -eq 422
Assert-Test "422 response -> status is 422" $c12

$c13 = $valBody.code -eq "VALIDATION_FAILED"
Assert-Test "422 response -> code is VALIDATION_FAILED" $c13

$c14 = $valBody.invalidParams.Count -ge 2
Assert-Test "422 response -> invalidParams enumerates missing fields" $c14

$emailParam = $valBody.invalidParams | Where-Object { $_.name -eq "email" }
$c15 = $null -ne $emailParam
Assert-Test "422 response -> invalidParams contains field 'email'" $c15

Write-Host "`n=== 4. RFC 7807 Problem Details on 401 Unauthorized ===" -ForegroundColor Cyan
$authRaw = (curl.exe -s -i "$baseUrl/api/v1/notifications/me") -join "`n"
$authParts = $authRaw -split "`n`n|`r`n`r`n"
$authHeaders = $authParts[0]
$authBody = $authParts[1] | ConvertFrom-Json

$c16 = $authBody.status -eq 401
Assert-Test "401 response -> status is 401" $c16

$c17 = $authBody.code -eq "UNAUTHENTICATED"
Assert-Test "401 response -> code is UNAUTHENTICATED" $c17

$c18 = ($null -ne $authBody.traceId -and $authBody.traceId.Length -gt 10)
Assert-Test "401 response -> traceId is populated" $c18

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Phase 1 Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
