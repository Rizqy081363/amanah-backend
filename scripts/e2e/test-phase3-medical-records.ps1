# PowerShell Verification Test Suite for Phase 3 (Medical Records, Clinical SOAP, Prescriptions & Intakes)
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
Write-Host " AMANAH HEALTHCARE - PHASE 3 MEDICAL RECORDS SUITE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------
# 1. Multi-Role Authentication & Master Data Setup
# -------------------------------------------------------------------
Write-Host "`n--- Setup: Authentication & Active Profiles ---" -ForegroundColor Yellow

$adminToken = $null
$dokterToken = $null
$pasienToken = $null
$patientId = $null
$practitionerId = $null
$serviceId = $null

Assert-Test "Admin Login" {
    $body = @{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No admin token" }
    $script:adminToken = $res.token
}

Assert-Test "Dokter Login" {
    $body = @{ email = "dokter@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No dokter token" }
    $script:dokterToken = $res.token
}

Assert-Test "Pasien Login" {
    $body = @{ email = "pasien@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No pasien token" }
    $script:pasienToken = $res.token
}

$adminHeaders = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
$dokterHeaders = @{ Authorization = "Bearer $dokterToken"; "Content-Type" = "application/json" }
$pasienHeaders = @{ Authorization = "Bearer $pasienToken"; "Content-Type" = "application/json" }

Assert-Test "Fetch Patient Profile" {
    $profile = Invoke-RestMethod -Uri "$baseUrl/patients/me" -Method Get -Headers $pasienHeaders
    if (-not $profile.id) { throw "Cannot get patient profile" }
    $script:patientId = $profile.id
    Write-Host "   -> Patient: $($profile.fullName) [ID: $($profile.id), RM: $($profile.medicalRecordNumber)]" -ForegroundColor Gray
}

$poliUmumId = $null

Assert-Test "Fetch Active Doctor & Service" {
    $doctorProfile = Invoke-RestMethod -Uri "$baseUrl/staffs/me" -Method Get -Headers $dokterHeaders
    if (-not $doctorProfile.id) { throw "Doctor profile has no ID" }
    $script:practitionerId = $doctorProfile.id

    $clinics = Invoke-RestMethod -Uri "$baseUrl/clinics" -Method Get
    if (-not $clinics -or $clinics.Count -lt 1) { throw "No clinics found" }
    $script:poliUmumId = $clinics[0].id

    $services = Invoke-RestMethod -Uri "$baseUrl/clinics/$($script:poliUmumId)/layanan" -Method Get
    if (-not $services -or $services.Count -lt 1) { throw "No services found" }
    $script:serviceId = $services[0].id
    Write-Host "   -> Doctor: $($doctorProfile.fullName) [ID: $($script:practitionerId)], Poli ID: $($script:poliUmumId), Service ID: $($script:serviceId)" -ForegroundColor Gray
}

# -------------------------------------------------------------------
# 2. Appointment Booking & Pre-Consultation Intake
# -------------------------------------------------------------------
Write-Host "`n--- Appointment & Pre-Consultation Intake Screening ---" -ForegroundColor Yellow

$appointmentId = $null
$intakeId = $null

Assert-Test "Patient Books Appointment for Today" {
    $today = (Get-Date).ToString("yyyy-MM-dd")
    $body = @{
        poliklinikId = $script:poliUmumId
        layananId = $script:serviceId
        appointmentDate = $today
        session = "PAGI"
        visitType = "Pemeriksaan Baru"
        complaint = "Mual muntah berlebihan, usia kehamilan 10 minggu"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/appointments" -Method Post -Headers $pasienHeaders -Body $body
    if (-not $res.id) { throw "Failed to book appointment" }
    $script:appointmentId = $res.id
    Write-Host "   -> Booked Appointment ID: $($res.id), Queue: $($res.queueTicket.queueNumber)" -ForegroundColor Gray
}

Assert-Test "Patient Submits Pre-Consultation Medical Intake (Screening Kehamilan)" {
    $body = @{
        appointmentId = $script:appointmentId
        patientId = $script:patientId
        flow = "pregnancy"
        schemaTitle = "Skrining Awal Ibu Hamil Trimester 1"
        schemaVersion = "v1"
        answers = @{
            keluhanUtama = "Mual muntah terutama di pagi hari, lemas"
            hpht = "2026-01-10"
            riwayatHipertensi = $false
            riwayatAlergi = "Tidak ada"
            kehamilanKe = 1
        }
        automatic = @{
            usiaKehamilan = "10 Minggu"
            hplPerkiraan = "2026-10-17"
            kategoriRisiko = "KRR (Risiko Rendah)"
        }
    } | ConvertTo-Json -Depth 5

    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/intakes" -Method Post -Headers $pasienHeaders -Body $body
    if (-not $res.id) { throw "Failed to submit intake" }
    if ($res.flow -ne "pregnancy") { throw "Expected flow pregnancy, got $($res.flow)" }
    $script:intakeId = $res.id
    Write-Host "   -> Intake ID: $($res.id), Title: $($res.schemaTitle)" -ForegroundColor Gray
}

Assert-Test "Get Medical Intake By ID" {
    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/intakes/$($script:intakeId)" -Method Get -Headers $dokterHeaders
    if ($res.id -ne $script:intakeId) { throw "Intake ID mismatch" }
    if ($res.patientId -ne $script:patientId) { throw "Patient ID mismatch" }
    if (-not $res.answers.hpht) { throw "Missing answers HPHT" }
}

Assert-Test "Get Medical Intakes by Patient ID" {
    $list = Invoke-RestMethod -Uri "$baseUrl/medical-records/intakes/patient/$($script:patientId)" -Method Get -Headers $dokterHeaders
    if (-not $list -or $list.Count -lt 1) { throw "Expected at least 1 intake for patient" }
    $found = $list | Where-Object { $_.id -eq $script:intakeId }
    if (-not $found) { throw "Submitted intake not found in patient list" }
}

# -------------------------------------------------------------------
# 3. Queue Progression (Check-In & Call into Room)
# -------------------------------------------------------------------
Write-Host "`n--- Queue Progression ---" -ForegroundColor Yellow

Assert-Test "Receptionist Checks In Patient" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:appointmentId)/check-in" -Method Patch -Headers $adminHeaders
    if ($res.status -ne "MENUNGGU") { throw "Status should be MENUNGGU, got: $($res.status)" }
}

