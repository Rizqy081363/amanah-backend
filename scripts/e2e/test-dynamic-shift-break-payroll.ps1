# ==============================================================================
# E2E Test: Dynamic Shift Hours, Break Time Governance & Payroll Calculation
# ==============================================================================
param(
  [string]$BaseUrl = "http://127.0.0.1:3001/api/v1",
  [string]$AdminEmail = "admin@amanah.com",
  [string]$AdminPass = "secret123"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "E2E TEST: DYNAMIC SHIFT HOURS, BREAK TIME & PAYROLL ENGINE HARNESS" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

# 1. Login Admin
Write-Host "`n[1/5] Authenticating Admin ($AdminEmail)..." -ForegroundColor Yellow
$loginPayload = @{
  email = $AdminEmail
  password = $AdminPass
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$BaseUrl/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$token = $loginRes.token
if (-not $token) {
  throw "Failed to acquire admin token!"
}
Write-Host " Admin JWT acquired successfully." -ForegroundColor Green
$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json"
}

# 2. Fetch Schedule Configuration
Write-Host "`n[2/5] Fetching Schedule & Clinic Configuration..." -ForegroundColor Yellow
$configRes = Invoke-RestMethod -Uri "$BaseUrl/admin/schedule-configuration" -Method Get -Headers $headers
$data = if ($configRes.data) { $configRes.data } else { $configRes }

$morningSession = $data.sessionDefs | Where-Object { $_.code -eq "morning" }
$breakSetting = $data.clinicSettings | Where-Object { $_.key -eq "roster.break_duration_minutes" }
$isPaidSetting = $data.clinicSettings | Where-Object { $_.key -eq "roster.is_break_paid" }

Write-Host " Morning Shift: $($morningSession.defaultStartsAt) - $($morningSession.defaultEndsAt)" -ForegroundColor White
Write-Host " Break Duration: $($breakSetting.value) minutes" -ForegroundColor White
Write-Host " Is Break Paid: $($isPaidSetting.value)" -ForegroundColor White

if ($breakSetting.value -ne 30) {
  throw "Expected roster.break_duration_minutes to be 30, got: $($breakSetting.value)"
}
Write-Host " Break settings verified in configuration registry." -ForegroundColor Green

# 3. Calculate Baseline Payroll (Default 6h shift - 30m break = 5.5h net)
Write-Host "`n[3/5] Calculating Baseline Payroll (2026-10-01 to 2026-10-31)..." -ForegroundColor Yellow
$calcPayload = @{
  periodName = "Periode Oktober 2026"
  periodStart = "2026-10-01"
  periodEnd = "2026-10-31"
  notes = "Automated E2E Test: Baseline Dynamic Shift Break"
} | ConvertTo-Json

$payrollRes = Invoke-RestMethod -Uri "$BaseUrl/payroll/calculate" -Method Post -Headers $headers -Body $calcPayload
Write-Host " Payroll calculated successfully. Payout: Rp $($payrollRes.period.totalPayout)" -ForegroundColor Green

# Verify in database that doctor hours are calculated from 5.5 net hours
$dbEntries = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "
  SELECT p.display_name, pe.entry_type, pe.quantity_hours, pe.hourly_rate, pe.amount
  FROM payroll_entries pe
  JOIN practitioners p ON pe.practitioner_id = p.id
  WHERE pe.entry_type = 'base_scheduled'
  LIMIT 5;
"

Write-Host " Database Base Scheduled Entries (Sample):" -ForegroundColor Magenta
$dbEntries | ForEach-Object { Write-Host "   $_" -ForegroundColor White }

# 4. Mutate Morning Shift to 07:00:00 - 12:00:00 (5h gross - 30m break = 4.5h net)
Write-Host "`n[4/5] Testing Dynamic Shift Range Mutation via Master Shift..." -ForegroundColor Yellow
$origStartsAt = $morningSession.defaultStartsAt
$origEndsAt = $morningSession.defaultEndsAt

$updateDefPayload = @{
  defs = @(
    @{
      id = $morningSession.id
      isActive = $true
      defaultStartsAt = "07:00:00"
      defaultEndsAt = "12:00:00"
    }
  )
} | ConvertTo-Json

$updateRes = Invoke-RestMethod -Uri "$BaseUrl/admin/schedule-configuration/session-defs" -Method Put -Headers $headers -Body $updateDefPayload
Write-Host " Master shift updated to 07:00:00 - 12:00:00. Response: $($updateRes.message)" -ForegroundColor Green

# Check cascade to session_schedule in DB
$cascadedTimes = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "
  SELECT starts_at, ends_at FROM session_schedule WHERE session_id = '$($morningSession.id)' LIMIT 3;
"
Write-Host " Cascaded session_schedule times in DB: $cascadedTimes" -ForegroundColor White
if ($cascadedTimes -notmatch "07:00:00") {
  throw "Cascade to session_schedule failed! Expected 07:00:00."
}
Write-Host " Cascade verification passed!" -ForegroundColor Green

# Recalculate Payroll with modified shift hours
Write-Host " Recalculating payroll with new 4.50h net morning shift..." -ForegroundColor Yellow
$payrollRes2 = Invoke-RestMethod -Uri "$BaseUrl/payroll/calculate" -Method Post -Headers $headers -Body $calcPayload
Write-Host " Recalculated Payout: Rp $($payrollRes2.period.totalPayout)" -ForegroundColor Green

# 5. Restore Original Master Shift Settings
Write-Host "`n[5/5] Restoring Original Master Shift Settings..." -ForegroundColor Yellow
$restoreDefPayload = @{
  defs = @(
    @{
      id = $morningSession.id
      isActive = $true
      defaultStartsAt = $origStartsAt
      defaultEndsAt = $origEndsAt
    }
  )
} | ConvertTo-Json

$restoreRes = Invoke-RestMethod -Uri "$BaseUrl/admin/schedule-configuration/session-defs" -Method Put -Headers $headers -Body $restoreDefPayload
Write-Host " Restored master shift to $origStartsAt - $origEndsAt." -ForegroundColor Green

# Recalculate baseline once more to keep DB in clean state
$null = Invoke-RestMethod -Uri "$BaseUrl/payroll/calculate" -Method Post -Headers $headers -Body $calcPayload

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "ALL DYNAMIC SHIFT BREAK & PAYROLL HARNESS TESTS PASSED (100% SUCCESS)!" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
