param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: PAYROLL CLOSED-BOOK ACCOUNTING GOVERNANCE & DYNAMIC RATES" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

function Flush-RedisCache {
    Write-Host " [FLUSH] Flushing Redis Cache via docker exec backend-redis-1..." -ForegroundColor Yellow
    try {
        $flushResult = docker exec backend-redis-1 redis-cli FLUSHALL 2>&1
        Write-Host " [FLUSH] Redis result: $flushResult" -ForegroundColor Gray
    } catch {
        Write-Host " [WARN] Failed to flush Redis: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

$TestPeriodId = $null

try {
    # --------------------------------------------------------------------------
    # PRE-FLIGHT
    # --------------------------------------------------------------------------
    Write-Host "`n[Pre-Flight 1/2] Flushing Redis Cache..." -ForegroundColor Yellow
    Flush-RedisCache

    Write-Host "`n[Pre-Flight 2/2] Checking API Readiness & Logging in as Admin..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    # --------------------------------------------------------------------------
    # STEP 1: CREATE A TEST CALCULATED PERIOD
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Creating a Dedicated Test Period for Closed-Book Audit..." -ForegroundColor Yellow
    $testStart = "2027-01-01"
    $testEnd = "2027-01-31"
    $calcPayload = @{
        periodName = "Payroll Audit Closed-Book Governance 2027"
        periodStart = $testStart
        periodEnd = $testEnd
        notes = "Audit Closed-Book Accounting Lock"
    } | ConvertTo-Json

    $calcRes = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $calcPayload
    $calcData = Get-ResponseData $calcRes
    Assert-Test "Test period created and calculated" ($null -ne $calcData.period)
    Assert-Test "Test period status is calculated" ($calcData.period.status -eq 'calculated')
    $TestPeriodId = $calcData.period.id
    Write-Host "  >> Created Test Period ID: $TestPeriodId (Status: $($calcData.period.status))" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # STEP 2: DYNAMICALLY UPDATE COMPENSATION RATES (ADMIN CONFIG)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Admin Updating Compensation Rates Dinamically..." -ForegroundColor Yellow
    $updateRatesPayload = @{
        rates = @(
            @{
                category = "doctor"
                hourlyRate = 180000
                overtimeHourlyRate = 240000
                notes = "Penyesuaian tarif dinamis dokter audit"
            },
            @{
                category = "midwife"
                hourlyRate = 160000
                overtimeHourlyRate = 210000
                notes = "Penyesuaian tarif dinamis bidan audit"
            },
            @{
                category = "worker"
                hourlyRate = 85000
                overtimeHourlyRate = 110000
                notes = "Penyesuaian tarif dinamis staf audit"
            }
        )
    } | ConvertTo-Json -Depth 5

    $putRatesRes = Invoke-RestMethod -Uri "$apiBase/work-policies/compensation-rates" -Method Put -Headers $adminAuth.headers -Body $updateRatesPayload
    $updatedRates = Get-ResponseData $putRatesRes
    Assert-Test "Compensation rates updated dynamically via PUT API" ($updatedRates.Count -ge 3)

    $docUpdated = $updatedRates | Where-Object { $_.category -eq 'doctor' } | Select-Object -First 1
    Assert-Test "Doctor rate now Rp 180.000 / Rp 240.000" ([double]$docUpdated.hourlyRate -eq 180000 -and [double]$docUpdated.overtimeHourlyRate -eq 240000)

    # --------------------------------------------------------------------------
    # STEP 3: RECALCULATE ACTIVE PERIOD (DRAFT/CALCULATED REFLECTS NEW RATES)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Recalculating Active Period While Unfinalized..." -ForegroundColor Yellow
    $recalcRes = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $calcPayload
    $recalcData = Get-ResponseData $recalcRes
    Assert-Test "Recalculation succeeded for active period" ($null -ne $recalcData.period)

    # Check that entries in test period use the new rate (180.000)
    $sampleDocEntry = Run-DockerSql "SELECT hourly_rate FROM payroll_entries WHERE payroll_period_id = '$TestPeriodId' AND entry_type = 'base_scheduled' AND hourly_rate = 180000.00 LIMIT 1;"
    Assert-Test "Active period recalculation captured new dynamic rate (Rp 180.000)" ($sampleDocEntry.Trim() -eq "180000.00")
    Write-Host "  >> Live entry snapshot hourly_rate: Rp $($sampleDocEntry.Trim())" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # STEP 4: FINALIZE PERIOD (TUTUP BUKU / LOCK PERIOD)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Admin Finalizing Payroll Period (Tutup Buku)..." -ForegroundColor Yellow
    $finalizeRes = Invoke-RestMethod -Uri "$apiBase/payroll/periods/$TestPeriodId/finalize" -Method Patch -Headers $adminAuth.headers
    $finalizeData = Get-ResponseData $finalizeRes
    Assert-Test "Finalize endpoint returned success" ($null -ne $finalizeData)
    Assert-Test "Period status transitioned to 'finalized'" ($finalizeData.status -eq 'finalized')
    Write-Host "  >> Period $TestPeriodId is now officially CLOSED & LOCKED (Status: $($finalizeData.status))" -ForegroundColor Cyan

    # --------------------------------------------------------------------------
    # STEP 5: ATTEMPT TO RECALCULATE FINALIZED PERIOD (MUST BE REJECTED 400)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Testing Anti-Corruption Guard: Attempting to recalculate finalized period..." -ForegroundColor Yellow
    $recalcBlocked = $false
    $blockErrorMessage = ""

    try {
        Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $calcPayload
    } catch {
        $recalcBlocked = $true
        $body = ""
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $body = $_.ErrorDetails.Message
        } elseif ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
            } catch {}
        }
        $blockErrorMessage = "$($_.Exception.Message) $body"
        Write-Host "  >> Server successfully blocked recalculation: $blockErrorMessage" -ForegroundColor Green
    }

    Assert-Test "Recalculation on finalized period is strictly BLOCKED (400 Bad Request)" ($recalcBlocked -eq $true)
    Assert-Test "Error message mentions FINALIZED / DITUTUP BUKU" ($blockErrorMessage -match 'FINALIZED|DITUTUP BUKU')

} finally {
    # --------------------------------------------------------------------------
    # TEARDOWN & RESTORATION
    # --------------------------------------------------------------------------
    Write-Host "`n[Teardown] Restoring Standard Rates & Cleaning Test Period..." -ForegroundColor Yellow

    # Restore standard rates (Doctor: 150k/200k, Midwife: 150k/200k, Worker: 75k/100k)
    $restoreRatesPayload = @{
        rates = @(
            @{
                category = "doctor"
                hourlyRate = 150000
                overtimeHourlyRate = 200000
                notes = "Standar tarif dokter klinik"
            },
            @{
                category = "midwife"
                hourlyRate = 150000
                overtimeHourlyRate = 200000
                notes = "Standar tarif bidan klinik"
            },
            @{
                category = "worker"
                hourlyRate = 75000
                overtimeHourlyRate = 100000
                notes = "Standar tarif staf operasional"
            }
        )
    } | ConvertTo-Json -Depth 5

    try {
        Invoke-RestMethod -Uri "$apiBase/work-policies/compensation-rates" -Method Put -Headers $adminAuth.headers -Body $restoreRatesPayload | Out-Null
        Write-Host "  [OK] Standard compensation rates restored." -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Failed to restore rates: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    # Delete test period and entries
    if ($TestPeriodId) {
        $delEntriesQuery = "DELETE FROM payroll_entries WHERE payroll_period_id = '$TestPeriodId';"
        $delPeriodQuery = "DELETE FROM payroll_periods WHERE id = '$TestPeriodId';"
        Run-DockerSql $delEntriesQuery
        Run-DockerSql $delPeriodQuery
        Write-Host "  [OK] Cleaned up test period $TestPeriodId." -ForegroundColor Green
    }

    Flush-RedisCache
    Print-TestSummary "Payroll Closed-Book Accounting Governance Suite"
}