Assert-Test "Doctor Calls Patient Into Exam Room" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:appointmentId)/call" -Method Patch -Headers $dokterHeaders
    if ($res.status -ne "SEDANG_DIPERIKSA") { throw "Status should be SEDANG_DIPERIKSA, got: $($res.status)" }
}

# -------------------------------------------------------------------
# 4. Clinical Encounter / Medical Record Creation (SOAP & Prescriptions)
# -------------------------------------------------------------------
Write-Host "`n--- Clinical SOAP & Medical Record Creation ---" -ForegroundColor Yellow

$medicalRecordId = $null

Assert-Test "Doctor Creates Clinical Medical Record with Full SOAP, Vital Signs & Prescriptions" {
    $body = @{
        kunjunganId = $script:appointmentId
        patientId = $script:patientId
        staffId = $script:practitionerId
        serviceId = $script:serviceId
        sourceIntakeId = $script:intakeId
        flowType = "pregnancy"
        motherNik = "3201234567890001"
        partnerNik = "3201234567890002"
        subjective = "Pasien mengeluh mual dan muntah > 5 kali sehari, pusing, nafsu makan menurun."
        objectiveNotes = "Keadaan umum tampak lemah, turgor kulit baik, mata tidak cekung, abdomen supel."
        vitalSigns = @{
            systolic = 110
            diastolic = 70
            heartRate = 82
            respiratoryRate = 20
            temperature = 36.7
            weightKg = 54.5
            heightCm = 160
            oxygenSaturation = 99
            consciousness = "Compos Mentis"
        }
        diagnosis = "Hiperemesis Gravidarum Tingkat 1"
        diagnosisIcd10Code = "O21.0"
        diagnosisIcd10Name = "Mild hyperemesis gravidarum"
        tindakan = "Pemeriksaan Leopold, USG Kandungan Trimester 1, dan Edukasi Nutrisi"
        resepObat = "Vitamin B6 3x1 tablet, Ondansetron 4mg 2x1 tablet (bila mual hebat)"
        prescriptions = @(
            @{
                namaObat = "Pyridoxine HCl (Vit B6) 10mg"
                jumlah = 30
                satuan = "tablet"
                aturanPakai = "3x1 tablet sesudah makan"
                catatan = "Minum rutin setiap 8 jam"
            },
            @{
                namaObat = "Ondansetron 4mg"
                jumlah = 10
                satuan = "tablet"
                aturanPakai = "2x1 tablet bila mual hebat"
                catatan = "Maksimal 2 kali sehari bila perlu"
            }
        )
        catatanMedis = "Makan porsi kecil tapi sering. Hindari makanan pedas dan berminyak. Kontrol 1 minggu."
        formData = @{
            hpht = "2026-01-10"
            tfu = "Belum teraba"
            djj = "148 bpm (terdengar via Doppler)"
        }
        computedData = @{
            usiaKehamilanMinggu = 10
            skorPoedjiRochjati = 2
            kategoriRisiko = "KRR"
        }
        status = "completed"
    } | ConvertTo-Json -Depth 10

    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records" -Method Post -Headers $dokterHeaders -Body $body
    if (-not $res.id) { throw "Failed to create medical record" }
    if ($res.patientId -ne $script:patientId) { throw "Patient ID mismatch" }
    if ($res.diagnosisIcd10Code -ne "O21.0") { throw "ICD-10 code mismatch" }
    if (-not $res.prescriptions -or $res.prescriptions.Count -ne 2) { throw "Expected 2 prescription items" }
    if (-not $res.vitalSigns -or $res.vitalSigns.systolic -ne 110) { throw "Vital signs systolic mismatch" }
    $script:medicalRecordId = $res.id
    Write-Host "   -> Created Medical Record ID: $($res.id)" -ForegroundColor Gray
    Write-Host "   -> Diagnosis: $($res.diagnosis) [ICD-10: $($res.diagnosisIcd10Code)]" -ForegroundColor Gray
}

