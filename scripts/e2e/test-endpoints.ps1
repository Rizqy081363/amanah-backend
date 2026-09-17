# PowerShell TDD Test Suite for Amanah Healthcare Backend API
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

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  AMANAH HEALTHCARE BACKEND - POWERSHELL TDD SUITE" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# ----------------------------------------------------
# 1. AUTH LOGIN TESTS
# ----------------------------------------------------
Write-Host "`n--- 1. Authentication and RBAC Login Tests ---" -ForegroundColor Yellow

$adminToken = $null
Assert-Test "Admin Login (admin@amanah.com)" {
    $body = @{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No token returned in response" }
    $script:adminToken = $res.token
}

$dokterToken = $null
Assert-Test "Dokter Login (dokter@amanah.com)" {
    $body = @{ email = "dokter@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No token returned in response" }
    $script:dokterToken = $res.token
}

$pasienToken = $null
Assert-Test "Pasien Login (pasien@amanah.com)" {
    $body = @{ email = "pasien@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No token returned in response" }
    $script:pasienToken = $res.token
}

$adminHeaders = @{ Authorization = "Bearer $adminToken" }
$dokterHeaders = @{ Authorization = "Bearer $dokterToken" }
$pasienHeaders = @{ Authorization = "Bearer $pasienToken" }

# ----------------------------------------------------
# 2. POLIKLINIK DAN LAYANAN (REDIS CACHE-ASIDE TEST)
# ----------------------------------------------------
Write-Host "`n--- 2. Master Poliklinik dan Layanan (with Redis) ---" -ForegroundColor Yellow

$poliUmumId = $null
$poliKiaId = $null

Assert-Test "Fetch Active Clinics (Poli Umum dan Poli KIA with Redis caching)" {
    $clinics = Invoke-RestMethod -Uri "$baseUrl/clinics" -Method Get -Headers $pasienHeaders
    if ($clinics.Count -lt 2) { throw "Expected at least 2 clinics, got $($clinics.Count)" }
    
    $poliUmum = $clinics | Where-Object { $_.kodePoli -eq "POLI-UMUM" }
    $poliKia = $clinics | Where-Object { $_.kodePoli -eq "POLI-KIA" }
    
    if (-not $poliUmum) { throw "POLI-UMUM not found" }
    if (-not $poliKia) { throw "POLI-KIA not found" }
    
    $script:poliUmumId = $poliUmum.id
    $script:poliKiaId = $poliKia.id
}

$layananUmumId = $null
Assert-Test "Fetch Layanan Poli Umum" {
    $layanan = Invoke-RestMethod -Uri "$baseUrl/clinics/$poliUmumId/layanan" -Method Get -Headers $pasienHeaders
    if ($layanan.Count -lt 1) { throw "No layanan found for Poli Umum" }
    $script:layananUmumId = $layanan[0].id
}

# ----------------------------------------------------
# 3. PASIEN DAN NIK LOOKUP
# ----------------------------------------------------
Write-Host "`n--- 3. Patient Profile and NIK Lookup ---" -ForegroundColor Yellow

$patientId = $null
Assert-Test "Patient views self profile (/patients/me)" {
    $profile = Invoke-RestMethod -Uri "$baseUrl/patients/me" -Method Get -Headers $pasienHeaders
    if ($profile.nik -ne "3201234567890001") { throw "NIK mismatch: expected 3201234567890001, got $($profile.nik)" }
    $script:patientId = $profile.id
}

Assert-Test "Dokter looks up Patient by NIK (/patients/by-nik/{nik})" {
    $patient = Invoke-RestMethod -Uri "$baseUrl/patients/by-nik/3201234567890001" -Method Get -Headers $dokterHeaders
    if ($patient.fullName -ne "Dewi Lestari") { throw "Expected Dewi Lestari, got $($patient.fullName)" }
}

# ----------------------------------------------------
# 4. STAFF DAN DIGITAL ID CARD
# ----------------------------------------------------
Write-Host "`n--- 4. Staff Profile and Digital ID ---" -ForegroundColor Yellow

Assert-Test "Dokter views self profile (/staffs/me) with Digital ID" {
    $staff = Invoke-RestMethod -Uri "$baseUrl/staffs/me" -Method Get -Headers $dokterHeaders
    if ($staff.idCardNumber -ne "DOC-AMANAH-001") { throw "ID Card Number mismatch: expected DOC-AMANAH-001, got $($staff.idCardNumber)" }
    if ($staff.profession -ne "Dokter Umum") { throw "Profession mismatch: expected Dokter Umum, got $($staff.profession)" }
}

# ----------------------------------------------------
# 5. ANTREAN DAN KUNJUNGAN (LIFECYCLE)
# ----------------------------------------------------
Write-Host "`n--- 5. Appointment and Queue Lifecycle ---" -ForegroundColor Yellow

$appointmentId = $null
$todayDate = (Get-Date).ToString("yyyy-MM-dd")

Assert-Test "Pasien creates Appointment for Poli Umum (Session PAGI)" {
    $body = @{
        patientId = $patientId
        poliklinikId = $poliUmumId
        layananId = $layananUmumId
        appointmentDate = $todayDate
        session = "PAGI"
        visitType = "Pemeriksaan Baru"
        complaint = "Demam dan flu selama 2 hari"
    } | ConvertTo-Json
    
    $apt = Invoke-RestMethod -Uri "$baseUrl/appointments" -Method Post -Body $body -ContentType "application/json" -Headers $pasienHeaders
    if (-not $apt.queueNumber) { throw "No queue number generated" }
    if ($apt.status -ne "SUDAH_BUAT_JANJI") { throw "Status expected SUDAH_BUAT_JANJI, got $($apt.status)" }
    $script:appointmentId = $apt.id
    Write-Host "   -> Auto-Generated Queue Number: $($apt.queueNumber)" -ForegroundColor Gray
}

Assert-Test "Dokter views Daily Queue for Poli Umum" {
    $queueUrl = "$baseUrl/appointments/queue/daily?poliklinikId=" + $poliUmumId + "&date=" + $todayDate
    $queue = Invoke-RestMethod -Uri $queueUrl -Method Get -Headers $dokterHeaders
    if ($queue.Count -lt 1) { throw "No daily queue items found" }
}

Assert-Test "Dokter calls Patient into Examination Room (/appointments/{id}/call)" {
    $called = Invoke-RestMethod -Uri "$baseUrl/appointments/$appointmentId/call" -Method Patch -Headers $dokterHeaders
    if ($called.status -ne "SEDANG_DIPERIKSA") { throw "Status expected SEDANG_DIPERIKSA, got $($called.status)" }
}

# ----------------------------------------------------
# 6. REKAM MEDIS KUNJUNGAN
# ----------------------------------------------------
Write-Host "`n--- 6. Medical Record Recording ---" -ForegroundColor Yellow

$medicalRecordId = $null
Assert-Test "Dokter records Medical Record and Prescription" {
    $body = @{
        kunjunganId = $appointmentId
        patientId = $patientId
        flowType = "general"
        diagnosis = "ISPA (Infeksi Saluran Pernapasan Akut)"
        tindakan = "Pemeriksaan fisik TTV, tes saturasi oksigen"
        resepObat = "Paracetamol 500mg 3x1, Amoxicillin 500mg 3x1, Vitamin C 1x1"
        catatanMedis = "Banyak istirahat dan minum air hangat"
    } | ConvertTo-Json
    
    $mr = Invoke-RestMethod -Uri "$baseUrl/medical-records" -Method Post -Body $body -ContentType "application/json" -Headers $dokterHeaders
    if ($mr.diagnosis -ne "ISPA (Infeksi Saluran Pernapasan Akut)") { throw "Diagnosis mismatch" }
    $script:medicalRecordId = $mr.id
}

Assert-Test "Fetch Medical Record by Kunjungan ID" {
    $record = Invoke-RestMethod -Uri "$baseUrl/medical-records/kunjungan/$appointmentId" -Method Get -Headers $dokterHeaders
    if ($record.resepObat -notmatch "Paracetamol") { throw "Prescription missing" }
}

Assert-Test "Dokter completes Appointment (/appointments/{id}/complete)" {
    $completed = Invoke-RestMethod -Uri "$baseUrl/appointments/$appointmentId/complete" -Method Patch -Headers $dokterHeaders
    if ($completed.status -ne "SELESAI") { throw "Status expected SELESAI, got $($completed.status)" }
}

# ----------------------------------------------------
# 7. STAFF ATTENDANCE (PRESENSI QR CODE)
# ----------------------------------------------------
Write-Host "`n--- 7. Staff Attendance (QR Presensi) ---" -ForegroundColor Yellow

Assert-Test "Dokter scans QR Code for Attendance (/attendance/scan)" {
    $body = @{
        shift = "PAGI"
        qrToken = "AMANAH-PRESENSI-2026-TOKEN-XYZ"
        deviceInfo = "Samsung Galaxy S23 (Staff Mobile App)"
    } | ConvertTo-Json
    
    $att = Invoke-RestMethod -Uri "$baseUrl/attendance/scan" -Method Post -Body $body -ContentType "application/json" -Headers $dokterHeaders
    if ($att.status -ne "HADIR") { throw "Attendance status expected HADIR, got $($att.status)" }
}

Assert-Test "Dokter views own Attendance History (/attendance/my-history)" {
    $history = Invoke-RestMethod -Uri "$baseUrl/attendance/my-history" -Method Get -Headers $dokterHeaders
    if ($history.Count -lt 1) { throw "Attendance history is empty" }
}

Assert-Test "Admin views Daily Attendance Recap (/attendance/daily)" {
    $dailyUrl = "$baseUrl/attendance/daily?date=" + $todayDate
    $daily = Invoke-RestMethod -Uri $dailyUrl -Method Get -Headers $adminHeaders
    if ($daily.Count -lt 1) { throw "Daily attendance recap is empty" }
}

# ----------------------------------------------------
# 8. STAFF LEAVES (CUTI DAN APPROVAL)
# ----------------------------------------------------
Write-Host "`n--- 8. Staff Leave and Admin Approval ---" -ForegroundColor Yellow

$leaveId = $null
Assert-Test "Dokter requests Leave (/leaves)" {
    $body = @{
        startDate = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")
        endDate = (Get-Date).AddDays(9).ToString("yyyy-MM-dd")
        reason = "Menghadiri seminar IDI di Surabaya"
    } | ConvertTo-Json
    
    $leave = Invoke-RestMethod -Uri "$baseUrl/leaves" -Method Post -Body $body -ContentType "application/json" -Headers $dokterHeaders
    if ($leave.status -ne "MENUNGGU_KONFIRMASI") { throw "Expected MENUNGGU_KONFIRMASI, got $($leave.status)" }
    $script:leaveId = $leave.id
}

Assert-Test "Admin reviews and approves Leave (/leaves/{id}/status)" {
    $body = @{
        status = "DISETUJUI"
        approvalNotes = "Disetujui. Harap pastikan ada dokter pengganti jadwal."
    } | ConvertTo-Json
    
    $approved = Invoke-RestMethod -Uri "$baseUrl/leaves/$leaveId/status" -Method Patch -Body $body -ContentType "application/json" -Headers $adminHeaders
    if ($approved.status -ne "DISETUJUI") { throw "Expected status DISETUJUI, got $($approved.status)" }
}

# ----------------------------------------------------
# SUMMARY
# ----------------------------------------------------
Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "                TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Total Tests Run : $totalTests"
Write-Host "Passed          : $passedTests" -ForegroundColor Green
Write-Host "Failed          : $failedTests" -ForegroundColor $(if ($failedTests -eq 0) { "Green" } else { "Red" })

if ($failedTests -eq 0) {
    Write-Host "`n🎉 ALL API ENDPOINTS TESTED AND PASSED 100% SUCCESSFULLY!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n❌ SOME TESTS FAILED!" -ForegroundColor Red
    exit 1
}
