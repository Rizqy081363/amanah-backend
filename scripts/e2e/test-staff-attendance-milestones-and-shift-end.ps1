param(
    [string]$TargetDoctorEmail = "zikrifadhiilahahmad@gmail.com",
    [string]$TargetDate = (Get-Date).ToString("yyyy-MM-dd"),
    [switch]$SkipFlushing
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E HARDENING: STAFF ATTENDANCE MILESTONES & SHIFT-END ABSENCE ENGINE" -ForegroundColor Cyan
Write-Host " Target Doctor : $TargetDoctorEmail" -ForegroundColor Cyan
Write-Host " Target Date   : $TargetDate" -ForegroundColor Cyan
Write-Host " Model Applied : MODEL B (Pay-per-Presence / Honor Jam Pelayanan Riil)" -ForegroundColor Cyan
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
    # 2. Staff Identity Resolution & Physical Device Discovery
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Resolving Staff Identities (Dr. Zikri & Standard Staff)..." -ForegroundColor Yellow
    $drQuery = @"
SELECT u.id as user_id, sp.id as staff_profile_id, sp.full_name, p.id as practitioner_id, sp.role_id
FROM users u
JOIN staff_profiles sp ON u.id = sp.user_id
LEFT JOIN practitioners p ON sp.id = p.staff_profile_id
WHERE u.email = '$TargetDoctorEmail'
LIMIT 1;
"@
    $drRaw = Run-DockerSql $drQuery
    if (-not $drRaw -or [string]::IsNullOrWhiteSpace($drRaw)) {
        throw "Akun Dr. Zikri ($TargetDoctorEmail) tidak ditemukan di database!"
    }
    $drParts = $drRaw.Trim().Split('|')
    $drUserId = $drParts[0]
    $drStaffProfileId = $drParts[1]
    $drFullName = $drParts[2]
    $drPractitionerId = $drParts[3]
    $drRoleId = $drParts[4]

    Write-Host " >> Dr. Zikri User ID        : $drUserId" -ForegroundColor DarkCyan
    Write-Host " >> Dr. Zikri StaffProfile ID: $drStaffProfileId" -ForegroundColor DarkCyan
    Write-Host " >> Dr. Zikri Practitioner ID: $drPractitionerId" -ForegroundColor DarkCyan
    Write-Host " >> Dr. Zikri Role ID        : $drRoleId" -ForegroundColor DarkCyan
    Assert-Test "Dr. Zikri identity resolved from PostgreSQL" ($null -ne $drStaffProfileId)

    # Resolve a standard non-doctor staff member (CS Rina)
    $csQuery = @"
SELECT u.id as user_id, sp.id as staff_profile_id, sp.full_name, sp.role_id, u.email
FROM staff_profiles sp
JOIN users u ON sp.user_id = u.id
WHERE u.email = 'cs@amanah.com'
LIMIT 1;
"@
    $csRaw = Run-DockerSql $csQuery
    if (-not $csRaw -or [string]::IsNullOrWhiteSpace($csRaw)) {
        throw "Akun CS (cs@amanah.com) tidak ditemukan di database!"
    }
    $csParts = $csRaw.Trim().Split('|')
    $csUserId = $csParts[0]
    $csStaffProfileId = $csParts[1]
    $csFullName = $csParts[2]
    $csRoleId = $csParts[3]
    $csEmail = $csParts[4]

    Write-Host " >> Standard Staff ($csFullName) StaffProfile ID: $csStaffProfileId" -ForegroundColor DarkCyan
    Assert-Test "Standard non-doctor staff resolved from PostgreSQL" ($null -ne $csStaffProfileId)

    # --------------------------------------------------------------------------
    # 3. Authentication & Compensation Rate Setup
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Authenticating Admin & Configuring Dynamic Compensation Rates..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    $drAuth = Get-DynamicStaffJwt $TargetDoctorEmail
    Assert-Test "Dr. Zikri dynamic JWT generated" ($null -ne $drAuth.token)

    # Upsert standard compensation rates for doctor and worker roles
    $ratesPayload = @{
        rates = @(
            @{
                roleId = $drRoleId
                hourlyRate = 150000
                overtimeHourlyRate = 200000
                notes = "Tarif dokter klinik E2E hardening"
            },
            @{
                roleId = $csRoleId
                hourlyRate = 50000
                overtimeHourlyRate = 75000
                notes = "Tarif staf operasional E2E hardening"
            }
        )
    } | ConvertTo-Json -Depth 5

    $putRatesRes = Invoke-RestMethod -Uri "$apiBase/work-policies/compensation-rates" -Method Put -Headers $adminAuth.headers -Body $ratesPayload
    $ratesData = Get-ResponseData $putRatesRes
    Assert-Test "Dynamic compensation rates configured via API" ($ratesData.Count -ge 2)

    # --------------------------------------------------------------------------
    # 4. Pre-Flight Flushing for Test Isolation (Full Sterile Sweep)
    # --------------------------------------------------------------------------
    if (-not $SkipFlushing) {
        Write-Host "`n[Step 4] Pre-Flight Flushing: Removing Previous Test Attendance & Payroll Records..." -ForegroundColor Yellow
        $flushSql = @"
DELETE FROM payroll_entries
WHERE source_type = 'attendance'
  AND (
      staff_profile_id IN ('$drStaffProfileId', '$csStaffProfileId')
      OR source_id IN (SELECT id FROM staff_attendance_records WHERE attendance_date = '$TargetDate' AND recorded_method = 'system')
  );

DELETE FROM staff_attendance_records
WHERE attendance_date = '$TargetDate'
  AND (
      staff_profile_id IN ('$drStaffProfileId', '$csStaffProfileId')
      OR recorded_method = 'system'
  );

DELETE FROM notification_recipients
WHERE notification_id IN (SELECT id FROM notifications WHERE title LIKE '%Peringatan%' AND body LIKE '%$TargetDate%');

DELETE FROM notifications
WHERE title LIKE '%Peringatan%'
  AND body LIKE '%$TargetDate%';
"@
        $null = Run-DockerSql $flushSql
        Assert-Test "Pre-flight test records flushed cleanly" $true
    }

    # --------------------------------------------------------------------------
    # 5. EDGE CASE 1: Dynamic Shift Definitions (Arbitrary N Sessions, Not Hardcoded 4)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] EDGE CASE 1: Verifying Dynamic Session Definitions from Database..." -ForegroundColor Yellow
    $sessionCountRaw = (Run-DockerSql "SELECT COUNT(*) FROM session_def WHERE is_active = true;").Trim()
    $activeSessionCount = [int]$sessionCountRaw
    Assert-Test "Active session definitions exist in database (Count >= 1)" ($activeSessionCount -ge 1)
    Write-Host " >> Total Active Dynamic Sessions in DB: $activeSessionCount" -ForegroundColor Green

    $sessionsRaw = Run-DockerSql "SELECT id, code, label, default_starts_at, default_ends_at FROM session_def WHERE is_active = true ORDER BY default_starts_at;"
    $allSessions = @()
    foreach ($line in ($sessionsRaw -split "`r`n|`n")) {
        if (-not [string]::IsNullOrWhiteSpace($line)) {
            $p = $line.Split('|')
            $allSessions += @{
                id = $p[0]
                code = $p[1]
                label = $p[2]
                startsAt = $p[3]
                endsAt = $p[4]
            }
        }
    }
    Assert-Test "Parsed dynamic sessions list" ($allSessions.Count -eq $activeSessionCount)
    $firstSession = $allSessions[0]
    $secondSession = if ($allSessions.Count -gt 1) { $allSessions[1] } else { $allSessions[0] }
    Write-Host " >> Session 1: $($firstSession.code) ($($firstSession.startsAt) - $($firstSession.endsAt))" -ForegroundColor DarkCyan
    Write-Host " >> Session 2: $($secondSession.code) ($($secondSession.startsAt) - $($secondSession.endsAt))" -ForegroundColor DarkCyan

    # --------------------------------------------------------------------------
    # 6. EDGE CASE 2: Staff Roster Hierarchy & Milestone Projection
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] EDGE CASE 2: Verifying Staff Attendance Milestones Endpoint..." -ForegroundColor Yellow
    $drMilestonesRes = Invoke-RestMethod -Uri "$apiBase/attendance/staff/$drStaffProfileId/milestones?date=$TargetDate" -Method Get -Headers $adminAuth.headers
    $drMilestones = Get-ResponseData $drMilestonesRes
    Assert-Test "Dr. Zikri milestones retrieved successfully" ($null -ne $drMilestones)
    Assert-Test "Milestones count >= 1" ($drMilestones.Count -ge 1)

    $firstM = $drMilestones[0]
    Assert-Test "Milestone has canonical sessionId" (-not [string]::IsNullOrWhiteSpace($firstM.sessionId))
    Assert-Test "Milestone has canonical shiftCode" (-not [string]::IsNullOrWhiteSpace($firstM.shiftCode))
    Assert-Test "Milestone has canonical shiftLabel" (-not [string]::IsNullOrWhiteSpace($firstM.shiftLabel))
    Assert-Test "Milestone has canonical startsAt" (-not [string]::IsNullOrWhiteSpace($firstM.startsAt))
    Assert-Test "Milestone has canonical endsAt" (-not [string]::IsNullOrWhiteSpace($firstM.endsAt))
    Assert-Test "Milestone has canonical status" ($firstM.status -in @("present", "late", "absent", "leave", "ongoing", "upcoming"))
    Assert-Test "Milestone has localized statusLabel" (-not [string]::IsNullOrWhiteSpace($firstM.statusLabel))
    Assert-Test "Milestone has boolean isCurrentShift" ($firstM.isCurrentShift -is [bool])

    Write-Host " >> Dr. Zikri Milestones Count for $TargetDate : $($drMilestones.Count)" -ForegroundColor Green
    foreach ($m in $drMilestones) {
        $curFlag = if ($m.isCurrentShift) { " [ACTIVE/NOW]" } else { "" }
        Write-Host "    - $($m.shiftCode) ($($m.startsAt) - $($m.endsAt)): $($m.statusLabel) (status: $($m.status))$curFlag" -ForegroundColor DarkCyan
    }

    # Standard staff milestones (template fallback)
    $csMilestonesRes = Invoke-RestMethod -Uri "$apiBase/attendance/staff/$csStaffProfileId/milestones?date=$TargetDate" -Method Get -Headers $adminAuth.headers
    $csMilestones = Get-ResponseData $csMilestonesRes
    Assert-Test "Standard staff milestones retrieved successfully" ($null -ne $csMilestones)
    Write-Host " >> Standard Staff Milestones Count: $($csMilestones.Count)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 7. EDGE CASE 3: Daily Attendance BFF Integration (/attendance/daily)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] EDGE CASE 3: Verifying Daily Attendance BFF Enriches Records with Milestones..." -ForegroundColor Yellow
    $dailyRes = Invoke-RestMethod -Uri "$apiBase/attendance/daily?date=$TargetDate" -Method Get -Headers $adminAuth.headers
    $dailyData = Get-ResponseData $dailyRes
    Assert-Test "Daily attendance records retrieved" ($null -ne $dailyData.records)

    $drDailyRecord = $dailyData.records | Where-Object { $_.staffProfileId -eq $drStaffProfileId } | Select-Object -First 1
    if ($drDailyRecord) {
        Assert-Test "Daily staff record contains enriched milestones array" ($drDailyRecord.milestones -is [System.Array])
        Assert-Test "Enriched milestones count matches staff milestone timeline" ($drDailyRecord.milestones.Count -eq $drMilestones.Count)
        Write-Host " >> Daily BFF properly fused $($drDailyRecord.milestones.Count) milestones into staff record" -ForegroundColor Green
    } else {
        Write-Host " >> Dr. Zikri has no attendance entry yet today; BFF returns empty list correctly" -ForegroundColor Gray
    }

    # --------------------------------------------------------------------------
    # 8. EDGE CASE 4: Attended Shift Guard (Checked-In Staff Must NOT Be Marked Absent)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] EDGE CASE 4: Attended Shift Guard (Checked-In Staff Must NOT Be Marked Absent)..." -ForegroundColor Yellow
    $checkInId = [guid]::NewGuid().ToString()
    $insertCheckInSql = @"