# -------------------------------------------------------------------
# 5. Queries & Relation Hydration Verification
# -------------------------------------------------------------------
Write-Host "`n--- Record Retrieval & Relation Hydration ---" -ForegroundColor Yellow

Assert-Test "Get Medical Record By ID (Hydrated Patient & Doctor)" {
    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/$($script:medicalRecordId)" -Method Get -Headers $dokterHeaders
    if ($res.id -ne $script:medicalRecordId) { throw "Record ID mismatch" }
    if (-not $res.patient -or -not $res.patient.fullName) { throw "Patient profile relation missing" }
    if (-not $res.prescriptions -or $res.prescriptions[0].namaObat -notmatch "Pyridoxine") { throw "Prescriptions not properly hydrated" }
    Write-Host "   -> Patient Hydrated: $($res.patient.fullName) (RM: $($res.patient.medicalRecordNumber))" -ForegroundColor Gray
    Write-Host "   -> Doctor Hydrated: $($res.practitioner.fullName)" -ForegroundColor Gray
}

Assert-Test "Get Medical Record by Kunjungan / Appointment ID" {
    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/kunjungan/$($script:appointmentId)" -Method Get -Headers $dokterHeaders
    if ($res.id -ne $script:medicalRecordId) { throw "Record ID mismatch" }
    if ($res.kunjunganId -ne $script:appointmentId) { throw "Appointment ID mismatch" }
}

Assert-Test "Get Medical Records by Patient ID" {
    $records = Invoke-RestMethod -Uri "$baseUrl/medical-records/patient/$($script:patientId)" -Method Get -Headers $dokterHeaders
    if (-not $records -or $records.Count -lt 1) { throw "Expected at least 1 record" }
    $found = $records | Where-Object { $_.id -eq $script:medicalRecordId }
    if (-not $found) { throw "Created record not found in patient history" }
}

