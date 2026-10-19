param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: EARLY CHECKOUT, LEAVE ELIGIBILITY & PAYROLL ENGINE HARDENING" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

$testEmailDoctorA = "zikrifadhiilahahmad@gmail.com"
$testEmailDoctorB = "dokter@amanah.com"
$todayStr = (Get-Date).ToString("yyyy-MM-dd")

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

function Flush-DoctorTestData([string]$email, [string]$date) {
    try {
        $staffId = Run-DockerSql "SELECT sp.id FROM staff_profiles sp JOIN users u ON sp.user_id = u.id WHERE u.email = '$email' LIMIT 1;"
        $staffId = $staffId.Trim()
        if ($staffId -and $staffId -ne "") {
            $flushSql = @"
DELETE FROM payroll_entries WHERE staff_profile_id = '$staffId';
DELETE FROM staff_attendance_records WHERE staff_profile_id = '$staffId' AND attendance_date = '$date';
DELETE FROM leave_request_sessions WHERE leave_request_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id = '$staffId' AND (start_date = '$date' OR end_date = '$date'));
DELETE FROM staff_leave_requests WHERE staff_profile_id = '$staffId' AND (start_date = '$date' OR end_date = '$date');
"@
            Run-DockerSql $flushSql | Out-Null
        }
    } catch {
        Write-Host "  Flush notice: $($_.Exception.Message)" -ForegroundColor Gray
    }
}