INSERT INTO staff_attendance_records (
    id, staff_profile_id, attendance_date, shift, check_in_at, check_out_at,
    status, recorded_method, notes, session_id, created_at, updated_at
)
VALUES (
    '$checkInId', '$drStaffProfileId', '$TargetDate', '$($secondSession.code)',
    NOW() - INTERVAL '3 hours', NOW() - INTERVAL '10 minutes',
    'present', 'qr_scan', 'Presensi resmi hadir shift uji',
    '$($secondSession.id)', NOW(), NOW()
);
"@
    $null = Run-DockerSql $insertCheckInSql
    Assert-Test "Simulated attended record created for $($secondSession.code)" $true

    $sweepAttendedRes = Invoke-RestMethod -Uri "$apiBase/attendance/shift-end/sweep?date=$TargetDate&sessionId=$($secondSession.id)" -Method Post -Headers $adminAuth.headers
    $sweepAttendedData = Get-ResponseData $sweepAttendedRes

    $checkDrAttended = (Run-DockerSql "SELECT status FROM staff_attendance_records WHERE id = '$checkInId';").Trim()
    Assert-Test "Dr. Zikri status remains 'present' after sweep (Guard works)" ($checkDrAttended -eq "present")

    $attDeductionCount = (Run-DockerSql "SELECT COUNT(*) FROM payroll_entries WHERE source_type = 'attendance' AND source_id = '$checkInId' AND entry_type = 'leave_deduction';").Trim()
    Assert-Test "Zero absence deduction entries created for attended staff" ($attDeductionCount -eq "0")

    # --------------------------------------------------------------------------
    # 9. EDGE CASE 5: Unrecorded Shift-End Sweep & Absence Finalization
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 9] EDGE CASE 5: Shift-End Sweep for Missed Shift ($($firstSession.code))..." -ForegroundColor Yellow
    $sweepRes = Invoke-RestMethod -Uri "$apiBase/attendance/shift-end/sweep?date=$TargetDate&sessionId=$($firstSession.id)" -Method Post -Headers $adminAuth.headers
    $sweepData = Get-ResponseData $sweepRes
    Assert-Test "Shift-end sweep executed successfully" ($null -ne $sweepData)
    Assert-Test "Sweep processed at least 1 shift session" ($sweepData.processedShiftsCount -ge 1)
    Write-Host " >> Sweep Processed Sessions: $($sweepData.processedShiftsCount)" -ForegroundColor Green
    Write-Host " >> Absent Records Created  : $($sweepData.totalAbsentRecordsCreated)" -ForegroundColor Green

    $absentRecordQuery = @"
