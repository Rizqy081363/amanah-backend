# ==============================================================================
# End-to-End Test Suite: Clinic Configuration Metadata Hardening & Zero Leak
# ==============================================================================
param (
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING E2E TEST: CLINIC CONFIGURATION METADATA & ZERO LEAK" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
Reset-TestCounters

$creds = Get-AdminCredentials
$auth = Login-User $creds.email $creds.password
$apiUrl = Get-E2EApiBaseUrl

# ------------------------------------------------------------------------------
# TEST 1: Retrieve Clinic Settings & Zero Leaked Internal Keys
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 1] Verifying Clinic Settings Output & Leak Prevention..." -ForegroundColor Yellow

$config = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration" -Method Get -Headers $auth.headers

$settings = $config.clinicSettings
Write-Host "  > Received $($settings.Count) operational clinic settings" -ForegroundColor DarkGray

Assert-Test "Configuration returns operational settings array" ($settings.Count -gt 0)

$forbiddenInternalKeys = @(
    "closure.min_open_segment_minutes",
    "closure.last_call_buffer_minutes",
    "closure.long_confirm_days",
    "eta.spread_z",
    "eta.update_threshold_minutes",
    "feature.legacy_compat",
    "duration.prior_weight",
    "duration.window_days",
    "duration.min_samples",
    "duration.stale_factor",
    "queue.load_ratio.ok_max",
    "queue.load_ratio.busy_max"
)

$foundLeaks = @()
foreach ($key in $forbiddenInternalKeys) {
    $match = $settings | Where-Object { $_.key -eq $key }
    if ($match) {
        $foundLeaks += $key
    }
}

Assert-Test "Zero internal algorithm keys leaked into admin response" ($foundLeaks.Count -eq 0)
if ($foundLeaks.Count -gt 0) {
    Write-Host "  > Leaked keys detected: $($foundLeaks -join ', ')" -ForegroundColor Red
}

# ------------------------------------------------------------------------------
# TEST 2: Authoritative Select Metadata (Locale with FlagCode & Timezone)
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 2] Verifying Select Metadata (Locale & Timezone)..." -ForegroundColor Yellow

$localeSetting = $settings | Where-Object { $_.key -eq "clinic.locale" } | Select-Object -First 1
Assert-Test "clinic.locale exists in operational settings" ($null -ne $localeSetting)
Assert-Test "clinic.locale has select controlType" ($localeSetting.controlType -eq "select")
Assert-Test "clinic.locale has friendly label" ($localeSetting.label -eq "Negara & Format Bahasa")
Assert-Test "clinic.locale options include Indonesia" ($localeSetting.options.Count -gt 0 -and $localeSetting.options[0].value -eq "id-ID")
Assert-Test "clinic.locale option provides flagCode 'id'" ($localeSetting.options[0].flagCode -eq "id")
Assert-Test "clinic.locale option provides countryCode 'ID'" ($localeSetting.options[0].countryCode -eq "ID")

$tzSetting = $settings | Where-Object { $_.key -eq "clinic.timezone" } | Select-Object -First 1
Assert-Test "clinic.timezone exists in operational settings" ($null -ne $tzSetting)
Assert-Test "clinic.timezone has select controlType" ($tzSetting.controlType -eq "select")
Assert-Test "clinic.timezone has friendly label" ($tzSetting.label -eq "Zona Waktu Operasional")
Assert-Test "clinic.timezone has 3 Indonesian timezone options" ($tzSetting.options.Count -eq 3)

# ------------------------------------------------------------------------------
# TEST 3: Numeric Inputs with Units and Boolean Switches
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 3] Verifying Numeric Inputs with Units and Switches..." -ForegroundColor Yellow

$durationPrior = $settings | Where-Object { $_.key -eq "duration.prior_minutes" } | Select-Object -First 1
Assert-Test "duration.prior_minutes has number controlType" ($durationPrior.controlType -eq "number")
Assert-Test "duration.prior_minutes has 'menit' unit" ($durationPrior.unit -eq "menit")
Assert-Test "duration.prior_minutes has min and max bounds" ($durationPrior.min -gt 0 -and $durationPrior.max -gt $durationPrior.min)

$showDoc = $settings | Where-Object { $_.key -eq "ticket.show_doctor_when_called" } | Select-Object -First 1
Assert-Test "ticket.show_doctor_when_called has boolean controlType" ($showDoc.controlType -eq "boolean")
Assert-Test "ticket.show_doctor_when_called has Indonesian label" ($showDoc.label -eq "Tampilkan Nama Dokter di Layar Antrean")

# ------------------------------------------------------------------------------
# TEST 4: Batch Update Operational Setting & Cache Invalidation
# ------------------------------------------------------------------------------
Write-Host "`n[TEST 4] Updating Operational Setting via Batch Endpoint..." -ForegroundColor Yellow

$originalDuration = $durationPrior.value
$testDuration = if ($originalDuration -eq 30) { 35 } else { 30 }

$updateBody = @{
    clinicSettings = @(
        @{
            key = "duration.prior_minutes"
            value = $testDuration
        }
    )
} | ConvertTo-Json

$updateRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/batch" -Method Put -Headers $auth.headers -Body $updateBody -ContentType "application/json"
Assert-Test "Batch update response indicates success" ($updateRes.success -eq $true)

# Verify updated value persisted
$recheck = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration" -Method Get -Headers $auth.headers
$updatedItem = $recheck.clinicSettings | Where-Object { $_.key -eq "duration.prior_minutes" } | Select-Object -First 1
Assert-Test "Updated setting persisted to database" ($updatedItem.value -eq $testDuration)

# Revert to original value for consistency
$revertBody = @{
    clinicSettings = @(
        @{
            key = "duration.prior_minutes"
            value = $originalDuration
        }
    )
} | ConvertTo-Json
$revertRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/batch" -Method Put -Headers $auth.headers -Body $revertBody -ContentType "application/json"
Assert-Test "Reverted setting back to original value" ($revertRes.success -eq $true)

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "Clinic Configuration Metadata Hardening & Zero Leak Suite"
