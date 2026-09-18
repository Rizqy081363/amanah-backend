# Test Optimistic Concurrency Control (OCC) & Lost Update Prevention Suite (Fase 7)
# Validates entity versioning, ETag headers, If-Match preconditions, 412 Precondition Failed,
# 409 Conflict on race collision, and last-write-wins fallback (API-146..148, ARC-095, OPS-138)

param(
    [string]$BaseUrl = $env:E2E_BASE_URL
)

. "$PSScriptRoot\common.ps1"
$BaseUrl = if ([string]::IsNullOrWhiteSpace($BaseUrl)) { Get-E2EBaseUrl } else { $BaseUrl.TrimEnd('/') }

$ErrorActionPreference = "Continue"
$passed = 0
$failed = 0

function Assert-Test([string]$description, [bool]$condition) {
    if ($condition) {
        Write-Host " [PASS] $description" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $description" -ForegroundColor Red
        $global:failed++
    }
}

function Get-HeaderVal($response, [string]$headerName) {
    if ($null -eq $response -or $null -eq $response.Headers) { return "" }
    $val = $response.Headers[$headerName]
    if ($null -eq $val) { return "" }
    if ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) {
        foreach ($item in $val) {
            return [string]$item
        }
    }
    return [string]$val
}

function Get-ResponseText($response) {
    if ($null -eq $response -or $null -eq $response.Content) { return "" }
    if ($response.Content -is [byte[]]) {
        return [System.Text.Encoding]::UTF8.GetString($response.Content)
    }
    return [string]$response.Content
}

Write-Host "=== Phase 7: Optimistic Concurrency Control & Lost Update Prevention ===" -ForegroundColor Cyan

# 0. Setup: Authenticate Admin, Staff, and Patient
Write-Host "`n[STEP 0] Authenticating Admin, Staff & Patient..." -ForegroundColor Yellow
$loginAdminRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body '{"email":"admin@amanah.com","password":"secret123"}' `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

$adminToken = ($loginAdminRes.Content | ConvertFrom-Json).token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
Assert-Test "Admin authenticated successfully" ($loginAdminRes.StatusCode -eq 200 -and $adminToken)

$loginStaffRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body '{"email":"dokter@amanah.com","password":"secret123"}' `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

$staffToken = ($loginStaffRes.Content | ConvertFrom-Json).token
$staffHeaders = @{ "Authorization" = "Bearer $staffToken" }
Assert-Test "Doctor/Staff authenticated successfully" ($loginStaffRes.StatusCode -eq 200 -and $staffToken)

$loginPatientRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body '{"email":"pasien@amanah.com","password":"secret123"}' `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

$patientToken = ($loginPatientRes.Content | ConvertFrom-Json).token
$patientHeaders = @{ "Authorization" = "Bearer $patientToken" }
Assert-Test "Patient authenticated successfully" ($loginPatientRes.StatusCode -eq 200 -and $patientToken)

# 1. Setup Test Appointment
Write-Host "`n[STEP 1] Creating Test Appointment for OCC..." -ForegroundColor Yellow
$clinicsRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/clinics" -Method Get -Headers $adminHeaders -SkipHttpErrorCheck
$clinicsJson = $clinicsRes.Content | ConvertFrom-Json
$poliklinikId = $clinicsJson[0].id

$servicesRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/clinics/$poliklinikId/layanan" -Method Get -Headers $adminHeaders -SkipHttpErrorCheck
$servicesJson = $servicesRes.Content | ConvertFrom-Json
$layananId = $servicesJson[0].id

$randomOffset = Get-Random -Minimum 10 -Maximum 9000
$targetDate = (Get-Date).AddDays($randomOffset).ToString("yyyy-MM-dd")

$aptPayload = @{
    poliklinikId = $poliklinikId
    layananId = $layananId
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan OCC Test Concurrency"
} | ConvertTo-Json

$createAptRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments" `
    -Method Post `
    -Headers $patientHeaders `
    -Body $aptPayload `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

Assert-Test "Appointment created successfully" ($createAptRes.StatusCode -eq 201)
$aptData = $createAptRes.Content | ConvertFrom-Json
$aptId = $aptData.id
$patientId = $aptData.patientId

# ------------------------------------------------------------------------------
# 2. Entity Retrieval Exposes Version & ETag Header (API-146)
# ------------------------------------------------------------------------------
Write-Host "`n--- 1. Entity Retrieval: Version & ETag Exposure (API-146) ---" -ForegroundColor Yellow

$getAptRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/$aptId" `
    -Method Get `
    -Headers $adminHeaders `
    -SkipHttpErrorCheck

