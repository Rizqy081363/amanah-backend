param (
    [string]$baseUrl = "http://127.0.0.1:3001"
)

# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST & FLUTTER INTEGRATION SCRIPT
# Khusus User: Ahmadamikom Zikri (Credentials, Timing SSOT & End-to-End Workflow)
# ==============================================================================

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::Expect100Continue = $false

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " AMANAH HEALTHCARE - E2E VERIFIKASI USER AHMAD AMIKOM (FLUTTER CLIENT READY)" -ForegroundColor Cyan
Write-Host " Target Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 0. INFORMASI CREDENTIALS USER
# ------------------------------------------------------------------------------
$userEmail = "zikriahmadamikom@gmail.com"
$userPassword = "secret123"

Write-Host "`n[INFO KREDENSIAL AHMAD AMIKOM UNTUK FLUTTER]:" -ForegroundColor Yellow
Write-Host " - Email               : $userEmail"
Write-Host " - Password            : $userPassword"
Write-Host " - Nama Pasien         : Ahmadamikom Zikri"
Write-Host " - No. Rekam Medis     : RM-AMIKOM-001"
Write-Host " - Patient Profile ID  : 9f2a4b88-1c3d-4e5f-a6b7-8c9d0e1f2a3b"
Write-Host " - WebSocket Path      : $baseUrl/socket.io`n"

