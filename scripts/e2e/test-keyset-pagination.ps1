# ==============================================================================
# AMANAH HEALTHCARE BACKEND - KEYSET / CURSOR PAGINATION & SORTING E2E SUITE
# Per ARC-080, ARC-081, ARC-082, API-086..092
# ==============================================================================

$ErrorActionPreference = "Continue"
$BaseUrl = "http://localhost:3001"
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

Write-Host "=== Phase 5: Keyset / Cursor Pagination & Deterministic Sorting Verification ===" -ForegroundColor Cyan

# 0. Setup: Authenticate Admin and Doctor
$adminLogin = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body '{"email":"admin@amanah.com","password":"secret123"}' `
    -ContentType "application/json"
$adminHeaders = @{ "Authorization" = "Bearer $($adminLogin.token)" }

$docLogin = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body '{"email":"dokter@amanah.com","password":"secret123"}' `
    -ContentType "application/json"
$docHeaders = @{ "Authorization" = "Bearer $($docLogin.token)" }

# ------------------------------------------------------------------------------
# 1. Appointments: Keyset Cursor Forward Pagination & Deterministic Ordering
# ------------------------------------------------------------------------------
Write-Host "`n--- 1. Appointments Keyset Pagination (ARC-081, API-087..092) ---" -ForegroundColor Yellow

# Fetch page 1 with limit=2
$aptPage1 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments?limit=2" `
    -Method Get `
    -Headers $docHeaders

Assert-Test "Page 1 returns structured envelope with data and meta (API-065)" ($null -ne $aptPage1.data -and $null -ne $aptPage1.meta)
Assert-Test "Page 1 contains exactly 2 appointments (ARC-080)" ($aptPage1.data.Count -eq 2)
Assert-Test "Page 1 meta indicates limit = 2" ($aptPage1.meta.limit -eq 2)
Assert-Test "Page 1 meta indicates hasNextPage = true" ($aptPage1.meta.hasNextPage -eq $true)
Assert-Test "Page 1 returns non-null opaque nextCursor (API-089)" (-not [string]::IsNullOrEmpty($aptPage1.meta.nextCursor))

$cursor1 = $aptPage1.meta.nextCursor
$page1Ids = @($aptPage1.data[0].id, $aptPage1.data[1].id)

# Fetch page 2 using cursor from page 1
$aptPage2 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/appointments?limit=2&cursor=$cursor1" `
    -Method Get `
    -Headers $docHeaders

Assert-Test "Page 2 successfully loaded using nextCursor" ($null -ne $aptPage2.data -and $aptPage2.data.Count -gt 0)

$page2Ids = @($aptPage2.data | ForEach-Object { $_.id })
$hasOverlap = $false
foreach ($id in $page2Ids) {
    if ($page1Ids -contains $id) {
        $hasOverlap = $true
        break
    }
}
Assert-Test "Zero overlap between Page 1 and Page 2 records (ARC-082, API-092)" (-not $hasOverlap)

# Verify deterministic descending timestamp ordering
$time1 = [DateTime]$aptPage1.data[0].createdAt
$time2 = [DateTime]$aptPage1.data[1].createdAt
$time3 = [DateTime]$aptPage2.data[0].createdAt
Assert-Test "Deterministic descending order across pages: Page1[0] >= Page1[1]" ($time1 -ge $time2)
Assert-Test "Deterministic descending order across pages: Page1[1] >= Page2[0]" ($time2 -ge $time3)

# ------------------------------------------------------------------------------
# 2. Tampered & Invalid Cursor Validation (API-089)
# ------------------------------------------------------------------------------
Write-Host "`n--- 2. Tampered and Malformed Cursor Protection (API-089) ---" -ForegroundColor Yellow

$badCursorRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments?cursor=not-a-valid-cursor" `
    -Method Get `
    -Headers $docHeaders `
    -SkipHttpErrorCheck

Assert-Test "Malformed cursor string is rejected with 400 Bad Request" ($badCursorRes.StatusCode -eq 400)

$emptyJsonCursor = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("{}")).Replace('+', '-').Replace('/', '_').TrimEnd('=')
$emptyJsonRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments?cursor=$emptyJsonCursor" `
    -Method Get `
    -Headers $docHeaders `
    -SkipHttpErrorCheck

Assert-Test "Tampered cursor missing keyset fields is rejected with 400 Bad Request" ($emptyJsonRes.StatusCode -eq 400)

