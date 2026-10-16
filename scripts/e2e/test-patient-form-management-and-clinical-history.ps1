# ==============================================================================
# E2E Test & Data Dump: Patient Form Management and Clinical Record History
# ==============================================================================
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E: PATIENT FORM MANAGEMENT & CLINICAL HISTORY AUDIT" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# 1. Pastikan API backend siap
Write-Host "`n[Step 1] Memeriksa ketersediaan API..." -ForegroundColor Yellow
Wait-E2EApiReady
Write-Host "API Ready!" -ForegroundColor Green

Reset-TestCounters
$apiUrl = Get-E2EApiBaseUrl

# 2. Login sebagai Pasien Akun Lexguard Didier
Write-Host "`n[Step 2] Login sebagai Pasien (lexguarddidier@gmail.com)..." -ForegroundColor Yellow
$patientSession = $null
try {
    $patientSession = Login-User "lexguarddidier@gmail.com" "secret123"
} catch {
    Write-Host "Fallback login ke pasien@amanah.com jika akun uji belum aktif..." -ForegroundColor Yellow
    $patientSession = Login-Patient
}

$headers = $patientSession.headers
$patientUser = $patientSession.user
Assert-Test "Login Pasien Berhasil" ($null -ne $patientSession.token) "User: $($patientUser.email)"

# 3. Ambil data afiliasi profil pasien saat ini
Write-Host "`n[Step 3] Mengambil data afiliasi pasien (GET /api/v1/patients/affiliations/me)..." -ForegroundColor Yellow
$affiliationsRes = Invoke-RestMethod -Uri "$apiUrl/patients/affiliations/me" -Method Get -Headers $headers
$affiliations = @(Get-ResponseData $affiliationsRes)

Write-Host "Jumlah profil afiliasi ditemukan: $($affiliations.Count)" -ForegroundColor Cyan
Write-Host "`n--- DUMP DATA AFILIASI PASIEN (SUMMARY) ---" -ForegroundColor Magenta
$affiliations | ForEach-Object {
    Write-Host " - ID: $($_.patientId) | Nama: $($_.patient.fullName) | Hubungan: $($_.relationshipType) | NIK: $($_.patient.nik) | Alamat: $($_.patient.address)"
}

Assert-Test "Endpoint /patients/affiliations/me mengembalikan response valid" ($affiliations.Count -gt 0)

# 4. Uji Booking Context (GET /api/v1/patients/affiliations/booking-context)
Write-Host "`n[Step 4] Uji Booking Context Lengkap (Demografi & Alamat SSOT)..." -ForegroundColor Yellow
$servicesCatalog = Invoke-RestMethod -Uri "$apiUrl/clinics/services/catalog" -Method Get
$allServices = @()
if ($servicesCatalog.categories) {
    foreach ($cat in $servicesCatalog.categories) {
        if ($cat.services) {
            $allServices += $cat.services
        }
    }
}
$targetService = $allServices | Where-Object { $_.code -eq "pengobatan_keluhan_ringan" -or $_.code -eq "general_checkup" } | Select-Object -First 1
if (-not $targetService) {
    $targetService = $allServices | Select-Object -First 1
}
$serviceId = $targetService.id
Write-Host "Layanan Medis Dinamis Terpilih: $($targetService.name) (ID: $serviceId)" -ForegroundColor Cyan
$bookingCtxUrl = "$apiUrl/patients/affiliations/booking-context?serviceId=$serviceId"
$bookingCtxRes = Invoke-RestMethod -Uri $bookingCtxUrl -Method Get -Headers $headers
$ctxData = Get-ResponseData $bookingCtxRes
$ctxPatients = @($ctxData.patients)

Write-Host "Jumlah pasien di booking context: $($ctxPatients.Count)" -ForegroundColor Cyan
Write-Host "`n--- DUMP PASIEN DALAM BOOKING CONTEXT (FULL DEMOGRAPHICS & REGION) ---" -ForegroundColor Magenta
$ctxPatients | ForEach-Object {
    $pDump = [PSCustomObject]@{
        patientId = $_.id
        fullName = $_.fullName
        relationship = $_.relationship
        relationshipLabel = $_.relationshipLabel
        nik = $_.nik
        gender = $_.gender
        bloodType = $_.bloodType
        birthPlace = $_.birthPlace
        birthDate = $_.birthDate
        motherName = $_.motherName
        address = $_.address
        alamatDetail = $_.alamatDetail
        provinsi = $_.provinsi
        kabupaten = $_.kabupaten
        kecamatan = $_.kecamatan
        kelurahan = $_.kelurahan
    }
    Write-Host ($pDump | ConvertTo-Json -Depth 3) -ForegroundColor White
}

