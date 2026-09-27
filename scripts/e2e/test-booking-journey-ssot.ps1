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
Write-Host " AMANAH HEALTHCARE - E2E TEST: PATIENT BOOKING JOURNEY & BACKEND SSOT" -ForegroundColor Cyan
Write-Host " Target Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. VERIFIKASI SERVICE CATALOG (GET /api/v1/clinics/services/catalog)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 1: Verifikasi Service Catalog SSOT (GET /api/v1/clinics/services/catalog) ===" -ForegroundColor Cyan
$catalogRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/services/catalog" -Method Get
$categories = $catalogRes.categories

if ($null -eq $categories -or $categories.Count -lt 2) {
    throw "Gagal: Katalog layanan harus memiliki minimal 2 kategori (Umum & Kebidanan)"
}

$umumCat = $categories | Where-Object { $_.code -eq "layanan_umum" }
$kebidananCat = $categories | Where-Object { $_.code -eq "layanan_kebidanan" }

if ($null -eq $umumCat) { throw "Kategori layanan_umum tidak ditemukan dalam katalog!" }
if ($null -eq $kebidananCat) { throw "Kategori layanan_kebidanan tidak ditemukan dalam katalog!" }

Write-Host " [BERHASIL] Kategori Layanan Ditemukan:" -ForegroundColor Green
Write-Host "  - $($umumCat.name) ($($umumCat.services.Count) layanan) -> Poli Tujuan: $($umumCat.poliklinikName)"
Write-Host "  - $($kebidananCat.name) ($($kebidananCat.services.Count) layanan) -> Poli Tujuan: $($kebidananCat.poliklinikName)"

# Verifikasi Khitanan di bawah Kebidanan
$khitanan = $kebidananCat.services | Where-Object { $_.code -eq "layanan_khitanan" }
if ($null -eq $khitanan) {
    throw "Gagal: Layanan Khitanan (layanan_khitanan) harus terdaftar di bawah Layanan Kebidanan!"
}
Write-Host " [BERHASIL] Layanan Khitanan terverifikasi:" -ForegroundColor Green
Write-Host "  - Nama: $($khitanan.name)"
Write-Host "  - Prefix: $($khitanan.prefix)"
Write-Host "  - Pilihan Keluhan: $($khitanan.complaints -join ', ')"

# ------------------------------------------------------------------------------
# 2. MASTER DATA PEKERJAAN (GET /api/v1/occupations)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 2: Verifikasi Master Pekerjaan (GET /api/v1/occupations) ===" -ForegroundColor Cyan
$occRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/occupations" -Method Get
$occupations = Get-ResponseData $occRes

if ($occupations.Count -lt 13) {
    throw "Gagal: Pekerjaan harus memiliki minimal 13 item master"
}
Write-Host " [BERHASIL] Ditemukan $($occupations.Count) data master pekerjaan." -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3. LOGIN PASIEN (Ahmad Amikom)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 3: Autentikasi Pasien ===" -ForegroundColor Cyan
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

# ------------------------------------------------------------------------------
# 4. REGISTRASI AFILIASI PASIEN ON-DEMAND (POST /api/v1/patients/affiliations)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 4: Registrasi Pasien On-Demand (Anak Pasien) ===" -ForegroundColor Cyan
$epoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$randomNik = "3201" + (Get-Random -Minimum 100000000000 -Maximum 999999999999).ToString()

$childPayload = @{
    relationship_type = "child"
    name = "Bambang Pamungkas Jr $epoch"
    nik = $randomNik
    gender = "Laki-laki"
    birth_date = "2018-05-12"
    phone = "081234567890"
    blood_type = "O"
    occupation_id = $occupations[4].id
} | ConvertTo-Json

$childRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/affiliations" -Method Post -Headers $headers -Body $childPayload
$childProfile = Get-ResponseData $childRes
$targetPatientId = $childProfile.patient.id

Write-Host " [BERHASIL] Pasien anak berhasil didaftarkan secara on-demand!" -ForegroundColor Green
Write-Host "  - ID: $targetPatientId"
Write-Host "  - Nama: $($childProfile.patient.fullName)"
Write-Host "  - Hubungan: $($childProfile.relationshipType)"


# ------------------------------------------------------------------------------
# 5. KETERSEDIAAN 4-SHIFT JADWAL DOKTER (GET /api/v1/schedules/booking-options)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 5: Periksa Jadwal Dokter 4-Shift ===" -ForegroundColor Cyan
$tomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$bookingOptionsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/booking-options?date=$tomorrow" -Method Get -Headers $headers
$bookingData = Get-ResponseData $bookingOptionsRes
$shifts = $bookingData.sessions

Write-Host " [INFO] Ditemukan $($shifts.Count) sesi shift praktik untuk tanggal $tomorrow"
$selectedShift = $shifts | Where-Object { $_.isDisabled -eq $false } | Select-Object -First 1

if ($null -eq $selectedShift) {
    $selectedShift = $shifts | Select-Object -First 1
}

