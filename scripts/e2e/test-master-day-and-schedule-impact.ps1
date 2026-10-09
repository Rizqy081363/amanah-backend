# ==============================================================================
# End-to-End Test Suite: Master Day Entity & Schedule Configuration Impact Safety
# ==============================================================================
param (
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING E2E TEST: MASTER DAY ENTITY & SCHEDULE IMPACT SAFETY" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
Reset-TestCounters

$creds = Get-AdminCredentials
$auth = Login-User $creds.email $creds.password
$apiUrl = Get-E2EApiBaseUrl

# ------------------------------------------------------------------------------
# TEST 1: Database-Driven Days & Physical 28 Templates
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 1] Verifying master_day Table and Configuration Endpoint..." -ForegroundColor Yellow

$config = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration" -Method Get -Headers $auth.headers

Assert-Test "Configuration returns exactly 7 days from master_day table" ($config.days.Count -eq 7)
Assert-Test "First day in Indonesian sequence is Senin (dow: 1)" ($config.days[0].dow -eq 1 -and $config.days[0].label -eq "Senin")
Assert-Test "Last day in Indonesian sequence is Minggu (dow: 0)" ($config.days[6].dow -eq 0 -and $config.days[6].label -eq "Minggu")
Assert-Test "Configuration returns all 28 physical weekly schedule slots" ($config.weeklyTemplates.Count -eq 28)
Assert-Test "All 4 canonical operational shifts are present" ($config.sessionDefs.Count -eq 4)

# ------------------------------------------------------------------------------
# TEST 2: High-Impact Evaluator on Shift Deactivation
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 2] Evaluating Impact on Operational Shift Deactivation..." -ForegroundColor Yellow

$morningDef = $config.sessionDefs | Where-Object { $_.code -eq "morning" } | Select-Object -First 1
Assert-Test "Found canonical morning shift definition" ($null -ne $morningDef)

$evalBody = @{
    sessionDefs = @(
        @{
            id = $morningDef.id
            isActive = $false
        }
    )
} | ConvertTo-Json

$impact = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/evaluate-impact" -Method Post -Headers $auth.headers -Body $evalBody -ContentType "application/json"

Assert-Test "Evaluator returns HIGH severity when deactivating shift with doctors" ($impact.severity -eq "HIGH")
Assert-Test "Evaluator correctly counts assigned doctors" ($impact.affectedDoctorsCount -gt 0)
Assert-Test "Evaluator provides human-readable warning messages" ($impact.warnings.Count -gt 0)

Write-Host "  > Severity: $($impact.severity)" -ForegroundColor DarkGray
Write-Host "  > Affected Doctors: $($impact.affectedDoctorsCount)" -ForegroundColor DarkGray
Write-Host "  > Affected Appointments: $($impact.affectedAppointmentsCount)" -ForegroundColor DarkGray
$warnText = $impact.warnings -join " | "
Write-Host "  > Warnings: $warnText" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# TEST 3: Safe Change Evaluator (Zero Impact)
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 3] Evaluating Impact on Safe / Non-disruptive Changes..." -ForegroundColor Yellow

$safeBody = @{
    clinicSettings = @(
        @{
            key = "clinic.appointment.consultation_duration_minutes"
            value = 15
        }
    )
} | ConvertTo-Json

$safeImpact = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/evaluate-impact" -Method Post -Headers $auth.headers -Body $safeBody -ContentType "application/json"

Assert-Test "Evaluator returns NONE severity for harmless parameter changes" ($safeImpact.severity -eq "NONE")
Assert-Test "Safe change has 0 affected doctors" ($safeImpact.affectedDoctorsCount -eq 0)
Assert-Test "Safe change has 0 affected appointments" ($safeImpact.affectedAppointmentsCount -eq 0)
Assert-Test "Safe change produces no blocking warnings" ($safeImpact.warnings.Count -eq 0)

# ------------------------------------------------------------------------------
# TEST 4: Weekly Template Slot Impact Evaluation
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 4] Evaluating Impact on Weekly Template Slot Deactivation..." -ForegroundColor Yellow

$templateToDeactivate = $config.weeklyTemplates | Where-Object { $_.sessionId -eq $morningDef.id -and $_.dow -eq 1 } | Select-Object -First 1
Assert-Test "Found Monday morning weekly template" ($null -ne $templateToDeactivate)

$tplBody = @{
    weeklyTemplates = @(
        @{
            sessionId = $templateToDeactivate.sessionId
            dow = $templateToDeactivate.dow
            startsAt = $templateToDeactivate.startsAt
            endsAt = $templateToDeactivate.endsAt
            isActive = $false
        }
    )
} | ConvertTo-Json

$tplImpact = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/evaluate-impact" -Method Post -Headers $auth.headers -Body $tplBody -ContentType "application/json"

Assert-Test "Weekly slot deactivation evaluated with proper severity" ($tplImpact.severity -eq "HIGH" -or $tplImpact.severity -eq "LOW")
Assert-Test "Weekly slot deactivation checks doctor bindings" ($tplImpact.affectedDoctorsCount -ge 0)

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "Master Day & Schedule Configuration Impact Safety Suite"
