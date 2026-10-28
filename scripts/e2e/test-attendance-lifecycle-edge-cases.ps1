param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: COMPLETE ATTENDANCE LIFECYCLE & EXHAUSTIVE EDGE CASES SUITE" -ForegroundColor Cyan
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
    # 0. API Readiness & Dynamic Authoritative Tokens
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 0] API Readiness & Acquiring Authoritative Tokens..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    $doctorEmail = "zikrifadhiilahahmad@gmail.com"
    $doctorAuth = Get-DynamicStaffJwt $doctorEmail
    Assert-Test "Doctor dynamic JWT generated for $doctorEmail" ($null -ne $doctorAuth.token)

    $workerEmail = "staff.operasional@amanah.clinic"
    $workerAuth = Get-DynamicStaffJwt $workerEmail
    Assert-Test "Worker dynamic JWT generated for $workerEmail" ($null -ne $workerAuth.token)

    # Resolve Staff Profile IDs and Practitioner IDs from PostgreSQL
    $doctorProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$doctorEmail');").Trim()
    $doctorPractitionerId = (Run-DockerSql "SELECT id FROM practitioners WHERE staff_profile_id = '$doctorProfileId' LIMIT 1;").Trim()
    $workerProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$workerEmail');").Trim()

    Assert-Test "Doctor profile ID resolved: $doctorProfileId" (-not [string]::IsNullOrWhiteSpace($doctorProfileId))
    Assert-Test "Doctor practitioner ID resolved: $doctorPractitionerId" (-not [string]::IsNullOrWhiteSpace($doctorPractitionerId))
    Assert-Test "Worker profile ID resolved: $workerProfileId" (-not [string]::IsNullOrWhiteSpace($workerProfileId))

    # --------------------------------------------------------------------------
    # 1. Clean Baseline for Target Test Staff for Today
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Preparing Clean Baseline for Test Cycle..." -ForegroundColor Yellow
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_type = 'attendance' AND source_id IN (SELECT id FROM staff_attendance_records WHERE staff_profile_id IN ('$doctorProfileId', '$workerProfileId') AND attendance_date = CURRENT_DATE);"
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE attendance_date = CURRENT_DATE AND staff_profile_id IN ('$doctorProfileId', '$workerProfileId');"
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE staff_profile_id IN ('$doctorProfileId', '$workerProfileId') AND start_date = CURRENT_DATE;"
    Run-DockerSql "DELETE FROM replacement_opportunities WHERE work_date = CURRENT_DATE AND (claimed_by_staff_profile_id IN ('$doctorProfileId', '$workerProfileId') OR original_staff_profile_id IN ('$doctorProfileId', '$workerProfileId'));"
    Run-DockerSql "DELETE FROM shift_exception WHERE service_date = CURRENT_DATE AND doctor_id = '$doctorPractitionerId';"
    Write-Host "  >> Cleaned previous attendance, leave, replacement, and shift exception records for today." -ForegroundColor Gray

    # --------------------------------------------------------------------------
    # 2. Priority 1 Defense: Entry Credential / Proximity Proof First
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Priority 1 Defense: Entry Credential / Proximity Proof..." -ForegroundColor Yellow

    # 2A: Check-in with invalid/fake QR token -> MUST FAIL (400 Bad Request)
    $fakeQrCheckinThrew400 = $false
    try {
        $fakeQrPayload = @{ qrToken = "FAKE-INVALID-TOKEN-999" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $fakeQrPayload
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $fakeQrCheckinThrew400 = $true
        }
    }
    Assert-Test "Check-in with invalid QR token rejected with 400 Bad Request" $fakeQrCheckinThrew400

    # 2B: Check-in with invalid Manual PIN -> MUST FAIL (400 Bad Request)
    $fakePinCheckinThrew400 = $false
    try {
        $fakePinPayload = @{ qrToken = "000000"; method = "manual_pin" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $fakePinPayload
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $fakePinCheckinThrew400 = $true
        }
    }
    Assert-Test "Check-in with invalid manual PIN rejected with 400 Bad Request" $fakePinCheckinThrew400

    # 2C: Self-service check-out with NO QR token -> MUST FAIL (400 Bad Request)
    $emptyCheckoutThrew400 = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body "{}"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $emptyCheckoutThrew400 = $true
        }
    }
    Assert-Test "Check-out without QR token rejected with 400 Bad Request" $emptyCheckoutThrew400

    # 2D: Check-out before any check-in exists (with a valid rotated QR code) -> MUST FAIL (404 Not Found)
    $rotResInit = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $validInitToken = (Get-ResponseData $rotResInit).qrCodeIdentifier
    $checkoutBeforeCheckinThrew404 = $false
    try {
        $checkoutNoCheckinBody = @{ qrToken = $validInitToken } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutNoCheckinBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 404) {
            $checkoutBeforeCheckinThrew404 = $true
        }
    }
    Assert-Test "Check-out before check-in rejected with 404 Not Found" $checkoutBeforeCheckinThrew404

    # --------------------------------------------------------------------------
    # 3. Priority 2 Defense: Approved Leave / Cuti Resmi
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Priority 2 Defense: Approved Leave / Cuti Resmi..." -ForegroundColor Yellow
    # Create approved leave for doctor for today
    Run-DockerSql "INSERT INTO staff_leave_requests (id, staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_at, created_at, updated_at) VALUES (gen_random_uuid(), '$doctorProfileId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Cuti Sakit E2E Edge Case', 'approved', NOW(), NOW(), NOW());"

    $onLeaveThrewError = $false
    try {
        $scanLeaveBody = @{ qrToken = $validInitToken } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanLeaveBody
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 403 -or $statusCode -eq 422) {
            $onLeaveThrewError = $true
        }
    }
    Assert-Test "Staff on approved leave scan rejected with 403 or 422" $onLeaveThrewError

    # Clean up test leave so doctor can proceed
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE staff_profile_id = '$doctorProfileId' AND start_date = CURRENT_DATE;"
    Write-Host "  >> Cleaned up test leave record." -ForegroundColor Gray

    # --------------------------------------------------------------------------
    # 4. Priority 3 Defense: Past Expired Shift Window
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Priority 3 Defense: Past Expired Shift Window..." -ForegroundColor Yellow
    # Rotate active token
    $rotResExpired = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $validTokenExpired = (Get-ResponseData $rotResExpired).qrCodeIdentifier

    # Doctor explicitly requests past morning shift (ended at 12:00:00 or 14:00:00)
    $expiredShiftThrewError = $false
    try {
        $expiredScanPayload = @{ qrToken = $validTokenExpired; shift = "morning" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $expiredScanPayload
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 403 -or $statusCode -eq 422) {
            $expiredShiftThrewError = $true
        }
    }
    Assert-Test "Explicit check-in to past/expired shift rejected (SESSION_EXPIRED)" $expiredShiftThrewError

    # --------------------------------------------------------------------------
    # 5. Core Fix: Doctor Fadila Ahmad Wednesday Afternoon Schedule Scan
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Core Fix: Doctor Fadila Ahmad Wednesday Daytime Scan (Flutter Mobile Flow)..." -ForegroundColor Yellow

    # Active terminal QR rotation (Dynamic progressive resolution, no fabricated early_morning)
    $rotResActive = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $activeQrData = Get-ResponseData $rotResActive
    $activeQrToken = $activeQrData.qrCodeIdentifier
    Write-Host "  >> Active Terminal QR: $activeQrToken, Shift: $($activeQrData.shift)" -ForegroundColor Gray

    # Assert that terminal QR resolved to 'afternoon' during daytime operating window
    Assert-Test "Terminal QR accurately resolved to afternoon shift" ($activeQrData.shift -eq "afternoon")

    # Doctor scans QR without passing shift (True mobile flow)
    $doctorScanPayload = @{ qrToken = $activeQrToken; deviceInfo = "Flutter Mobile (Android E2E)" } | ConvertTo-Json
    $doctorScanRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $doctorScanPayload
    $doctorScanData = Get-ResponseData $doctorScanRes

    Assert-Test "Doctor successfully checked in (HTTP 201 Created)" ($null -ne $doctorScanData.id)
    Assert-Test "Recorded shift is afternoon" ($doctorScanData.shift -eq "afternoon")
    Assert-Test "Attendance status is valid (present or late)" ($doctorScanData.status -in @("present", "late"))
    Assert-Test "Session ID linked to doctor assignment" (-not [string]::IsNullOrWhiteSpace($doctorScanData.sessionId))

    $doctorAttendanceId = $doctorScanData.id
    Write-Host "  >> Doctor Attendance ID: $doctorAttendanceId | Status: $($doctorScanData.status) | LateMinutes: $($doctorScanData.lateMinutes)" -ForegroundColor Green

    # Verify persisted in PostgreSQL
    $persistedRow = (Run-DockerSql "SELECT shift FROM staff_attendance_records WHERE id = '$doctorAttendanceId';").Trim()
    Assert-Test "Attendance persisted in PostgreSQL with shift 'afternoon'" ($persistedRow -eq "afternoon")

    # --------------------------------------------------------------------------
    # 6. Edge Case: Duplicate Check-In Guard on Same Shift
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Edge Case: Duplicate Check-In on Same Shift..." -ForegroundColor Yellow
    $duplicateCheckinThrew409 = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $doctorScanPayload
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) {
            $duplicateCheckinThrew409 = $true
        }
    }
    Assert-Test "Duplicate check-in on same shift rejected with 409 Conflict" $duplicateCheckinThrew409

    # --------------------------------------------------------------------------
    # 7. Edge Case: Early Departure Checkout & Checkout Ticket (Layer 4)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Edge Case: Early Departure Checkout & Checkout Ticket..." -ForegroundColor Yellow

    # Rotate new fresh QR token for checkout
    $rotResCo = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $checkoutQrToken = (Get-ResponseData $rotResCo).qrCodeIdentifier

    # 7A: Doctor attempts early checkout before shift ends WITHOUT notes -> MUST FAIL (400 EARLY_DEPARTURE_NOTES_REQUIRED)
    $earlyCheckoutThrewRequired = $false
    $receivedTicket = $null
    try {
        $earlyCoBody = @{ qrToken = $checkoutQrToken } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $earlyCoBody
    } catch {
        $errObj = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($errObj.code -eq "EARLY_DEPARTURE_NOTES_REQUIRED") {
            $earlyCheckoutThrewRequired = $true
            $receivedTicket = $errObj.details.checkoutTicket
        }
    }
    Assert-Test "Early departure without notes rejected (EARLY_DEPARTURE_NOTES_REQUIRED)" $earlyCheckoutThrewRequired
    Assert-Test "Checkout ticket issued for early departure" (-not [string]::IsNullOrWhiteSpace($receivedTicket))
    Write-Host "  >> Received Checkout Ticket: $receivedTicket" -ForegroundColor Gray

    # 7B: Doctor retries checkout providing checkoutTicket and notes -> MUST SUCCEED (200 OK)
    $validCoBody = @{
        qrToken = $checkoutQrToken
        checkoutTicket = $receivedTicket
        notes = "Izin pulang cepat keperluan keluarga (E2E Test)"
    } | ConvertTo-Json
    $coRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $validCoBody
    $coData = Get-ResponseData $coRes

    Assert-Test "Early checkout with ticket and notes succeeded" ($null -ne $coData.checkOutAt)
    Assert-Test "isEarlyDeparture flag set to true" ($coData.isEarlyDeparture -eq $true)
    Assert-Test "Validated work duration computed" ([double]$coData.validatedDurationHours -ge 0)
    Write-Host "  >> Checked out at $($coData.checkOutAt) | Duration: $($coData.validatedDurationHours) jam | EarlyDeparture: $($coData.isEarlyDeparture)" -ForegroundColor Green

    # 7C: Duplicate Check-out on already-closed record -> MUST FAIL (409 Conflict: ALREADY_CHECKED_OUT)
    $duplicateCheckoutThrew409 = $false
    try {
        $dupCoBody = @{ qrToken = $checkoutQrToken } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $dupCoBody
    } catch {
        $statusCode = [int]$_.Exception.Response.StatusCode
        $errResponse = $null
        try { $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json } catch {}
        if ($statusCode -eq 409 -or ($errResponse -and $errResponse.code -eq "ALREADY_CHECKED_OUT")) {
            $duplicateCheckoutThrew409 = $true
        }
    }
    Assert-Test "Duplicate checkout on already-closed record rejected with 409 Conflict" $duplicateCheckoutThrew409

    # --------------------------------------------------------------------------
    # 8. Daily Admin Overrides (shift_exception): Extra & Leave Overrides
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Daily Admin Overrides (shift_exception)..." -ForegroundColor Yellow

    # Clean doctor attendance to test override
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$doctorAttendanceId';"

    # 8A: Admin adds 'leave' exception for doctor on afternoon session
    $afternoonSessionId = (Run-DockerSql "SELECT id FROM session_def WHERE code = 'afternoon';").Trim()
    Run-DockerSql "INSERT INTO shift_exception (id, doctor_id, service_date, session_id, type, note, created_at, updated_at) VALUES (gen_random_uuid(), '$doctorPractitionerId', CURRENT_DATE, '$afternoonSessionId', 'leave', 'Admin menonaktifkan dinas siang hari ini', NOW(), NOW());"

    $rotResEx = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $tokenEx = (Get-ResponseData $rotResEx).qrCodeIdentifier

    $leaveExceptionBlocked = $false
    try {
        $scanExBody = @{ qrToken = $tokenEx } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanExBody
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 403 -or $statusCode -eq 422) {
            $leaveExceptionBlocked = $true
        }
    }
    Assert-Test "Daily admin leave exception successfully canceled session candidate" $leaveExceptionBlocked

    # Clean up leave exception
    Run-DockerSql "DELETE FROM shift_exception WHERE service_date = CURRENT_DATE AND doctor_id = '$doctorPractitionerId';"

    # 8B: Admin adds 'extra' exception for doctor on night session (which doctor was NOT originally assigned to on Wednesday)
    $nightSessionId = (Run-DockerSql "SELECT id FROM session_def WHERE code = 'night';").Trim()
    Run-DockerSql "INSERT INTO shift_exception (id, doctor_id, service_date, session_id, type, note, created_at, updated_at) VALUES (gen_random_uuid(), '$doctorPractitionerId', CURRENT_DATE, '$nightSessionId', 'extra', 'Admin menugaskan lembur dinas malam', NOW(), NOW());"

    $extraExceptionLoaded = (Run-DockerSql "SELECT count(*) FROM shift_exception WHERE service_date = CURRENT_DATE AND doctor_id = '$doctorPractitionerId' AND type = 'extra';").Trim()
    Assert-Test "Admin extra shift exception registered in database (count = $extraExceptionLoaded)" ($extraExceptionLoaded -eq "1")

    # Clean up test exception
    Run-DockerSql "DELETE FROM shift_exception WHERE service_date = CURRENT_DATE AND doctor_id = '$doctorPractitionerId';"
    Write-Host "  >> Cleaned up test shift exceptions." -ForegroundColor Gray

    # --------------------------------------------------------------------------
    # 9. Claimed Replacement Shift Flow
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 9] Claimed Replacement Shift Flow..." -ForegroundColor Yellow

    # Create dummy original staff leave request
    $origLeaveId = [guid]::NewGuid().ToString()
    Run-DockerSql "INSERT INTO staff_leave_requests (id, staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_at, created_at, updated_at) VALUES ('$origLeaveId', '$doctorProfileId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Leave for replacement test', 'approved', NOW(), NOW(), NOW());"

    # Create claimed replacement opportunity for worker
    $repOppId = [guid]::NewGuid().ToString()
    Run-DockerSql "INSERT INTO replacement_opportunities (id, leave_request_id, session_id, work_date, original_staff_profile_id, claimed_by_staff_profile_id, claimed_at, status, notes, created_at, updated_at) VALUES ('$repOppId', '$origLeaveId', '$afternoonSessionId', CURRENT_DATE, '$doctorProfileId', '$workerProfileId', NOW(), 'claimed', 'Claimed by worker E2E', NOW(), NOW());"
    Assert-Test "Replacement opportunity created and claimed: $repOppId" (-not [string]::IsNullOrWhiteSpace($repOppId))

    # Worker scans active terminal QR -> Candidate resolver identifies Tier 1 claimed replacement
    $rotResRep = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $tokenRep = (Get-ResponseData $rotResRep).qrCodeIdentifier

    $workerScanBody = @{ qrToken = $tokenRep; deviceInfo = "Worker Replacement Scanner" } | ConvertTo-Json
    $workerScanRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $workerAuth.headers -Body $workerScanBody
    $workerScanData = Get-ResponseData $workerScanRes

    Assert-Test "Worker replacement scan succeeded (HTTP 201 Created)" ($null -ne $workerScanData.id)
    Assert-Test "isReplacement flag set to true" ($workerScanData.isReplacement -eq $true)
    Assert-Test "replacementOpportunityId recorded" ($workerScanData.replacementOpportunityId -eq $repOppId)
    $workerAttendanceId = $workerScanData.id

    # Worker checks out of replacement shift -> Opportunity must transition to 'completed'
    $workerCoBody = @{
        qrToken = $tokenRep
        notes = "Checkout pengganti shift siang"
    } | ConvertTo-Json
    $workerCoRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $workerAuth.headers -Body $workerCoBody
    $workerCoData = Get-ResponseData $workerCoRes

    Assert-Test "Worker checked out of replacement shift" ($null -ne $workerCoData.checkOutAt)

    # Verify replacement opportunity status transitioned to 'completed' in DB
    $repOppStatus = (Run-DockerSql "SELECT status FROM replacement_opportunities WHERE id = '$repOppId';").Trim()
    Assert-Test "Replacement opportunity automatically marked 'completed' in DB" ($repOppStatus -eq "completed")

    # Clean up test replacement and leave
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$workerAttendanceId';"
    Run-DockerSql "DELETE FROM replacement_opportunities WHERE id = '$repOppId';"
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE id = '$origLeaveId';"
    Write-Host "  >> Cleaned up replacement test records." -ForegroundColor Gray

    # --------------------------------------------------------------------------
    # 10. Frontend Web Administrative Operations
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] Frontend Web Administrative Operations (Manual & Bypass)..." -ForegroundColor Yellow

    # Admin records manual attendance for doctor
    $manualPayload = @{
        staffIdOrCode = $doctorProfileId
        shift = "afternoon"
        status = "present"
        notes = "Presensi manual dicatat oleh Admin Web Dashboard"
    } | ConvertTo-Json

    $manualRes = Invoke-RestMethod -Uri "$apiBase/attendance/manual" -Method Post -Headers $adminAuth.headers -Body $manualPayload
    $manualData = Get-ResponseData $manualRes

    Assert-Test "Admin manual check-in succeeded (HTTP 201 Created)" ($null -ne $manualData.id)
    Assert-Test "Manual record has correct shift" ($manualData.shift -eq "afternoon")
    $adminRecordedId = $manualData.id

    # Admin checks out doctor on behalf of doctor WITHOUT QR code (Administrative entry bypass)
    $adminCheckoutPayload = @{
        staffId = $doctorProfileId
        notes = "Admin checkout tanpa QR via web dashboard"
    } | ConvertTo-Json

    $adminCheckoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $adminAuth.headers -Body $adminCheckoutPayload
    $adminCheckoutData = Get-ResponseData $adminCheckoutRes

    Assert-Test "Admin administrative checkout succeeded without QR" ($null -ne $adminCheckoutData.checkOutAt)

    # Daily Attendance List BFF check (Verifies web table feed)
    $dailyRes = Invoke-RestMethod -Uri "$apiBase/attendance/daily?page=1&limit=20" -Method Get -Headers $adminAuth.headers
    $dailyData = Get-ResponseData $dailyRes

    $foundRecord = $dailyData.records | Where-Object { $_.id -eq $adminRecordedId }
    Assert-Test "Attendance record appears in Daily Attendance BFF table" ($null -ne $foundRecord)
    Assert-Test "Record contains valid nama_staf" (-not [string]::IsNullOrWhiteSpace($foundRecord.nama_staf))
    Assert-Test "Record contains WIB time format" ($foundRecord.waktu_presensi -match "WIB")

    # --------------------------------------------------------------------------
    # 11. Realtime Payroll Engine Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 11] Realtime Payroll Engine Integration Verification..." -ForegroundColor Yellow

    $periodPayload = @{
        periodName = "E2E Attendance Payroll Audit Period"
        periodStart = (Get-Date).ToString("yyyy-MM-01")
        periodEnd = (Get-Date).ToString("yyyy-MM-28")
    } | ConvertTo-Json

    $payrollCalcRes = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $periodPayload
    $payrollCalcData = Get-ResponseData $payrollCalcRes
    Assert-Test "Payroll calculation succeeded" ($null -ne $payrollCalcData.period)
    $newPeriodId = $payrollCalcData.period.id

    # Check that there is NO punitive early departure penalty deduction created in this calculated period
    $earlyDepartureDeductions = (Run-DockerSql "SELECT count(*) FROM payroll_entries WHERE payroll_period_id = '$newPeriodId' AND staff_profile_id = '$doctorProfileId' AND entry_type = 'leave_deduction' AND description LIKE '%Pulang lebih awal%';").Trim()
    Assert-Test "Zero double-deduction penalty entries created in payroll period (count = $earlyDepartureDeductions)" ($earlyDepartureDeductions -eq "0")

    # --------------------------------------------------------------------------
    # 12. Final Database Clean Slate
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 12] Final Clean Slate Cleanup..." -ForegroundColor Yellow
    Run-DockerSql "DELETE FROM payroll_entries WHERE payroll_period_id = '$newPeriodId';"
    Run-DockerSql "DELETE FROM payroll_periods WHERE id = '$newPeriodId';"
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_type = 'attendance' AND source_id = '$adminRecordedId';"
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$adminRecordedId';"
    Write-Host "  >> Cleaned up test attendance records." -ForegroundColor Gray

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "$($_.ScriptStackTrace)" -ForegroundColor DarkGray
    if ($_.ErrorDetails) {
        Write-Host "Response Body: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} finally {
    Print-TestSummary "Complete Attendance Lifecycle & Exhaustive Edge Cases Suite"
}
