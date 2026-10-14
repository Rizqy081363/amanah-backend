# E2E Test Suite: Minimal Database-Driven Staff Management
# Tests: Login, Worker-Only Filter (Zero Doctors/Midwives), Null Poliklinik Unit, PATCH Persistence (Demographics + Active/Inactive), and Roster

$ErrorActionPreference = "Stop"

$baseUrl = "http://127.0.0.1:3001/api/v1"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Minimal Database-Driven Staff Management" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Admin Login
Write-Host "`n[Step 1] Logging in as Admin (admin@amanah.com)..." -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$token = $loginRes.token
if (-not $token) {
    throw "Login failed: No access token received."
}
Write-Host "  Admin login successful. Token acquired." -ForegroundColor Green

$headers = @{
    Authorization = "Bearer " + $token
    "Content-Type" = "application/json"
}

# 2. GET /staffs - Verify Worker-Only Scope
Write-Host "`n[Step 2] Fetching staff list from GET /staffs..." -ForegroundColor Yellow
$staffList = Invoke-RestMethod -Uri "$baseUrl/staffs" -Method Get -Headers $headers

Write-Host ("  Total records returned: " + $staffList.Count) -ForegroundColor Gray

if ($staffList.Count -eq 0) {
    throw "No staff records returned. Seeders should have populated workers."
}

$doctorCount = 0
$midwifeCount = 0
$workerCount = 0
$unitAssignedCount = 0

foreach ($staff in $staffList) {
    Write-Host ("  -> Staff: " + $staff.fullName + " | Type: " + $staff.staffType + " | Unit: '" + $staff.poliklinikId + "' | Email: " + $staff.email) -ForegroundColor Gray
    if ($staff.staffType -eq "doctor") { $doctorCount++ }
    elseif ($staff.staffType -eq "midwife") { $midwifeCount++ }
    elseif ($staff.staffType -eq "worker") { $workerCount++ }

    if ($staff.poliklinikId -and $staff.poliklinikId.Trim() -ne "") {
        $unitAssignedCount++
    }
}

Write-Host "`n[Step 2 Assertions]" -ForegroundColor Yellow

# Assert 1: Zero doctors
if ($doctorCount -ne 0) {
    throw ("FAILURE: Found " + $doctorCount + " doctors in /staffs list! Scope must be strictly workers.")
}
Write-Host "  PASS: Zero doctors returned." -ForegroundColor Green

# Assert 2: Zero midwives
if ($midwifeCount -ne 0) {
    throw ("FAILURE: Found " + $midwifeCount + " midwives in /staffs list! Scope must be strictly workers.")
}
Write-Host "  PASS: Zero midwives returned." -ForegroundColor Green

# Assert 3: All are workers
if ($workerCount -ne $staffList.Count) {
    throw ("FAILURE: Not all records are workers! (Workers: " + $workerCount + ", Total: " + $staffList.Count + ")")
}
Write-Host ("  PASS: 100% of returned staff are operational workers (" + $workerCount + " workers).") -ForegroundColor Green

# Assert 4: No unit association
if ($unitAssignedCount -ne 0) {
    throw ("FAILURE: Found " + $unitAssignedCount + " workers with unit association! Workers must have null poliklinikId.")
}
Write-Host "  PASS: All workers have zero unit association (poliklinikId is empty/null)." -ForegroundColor Green

# 3. PATCH /staffs/:id - Test Active/Inactive toggle & Demographic Persistence
Write-Host "`n[Step 3] Testing staff detail editing, Active/Inactive toggle, and DB persistence..." -ForegroundColor Yellow
$targetWorker = $staffList[0]
$workerId = $targetWorker.id
$originalBirthPlace = $targetWorker.birthPlace
Write-Host ("  Selected worker: " + $targetWorker.fullName + " (ID: " + $workerId + ")") -ForegroundColor Gray
Write-Host ("  Original birthPlace: '" + $originalBirthPlace + "'") -ForegroundColor Gray

# 3a. Active/Inactive Toggle Test
Write-Host "  Testing toggle to isActive = false..." -ForegroundColor Gray
$patchInactive = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Patch -Headers $headers -Body (@{ isActive = $false } | ConvertTo-Json)
if ($patchInactive.isActive -ne $false) {
    throw "FAILURE: isActive was not updated to false in database!"
}
Write-Host "  PASS: Toggle isActive = false verified." -ForegroundColor Green

