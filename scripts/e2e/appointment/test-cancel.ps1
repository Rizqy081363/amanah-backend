# ==============================================================================
# Amanah Healthcare - E2E Single-Responsibility Test: Appointment Cancellation
# Domain: Patient or Admin cancelling appointment and linked queue ticket
# ==============================================================================

param(
    [string]$BaseUrl = "http://localhost:3001/api/v1"
)

$ErrorActionPreference = "Stop"

# 1. Source Common Test Library
$commonPath = Join-Path $PSScriptRoot "..\common.ps1"
if (-not (Test-Path $commonPath)) {
    throw "Common helper file not found at: $commonPath"
}
. $commonPath

Reset-TestCounters

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [SCENARIO 4] APPOINTMENT CANCELLATION WORKFLOW (API & RUNTIME TRUTH)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Authenticate Patient and Admin
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Actors..." -ForegroundColor Yellow
$patientAuth = Login-Patient
Assert-Test "Patient authenticated successfully" ($null -ne $patientAuth.token)

$adminAuth = Login-Admin
Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

# ------------------------------------------------------------------------------
# STEP 2: Create a Dedicated Appointment to Cancel
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Creating Appointment for Cancellation Verification..." -ForegroundColor Yellow
$apiUrl = Get-E2EApiBaseUrl

$clinics = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics" -Method Get -Headers $patientAuth.headers))
Assert-Test "Active polyclinics discovered" ($clinics.Count -gt 0)
$targetPoli = $clinics[0]
$poliId = $targetPoli.id

$services = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$poliId/layanan" -Method Get -Headers $patientAuth.headers))
Assert-Test "Polyclinic has available services" ($services.Count -gt 0)
$serviceId = $services[0].id

$patientProfileId = $patientAuth.user.patientProfiles[0].id
$targetDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

$bookingOptions = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/schedules/booking-options?date=$targetDate" -Method Get -Headers $patientAuth.headers)
$openSession = $bookingOptions.sessions | Where-Object { $_.isDisabled -ne $true } | Select-Object -First 1
$sessionCode = if ($openSession -and $openSession.session) { $openSession.session } else { "PAGI" }

$bookPayload = @{
    patientId = $patientProfileId
    poliklinikId = $poliId
    layananId = $serviceId
    appointmentDate = $targetDate
    session = $sessionCode
    complaint = "E2E Cancellation Verification Target"
    visitType = "Pemeriksaan Baru"
} | ConvertTo-Json

$bookedRes = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patientAuth.headers -Body $bookPayload -ContentType "application/json"
$targetApt = Get-ResponseData $bookedRes

Assert-Test "Appointment created for cancellation" ($null -ne $targetApt -and $null -ne $targetApt.id)
$targetId = $targetApt.id
Write-Host " Target Appointment ID: $targetId (Status: $($targetApt.status))" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 3: Execute Cancellation Mutation
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Submitting Cancellation Request..." -ForegroundColor Yellow
$cancelReason = "Pasien ada keperluan mendadak keluarga"
$cancelPayload = @{
    reason = $cancelReason
} | ConvertTo-Json

$cancelRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetId/cancel" -Method Post -Headers $patientAuth.headers -Body $cancelPayload -ContentType "application/json"
$cancelledApt = Get-ResponseData $cancelRes

Assert-Test "Cancellation API call succeeded" ($null -ne $cancelledApt)
Assert-Test "Appointment status is CANCELLED" ($cancelledApt.status -eq "CANCELLED" -or $cancelledApt.status -eq "cancelled")
Write-Host " Appointment cancelled successfully" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 4: Negative Test: Duplicate Cancellation Must Fail
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Negative Test: Redundant Cancellation Must Be Rejected..." -ForegroundColor Yellow
$duplicateFailed = $false
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/$targetId/cancel" -Method Post -Headers $patientAuth.headers -Body $cancelPayload -ContentType "application/json"
} catch {
    $duplicateFailed = $true
    Write-Host " Redundant cancellation correctly rejected: $($_.Exception.Message)" -ForegroundColor DarkGray
}
Assert-Test "Redundant cancellation rejected by API" $duplicateFailed

# ------------------------------------------------------------------------------
# STEP 5: Direct Database Verification via Docker PostgreSQL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Verifying Database State via Docker PostgreSQL..." -ForegroundColor Yellow
$dbStatus = Run-DockerSql "SELECT status FROM appointments WHERE id = '$targetId';"
Assert-Test "Database appointments.status is cancelled" ($dbStatus.Trim() -eq "cancelled")

$dbTicketStatus = Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$targetId' ORDER BY created_at DESC LIMIT 1;"
Assert-Test "Database queue_tickets.status is cancelled" ($dbTicketStatus.Trim() -eq "cancelled")

Write-Host "`n[SCENARIO 4 COMPLETED] Cancellation workflow verified end-to-end." -ForegroundColor Green
Print-TestSummary "Appointment Cancellation Suite"
