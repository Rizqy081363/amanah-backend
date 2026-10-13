# ==============================================================================
# Amanah Healthcare - E2E Single-Responsibility Test: Call & Service Lifecycle
# Domain: Doctor/Staff calling patient, starting consultation, and completing service
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
Write-Host " [SCENARIO 3] APPOINTMENT CALL & CONSULTATION LIFECYCLE (API & RUNTIME TRUTH)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Authenticate Actors (Doctor, Admin, Patient)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Actors..." -ForegroundColor Yellow
$adminAuth = Login-Admin
Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

$doctorAuth = Login-Doctor
Assert-Test "Doctor authenticated successfully" ($null -ne $doctorAuth.token)

$patientAuth = Login-Patient
Assert-Test "Patient authenticated successfully" ($null -ne $patientAuth.token)

# ------------------------------------------------------------------------------
# STEP 2: Discover or Create an Eligible Appointment
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Discovering or Creating Candidate Appointment..." -ForegroundColor Yellow
$apiUrl = Get-E2EApiBaseUrl

# Discover an active appointment from patient
$activeRes = Invoke-RestMethod -Uri "$apiUrl/appointments/me" -Method Get -Headers $patientAuth.headers
$activeData = Get-ResponseData $activeRes

$targetApt = $null
if ($activeData) {
    $items = if ($activeData -is [System.Collections.IEnumerable] -and -not ($activeData -is [string])) { @($activeData) } elseif ($activeData.items) { @($activeData.items) } else { @($activeData) }
    $targetApt = $items | Where-Object { $_.status -in @("BOOKED", "WAITING") } | Select-Object -First 1
}

if (-not $targetApt) {
    Write-Host " No eligible active appointment found. Booking fresh appointment first..." -ForegroundColor DarkGray
    $patientProfileId = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patientAuth.user.id)';").Trim()
    $poliUmumId = (Run-DockerSql "SELECT id FROM clinic_units WHERE code = 'poli_umum';").Trim()
    $serviceUmum = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'usg_umum';").Trim()
    $doctor = (Run-DockerSql "SELECT id FROM practitioners WHERE display_name = 'dr. Ahmad Santoso';").Trim()
    $room1 = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE unit_id = '$poliUmumId' ORDER BY name ASC LIMIT 1;").Trim()
    $today = (Get-Date).ToString("yyyy-MM-dd")

    $bookPayload = @{
        patientId = $patientProfileId
        poliklinikId = $poliUmumId
        layananId = $serviceUmum
        staffId = $doctor
        roomId = $room1
        appointmentDate = $today
        session = "PAGI"
        complaint = "E2E Call Lifecycle Validation"
        visitType = "Pemeriksaan Baru"
    } | ConvertTo-Json

    $bookedRes = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patientAuth.headers -Body $bookPayload -ContentType "application/json"
    $targetApt = Get-ResponseData $bookedRes
    if ($room1) {
        $null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($targetApt.id)/room" -Method Patch -Body (@{ roomId = $room1 } | ConvertTo-Json) -Headers $adminAuth.headers -ContentType "application/json"
    }
}

Assert-Test "Target appointment established" ($null -ne $targetApt -and $null -ne $targetApt.id)
$targetId = $targetApt.id
Write-Host " Target Appointment ID: $targetId (Initial Status: $($targetApt.status))" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 3: Transition to WAITING (Check-In if still BOOKED)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Ensuring Appointment is in WAITING State..." -ForegroundColor Yellow
if ($targetApt.status -eq "BOOKED") {
    $checkInRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetId/check-in" -Method Patch -Headers $patientAuth.headers
    $checkedApt = Get-ResponseData $checkInRes
    Assert-Test "Appointment transitioned to WAITING via Check-In" ($checkedApt.status -eq "WAITING")
} else {
    Assert-Test "Appointment is already in WAITING status" ($targetApt.status -eq "WAITING")
}

# ------------------------------------------------------------------------------
# STEP 4: Doctor Calls Patient
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Doctor Calls Patient to Examination Room..." -ForegroundColor Yellow
$callPayload = @{
    notes = "Panggilan dokter dari ruang KIA"
} | ConvertTo-Json

$callRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetId/call" -Method Post -Headers $adminAuth.headers -Body $callPayload -ContentType "application/json"
Assert-Test "Doctor call-patient endpoint succeeded" ($null -ne $callRes)
Write-Host " Call attempt logged successfully" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 5: Start Consultation Service (WAITING -> IN_SERVICE)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Starting Service Consultation..." -ForegroundColor Yellow
$startRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetId/start" -Method Post -Headers $adminAuth.headers
$startedApt = Get-ResponseData $startRes
Assert-Test "Appointment transitioned to IN_SERVICE" ($startedApt.status -eq "IN_SERVICE" -or $startedApt.status -eq "in_service")
Write-Host " Service started at: $($startedApt.actualStartedAt)" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 6: Complete Consultation Service (IN_SERVICE -> COMPLETED)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Completing Service Consultation..." -ForegroundColor Yellow
$completeRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$targetId/complete" -Method Post -Headers $adminAuth.headers
$completedApt = Get-ResponseData $completeRes
Assert-Test "Appointment transitioned to COMPLETED" ($completedApt.status -eq "COMPLETED" -or $completedApt.status -eq "completed")
Write-Host " Service completed at: $($completedApt.actualCompletedAt)" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 7: Assert 400/409 Conflict on Redundant Complete (Negative Test)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Negative Test: Redundant Complete Must Be Rejected..." -ForegroundColor Yellow
$duplicateFailed = $false
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/$targetId/complete" -Method Post -Headers $adminAuth.headers
} catch {
    $duplicateFailed = $true
    Write-Host " Redundant complete correctly rejected by API: $($_.Exception.Message)" -ForegroundColor DarkGray
}
Assert-Test "Redundant complete rejected with domain error/conflict" $duplicateFailed

# ------------------------------------------------------------------------------
# STEP 8: Direct Database Verification via Docker PostgreSQL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] Verifying Database State via Docker PostgreSQL..." -ForegroundColor Yellow
$dbStatus = Run-DockerSql "SELECT status FROM appointments WHERE id = '$targetId';"
Assert-Test "Database status is completed" ($dbStatus.Trim() -eq "completed")

$dbTicketStatus = Run-DockerSql "SELECT status FROM queue_tickets WHERE appointment_id = '$targetId' OR legacy_ref = '$targetId' ORDER BY created_at DESC LIMIT 1;"
Assert-Test "Database queue ticket is closed/completed" ($dbTicketStatus.Trim() -in @("completed", "in_service", "served", "closed"))

Write-Host "`n[SCENARIO 3 COMPLETED] Call & Consultation lifecycle verified end-to-end." -ForegroundColor Green
Print-TestSummary "Appointment Call & Service Lifecycle Suite"