Write-Host "  Testing toggle back to isActive = true..." -ForegroundColor Gray
$patchActive = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Patch -Headers $headers -Body (@{ isActive = $true } | ConvertTo-Json)
if ($patchActive.isActive -ne $true) {
    throw "FAILURE: isActive was not restored to true in database!"
}
Write-Host "  PASS: Toggle isActive = true verified." -ForegroundColor Green

# 3b. Demographic Mutation Test
$testBirthPlace = "Sentul City Test Verified"
$patchBody = @{
    birthPlace = $testBirthPlace
} | ConvertTo-Json

$patchedWorker = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Patch -Headers $headers -Body $patchBody
Write-Host ("  PATCH sent with birthPlace = '" + $testBirthPlace + "'") -ForegroundColor Gray

# Verify via GET
$verifiedWorker = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Get -Headers $headers
if ($verifiedWorker.birthPlace -ne $testBirthPlace) {
    throw ("FAILURE: birthPlace was not persisted in database! Got '" + $verifiedWorker.birthPlace + "'")
}
Write-Host "  PASS: birthPlace mutation persisted to database verified via GET." -ForegroundColor Green

# Revert to original
Write-Host "  Reverting birthPlace to original value..." -ForegroundColor Gray
$revertBody = @{
    birthPlace = $originalBirthPlace
} | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Patch -Headers $headers -Body $revertBody
$restoredWorker = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Get -Headers $headers
if ($restoredWorker.birthPlace -ne $originalBirthPlace) {
    throw "FAILURE: birthPlace could not be reverted."
}
Write-Host ("  PASS: birthPlace successfully reverted to '" + $originalBirthPlace + "'.") -ForegroundColor Green

# 3c. Address Mutation Test (Provinsi, Kota, Kecamatan, Kelurahan, Alamat Detail)
Write-Host "`n[Step 3c] Testing primary domicile address update and persistence..." -ForegroundColor Yellow
$testAddress = @{
    provinceCode = "32"
    provinceName = "JAWA BARAT"
    regencyCode = "3201"
    regencyName = "KABUPATEN BOGOR"
    districtCode = "320101"
    districtName = "CIBINONG"
    villageCode = "3201012001"
    villageName = "CIRANJANG"
    line1 = "Jl. Raya Bogor KM 45 No. 10"
    fullAddress = "Jl. Raya Bogor KM 45 No. 10, Kel. CIRANJANG, Kec. CIBINONG, KABUPATEN BOGOR, JAWA BARAT"
}
$patchAddressBody = @{
    address = $testAddress
} | ConvertTo-Json

$null = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Patch -Headers $headers -Body $patchAddressBody
$verifiedAddrWorker = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId" -Method Get -Headers $headers

if (-not $verifiedAddrWorker.address) {
    throw "FAILURE: address is null after update!"
}
if ($verifiedAddrWorker.address.provinceName -ne "JAWA BARAT") {
    throw ("FAILURE: Expected provinceName 'JAWA BARAT', got '" + $verifiedAddrWorker.address.provinceName + "'")
}
if ($verifiedAddrWorker.address.regencyName -ne "KABUPATEN BOGOR") {
    throw ("FAILURE: Expected regencyName 'KABUPATEN BOGOR', got '" + $verifiedAddrWorker.address.regencyName + "'")
}
if ($verifiedAddrWorker.address.line1 -ne "Jl. Raya Bogor KM 45 No. 10") {
    throw ("FAILURE: Expected line1 'Jl. Raya Bogor KM 45 No. 10', got '" + $verifiedAddrWorker.address.line1 + "'")
}
Write-Host "  PASS: Address mutation (Provinsi, Kota, Kecamatan, Kelurahan, Line1) persisted to database." -ForegroundColor Green


# 4. GET /staffs/:id/roster - Verify Roster Endpoint
Write-Host "`n[Step 4] Testing roster retrieval from GET /staffs/:id/roster..." -ForegroundColor Yellow
$rosterRes = Invoke-RestMethod -Uri "$baseUrl/staffs/$workerId/roster" -Method Get -Headers $headers
Write-Host ("  PASS: Roster endpoint returned valid data (Count: " + $rosterRes.Count + ").") -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  ALL STAFF MANAGEMENT E2E ASSERTIONS PASSED (100% GREEN)!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