Assert-Test "GET appointment returns HTTP 200 OK" ($getAptRes.StatusCode -eq 200)
$aptJson = $getAptRes.Content | ConvertFrom-Json
$initialVersion = $aptJson.version
$initialEtag = Get-HeaderVal $getAptRes "ETag"

Assert-Test "Appointment entity exposes version property in payload (API-146)" (![string]::IsNullOrEmpty($initialVersion))
Assert-Test "Appointment response includes ETag header (API-146)" (![string]::IsNullOrEmpty($initialEtag))
Assert-Test "ETag header reflects version value" ($initialEtag.Contains($initialVersion))

# ------------------------------------------------------------------------------
# 3. Conditional Update With Matching Precondition (API-147)
# ------------------------------------------------------------------------------
Write-Host "`n--- 2. Conditional Update: Matching If-Match Precondition (API-147) ---" -ForegroundColor Yellow

$checkInHeaders = @{
    "Authorization" = "Bearer $patientToken"
    "If-Match" = $initialEtag
}

$checkInRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/$aptId/check-in" `
    -Method Patch `
    -Headers $checkInHeaders `
    -SkipHttpErrorCheck

Assert-Test "Check-in with matching If-Match returns HTTP 200 OK" ($checkInRes.StatusCode -eq 200)
$checkInJson = $checkInRes.Content | ConvertFrom-Json
$v2Version = $checkInJson.version
$v2Etag = Get-HeaderVal $checkInRes "ETag"

Assert-Test "Appointment status transitioned to MENUNGGU" ($checkInJson.status -eq "MENUNGGU")
Assert-Test "Version was updated after mutation" ($v2Version -ne $initialVersion)
Assert-Test "New ETag header matches updated version" ($v2Etag.Contains($v2Version))

# ------------------------------------------------------------------------------
# 4. Conditional Update Rejection on Stale Precondition (API-054, ARC-095)
# ------------------------------------------------------------------------------
Write-Host "`n--- 3. Precondition Failure: Stale If-Match Rejection (API-054, ARC-095) ---" -ForegroundColor Yellow

# Attempt to update using the stale initial ETag (which was superseded by $v2Version)
$staleHeaders = @{
    "Authorization" = "Bearer $staffToken"
    "If-Match" = $initialEtag
}

$staleCallRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/$aptId/call" `
    -Method Patch `
    -Headers $staleHeaders `
    -SkipHttpErrorCheck

Assert-Test "Update with stale If-Match returns HTTP 412 Precondition Failed" ($staleCallRes.StatusCode -eq 412)
$contentType = Get-HeaderVal $staleCallRes "Content-Type"
Assert-Test "Response Content-Type is application/problem+json" ($contentType.StartsWith("application/problem+json"))

$staleProblemText = Get-ResponseText $staleCallRes
$staleProblem = $staleProblemText | ConvertFrom-Json

Assert-Test "RFC 7807 problem details contains code PRECONDITION_FAILED" ($staleProblem.code -eq "PRECONDITION_FAILED")
Assert-Test "Problem details contains currentVersion" (![string]::IsNullOrEmpty($staleProblem.currentVersion))
Assert-Test "Problem details contains expectedVersion" (![string]::IsNullOrEmpty($staleProblem.expectedVersion))

# ------------------------------------------------------------------------------
# 5. Weak ETag and Wildcard Matching (RFC 9110)
# ------------------------------------------------------------------------------
Write-Host "`n--- 4. Weak ETag (W/...) Handling ---" -ForegroundColor Yellow

