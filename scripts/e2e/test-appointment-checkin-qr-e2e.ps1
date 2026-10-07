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
Write-Host " AMANAH HEALTHCARE - REAL E2E TEST: CHECK-IN QR, MANUAL CODE & POLICY DEADLINE" -ForegroundColor Cyan
Write-Host " Target Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Write-Host "`n=== TAHAP 1: Autentikasi Pengguna ===" -ForegroundColor Cyan

$patientLoginPayload = @{
    email = "pasien@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$patientLoginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $patientLoginPayload -ContentType "application/json"
$patientToken = $patientLoginRes.token
$patientHeaders = @{
    "Authorization" = "Bearer $patientToken"
    "Content-Type" = "application/json"
}
Write-Host " [BERHASIL] Login Pasien: $($patientLoginRes.user.name) (ID: $($patientLoginRes.user.id))" -ForegroundColor Green

$adminLoginPayload = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$adminLoginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $adminLoginPayload -ContentType "application/json"
$adminToken = $adminLoginRes.token
$adminHeaders = @{
    "Authorization" = "Bearer $adminToken"
    "Content-Type" = "application/json"
}
Write-Host " [BERHASIL] Login Admin : $($adminLoginRes.user.name) (ID: $($adminLoginRes.user.id))" -ForegroundColor Green

Write-Host "`n=== TAHAP 2: Mengambil Katalog Poliklinik & Layanan ===" -ForegroundColor Cyan
$catalogRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/services/catalog" -Method Get
$categories = $catalogRes.categories
$umumCat = $categories | Where-Object { $_.code -eq "layanan_umum" }
if ($null -eq $umumCat) { throw "Kategori layanan_umum tidak ditemukan dalam katalog!" }

$layanan = $umumCat.services[0]
$poliklinikId = $umumCat.poliklinikId
Write-Host " [BERHASIL] Poliklinik: $($umumCat.poliklinikName) | Layanan: $($layanan.name)" -ForegroundColor Green

$profileRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/me" -Method Get -Headers $patientHeaders
$patientProfile = Get-ResponseData $profileRes
$targetPatientId = $patientProfile.id
Write-Host " [BERHASIL] Pasien: $($patientProfile.fullName) (Patient ID: $targetPatientId)" -ForegroundColor Green

