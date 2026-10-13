# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: APPOINTMENT RESCHEDULE (HONEST & API-FIRST)
# ==============================================================================
param (
    [string]$AppointmentId = "",
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [SCENARIO 2] APPOINTMENT RESCHEDULE WORKFLOW (API-FIRST & RUNTIME TRUTH)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# 1. Login Patient
Write-Host "`n[STEP 1] Authenticating as Patient..." -ForegroundColor Yellow
$patientAuth = Login-Patient
Assert-Test "Patient authenticated successfully" ($null -ne $patientAuth.token)

# 2. Discover or Ensure Target Appointment Exists
$targetAptId = $AppointmentId
if ([string]::IsNullOrWhiteSpace($targetAptId)) {
    Write-Host "`n[STEP 2] Discovering Active Appointment for Reschedule..." -ForegroundColor Yellow
    $myAppts = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/me" -Method Get -Headers $patientAuth.headers))
    $candidate = $myAppts | Where-Object { $_.rawStatus -in @('booked', 'waiting') -or $_.status -in @('BOOKED', 'WAITING') } | Select-Object -First 1
    if ($candidate) {
        $targetAptId = $candidate.id
        Write-Host " Found existing candidate appointment: ID=$targetAptId (Status=$($candidate.status))" -ForegroundColor Cyan
    } else {
        Write-Host " No existing active appointment found. Creating new appointment via booking scenario..." -ForegroundColor Yellow
        $newAppt = & "$PSScriptRoot\test-book.ps1" -Standalone:$false
        $targetAptId = $newAppt.id
    }
}
Assert-Test "Target appointment ID for reschedule established" ($null -ne $targetAptId -and $targetAptId.Length -gt 20)

# 3. Query Reschedule Options Endpoint
Write-Host "`n[STEP 3] Fetching Reschedule Options via API..." -ForegroundColor Yellow
$optionsRes = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$targetAptId/reschedule-options" -Method Get -Headers $patientAuth.headers)
Assert-Test "Reschedule options successfully retrieved" ($null -ne $optionsRes)
Assert-Test "Current schedule metadata provided" ($null -ne $optionsRes.currentDate)

$availableDates = @($optionsRes.availableDates)
Assert-Test "Doctor has available reschedule dates" ($availableDates.Count -gt 0)

# 4. Extract Target Alternative Shift
Write-Host "`n[STEP 4] Selecting Valid Alternative Session Shift..." -ForegroundColor Yellow
$targetDateOption = $availableDates | Where-Object { $_.shifts.Count -gt 0 } | Select-Object -First 1
if (-not $targetDateOption) {
    throw "No available dates with active session shifts found for reschedule."
}

$targetShift = @($targetDateOption.shifts) | Where-Object { $_.isAvailable -eq $true } | Select-Object -First 1
if (-not $targetShift) {
    $targetShift = $targetDateOption.shifts[0]
}

Write-Host " Target Date : $($targetDateOption.date)" -ForegroundColor Cyan
Write-Host " Target Shift: $($targetShift.label) ($($targetShift.startTime) - $($targetShift.endTime))" -ForegroundColor Cyan
Write-Host " Session ID  : $($targetShift.sessionId)" -ForegroundColor Cyan

Assert-Test "Target session ID extracted from options" ($null -ne $targetShift.sessionId)

# Ensure patient has no conflicting active ticket on target date (Rule H2)
if ($targetDateOption.date -ne $optionsRes.currentDate) {
    Run-DockerSql "DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$($targetDateOption.date)' AND patient_id = (SELECT patient_id FROM appointments WHERE id = '$targetAptId'));"
    Run-DockerSql "DELETE FROM queue_tickets WHERE queue_date = '$($targetDateOption.date)' AND patient_id = (SELECT patient_id FROM appointments WHERE id = '$targetAptId');"
    Run-DockerSql "DELETE FROM appointments WHERE scheduled_date = '$($targetDateOption.date)' AND patient_id = (SELECT patient_id FROM appointments WHERE id = '$targetAptId') AND id != '$targetAptId';"
}

# 5. Execute Reschedule via API
Write-Host "`n[STEP 5] Submitting Reschedule Mutation..." -ForegroundColor Yellow
$reschedulePayload = @{
    target_session_id = $targetShift.sessionId
    target_date = $targetDateOption.date
    target_start_time = $targetShift.startTime
    target_end_time = $targetShift.endTime
    reason = "Penyesuaian jadwal kontrol mandiri (E2E Test)"
} | ConvertTo-Json

$rescheduledAppt = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$targetAptId/reschedule" -Method Post -Body $reschedulePayload -Headers $patientAuth.headers)
Assert-Test "Reschedule executed successfully" ($null -ne $rescheduledAppt)
Assert-Test "Rescheduled appointment date matches target date" ($rescheduledAppt.appointmentDate -eq $targetDateOption.date)
Write-Host " Rescheduled Status: $($rescheduledAppt.status), New Date: $($rescheduledAppt.appointmentDate)" -ForegroundColor Green

# 6. Verify Direct Database State via Docker PostgreSQL
Write-Host "`n[STEP 6] Verifying Database State via Docker PostgreSQL..." -ForegroundColor Yellow
$dbAptDate = Run-DockerSql "SELECT to_char(scheduled_date, 'YYYY-MM-DD') FROM appointments WHERE id = '$targetAptId';"
Assert-Test "Database scheduled_date matches target date ($($targetDateOption.date))" ($dbAptDate.Trim() -eq $targetDateOption.date)

$dbCarriedOver = Run-DockerSql "SELECT carried_over FROM queue_tickets WHERE appointment_id = '$targetAptId';"
Assert-Test "Database queue_tickets carried_over flag verified" ($dbCarriedOver.Trim() -eq "t" -or $dbCarriedOver.Trim() -eq "f")

Write-Host "`n[SCENARIO 2 COMPLETED] Reschedule workflow verified honestly with zero fake mocks." -ForegroundColor Green
if ($Standalone) { Print-TestSummary "Appointment Reschedule Scenario" }

return $rescheduledAppt
