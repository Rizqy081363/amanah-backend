# Test Suite: Purge Dev Tools & Database Cascade Triggers
# Location: backend/scripts/e2e/test-purge-dev-tools.ps1

$ErrorActionPreference = "Stop"

function Log-Header ($text) {
    Write-Host "`n========================================================" -ForegroundColor Cyan
    Write-Host " $text" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
}

function Log-Step ($step, $title) {
    Write-Host "`n[$step] $title" -ForegroundColor Yellow
}

function Log-Success ($text) {
    Write-Host "  [PASS] $text" -ForegroundColor Green
}

function Log-Fail ($text) {
    Write-Host "  [FAIL] $text" -ForegroundColor Red
}

function Run-SqlScalar ([string]$sql) {
    $cleanSql = $sql -replace "`r`n", " " -replace "`n", " " -replace '"', '\"'
    $cmd = "docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -q -c ""$cleanSql"""
    $res = cmd /c $cmd
    if ($res) {
        $lines = ($res | Out-String).Trim().Split([Environment]::NewLine)
        return $lines[0].Trim()
    }
    return ""
}

$script:passedCount = 0
$script:failedCount = 0

function Assert-Condition ($title, $condition) {
    if ($condition) {
        Log-Success $title
        $script:passedCount++
    } else {
        Log-Fail $title
        $script:failedCount++
    }
}

Log-Header "AMANAH HEALTHCARE - PURGE DEV TOOLS & CASCADE TRIGGERS VERIFICATION"

# -----------------------------------------------------------------------------
# STEP 1: Verify Database Triggers in PostgreSQL
# -----------------------------------------------------------------------------
Log-Step 1 "Verifying Database Triggers in PostgreSQL"

$attTrigger = Run-SqlScalar "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'staff_attendance_records'::regclass AND tgname = 'trg_cascade_attendance_payroll_deletion';"
Assert-Condition "Trigger trg_cascade_attendance_payroll_deletion exists on staff_attendance_records" ($attTrigger -eq "1")

$leaveTrigger = Run-SqlScalar "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'staff_leave_requests'::regclass AND tgname = 'trg_cascade_leave_payroll_deletion';"
Assert-Condition "Trigger trg_cascade_leave_payroll_deletion exists on staff_leave_requests" ($leaveTrigger -eq "1")

# -----------------------------------------------------------------------------
# STEP 2: Test Trigger Cascade on Leave Deletion
# -----------------------------------------------------------------------------
Log-Step 2 "Testing Leave Request -> Payroll Deduction Cascade Trigger"

# Get a valid staff profile and user
$staffId = Run-SqlScalar "SELECT id FROM staff_profiles LIMIT 1;"
$userId = Run-SqlScalar "SELECT id FROM users LIMIT 1;"

# Create a draft payroll period
$testPeriodId = Run-SqlScalar "INSERT INTO payroll_periods (period_name, period_start, period_end, status) VALUES ('Test Trigger Period', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', 'draft') RETURNING id;"

# Create a test leave request (with review consistency for approved status)
$testLeaveId = Run-SqlScalar "INSERT INTO staff_leave_requests (staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_by, reviewed_at) VALUES ('$staffId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Test Trigger Leave', 'approved', '$userId', NOW()) RETURNING id;"

# Insert a leave deduction in payroll_entries
$testEntryId = Run-SqlScalar "INSERT INTO payroll_entries (payroll_period_id, staff_profile_id, entry_type, source_type, source_id, quantity_hours, hourly_rate, amount, description) VALUES ('$testPeriodId', '$staffId', 'leave_deduction', 'leave_request', '$testLeaveId', 8.00, 50000.00, 400000.00, 'Test Deduction') RETURNING id;"

$entryExistsBefore = Run-SqlScalar "SELECT count(*) FROM payroll_entries WHERE id = '$testEntryId';"
Assert-Condition "Payroll entry exists before leave deletion" ($entryExistsBefore -eq "1")

# Delete the leave request directly
Run-SqlScalar "DELETE FROM staff_leave_requests WHERE id = '$testLeaveId';" | Out-Null

$entryExistsAfter = Run-SqlScalar "SELECT count(*) FROM payroll_entries WHERE id = '$testEntryId';"
Assert-Condition "Payroll entry was automatically deleted by trg_cascade_leave_payroll_deletion" ($entryExistsAfter -eq "0")

# Clean up test period
Run-SqlScalar "DELETE FROM payroll_periods WHERE id = '$testPeriodId';" | Out-Null

# -----------------------------------------------------------------------------
# STEP 3: Test CLI Purge - Payroll
# -----------------------------------------------------------------------------
Log-Step 3 "Testing CLI Purge: bun run db:purge:payroll:all"

# Seed a temporary period & entry
$cliPeriodId = Run-SqlScalar "INSERT INTO payroll_periods (period_name, period_start, period_end, status) VALUES ('CLI Test Period', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', 'draft') RETURNING id;"
Run-SqlScalar "INSERT INTO payroll_entries (payroll_period_id, staff_profile_id, entry_type, source_type, source_id, quantity_hours, hourly_rate, amount, description) VALUES ('$cliPeriodId', '$staffId', 'base_scheduled', 'manual', NULL, 5.00, 50000.00, 250000.00, 'CLI Test') RETURNING id;" | Out-Null

# Execute CLI purge
Push-Location backend
bun ./scripts/dev/purge-user.ts --payroll-flush-all --yes | Out-Null
Pop-Location