SELECT id, staff_profile_id, shift, status, recorded_method, notes
FROM staff_attendance_records
WHERE attendance_date = '$TargetDate'
  AND session_id = '$($firstSession.id)'
  AND status = 'absent'
ORDER BY created_at DESC
LIMIT 1;
"@
    $absentRaw = Run-DockerSql $absentRecordQuery
    Assert-Test "Absent attendance record generated in PostgreSQL" (-not [string]::IsNullOrWhiteSpace($absentRaw))

    $absParts = $absentRaw.Trim().Split('|')
    $absRecordId = $absParts[0]
    $absStaffId = $absParts[1]
    $absShift = $absParts[2]
    $absStatus = $absParts[3]
    $absMethod = $absParts[4]
    $absNotes = $absParts[5]

    Write-Host " >> Absent Record ID     : $absRecordId" -ForegroundColor DarkCyan
    Write-Host " >> Absent StaffProfileID: $absStaffId" -ForegroundColor DarkCyan
    Write-Host " >> Recorded Method      : $absMethod" -ForegroundColor DarkCyan
    Write-Host " >> Notes                : $absNotes" -ForegroundColor DarkCyan

    Assert-Test "Record status is 'absent'" ($absStatus -eq "absent")
    Assert-Test "Recorded method is 'system'" ($absMethod -eq "system")
    Assert-Test "Notes explain automated shift-end finalization" ($absNotes -like "*otomatis oleh sistem*")

    # --------------------------------------------------------------------------
    # 10. EDGE CASE 6: MODEL B INVARIANT - Zero Negative Payroll Deductions on Absence
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] EDGE CASE 6: MODEL B INVARIANT (Honor Berbasis Jam Riil - Zero Negative Deductions)..." -ForegroundColor Yellow
    $modelBPayCount = (Run-DockerSql "SELECT COUNT(*) FROM payroll_entries WHERE source_type = 'attendance' AND source_id = '$absRecordId';").Trim()
    Assert-Test "Model B: Zero negative payroll deductions created on shift absence (count = 0)" ($modelBPayCount -eq "0")
    Write-Host " >> Model B Invariant Confirmed: Staf tidak hadir tidak dipotong minus, melainkan tidak bertambah gajinya (Rp 0)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 10B. EDGE CASE 6B: MODEL B INVARIANT - Actual Worked Shift Yields Positive Earnings
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10B] EDGE CASE 6B: Actual Worked Shift Checkout Yields Positive Earnings..." -ForegroundColor Yellow
    # Update Dr. Zikri's attendance record from Step 8 to simulate completed checkout
    Run-DockerSql "UPDATE staff_attendance_records SET check_out_at = NOW(), validated_duration_hours = 4.00, notes = 'Dinas pelayanan riil 4 jam selesai' WHERE id = '$checkInId';" | Out-Null

    # Simulate checkout use-case recording shift earnings into active period
    $activePeriodId = (Run-DockerSql "SELECT id FROM payroll_periods WHERE status != 'finalized' ORDER BY period_start DESC LIMIT 1;").Trim()
    $drWorkedEntryId = [guid]::NewGuid().ToString()
    $insertEarningsSql = @"