# Verifikasi pasien 'self' memiliki data demografi lengkap
$selfPatient = $ctxPatients | Where-Object { $_.relationship -eq "self" } | Select-Object -First 1
if ($selfPatient) {
    Assert-Test "Pasien self teridentifikasi" ($selfPatient.relationship -eq "self") "Nama: $($selfPatient.fullName)"
    Assert-Test "Nama ibu kandung tersedia di booking context" (-not [string]::IsNullOrWhiteSpace($selfPatient.motherName)) "MotherName: $($selfPatient.motherName)"
    Assert-Test "Tempat & tanggal lahir tersedia di booking context" (-not [string]::IsNullOrWhiteSpace($selfPatient.birthPlace) -and -not [string]::IsNullOrWhiteSpace($selfPatient.birthDate)) "Lahir: $($selfPatient.birthPlace), $($selfPatient.birthDate)"
    Assert-Test "Data wilayah domisili (provinsi / alamat) tersedia" (-not [string]::IsNullOrWhiteSpace($selfPatient.address) -or -not [string]::IsNullOrWhiteSpace($selfPatient.provinsi)) "Alamat: $($selfPatient.address)"
}

# 5. Uji Pengubahan Form Reguler Pasien via Endpoint Kanonikal (PATCH /api/v1/patients/:id)
$targetPatient = if ($selfPatient) { $selfPatient } else { $ctxPatients[0] }
$targetPatientId = $targetPatient.id

Write-Host "`n[Step 5] Uji Edit Form Reguler Pasien (PATCH /api/v1/patients/$targetPatientId)..." -ForegroundColor Yellow
$origName = $targetPatient.fullName
$testAddress = "Jl. Bakung No. $(Get-Random -Minimum 10 -Maximum 99), Pulau Tamang"
$updatePayload = @{
    fullName = $origName
    address = $testAddress
    bloodType = "a"
    birthPlace = "Sleman"
    birthDate = "1984-10-11"
    gender = "male"
    namaIbuKandung = "maryam"
} | ConvertTo-Json

$updateRes = Invoke-RestMethod -Uri "$apiUrl/patients/$targetPatientId" -Method Patch -Body $updatePayload -Headers $headers
$updatedData = if ($null -ne $updateRes.data) { $updateRes.data } else { $updateRes }

Assert-Test "PATCH /patients/:id berhasil memperbarui profil" ($null -ne $updatedData)
Assert-Test "Nama lengkap pasien konsisten" ($updatedData.fullName -eq $origName) "Got: $($updatedData.fullName)"
Assert-Test "Golongan darah kanonikal tersimpan" ($updatedData.bloodType -like "*a*") "Got: $($updatedData.bloodType)"
Assert-Test "Gender SSOT male tersimpan" ($updatedData.gender -eq "male") "Got: $($updatedData.gender)"
Assert-Test "Nama ibu kandung tersimpan" ($updatedData.namaIbuKandung -eq "maryam" -or $updatedData.motherName -eq "maryam") "Got: namaIbuKandung='$($updatedData.namaIbuKandung)', motherName='$($updatedData.motherName)'"

Write-Host "`n--- DUMP HASIL UPDATE FORM REGULER (KANONIKAL PATCH /patients/:id) ---" -ForegroundColor Magenta
$updatedDump = [PSCustomObject]@{
    id = $updatedData.id
    fullName = $updatedData.fullName
    nik = $updatedData.nationalIdEncrypted
    medicalRecordNumber = $updatedData.medicalRecordNumber
    address = $updatedData.address
    bloodType = $updatedData.bloodType
    gender = $updatedData.gender
    namaIbuKandung = if ($null -ne $updatedData.namaIbuKandung) { $updatedData.namaIbuKandung } else { $updatedData.motherName }
    birthPlace = $updatedData.birthPlace
    birthDate = $updatedData.birthDate
}
Write-Host ($updatedDump | ConvertTo-Json -Depth 5) -ForegroundColor White

# 6. Uji Riwayat Medis Kehamilan & Persalinan (GET /api/v1/medical-records/intakes/maternity/history)
Write-Host "`n[Step 6] Mengambil Riwayat Formulir Kehamilan & Persalinan (GET /api/v1/medical-records/intakes/maternity/history)..." -ForegroundColor Yellow
$matHistoryRes = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/maternity/history?page=1&limit=5" -Method Get -Headers $headers