Assert-Test "Patient Views Own Medical History (GET /medical-records/me)" {
    $records = Invoke-RestMethod -Uri "$baseUrl/medical-records/me" -Method Get -Headers $pasienHeaders
    if (-not $records -or $records.Count -lt 1) { throw "Patient should see own medical records" }
    $found = $records | Where-Object { $_.id -eq $script:medicalRecordId }
    if (-not $found) { throw "Encounter not found in patient's /me history" }
    Write-Host "   -> Patient successfully accessed own $($records.Count) medical records" -ForegroundColor Gray
}

# -------------------------------------------------------------------
# 6. Doctor Updates Diagnosis & Adds Prescription (PATCH /diagnosis)
# -------------------------------------------------------------------
Write-Host "`n--- Doctor Updates Diagnosis & Prescriptions ---" -ForegroundColor Yellow

Assert-Test "Doctor Updates Diagnosis & Prescriptions" {
    $patchBody = @{
        diagnosis = "Hiperemesis Gravidarum Grade 1 (Membaik)"
        diagnosisIcd10Code = "O21.0"
        diagnosisIcd10Name = "Mild hyperemesis gravidarum"
        tindakan = "Pemeriksaan Leopold, USG Kandungan, Konseling Gizi & Hidrasi"
        resepObat = "Vitamin B6 3x1 tablet, Ondansetron 4mg 2x1 tablet (PRN), Antasida DOEN 3x1 kunyah"
        prescriptions = @(
            @{
                namaObat = "Pyridoxine HCl 10mg"
                jumlah = 30
                satuan = "tablet"
                aturanPakai = "3x1 tablet sesudah makan"
            },
            @{
                namaObat = "Antasida DOEN"
                jumlah = 10
                satuan = "tablet kunyah"
                aturanPakai = "3x1 tablet dikunyah 1 jam sebelum makan"
                catatan = "Bila perih lambung"
            }
        )
        catatanMedis = "Pasien tampak lebih segar, muntah berkurang. Lanjutkan terapi."
    } | ConvertTo-Json -Depth 5

    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records/$($script:medicalRecordId)/diagnosis" -Method Patch -Headers $dokterHeaders -Body $patchBody
    if ($res.diagnosis -notmatch "Membaik") { throw "Diagnosis was not updated" }
    if ($res.prescriptions.Count -ne 2) { throw "Prescriptions count mismatch" }
    if ($res.prescriptions[1].namaObat -ne "Antasida DOEN") { throw "Second prescription item mismatch" }
    Write-Host "   -> Updated Diagnosis: $($res.diagnosis)" -ForegroundColor Gray
    Write-Host "   -> Prescriptions: $($res.prescriptions[0].namaObat), $($res.prescriptions[1].namaObat)" -ForegroundColor Gray
}

# -------------------------------------------------------------------
# 7. General Encounters, Pagination & Search Filter
# -------------------------------------------------------------------
Write-Host "`n--- Pagination & Search Filters ---" -ForegroundColor Yellow

$generalRecordId = $null

Assert-Test "Create General Medical Record (Poliklinik Umum)" {
    $body = @{
        patientId = $script:patientId
        staffId = $script:practitionerId
        flowType = "general"
        subjective = "Pasien mengeluh nyeri ulu hati dan mual sejak 2 hari."
        objectiveNotes = "Epigastric tenderness (+), peristaltik usus normal."
        vitalSigns = @{
            systolic = 120
            diastolic = 80
            heartRate = 78
            temperature = 36.5
        }
        diagnosis = "Gastritis Akut"
        diagnosisIcd10Code = "K29.1"
        diagnosisIcd10Name = "Other acute gastritis"
        tindakan = "Pemeriksaan fisik abdomen dan edukasi pola makan"
        resepObat = "Omeprazole 20mg 2x1 sebelum makan, Sukralfat sirup 3x1 Cth"
        status = "completed"
    } | ConvertTo-Json -Depth 5

    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records" -Method Post -Headers $dokterHeaders -Body $body
    if (-not $res.id) { throw "Failed to create general record" }
    $script:generalRecordId = $res.id
    Write-Host "   -> Created General Encounter ID: $($res.id)" -ForegroundColor Gray
}

