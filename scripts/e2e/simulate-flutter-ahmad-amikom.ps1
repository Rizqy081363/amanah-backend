param (
    [ValidateSet("confirm", "cancel", "telat", "hangus", "all", "interactive")]
    [string]$Scenario = "interactive",
    [string]$baseUrl = "http://127.0.0.1:3001"
)

# ==============================================================================
# AMANAH HEALTHCARE - SIMULATOR FEEDBACK PASIEN AHMAD AMIKOM (FLUTTER CLIENT READY)
# Skenario: Confirm (Hadir), Cancel (Batal), dan Telat (Requeue / No-Show Terminal)
# ==============================================================================

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::Expect100Continue = $false

$userEmail = "zikriahmadamikom@gmail.com"
$userPassword = "secret123"

# ------------------------------------------------------------------------------
# HELPER FUNCTIONS
# ------------------------------------------------------------------------------
function Get-AhmadAuth {
    $loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
        email = $userEmail
        password = $userPassword
    } | ConvertTo-Json) -ContentType "application/json"
    return @{
        token = $loginRes.token
        headers = @{ "Authorization" = "Bearer $($loginRes.token)" }
        userId = $loginRes.user.id
    }
}

function Get-DoctorAuth {
    $loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
        email = "dokter@amanah.com"
        password = "secret123"
    } | ConvertTo-Json) -ContentType "application/json"
    return @{
        token = $loginRes.token
        headers = @{ "Authorization" = "Bearer $($loginRes.token)" }
    }
}

function Create-AhmadAppointment([hashtable]$patientAuth, [string]$complaintText) {
    $clinics = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics" -Method Get
    $poli = $clinics[0]
    $layananList = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/$($poli.id)/layanan" -Method Get
    $layanan = $layananList[0]
    $bookingDate = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")

    $payload = @{
        poliklinikId    = $poli.id
        layananId       = $layanan.id
        appointmentDate = $bookingDate
        session         = "PAGI"
        complaint       = $complaintText
    } | ConvertTo-Json

    $apt = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Body $payload -ContentType "application/json" -Headers $patientAuth.headers
    return @{
        appointment = $apt
        poliId = $poli.id
        bookingDate = $bookingDate
    }
}

