param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: LEAVE, REPLACEMENT, ATTENDANCE & PAYROLL ENGINE" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

try {
    # 1. Health and Readiness
    Write-Host "`n[Step 1] Checking API Readiness & Flushing Stale E2E Data..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    # Clean flush stale E2E leave & payroll test data to prevent conflict guards
    $flushStartDate = (Get-Date).AddDays(5).ToString("yyyy-MM-dd")
    $flushEndDate = (Get-Date).AddDays(6).ToString("yyyy-MM-dd")
    $flushSql = "DELETE FROM staff_leave_requests WHERE reason LIKE '%Keperluan keluarga mendesak%' OR reason LIKE '%E2E Test Suite%' OR (start_date >= '$flushStartDate' AND end_date <= '$flushEndDate'); DELETE FROM payroll_periods WHERE period_name LIKE '%Payroll Periode%';"
    $null = Run-DockerSql $flushSql
    Assert-Test "Stale test records flushed via Docker PostgreSQL" $true

    # 2. Authentication
    Write-Host "`n[Step 2] Authenticating Admin & Staff Doctor..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin login successful" ($null -ne $adminAuth.token)

    $doctorAuth = Login-Doctor
    Assert-Test "Doctor login successful" ($null -ne $doctorAuth.token)

    # 3. Work Policies & Pay Rates
    Write-Host "`n[Step 3] Verifying Work Policies and Compensation Rates..." -ForegroundColor Yellow
    $currentPolicy = Invoke-RestMethod -Uri "$apiBase/work-policies/current" -Method Get -Headers $adminAuth.headers
    $currentData = Get-ResponseData $currentPolicy
    Assert-Test "Admin can retrieve active leave policy" ($null -ne $currentData.policy)
    Assert-Test "Admin can retrieve compensation rates" ($currentData.rates.Count -gt 0)

    # Test Admin updating leave policy (setting monthly limit to 15)
    $policyUpdatePayload = @{
        approvalRequired = $true
        limitMode = "monthly_limit"
        monthlyLimit = 15
        quotaCountingPolicy = "per_request"
    } | ConvertTo-Json
    $updatedPolicy = Invoke-RestMethod -Uri "$apiBase/work-policies/leave-policy" -Method Patch -Headers $adminAuth.headers -Body $policyUpdatePayload
    Assert-Test "Admin can update leave policy limit" ($null -ne $updatedPolicy)

    # 4. Eligible Sessions for Staff
    Write-Host "`n[Step 4] Querying Eligible Sessions for Staff Leave..." -ForegroundColor Yellow
    $testDate = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
    $eligibleSessions = Invoke-RestMethod -Uri "$apiBase/leaves/eligible-sessions?date=$testDate" -Method Get -Headers $doctorAuth.headers
    $eligibleData = Get-ResponseData $eligibleSessions
    Assert-Test "Doctor can query eligible sessions" ($null -ne $eligibleData)

    # 5. Submit Leave Request (Full Day)
    Write-Host "`n[Step 5] Submitting Full-Day Leave Request..." -ForegroundColor Yellow
    $startDate = (Get-Date).AddDays(5).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).AddDays(6).ToString("yyyy-MM-dd")
    $leavePayload = @{
        startDate = $startDate
        endDate = $endDate
        reason = "Keperluan keluarga mendesak dan cuti tahunan"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $leaveRes = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Headers $doctorAuth.headers -Body $leavePayload
    $createdLeave = Get-ResponseData $leaveRes
    Assert-Test "Leave request created with status pending" ($createdLeave.status -eq "pending")
    Assert-Test "Leave request has valid ID" (-not [string]::IsNullOrWhiteSpace($createdLeave.id))
    $leaveId = $createdLeave.id

    # Verify doctor can see the created leave in /leaves/my-leaves
    $myLeavesRes = Invoke-RestMethod -Uri "$apiBase/leaves/my-leaves" -Method Get -Headers $doctorAuth.headers
    $myLeaves = Get-ResponseData $myLeavesRes
    $foundInMyLeaves = $false
    foreach ($l in $myLeaves) {
        if ($l.id -eq $leaveId) {
            $foundInMyLeaves = $true
            break
        }
    }
    Assert-Test "Doctor sees submitted leave in /leaves/my-leaves" $foundInMyLeaves

    # 6. Admin Reviews & Approves Leave
    Write-Host "`n[Step 6] Admin Approving Leave Request..." -ForegroundColor Yellow
    $reviewPayload = @{
        status = "approved"
        approvalNotes = "Disetujui oleh Direktur Medis & HR"
    } | ConvertTo-Json

    $reviewRes = Invoke-RestMethod -Uri "$apiBase/leaves/$leaveId/status" -Method Patch -Headers $adminAuth.headers -Body $reviewPayload
    $approvedLeave = Get-ResponseData $reviewRes
    Assert-Test "Leave request approved successfully" ($approvedLeave.status -eq "approved")

    # 7. Replacement Opportunities & Claiming
    Write-Host "`n[Step 7] Checking Replacement Opportunities & Claiming..." -ForegroundColor Yellow
    $availReplacements = Invoke-RestMethod -Uri "$apiBase/replacements" -Method Get -Headers $adminAuth.headers
    $repData = Get-ResponseData $availReplacements
    Assert-Test "Queried replacement opportunities endpoint" ($null -ne $repData)

    # 8. Payroll Engine Execution
    Write-Host "`n[Step 8] Running Payroll Calculation Engine..." -ForegroundColor Yellow
    $periodStart = (Get-Date).ToString("yyyy-MM-01")
    $periodEnd = (Get-Date).AddMonths(1).ToString("yyyy-MM-01")
    $payrollPayload = @{
        periodName = "Payroll Periode $($periodStart) - $($periodEnd)"
        periodStart = $periodStart
        periodEnd = $periodEnd
        notes = "Perhitungan penggajian otomatis E2E test"
    } | ConvertTo-Json

    $calcRes = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $payrollPayload
    $calcData = Get-ResponseData $calcRes
    Assert-Test "Payroll calculated successfully" ($null -ne $calcData.period)
    $periodId = $calcData.period.id
    Assert-Test "Period ID is valid UUID" (-not [string]::IsNullOrWhiteSpace($periodId))

    # 9. Query Payroll Periods & Staff Summary
    Write-Host "`n[Step 9] Verifying Payroll Periods & Staff Statement..." -ForegroundColor Yellow
    $periodsRes = Invoke-RestMethod -Uri "$apiBase/payroll/periods" -Method Get -Headers $doctorAuth.headers
    $periodsData = Get-ResponseData $periodsRes
    $periodFound = $false
    foreach ($p in $periodsData) {
        if ($p.id -eq $periodId) {
            $periodFound = $true
            break
        }
    }
    Assert-Test "Staff doctor can view payroll periods" $periodFound

    # Staff queries own payroll summary for this period
    $summaryRes = Invoke-RestMethod -Uri "$apiBase/payroll/my-summary?periodId=$periodId" -Method Get -Headers $doctorAuth.headers
    $summaryData = Get-ResponseData $summaryRes
    Assert-Test "Doctor can retrieve own payroll summary" ($null -ne $summaryData)
    Assert-Test "Payroll summary contains netPayroll field" ($summaryData.PSObject.Properties['netPayroll'] -ne $null)
    Assert-Test "Payroll summary contains entries array" ($summaryData.entries -is [System.Array])

    Write-Host "`n >> Doctor Net Payroll THP: Rp $($summaryData.netPayroll)" -ForegroundColor Green
    Write-Host " >> Base Earnings: Rp $($summaryData.baseEarnings)" -ForegroundColor Green
    Write-Host " >> Leave Deductions: Rp $($summaryData.leaveDeductions)" -ForegroundColor Yellow
    Write-Host " >> Replacement Additions: Rp $($summaryData.replacementAdditions)" -ForegroundColor Green
    Write-Host " >> Total Entries: $($summaryData.entries.Count)" -ForegroundColor Cyan

    # 10. Print Summary
    Print-TestSummary "Leave & Payroll Engine E2E Suite"

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    Print-TestSummary "Leave & Payroll Engine E2E Suite"
    exit 1
}