# ------------------------------------------------------------------------------
# 3. Server-side Query Boundary Enforcement (ARC-080, API-088)
# ------------------------------------------------------------------------------
Write-Host "`n--- 3. Enforced Query Boundaries (ARC-080, API-088) ---" -ForegroundColor Yellow

$overLimitRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments?limit=500" `
    -Method Get `
    -Headers $docHeaders `
    -SkipHttpErrorCheck

Assert-Test "Request exceeding maximum page size (limit=500 > 100) is rejected with 422 Unprocessable Entity" ($overLimitRes.StatusCode -eq 422)

$zeroLimitRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments?limit=0" `
    -Method Get `
    -Headers $docHeaders `
    -SkipHttpErrorCheck

Assert-Test "Request with zero page size (limit=0 < 1) is rejected with 422 Unprocessable Entity" ($zeroLimitRes.StatusCode -eq 422)

# ------------------------------------------------------------------------------
# 4. Medical Records: Keyset Cursor Pagination (ARC-081, ARC-082)
# ------------------------------------------------------------------------------
Write-Host "`n--- 4. Medical Records Keyset Pagination ---" -ForegroundColor Yellow

$mrPage1 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/medical-records?limit=2" `
    -Method Get `
    -Headers $docHeaders

Assert-Test "Medical records returns structured envelope with data and meta" ($null -ne $mrPage1.data -and $null -ne $mrPage1.meta)
Assert-Test "Medical records Page 1 limit matches requested limit (2)" ($mrPage1.meta.limit -eq 2)

if ($mrPage1.meta.hasNextPage -and -not [string]::IsNullOrEmpty($mrPage1.meta.nextCursor)) {
    $mrCursor1 = $mrPage1.meta.nextCursor
    $mrPage2 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/medical-records?limit=2&cursor=$mrCursor1" `
        -Method Get `
        -Headers $docHeaders

    Assert-Test "Medical records Page 2 fetched successfully using cursor" ($mrPage2.data.Count -gt 0)
    $mrP1Ids = @($mrPage1.data | ForEach-Object { $_.id })
    $mrP2Ids = @($mrPage2.data | ForEach-Object { $_.id })

    $mrOverlap = $false
    foreach ($id in $mrP2Ids) {
        if ($mrP1Ids -contains $id) {
            $mrOverlap = $true
            break
        }
    }
    Assert-Test "Zero overlap between Medical Records Page 1 and Page 2" (-not $mrOverlap)
} else {
    Assert-Test "Single page dataset correctly marks hasNextPage = false" ($mrPage1.meta.hasNextPage -eq $false)
}

# ------------------------------------------------------------------------------
# 5. High-Volume Audit Logs Keyset Pagination & Deterministic Sorting (ARC-082, ARC-122)
# ------------------------------------------------------------------------------
Write-Host "`n--- 5. Audit Logs Keyset Pagination & Primary Key Tiebreaker (ARC-082, ARC-122) ---" -ForegroundColor Yellow

$auditPage1 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/audit-logs?limit=3" `
    -Method Get `
    -Headers $adminHeaders

Assert-Test "Audit logs endpoint returns structured data and meta envelope" ($null -ne $auditPage1.data -and $null -ne $auditPage1.meta)
Assert-Test "Audit logs Page 1 returns requested limit (3)" ($auditPage1.meta.limit -eq 3)

if ($auditPage1.meta.hasNextPage -and -not [string]::IsNullOrEmpty($auditPage1.meta.nextCursor)) {
    $auditCursor = $auditPage1.meta.nextCursor
    $auditPage2 = Invoke-RestMethod -Uri "$BaseUrl/api/v1/audit-logs?limit=3&cursor=$auditCursor" `
        -Method Get `
        -Headers $adminHeaders

    Assert-Test "Audit logs Page 2 fetched successfully via cursor" ($auditPage2.data.Count -gt 0)
    $a1Ids = @($auditPage1.data | ForEach-Object { $_.id })
    $a2Ids = @($auditPage2.data | ForEach-Object { $_.id })

    $auditOverlap = $false
    foreach ($id in $a2Ids) {
        if ($a1Ids -contains $id) {
            $auditOverlap = $true
            break
        }
    }
    Assert-Test "Zero overlap between Audit Log pages: deterministic tiebreaker verified" (-not $auditOverlap)
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Keyset Pagination Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 }