# ------------------------------------------------------------------------------
# SKENARIO 1: CONFIRM / HADIR (Panggil -> Konfirmasi Hadir -> Selesai)
# ------------------------------------------------------------------------------
function Run-ScenarioConfirm {
    Write-Host "`n==============================================================================" -ForegroundColor Green
    Write-Host " [SKENARIO 1: CONFIRM / HADIR]" -ForegroundColor Green
    Write-Host " Alur: Dokter Memanggil -> Ahmad Amikom Hadir -> Konsultasi Selesai" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green

    $patientAuth = Get-AhmadAuth
    $doctorAuth = Get-DoctorAuth

    Write-Host "1. Menerbitkan Tiket Antrean Pasien..." -ForegroundColor Cyan
    $created = Create-AhmadAppointment $patientAuth "Simulasi Flutter: Pasien Datang Tepat Waktu (Confirm)"
    $apt = $created.appointment
    $aptId = $apt.id
    Write-Host "   -> Antrean: $($apt.queueNumber) | ID: $aptId | Durasi: $($apt.estimatedDurationMinutes)m" -ForegroundColor Yellow

    Write-Host "2. Dokter Memanggil Pasien (Trigger Event: appointment.patient_called.v1)..." -ForegroundColor Cyan
    $callRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan loket 1" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorAuth.headers
    Write-Host "   -> Status Tiket: $($callRes.status) | Percobaan: $($callRes.attemptNumber)/$($callRes.maxAttempts)" -ForegroundColor Yellow
    Write-Host "   -> [FEEDBACK FLUTTER]: Aplikasi Flutter Ahmad Amikom memicu ringtone panggilan & modal pop-up!" -ForegroundColor Magenta

    Write-Host "3. Pasien Mengonfirmasi Hadir / Masuk Ruangan (POST /respond)..." -ForegroundColor Cyan
    $respondRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/respond" -Method Post -Headers $doctorAuth.headers
    Write-Host "   -> Status Sekarang: $($respondRes.status) (Sedang Diperiksa)" -ForegroundColor Yellow
    Write-Host "   -> [FEEDBACK FLUTTER]: Layar antrean berganti status menjadi 'Sedang Berlangsung'." -ForegroundColor Magenta

    Write-Host "4. Dokter Menyelesaikan Konsultasi (PATCH /complete)..." -ForegroundColor Cyan
    $finishRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/complete" -Method Patch -Headers $doctorAuth.headers
    Write-Host "   -> Status Akhir: $($finishRes.status) (SELESAI)" -ForegroundColor Yellow
    Write-Host "   -> [FEEDBACK FLUTTER]: Kunjungan pindah ke Riwayat Pasien dengan badge Hijau (completed)." -ForegroundColor Magenta
    Write-Host " [SELESAI] Skenario Confirm berhasil disimulasikan 100%!`n" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# SKENARIO 2: CANCEL / BATAL (Pasien Membatalkan Janji Temu)
# ------------------------------------------------------------------------------
function Run-ScenarioCancel {
    Write-Host "`n==============================================================================" -ForegroundColor Yellow
    Write-Host " [SKENARIO 2: CANCEL / BATAL]" -ForegroundColor Yellow
    Write-Host " Alur: Buat Janji Temu -> Pasien Membatalkan Janji Temu -> Slot Dipulihkan" -ForegroundColor Yellow
    Write-Host "==============================================================================" -ForegroundColor Yellow

    $patientAuth = Get-AhmadAuth

    Write-Host "1. Menerbitkan Tiket Antrean Pasien..." -ForegroundColor Cyan
    $created = Create-AhmadAppointment $patientAuth "Simulasi Flutter: Pembatalan Janji Temu (Cancel)"
    $apt = $created.appointment
    $aptId = $apt.id
    Write-Host "   -> Antrean: $($apt.queueNumber) | ID: $aptId | Status Awal: $($apt.status)" -ForegroundColor Yellow

    Write-Host "2. Pasien Membatalkan Janji Temu (PATCH /appointments/:id/cancel)..." -ForegroundColor Cyan
    $cancelBody = @{ reason = "Ada keperluan mendesak dari Ahmad Amikom via Flutter" } | ConvertTo-Json
    $cancelRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/cancel" -Method Patch -Body $cancelBody -ContentType "application/json" -Headers $patientAuth.headers
    Write-Host "   -> Status Baru: $($cancelRes.status) (BATAL / cancelled)" -ForegroundColor Yellow
    Write-Host "   -> Alasan     : $($cancelRes.cancellationReason)" -ForegroundColor Yellow
    Write-Host "   -> [FEEDBACK FLUTTER]: Tiket antrean di beranda ditutup/dibatalkan." -ForegroundColor Magenta
    Write-Host "   -> [FEEDBACK FLUTTER]: Di riwayat pasien muncul badge Merah/Abu-abu (cancelled)." -ForegroundColor Magenta
    Write-Host " [SELESAI] Skenario Cancel berhasil disimulasikan 100%!`n" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# SKENARIO 3: TELAT / REQUEUE (Pasien Tidak Respons Panggilan 1 -> Digeser ke Belakang)
# ------------------------------------------------------------------------------
function Run-ScenarioTelatRequeue {
    Write-Host "`n==============================================================================" -ForegroundColor Cyan
    Write-Host " [SKENARIO 3: TELAT / REQUEUE]" -ForegroundColor Cyan
    Write-Host " Alur: Dokter Panggil 1x -> Pasien Belum Datang -> Dokter No-Show -> Requeue" -ForegroundColor Cyan
    Write-Host "==============================================================================" -ForegroundColor Cyan

    $patientAuth = Get-AhmadAuth
    $doctorAuth = Get-DoctorAuth

    Write-Host "1. Menerbitkan Tiket Antrean Pasien..." -ForegroundColor Cyan
    $created = Create-AhmadAppointment $patientAuth "Simulasi Flutter: Pasien Telat Panggilan Pertama (Requeue)"
    $apt = $created.appointment
    $aptId = $apt.id
    Write-Host "   -> Antrean: $($apt.queueNumber) | ID: $aptId" -ForegroundColor Yellow

    Write-Host "2. Dokter Memanggil Pasien Pertama Kali..." -ForegroundColor Cyan
    $call1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan 1" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorAuth.headers
    Write-Host "   -> Panggilan Ke-1 Terkirim. Status: $($call1.status)" -ForegroundColor Yellow

    Write-Host "3. Pasien Telat / Tidak Datang -> Dokter Tandai No-Show (POST /no-show)..." -ForegroundColor Cyan
    $noShowRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Body (@{ notes = "Pasien belum terlihat di ruang tunggu" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorAuth.headers
    Write-Host "   -> Requeued           : $($noShowRes.requeued)" -ForegroundColor Yellow
    Write-Host "   -> Sisa Kesempatan    : $($noShowRes.remainingAttempts)x lagi" -ForegroundColor Yellow
    Write-Host "   -> Status Antrean     : $($noShowRes.status) (Kembali Menunggu)" -ForegroundColor Yellow
    Write-Host "   -> [FEEDBACK FLUTTER]: Notifikasi Masuk: 'Antrean Digeser ke Belakang'." -ForegroundColor Magenta
    Write-Host "   -> [FEEDBACK FLUTTER]: UI menampilkan countdown/peringatan sisa 2x kesempatan." -ForegroundColor Magenta
    Write-Host " [SELESAI] Skenario Telat & Requeue berhasil disimulasikan 100%!`n" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# SKENARIO 4: TELAT 3x / HANGUS (Pasien Telat 3x Berturut-Turut -> Terminal No-Show)
# ------------------------------------------------------------------------------
function Run-ScenarioTelatHangus {
    Write-Host "`n==============================================================================" -ForegroundColor Red
    Write-Host " [SKENARIO 4: TELAT 3X / HANGUS (TERMINAL NO-SHOW)]" -ForegroundColor Red
    Write-Host " Alur: Panggil 3x Tanpa Respons -> Status Hangus Total (No-Show)" -ForegroundColor Red
    Write-Host "==============================================================================" -ForegroundColor Red

    $patientAuth = Get-AhmadAuth
    $doctorAuth = Get-DoctorAuth

    Write-Host "1. Menerbitkan Tiket Antrean Pasien..." -ForegroundColor Cyan
    $created = Create-AhmadAppointment $patientAuth "Simulasi Flutter: Pasien Telat 3x Hangus (Terminal No-Show)"
    $apt = $created.appointment
    $aptId = $apt.id
    Write-Host "   -> Antrean: $($apt.queueNumber) | ID: $aptId" -ForegroundColor Yellow

    # Panggilan 1
    Write-Host "2. Panggilan Ke-1 -> Tidak Hadir -> Requeue (Sisa 2x)..." -ForegroundColor Cyan
    $null = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan 1" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorAuth.headers
    $ns1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Headers $doctorAuth.headers
    Write-Host "   -> Requeued: $($ns1.requeued) | Sisa: $($ns1.remainingAttempts)x" -ForegroundColor Yellow

    # Panggilan 2
    Write-Host "3. Panggilan Ke-2 -> Tidak Hadir -> Requeue (Sisa 1x)..." -ForegroundColor Cyan
    $null = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan 2" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorAuth.headers
    $ns2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Headers $doctorAuth.headers
    Write-Host "   -> Requeued: $($ns2.requeued) | Sisa: $($ns2.remainingAttempts)x" -ForegroundColor Yellow

    # Panggilan 3
    Write-Host "4. Panggilan Ke-3 (BATAS AKHIR) -> Masih Tidak Hadir..." -ForegroundColor Cyan
    $null = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan 3 Batas Akhir" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorAuth.headers
    $ns3 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Headers $doctorAuth.headers
    Write-Host "   -> Terminal No-Show : $($ns3.noShow)" -ForegroundColor Red
    Write-Host "   -> Status Janji Temu: $($ns3.status) (HANGUS / NO-SHOW)" -ForegroundColor Red
    Write-Host "   -> [FEEDBACK FLUTTER]: Notifikasi Masuk: 'Janji Temu Dibatalkan (Tidak Hadir)'." -ForegroundColor Magenta
    Write-Host "   -> [FEEDBACK FLUTTER]: Di riwayat pasien muncul badge 'no_show' dengan 3x Panggilan." -ForegroundColor Magenta
    Write-Host " [SELESAI] Skenario Telat 3x Hangus berhasil disimulasikan 100%!`n" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# DISPATCHER / CLI MENU
# ------------------------------------------------------------------------------
switch ($Scenario.ToLower()) {
    "confirm" {
        Run-ScenarioConfirm
    }
    "cancel" {
        Run-ScenarioCancel
    }
    "telat" {
        Run-ScenarioTelatRequeue
    }
    "hangus" {
        Run-ScenarioTelatHangus
    }
    "all" {
        Run-ScenarioConfirm
        Run-ScenarioCancel
        Run-ScenarioTelatRequeue
        Run-ScenarioTelatHangus
    }
    default {
        # Mode Interaktif
        Clear-Host
        Write-Host "==============================================================================" -ForegroundColor Cyan
        Write-Host " AMANAH HEALTHCARE - SIMULATOR REAL PATIENT FEEDBACK (FLUTTER)" -ForegroundColor Cyan
        Write-Host " User: Ahmadamikom Zikri (zikriahmadamikom@gmail.com)" -ForegroundColor Yellow
        Write-Host " Target API: $baseUrl" -ForegroundColor Gray
        Write-Host "==============================================================================" -ForegroundColor Cyan
        Write-Host "Pilih skenario yang ingin Anda picu ke aplikasi Flutter:" -ForegroundColor White
        Write-Host " [1] Skenario CONFIRM / HADIR (Panggil -> Pasien Hadir -> Konsultasi Selesai)"
        Write-Host " [2] Skenario CANCEL / BATAL  (Pasien Membatalkan Janji Temu)"
        Write-Host " [3] Skenario TELAT 1x        (Pasien Telat -> Digeser ke Belakang / Sisa 2x)"
        Write-Host " [4] Skenario TELAT 3x HANGUS (Pasien Telat 3x -> Hangus Total / No-Show)"
        Write-Host " [5] Jalankan SEMUA Skenario Sekaligus"
        Write-Host " [Q] Keluar"
        Write-Host "------------------------------------------------------------------------------"
        $choice = Read-Host "Masukkan pilihan Anda [1/2/3/4/5/Q]"

        switch ($choice) {
            "1" { Run-ScenarioConfirm }
            "2" { Run-ScenarioCancel }
            "3" { Run-ScenarioTelatRequeue }
            "4" { Run-ScenarioTelatHangus }
            "5" { 
                Run-ScenarioConfirm
                Run-ScenarioCancel
                Run-ScenarioTelatRequeue
                Run-ScenarioTelatHangus
            }
            default { Write-Host "Keluar dari simulator." -ForegroundColor Gray }
        }
    }
}
