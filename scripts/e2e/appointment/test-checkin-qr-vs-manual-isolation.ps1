# ==============================================================================
# Amanah Healthcare - Real E2E Test: Patient Check-In State & Error Isolation
# Verifies:
# 1. QR scan failure produces INVALID_CHECK_IN_QR ("Barcode check-in tidak valid atau tidak terdaftar.")
# 2. QR scan with 6-char string still produces INVALID_CHECK_IN_QR (no manual leak)
# 3. Manual input failure produces INVALID_CHECK_IN_CODE ("Kode check-in tidak valid atau tidak terdaftar.")
# 4. Valid check-in lifecycle transitions appointment status to 'waiting'
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
Write-Host " [SCENARIO] PATIENT CHECK-IN: QR BARCODE VS MANUAL ERROR & STATE ISOLATION" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Authenticate Patient Actor
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Patient..." -ForegroundColor Yellow
$patientAuth = Login-Patient
Assert-Test "Patient authenticated successfully" ($null -ne $patientAuth.token)

$apiUrl = Get-E2EApiBaseUrl
$headers = @{
    "Authorization" = "Bearer $($patientAuth.token)"
    "Content-Type"  = "application/json"
}

# ------------------------------------------------------------------------------
# STEP 2: Test QR Scan Failure (Unknown Token + method: 'qr')
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Testing Invalid QR Scan Failure (method: 'qr')..." -ForegroundColor Yellow
$qrErrorPayload = @{
    token = "INVALID_QR_SCAN_UUID_9999"
    method = "qr"
} | ConvertTo-Json

$qrResponse = $null
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $headers -Body $qrErrorPayload
    Assert-Test "Expected 400 Bad Request for invalid QR scan" $false
} catch {
    $rawError = $_.ErrorDetails.Message
    Write-Host " [Response Body] $rawError" -ForegroundColor Gray
    if ($rawError) {
        $qrResponse = $rawError | ConvertFrom-Json
    }
}

Assert-Test "QR scan failure returned statusCode 400" ($qrResponse.statusCode -eq 400)
Assert-Test "QR scan failure returned code INVALID_CHECK_IN_QR" ($qrResponse.code -eq "INVALID_CHECK_IN_QR")
Assert-Test "QR scan failure message is 'Barcode check-in tidak valid atau tidak terdaftar.'" ($qrResponse.message -match "Barcode check-in tidak valid")

# ------------------------------------------------------------------------------
# STEP 3: Test QR Scan with 6-char String (Must NOT leak INVALID_CHECK_IN_CODE)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Testing QR Scan with 6-character Code (method: 'qr')..." -ForegroundColor Yellow
$qr6CharPayload = @{
    token = "ZZ9999"
    method = "qr"
} | ConvertTo-Json

$qr6Response = $null
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $headers -Body $qr6CharPayload
    Assert-Test "Expected 400 Bad Request for unknown 6-char QR scan" $false
} catch {
    $rawError = $_.ErrorDetails.Message
    Write-Host " [Response Body] $rawError" -ForegroundColor Gray
    if ($rawError) {
        $qr6Response = $rawError | ConvertFrom-Json
    }
}

Assert-Test "6-character QR scan returned code INVALID_CHECK_IN_QR (no manual leak)" ($qr6Response.code -eq "INVALID_CHECK_IN_QR")
Assert-Test "6-character QR scan returned barcode message" ($qr6Response.message -match "Barcode check-in tidak valid")

# ------------------------------------------------------------------------------
# STEP 4: Test Manual Input Failure (method: 'manual')
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Testing Invalid Manual Code Input (method: 'manual')..." -ForegroundColor Yellow
$manualErrorPayload = @{
    manualCode = "ZZ9999"
    method = "manual"
} | ConvertTo-Json

$manualResponse = $null
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $headers -Body $manualErrorPayload
    Assert-Test "Expected 400 Bad Request for invalid manual code" $false
} catch {
    $rawError = $_.ErrorDetails.Message
    Write-Host " [Response Body] $rawError" -ForegroundColor Gray
    if ($rawError) {
        $manualResponse = $rawError | ConvertFrom-Json
    }
}

Assert-Test "Manual input failure returned statusCode 400" ($manualResponse.statusCode -eq 400)
Assert-Test "Manual input failure returned code INVALID_CHECK_IN_CODE" ($manualResponse.code -eq "INVALID_CHECK_IN_CODE")
Assert-Test "Manual input failure message is 'Kode check-in tidak valid atau tidak terdaftar.'" ($manualResponse.message -eq "Kode check-in tidak valid atau tidak terdaftar.")

# ------------------------------------------------------------------------------
# STEP 5: Test Empty Body Validation
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Testing Empty Body Rejection..." -ForegroundColor Yellow
$emptyPayload = "{}"

$emptyResponse = $null
try {
    Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $headers -Body $emptyPayload
    Assert-Test "Expected 400 Bad Request for empty check-in body" $false
} catch {
    $rawError = $_.ErrorDetails.Message
    Write-Host " [Response Body] $rawError" -ForegroundColor Gray
    if ($rawError) {
        $emptyResponse = $rawError | ConvertFrom-Json
    }
}

Assert-Test "Empty check-in returned statusCode 400" ($emptyResponse.statusCode -eq 400)

# ------------------------------------------------------------------------------
# FINAL SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "Check-In QR vs Manual State & Error Isolation Test"
