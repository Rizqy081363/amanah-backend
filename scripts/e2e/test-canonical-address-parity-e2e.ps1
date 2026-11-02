# test-canonical-address-parity-e2e.ps1
# E2E test verifying canonical hierarchical address fields in affiliations,
# patient references, database persistence, and PATCH updates.

$ErrorActionPreference = "Stop"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING: Canonical Address Parity & Reference E2E Test" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"
$userEmail = "anasabiyyufalah@students.amikom.ac.id"
$adminEmail = "admin@amanah.com"

# 1. Obtain JWTs
Push-Location "$PSScriptRoot\..\.."
$userOut = bun run db:jwt --email $userEmail --raw
$userToken = ($userOut | Where-Object { $_ -match "^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+" } | Select-Object -First 1).Trim()

$adminOut = bun run db:jwt --email $adminEmail --raw
$adminToken = ($adminOut | Where-Object { $_ -match "^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+" } | Select-Object -First 1).Trim()
Pop-Location

$userHeaders = @{
    "Authorization" = "Bearer $userToken"
    "Content-Type"  = "application/json"
}

$adminHeaders = @{
    "Authorization" = "Bearer $adminToken"
    "Content-Type"  = "application/json"
}

# Step 1: Check reference relationships have isSystem
Write-Host "`n--- Step 1: Verifying Reference Relationships Endpoint ---" -ForegroundColor Yellow
$refRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/reference/relationships" -Method GET
$selfRel = $refRes.data | Where-Object { $_.isSystem -eq $true }
if (-not $selfRel) {
    Write-Error "FAIL: No relationship with isSystem = true found in references!"
}
Write-Host " [PASS] Found system relationship dynamically: $($selfRel.label) (isSystem = true)" -ForegroundColor Green

# Step 2: Create affiliation with full structured address
Write-Host "`n--- Step 2: Creating Affiliation with Canonical Hierarchical Address ---" -ForegroundColor Yellow
$childRel = $refRes.data | Where-Object { $_.isSystem -ne $true } | Select-Object -First 1

$testNik = "327101" + (Get-Random -Minimum 1000000000 -Maximum 9999999999)
$createPayload = @{
    name             = "Budi Canonical Test"
    nik              = $testNik
    gender           = "male"
    birthPlace       = "Sleman"
    birthDate        = "2015-06-12"
    relationshipType = $childRel.value
    relationshipTypeId = $childRel.id
    line1            = "Jl. Kaliurang KM 9.3 No. 42 RT 03/RW 05"
    provinceName     = "DI Yogyakarta"
    provinceCode     = "34"
    regencyName      = "Kabupaten Sleman"
    regencyCode      = "3404"
    districtName     = "Ngaglik"
    districtCode     = "340407"
    villageName      = "Sardonoharjo"
    villageCode      = "3404072001"
} | ConvertTo-Json

$created = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/affiliations" -Method POST -Headers $userHeaders -Body $createPayload
$createdPatientId = $created.data.patientId
Write-Host " [PASS] Created test affiliation patientId: $createdPatientId" -ForegroundColor Green

# Step 3: Query booking-context and verify canonical regional fields are returned
Write-Host "`n--- Step 3: Verifying Affiliation Returns Structured Address Fields ---" -ForegroundColor Yellow
$serviceId = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -c "SELECT id FROM clinic_services LIMIT 1;").Trim()

$ctx = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/affiliations/booking-context?serviceId=$serviceId" -Method GET -Headers $userHeaders
$patientInCtx = $ctx.data.patients | Where-Object { $_.id -eq $createdPatientId }

if (-not $patientInCtx) {
    Write-Error "FAIL: Created patient not found in booking context!"
}

if (-not $patientInCtx.provinceName -or $patientInCtx.provinceName -ne "DI Yogyakarta") {
    Write-Error "FAIL: provinceName mismatch or null! Value: '$($patientInCtx.provinceName)'"
}
Write-Host " [PASS] booking-context returns provinceName: $($patientInCtx.provinceName)" -ForegroundColor Green

if (-not $patientInCtx.regencyName -or $patientInCtx.regencyName -ne "Kabupaten Sleman") {
    Write-Error "FAIL: regencyName mismatch or null! Value: '$($patientInCtx.regencyName)'"
}
Write-Host " [PASS] booking-context returns regencyName: $($patientInCtx.regencyName)" -ForegroundColor Green

if (-not $patientInCtx.line1 -or $patientInCtx.line1 -ne "Jl. Kaliurang KM 9.3 No. 42 RT 03/RW 05") {
    Write-Error "FAIL: line1 mismatch or null! Value: '$($patientInCtx.line1)'"
}
Write-Host " [PASS] booking-context returns line1: $($patientInCtx.line1)" -ForegroundColor Green

# Step 4: Admin updates address via PATCH /api/v1/patients/:id
Write-Host "`n--- Step 4: Admin Updates Address via PATCH /patients/:id ---" -ForegroundColor Yellow
$patchPayload = @{
    line1        = "Jl. Affandi No. 100"
    provinceName = "DI Yogyakarta"
    provinceCode = "34"
    regencyName  = "Kota Yogyakarta"
    regencyCode  = "3471"
    districtName = "Gondokusuman"
    districtCode = "347103"
    villageName  = "Kotabaru"
    villageCode  = "3471031001"
} | ConvertTo-Json

$patchRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/$createdPatientId" -Method PATCH -Headers $adminHeaders -Body $patchPayload
Write-Host " [PASS] Admin PATCH executed successfully" -ForegroundColor Green

# Step 5: Verify directly in PostgreSQL container
Write-Host "`n--- Step 5: Direct Verification in PostgreSQL Container ---" -ForegroundColor Yellow
$dbCheck = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -c "SELECT village_name, regency_name, full_address FROM patient_addresses WHERE patient_id = '$createdPatientId' LIMIT 1;"
Write-Host " Database row: $dbCheck"
if ($dbCheck -notmatch "Kotabaru" -or $dbCheck -notmatch "Kota Yogyakarta") {
    Write-Error "FAIL: Database did not reflect updated village or regency!"
}
Write-Host " [PASS] Database patient_addresses reflects updated canonical fields and full_address" -ForegroundColor Green

# Step 6: Teardown
Write-Host "`n--- Teardown: Cleaning Test Patient ---" -ForegroundColor Yellow
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM patient_profiles WHERE id = '$createdPatientId';" > $null
Write-Host " [PASS] Cleaned test fixture: $createdPatientId" -ForegroundColor Green

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " Canonical Address Parity E2E - ALL CHECKS PASSED!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
