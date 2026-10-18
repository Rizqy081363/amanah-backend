param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: PAYROLL CALCULATION ENGINE AUDIT (DOCTOR & OPERATIONAL STAFF)" -ForegroundColor Cyan
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

# Unique marker for test mutations to guarantee zero residue
$AuditMarker = "E2E_PAYROLL_AUDIT_$(Get-Random)"

# Doctor test entity variables
$DrStaffId = "52b4d315-75ec-41d9-b139-d1a8dfeaea97"
$DrPractitionerId = "d403922c-2da2-4191-a04b-c9d6ce0e513a"
$DrAssignmentId = "dbd350f5-fcce-4c36-a95b-f4eded7f8177" # Inactive Monday Night session for Dr. Zikri
$DrOriginalAssignmentState = "f"

# Worker test entity variables (Budi Santoso - Operational Staff)
$WorkerStaffId = "2df82453-3282-471c-87c4-f362fe651c9b"
$CreatedWorkerRosterId = $null

$CreatedDrLeaveId = $null
$CreatedWorkerLeaveId = $null
$CreatedDrAttendanceId = $null
$CreatedWorkerAttendanceId = $null

try {
    # --------------------------------------------------------------------------
    # PRE-FLIGHT SANITATION & SYSTEM READINESS
    # --------------------------------------------------------------------------
    Write-Host "`n[Pre-Flight 1/3] Flushing Redis Cache to Prevent Stale Data..." -ForegroundColor Yellow
    Flush-RedisCache

    Write-Host "`n[Pre-Flight 2/3] Checking API Readiness..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    Write-Host "`n[Pre-Flight 3/3] Authenticating Admin, Doctor (Dr. Zikri), & Staff (Budi Santoso)..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    $doctorAuth = Get-DynamicStaffJwt "zikrifadhiilahahmad@gmail.com"
    Assert-Test "Doctor Zikri dynamic JWT generated" ($null -ne $doctorAuth.token)

    $workerAuth = Get-DynamicStaffJwt "staff.operasional@amanah.clinic"
    Assert-Test "Worker Budi Santoso dynamic JWT generated" ($null -ne $workerAuth.token)

    # --------------------------------------------------------------------------
    # SCENARIO 1: BASELINE VERIFICATION & RATE INSPECTION
    # --------------------------------------------------------------------------
    Write-Host "`n--- [Scenario 1] Verifying Rates Table & Baseline Period Calculations ---" -ForegroundColor Yellow
    
    # 1. Inspect Active Rates
    $policyRes = Invoke-RestMethod -Uri "$apiBase/work-policies/current" -Method Get -Headers $adminAuth.headers
    $policyData = Get-ResponseData $policyRes
    Assert-Test "Work policy loaded" ($null -ne $policyData.policy)
    
    $rates = $policyData.rates
    $doctorRate = $rates | Where-Object { $_.category -eq 'doctor' } | Select-Object -First 1
    $midwifeRate = $rates | Where-Object { $_.category -eq 'midwife' } | Select-Object -First 1
    $workerRate = $rates | Where-Object { $_.category -eq 'worker' } | Select-Object -First 1

    Assert-Test "Doctor rate is Rp 150k / Rp 200k OT" ([double]$doctorRate.hourlyRate -eq 150000 -and [double]$doctorRate.overtimeHourlyRate -eq 200000)
    Assert-Test "Midwife rate is Rp 150k / Rp 200k OT" ([double]$midwifeRate.hourlyRate -eq 150000 -and [double]$midwifeRate.overtimeHourlyRate -eq 200000)
    Assert-Test "Worker rate is Rp 75k / Rp 100k OT" ([double]$workerRate.hourlyRate -eq 75000 -and [double]$workerRate.overtimeHourlyRate -eq 100000)

    # 2. Inspect October Canonical Period
    $periodsRes = Invoke-RestMethod -Uri "$apiBase/payroll/periods" -Method Get -Headers $adminAuth.headers
    $periods = Get-ResponseData $periodsRes
    $targetPeriod = $periods | Where-Object { $_.periodStart -eq '2026-10-01' -and $_.periodEnd -eq '2026-10-31' } | Select-Object -First 1
    Assert-Test "October 2026 canonical period found" ($null -ne $targetPeriod)
    $activePeriodId = $targetPeriod.id
    Write-Host "  >> Target Period ID: $activePeriodId ($($targetPeriod.periodName))" -ForegroundColor Gray

    # 3. Inspect Doctor Baseline Slip
    $drDetailRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($DrStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $drBaseline = Get-ResponseData $drDetailRes
    Assert-Test "Doctor baseline slip retrieved" ($null -ne $drBaseline)
    $drBaselineHours = [double]$drBaseline.baseHours
    $drBaselineBaseEarnings = [double]$drBaseline.baseEarnings
    Write-Host "  >> Doctor Baseline: $drBaselineHours hrs, Base Earnings = Rp $drBaselineBaseEarnings" -ForegroundColor Cyan
    Assert-Test "Doctor baseline base hours is 425 hrs (16 sessions * 6 hrs * 31/7)" ($drBaselineHours -eq 425)
    Assert-Test "Doctor baseline base earnings is Rp 63.750.000 (425 * 150.000)" ($drBaselineBaseEarnings -eq 63750000)

    # 4. Inspect Operational Staff (Worker) Baseline Slip
    $workerDetailRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($WorkerStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $workerBaseline = Get-ResponseData $workerDetailRes
    Assert-Test "Worker baseline slip retrieved" ($null -ne $workerBaseline)
    $workerBaselineHours = [double]$workerBaseline.baseHours
    $workerBaselineBaseEarnings = [double]$workerBaseline.baseEarnings
    Write-Host "  >> Worker Baseline: $workerBaselineHours hrs, Base Earnings = Rp $workerBaselineBaseEarnings" -ForegroundColor Cyan
    Assert-Test "Worker baseline base hours is 133 hrs (5 rosters * 6 hrs * 31/7)" ($workerBaselineHours -eq 133)
    Assert-Test "Worker baseline base earnings is Rp 9.975.000 (133 * 75.000)" ($workerBaselineBaseEarnings -eq 9975000)

    # --------------------------------------------------------------------------
    # SCENARIO 2: ROSTER OVERRIDE MUTATION BY ADMIN (DOCTOR & WORKER)
    # --------------------------------------------------------------------------
    Write-Host "`n--- [Scenario 2] Admin Roster Override Mutation (Doctor & Operational Staff) ---" -ForegroundColor Yellow
    
    # A. Doctor Roster Override: Activate Monday Night session
    Write-Host "  -> Admin activates Monday Night session for Doctor Zikri..." -ForegroundColor Gray
    Run-DockerSql "UPDATE doctor_assignment SET is_active = true, updated_at = NOW() WHERE id = '$DrAssignmentId';"
    $newDrActiveCount = (Run-DockerSql "SELECT count(*) FROM doctor_assignment WHERE doctor_id = '$DrPractitionerId' AND is_active = true;").Trim()
    Assert-Test "Doctor active roster sessions increased from 16 to 17" ($newDrActiveCount -eq "17")

    # B. Worker Roster Override: Insert Saturday Morning shift (dow = 6)
    Write-Host "  -> Admin assigns Saturday Morning roster (dow = 6) for Operational Staff Budi Santoso..." -ForegroundColor Gray
    $workerRosterSql = @"
INSERT INTO staff_roster (
    staff_profile_id, session_id, dow, is_active, notes
) VALUES (
    '$WorkerStaffId', 'd0d12ed6-ecda-4ed8-b3d9-f3b95d8f701a', 6, true, '$AuditMarker'
) RETURNING id;
"@
    $resWorkerRoster = @(Run-DockerSql $workerRosterSql)
    $CreatedWorkerRosterId = ($resWorkerRoster | Where-Object { $_ -match '^[0-9a-fA-F-]{36}$' } | Select-Object -First 1).Trim()
    Assert-Test "Worker Saturday roster created in DB" (-not [string]::IsNullOrWhiteSpace($CreatedWorkerRosterId))
    Write-Host "  >> Created Worker Roster ID: $CreatedWorkerRosterId" -ForegroundColor Gray

    # Trigger Payroll Recalculation
    Write-Host "  -> Admin triggers Recalculate Payroll Period..." -ForegroundColor Gray
    $recalcPayload = @{
        periodName = "Payroll Periode 2026-10-01 - 2026-10-31"
        periodStart = "2026-10-01"
        periodEnd = "2026-10-31"
        notes = "Audit Recalculation Doctor & Staff Roster Override"
    } | ConvertTo-Json

    $calcRes = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $recalcPayload
    $calcData = Get-ResponseData $calcRes
    Assert-Test "Payroll recalculation executed successfully" ($null -ne $calcData.period)

    # Verify Doctor Updated Base Hours & Earnings
    $drAfterRosterRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($DrStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $drAfterRoster = Get-ResponseData $drAfterRosterRes
    $expectedDrHours = [Math]::Round(17 * 6 * (31 / 7)) # 452 hours
    $expectedDrHoursDelta = $expectedDrHours - 425       # +27 hours
    $expectedDrEarningsDelta = $expectedDrHoursDelta * 150000 # +Rp 4.050.000

    Assert-Test "Doctor base scheduled hours increased to $expectedDrHours hrs (+27 hrs)" ([double]$drAfterRoster.baseHours -eq $expectedDrHours)
    Assert-Test "Doctor base earnings increased to Rp $($drAfterRoster.baseEarnings) (+Rp $expectedDrEarningsDelta)" ([double]$drAfterRoster.baseEarnings -eq ($drBaselineBaseEarnings + $expectedDrEarningsDelta))

    # Verify Worker Updated Base Hours & Earnings
    $workerAfterRosterRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($WorkerStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $workerAfterRoster = Get-ResponseData $workerAfterRosterRes
    $expectedWorkerHours = [Math]::Round(6 * 6 * (31 / 7)) # 159 hours (36 hrs/wk)
    $expectedWorkerHoursDelta = $expectedWorkerHours - 133  # +26 hours
    $expectedWorkerEarningsDelta = $expectedWorkerHoursDelta * 75000 # +Rp 1.950.000

    Write-Host "  >> Worker Updated: Hours = $($workerAfterRoster.baseHours) hrs (Expected: $expectedWorkerHours hrs), Earnings = Rp $($workerAfterRoster.baseEarnings)" -ForegroundColor Cyan
    Assert-Test "Worker base scheduled hours increased to $expectedWorkerHours hrs (+26 hrs)" ([double]$workerAfterRoster.baseHours -eq $expectedWorkerHours)
    Assert-Test "Worker base earnings increased to Rp $($workerAfterRoster.baseEarnings) (+Rp $expectedWorkerEarningsDelta)" ([double]$workerAfterRoster.baseEarnings -eq ($workerBaselineBaseEarnings + $expectedWorkerEarningsDelta))

    # --------------------------------------------------------------------------
    # SCENARIO 3: APPROVED LEAVE REQUEST MUTATION (LEAVE DEDUCTIONS)
    # --------------------------------------------------------------------------
    Write-Host "`n--- [Scenario 3] Approved Leave Request Mutation (Doctor & Staff Deductions) ---" -ForegroundColor Yellow
    
    # 1. Doctor Leave Request (1 full day @ Rp 150.000/hr = -Rp 900.000)
    $drLeaveSql = @"
INSERT INTO staff_leave_requests (
    staff_profile_id, practitioner_id, request_type, start_date, end_date,
    duration_days, reason, status, scope, decision_source, reviewed_at
) VALUES (
    '$DrStaffId', '$DrPractitionerId',
    'annual_leave', '2026-10-20', '2026-10-20', 1, '$AuditMarker', 'approved',
    'full_day', 'admin', NOW()
) RETURNING id;
"@
    $resDrLeave = @(Run-DockerSql $drLeaveSql)
    $CreatedDrLeaveId = ($resDrLeave | Where-Object { $_ -match '^[0-9a-fA-F-]{36}$' } | Select-Object -First 1).Trim()
    Assert-Test "Doctor approved test leave request created in DB" (-not [string]::IsNullOrWhiteSpace($CreatedDrLeaveId))

    # 2. Worker Leave Request (1 full day @ Rp 75.000/hr = -Rp 450.000)
    $workerLeaveSql = @"
INSERT INTO staff_leave_requests (
    staff_profile_id, practitioner_id, request_type, start_date, end_date,
    duration_days, reason, status, scope, decision_source, reviewed_at
) VALUES (
    '$WorkerStaffId', NULL,
    'annual_leave', '2026-10-22', '2026-10-22', 1, '$AuditMarker', 'approved',
    'full_day', 'admin', NOW()
) RETURNING id;
"@
    $resWorkerLeave = @(Run-DockerSql $workerLeaveSql)
    $CreatedWorkerLeaveId = ($resWorkerLeave | Where-Object { $_ -match '^[0-9a-fA-F-]{36}$' } | Select-Object -First 1).Trim()
    Assert-Test "Worker approved test leave request created in DB" (-not [string]::IsNullOrWhiteSpace($CreatedWorkerLeaveId))

    # Recalculate Payroll Period
    $calcRes2 = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $recalcPayload

    # Verify Doctor Leave Deduction
    $drAfterLeaveRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($DrStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $drAfterLeave = Get-ResponseData $drAfterLeaveRes
    Assert-Test "Doctor leave deduction matches 6 hrs @ Rp 150k = Rp 900.000" ([double]$drAfterLeave.leaveDeductions -eq 900000)

    # Verify Worker Leave Deduction
    $workerAfterLeaveRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($WorkerStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $workerAfterLeave = Get-ResponseData $workerAfterLeaveRes
    Write-Host "  >> Worker Leave Deductions: Rp $($workerAfterLeave.leaveDeductions) (Expected: Rp 450.000)" -ForegroundColor Cyan
    Assert-Test "Worker leave deduction matches 6 hrs @ Rp 75k = Rp 450.000" ([double]$workerAfterLeave.leaveDeductions -eq 450000)

    # --------------------------------------------------------------------------
    # SCENARIO 4: REPLACEMENT SHIFT MUTATION (OVERTIME ADDITIONS)
    # --------------------------------------------------------------------------
    Write-Host "`n--- [Scenario 4] Replacement Shift Mutation (Doctor & Staff Overtime Additions) ---" -ForegroundColor Yellow

    # 1. Doctor Replacement Shift (6 hrs @ Rp 200.000 OT = +Rp 1.200.000)
    $drAttendanceSql = @"
INSERT INTO staff_attendance_records (
    staff_profile_id, attendance_date, shift, status,
    check_in_at, check_out_at, validated_duration_hours,
    is_replacement, recorded_method, notes
) VALUES (
    '$DrStaffId', '2026-10-21', 'afternoon', 'present',
    '2026-10-21 12:00:00+07', '2026-10-21 18:00:00+07', 6.00,
    true, 'manual_pin', '$AuditMarker'
) RETURNING id;
"@
    $resDrAtt = @(Run-DockerSql $drAttendanceSql)
    $CreatedDrAttendanceId = ($resDrAtt | Where-Object { $_ -match '^[0-9a-fA-F-]{36}$' } | Select-Object -First 1).Trim()
    Assert-Test "Doctor replacement attendance created in DB" (-not [string]::IsNullOrWhiteSpace($CreatedDrAttendanceId))

    # 2. Worker Replacement Shift (6 hrs @ Rp 100.000 OT = +Rp 600.000)
    $workerAttendanceSql = @"
INSERT INTO staff_attendance_records (
    staff_profile_id, attendance_date, shift, status,
    check_in_at, check_out_at, validated_duration_hours,
    is_replacement, recorded_method, notes
) VALUES (
    '$WorkerStaffId', '2026-10-23', 'morning', 'present',
    '2026-10-23 06:00:00+07', '2026-10-23 12:00:00+07', 6.00,
    true, 'manual_pin', '$AuditMarker'
) RETURNING id;
"@
    $resWorkerAtt = @(Run-DockerSql $workerAttendanceSql)
    $CreatedWorkerAttendanceId = ($resWorkerAtt | Where-Object { $_ -match '^[0-9a-fA-F-]{36}$' } | Select-Object -First 1).Trim()
    Assert-Test "Worker replacement attendance created in DB" (-not [string]::IsNullOrWhiteSpace($CreatedWorkerAttendanceId))

    # Recalculate Payroll Period
    $calcRes3 = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $recalcPayload

    # Verify Doctor Overtime Addition
    $drAfterOvertimeRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($DrStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $drAfterOvertime = Get-ResponseData $drAfterOvertimeRes
    Assert-Test "Doctor replacement addition matches 6 hrs @ Rp 200k = Rp 1.200.000" ([double]$drAfterOvertime.replacementAdditions -eq 1200000)

    # Verify Worker Overtime Addition
    $workerAfterOvertimeRes = Invoke-RestMethod -Uri "$apiBase/payroll/staff/$($WorkerStaffId)?periodId=$($activePeriodId)" -Method Get -Headers $adminAuth.headers
    $workerAfterOvertime = Get-ResponseData $workerAfterOvertimeRes
    Write-Host "  >> Worker Replacement Additions: Rp $($workerAfterOvertime.replacementAdditions) (Expected: Rp 600.000)" -ForegroundColor Cyan
    Assert-Test "Worker replacement addition matches 6 hrs @ Rp 100k = Rp 600.000" ([double]$workerAfterOvertime.replacementAdditions -eq 600000)

    # --------------------------------------------------------------------------
    # SCENARIO 5: GLOBAL MATHEMATICAL INVARIANTS ACROSS ALL EMPLOYEES
    # --------------------------------------------------------------------------
    Write-Host "`n--- [Scenario 5] Verifying Global Mathematical Invariants Across All Staff ---" -ForegroundColor Yellow
    $periodDetailRes = Invoke-RestMethod -Uri "$apiBase/payroll/periods/$activePeriodId" -Method Get -Headers $adminAuth.headers
    $periodDetail = Get-ResponseData $periodDetailRes
    $allStaffSummaries = $periodDetail.summaries

    Assert-Test "Period contains active employee summaries" ($allStaffSummaries.Count -ge 20)
    Write-Host "  >> Auditing math invariants across $($allStaffSummaries.Count) active employees..." -ForegroundColor Gray

    $computedSumNetPayroll = 0
    $invariantViolationCount = 0

    foreach ($s in $allStaffSummaries) {
        $base = [double]$s.baseEarnings
        $leaves = [double]$s.leaveDeductions
        $replacements = [double]$s.replacementAdditions
        $actualNet = [double]$s.netPayroll

        $expectedNet = $base - $leaves + $replacements
        if ($actualNet -ne $expectedNet) {
            Write-Host "  [VIOLATION] Staff $($s.fullName): Net ($actualNet) != Base ($base) - Leave ($leaves) + Replacement ($replacements)" -ForegroundColor Red
            $invariantViolationCount++
        }
        $computedSumNetPayroll += $actualNet
    }

    Assert-Test "Mathematical Invariant: netPayroll == baseEarnings - leaveDeductions + replacementAdditions for 100% of staff" ($invariantViolationCount -eq 0)

    $periodTotalPayout = [double]$periodDetail.period.totalPayout
    Write-Host "  >> Period Total Payout: Rp $periodTotalPayout | Sum of all Staff Net: Rp $computedSumNetPayroll" -ForegroundColor Cyan
    Assert-Test "Period Total Payout exactly equals Sum of all Staff Net Pay" ($periodTotalPayout -eq $computedSumNetPayroll)

    # --------------------------------------------------------------------------
    # SCENARIO 6: CLIENT CONTRACT PARITY (FLUTTER MOBILE & NEXT.JS FOR DOCTOR & WORKER)
    # --------------------------------------------------------------------------
    Write-Host "`n--- [Scenario 6] Verifying Client Contract Parity for Doctor & Operational Staff ---" -ForegroundColor Yellow

    # 1. Doctor Mobile Summary Check
    $drMobileSummaryRes = Invoke-RestMethod -Uri "$apiBase/payroll/my-summary?periodId=$activePeriodId" -Method Get -Headers $doctorAuth.headers
    $drMobileSummary = Get-ResponseData $drMobileSummaryRes
    Assert-Test "Doctor Mobile Net Payroll matches Admin Dashboard (Rp 68.100.000)" ([double]$drMobileSummary.netPayroll -eq [double]$drAfterOvertime.netPayroll)
    Assert-Test "Doctor Mobile Base matches Admin Dashboard (Rp 67.800.000)" ([double]$drMobileSummary.baseEarnings -eq [double]$drAfterOvertime.baseEarnings)
    Assert-Test "Doctor Mobile Deductions matches Admin Dashboard (Rp 900.000)" ([double]$drMobileSummary.leaveDeductions -eq [double]$drAfterOvertime.leaveDeductions)
    Assert-Test "Doctor Mobile Additions matches Admin Dashboard (Rp 1.200.000)" ([double]$drMobileSummary.replacementAdditions -eq [double]$drAfterOvertime.replacementAdditions)

    # 2. Worker Mobile Summary Check
    $workerMobileSummaryRes = Invoke-RestMethod -Uri "$apiBase/payroll/my-summary?periodId=$activePeriodId" -Method Get -Headers $workerAuth.headers
    $workerMobileSummary = Get-ResponseData $workerMobileSummaryRes
    Write-Host "  >> Worker Mobile Statement: Net = Rp $($workerMobileSummary.netPayroll) (Base: Rp $($workerMobileSummary.baseEarnings), Leave: -Rp $($workerMobileSummary.leaveDeductions), OT: +Rp $($workerMobileSummary.replacementAdditions))" -ForegroundColor Cyan
    Assert-Test "Worker Mobile Net Payroll matches Admin Dashboard (Rp 12.075.000)" ([double]$workerMobileSummary.netPayroll -eq [double]$workerAfterOvertime.netPayroll)
    Assert-Test "Worker Mobile Base matches Admin Dashboard (Rp 11.925.000)" ([double]$workerMobileSummary.baseEarnings -eq [double]$workerAfterOvertime.baseEarnings)
    Assert-Test "Worker Mobile Deductions matches Admin Dashboard (Rp 450.000)" ([double]$workerMobileSummary.leaveDeductions -eq [double]$workerAfterOvertime.leaveDeductions)
    Assert-Test "Worker Mobile Additions matches Admin Dashboard (Rp 600.000)" ([double]$workerMobileSummary.replacementAdditions -eq [double]$workerAfterOvertime.replacementAdditions)

    Write-Host "  ✓ Verified: Both Doctor and Operational Staff receive 100% accurate, role-specific slips in Flutter Mobile matching Next.js Admin!" -ForegroundColor Green

} finally {
    # --------------------------------------------------------------------------
    # SCENARIO 7: TEARDOWN, ROLLBACK & POST-FLIGHT CLEANLINESS
    # --------------------------------------------------------------------------
    Write-Host "`n--- [Scenario 7] Teardown, Rollback & Post-Flight Cleanliness ---" -ForegroundColor Yellow

    # 1. Revert Doctor Assignment Override
    Write-Host "  -> Reverting Doctor Monday Night assignment to inactive ($DrOriginalAssignmentState)..." -ForegroundColor Gray
    Run-DockerSql "UPDATE doctor_assignment SET is_active = false, updated_at = NOW() WHERE id = '$DrAssignmentId';"

    # 2. Revert Worker Roster Override
    if ($CreatedWorkerRosterId) {
        Write-Host "  -> Deleting test worker roster $CreatedWorkerRosterId..." -ForegroundColor Gray
        Run-DockerSql "DELETE FROM staff_roster WHERE id = '$CreatedWorkerRosterId';"
    }
    Run-DockerSql "DELETE FROM staff_roster WHERE notes LIKE '%$AuditMarker%';"

    # 3. Delete Test Leave Requests (Doctor & Worker)
    if ($CreatedDrLeaveId) {
        Run-DockerSql "DELETE FROM staff_leave_requests WHERE id = '$CreatedDrLeaveId';"
    }
    if ($CreatedWorkerLeaveId) {
        Run-DockerSql "DELETE FROM staff_leave_requests WHERE id = '$CreatedWorkerLeaveId';"
    }
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE reason LIKE '%$AuditMarker%';"

    # 4. Delete Test Attendance Records (Doctor & Worker)
    if ($CreatedDrAttendanceId) {
        Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$CreatedDrAttendanceId';"
    }
    if ($CreatedWorkerAttendanceId) {
        Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$CreatedWorkerAttendanceId';"
    }
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE notes LIKE '%$AuditMarker%';"

    # 5. Restore Baseline Calculation
    Write-Host "  -> Recalculating Payroll Period back to original baseline state..." -ForegroundColor Gray
    try {
        $restorePayload = @{
            periodName = "Payroll Periode 2026-10-01 - 2026-10-31"
            periodStart = "2026-10-01"
            periodEnd = "2026-10-31"
            notes = "Restored Clean Baseline State"
        } | ConvertTo-Json
        $calcRestore = Invoke-RestMethod -Uri "$apiBase/payroll/calculate" -Method Post -Headers $adminAuth.headers -Body $restorePayload
        Write-Host "  ✓ Clean baseline recalculation completed." -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Failed to trigger final recalculation: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }

    # 6. Flush Redis Cache
    Flush-RedisCache

    # 7. Verify Zero Residue in DB
    $residualLeaves = (Run-DockerSql "SELECT count(*) FROM staff_leave_requests WHERE reason LIKE '%E2E_PAYROLL_AUDIT%';").Trim()
    $residualAttendances = (Run-DockerSql "SELECT count(*) FROM staff_attendance_records WHERE notes LIKE '%E2E_PAYROLL_AUDIT%';").Trim()
    $residualRosters = (Run-DockerSql "SELECT count(*) FROM staff_roster WHERE notes LIKE '%E2E_PAYROLL_AUDIT%';").Trim()
    
    Assert-Test "Zero residual test leaves remaining" ($residualLeaves -eq "0")
    Assert-Test "Zero residual test attendances remaining" ($residualAttendances -eq "0")
    Assert-Test "Zero residual test worker rosters remaining" ($residualRosters -eq "0")
    Write-Host "  ✓ Database 100% clean and pristine for all roles!" -ForegroundColor Green

    # Print Final Summary
    Print-TestSummary "Payroll Calculation Engine End-to-End Audit Suite (Doctor & Staff)"
}
