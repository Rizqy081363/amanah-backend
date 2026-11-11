# ==============================================================================
# Amanah Healthcare - E2E Test: Payroll Export Availability & Formatting
# Verifies:
# 1. Admin check-availability returns clinic-wide count (17 rows) for November 2026
# 2. Specific staff check-availability returns individual staff count
# 3. Export PDF job executes and finishes with status 'completed'
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:3001/api/v1"
)

$ErrorActionPreference = "Stop"

$commonPath = Join-Path $PSScriptRoot "common.ps1"
if (-not (Test-Path $commonPath)) {
    throw "Common helper file not found at: $commonPath"
}
. $commonPath

Reset-TestCounters

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [SCENARIO] PAYROLL EXPORT: CLINIC-WIDE AVAILABILITY & EXPORT VERIFICATION" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Authenticate Admin
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Admin..." -ForegroundColor Yellow
$adminAuth = Login-Admin
Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

$apiUrl = Get-E2EApiBaseUrl
$headers = @{
    "Authorization" = "Bearer $($adminAuth.token)"
    "Content-Type"  = "application/json"
}

# ------------------------------------------------------------------------------
# STEP 2: Query Active Payroll Period from Database
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Querying active period and actual payroll count from Database..." -ForegroundColor Yellow
$periodId = Run-DockerSql "SELECT id FROM payroll_periods WHERE period_start = '2026-11-01' LIMIT 1;"
$periodId = $periodId.Trim()
Assert-Test "November 2026 payroll period found in DB" (-not [string]::IsNullOrWhiteSpace($periodId))
Write-Host " [DB] Found Period ID: $periodId" -ForegroundColor Gray

$expectedCount = Run-DockerSql "SELECT count(*) FROM payroll_entries WHERE payroll_period_id = '$periodId';"
$expectedCount = [int]($expectedCount.Trim())
Assert-Test "Payroll entries exist in database ($expectedCount entries)" ($expectedCount -gt 0)
Write-Host " [DB] Expected clinic-wide count: $expectedCount" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# STEP 3: Test Check-Availability for Clinic-Wide Payroll
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Testing check-availability endpoint for clinic-wide payroll..." -ForegroundColor Yellow
$checkPayload = @{
    exportType = "payroll"
    parameters = @{
        periodId = $periodId
    }
} | ConvertTo-Json

$checkRes = Invoke-RestMethod -Uri "$apiUrl/exports/check-availability" -Method Post -Headers $headers -Body $checkPayload
Write-Host " [API Response] available = $($checkRes.available), totalRows = $($checkRes.totalRows)" -ForegroundColor Gray

Assert-Test "Check-availability returns available = true" ($checkRes.available -eq $true)
Assert-Test "Check-availability returns totalRows = $expectedCount" ($checkRes.totalRows -eq $expectedCount)

# ------------------------------------------------------------------------------
# STEP 4: Test Check-Availability for Specific Staff (Dewi Anggraeni)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Testing check-availability for specific staff (STF-CS-002)..." -ForegroundColor Yellow
$dewiStaffId = Run-DockerSql "SELECT id FROM staff_profiles WHERE staff_code = 'STF-CS-002' LIMIT 1;"
$dewiStaffId = $dewiStaffId.Trim()

if (-not [string]::IsNullOrWhiteSpace($dewiStaffId)) {
    $dewiExpected = Run-DockerSql "SELECT count(*) FROM payroll_entries WHERE payroll_period_id = '$periodId' AND staff_profile_id = '$dewiStaffId';"
    $dewiExpected = [int]($dewiExpected.Trim())

    $dewiPayload = @{
        exportType = "payroll"
        parameters = @{
            periodId       = $periodId
            staffProfileId = $dewiStaffId
        }
    } | ConvertTo-Json

    $dewiRes = Invoke-RestMethod -Uri "$apiUrl/exports/check-availability" -Method Post -Headers $headers -Body $dewiPayload
    Write-Host " [API Response] Dewi Anggraeni available = $($dewiRes.available), totalRows = $($dewiRes.totalRows)" -ForegroundColor Gray

    Assert-Test "Specific staff check-availability returns available = true" ($dewiRes.available -eq $true)
    Assert-Test "Specific staff totalRows matches DB ($dewiExpected)" ($dewiRes.totalRows -eq $dewiExpected)
}

# ------------------------------------------------------------------------------
# STEP 5: Request PDF Export and Await Completion
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Requesting PDF Export..." -ForegroundColor Yellow
$exportPayload = @{
    exportType = "payroll"
    format     = "pdf"
    parameters = @{
        periodId = $periodId
    }
} | ConvertTo-Json

$exportReq = Invoke-RestMethod -Uri "$apiUrl/exports" -Method Post -Headers $headers -Body $exportPayload
$jobId = $exportReq.jobId
Assert-Test "Export job created (Job ID: $jobId)" (-not [string]::IsNullOrWhiteSpace($jobId))

# Poll job status until completed
$status = $exportReq.status
$maxWaitSec = 20
$startTime = Get-Date

while ($status -ne "completed" -and ((Get-Date) - $startTime).TotalSeconds -lt $maxWaitSec) {
    Start-Sleep -Seconds 1
    $jobInfo = Invoke-RestMethod -Uri "$apiUrl/exports/$jobId" -Method Get -Headers $headers
    $status = $jobInfo.status
    Write-Host " [POLL] Status: $status, percent: $($jobInfo.percent)%" -ForegroundColor Gray
    if ($status -eq "failed") {
        throw "Export job failed: $($jobInfo.errorMessage)"
    }
}

Assert-Test "Export job reached status 'completed'" ($status -eq "completed")

# ------------------------------------------------------------------------------
# STEP 6: Verify Download Endpoint
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Verifying file download..." -ForegroundColor Yellow
$tempPdfPath = Join-Path $env:TEMP "payroll_test_$jobId.pdf"
try {
    Invoke-WebRequest -Uri "$apiUrl/exports/$jobId/download" -Headers @{ Authorization = "Bearer $($adminAuth.token)" } -OutFile $tempPdfPath
    $fileInfo = Get-Item $tempPdfPath
    Assert-Test "Downloaded PDF file exists and has size ($($fileInfo.Length) bytes)" ($fileInfo.Length -gt 1000)
} finally {
    if (Test-Path $tempPdfPath) {
        Remove-Item $tempPdfPath -Force -ErrorAction SilentlyContinue
    }
}

Print-TestSummary "Payroll Export Availability & Formatting Test"
