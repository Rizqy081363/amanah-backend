# ==============================================================================
# Amanah Healthcare - Master E2E Appointment & Queue Test Runner
# Executes all single-responsibility E2E suites sequentially
# ==============================================================================

param(
    [switch]$StopOnFail = $true
)

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$suites = @(
    @{ Name = "1. Booking Workflow"; File = "appointment/test-book.ps1" },
    @{ Name = "2. Reschedule Workflow"; File = "appointment/test-reschedule.ps1" },
    @{ Name = "3. Call & Service Lifecycle"; File = "appointment/test-call-lifecycle.ps1" },
    @{ Name = "4. Cancellation Workflow"; File = "appointment/test-cancel.ps1" },
    @{ Name = "5. Closure & Rule R15 Protection"; File = "appointment/test-closure.ps1" }
)

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host " AMANAH HEALTHCARE - FULL E2E APPOINTMENT & QUEUE TEST SUITE" -ForegroundColor Green
Write-Host " Target Environment: Docker Local (PostgreSQL + NestJS API)" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green

$results = @()
$totalPassed = 0
$totalFailed = 0
$suiteStartTime = Get-Date

foreach ($suite in $suites) {
    $suitePath = Join-Path $scriptDir $suite.File
    Write-Host "`n>>> RUNNING: $($suite.Name) [$($suite.File)]" -ForegroundColor Cyan
    
    $suiteResult = @{
        Name = $suite.Name
        Passed = $false
        Error = $null
    }
    
    try {
        & powershell -ExecutionPolicy Bypass -File $suitePath
        if ($LASTEXITCODE -eq 0) {
            $suiteResult.Passed = $true
            $totalPassed++
            Write-Host ">>> COMPLETED: $($suite.Name) - SUCCESS" -ForegroundColor Green
        } else {
            $suiteResult.Passed = $false
            $suiteResult.Error = "Exited with code $LASTEXITCODE"
            $totalFailed++
            Write-Host ">>> FAILED: $($suite.Name) - ERROR CODE $LASTEXITCODE" -ForegroundColor Red
            if ($StopOnFail) {
                break
            }
        }
    } catch {
        $suiteResult.Passed = $false
        $suiteResult.Error = $_.Exception.Message
        $totalFailed++
        Write-Host ">>> FAILED: $($suite.Name) - $($_.Exception.Message)" -ForegroundColor Red
        if ($StopOnFail) {
            break
        }
    }
    
    $results += $suiteResult
}

$duration = ((Get-Date) - $suiteStartTime).TotalSeconds

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " GRAND E2E TEST SUMMARY" -ForegroundColor Cyan
Write-Host " Duration: [math]::Round($duration, 2)s" -ForegroundColor DarkGray
Write-Host " Suites Executed: $($results.Count) | Passed: $totalPassed | Failed: $totalFailed" -ForegroundColor $(if ($totalFailed -eq 0) { "Green" } else { "Red" })
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Cyan

foreach ($r in $results) {
    $statusText = if ($r.Passed) { "[PASS]" } else { "[FAIL]" }
    $color = if ($r.Passed) { "Green" } else { "Red" }
    Write-Host " $statusText $($r.Name) $(if ($r.Error) { "- " + $r.Error })" -ForegroundColor $color
}

Write-Host "==============================================================================" -ForegroundColor Cyan

if ($totalFailed -gt 0) {
    exit 1
} else {
    exit 0
}
