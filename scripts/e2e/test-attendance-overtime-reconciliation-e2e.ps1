param(
    [string]$TargetDoctorEmail = "zikrifadhiilahahmad@gmail.com",
    [string]$TargetDate = (Get-Date).ToString("yyyy-MM-dd")
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E HARDENING: CURRENT-SHIFT FILTERING & OVERTIME RECONCILIATION ENGINE" -ForegroundColor Cyan
Write-Host " Target Doctor : $TargetDoctorEmail" -ForegroundColor Cyan
Write-Host " Target Date   : $TargetDate" -ForegroundColor Cyan
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
    # 1. API Readiness & Database Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Checking API Readiness & Docker PostgreSQL Connectivity..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    $pgStatus = Run-DockerSql "SELECT 1;"
    Assert-Test "Docker PostgreSQL (backend-postgres-1) is connected and reachable" ($pgStatus.Trim() -eq "1")

    # --------------------------------------------------------------------------
    # 2. Staff & Admin Identity Resolution
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Resolving Identities..." -ForegroundColor Yellow
    $adminAuth = Get-DynamicStaffJwt "admin@amanah.com"
    $doctorAuth = Get-DynamicStaffJwt $TargetDoctorEmail
    Assert-Test "Admin JWT generated" ($null -ne $adminAuth.token)
    Assert-Test "Doctor JWT generated" ($null -ne $doctorAuth.token)

    $drQuery = @"
SELECT sp.id as staff_profile_id, sp.full_name, sp.role_id, u.id as user_id
FROM users u
JOIN staff_profiles sp ON u.id = sp.user_id
WHERE u.email = '$TargetDoctorEmail'
LIMIT 1;
"@
    $drRaw = Run-DockerSql $drQuery
    if (-not $drRaw -or [string]::IsNullOrWhiteSpace($drRaw)) {
        throw "Akun Dr. Zikri ($TargetDoctorEmail) tidak ditemukan di database!"
    }
    $drParts = $drRaw.Trim().Split('|')
    $drStaffProfileId = $drParts[0]
    $drFullName = $drParts[1]
    $drRoleId = $drParts[2]
    $drUserId = $drParts[3]

    Write-Host " >> Doctor StaffProfile ID: $drStaffProfileId ($drFullName)" -ForegroundColor DarkCyan

    # Ensure compensation rate has overtime rate configured
    Run-DockerSql "UPDATE compensation_rates SET overtime_hourly_rate = COALESCE(overtime_hourly_rate, hourly_rate * 1.5) WHERE role_id = '$drRoleId' AND is_active = true;" | Out-Null
    $rateCheck = Run-DockerSql "SELECT hourly_rate, overtime_hourly_rate FROM compensation_rates WHERE role_id = '$drRoleId' AND is_active = true LIMIT 1;"
    Write-Host " >> Compensation Rates: $rateCheck" -ForegroundColor DarkCyan
    Assert-Test "Doctor active compensation rate verified" ($null -ne $rateCheck)

    # --------------------------------------------------------------------------
    # 3. BFF Current Shift & Dynamic Filtering Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Testing Daily Attendance BFF & Current Shift Metadata..." -ForegroundColor Yellow
    $bffUrl = "$apiBase/attendance/daily?date=$TargetDate"
    $bffRes = Invoke-RestMethod -Uri $bffUrl -Headers $adminAuth.headers -Method Get

    Assert-Test "BFF response contains records list" ($null -ne $bffRes.records)
    Assert-Test "BFF response total is valid number" ($bffRes.total -ge 0)

    # Check currentShift metadata presence
    if ($bffRes.currentShift) {
        Write-Host " >> Active Operational Shift: $($bffRes.currentShift.label) ($($bffRes.currentShift.code)) [$($bffRes.currentShift.defaultStartsAt) - $($bffRes.currentShift.defaultEndsAt)]" -ForegroundColor Green
        Assert-Test "Current shift has valid code" ($null -ne $bffRes.currentShift.code)
        Assert-Test "Current shift has valid label" ($null -ne $bffRes.currentShift.label)

        # Test filtering by shift=current
        $currentShiftUrl = "$apiBase/attendance/daily?date=$TargetDate&shift=current"
        $currentRes = Invoke-RestMethod -Uri $currentShiftUrl -Headers $adminAuth.headers -Method Get
        Assert-Test "Filter shift=current returns valid response" ($null -ne $currentRes.records)
        foreach ($r in $currentRes.records) {
            Assert-Test "Record shift matches current shift code ($($bffRes.currentShift.code))" ($r.shift -eq $bffRes.currentShift.code)
        }
    } else {
        Write-Host " >> No active operational shift at current time (Outside operational hours)" -ForegroundColor DarkYellow
    }

    # --------------------------------------------------------------------------
    # 4. Absence Invariant Verification (No 'Sedang berdinas' or fake check-in)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Verifying Absent Invariant..." -ForegroundColor Yellow
    $absentRecords = $bffRes.records | Where-Object { $_.status -eq 'absent' }
    if ($absentRecords) {
        foreach ($ab in $absentRecords) {
            Assert-Test "Absent staff ($($ab.nama_staf)) checkInAt is null" ($null -eq $ab.checkInAt)
            Assert-Test "Absent staff ($($ab.nama_staf)) isOverdueCheckOut is false" ($ab.isOverdueCheckOut -eq $false)
        }
        Write-Host " >> Verified $($absentRecords.Count) absent records satisfy invariant" -ForegroundColor Green
    } else {
        Write-Host " >> No absent records for target date to inspect" -ForegroundColor DarkGray
    }

    # --------------------------------------------------------------------------
    # 5. Overtime Reconciliation - Scenario A: Approved Overtime
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Scenario A: Approved Overtime Reconciliation..." -ForegroundColor Yellow

    # Discover an active session directly from session_def
    $sessionQuery = "SELECT id, code, default_starts_at, default_ends_at FROM session_def WHERE is_active = true ORDER BY sort_order LIMIT 1;"
    $sessionRaw = Run-DockerSql $sessionQuery
    $sessionParts = $sessionRaw.Trim().Split('|')
    $testSessionId = $sessionParts[0]
    $testSessionCode = $sessionParts[1]
    $testSessionStartsAt = $sessionParts[2]
    $testSessionEndsAt = $sessionParts[3]
    $checkInTimeA = "${TargetDate}T${testSessionStartsAt}+07:00"

    # Clean any pre-existing record for this test doctor & session on TargetDate
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE staff_profile_id = '$drStaffProfileId' AND attendance_date = '$TargetDate' AND shift = '$testSessionCode';" | Out-Null

    # Create test overdue attendance record in PostgreSQL
    $createRecSql = @"
INSERT INTO staff_attendance_records (
    staff_profile_id, attendance_date, shift, session_id,
    status, check_in_at, check_out_at, validated_duration_hours,
    is_replacement, is_early_departure, recorded_method, notes
) VALUES (
    '$drStaffProfileId', '$TargetDate', '$testSessionCode', '$testSessionId',
    'present', '$checkInTimeA', NULL, '0.00',
    false, false, 'system', 'Test presensi lembur'
) RETURNING id;
"@
    $rawA = Run-DockerSql $createRecSql
    $testRecordIdA = ([regex]::Match($rawA, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')).Value
    Assert-Test "Created test attendance record A ($testRecordIdA)" ([bool]$testRecordIdA)

    # Call Reconcile Endpoint with Approved Overtime
    $reconcilePayloadA = @{
        attendanceId = $testRecordIdA
        decision = "approved_overtime"
        overtimeHours = 2.5
        adminNotes = "Lembur tindakan darurat bedah poli"
    } | ConvertTo-Json

    $reconcileResA = Invoke-RestMethod -Uri "$apiBase/attendance/reconcile-overtime" `
        -Headers $adminAuth.headers `
        -Method Post `
        -Body $reconcilePayloadA

    Assert-Test "Scenario A response has approved decision" ($reconcileResA.decision -eq "approved_overtime")
    Assert-Test "Scenario A overtime hours is 2.5" ([double]$reconcileResA.overtimeHours -eq 2.5)
    Assert-Test "Scenario A validatedDurationHours is greater than 0" ([double]$reconcileResA.validatedDurationHours -gt 0)
    Assert-Test "Scenario A overtimeAmount is greater than 0" ([double]$reconcileResA.overtimeAmount -gt 0)

    # Verify PostgreSQL state for Record A
    $dbCheckA = Run-DockerSql "SELECT check_out_at, validated_duration_hours FROM staff_attendance_records WHERE id = '$testRecordIdA';"
    $dbPartsA = $dbCheckA.Trim().Split('|')
    $checkOutA = $dbPartsA[0]
    $valHoursA = $dbPartsA[1]
    $notesA = (Run-DockerSql "SELECT notes FROM staff_attendance_records WHERE id = '$testRecordIdA';").Trim()

    Assert-Test "Record A check_out_at is now populated" (-not [string]::IsNullOrWhiteSpace($checkOutA))
    Assert-Test "Record A validated_duration_hours includes overtime" ([double]$valHoursA -ge 2.5)
    Assert-Test "Record A notes includes reconciliation approval tag" ($notesA -match "Rekonsiliasi: Lembur Disetujui")

    # Verify payroll entry creation in payroll_entries
    $payrollQueryA = @"
SELECT entry_type, quantity_hours, amount, description
FROM payroll_entries
WHERE source_type = 'attendance' AND source_id = '$testRecordIdA' AND entry_type = 'overtime_addition'
LIMIT 1;
"@
    $payrollRawA = Run-DockerSql $payrollQueryA
    Assert-Test "Payroll overtime_addition entry created for Record A" (-not [string]::IsNullOrWhiteSpace($payrollRawA))
    Write-Host " >> Payroll Entry Record A: $payrollRawA" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 6. Overtime Reconciliation - Scenario B: Rejected Overtime (Forgotten Checkout)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Scenario B: Rejected Overtime (Forgotten Checkout)..." -ForegroundColor Yellow

    # Discover a second active session for Scenario B directly from session_def
    $sessionQueryB = "SELECT id, code, default_starts_at, default_ends_at FROM session_def WHERE is_active = true AND id != '$testSessionId' ORDER BY sort_order LIMIT 1;"
    $sessionRawB = Run-DockerSql $sessionQueryB
    $sessionPartsB = $sessionRawB.Trim().Split('|')
    $testSessionIdB = $sessionPartsB[0]
    $testSessionCodeB = $sessionPartsB[1]
    $testSessionStartsAtB = $sessionPartsB[2]
    $testSessionEndsAtB = $sessionPartsB[3]
    $checkInTimeB = "${TargetDate}T${testSessionStartsAtB}+07:00"

    # Clean any pre-existing record for this second session on TargetDate
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE staff_profile_id = '$drStaffProfileId' AND attendance_date = '$TargetDate' AND shift = '$testSessionCodeB';" | Out-Null

    $createRecSqlB = @"
INSERT INTO staff_attendance_records (
    staff_profile_id, attendance_date, shift, session_id,
    status, check_in_at, check_out_at, validated_duration_hours,
    is_replacement, is_early_departure, recorded_method, notes
) VALUES (
    '$drStaffProfileId', '$TargetDate', '$testSessionCodeB', '$testSessionIdB',
    'present', '$checkInTimeB', NULL, '0.00',
    false, false, 'system', 'Test lupa checkout'
) RETURNING id;
"@
    $rawB = Run-DockerSql $createRecSqlB
    $testRecordIdB = ([regex]::Match($rawB, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')).Value
    Assert-Test "Created test attendance record B ($testRecordIdB)" ([bool]$testRecordIdB)

    # Call Reconcile Endpoint with Rejected Overtime
    $reconcilePayloadB = @{
        attendanceId = $testRecordIdB
        decision = "rejected_overtime"
        adminNotes = "Staf konfirmasi lupa tap pulang"
    } | ConvertTo-Json

    $reconcileResB = Invoke-RestMethod -Uri "$apiBase/attendance/reconcile-overtime" `
        -Headers $adminAuth.headers `
        -Method Post `
        -Body $reconcilePayloadB

    Assert-Test "Scenario B response has rejected decision" ($reconcileResB.decision -eq "rejected_overtime")
    Assert-Test "Scenario B overtime hours is 0" ([double]$reconcileResB.overtimeHours -eq 0)
    Assert-Test "Scenario B overtimeAmount is 0" ([double]$reconcileResB.overtimeAmount -eq 0)

    # Verify PostgreSQL state for Record B
    $dbCheckB = Run-DockerSql "SELECT check_out_at, validated_duration_hours FROM staff_attendance_records WHERE id = '$testRecordIdB';"
    $dbPartsB = $dbCheckB.Trim().Split('|')
    $checkOutB = $dbPartsB[0]
    $valHoursB = $dbPartsB[1]
    $notesB = (Run-DockerSql "SELECT notes FROM staff_attendance_records WHERE id = '$testRecordIdB';").Trim()

    Assert-Test "Record B check_out_at is adjusted" (-not [string]::IsNullOrWhiteSpace($checkOutB))
    Assert-Test "Record B notes includes forgotten checkout adjustment tag" ($notesB -match "Lupa Check-out")

    # Verify that ZERO overtime_addition exists for Record B
    $payrollRawB = Run-DockerSql "SELECT id FROM payroll_entries WHERE source_type = 'attendance' AND source_id = '$testRecordIdB' AND entry_type = 'overtime_addition';"
    Assert-Test "Zero overtime_addition entries exist in payroll for Record B" ([string]::IsNullOrWhiteSpace($payrollRawB))

    # --------------------------------------------------------------------------
    # 7. Security, RBAC & Zod Validation Rejections
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Testing Security, RBAC & Validation Rejections..." -ForegroundColor Yellow

    # Test 7.1: Unauthenticated request rejected (401)
    $unauthBlocked = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/reconcile-overtime" -Method Post -Body "{}" | Out-Null
    } catch {
        $unauthBlocked = ($_.Exception.Response.StatusCode.value__ -eq 401)
    }
    Assert-Test "Unauthenticated request rejected with 401 Unauthorized" $unauthBlocked

    # Test 7.2: Non-admin staff rejected (403)
    $doctorForbidden = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/reconcile-overtime" `
            -Headers $doctorAuth.headers `
            -Method Post `
            -Body $reconcilePayloadA | Out-Null
    } catch {
        $doctorForbidden = ($_.Exception.Response.StatusCode.value__ -eq 403)
    }
    Assert-Test "Non-admin staff user rejected with 403 Forbidden" $doctorForbidden

    # Test 7.3: Invalid decision enum rejected (400 or 422)
    $invalidDecisionBlocked = $false
    try {
        $badPayload = @{
            attendanceId = $testRecordIdA
            decision = "maybe_overtime"
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/reconcile-overtime" `
            -Headers $adminAuth.headers `
            -Method Post `
            -Body $badPayload | Out-Null
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $invalidDecisionBlocked = ($code -eq 400 -or $code -eq 422)
    }
    Assert-Test "Invalid decision enum rejected by Zod validation" $invalidDecisionBlocked

    # Test 7.4: Negative overtime hours rejected (400 or 422)
    $negativeHoursBlocked = $false
    try {
        $badHoursPayload = @{
            attendanceId = $testRecordIdA
            decision = "approved_overtime"
            overtimeHours = -5
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/reconcile-overtime" `
            -Headers $adminAuth.headers `
            -Method Post `
            -Body $badHoursPayload | Out-Null
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $negativeHoursBlocked = ($code -eq 400 -or $code -eq 422)
    }
    Assert-Test "Negative overtime hours rejected by Zod validation" $negativeHoursBlocked

    # Cleanup temporary test records
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_id IN ('$testRecordIdA', '$testRecordIdB');" | Out-Null
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE id IN ('$testRecordIdA', '$testRecordIdB');" | Out-Null

} catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    exit 1
}

Print-TestSummary
