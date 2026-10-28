param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: HARDENED ATTENDANCE SYSTEM (NEW PARADIGM & ZERO-FALLBACK VERIFICATION)" -ForegroundColor Cyan
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
    # 0. API Readiness & Dynamic Tokens
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 0] API Readiness & Acquiring Authoritative Tokens..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    $doctorAuth = Get-DynamicStaffJwt "dokter@amanah.com"
    Assert-Test "Doctor dynamic JWT generated" ($null -ne $doctorAuth.token)

    $workerAuth = Get-DynamicStaffJwt "staff.operasional@amanah.clinic"
    Assert-Test "Worker dynamic JWT generated" ($null -ne $workerAuth.token)

    # --------------------------------------------------------------------------
    # 1. Target Staff Resolution & Clean Slate for Today
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Target Staff Resolution & Baseline Flush for Today..." -ForegroundColor Yellow
    $doctorProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'dokter@amanah.com');").Trim()
    $workerProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'staff.operasional@amanah.clinic');").Trim()
    Assert-Test "Doctor profile resolved: $doctorProfileId" (-not [string]::IsNullOrWhiteSpace($doctorProfileId))
    Assert-Test "Worker profile resolved: $workerProfileId" (-not [string]::IsNullOrWhiteSpace($workerProfileId))

    # Clean today's attendance and leaves
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_type = 'attendance' AND source_id IN (SELECT id FROM staff_attendance_records WHERE staff_profile_id IN ('$doctorProfileId', '$workerProfileId') AND attendance_date = CURRENT_DATE);"
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE staff_profile_id IN ('$doctorProfileId', '$workerProfileId') AND attendance_date = CURRENT_DATE;"
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE staff_profile_id IN ('$doctorProfileId', '$workerProfileId') AND start_date = CURRENT_DATE;"
    Write-Host "  >> Cleaned today's attendance and leaves for test subjects." -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 2. Priority 1 Defense: Entry Mechanism Credential First
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Priority 1 Defense: Entry Credential / Proximity Proof First..." -ForegroundColor Yellow

    # 2A. Check-in with fake QR token -> MUST FAIL (400 Bad Request: INVALID_QR_TOKEN)
    $fakeQrCheckinThrew400 = $false
    try {
        $fakeQrPayload = @{ qrToken = "FAKE-QR-XYZ-12345" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $fakeQrPayload
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $fakeQrCheckinThrew400 = $true
        }
    }
    Assert-Test "Check-in with invalid QR token rejected with 400 (INVALID_QR_TOKEN)" $fakeQrCheckinThrew400

    # 2B. Check-in with fake Manual PIN -> MUST FAIL (400 Bad Request: INVALID_MANUAL_CODE)
    $fakePinCheckinThrew400 = $false
    try {
        $fakePinPayload = @{ qrToken = "999999"; method = "manual_pin" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $fakePinPayload
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $fakePinCheckinThrew400 = $true
        }
    }
    Assert-Test "Check-in with invalid manual PIN rejected with 400 (INVALID_MANUAL_CODE)" $fakePinCheckinThrew400

    # 2C. Check-out with fake QR token -> MUST FAIL (400 Bad Request: INVALID_QR_TOKEN), NOT 404!
    $fakeQrCheckoutThrew400 = $false
    try {
        $fakeCheckoutPayload = @{ qrToken = "FAKE-QR-XYZ-12345" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $fakeCheckoutPayload
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $fakeQrCheckoutThrew400 = $true
        }
    }
    Assert-Test "Check-out with invalid QR token rejected with 400 (Credential-first, NOT 404)" $fakeQrCheckoutThrew400

    # 2D. Self-service check-out with NO token -> MUST FAIL (400 Bad Request: Token wajib disertakan)
    $emptyCheckoutThrew400 = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body "{}"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $emptyCheckoutThrew400 = $true
        }
    }
    Assert-Test "Check-out without QR token rejected with 400 Bad Request" $emptyCheckoutThrew400

    # --------------------------------------------------------------------------
    # 3. Priority 2 Defense: Leave / Cuti Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Priority 2 Defense: Approved Leave / Cuti Verification..." -ForegroundColor Yellow

    # Insert an approved leave for Doctor today
    Run-DockerSql "INSERT INTO staff_leave_requests (id, staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_at, created_at, updated_at) VALUES (gen_random_uuid(), '$doctorProfileId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Cuti Sakit E2E Verification', 'approved', NOW(), NOW(), NOW());"

    # Generate an active valid QR token
    $qrGenPayload = @{ sessionType = "location_check_in"; shift = "morning"; rotationSeconds = 300 } | ConvertTo-Json
    $activeQrRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrGenPayload
    $validQrToken = (Get-ResponseData $activeQrRes).qrCodeIdentifier
    Assert-Test "Valid active terminal QR token generated: $validQrToken" (-not [string]::IsNullOrWhiteSpace($validQrToken))

    # Doctor tries to scan while on approved leave -> MUST FAIL (403 Forbidden: STAFF_ON_LEAVE)
    $leaveCheckinThrew403 = $false
    try {
        $scanLeavePayload = @{ qrToken = $validQrToken } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanLeavePayload
    } catch {
        $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($_.Exception.Response.StatusCode.value__ -eq 403 -and $errResponse.code -eq "STAFF_ON_LEAVE") {
            $leaveCheckinThrew403 = $true
        }
    }
    Assert-Test "Staff on approved leave rejected with 403 (STAFF_ON_LEAVE)" $leaveCheckinThrew403

    # Clean up test leave so doctor can continue testing normal flow
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE staff_profile_id = '$doctorProfileId' AND start_date = CURRENT_DATE;"
    Write-Host "  >> Cleaned up test leave record." -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 4. Priority 3 Defense: Session Operational Window Eligibility
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Priority 3 Defense: Session Operational Window Eligibility..." -ForegroundColor Yellow

    # Test expired shift (morning session ended at 12:00:00)
    $expiredShiftThrew403 = $false
    try {
        $expiredScanPayload = @{ qrToken = $validQrToken; shift = "morning" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $expiredScanPayload
    } catch {
        $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($_.Exception.Response.StatusCode.value__ -eq 403 -and $errResponse.code -eq "SESSION_EXPIRED") {
            $expiredShiftThrew403 = $true
        }
    }
    Assert-Test "Check-in to past/expired shift rejected with 403 (SESSION_EXPIRED)" $expiredShiftThrew403

    # --------------------------------------------------------------------------
    # 5. Dynamic Active Session Resolution & Multi-Shift Flow
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Dynamic Session Resolution & Multi-Shift State Machine..." -ForegroundColor Yellow

    # Prepare an active test session covering CURRENT_TIME for doctor
    # We update the current doctor's assignment or schedule window to span: (NOW - 15m) to (NOW + 2h)
    $currentDow = (Run-DockerSql "SELECT EXTRACT(DOW FROM CURRENT_DATE);").Trim()
    $activeShiftCode = "afternoon"

    # Ensure afternoon session covers current time
    Run-DockerSql "UPDATE session_schedule SET starts_at = (CURRENT_TIME - INTERVAL '15 minutes')::time, ends_at = (CURRENT_TIME + INTERVAL '3 hours')::time, is_active = true WHERE dow = $currentDow AND session_id = (SELECT id FROM session_def WHERE code = '$activeShiftCode');"
    Run-DockerSql "UPDATE session_def SET default_starts_at = (CURRENT_TIME - INTERVAL '15 minutes')::time, default_ends_at = (CURRENT_TIME + INTERVAL '3 hours')::time WHERE code = '$activeShiftCode';"

    # Assign doctor to this active shift
    $drPractitionerId = (Run-DockerSql "SELECT id FROM practitioners WHERE staff_profile_id = '$doctorProfileId' LIMIT 1;").Trim()
    Run-DockerSql "DELETE FROM doctor_assignment WHERE doctor_id = '$drPractitionerId' AND dow = $currentDow;"
    Run-DockerSql "INSERT INTO doctor_assignment (id, doctor_id, session_id, dow, is_active, created_at, updated_at) VALUES (gen_random_uuid(), '$drPractitionerId', (SELECT id FROM session_def WHERE code = '$activeShiftCode'), $currentDow, true, NOW(), NOW());"

    # Generate QR for active shift
    $qrActivePayload = @{ sessionType = "location_check_in"; shift = $activeShiftCode; rotationSeconds = 300 } | ConvertTo-Json
    $activeQrRes2 = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrActivePayload
    $activeQrToken2 = (Get-ResponseData $activeQrRes2).qrCodeIdentifier

    # 5A. Doctor Check-In on Active Shift (Dynamic resolution without specifying shift in body)
    $checkInPayload = @{ qrToken = $activeQrToken2; deviceInfo = "Dynamic E2E Test Client" } | ConvertTo-Json
    $checkInRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $checkInPayload
    $checkInData = Get-ResponseData $checkInRes
    Assert-Test "Doctor successfully checked in dynamically (Shift: $($checkInData.shift))" ($null -ne $checkInData.id)
    Assert-Test "Attendance status is present or late" ($checkInData.status -in @("present", "late"))
    $firstAttendanceId = $checkInData.id

    # 5B. Edge Case: Duplicate Check-In on SAME shift -> MUST FAIL (409 Conflict: DUPLICATE_CHECK_IN)
    $duplicateCheckinThrew409 = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $checkInPayload
    } catch {
        $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($_.Exception.Response.StatusCode.value__ -eq 409 -and $errResponse.code -eq "DUPLICATE_CHECK_IN") {
            $duplicateCheckinThrew409 = $true
        }
    }
    Assert-Test "Duplicate check-in on same shift rejected with 409 (DUPLICATE_CHECK_IN)" $duplicateCheckinThrew409

    # 5C. Doctor Check-Out from First Shift (Simulate 6 minutes of work in DB)
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '6 minutes' WHERE id = '$firstAttendanceId';"

    $checkoutPayload = @{ qrToken = $activeQrToken2; notes = "Selesai shift pertama E2E" } | ConvertTo-Json
    $checkoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutPayload
    $checkoutData = Get-ResponseData $checkoutRes
    Assert-Test "Doctor checked out from first shift" ($null -ne $checkoutData.checkOutAt)
    Write-Host "  >> Validated duration for 6-minute shift: $($checkoutData.validatedDurationHours) hours" -ForegroundColor Green

    # Verify duration bug fix: Validated duration for 6 minutes must be around 0.10 hours, NOT 5.5 hours!
    $validatedHoursNum = [double]$checkoutData.validatedDurationHours
    Assert-Test "Duration accurately computed from elapsed time ($validatedHoursNum hrs < 0.50 hrs, NOT 5.5 hrs!)" ($validatedHoursNum -gt 0 -and $validatedHoursNum -lt 0.50)

    # 5D. Edge Case: Duplicate Check-Out on SAME shift -> MUST FAIL (409 Conflict: ALREADY_CHECKED_OUT)
    $duplicateCheckoutThrew409 = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutPayload
    } catch {
        $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($_.Exception.Response.StatusCode.value__ -eq 409 -and $errResponse.code -eq "ALREADY_CHECKED_OUT") {
            $duplicateCheckoutThrew409 = $true
        }
    }
    Assert-Test "Duplicate check-out on same shift rejected with 409 (ALREADY_CHECKED_OUT)" $duplicateCheckoutThrew409

    # 5E. MULTI-SHIFT VERIFICATION: Doctor checks in to a SECOND shift on the SAME day!
    # Configure second shift (e.g. night shift) to cover current time
    $secondShiftCode = "night"
    Run-DockerSql "UPDATE session_schedule SET starts_at = (CURRENT_TIME - INTERVAL '5 minutes')::time, ends_at = (CURRENT_TIME + INTERVAL '4 hours')::time, is_active = true WHERE dow = $currentDow AND session_id = (SELECT id FROM session_def WHERE code = '$secondShiftCode');"
    Run-DockerSql "UPDATE session_def SET default_starts_at = (CURRENT_TIME - INTERVAL '5 minutes')::time, default_ends_at = (CURRENT_TIME + INTERVAL '4 hours')::time WHERE code = '$secondShiftCode';"
    Run-DockerSql "INSERT INTO doctor_assignment (id, doctor_id, session_id, dow, is_active, created_at, updated_at) VALUES (gen_random_uuid(), '$drPractitionerId', (SELECT id FROM session_def WHERE code = '$secondShiftCode'), $currentDow, true, NOW(), NOW());"

    # Generate QR for second shift
    $qrSecondPayload = @{ sessionType = "location_check_in"; shift = $secondShiftCode; rotationSeconds = 300 } | ConvertTo-Json
    $secondQrRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrSecondPayload
    $secondQrToken = (Get-ResponseData $secondQrRes).qrCodeIdentifier

    # Doctor checks in to second shift -> MUST SUCCEED (Multi-shift per day invariant!)
    $secondCheckinPayload = @{ qrToken = $secondQrToken; shift = $secondShiftCode; deviceInfo = "Multi-shift E2E Client" } | ConvertTo-Json
    $secondCheckinRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $secondCheckinPayload
    $secondCheckinData = Get-ResponseData $secondCheckinRes
    Assert-Test "Doctor successfully checked in to SECOND shift on same day (Shift: $($secondCheckinData.shift))" ($secondCheckinData.shift -eq $secondShiftCode)
    $secondAttendanceId = $secondCheckinData.id

    # Doctor checks out of second shift
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '10 minutes' WHERE id = '$secondAttendanceId';"
    $secondCheckoutPayload = @{ qrToken = $secondQrToken; notes = "Selesai shift kedua malam" } | ConvertTo-Json
    $secondCheckoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $secondCheckoutPayload
    $secondCheckoutData = Get-ResponseData $secondCheckoutRes
    Assert-Test "Doctor checked out from second shift" ($null -ne $secondCheckoutData.checkOutAt)

    # Verify that DB contains BOTH records for today
    $dbShiftCount = (Run-DockerSql "SELECT count(*) FROM staff_attendance_records WHERE staff_profile_id = '$doctorProfileId' AND attendance_date = CURRENT_DATE;").Trim()
    Assert-Test "Database accurately contains 2 distinct attendance records for multi-shift day (count = $dbShiftCount)" ($dbShiftCount -eq "2")

    # --------------------------------------------------------------------------
    # 6. Priority 5: Payroll Integrity (Zero Double-Deduction Verification)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Priority 5: Payroll Integrity & Zero Double-Deduction..." -ForegroundColor Yellow

    # Calculate payroll period covering today
    $calcPeriodPayload = @{
        periodName = "Payroll E2E Test Period $(Get-Date -Format 'yyyy-MM-dd')"
        periodStart = (Get-Date).ToString("yyyy-MM-01")
        periodEnd = (Get-Date).ToString("yyyy-MM-28")
    } | ConvertTo-Json

    $calcRes = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $calcPeriodPayload
    $calcData = Get-ResponseData $calcRes
    Assert-Test "Payroll calculated successfully" ($null -ne $calcData.period)

    # Inspect payroll_entries for doctor
    $payrollEntries = Run-DockerSql "SELECT entry_type, quantity_hours, amount, description FROM payroll_entries WHERE staff_profile_id = '$doctorProfileId';"
    Write-Host "  >> Doctor Payroll Entries in DB:`n$payrollEntries" -ForegroundColor Gray

    # Verify no double deduction: There should be base_scheduled entries, and ZERO leave_deduction for early departure
    $hasBaseScheduled = (Run-DockerSql "SELECT count(*) FROM payroll_entries WHERE staff_profile_id = '$doctorProfileId' AND entry_type = 'base_scheduled';").Trim()
    $hasEarlyDepartureDeduction = (Run-DockerSql "SELECT count(*) FROM payroll_entries WHERE staff_profile_id = '$doctorProfileId' AND entry_type = 'leave_deduction' AND description LIKE '%Pulang lebih awal%';").Trim()

    Assert-Test "Base scheduled pro-rata entries created (count = $hasBaseScheduled)" ([int]$hasBaseScheduled -ge 2)
    Assert-Test "Zero double-deduction penalty entries created (count = $hasEarlyDepartureDeduction)" ($hasEarlyDepartureDeduction -eq "0")

    # --------------------------------------------------------------------------
    # 7. Administrative Manual Check-in & Admin Check-out Bypass
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Administrative Manual Entry & Admin Checkout Bypass..." -ForegroundColor Yellow

    # Admin records manual attendance for worker on their rostered shift (morning)
    $manualPayload = @{
        staffIdOrCode = $workerProfileId
        shift = "morning"
        status = "present"
        notes = "Presensi manual dicatat Admin"
    } | ConvertTo-Json

    $manualRes = Invoke-RestMethod -Uri "$apiBase/attendance/manual" -Method Post -Headers $adminAuth.headers -Body $manualPayload
    $manualData = Get-ResponseData $manualRes
    Assert-Test "Admin recorded manual presence for worker" ($null -ne $manualData.id)

    # Admin checks out worker without QR code (Administrative entry bypass)
    $adminCheckoutPayload = @{
        staffId = $workerProfileId
        notes = "Admin checkout worker tanpa QR"
    } | ConvertTo-Json

    $adminCheckoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $adminAuth.headers -Body $adminCheckoutPayload
    $adminCheckoutData = Get-ResponseData $adminCheckoutRes
    Assert-Test "Admin administrative checkout succeeded without QR" ($null -ne $adminCheckoutData.checkOutAt)

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "$($_.ScriptStackTrace)" -ForegroundColor DarkGray
    if ($_.ErrorDetails) {
        Write-Host "Response Body: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} finally {
    # Restore standard session_def default times
    Run-DockerSql "UPDATE session_def SET default_starts_at = '14:30:00'::time, default_ends_at = '18:00:00'::time WHERE code = 'afternoon';"
    Run-DockerSql "UPDATE session_def SET default_starts_at = '18:00:00'::time, default_ends_at = '24:00:00'::time WHERE code = 'night';"
    Run-DockerSql "UPDATE session_schedule SET starts_at = '14:30:00'::time, ends_at = '18:00:00'::time WHERE session_id = (SELECT id FROM session_def WHERE code = 'afternoon');"
    Run-DockerSql "UPDATE session_schedule SET starts_at = '18:00:00'::time, ends_at = '24:00:00'::time WHERE session_id = (SELECT id FROM session_def WHERE code = 'night');"

    Print-TestSummary "Hardened Attendance System Suite (New Paradigm)"
}