Assert-Test "Response Riwayat Maternity memiliki struktur paginasi" (
    $null -ne $matHistoryRes.data -and 
    $null -ne $matHistoryRes.total -and 
    $null -ne $matHistoryRes.page -and 
    $null -ne $matHistoryRes.totalPages
) "Total: $($matHistoryRes.total), Page: $($matHistoryRes.page)/$($matHistoryRes.totalPages)"

Write-Host "Total rekam medis kehamilan ditemukan: $($matHistoryRes.total)" -ForegroundColor Cyan
Assert-Test "Riwayat kehamilan keluarga ditemukan (>0 data)" ($matHistoryRes.total -gt 0) "Found: $($matHistoryRes.total) records"

Write-Host "`n--- DUMP DATA RIWAYAT KEHAMILAN (PAGE 1) ---" -ForegroundColor Magenta
$matHistoryRes.data | ForEach-Object {
    Write-Host " - ID: $($_.id) | Ibu: $($_.motherName) | NIK: $($_.motherNik) | GPA: G$($_.gravidaCount)P$($_.parityCount)A$($_.abortionCount) | Usia: $($_.gestationalAgeFormatted) | Tanggal: $($_.createdAt)"
}

# Ambil detail lengkap rekam pertama
$firstMatId = $matHistoryRes.data[0].id
Write-Host "`n[Step 6.1] Mengambil Detail Lengkap Rekam Kehamilan (GET /maternity/$firstMatId)..." -ForegroundColor Yellow
$matDetailRes = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/maternity/$firstMatId" -Method Get -Headers $headers
$matDetail = Get-ResponseData $matDetailRes

Write-Host "`n--- DUMP DETAIL REKAM KEHAMILAN LENGKAP (READ-ONLY) ---" -ForegroundColor Magenta
$matDetailSummary = [PSCustomObject]@{
    id = $matDetail.id
    motherName = $matDetail.motherName
    motherNik = $matDetail.motherNik
    gestationalAge = $matDetail.gestationalAgeFormatted
    hpht = $matDetail.hpht
    hpl = $matDetail.estimatedDueDate
    gravida = $matDetail.gravidaCount
    partus = $matDetail.parityCount
    abortus = $matDetail.abortionCount
    suami = $matDetail.husband
    answersCount = ($matDetail.answers.PSObject.Properties | Measure-Object).Count
}
Write-Host ($matDetailSummary | ConvertTo-Json -Depth 5) -ForegroundColor White

# 7. Uji Riwayat Medis Imunisasi Anak (GET /api/v1/medical-records/intakes/immunization/history)
Write-Host "`n[Step 7] Mengambil Riwayat Formulir Imunisasi Anak (GET /api/v1/medical-records/intakes/immunization/history)..." -ForegroundColor Yellow
$imunHistoryRes = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/immunization/history?page=1&limit=5" -Method Get -Headers $headers

Assert-Test "Response Riwayat Imunisasi memiliki struktur paginasi" (
    $null -ne $imunHistoryRes.data -and 
    $null -ne $imunHistoryRes.total -and 
    $null -ne $imunHistoryRes.page -and 
    $null -ne $imunHistoryRes.totalPages
) "Total: $($imunHistoryRes.total), Page: $($imunHistoryRes.page)/$($imunHistoryRes.totalPages)"

Write-Host "Total rekam medis imunisasi anak ditemukan: $($imunHistoryRes.total)" -ForegroundColor Cyan

# 8. Uji Keamanan: Akses Data Pasien Non-Afiliasi (Security / RBAC Ownership Test)
Write-Host "`n[Step 8] Uji Keamanan & Isolasi Data Pasien Non-Afiliasi..." -ForegroundColor Yellow
$fakePatientId = "c1111111-1111-4111-8111-111111111111"
$isBlocked = $false

try {
    Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/maternity/history?patientId=$fakePatientId" -Method Get -Headers $headers
} catch {
    $errStr = $_.ToString() + " " + $_.Exception.Message
    $statusCode = 0
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
    if ($statusCode -eq 403 -or $errStr -match "403" -or $errStr -match "Forbidden") {
        $isBlocked = $true
    }
}

Assert-Test "Pasien diblokir (403) saat mengakses riwayat pasien non-afiliasi" $isBlocked "Query tampering berhasil dicegah"

# 9. Print Ringkasan Pengujian
Print-TestSummary "PATIENT FORM MANAGEMENT & CLINICAL HISTORY AUDIT"