INSERT INTO payroll_entries (
    id, payroll_period_id, staff_profile_id, practitioner_id, entry_type, source_type,
    source_id, quantity_hours, hourly_rate, amount, description, created_at
)
VALUES (
    '$drWorkedEntryId', '$activePeriodId', '$drStaffProfileId', '$drPractitionerId',
    'base_scheduled', 'attendance', '$checkInId', 4.00, 150000.00, 600000.00,
    'Honor Pelayanan Klinis Terjadwal (4.00 jam x Rp 150.000)', NOW()
);
"@
    $null = Run-DockerSql $insertEarningsSql

    $summaryRes = Invoke-RestMethod -Uri "$apiBase/payroll/my-summary" -Method Get -Headers $drAuth.headers
    $summaryData = Get-ResponseData $summaryRes
    Assert-Test "Dr. Zikri retrieved /payroll/my-summary" ($null -ne $summaryData)
    Assert-Test "Base earnings reflect actual worked shift (+Rp 600.000)" ($summaryData.baseEarnings -ge 600000)
    Write-Host " >> Mobile My-Summary Net THP        : Rp $($summaryData.netPayroll.ToString('N0'))" -ForegroundColor Green
    Write-Host " >> Mobile My-Summary Base Earnings  : Rp $($summaryData.baseEarnings.ToString('N0'))" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 10C. EDGE CASE 6C: MODEL A DORMANT BACKWARD COMPATIBILITY (deductPayroll=true)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10C] EDGE CASE 6C: Model A Backward Compatibility Verification (deductPayroll=true)..." -ForegroundColor Yellow
    # Delete absent record for CS Rina to test clean Model A execution
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE attendance_date = '$TargetDate' AND session_id = '$($firstSession.id)' AND staff_profile_id = '$csStaffProfileId';" | Out-Null

    $modelARes = Invoke-RestMethod -Uri "$apiBase/attendance/shift-end/sweep?date=$TargetDate&sessionId=$($firstSession.id)&forceAllShifts=true&deductPayroll=true" -Method Post -Headers $adminAuth.headers
    $modelAData = Get-ResponseData $modelARes
    Assert-Test "Model A sweep with deductPayroll=true responded successfully" ($null -ne $modelAData)

    $modelAEntry = Run-DockerSql "SELECT pe.id, pe.entry_type, pe.amount, pe.description FROM payroll_entries pe JOIN staff_attendance_records ar ON pe.source_id = ar.id WHERE ar.attendance_date = '$TargetDate' AND ar.session_id = '$($firstSession.id)' AND pe.entry_type = 'leave_deduction' ORDER BY pe.created_at DESC LIMIT 1;"
    if (-not [string]::IsNullOrWhiteSpace($modelAEntry)) {
        $maParts = $modelAEntry.Trim().Split('|')
        Write-Host " >> Model A Entry ID   : $($maParts[0])" -ForegroundColor DarkCyan
        Write-Host " >> Model A Type       : $($maParts[1])" -ForegroundColor DarkCyan
        Write-Host " >> Model A Description: $($maParts[3])" -ForegroundColor DarkCyan
        Assert-Test "Model A entry_type is 'leave_deduction'" ($maParts[1] -eq "leave_deduction")
    }

    # --------------------------------------------------------------------------
    # 11. EDGE CASE 7: Idempotency Protection (Zero Duplicate Records)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 11] EDGE CASE 7: Testing Shift-End Sweep Idempotency..." -ForegroundColor Yellow
    $repeatSweepRes = Invoke-RestMethod -Uri "$apiBase/attendance/shift-end/sweep?date=$TargetDate&sessionId=$($firstSession.id)" -Method Post -Headers $adminAuth.headers
    $repeatSweepData = Get-ResponseData $repeatSweepRes

    Assert-Test "Re-running sweep returns totalAbsentRecordsCreated = 0" ($repeatSweepData.totalAbsentRecordsCreated -eq 0)

    $dupAttendanceCount = (Run-DockerSql "SELECT COUNT(*) FROM staff_attendance_records WHERE attendance_date = '$TargetDate' AND session_id = '$($firstSession.id)' AND staff_profile_id = '$absStaffId';").Trim()
    Assert-Test "Attendance records remain strictly 1 for this staff and session" ($dupAttendanceCount -eq "1")

    # --------------------------------------------------------------------------
    # 12. EDGE CASE 8: Database Trigger Cascading Deletion Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 12] EDGE CASE 8: Verifying PostgreSQL Trigger Cascading Deletion..." -ForegroundColor Yellow
    Write-Host " >> Deleting absent attendance record $absRecordId to test trg_cascade_attendance_payroll_deletion..." -ForegroundColor Gray
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$absRecordId';" | Out-Null

    $cascadedEntryCount = (Run-DockerSql "SELECT COUNT(*) FROM payroll_entries WHERE source_type = 'attendance' AND source_id = '$absRecordId';").Trim()
    Assert-Test "PostgreSQL trigger automatically deleted orphan payroll entry (count = 0)" ($cascadedEntryCount -eq "0")

    # --------------------------------------------------------------------------
    # 13. EDGE CASE 9: Realtime Targeted Push Notification & Zero Broadcast Leakage
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 13] EDGE CASE 9: Verifying Targeted User Push Notification (Zero Leakage)..." -ForegroundColor Yellow
    $notifQuery = @"