Assert-Test "Search Medical Records by Keyword ('Gastritis')" {
    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records?search=Gastritis" -Method Get -Headers $adminHeaders
    if (-not $res.data -or $res.total -lt 1) { throw "Search should return matching records" }
    $found = $res.data | Where-Object { $_.diagnosis -match "Gastritis" }
    if (-not $found) { throw "Expected matching Gastritis record in results" }
    Write-Host "   -> Search found $($res.total) records matching 'Gastritis'" -ForegroundColor Gray
}

Assert-Test "List Medical Records with Pagination" {
    $res = Invoke-RestMethod -Uri "$baseUrl/medical-records?page=1&limit=5" -Method Get -Headers $adminHeaders
    if ($res.page -ne 1) { throw "Page mismatch" }
    if ($res.limit -ne 5) { throw "Limit mismatch" }
    if ($res.total -lt 2) { throw "Expected at least 2 records total" }
    Write-Host "   -> Total records: $($res.total), returned: $($res.data.Count)" -ForegroundColor Gray
}

# -------------------------------------------------------------------
# 8. Complete Appointment & Cleanup Test
# -------------------------------------------------------------------
Write-Host "`n--- Complete Appointment & Record Deletion ---" -ForegroundColor Yellow

Assert-Test "Doctor Completes Appointment" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:appointmentId)/complete" -Method Patch -Headers $dokterHeaders
    if ($res.status -ne "SELESAI") { throw "Status should be SELESAI, got: $($res.status)" }
    Write-Host "   -> Appointment completed, status: $($res.status)" -ForegroundColor Gray
}

Assert-Test "Admin Deletes General Medical Record (DELETE /medical-records/:id)" {
    $res = Invoke-WebRequest -Uri "$baseUrl/medical-records/$($script:generalRecordId)" -Method Delete -Headers $adminHeaders -UseBasicParsing
    if ($res.StatusCode -ne 204) { throw "Expected HTTP 204, got $($res.StatusCode)" }
}

Assert-Test "Verify Deleted Record Returns 404" {
    try {
        Invoke-RestMethod -Uri "$baseUrl/medical-records/$($script:generalRecordId)" -Method Get -Headers $adminHeaders
        throw "Record should have been deleted"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 404) {
            throw "Expected 404, got $($_.Exception.Response.StatusCode.value__)"
        }
    }
}

# -------------------------------------------------------------------
# 9. Role-Based Security Checks
# -------------------------------------------------------------------
Write-Host "`n--- Security & Role Enforcement ---" -ForegroundColor Yellow

Assert-Test "Security: Patient Cannot Create Medical Records (Forbidden 403)" {
    try {
        $body = @{ patientId = $script:patientId; flowType = "general" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$baseUrl/medical-records" -Method Post -Headers $pasienHeaders -Body $body
        throw "Patient should not be allowed to create medical record"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 403) {
            throw "Expected 403 Forbidden, got $($_.Exception.Response.StatusCode.value__)"
        }
    }
}

Assert-Test "Security: Unauthenticated Request Fails (401 Unauthorized)" {
    try {
        Invoke-RestMethod -Uri "$baseUrl/medical-records" -Method Get
        throw "Unauthenticated request should fail"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -ne 401) {
            throw "Expected 401 Unauthorized, got $($_.Exception.Response.StatusCode.value__)"
        }
    }
}

# -------------------------------------------------------------------
# Summary Report
# -------------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " PHASE 3 TEST SUMMARY" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Total Tests : $totalTests"
Write-Host " Passed      : $passedTests" -ForegroundColor Green
Write-Host " Failed      : $failedTests" -ForegroundColor $(if ($failedTests -eq 0) { "Green" } else { "Red" })

if ($failedTests -gt 0) {
    exit 1
} else {
    Write-Host "`n ALL PHASE 3 MEDICAL RECORD TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
    exit 0
}