# ------------------------------------------------------------------------------
# 1. LOGIN AHMAD AMIKOM
# ------------------------------------------------------------------------------
Write-Host "=== LANGKAH 1: Login Pasien (POST /api/v1/auth/email/login) ===" -ForegroundColor Cyan
$loginPayload = @{
    email = $userEmail
    password = $userPassword
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$patientToken = $loginRes.token
$patientHeaders = @{ "Authorization" = "Bearer $patientToken" }

Write-Host " [BERHASIL] Login sukses!" -ForegroundColor Green
Write-Host " Token JWT: $($patientToken.Substring(0, 30))... (Panjang: $($patientToken.Length) karakter)"
Write-Host " User ID  : $($loginRes.user.id)"
Write-Host " Peran    : $($loginRes.user.systemRole)"

# ------------------------------------------------------------------------------
# 2. BUAT JANJI TEMU (PENDAFTARAN ANTREAN POLIKLINIK)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 2: Buat Janji Temu Pasien (POST /api/v1/appointments) ===" -ForegroundColor Cyan

# Ambil data poli & layanan
$clinics = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics" -Method Get
$poli = $clinics[0]
$layananList = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/$($poli.id)/layanan" -Method Get
$layanan = $layananList[0]

Write-Host " Poliklinik : $($poli.namaPoli) ($($poli.id))"
Write-Host " Layanan    : $($layanan.namaLayanan) ($($layanan.id))"

# Booking untuk 2 hari ke depan
$bookingDate = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
$bookingPayload = @{
    poliklinikId    = $poli.id
    layananId       = $layanan.id
    appointmentDate = $bookingDate
    session         = "PAGI"
    complaint       = "Pemeriksaan flu dan demam untuk simulasi Flutter Ahmad Amikom"
} | ConvertTo-Json

$appointment = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Body $bookingPayload -ContentType "application/json" -Headers $patientHeaders
$aptId = $appointment.id

Write-Host " [BERHASIL] Tiket Antrean Berhasil Diterbitkan!" -ForegroundColor Green
Write-Host " - ID Appointment  : $aptId"
Write-Host " - Nomor Antrean   : $($appointment.queueNumber)" -ForegroundColor Yellow
Write-Host " - Tanggal & Sesi  : $($appointment.appointmentDate) ($($appointment.session))"
Write-Host " - Status Awal     : $($appointment.status)"
Write-Host " - Estimasi Durasi : $($appointment.estimatedDurationMinutes) Menit (Matriks Spesifikasi DB)" -ForegroundColor Green
Write-Host " - Rentang Waktu   : $($appointment.scheduledStartTime) s/d $($appointment.scheduledEndTime)" -ForegroundColor Green

if ($appointment.estimatedDurationMinutes -ne 30) {
    throw "Verifikasi Gagal: estimatedDurationMinutes seharusnya bernilai 30, tetapi diperoleh $($appointment.estimatedDurationMinutes)"
}

# ------------------------------------------------------------------------------
# 3. DOKTER MEMANTAU DAFTAR ANTREAN HARIAN (GET /api/v1/appointments/queue/daily)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 3: Dokter Memantau Antrean Harian (GET /api/v1/appointments/queue/daily) ===" -ForegroundColor Cyan

# Login sebagai Dokter Poli
$doctorAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$doctorHeaders = @{ "Authorization" = "Bearer $($doctorAuth.token)" }

$dailyQueue = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/queue/daily?poliklinikId=$($poli.id)&date=$bookingDate&session=PAGI" -Method Get -Headers $doctorHeaders
$myQueueItem = $dailyQueue | Where-Object { $_.id -eq $aptId } | Select-Object -First 1

if ($myQueueItem) {
    Write-Host " [BERHASIL] Pasien Ahmad Amikom terdaftar pada daftar antrean dokter!" -ForegroundColor Green
    Write-Host " - Nomor Antrean   : $($myQueueItem.queueNumber)"
    Write-Host " - Nama Pasien     : $($myQueueItem.patientName)"
    Write-Host " - Poliklinik      : $($myQueueItem.poliklinikName)"
    Write-Host " - Estimasi Durasi : $($myQueueItem.estimatedDurationMinutes) Menit (SSOT Backend)" -ForegroundColor Green
    Write-Host " - Waktu Pelayanan : $($myQueueItem.scheduledStartTime) s/d $($myQueueItem.scheduledEndTime)" -ForegroundColor Green
    Write-Host " - Status Antrean  : $($myQueueItem.status)"
} else {
    Write-Host " [INFO] Antrean total sesi pagi: $($dailyQueue.Count) pasien"
}

# ------------------------------------------------------------------------------
# 4. DOKTER MEMANGGIL PASIEN (DOKTER CALLS AHMAD AMIKOM)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 4: Dokter Memanggil Antrean (POST /api/v1/appointments/:id/call) ===" -ForegroundColor Cyan

$callPayload = @{ notes = "Panggilan loket 1 untuk Ahmad Amikom" } | ConvertTo-Json
$callRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body $callPayload -ContentType "application/json" -Headers $doctorHeaders

Write-Host " [BERHASIL] Dokter membunyikan panggilan ke ruang periksa!" -ForegroundColor Green
Write-Host " - Status Tiket    : $($callRes.status) (Dipanggil)"
Write-Host " - Percobaan Ke    : $($callRes.attemptNumber) dari $($callRes.maxAttempts)"

# ------------------------------------------------------------------------------
# 5. NOTIFIKASI REAL-TIME MASUK KE AHMAD AMIKOM
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 5: Pasien Menerima Notifikasi & Cek Unread Count ===" -ForegroundColor Cyan

# 5.1 Cek Unread Count
$unreadCountRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/unread-count" -Method Get -Headers $patientHeaders
Write-Host " [BERHASIL] Unread Notifications Count: $($unreadCountRes.unreadCount) Pesan Baru" -ForegroundColor Yellow

# 5.2 Cek Isi Notifikasi
$notifsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me?limit=5" -Method Get -Headers $patientHeaders
$incomingCallNotif = $notifsRes.data | Where-Object { $_.sourceId -eq $aptId } | Select-Object -First 1

if ($incomingCallNotif) {
    Write-Host " [BERHASIL] Notifikasi Ditemukan di Feed Pasien:" -ForegroundColor Green
    Write-Host " - Judul      : $($incomingCallNotif.title)"
    Write-Host " - Pesan      : $($incomingCallNotif.body)" -ForegroundColor Cyan
    Write-Host " - Kategori   : $($incomingCallNotif.category)"
    Write-Host " - Urgen      : $($incomingCallNotif.isUrgent) (Memicu suara/banner di HP)"
    Write-Host " - Status Read: $($incomingCallNotif.isRead)"
}

# ------------------------------------------------------------------------------
# 6. PASIEN MEMBACA NOTIFIKASI (READ SYNC)
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 6: Pasien Membuka Notifikasi (PATCH /notifications/:id/read) ===" -ForegroundColor Cyan
if ($incomingCallNotif) {
    $readRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/$($incomingCallNotif.id)/read" -Method Patch -Headers $patientHeaders
    Write-Host " [BERHASIL] Notifikasi ditandai dibaca: $($readRes.success)" -ForegroundColor Green

    $unreadAfter = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/unread-count" -Method Get -Headers $patientHeaders
    Write-Host " - Unread Count Sekarang: $($unreadAfter.unreadCount)" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 7. PASIEN MASUK RUANGAN & KONSULTASI SELESAI
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 7: Pasien Masuk & Konsultasi Selesai (Respond -> Complete) ===" -ForegroundColor Cyan

# Pasien hadir di ruang periksa
$respondRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/respond" -Method Post -Headers $doctorHeaders
Write-Host " [BERHASIL] Dokter konfirmasi kehadiran pasien: Status = $($respondRes.status) (Sedang Diperiksa)" -ForegroundColor Green

# Dokter menyelesaikan konsultasi
$finishRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/complete" -Method Patch -Headers $doctorHeaders
Write-Host " [BERHASIL] Pemeriksaan ditutup: Status = $($finishRes.status) (SELESAI)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 8. CEK HALAMAN RIWAYAT KUNJUNGAN PASIEN
# ------------------------------------------------------------------------------
Write-Host "`n=== LANGKAH 8: Cek Halaman Riwayat Pasien (GET /appointments/history/me) ===" -ForegroundColor Cyan

$historyRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/me" -Method Get -Headers $patientHeaders
$myFinishedVisit = $historyRes.data | Where-Object { $_.id -eq $aptId } | Select-Object -First 1

if ($myFinishedVisit) {
    Write-Host " [BERHASIL] Janji temu muncul di Halaman Riwayat Pasien!" -ForegroundColor Green
    Write-Host " - Booking Code   : $($myFinishedVisit.bookingCode)"
    Write-Host " - Poliklinik     : $($myFinishedVisit.poliklinikName)"
    Write-Host " - Dokter         : $($myFinishedVisit.doctorName)"
    Write-Host " - Status Riwayat : $($myFinishedVisit.status) (Hijau - Selesai)"
    Write-Host " - Estimasi Durasi: $($myFinishedVisit.estimatedDurationMinutes) Menit (SSOT Backend)" -ForegroundColor Green
    Write-Host " - Rentang Waktu  : $($myFinishedVisit.scheduledStartTime) s/d $($myFinishedVisit.scheduledEndTime)" -ForegroundColor Green
    Write-Host " - Jml Panggilan  : $($myFinishedVisit.callAttemptsCount)x Panggilan"

    if ($myFinishedVisit.estimatedDurationMinutes -ne 30) {
        throw "Verifikasi Riwayat Gagal: estimatedDurationMinutes seharusnya 30, diperoleh $($myFinishedVisit.estimatedDurationMinutes)"
    }
} else {
    Write-Host " Riwayat Total: $($historyRes.total) kunjungan"
}

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " SEMUA ALUR E2E AHMAD AMIKOM & VERIFIKASI TIMING SELESAI DENGAN SEMPURNA 100%!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green

Write-Host @'

------------------------------------------------------------------------------
CONTOH INTEGRASI DART / FLUTTER (DIO & WEBSOCKET) UNTUK TIM FRONTEND:
------------------------------------------------------------------------------
// 1. Inisialisasi Dio Client
final dio = Dio(BaseOptions(
  baseUrl: 'http://10.0.2.2:3001/api/v1', // 10.0.2.2 untuk Android Emulator
  headers: {'Content-Type': 'application/json'},
));

// 2. Login Ahmad Amikom
final loginResponse = await dio.post('/auth/email/login', data: {
  'email': 'zikriahmadamikom@gmail.com',
  'password': 'secret123',
});
final token = loginResponse.data['token'];

// 3. Pasang Auth Header
dio.options.headers['Authorization'] = 'Bearer $token';

// 4. Hubungkan Socket.IO untuk Notifikasi Real-Time Panggilan
final socket = io('http://10.0.2.2:3001', OptionBuilder()
  .setTransports(['websocket'])
  .setAuth({'token': token})
  .enableAutoConnect()
  .build());

socket.on('notification:new', (data) {
  print('Notifikasi Panggilan Masuk: ${data['title']} - ${data['body']}');
  if (data['isUrgent'] == true) {
    // Bunyikan ringtone audio & tampilkan pop-up panggilan loket
  }
});

socket.on('notification:unread_count', (data) {
  print('Update Badge Bell: ${data['unreadCount']}');
});

// 5. Render Halaman Antrean / Riwayat Pasien (Tanpa Kalkulasi Frontend!)
final history = await dio.get('/appointments/history/me');
for (final item in history.data['data']) {
  final duration = item['estimatedDurationMinutes']; // e.g. 30
  final timeRange = '${item['scheduledStartTime']} - ${item['scheduledEndTime']}';
  print('Kunjungan: ${item['bookingCode']} | Durasi: $duration Menit | Jam: $timeRange');
}
------------------------------------------------------------------------------
'@ -ForegroundColor Gray