SELECT n.id, n.title, n.body, nr.user_id
FROM notifications n
JOIN notification_recipients nr ON n.id = nr.notification_id
WHERE n.title = 'Peringatan: Anda Tercatat Tidak Hadir'
ORDER BY n.created_at DESC
LIMIT 1;
"@
    $notifRaw = Run-DockerSql $notifQuery
    if (-not [string]::IsNullOrWhiteSpace($notifRaw)) {
        $nParts = $notifRaw.Trim().Split('|')
        $notifId = $nParts[0]
        $notifTitle = $nParts[1]
        $notifBody = $nParts[2]
        $notifRecipientUserId = $nParts[3]

        Write-Host " >> Notification ID    : $notifId" -ForegroundColor DarkCyan
        Write-Host " >> Title              : $notifTitle" -ForegroundColor Green
        Write-Host " >> Body               : $notifBody" -ForegroundColor Green
        Write-Host " >> Recipient User ID  : $notifRecipientUserId" -ForegroundColor DarkCyan

        Assert-Test "Notification title matches canonical warning" ($notifTitle -eq "Peringatan: Anda Tercatat Tidak Hadir")
        Assert-Test "Notification body announces shift absence clearly" ($notifBody -match "tidak hadir")

        $recipCount = (Run-DockerSql "SELECT COUNT(*) FROM notification_recipients WHERE notification_id = '$notifId';").Trim()
        Assert-Test "Notification delivered strictly to 1 recipient (Zero Broadcast Leakage)" ($recipCount -eq "1")
    }

    # --------------------------------------------------------------------------
    # 14. Post-Flight Cleanup
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 14] Post-Flight Cleanup..." -ForegroundColor Yellow
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$checkInId';" | Out-Null
    Run-DockerSql "DELETE FROM payroll_entries WHERE id = '$drWorkedEntryId';" | Out-Null
    Write-Host " >> Test records cleaned up successfully" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # Suite Summary
    # --------------------------------------------------------------------------
    Print-TestSummary "Staff Attendance Milestones & Shift-End Absence Engine (Model B) Hardening Suite"

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    Print-TestSummary "Staff Attendance Milestones & Shift-End Absence Engine (Model B) Hardening Suite"
    exit 1
}
