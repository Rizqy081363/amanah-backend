# PowerShell Verification Test Suite for Phase 1 CRUD (Clinics, Patients, Staffs)
$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3001/api/v1"
$totalTests = 0
$passedTests = 0
$failedTests = 0

function Assert-Test {
    param(
        [string]$Name,
        [scriptblock]$TestBlock
    )
    $script:totalTests++
    try {
        & $TestBlock
        $script:passedTests++
        Write-Host " [PASS] $Name" -ForegroundColor Green
    }
    catch {
        $script:failedTests++
        Write-Host "❌ [FAIL] $Name" -ForegroundColor Red
        Write-Host "   Error: $_" -ForegroundColor DarkRed
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  AMANAH HEALTHCARE - PHASE 1 FULL CRUD VERIFICATION SUITE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Login as Admin
Write-Host "`n--- Setup: Admin Authentication ---" -ForegroundColor Yellow
$adminToken = $null
Assert-Test "Admin Login for CRUD operations" {
    $body = @{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No token returned" }
    $script:adminToken = $res.token
}

$headers = @{ 
    Authorization = "Bearer $adminToken"
    "Content-Type" = "application/json"
}

# -------------------------------------------------------------------
# 2. Clinics & Layanan CRUD
# -------------------------------------------------------------------
Write-Host "`n--- 1. Clinics (Poliklinik) & Layanan CRUD ---" -ForegroundColor Yellow

$createdClinicId = $null
$createdLayananId = $null

Assert-Test "POST /clinics - Create new Clinic (Poli Gigi)" {
    $clinicCode = "POLI-GIGI-" + (Get-Random -Minimum 100 -Maximum 999)
    $body = @{
        namaPoli = "Poli Gigi & Mulut"
        kodePoli = $clinicCode
        deskripsi = "Klinik spesialis kesehatan gigi dan mulut"
        isActive = $true
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/clinics" -Method Post -Headers $headers -Body $body
    if (-not $res.id) { throw "Created clinic has no ID" }
    if ($res.kodePoli -ne $clinicCode) { throw "Clinic code mismatch: $($res.kodePoli)" }
    $script:createdClinicId = $res.id
    Write-Host "   -> Created Clinic ID: $($res.id) [$($res.kodePoli)]" -ForegroundColor Gray
}

Assert-Test "GET /clinics/:id - Fetch Clinic detail" {
    $res = Invoke-RestMethod -Uri "$baseUrl/clinics/$($script:createdClinicId)" -Method Get -Headers $headers
    if ($res.id -ne $script:createdClinicId) { throw "Clinic ID mismatch" }
    if ($res.namaPoli -ne "Poli Gigi & Mulut") { throw "Clinic name mismatch" }
}

Assert-Test "PATCH /clinics/:id - Update Clinic details" {
    $body = @{
        deskripsi = "Pelayanan perawatan gigi modern, ortodonti, dan estetik"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/clinics/$($script:createdClinicId)" -Method Patch -Headers $headers -Body $body
    if ($res.deskripsi -ne "Pelayanan perawatan gigi modern, ortodonti, dan estetik") { throw "Updated deskripsi mismatch" }
}

Assert-Test "POST /clinics/:id/layanan - Add Service to Clinic" {
    $body = @{
        namaLayanan = "Tambal Gigi Estetik Komposit"
        deskripsi = "Penambalan gigi dengan bahan sewarna gigi"
        medicalFlow = "general"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/clinics/$($script:createdClinicId)/layanan" -Method Post -Headers $headers -Body $body
    if (-not $res.id) { throw "Created layanan has no ID" }
    $script:createdLayananId = $res.id
    Write-Host "   -> Created Layanan ID: $($res.id) [$($res.namaLayanan)]" -ForegroundColor Gray
}

Assert-Test "PATCH /clinics/layanan/:layananId - Update Service" {
    $body = @{
        deskripsi = "Penambalan gigi estetik komposit nano-hybrid"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/clinics/layanan/$($script:createdLayananId)" -Method Patch -Headers $headers -Body $body
    if ($res.deskripsi -ne "Penambalan gigi estetik komposit nano-hybrid") { throw "Updated deskripsi mismatch" }
}

Assert-Test "DELETE /clinics/layanan/:layananId - Soft delete Service" {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/clinics/layanan/$($script:createdLayananId)" -Method Delete -Headers $headers
    if ($res.StatusCode -ne 204) { throw "Expected status code 204, got $($res.StatusCode)" }
}

Assert-Test "DELETE /clinics/:id - Soft delete Clinic" {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/clinics/$($script:createdClinicId)" -Method Delete -Headers $headers
    if ($res.StatusCode -ne 204) { throw "Expected status code 204, got $($res.StatusCode)" }
}

# -------------------------------------------------------------------
# 3. Patients CRUD
# -------------------------------------------------------------------
Write-Host "`n--- 2. Patients CRUD ---" -ForegroundColor Yellow

$createdPatientId = $null
$randomNik = "3201" + (Get-Random -Minimum 100000000000 -Maximum 999999999999)

Assert-Test "POST /patients - Register new Patient with auto MRN" {
    $body = @{
        nik = $randomNik
        fullName = "Siti Rahmawati"
        birthDate = "1994-05-12"
        birthPlace = "Bandung"
        gender = "Perempuan"
        bloodType = "B"
        phoneNumber = "081234567890"
        address = "Jl. Melati No. 45, Bandung"
        pekerjaan = "Wiraswasta"
        medicalHistory = "Alergi Seafood"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/patients" -Method Post -Headers $headers -Body $body
    if (-not $res.id) { throw "Created patient has no ID" }
    if (-not $res.medicalRecordNumber -or -not ($res.medicalRecordNumber -like "RM-*")) { throw "Patient MRN was not auto-generated: $($res.medicalRecordNumber)" }
    $script:createdPatientId = $res.id
    Write-Host "   -> Auto MRN: $($res.medicalRecordNumber), Patient ID: $($res.id)" -ForegroundColor Gray
}

Assert-Test "GET /patients - Search Patients by query" {
    $res = Invoke-RestMethod -Uri "$baseUrl/patients?search=Rahmawati" -Method Get -Headers $headers
    if (-not $res -or $res.Count -lt 1) { throw "Search did not return created patient" }
    $found = $res | Where-Object { $_.id -eq $script:createdPatientId }
    if (-not $found) { throw "Target patient not found in search results" }
}

Assert-Test "PATCH /patients/:id - Update Patient address and phone" {
    $body = @{
        phoneNumber = "081211223344"
        address = "Jl. Mawar No. 10, Cimahi"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/patients/$($script:createdPatientId)" -Method Patch -Headers $headers -Body $body
    if ($res.phoneNumber -ne "081211223344") { throw "Updated phoneNumber mismatch" }
    if ($res.address -ne "Jl. Mawar No. 10, Cimahi") { throw "Updated address mismatch" }
}

Assert-Test "DELETE /patients/:id - Soft delete Patient" {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/patients/$($script:createdPatientId)" -Method Delete -Headers $headers
    if ($res.StatusCode -ne 204) { throw "Expected status code 204, got $($res.StatusCode)" }
}

# -------------------------------------------------------------------
# 4. Staffs CRUD & Credentials
# -------------------------------------------------------------------
Write-Host "`n--- 3. Staffs CRUD & Professional Credentials ---" -ForegroundColor Yellow

$createdStaffId = $null

Assert-Test "POST /staffs - Register new Staff (Perawat)" {
    $body = @{
        fullName = "Ns. Dewi Anggraini, S.Kep"
        profession = "Perawat Rawat Jalan"
        phoneNumber = "085678901234"
        idCardNumber = "NRS-AMANAH-" + (Get-Random -Minimum 100 -Maximum 999)
        isActive = $true
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/staffs" -Method Post -Headers $headers -Body $body
    if (-not $res.id) { throw "Created staff has no ID" }
    $script:createdStaffId = $res.id
    Write-Host "   -> Created Staff ID: $($res.id) [$($res.fullName)]" -ForegroundColor Gray
}

Assert-Test "GET /staffs/:id - Fetch Staff detail" {
    $res = Invoke-RestMethod -Uri "$baseUrl/staffs/$($script:createdStaffId)" -Method Get -Headers $headers
    if ($res.id -ne $script:createdStaffId) { throw "Staff ID mismatch" }
    if ($res.profession -ne "Perawat Rawat Jalan") { throw "Staff profession mismatch" }
}

Assert-Test "PATCH /staffs/:id - Update Staff profession" {
    $body = @{
        profession = "Perawat Koordinator Poliklinik"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/staffs/$($script:createdStaffId)" -Method Patch -Headers $headers -Body $body
    if ($res.profession -ne "Perawat Koordinator Poliklinik") { throw "Staff profession update failed" }
}

$createdCredentialNum = $null

Assert-Test "POST /staffs/:id/credentials - Add Legal Credential (SIP)" {
    $sipNum = "446/" + (Get-Random -Minimum 1000 -Maximum 9999) + "/SIP-P/DPMPTSP/2026"
    $body = @{
        credentialType = "sip"
        credentialNumber = $sipNum
        issuer = "Dinas Kesehatan Kota Bandung"
        issuedAt = "2026-01-15"
        expiresAt = "2031-01-15"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/staffs/$($script:createdStaffId)/credentials" -Method Post -Headers $headers -Body $body
    if (-not $res.id) { throw "Created credential has no ID" }
    if ($res.credentialNumber -ne $sipNum) { throw "Credential number mismatch" }
    $script:createdCredentialNum = $sipNum
}

Assert-Test "GET /staffs/:id/credentials - Fetch Staff credentials" {
    $res = Invoke-RestMethod -Uri "$baseUrl/staffs/$($script:createdStaffId)/credentials" -Method Get -Headers $headers
    if (-not $res -or $res.Count -lt 1) { throw "No credentials returned" }
    $found = $res | Where-Object { $_.credentialNumber -eq $script:createdCredentialNum }
    if (-not $found) { throw "Added credential not found in list" }
}

Assert-Test "DELETE /staffs/:id - Soft delete Staff" {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/staffs/$($script:createdStaffId)" -Method Delete -Headers $headers
    if ($res.StatusCode -ne 204) { throw "Expected status code 204, got $($res.StatusCode)" }
}

# -------------------------------------------------------------------
# Final Summary
# -------------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "                TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Total Tests Run : $totalTests"
Write-Host "Passed          : $passedTests" -ForegroundColor Green
Write-Host "Failed          : $failedTests" -ForegroundColor $(if ($failedTests -eq 0) { "Green" } else { "Red" })

if ($failedTests -eq 0) {
    Write-Host "`n✨ ALL PHASE 1 CRUD TESTS COMPLETED AND PASSED 100%!" -ForegroundColor Green
} else {
    Write-Host "`n❌ SOME TESTS FAILED." -ForegroundColor Red
    exit 1
}