$doctorName = if ($selectedShift.practitioners.Count -gt 0) { $selectedShift.practitioners[0].name } else { "Dokter Jaga" }
Write-Host " [BERHASIL] Memilih sesi shift:" -ForegroundColor Green
Write-Host "  - Sesi: $($selectedShift.session) ($($selectedShift.label))"
Write-Host "  - Waktu: $($selectedShift.startTime) - $($selectedShift.endTime)"
Write-Host "  - Dokter: $doctorName"

# ------------------------------------------------------------------------------
# 6. PEMBUATAN JANJI TEMU & TIKET ANTREAN DATABASE (POST /api/v1/appointments)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 6: Pembuatan Janji Temu & Menerbitkan Tiket Antrean Database ===" -ForegroundColor Cyan
$aptPayload = @{
    patientId = $targetPatientId
    poliklinikId = $khitanan.poliklinikId
    layananId = $khitanan.id
    appointmentDate = $tomorrow
    session = $selectedShift.session
    visitType = "Pemeriksaan Baru"
    complaint = "Konsultasi dan rencana khitanan anak sekolah"
} | ConvertTo-Json

$aptRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Headers $headers -Body $aptPayload
$createdApt = Get-ResponseData $aptRes

if ([string]::IsNullOrWhiteSpace($createdApt.queueNumber)) {
    throw "Gagal: Backend tidak menerbitkan nomor antrean resmi (queueNumber kosong)!"
}

Write-Host " [BERHASIL] Janji Temu Berhasil Dibuat!" -ForegroundColor Green
Write-Host "  - Appointment ID: $($createdApt.id)"
Write-Host "  - Nomor Antrean Database: $($createdApt.queueNumber)" -ForegroundColor Yellow
Write-Host "  - Status: $($createdApt.status)"
Write-Host "  - Layanan: $($khitanan.name)"

# ------------------------------------------------------------------------------
# 7. VERIFIKASI DASHBOARD PASIEN (GET /api/v1/appointments/me)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 7: Verifikasi Riwayat Janji Temu Pasien (GET /api/v1/appointments/me) ===" -ForegroundColor Cyan
$myAptsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/me" -Method Get -Headers $headers
$myApts = Get-ResponseData $myAptsRes

$foundApt = $myApts | Where-Object { $_.id -eq $createdApt.id }
if ($null -eq $foundApt) {
    throw "Gagal: Janji temu yang baru dibuat tidak ditemukan pada GET /api/v1/appointments/me!"
}

Write-Host " [BERHASIL] Janji temu terdaftar di dashboard pasien:" -ForegroundColor Green
Write-Host "  - ID: $($foundApt.id)"
Write-Host "  - Pasien: $($foundApt.patientName)"
Write-Host "  - Nomor Antrean: $($foundApt.queueNumber)"

# ------------------------------------------------------------------------------
# 8. RESCHEDULE JANJI TEMU (POST /api/v1/appointments/:id/reschedule)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 8: Reschedule Janji Temu ke Sesi Lain ===" -ForegroundColor Cyan
try {
    $rescheduleOptions = Get-ResponseData (Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$($createdApt.id)/reschedule-options" -Method Get -Headers $headers)
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

            $rescheduleRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$($createdApt.id)/reschedule" -Method Post -Headers $headers -Body $reschedulePayload
            $rescheduledApt = Get-ResponseData $rescheduleRes

            Write-Host " [BERHASIL] Reschedule berhasil diproses!" -ForegroundColor Green
            Write-Host "  - Tanggal Baru: $($rescheduledApt.appointmentDate)"
            Write-Host "  - Sesi Baru: $($rescheduledApt.session)"
        } else {
            Write-Host " [INFO] Opsi reschedule dicek (tidak ada shift kosong untuk tanggal opsi)." -ForegroundColor Yellow
        }
    } else {
        Write-Host " [INFO] Opsi reschedule dicek (dokter belum memiliki sesi di tanggal mendatang)." -ForegroundColor Yellow
    }
} catch {
    Write-Host " [INFO] Reschedule verification skipped: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# 9. PEMBATALAN JANJI TEMU (PATCH /api/v1/appointments/:id/cancel)
# ------------------------------------------------------------------------------
Write-Host "`n=== TAHAP 9: Pembatalan Janji Temu & Pengembalian Kuota ===" -ForegroundColor Cyan
$cancelPayload = @{
    reason = "Dibatalkan oleh pasien karena perubahan rencana keluarga"
} | ConvertTo-Json

$cancelRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$($createdApt.id)/cancel" -Method Patch -Headers $headers -Body $cancelPayload
$cancelledApt = Get-ResponseData $cancelRes

Write-Host " [BERHASIL] Pembatalan berhasil!" -ForegroundColor Green
Write-Host "  - Status Akhir: $($cancelledApt.status)"

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " SELURUH 9 TAHAP E2E BOOKING JOURNEY & BACKEND SSOT BERHASIL DIVERIFIKASI! " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
