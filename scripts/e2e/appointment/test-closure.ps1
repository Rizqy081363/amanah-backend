# ==============================================================================
# Amanah Healthcare - E2E Single-Responsibility Test: Clinic Closure & Rule R15
# Domain: Session/Clinic Closure, ticket carry-over, and Rule R15 protection
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:3001/api/v2"
)

$ErrorActionPreference = "Stop"

# 1. Source Common Test Library
$commonPath = Join-Path $PSScriptRoot "..\common.ps1"
if (-not (Test-Path $commonPath)) {
    throw "Common helper file not found at: $commonPath"
}
. $commonPath

Reset-TestCounters

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [SCENARIO 5] CLINIC CLOSURE & RULE R15 PROTECTION (API & RUNTIME TRUTH)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Authenticate Admin
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Admin..." -ForegroundColor Yellow
$adminAuth = Login-Admin
Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

# ------------------------------------------------------------------------------
# STEP 2: Configure Closure Parameters
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Setting Up Closure Scope and Timings..." -ForegroundColor Yellow
$closureDate = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
$startsAt = "${closureDate}T06:00:00.000Z"
$endsAt = "${closureDate}T12:00:00.000Z"
$closureReason = "E2E Scheduled Sanitation and Clinic Maintenance"

$closurePayload = @{
    scope = "clinic"
    inputKind = "session"
    startsAt = $startsAt
    endsAt = $endsAt
    reason = $closureReason
    lastCallBufferMin = 15
} | ConvertTo-Json

Write-Host " Target Closure Date : $closureDate" -ForegroundColor DarkGray
Write-Host " Interval             : $startsAt to $endsAt" -ForegroundColor DarkGray
Write-Host " Scope / Kind         : clinic / session" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 3: Preview Closure Impact via API
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Calling Closure Preview Endpoint..." -ForegroundColor Yellow
$v2Url = "http://localhost:3001/api/v2"

$previewRes = Invoke-RestMethod -Uri "$v2Url/admin/closures/preview" -Method Post -Headers $adminAuth.headers -Body $closurePayload -ContentType "application/json"
$previewData = Get-ResponseData $previewRes

Assert-Test "Closure preview succeeded" ($previewRes.success -eq $true)
Assert-Test "Preview contains totalAffected count" ($null -ne $previewData.totalAffected)
Assert-Test "Preview reports inServiceProtected count (Rule R15)" ($null -ne $previewData.inServiceProtected)
Write-Host " Affected Tickets: $($previewData.totalAffected), In-Service Protected: $($previewData.inServiceProtected)" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 4: Apply Closure via API
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Applying Clinic Closure..." -ForegroundColor Yellow
$applyRes = Invoke-RestMethod -Uri "$v2Url/admin/closures" -Method Post -Headers $adminAuth.headers -Body $closurePayload -ContentType "application/json"
$applyData = Get-ResponseData $applyRes

Assert-Test "Apply closure API succeeded" ($applyRes.success -eq $true)
Assert-Test "Closure ID returned" ($null -ne $applyData.closureId)
$closureId = $applyData.closureId
Write-Host " Applied Closure ID: $closureId" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 5: Direct Database Verification via Docker PostgreSQL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Verifying Database State via Docker PostgreSQL..." -ForegroundColor Yellow
$dbClosureCount = Run-DockerSql "SELECT count(*) FROM clinic_closure WHERE id = '$closureId';"
Assert-Test "Database clinic_closure record exists" ($dbClosureCount.Trim() -eq "1")

$dbScope = Run-DockerSql "SELECT scope FROM clinic_closure WHERE id = '$closureId';"
Assert-Test "Database closure scope is clinic" ($dbScope.Trim() -eq "clinic")

$dbInputKind = Run-DockerSql "SELECT input_kind FROM clinic_closure WHERE id = '$closureId';"
Assert-Test "Database closure input_kind is session" ($dbInputKind.Trim() -eq "session")

$dbReason = Run-DockerSql "SELECT reason FROM clinic_closure WHERE id = '$closureId';"
Assert-Test "Database closure reason verified" ($dbReason.Trim() -eq $closureReason)

Write-Host "`n[SCENARIO 5 COMPLETED] Clinic closure and Rule R15 evaluated honestly." -ForegroundColor Green
Print-TestSummary "Clinic Closure & Rule R15 Suite"