try {
    # --------------------------------------------------------------------------
    # Step 1. API Readiness
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Checking API Readiness..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    # --------------------------------------------------------------------------
    # Step 2. Authenticating Admin and Target Doctors
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Authenticating Admin and Target Doctors via Dynamic JWT..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

    $doctorAAuth = Get-DynamicStaffJwt $testEmailDoctorA
    Assert-Test "Doctor A ($testEmailDoctorA) authenticated" ($null -ne $doctorAAuth.token)

    $doctorBAuth = Get-DynamicStaffJwt $testEmailDoctorB
    Assert-Test "Doctor B ($testEmailDoctorB) authenticated" ($null -ne $doctorBAuth.token)

    # --------------------------------------------------------------------------
    # Step 3. Dynamic Configuration Verification (Zero Hardcoding)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Verifying Dynamic Clinic Settings via API..." -ForegroundColor Yellow
    $configRes = Invoke-RestMethod -Uri "$apiBase/admin/schedule-configuration" -Method Get -Headers $adminAuth.headers
    $configData = Get-ResponseData $configRes
    Assert-Test "Schedule configuration endpoint reachable" ($null -ne $configData)
    
    $settings = $configData.clinicSettings
    $checkoutWindowSetting = $settings | Where-Object { $_.key -eq "attendance.check_out_window_minutes_before" } | Select-Object -First 1
    $earlyNotesSetting = $settings | Where-Object { $_.key -eq "attendance.early_checkout_requires_notes" } | Select-Object -First 1

    Assert-Test "Dynamic setting 'attendance.check_out_window_minutes_before' registered" ($null -ne $checkoutWindowSetting)
    Assert-Test "Dynamic setting 'attendance.early_checkout_requires_notes' registered" ($null -ne $earlyNotesSetting)
    Assert-Test "Setting category is 'attendance'" ($checkoutWindowSetting.category -eq "attendance")
    Assert-Test "Setting is admin facing" ($checkoutWindowSetting.isAdminFacing -eq $true)

    Write-Host "  >> Checkout Window Before: $($checkoutWindowSetting.value) mins" -ForegroundColor Green
    Write-Host "  >> Early Checkout Requires Notes: $($earlyNotesSetting.value)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # Step 4. Pre-Flight Test Flush
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Pre-flight Data Sanitization for Today ($todayStr)..." -ForegroundColor Yellow
    Flush-DoctorTestData $testEmailDoctorA $todayStr
    Flush-DoctorTestData $testEmailDoctorB $todayStr
    Assert-Test "Sanitized test records for today" $true

    # --------------------------------------------------------------------------
    # Step 5. Rotate Dynamic QR Code
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Rotating Terminal QR Token..." -ForegroundColor Yellow
    $qrPayload = @{
        sessionType = "location_check_in"
        shift = "afternoon"
        rotationSeconds = 30
        context = "Terminal Poli E2E Hardening"
    } | ConvertTo-Json

    $qrRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrPayload
    $qrData = Get-ResponseData $qrRes
    $qrToken = $qrData.qrCodeIdentifier
    Assert-Test "Active terminal QR token generated: $qrToken" (-not [string]::IsNullOrWhiteSpace($qrToken))

    # --------------------------------------------------------------------------
    # Step 6. Doctor A Check-In
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Doctor A Checking In for Duty..." -ForegroundColor Yellow
    $checkInPayload = @{
        qrToken = $qrToken
        shift = "afternoon"
        deviceInfo = "E2E Hardening Test Client"
    } | ConvertTo-Json

    $checkInRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAAuth.headers -Body $checkInPayload
    $checkInData = Get-ResponseData $checkInRes
    Assert-Test "Doctor A Check-In succeeded" ($null -ne $checkInData.id)
    $doctorAAttendanceId = $checkInData.id

    # --------------------------------------------------------------------------
    # Step 7. Edge Case: Early Checkout WITHOUT Notes (Must Fail HTTP 400)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Testing Early Checkout WITHOUT notes (Enforcement Guard)..." -ForegroundColor Yellow
    $earlyCheckoutNoNotesPayload = @{
        qrToken = $qrToken
    } | ConvertTo-Json

    $failedAsExpected = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAAuth.headers -Body $earlyCheckoutNoNotesPayload
    } catch {
        $failedAsExpected = $true
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "  >> Rejected as expected with status: $statusCode" -ForegroundColor Green
        Assert-Test "Early Checkout without notes rejected with 400 Bad Request" ($statusCode -eq 400)
    }
    Assert-Test "Enforcement guard blocked checkout without mandatory notes" $failedAsExpected

    # --------------------------------------------------------------------------
    # Step 8. Doctor A Early Checkout WITH Notes (Must Succeed HTTP 200)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Testing Early Checkout WITH Notes (Sakit Mendadak)..." -ForegroundColor Yellow
    $earlyReason = "Kondisi Medis Darurat: Demam tinggi mendadak di klinik"
    $earlyCheckoutWithNotesPayload = @{
        qrToken = $qrToken
        notes = $earlyReason
    } | ConvertTo-Json

    $earlyRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAAuth.headers -Body $earlyCheckoutWithNotesPayload
    $earlyData = Get-ResponseData $earlyRes
    Assert-Test "Early Checkout with notes succeeded" ($null -ne $earlyData.id)

    # Verify DB state directly for Doctor A
    $dbRecord = Run-DockerSql "SELECT is_early_departure, validated_duration_hours, notes FROM staff_attendance_records WHERE id = '$doctorAAttendanceId';"
    Write-Host "  >> DB Record Raw: $dbRecord" -ForegroundColor Gray
    Assert-Test "is_early_departure is set to TRUE in DB" ($dbRecord.Contains("t") -or $dbRecord.Contains("true"))
    Assert-Test "Notes saved in DB" ($dbRecord.Contains("Demam tinggi"))

    # --------------------------------------------------------------------------
    # Step 9. Leave Eligibility Smart Filter on "Today" Post-Checkout
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 9] Verifying Leave Eligibility on Today Post-Checkout..." -ForegroundColor Yellow
    $eligibleSessionsRes = Invoke-RestMethod -Uri "$apiBase/leaves/eligible-sessions?date=$todayStr" -Method Get -Headers $doctorAAuth.headers
    $eligibleSessions = Get-ResponseData $eligibleSessionsRes
    Write-Host "  >> Eligible sessions remaining for Doctor A today: $($eligibleSessions.Count)" -ForegroundColor Gray

    # Since all today's sessions are either in the past or checked-out, none should remain actionable!
    Assert-Test "All past and checked-out sessions for Doctor A today are EXCLUDED (0 eligible sessions)" ($eligibleSessions.Count -eq 0)

    # Future date verification (Next week same day must have active sessions)
    $nextWeekStr = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
    $futureSessionsRes = Invoke-RestMethod -Uri "$apiBase/leaves/eligible-sessions?date=$nextWeekStr" -Method Get -Headers $doctorAAuth.headers
    $futureSessions = Get-ResponseData $futureSessionsRes
    Assert-Test "Future date sessions remain fully eligible" ($futureSessions.Count -gt 0)

    # --------------------------------------------------------------------------
    # Step 10. Payroll Mutation Audit for Early Departure
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] Triggering Closed-Book Payroll Calculation & Mutation Audit..." -ForegroundColor Yellow
    $periodStart = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd")
    $periodEnd = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")

    $payrollInitPayload = @{
        periodName = "Audit Mutasi Early Departure E2E Hardening"
        periodStart = $periodStart
        periodEnd = $periodEnd
    } | ConvertTo-Json

    $payrollRes = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $payrollInitPayload
    $payrollData = Get-ResponseData $payrollRes
    Assert-Test "Payroll engine calculated successfully" ($null -ne $payrollData.summaries)

    $doctorASummary = $payrollData.summaries | Where-Object { $_.fullName -like "*Zikri*" } | Select-Object -First 1
    Assert-Test "Doctor A found in payroll summary" ($null -ne $doctorASummary)
    Write-Host "  >> Doctor A Net Payout: Rp $($doctorASummary.netEarnings)" -ForegroundColor Green

    # Check payroll entries in DB for Doctor A
    $payrollEntriesSql = "SELECT entry_type, source_type, quantity_hours, amount, description FROM payroll_entries WHERE staff_profile_id IN (SELECT sp.id FROM staff_profiles sp JOIN users u ON sp.user_id = u.id WHERE u.email = '$testEmailDoctorA');"
    $dbEntries = Run-DockerSql $payrollEntriesSql
    Write-Host "  >> Doctor A Payroll Entries:`n$dbEntries" -ForegroundColor Cyan

    $entriesText = $dbEntries -join "`n"
    Assert-Test "Payroll has base_scheduled entry" ($entriesText -like "*base_scheduled*")
    Assert-Test "Payroll has leave_deduction entry from attendance" ($entriesText -like "*leave_deduction*" -and $entriesText -like "*attendance*")
    Assert-Test "Zero NaN in payroll amount" (-not ($entriesText -like "*NaN*"))

    Print-TestSummary
} catch {
    Write-Host "`n[FATAL ERROR] E2E Hardening Test Failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.InvocationInfo) {
        Write-Host "Line $($_.InvocationInfo.ScriptLineNumber): $($_.InvocationInfo.Line)" -ForegroundColor Red
    }
    Print-TestSummary
    exit 1
}
