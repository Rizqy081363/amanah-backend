param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: ATTENDANCE, LEAVE, REPLACEMENT & PAYROLL ENGINE MUTATIONS" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

function Get-DynamicStaffJwt([string]$email) {
    $backendDir = Resolve-Path "$PSScriptRoot\..\.."
    $jwtScript = Join-Path $backendDir "scripts\dev\get-jwt-user.ts"
    $token = (bun $jwtScript --email "$email" --raw).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Failed to generate dynamic JWT token for $email"
    }
    return @{
        token = $token
        headers = @{
            Authorization = "Bearer $token"
            "Content-Type" = "application/json"
        }
    }
}

try {
    # --------------------------------------------------------------------------
    # 1. API Readiness
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Checking API Readiness..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    # --------------------------------------------------------------------------
    # 2. Authentication (Admin & Dynamic Staff Tokens)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Authenticating Admin, Doctor, Midwife, and Worker..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    $doctorAuth = Get-DynamicStaffJwt "dokter@amanah.com"
    Assert-Test "Doctor dynamic JWT generated" ($null -ne $doctorAuth.token)

    $midwifeAuth = Get-DynamicStaffJwt "bidan@amanah.com"
    Assert-Test "Midwife dynamic JWT generated" ($null -ne $midwifeAuth.token)

    $workerAuth = Get-DynamicStaffJwt "staff.operasional@amanah.clinic"
    Assert-Test "Worker dynamic JWT generated" ($null -ne $workerAuth.token)

    # --------------------------------------------------------------------------
    # 3. Work Policies & Rates Inspection
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Verifying Active Work Policies & Compensation Rates..." -ForegroundColor Yellow
    $policyRes = Invoke-RestMethod -Uri "$apiBase/work-policies/current" -Method Get -Headers $adminAuth.headers
    $policyData = Get-ResponseData $policyRes
    Assert-Test "Leave policy is active and loaded" ($null -ne $policyData.policy)
    Assert-Test "Compensation rates populated" ($policyData.rates.Count -ge 3)
    Write-Host "  >> Policy Limit Mode: $($policyData.policy.limitMode)" -ForegroundColor Gray

    # Clean previous test records to allow fresh idempotent mutation
    Run-DockerSql @"
DELETE FROM staff_attendance_records WHERE attendance_date = CURRENT_DATE AND (staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('dokter@amanah.com', 'staff.operasional@amanah.clinic'))));
DELETE FROM leave_request_sessions WHERE leave_request_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email = 'dokter@amanah.com')) AND start_date >= CURRENT_DATE);
DELETE FROM replacement_opportunities WHERE leave_request_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email = 'dokter@amanah.com')) AND start_date >= CURRENT_DATE);
DELETE FROM staff_leave_requests WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email = 'dokter@amanah.com')) AND start_date >= CURRENT_DATE;
"@ | Out-Null

    # --------------------------------------------------------------------------
    # 4. QR Session Rotation Mutation (Terminal / Admin)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Rotating QR Session Code for Terminal Presensi..." -ForegroundColor Yellow
    # Night shift has 5.5 net scheduled hours, allowing 4-hour elapsed duty validation
    $testShift = "night"

    $rotatePayload = @{
        sessionType = "location_check_in"
        shift = $testShift
        rotationSeconds = 30
        context = "Terminal Poli Umum E2E Mutation Test"
    } | ConvertTo-Json

    $qrRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $rotatePayload
    $qrData = Get-ResponseData $qrRes
    Assert-Test "QR session generated successfully" ($null -ne $qrData)
    Assert-Test "QR qrCodeIdentifier returned" (-not [string]::IsNullOrWhiteSpace($qrData.qrCodeIdentifier))
    $activeQrToken = $qrData.qrCodeIdentifier
    Write-Host "  >> Active QR Token / PIN: $activeQrToken" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 5. Doctor Check-In via QR Token Scan
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Doctor Checking In via QR Code Scan..." -ForegroundColor Yellow
    $scanPayload = @{
        qrToken = $activeQrToken
        shift = $testShift
        deviceInfo = "E2E Automated Flutter Client Test"
    } | ConvertTo-Json

    $scanRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanPayload
    $scanData = Get-ResponseData $scanRes
    Assert-Test "Doctor check-in succeeded" ($null -ne $scanData.id)
    Assert-Test "Doctor attendance status is present or late" ($scanData.status -in @("present", "late"))
    $doctorAttendanceId = $scanData.id
    Write-Host "  >> Doctor Attendance ID: $doctorAttendanceId (Status: $($scanData.status))" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 6. Worker Check-In via Manual Attendance
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Worker Checking In via Manual Input..." -ForegroundColor Yellow
    $manualPayload = @{
        staffIdOrCode = "STF-OPS-001"
        shift = "morning"
        status = "present"
        notes = "Presensi manual dicatat staf operasional"
    } | ConvertTo-Json

    $manualRes = Invoke-RestMethod -Uri "$apiBase/attendance/manual" -Method Post -Headers $workerAuth.headers -Body $manualPayload
    $manualData = Get-ResponseData $manualRes
    Assert-Test "Worker manual check-in succeeded" ($null -ne $manualData.id)
    Assert-Test "Worker manual check-in status is present" ($manualData.status -eq "present")
    $dbMethod = (Run-DockerSql "SELECT recorded_method FROM staff_attendance_records WHERE id = '$($manualData.id)'").Trim()
    Assert-Test "Worker recorded method in DB is manual_pin" ($dbMethod -eq "manual_pin")
    Write-Host "  >> Worker Attendance ID: $($manualData.id) (DB method: $dbMethod)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 7. Doctor Check-Out Mutation & Duration Validation
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Doctor Performing Check-Out via Real Endpoint..." -ForegroundColor Yellow
    # Simulate realistic 4-hour clinical service shift on Doctor's own attendance record
    Write-Host "  >> Simulating realistic 4-hour clinical duty on attendance record..." -ForegroundColor Gray
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '4 hours' WHERE id = '$doctorAttendanceId';" | Out-Null

    $checkoutPayload = @{
        qrToken = $activeQrToken
        notes = "Selesai dinas pelayanan poliklinik 4 jam"
    } | ConvertTo-Json

    $checkoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutPayload
    $checkoutData = Get-ResponseData $checkoutRes
    Assert-Test "Doctor checkout recorded" ($null -ne $checkoutData.checkOutAt)
    Assert-Test "Validated duration hours computed" ($null -ne $checkoutData.validatedDurationHours)
    Write-Host "  >> CheckOut At: $($checkoutData.checkOutAt) | Duration: $($checkoutData.validatedDurationHours) jam" -ForegroundColor Green
    Assert-Test "Validated duration is exactly 4 hours" ([double]$checkoutData.validatedDurationHours -eq 4.0)

    # --------------------------------------------------------------------------
    # 8. Doctor Personal History Query (Mobile API Contract)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Doctor Querying /attendance/my-history..." -ForegroundColor Yellow
    $historyRes = Invoke-RestMethod -Uri "$apiBase/attendance/my-history" -Method Get -Headers $doctorAuth.headers
    $historyData = Get-ResponseData $historyRes
    Assert-Test "History response contains records array" ($historyData.records -is [System.Array])
    Assert-Test "History response contains summary object" ($null -ne $historyData.summary)
    Assert-Test "Doctor record exists in history" ($historyData.records.Count -gt 0)
    Write-Host "  >> Total History Records: $($historyData.records.Count) | Total Work Hours: $($historyData.summary.totalHours)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 9. Leave Request Submission & Admin Decision Mutation
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 9] Doctor Submitting Session Leave Request..." -ForegroundColor Yellow
    $futureDate = (Get-Date).AddDays(14).ToString("yyyy-MM-dd")
    $leavePayload = @{
        startDate = $futureDate
        endDate = $futureDate
        reason = "Konferensi Ikatan Dokter Indonesia wilayah Jawa Barat"
        type = "seminar_symposium"
        scope = "full_day"
    } | ConvertTo-Json

    $leaveRes = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Headers $doctorAuth.headers -Body $leavePayload
    $leaveData = Get-ResponseData $leaveRes
    Assert-Test "Leave request created with pending status" ($leaveData.status -eq "pending")
    $leaveId = $leaveData.id
    Write-Host "  >> Created Leave Request ID: $leaveId" -ForegroundColor Green

    Write-Host "  -> Admin Approving Leave Request..." -ForegroundColor Yellow
    $approvePayload = @{
        status = "approved"
        approvalNotes = "Disetujui untuk menghadiri seminar IDI"
    } | ConvertTo-Json

    $approveRes = Invoke-RestMethod -Uri "$apiBase/leaves/$leaveId/status" -Method Patch -Headers $adminAuth.headers -Body $approvePayload
    $approveData = Get-ResponseData $approveRes
    Assert-Test "Leave request approved" ($approveData.status -eq "approved")

    # --------------------------------------------------------------------------
    # 10. Replacement Opportunity Exposure & Claim Mutation
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] Checking Replacement Opportunities & Claiming..." -ForegroundColor Yellow
    $oppsRes = Invoke-RestMethod -Uri "$apiBase/replacements" -Method Get -Headers $workerAuth.headers
    $oppsData = Get-ResponseData $oppsRes
    Assert-Test "Replacement opportunities listed" ($oppsData.Count -gt 0)

    $targetOpp = $oppsData | Where-Object { $_.leaveRequestId -eq $leaveId } | Select-Object -First 1
    if (-not $targetOpp) {
        $targetOpp = $oppsData[0]
    }
    Assert-Test "Target replacement opportunity found" ($null -ne $targetOpp)

    Write-Host "  -> Worker Claiming Replacement Opportunity $($targetOpp.id)..." -ForegroundColor Yellow
    $claimRes = Invoke-RestMethod -Uri "$apiBase/replacements/$($targetOpp.id)/claim" -Method Post -Headers $workerAuth.headers
    $claimData = Get-ResponseData $claimRes
    Assert-Test "Replacement opportunity claimed successfully" ($claimData.status -eq "claimed")
    Write-Host "  >> Opportunity $($claimData.id) status: $($claimData.status)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 11. Payroll Engine Period Inspection
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 11] Inspecting Active Payroll Period..." -ForegroundColor Yellow
    $periodsRes = Invoke-RestMethod -Uri "$apiBase/payroll/periods" -Method Get -Headers $adminAuth.headers
    $periodsData = Get-ResponseData $periodsRes
    $activePeriod = $periodsData | Where-Object { $_.status -ne 'finalized' } | Select-Object -First 1
    Assert-Test "Active open payroll period exists" ($null -ne $activePeriod)
    $activePeriodId = $activePeriod.id
    Assert-Test "Payroll period status is calculated" ($activePeriod.status -eq "calculated")
    Assert-Test "Payroll period total payout > 0" ([double]$activePeriod.totalPayout -gt 0)
    Write-Host "  >> Active Period ID: $activePeriodId | Name: $($activePeriod.periodName) | Total Payout: Rp $($activePeriod.totalPayout)" -ForegroundColor Green
    Write-Host "  >> Calculated Period ID: $activePeriodId | Total Payout: Rp $($calcData.period.totalPayout)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 12. Staff Payroll Summary Verification (My-Summary API Contract)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 12] Staff Doctor Inspecting Own Payroll Statement..." -ForegroundColor Yellow
    $myPayRes = Invoke-RestMethod -Uri "$apiBase/payroll/my-summary?periodId=$activePeriodId" -Method Get -Headers $doctorAuth.headers
    $myPayData = Get-ResponseData $myPayRes
    Assert-Test "Doctor retrieved my-summary statement" ($null -ne $myPayData)
    Assert-Test "Doctor base earnings > 0" ($myPayData.baseEarnings -gt 0)
    Assert-Test "Doctor net payout computed" ($null -ne $myPayData.netPayroll)
    Assert-Test "Doctor line items include base_scheduled" (@($myPayData.entries | Where-Object { $_.entryType -eq 'base_scheduled' }).Count -gt 0)

    # Locate the exact entry produced by the checkout use-case:
    $attEntry = @($myPayData.entries | Where-Object { $_.sourceId -eq $doctorAttendanceId }) | Select-Object -First 1
    Assert-Test "Payroll entry automatically generated by attendance checkout engine exists" ($null -ne $attEntry)
    Assert-Test "Payroll entry quantityHours matches engine validatedDurationHours (4 jam)" ([double]$attEntry.quantityHours -eq [double]$checkoutData.validatedDurationHours)
    Assert-Test "Payroll entry amount matches duration * hourlyRate" ([double]$attEntry.amount -eq ([double]$checkoutData.validatedDurationHours * [double]$attEntry.hourlyRate))
    Assert-Test "Payroll entry checkInAt matches attendance record" ($null -ne $attEntry.checkInAt)
    Assert-Test "Payroll entry checkOutAt matches attendance record" ($null -ne $attEntry.checkOutAt)
    Assert-Test "Payroll entry description formula formatted correctly (4 jam x Rp ...)" ($attEntry.description -like "*4 jam x Rp*")
    Assert-Test "Payroll entry description has NO '@' symbol" (-not ($attEntry.description -like "*@*"))
    Assert-Test "Payroll entry notes matches checkout notes" ($attEntry.notes -eq "Selesai dinas pelayanan poliklinik 4 jam")

    Write-Host "  >> Doctor Base Earnings    : Rp $($myPayData.baseEarnings)" -ForegroundColor Green
    Write-Host "  >> Doctor Leave Deductions : Rp $($myPayData.leaveDeductions)" -ForegroundColor Yellow
    Write-Host "  >> Doctor Replacements     : Rp $($myPayData.replacementAdditions)" -ForegroundColor Green
    Write-Host "  >> Doctor NET PAYOUT (THP) : Rp $($myPayData.netPayroll)" -ForegroundColor Cyan

    # --------------------------------------------------------------------------
    # 13. Admin Inspection of Period Detail & Summary
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 13] Admin Inspecting Full Period Payroll Detail..." -ForegroundColor Yellow
    $detailRes = Invoke-RestMethod -Uri "$apiBase/payroll/periods/$activePeriodId" -Method Get -Headers $adminAuth.headers
    $detailData = Get-ResponseData $detailRes
    Assert-Test "Admin retrieved period detail with summaries" ($null -ne $detailData.summaries)
    Assert-Test "Staff count in summary matches active staff" ($detailData.summaries.Count -gt 0)
    Write-Host "  >> Total Staff Summarized in Period: $($detailData.summaries.Count)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------------------
    Print-TestSummary "Attendance, Leave, Replacement & Payroll Mutation E2E Suite"

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    Print-TestSummary "Attendance, Leave, Replacement & Payroll Mutation E2E Suite"
    exit 1
}