$weakHeaders = @{
    "Authorization" = "Bearer $staffToken"
    "If-Match" = "W/`"$v2Version`""
}

$weakCallRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/$aptId/call" `
    -Method Patch `
    -Headers $weakHeaders `
    -SkipHttpErrorCheck

Assert-Test "Update with weak ETag W/... returns HTTP 200 OK" ($weakCallRes.StatusCode -eq 200)
$callJson = $weakCallRes.Content | ConvertFrom-Json
$v3Version = $callJson.version
Assert-Test "Appointment status transitioned to SEDANG_DIPERIKSA" ($callJson.status -eq "SEDANG_DIPERIKSA")

# ------------------------------------------------------------------------------
# 6. Concurrent Collision / Race Condition Detection (API-053, OPS-138)
# ------------------------------------------------------------------------------
Write-Host "`n--- 5. Concurrent Collision / Lost Update Prevention (API-053, ARC-095) ---" -ForegroundColor Yellow

# Both User A and User B observe version v3
$userAHeaders = @{
    "Authorization" = "Bearer $staffToken"
    "If-Match" = "`"$v3Version`""
}
$userBHeaders = @{
    "Authorization" = "Bearer $staffToken"
    "If-Match" = "`"$v3Version`""
}

# User A executes first and completes the appointment
$userARes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/$aptId/complete" `
    -Method Patch `
    -Headers $userAHeaders `
    -SkipHttpErrorCheck

Assert-Test "User A concurrent execution succeeds with 200 OK" ($userARes.StatusCode -eq 200)

# User B arrives with same stale v3 version (lost update attempt)
$userBRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/appointments/$aptId/cancel" `
    -Method Patch `
    -Headers $userBHeaders `
    -Body '{"reason":"Batalkan pemeriksaan"}' `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

Assert-Test "User B concurrent update is rejected with 412 Precondition Failed" ($userBRes.StatusCode -eq 412)
$userBProblem = (Get-ResponseText $userBRes) | ConvertFrom-Json
Assert-Test "User B receives PRECONDITION_FAILED or CONCURRENT_MODIFICATION_CONFLICT" ($userBProblem.code -eq "PRECONDITION_FAILED" -or $userBProblem.code -eq "CONCURRENT_MODIFICATION_CONFLICT")

# ------------------------------------------------------------------------------
# 7. Medical Records OCC Verification
# ------------------------------------------------------------------------------
Write-Host "`n--- 6. Medical Records OCC Verification ---" -ForegroundColor Yellow

# Create a medical record
$medRecordPayload = @{
    patientId = $patientId
    kunjunganId = $aptId
    encounterDate = (Get-Date).ToString("yyyy-MM-dd")
    subjective = "Keluhan pusing dan mual"
    diagnosis = "Dispepsia"
    diagnosisIcd10Code = "K30"
} | ConvertTo-Json

$createMedRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/medical-records" `
    -Method Post `
    -Headers $staffHeaders `
    -Body $medRecordPayload `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

Assert-Test "Medical record created successfully" ($createMedRes.StatusCode -eq 201)
$medRecord = $createMedRes.Content | ConvertFrom-Json
$medId = $medRecord.id

# Retrieve medical record
$getMedRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/medical-records/$medId" `
    -Method Get `
    -Headers $staffHeaders `
    -SkipHttpErrorCheck

Assert-Test "GET medical record returns HTTP 200" ($getMedRes.StatusCode -eq 200)
$medRecordJson = $getMedRes.Content | ConvertFrom-Json
$medVersion1 = $medRecordJson.version
$medEtag1 = Get-HeaderVal $getMedRes "ETag"
Assert-Test "Medical record exposes version" (![string]::IsNullOrEmpty($medVersion1))
Assert-Test "Medical record includes ETag header" (![string]::IsNullOrEmpty($medEtag1))

# Update medical record with valid If-Match
$updateMedHeaders = @{
    "Authorization" = "Bearer $staffToken"
    "If-Match" = $medEtag1
}
$updateMedPayload = @{
    diagnosis = "Dispepsia Fungsional"
    diagnosisIcd10Code = "K30"
    tindakan = "Pemberian antasida"
} | ConvertTo-Json

$updateMedRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/medical-records/$medId/diagnosis" `
    -Method Patch `
    -Headers $updateMedHeaders `
    -Body $updateMedPayload `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

Assert-Test "Update diagnosis with matching If-Match returns HTTP 200" ($updateMedRes.StatusCode -eq 200)

# Stale medical record update
$staleMedRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/medical-records/$medId/diagnosis" `
    -Method Patch `
    -Headers $updateMedHeaders `
    -Body $updateMedPayload `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

Assert-Test "Stale diagnosis update returns HTTP 412 Precondition Failed" ($staleMedRes.StatusCode -eq 412)

# ------------------------------------------------------------------------------
# 8. Last-Write-Wins Fallback When Precondition Omitted (API-147)
# ------------------------------------------------------------------------------
Write-Host "`n--- 7. Last-Write-Wins Fallback When Precondition Omitted (API-147) ---" -ForegroundColor Yellow

$unconditionalRes = Invoke-WebRequest -Uri "$BaseUrl/api/v1/medical-records/$medId/diagnosis" `
    -Method Patch `
    -Headers $staffHeaders `
    -Body '{"diagnosis":"Dispepsia Kronis"}' `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

Assert-Test "Update without If-Match operates as last-write-wins returning HTTP 200" ($unconditionalRes.StatusCode -eq 200)
$uncondJson = $unconditionalRes.Content | ConvertFrom-Json
Assert-Test "Last-write-wins update returns new version and ETag" (![string]::IsNullOrEmpty($uncondJson.version))

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "OCC & Lost Update Prevention Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
exit 0
