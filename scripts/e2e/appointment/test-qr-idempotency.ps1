# ==============================================================================
# Amanah Healthcare - E2E Test: QR Check-In Idempotency & Continuous Timer
# Domain: Deterministic, Persistent QR generation & countdown across re-opens/refreshes
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
Write-Host " [SCENARIO] QR CHECK-IN PERSISTENCE, IDEMPOTENCY & CONTINUOUS COUNTDOWN" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Authenticate Actors
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Admin and Patient..." -ForegroundColor Yellow
$adminAuth = Login-Admin
Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

$patientAuth = Login-Patient
Assert-Test "Patient authenticated successfully" ($null -ne $patientAuth.token)

# ------------------------------------------------------------------------------
# STEP 2: Find or Create an Active BOOKED Appointment
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Finding or Creating an Active BOOKED Appointment..." -ForegroundColor Yellow
$apiUrl = Get-E2EApiBaseUrl

$bookedAptId = Run-DockerSql "SELECT id FROM appointments WHERE status = 'booked' ORDER BY created_at DESC LIMIT 1;"
$bookedAptId = $bookedAptId.Trim()

if (-not $bookedAptId -or $bookedAptId.Length -lt 10) {
    Write-Host " No booked appointment found, creating new appointment..." -ForegroundColor Cyan
    $clinics = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics" -Method Get -Headers $patientAuth.headers))
    $targetPoli = $clinics[0]
    $services = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$($targetPoli.id)/layanan" -Method Get -Headers $patientAuth.headers))
    $serviceId = $services[0].id
    $patientProfileId = $patientAuth.user.patientProfiles[0].id
    $targetDate = (Get-Date).ToString("yyyy-MM-dd")

    $bookPayload = @{
        patientId = $patientProfileId
        poliklinikId = $targetPoli.id
        layananId = $serviceId
        appointmentDate = $targetDate
        session = "PAGI"
        complaint = "QR Idempotency Test Verification"
        visitType = "Pemeriksaan Baru"
    } | ConvertTo-Json

    $bookedRes = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patientAuth.headers -Body $bookPayload -ContentType "application/json"
    $targetApt = Get-ResponseData $bookedRes
    $bookedAptId = $targetApt.id
}

Assert-Test "Target BOOKED Appointment ID identified" ($null -ne $bookedAptId -and $bookedAptId.Length -gt 10)
Write-Host " Target Appointment ID: $bookedAptId" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 3: First QR Generation Call
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Generating QR Code (1st Execution)..." -ForegroundColor Yellow
$res1Raw = Invoke-RestMethod -Uri "$apiUrl/appointments/$bookedAptId/check-in-qr" -Method Post -Headers $adminAuth.headers
$res1 = Get-ResponseData $res1Raw
if (-not $res1) { $res1 = $res1Raw }

Assert-Test "1st QR generation succeeded" ($null -ne $res1.token)
Assert-Test "1st manual code generated" ($null -ne $res1.manualCode -and $res1.manualCode.Length -ge 6)
Assert-Test "1st expiresAt provided" ($null -ne $res1.expiresAt)
Assert-Test "1st remainingSeconds is positive" ($res1.remainingSeconds -gt 0)

Write-Host " 1st Token: $($res1.token)" -ForegroundColor DarkGray
Write-Host " 1st Manual Code: $($res1.manualCode)" -ForegroundColor DarkGray
Write-Host " 1st Expires At: $($res1.expiresAt)" -ForegroundColor DarkGray
Write-Host " 1st Remaining Seconds: $($res1.remainingSeconds)" -ForegroundColor DarkGray

# ------------------------------------------------------------------------------
# STEP 4: Elapse Time Simulation (Wait 3 Seconds)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Waiting 3 seconds to test continuous countdown persistence..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# ------------------------------------------------------------------------------
# STEP 5: Second QR Generation Call (Simulating Modal Re-open or Page Refresh)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Generating QR Code (2nd Execution - Re-open / Refresh)..." -ForegroundColor Yellow
$res2Raw = Invoke-RestMethod -Uri "$apiUrl/appointments/$bookedAptId/check-in-qr" -Method Post -Headers $adminAuth.headers
$res2 = Get-ResponseData $res2Raw
if (-not $res2) { $res2 = $res2Raw }

Assert-Test "2nd QR call succeeded" ($null -ne $res2.token)

# Verify Idempotency & Determinism
Assert-Test "Idempotent: Token is identical across calls" ($res1.token -eq $res2.token)
Assert-Test "Idempotent: Manual Code is identical across calls" ($res1.manualCode -eq $res2.manualCode)
Assert-Test "Deterministic: Database expiresAt deadline is identical" ($res1.expiresAt -eq $res2.expiresAt)

# Verify Continuous Countdown (NOT reset to 23:59:59)
$timerDecreased = $res2.remainingSeconds -lt $res1.remainingSeconds
$timeDiff = $res1.remainingSeconds - $res2.remainingSeconds
Write-Host " 2nd Remaining Seconds: $($res2.remainingSeconds) (Decreased by $timeDiff seconds)" -ForegroundColor Cyan
Assert-Test "Persistent: Countdown decreased continuously without resetting" ($timerDecreased -and $timeDiff -ge 2 -and $timeDiff -le 6)

# ------------------------------------------------------------------------------
# STEP 6: Direct Database Invariant Verification via PostgreSQL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Verifying Database Invariants in PostgreSQL..." -ForegroundColor Yellow
$dbRecordCount = Run-DockerSql "SELECT COUNT(*) FROM appointment_check_ins WHERE appointment_id = '$bookedAptId' AND is_used = false;"
Assert-Test "Database contains exactly 1 active unexpired check-in row" ($dbRecordCount.Trim() -eq "1")

$dbToken = Run-DockerSql "SELECT token FROM appointment_check_ins WHERE appointment_id = '$bookedAptId' AND is_used = false ORDER BY created_at DESC LIMIT 1;"
Assert-Test "Database token matches API response exactly" ($dbToken.Trim() -eq $res1.token)

$dbCode = Run-DockerSql "SELECT manual_code FROM appointment_check_ins WHERE appointment_id = '$bookedAptId' AND is_used = false ORDER BY created_at DESC LIMIT 1;"
Assert-Test "Database manual_code matches API response exactly" ($dbCode.Trim() -eq $res1.manualCode)

# ------------------------------------------------------------------------------
# STEP 7: Backend Contract Verification (allowedActions SSOT)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] Verifying Backend Contract allowedActions..." -ForegroundColor Yellow
$aptDetailRaw = Invoke-RestMethod -Uri "$apiUrl/appointments/$bookedAptId" -Method Get -Headers $adminAuth.headers
$aptDetail = Get-ResponseData $aptDetailRaw
if (-not $aptDetail) { $aptDetail = $aptDetailRaw }

Assert-Test "Appointment allowedActions includes CHECK_IN" ($aptDetail.allowedActions -contains "CHECK_IN")

Write-Host "`n[QR IDEMPOTENCY VERIFIED] All persistence and timer invariants passed!" -ForegroundColor Green
Print-TestSummary "QR Check-In Idempotency Suite"
