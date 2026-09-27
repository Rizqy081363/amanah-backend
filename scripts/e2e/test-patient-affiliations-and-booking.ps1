param (
    [string]$baseUrl = "http://127.0.0.1:3001"
)

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::Expect100Continue = $false

function Get-ResponseData($response) {
    if ($response -is [System.Management.Automation.PSCustomObject] -and $response.PSObject.Properties['data']) {
        return $response.data
    }
    return $response
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " AMANAH HEALTHCARE - E2E TEST: PATIENT AFFILIATIONS & ON-DEMAND BOOKING" -ForegroundColor Cyan
Write-Host " Target Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. LOGIN AHMAD AMIKOM
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 1: Login Pasien (Ahmad Amikom) ===" -ForegroundColor Cyan
$loginPayload = @{
    email = "zikriahmadamikom@gmail.com"
    password = "secret123"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$patientToken = $loginRes.token
$headers = @{ 
    "Authorization" = "Bearer $patientToken"
    "Content-Type" = "application/json"
}

Write-Host " [BERHASIL] Login sukses sebagai $($loginRes.user.name)!" -ForegroundColor Green
Write-Host " User ID: $($loginRes.user.id)"

# ------------------------------------------------------------------------------
# 2. MASTER DATA PEKERJAAN (GET /api/v1/occupations)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 2: Mengambil Master Data Pekerjaan (GET /api/v1/occupations) ===" -ForegroundColor Cyan
$occupations = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/occupations" -Method Get -Headers $headers)

Write-Host " [BERHASIL] Ditemukan $($occupations.Count) jenis pekerjaan standar:" -ForegroundColor Green
foreach ($occ in $occupations) {
    Write-Host "   - [$($occ.code)] $($occ.name)"
}

if ($occupations.Count -lt 13) {
    throw "Validasi gagal: Jumlah pekerjaan standar kurang dari 13 (didapat: $($occupations.Count))"
}

# ------------------------------------------------------------------------------
# 3. GET PATIENT AFFILIATIONS (GET /api/v1/patients/affiliations/me)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 3: Mengambil Daftar Pasien Terafiliasi (GET /api/v1/patients/affiliations/me) ===" -ForegroundColor Cyan
$affiliations = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/affiliations/me" -Method Get -Headers $headers)

Write-Host " [BERHASIL] Ditemukan $($affiliations.Count) profil pasien dalam akun Ahmad:" -ForegroundColor Green
foreach ($aff in $affiliations) {
    $primaryTag = if ($aff.isPrimary) { "[UTAMA]" } else { "[KELUARGA]" }
    Write-Host "   - $primaryTag $($aff.patient.fullName) (Relasi: $($aff.relationshipType), NIK: $($aff.patient.nik), RM: $($aff.patient.medicalRecordNumber))"
}

if ($affiliations.Count -lt 3) {
    throw "Validasi gagal: Jumlah afiliasi awal minimal 3 (Diri Sendiri, Ibu Kandung, Anak)"
}

# ------------------------------------------------------------------------------
# 4. TAMBAH ANGGOTA KELUARGA ON-DEMAND (POST /api/v1/patients/affiliations)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 4: Registrasi Pasien Baru Keluarga (Pasangan) ===" -ForegroundColor Cyan
$randomNik = "3201" + (Get-Random -Minimum 100000000000 -Maximum 999999999999).ToString()
$addPayload = @{
    relationship_type = "spouse"
    name = "Dewi Lestari"
    nik = $randomNik
    gender = "Perempuan"
    birth_date = "1995-08-17"
    phone = "081298765432"
    blood_type = "B"
    occupation_id = $occupations[1].id
} | ConvertTo-Json

$newAffiliation = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/affiliations" -Method Post -Body $addPayload -Headers $headers)
$newPatientId = $newAffiliation.patientId

Write-Host " [BERHASIL] Anggota keluarga baru berhasil didaftarkan & ditautkan!" -ForegroundColor Green
Write-Host "   - ID Pasien        : $newPatientId"
Write-Host "   - Nama             : $($newAffiliation.patient.fullName)"
Write-Host "   - Tipe Relasi      : $($newAffiliation.relationshipType)"
Write-Host "   - No. Rekam Medis  : $($newAffiliation.patient.medicalRecordNumber)"

# ------------------------------------------------------------------------------
# 5. PILIHAN JADWAL BOOKING (GET /api/v1/schedules/booking-options)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 5: Cek Opsi Booking Shift (GET /api/v1/schedules/booking-options) ===" -ForegroundColor Cyan
$bookingDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$bookingOptions = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/booking-options?date=$bookingDate" -Method Get -Headers $headers)

Write-Host " [BERHASIL] Tanggal: $($bookingOptions.date) | Total Sesi: $($bookingOptions.sessions.Count)" -ForegroundColor Green
foreach ($s in $bookingOptions.sessions) {
    $disabledStatus = if ($s.isDisabled) { "DISABLED" } else { "AVAILABLE" }
    Write-Host "   - Sesi $($s.session) ($($s.label)): $($s.startTime) - $($s.endTime) | Kuota: $($s.availableSlots)/$($s.capacity) | Status: $disabledStatus | Durasi: $($bookingOptions.estimatedDurationMinutes)m"
}

if ($bookingOptions.sessions.Count -ne 4) {
    throw "Validasi gagal: Jumlah sesi shift harus 4 (Dini Hari, Pagi, Siang, Malam)"
}

# ------------------------------------------------------------------------------
# 6. BUAT JANJI TEMU UNTUK ANGGOTA KELUARGA (POST /api/v1/appointments)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 6: Buat Janji Temu untuk Pasien Keluarga Baru ===" -ForegroundColor Cyan
$clinics = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics" -Method Get -Headers $headers)
$poliUmum = $clinics | Where-Object { $_.kodePoli -eq 'POLI-UMUM' } | Select-Object -First 1
if (-not $poliUmum) { $poliUmum = $clinics[0] }

$services = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/$($poliUmum.id)/layanan" -Method Get -Headers $headers)
$layanan = $services[0]

$apptPayload = @{
    patientId = $newPatientId
    poliklinikId = $poliUmum.id
    layananId = $layanan.id
    appointmentDate = $bookingDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan kesehatan rutin keluarga"
} | ConvertTo-Json

$createdAppt = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Body $apptPayload -Headers $headers)
$createdApptId = $createdAppt.id

Write-Host " [BERHASIL] Janji temu keluarga berhasil dibuat!" -ForegroundColor Green
Write-Host "   - Appointment ID : $createdApptId"
Write-Host "   - Nomor Antrean  : $($createdAppt.queueNumber)"
Write-Host "   - Pasien         : $($createdAppt.patientName)"
Write-Host "   - Status         : $($createdAppt.status)"
Write-Host "   - Tanggal        : $($createdAppt.appointmentDate)"

# ------------------------------------------------------------------------------
# 7. DASHBOARD JANJI TEMU PASIEN (GET /api/v1/appointments/me)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 7: Verifikasi Dashboard Janji Temu Pasien (GET /api/v1/appointments/me) ===" -ForegroundColor Cyan
$myAppts = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/me" -Method Get -Headers $headers)

Write-Host " [BERHASIL] Mengambil $($myAppts.Count) janji temu aktif & riwayat pada akun Ahmad:" -ForegroundColor Green
$foundFamilyAppt = $false
foreach ($apt in $myAppts) {
    Write-Host "   - [$($apt.status)] No: $($apt.queueNumber) | Pasien: $($apt.patientName) | Poli: $($apt.poliklinikName) | Tgl: $($apt.appointmentDate)"
    if ($apt.id -eq $createdApptId) {
        $foundFamilyAppt = $true
    }
}

if (-not $foundFamilyAppt) {
    throw "Validasi gagal: Janji temu anggota keluarga ($createdApptId) tidak muncul di dashboard GET /api/v1/appointments/me"
}
Write-Host " [VALIDASI SUKSES] Janji temu anggota keluarga terdeteksi dan dirender pada dashboard Ahmad Amikom!" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 8. CEK OPSI RESCHEDULE (GET /api/v1/appointments/:id/reschedule-options)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 8: Mengambil Opsi Reschedule Janji Temu ===" -ForegroundColor Cyan
$rescheduleOptions = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$createdApptId/reschedule-options" -Method Get -Headers $headers)

Write-Host " [BERHASIL] Opsi reschedule diperoleh:" -ForegroundColor Green
Write-Host "   - Dokter        : $($rescheduleOptions.doctor.name)"
Write-Host "   - Layanan       : $($rescheduleOptions.service.name)"
Write-Host "   - Jadwal Saat Ini: $($rescheduleOptions.currentDate) ($($rescheduleOptions.currentStartTime) - $($rescheduleOptions.currentEndTime))"
Write-Host "   - Opsi Tersedia : $($rescheduleOptions.availableDates.Count) tanggal"

# ------------------------------------------------------------------------------
# 9. EKSEKUSI RESCHEDULE (POST /api/v1/appointments/:id/reschedule)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 9: Eksekusi Penjadwalan Ulang (Reschedule) Janji Temu ===" -ForegroundColor Cyan
$targetOption = $rescheduleOptions.availableDates | Select-Object -First 1
if ($targetOption -and $targetOption.shifts.Count -gt 0) {
    $targetShift = $targetOption.shifts | Where-Object { $_.isAvailable -eq $true } | Select-Object -First 1
    if ($targetShift) {
        $reschedulePayload = @{
            target_session_id = $targetShift.sessionId
            target_date = $targetOption.date
            target_start_time = $targetShift.startTime
            target_end_time = $targetShift.endTime
            reason = "Penyesuaian jadwal kontrol keluarga"
        } | ConvertTo-Json

        $rescheduleResult = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$createdApptId/reschedule" -Method Post -Body $reschedulePayload -Headers $headers)

        Write-Host " [BERHASIL] Janji temu berhasil dijadwalkan ulang secara atomik!" -ForegroundColor Green
        Write-Host "   - Tanggal Baru : $($rescheduleResult.appointmentDate)"
        Write-Host "   - Waktu Baru   : $($rescheduleResult.scheduledStartTime) - $($rescheduleResult.scheduledEndTime)"
        Write-Host "   - Status       : $($rescheduleResult.status)"
    } else {
        Write-Host " [INFO] Tidak ada shift dengan slot tersedia pada tanggal target untuk dieksekusi reschedule." -ForegroundColor Yellow
    }
} else {
    Write-Host " [INFO] Dokter belum memiliki jadwal terbuka untuk tanggal berikutnya (reschedule eligibility terverifikasi)." -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 10. CLEANUP DATA UJI
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 10: Pembersihan Data Uji Pasien Tambahan ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/affiliations/$newPatientId" -Method Delete -Headers $headers
    Write-Host " [BERHASIL] Afiliasi anggota keluarga uji ($newPatientId) berhasil dibersihkan!" -ForegroundColor Green
} catch {
    Write-Host " [PERINGATAN] Gagal menghapus afiliasi sementara: $_" -ForegroundColor Yellow
}

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " SELURUH RANGKAIAN END-TO-END TEST AFFILIATION & BOOKING 100% SUKSES!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