$periodsRemaining = Run-SqlScalar "SELECT count(*) FROM payroll_periods;"
$entriesRemaining = Run-SqlScalar "SELECT count(*) FROM payroll_entries;"

Assert-Condition "All payroll periods were purged" ($periodsRemaining -eq "0")
Assert-Condition "All payroll entries were purged" ($entriesRemaining -eq "0")

# -----------------------------------------------------------------------------
# STEP 4: Test CLI Purge - Leave Requests
# -----------------------------------------------------------------------------
Log-Step 4 "Testing CLI Purge: bun run db:purge:leave:all"

# Seed a temporary leave request (pending status does not require reviewer)
Run-SqlScalar "INSERT INTO staff_leave_requests (staff_profile_id, request_type, start_date, end_date, duration_days, reason, status) VALUES ('$staffId', 'sick_leave', CURRENT_DATE, CURRENT_DATE, 1, 'CLI Test Leave', 'pending');" | Out-Null

Push-Location backend
bun ./scripts/dev/purge-user.ts --leave-flush-all --yes | Out-Null
Pop-Location

$leavesRemaining = Run-SqlScalar "SELECT count(*) FROM staff_leave_requests;"
Assert-Condition "All staff leave requests were purged" ($leavesRemaining -eq "0")

# -----------------------------------------------------------------------------
# STEP 5: Test CLI Purge - Replacement Opportunities
# -----------------------------------------------------------------------------
Log-Step 5 "Testing CLI Purge: bun run db:purge:replacement:all"

# Seed a leave request + replacement opportunity
$repLeaveId = Run-SqlScalar "INSERT INTO staff_leave_requests (staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_by, reviewed_at) VALUES ('$staffId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Leave For Rep', 'approved', '$userId', NOW()) RETURNING id;"
$sessionId = Run-SqlScalar "SELECT id FROM session_def LIMIT 1;"
$repId = Run-SqlScalar "INSERT INTO replacement_opportunities (leave_request_id, session_id, work_date, original_staff_profile_id, status) VALUES ('$repLeaveId', '$sessionId', CURRENT_DATE, '$staffId', 'open') RETURNING id;"

Push-Location backend
bun ./scripts/dev/purge-user.ts --replacement-flush-all --yes | Out-Null
Pop-Location

$repsRemaining = Run-SqlScalar "SELECT count(*) FROM replacement_opportunities;"
Assert-Condition "All replacement opportunities were purged" ($repsRemaining -eq "0")

# Clean up leave
Run-SqlScalar "DELETE FROM staff_leave_requests WHERE id = '$repLeaveId';" | Out-Null

# -----------------------------------------------------------------------------
# STEP 6: Test CLI Purge - Nuclear Dev Reset
# -----------------------------------------------------------------------------
Log-Step 6 "Testing CLI Purge: bun run db:purge:nuclear"

# Seed temporary attendance, leave, and payroll
$newLeaveId = Run-SqlScalar "INSERT INTO staff_leave_requests (staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_by, reviewed_at) VALUES ('$staffId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Nuclear Leave', 'approved', '$userId', NOW()) RETURNING id;"
$newPId = Run-SqlScalar "INSERT INTO payroll_periods (period_name, period_start, period_end, status) VALUES ('Nuclear Period', CURRENT_DATE, CURRENT_DATE + INTERVAL '1 month', 'draft') RETURNING id;"
Run-SqlScalar "INSERT INTO payroll_entries (payroll_period_id, staff_profile_id, entry_type, source_type, source_id, quantity_hours, hourly_rate, amount, description) VALUES ('$newPId', '$staffId', 'leave_deduction', 'leave_request', '$newLeaveId', 4.00, 50000.00, 200000.00, 'Nuclear Entry') RETURNING id;" | Out-Null

Push-Location backend
bun ./scripts/dev/purge-user.ts --nuclear-reset --yes | Out-Null
Pop-Location

$finalAtt = Run-SqlScalar "SELECT count(*) FROM staff_attendance_records;"
$finalLeave = Run-SqlScalar "SELECT count(*) FROM staff_leave_requests;"
$finalRep = Run-SqlScalar "SELECT count(*) FROM replacement_opportunities;"
$finalPeriod = Run-SqlScalar "SELECT count(*) FROM payroll_periods;"
$finalEntries = Run-SqlScalar "SELECT count(*) FROM payroll_entries;"

Assert-Condition "Nuclear reset cleared staff_attendance_records" ($finalAtt -eq "0")
Assert-Condition "Nuclear reset cleared staff_leave_requests" ($finalLeave -eq "0")
Assert-Condition "Nuclear reset cleared replacement_opportunities" ($finalRep -eq "0")
Assert-Condition "Nuclear reset cleared payroll_periods" ($finalPeriod -eq "0")
Assert-Condition "Nuclear reset cleared payroll_entries" ($finalEntries -eq "0")

# -----------------------------------------------------------------------------
# SUMMARY
# -----------------------------------------------------------------------------
Log-Header "TEST SUMMARY"
Write-Host "Total Passed: $script:passedCount" -ForegroundColor Green
Write-Host "Total Failed: $script:failedCount" -ForegroundColor $(if ($script:failedCount -eq 0) { "Green" } else { "Red" })

if ($script:failedCount -gt 0) {
    exit 1
} else {
    exit 0
}