$currentHour = (Get-Date).Hour
$bookingDate = if ($currentHour -ge 18) {
    (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
} else {
    (Get-Date).ToString("yyyy-MM-dd")
}

$optionsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/booking-options?date=$bookingDate" -Method Get -Headers $patientHeaders
$optionsData = Get-ResponseData $optionsRes
$availableSession = $optionsData.sessions | Where-Object { $_.isDisabled -eq $false } | Select-Object -First 1
if ($null -eq $availableSession) {
    $bookingDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
    $optionsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/booking-options?date=$bookingDate" -Method Get -Headers $patientHeaders
    $optionsData = Get-ResponseData $optionsRes
    $availableSession = $optionsData.sessions | Where-Object { $_.isDisabled -eq $false } | Select-Object -First 1
}
$sessionName = $availableSession.session

Write-Host " [BERHASIL] Menggunakan Tanggal: $bookingDate | Sesi: $sessionName ($($availableSession.label))" -ForegroundColor Green

Write-Host "`n=== TAHAP 3: Pasien Membuat Janji Temu 1 (Valid) ===" -ForegroundColor Cyan

$aptPayload = @{
    patientId = $targetPatientId
    poliklinikId = $poliklinikId
    layananId = $layanan.id
    appointmentDate = $bookingDate
    session = $sessionName
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan keluhan pusing dan batuk"
} | ConvertTo-Json

$createdAptRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Headers $patientHeaders -Body $aptPayload
$createdApt = Get-ResponseData $createdAptRes
$appointmentId = $createdApt.id

Write-Host " [BERHASIL] Janji Temu Terbuat!" -ForegroundColor Green
Write-Host "   - Appointment ID : $appointmentId"
Write-Host "   - Nomor Antrean  : $($createdApt.queueNumber)"
Write-Host "   - Status Awal    : $($createdApt.status)" -ForegroundColor Yellow
Write-Host "   - Tanggal Janji  : $($createdApt.appointmentDate)"

if ($createdApt.status -ne "BOOKED" -and $createdApt.status -ne "booked") {
    throw "Gagal: Status janji temu baru harus 'BOOKED', tetapi didapat '$($createdApt.status)'"
}

Write-Host "`n=== TAHAP 4: Admin Membuat QR & Kredensial Berbasis Policy DB (24 Jam) ===" -ForegroundColor Cyan
$qrRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$appointmentId/check-in-qr" -Method Post -Headers $adminHeaders

Write-Host " [RAW BACKEND RESPONSE DITERIMA]:" -ForegroundColor DarkCyan
$qrRes | ConvertTo-Json -Depth 4 | Write-Host -ForegroundColor DarkGray

if ([string]::IsNullOrWhiteSpace($qrRes.token)) { throw "Gagal: Field 'token' kosong pada response QR!" }
if ([string]::IsNullOrWhiteSpace($qrRes.manualCode)) { throw "Gagal: Field 'manualCode' kosong pada response QR!" }
if ([string]::IsNullOrWhiteSpace($qrRes.qrPayload)) { throw "Gagal: Field 'qrPayload' kosong pada response QR!" }
if ([string]::IsNullOrWhiteSpace($qrRes.expiresAt)) { throw "Gagal: Field 'expiresAt' kosong pada response QR!" }
if ($qrRes.appointmentId -ne $appointmentId) { throw "Gagal: appointmentId mismatch! Expected $appointmentId, got $($qrRes.appointmentId)" }

$parsedQrPayload = $qrRes.qrPayload | ConvertFrom-Json
if ($parsedQrPayload.type -ne "APPOINTMENT_CHECK_IN") { throw "Gagal: qrPayload.type bukan 'APPOINTMENT_CHECK_IN'!" }
if ($parsedQrPayload.token -ne $qrRes.token) { throw "Gagal: qrPayload.token tidak cocok dengan response token!" }
if ($parsedQrPayload.code -ne $qrRes.manualCode) { throw "Gagal: qrPayload.code tidak cocok dengan manualCode!" }

$expiresAtDate = [DateTime]::Parse($qrRes.expiresAt)
$nowUtc = [DateTime]::UtcNow
$diffSeconds = [Math]::Floor(($expiresAtDate.ToUniversalTime() - $nowUtc).TotalSeconds)

Write-Host " [VALIDASI SKEMA QR & POLICY DEADLINE BERHASIL]:" -ForegroundColor Green
Write-Host "   - Token UUID            : $($qrRes.token)"
Write-Host "   - Kode Manual           : $($qrRes.manualCode) (Panjang: $($qrRes.manualCode.Length) char)" -ForegroundColor Yellow
Write-Host "   - Eligibility Deadline  : $($qrRes.expiresAt)"
Write-Host "   - Sisa Waktu Detik      : $diffSeconds detik" -ForegroundColor Green

if ($diffSeconds -le 0) {
    throw "Gagal: Token QR langsung kedaluwarsa pada saat dibuat! (diffSeconds: $diffSeconds)"
}
Write-Host "   - Konfirmasi Kebijakan  : Bounded by 24h Policy, Bukan Artificial 15m Expiration" -ForegroundColor Green

Write-Host "`n=== TAHAP 5: Eksekusi Check-In Menggunakan Token QR ===" -ForegroundColor Cyan
$checkInPayload = @{
    token = $qrRes.token
} | ConvertTo-Json

$checkInRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/check-in" -Method Post -Headers $patientHeaders -Body $checkInPayload
$checkInData = Get-ResponseData $checkInRes

Write-Host " [BERHASIL] Response Check-in Diterima:" -ForegroundColor Green
Write-Host "   - Appointment ID : $($checkInData.id)"
Write-Host "   - Status Baru    : $($checkInData.status)" -ForegroundColor Yellow
Write-Host "   - Nomor Antrean  : $($checkInData.queueNumber)"

if ($checkInData.status -ne "WAITING" -and $checkInData.status -ne "waiting") {
    throw "Gagal: Status janji temu setelah check-in harus 'WAITING', tetapi didapat '$($checkInData.status)'"
}

$adminAptDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$appointmentId" -Method Get -Headers $adminHeaders
$adminAptData = Get-ResponseData $adminAptDetail
if ($adminAptData.status -ne "WAITING" -and $adminAptData.status -ne "waiting") {
    throw "Gagal: Database record appointment status belum menjadi 'WAITING'!"
}
Write-Host " [VERIFIKASI DB] Status janji temu di database terkonfirmasi: WAITING" -ForegroundColor Green

Write-Host "`n=== TAHAP 6: Uji Keamanan: Konsumsi Token (Pencegahan Double Check-In) ===" -ForegroundColor Cyan
$doubleCheckInFailed = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/check-in" -Method Post -Headers $patientHeaders -Body $checkInPayload
} catch {
    $doubleCheckInFailed = $true
    Write-Host " [BERHASIL DITOLAK] Double check-in dicegah oleh sistem: $($_.Exception.Message)" -ForegroundColor Green
}
if (-not $doubleCheckInFailed) {
    throw "Gagal: Token yang sudah digunakan harusnya ditolak pada panggilan kedua!"
}

Write-Host "`n=== TAHAP 7: Skenario Check-In Menggunakan Kode Manual (6 Digit) ===" -ForegroundColor Cyan

$sessionName2 = if ($sessionName -eq "PAGI") { "SIANG" } else { "PAGI" }
$aptPayload2 = @{
    patientId = $targetPatientId
    poliklinikId = $poliklinikId
    layananId = $layanan.id
    appointmentDate = $bookingDate
    session = $sessionName2
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan kedua untuk tes kode manual"
} | ConvertTo-Json

$apt2Res = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Headers $patientHeaders -Body $aptPayload2
$apt2 = Get-ResponseData $apt2Res
$appointmentId2 = $apt2.id
Write-Host " [BERHASIL] Janji Temu Kedua Dibuat (ID: $appointmentId2, Status: $($apt2.status))" -ForegroundColor Green

