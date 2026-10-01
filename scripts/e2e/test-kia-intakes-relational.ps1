$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"
$baseUrl = Get-E2EApiBaseUrl
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
        Write-Host " [FAIL] $Name" -ForegroundColor Red
        Write-Host "   Error: $_" -ForegroundColor DarkRed
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " AMANAH HEALTHCARE - KIA RELATIONAL INTAKE E2E SUITE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$adminToken = $null
$pasienToken = $null
$dokterToken = $null
$patientId = $null
$midwifePractitionerId = $null
$generalDoctorId = $null
$poliKiaId = $null
$pregnancyServiceId = $null
$immunizationServiceId = $null
$maternalAppointmentId = $null
$immunizationAppointmentId = $null
$maternalIntakeId = $null
$immunizationIntakeId = $null

Assert-Test "Admin Login" {
    $body = @{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No admin token" }
    $script:adminToken = $res.token
}

Assert-Test "Pasien Login" {
    $body = @{ email = "pasien@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No pasien token" }
    $script:pasienToken = $res.token
}

Assert-Test "Dokter Login" {
    $body = @{ email = "dokter@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No dokter token" }
    $script:dokterToken = $res.token
}

$adminHeaders = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
$pasienHeaders = @{ Authorization = "Bearer $pasienToken"; "Content-Type" = "application/json" }
$dokterHeaders = @{ Authorization = "Bearer $dokterToken"; "Content-Type" = "application/json" }

Assert-Test "Fetch Patient Profile" {
    $profile = Invoke-RestMethod -Uri "$baseUrl/patients/me" -Method Get -Headers $pasienHeaders
    if (-not $profile.id) { throw "Cannot get patient profile" }
    $script:patientId = $profile.id
}

Assert-Test "Resolve Poli KIA & Services" {
    $clinics = Invoke-RestMethod -Uri "$baseUrl/clinics" -Method Get
    $kiaClinic = $clinics | Where-Object { $_.namaPoli -like "*KIA*" -or $_.kodePoli -eq "POLI-KIA" } | Select-Object -First 1
    if (-not $kiaClinic) { throw "Poli KIA not found" }
    $script:poliKiaId = $kiaClinic.id

    $services = Invoke-RestMethod -Uri "$baseUrl/clinics/$($script:poliKiaId)/layanan" -Method Get
    $preg = $services | Where-Object { $_.namaLayanan -like "*ANC*" -or $_.nama -like "*ANC*" } | Select-Object -First 1
    $imm = $services | Where-Object { $_.namaLayanan -like "*Imunisasi*" -or $_.nama -like "*Imunisasi*" } | Select-Object -First 1

    if (-not $preg) { throw "Pregnancy service not found" }
    if (-not $imm) { throw "Immunization service not found" }

    $script:pregnancyServiceId = $preg.id
    $script:immunizationServiceId = $imm.id
}

Assert-Test "Resolve Practitioners (Midwife & General Doctor)" {
    $res = Invoke-RestMethod -Uri "$baseUrl/clinical/practitioners" -Method Get
    $doctors = $res.data
    $midwife = $doctors | Where-Object { $_.name -like "Bdn*" -or $_.spec -like "*Ibu dan Anak*" } | Select-Object -First 1
    $genDoc = $doctors | Where-Object { $_.spec -like "*Dokter Umum*" } | Select-Object -First 1

    if (-not $midwife) {
        $midwife = $doctors[0]
    }
    if (-not $genDoc) {
        $genDoc = $doctors | Where-Object { $_.id -ne $midwife.id } | Select-Object -First 1
    }

    $script:midwifePractitionerId = $midwife.id
    $script:generalDoctorId = $genDoc.id
}

$randomOffset = Get-Random -Minimum 40 -Maximum 900
$negDateStr = (Get-Date).AddDays($randomOffset).ToString("yyyy-MM-dd")
$matDateStr = (Get-Date).AddDays($randomOffset + 1).ToString("yyyy-MM-dd")
$immDateStr = (Get-Date).AddDays($randomOffset + 2).ToString("yyyy-MM-dd")

Assert-Test "Negative Test: Rejects Booking KIA Service with General Doctor (422)" {
    $bookingBody = @{
        patientId = $script:patientId
        poliklinikId = $script:poliKiaId
        layananId = $script:pregnancyServiceId
        staffId = $script:generalDoctorId
        appointmentDate = $negDateStr
        session = "PAGI"
        notes = "Negative test should fail with 422"
    } | ConvertTo-Json

    $rejected = $false
    try {
        Invoke-RestMethod -Uri "$baseUrl/appointments" -Method Post -Body $bookingBody -Headers $pasienHeaders
    }
    catch {
        $ex = $_.Exception
        if ($ex.Response.StatusCode.value__ -eq 422) {
            $rejected = $true
        } else {
            throw "Expected status code 422, received $($ex.Response.StatusCode.value__)"
        }
    }

    if (-not $rejected) {
        throw "Failed to reject appointment with non-KIA doctor"
    }
}

Assert-Test "Book Maternal Appointment with Midwife" {
    $bookingBody = @{
        patientId = $script:patientId
        poliklinikId = $script:poliKiaId
        layananId = $script:pregnancyServiceId
        staffId = $script:midwifePractitionerId
        appointmentDate = $matDateStr
        session = "PAGI"
        notes = "Pemeriksaan rutin kehamilan trimester kedua"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/appointments" -Method Post -Body $bookingBody -Headers $pasienHeaders
    if (-not $res.id -and -not $res.appointmentId) {
        throw "Appointment booking response missing ID"
    }
    $script:maternalAppointmentId = if ($res.id) { $res.id } else { $res.appointmentId }
}

Assert-Test "Submit Maternal Health Intake (Relational Dual-Write)" {
    $maternalPayload = @{
        patientId = $script:patientId
        appointmentId = $script:maternalAppointmentId
        motherNik = "3273012345678901"
        motherName = "Ny. Dewi Lestari"
        motherBirthDate = "1995-04-12"
        motherAge = 31
        marriageOrder = 1
        marriageDate = "2020-05-10"
        motherJob = "Pegawai Swasta"
        motherEducation = "S1"
        religion = "Islam"
        phoneNumber = "081234567890"
        domicileAddress = "Jl. Sukajadi No. 45 Bandung"
        identityCardAddress = "Jl. Sukajadi No. 45 Bandung"
        dasawisma = "Mawar 02"
        posyandu = "Posyandu Cempaka"
        puskesmas = "Puskesmas Sukajadi"
        partnerName = "Tn. Budi Setiawan"
        partnerNik = "3273019876543210"
        partnerBirthDate = "1993-02-18"
        partnerAge = 33
        partnerJob = "Wiraswasta"
        partnerEducation = "S1"
        partnerBloodType = "O"
        heightCm = 160.5
        prePregnancyWeightKg = 54.0
        upperArmCircumferenceCm = 24.5
        initialBmi = 21.0
        tetanusStatus = "T3"
        motherBloodType = "B"
        hpht = "2026-01-15"
        estimatedDueDate = "2026-10-22"
        gestationalAgeWeeks = 14.5
        gestationalAgeFormatted = "14 minggu 3 hari"
        currentComplaints = "Mual ringan pada pagi hari"
        gravidaCount = 2
        parityCount = 1
        abortionCount = 0
        livingChildrenCount = 1
        hasPreviousPregnancyHistory = $true
        hasContraceptionHistory = $true
        smokedBeforePregnancy = "Tidak"
        alcoholBeforePregnancy = $false
        irregularDietBeforePregnancy = $false
        reducedPhysicalActivityBeforePregnancy = $false
        unprescribedMedicationBeforePregnancy = $false
        concerningCosmeticUseBeforePregnancy = $false
        pesticideExposureBeforePregnancy = $false
        chemicalExposureBeforePregnancy = $false
        smokeExposureBeforePregnancy = $false
        concerningEnvironmentNotes = "Lingkungan bersih dan bebas asap rokok"
        allergyInfo = "Tidak ada alergi"
        otherNotes = "Riwayat persalinan pertama normal"
        diseaseHistory = @{
            hasHypertensionHistory = "Tidak"
            hasDiabetesHistory = "Tidak"
            hasAsthmaHistory = "Tidak"
            hasHeartDiseaseHistory = "Tidak"
        }
        previousPregnancies = @(
            @{
                orderNumber = 1
                birthYear = "2022"
                birthWeightGrams = 3200
                birthLengthCm = 50.0
                childSex = "Perempuan"
                gestationalAgeAtBirth = "39 minggu"
                birthAttendant = "Bdn. Siti Rahmawati"
                deliveryMethod = "Normal"
                deliveryPlace = "Klinik Amanah"
                complications = "Tidak ada"
            }
        )
        contraceptiveHistories = @(
            @{
                orderNumber = 1
                startDate = "2022-09-01"
                contraceptiveType = "IUD"
                durationText = "2 tahun"
                stopDate = "2024-09-01"
                problems = "Tidak ada"
                sideEffects = "Tidak ada"
            }
        )
    } | ConvertTo-Json -Depth 5

    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/intakes/maternity" -Method Post -Body $maternalPayload -Headers $pasienHeaders
    if (-not $res.id -or -not $res.intakeSubmissionId) {
        throw "Failed to create maternal health intake"
    }
    $script:maternalIntakeId = $res.id
    if ($res.motherNik -ne "3273012345678901") {
        throw "Maternal intake motherNik mismatch"
    }
    if ($res.previousPregnancies.Count -lt 1) {
        throw "Previous pregnancies not persisted in relational response"
    }
}

Assert-Test "Retrieve Maternal Intake By Appointment ID" {
    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/intakes/by-appointment/$($script:maternalAppointmentId)" -Method Get -Headers $dokterHeaders
    if (-not $res.flow -or $res.flow -ne "pregnancy") {
        throw "Expected pregnancy flow in intake response"
    }
    if (-not $res.data -or -not $res.data.motherNik) {
        throw "Unified intake response missing relational maternal payload"
    }
    if ($res.data.gravidaCount -ne 2) {
        throw "Relational gravida count mismatch"
    }
}

Assert-Test "Book Immunization Appointment with Midwife" {
    $bookingBody = @{
        patientId = $script:patientId
        poliklinikId = $script:poliKiaId
        layananId = $script:immunizationServiceId
        staffId = $script:midwifePractitionerId
        appointmentDate = $immDateStr
        session = "PAGI"
        notes = "Jadwal imunisasi lanjutan balita"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/appointments" -Method Post -Body $bookingBody -Headers $pasienHeaders
    $script:immunizationAppointmentId = if ($res.id) { $res.id } else { $res.appointmentId }
}

Assert-Test "Submit Child Immunization Intake (Relational Dual-Write)" {
    $immPayload = @{
        patientId = $script:patientId
        appointmentId = $script:immunizationAppointmentId
        childName = "Ananda Rayyan Pratama"
        childNik = "3273011122334455"
        childBirthDate = "2025-05-10"
        childSex = "Laki-laki"
        childAgeFormatted = "1 tahun 2 bulan"
        parentPhone = "081234567890"
        fatherName = "Tn. Budi Setiawan"
        motherName = "Ny. Dewi Lestari"
        childAddress = "Jl. Sukajadi No. 45 Bandung"
        previousVaccineHistory = "BCG, Polio 1-4, DPT 1-3, MR"
        childAllergyHistory = "Tidak ada alergi obat atau makanan"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/intakes/immunization" -Method Post -Body $immPayload -Headers $pasienHeaders
    if (-not $res.id -or -not $res.intakeSubmissionId) {
        throw "Failed to create child immunization intake"
    }
    $script:immunizationIntakeId = $res.id
    if ($res.childName -ne "Ananda Rayyan Pratama") {
        throw "Child immunization childName mismatch"
    }
}

Assert-Test "Retrieve Immunization Intake By Appointment ID" {
    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/intakes/by-appointment/$($script:immunizationAppointmentId)" -Method Get -Headers $dokterHeaders
    if (-not $res.flow -or $res.flow -ne "immunization") {
        throw "Expected immunization flow in intake response"
    }
    if (-not $res.data -or $res.data.childNik -ne "3273011122334455") {
        throw "Unified intake response missing relational child immunization payload"
    }
}

Write-Host "`n----------------------------------------------------------" -ForegroundColor Cyan
Write-Host " SUITE RESULT: $passedTests / $totalTests PASSED ($failedTests FAILED)" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor Cyan

if ($failedTests -gt 0) {
    exit 1
}