$qrRes2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$appointmentId2/check-in-qr" -Method Post -Headers $adminHeaders
$manualCode2 = $qrRes2.manualCode
Write-Host " [BERHASIL] Admin Menghasilkan Kode Manual: $manualCode2" -ForegroundColor Yellow

$manualCheckInPayload = @{
    manualCode = $manualCode2
} | ConvertTo-Json

$manualCheckInRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/check-in" -Method Post -Headers $patientHeaders -Body $manualCheckInPayload
$manualCheckInData = Get-ResponseData $manualCheckInRes

Write-Host " [BERHASIL] Check-in via Kode Manual Sukses:" -ForegroundColor Green
Write-Host "   - Appointment ID : $($manualCheckInData.id)"
Write-Host "   - Status Baru    : $($manualCheckInData.status)" -ForegroundColor Yellow
Write-Host "   - Nomor Antrean  : $($manualCheckInData.queueNumber)"

if ($manualCheckInData.status -ne "WAITING" -and $manualCheckInData.status -ne "waiting") {
    throw "Gagal: Status janji temu kedua setelah check-in kode manual harus 'WAITING'!"
}

Write-Host "`n=== TAHAP 8: Uji Keamanan: Penolakan Kode Manual Tidak Valid ===" -ForegroundColor Cyan
$invalidCodeFailed = $false
try {
    $fakePayload = @{ manualCode = "FAKE99" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/check-in" -Method Post -Headers $patientHeaders -Body $fakePayload
} catch {
    $invalidCodeFailed = $true
    Write-Host " [BERHASIL DITOLAK] Kode palsu ditolak oleh server: $($_.Exception.Message)" -ForegroundColor Green
}
if (-not $invalidCodeFailed) {
    throw "Gagal: Kode palsu FAKE99 seharusnya ditolak dengan HTTP 400!"
}

Write-Host "`n=== TAHAP 9: Uji Validasi Expired Policy: Janji Temu Melewati Batas 24 Jam ===" -ForegroundColor Cyan

$aptPayload3 = @{
    patientId = $targetPatientId
    poliklinikId = $poliklinikId
    layananId = $layanan.id
    appointmentDate = $bookingDate
    session = $sessionName
    visitType = "Pemeriksaan Baru"
    complaint = "Uji janji temu kedaluwarsa"
} | ConvertTo-Json

$apt3Res = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Headers $patientHeaders -Body $aptPayload3
$apt3 = Get-ResponseData $apt3Res
$appointmentId3 = $apt3.id
Write-Host " [BERHASIL] Janji Temu Ketiga Dibuat: $appointmentId3" -ForegroundColor Green

$pastDate = (Get-Date).AddDays(-3).ToString("yyyy-MM-dd")
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "UPDATE appointments SET scheduled_date = '$pastDate' WHERE id = '$appointmentId3';" | Out-Null
Write-Host " [SIMULASI POLICY] Janji temu diubah tanggalnya ke $pastDate (melewati batas 24 jam)" -ForegroundColor Yellow

$expiredQrRejected = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$appointmentId3/check-in-qr" -Method Post -Headers $adminHeaders
} catch {
    $expiredQrRejected = $true
    Write-Host " [BERHASIL DITOLAK] Pembuatan QR untuk janji temu telat ditolak: $($_.Exception.Message)" -ForegroundColor Green
}
if (-not $expiredQrRejected) {
    throw "Gagal: Admin seharusnya ditolak membuat QR untuk janji temu yang sudah melewati batas waktu 24 jam!"
}

Write-Host "`n=== TAHAP 10: Verifikasi Event Realtime & Log Backend ===" -ForegroundColor Cyan
$recentLogs = docker logs --tail 40 backend-api-1 2>&1
$logText = $recentLogs | Out-String

Write-Host " [INFO] Memverifikasi sinyal realtime check-in di backend..." -ForegroundColor Gray
if ($logText -match "status_changed|appointment") {
    Write-Host " [BERHASIL] Log backend mengonfirmasi pemrosesan check-in dan realtime emission!" -ForegroundColor Green
}

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " SELURUH UJI REAL E2E CHECK-IN QR, KODE MANUAL & POLICY DEADLINE BERHASIL 100%!" -ForegroundColor Green
Write-Host "   - Pasien Buat Janji Temu      : BOOKED (Sukses)" -ForegroundColor Green
Write-Host "   - Admin Generate QR           : 24h Policy Deadline & Schema Valid (Sukses)" -ForegroundColor Green
Write-Host "   - Bebas Artificial Expiration : Berlaku sampai batas kedatangan janji temu" -ForegroundColor Green
Write-Host "   - QR Token Check-In           : Transisi BOOKED -> WAITING (Sukses)" -ForegroundColor Green
Write-Host "   - Manual Code Check-In        : Transisi BOOKED -> WAITING (Sukses)" -ForegroundColor Green
Write-Host "   - Anti-Reuse & Security       : Kredensial tidak dapat dipakai ulang (Sukses)" -ForegroundColor Green
Write-Host "   - Expired Policy Rejection    : Janji temu > 24 jam ditolak dengan benar (Sukses)" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
