$ErrorActionPreference = "Stop"

Write-Host "=== 1. Login sebagai Admin ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/auth/email/login" -Method Post -Body (@{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"

$token = $login.token
$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
Write-Host "Login berhasil. Token diperoleh." -ForegroundColor Green

Write-Host "`n=== 2. Mengambil Detail Jadwal & Sesi Dokter Aktif ===" -ForegroundColor Cyan
$doctorId = "f996d696-30c8-4fcf-ba77-babfd7c36dca"
$date = "2026-10-04"

$detail = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/${doctorId}?date=${date}" -Headers $headers
$nightSession = $detail.data.sesi_harian | Where-Object { $_.jam_mulai -eq "18:00" } | Select-Object -First 1

if (-not $nightSession) {
    Write-Error "Sesi malam dokter tidak ditemukan!"
}
Write-Host "Sesi ditemukan: ID $($nightSession.id), Nama: $($nightSession.nama_sesi), Waktu: $($nightSession.waktu), Pasien Terdaftar: $($nightSession.pasien_terdaftar)" -ForegroundColor Green

Write-Host "`n=== 3. Mengecek Janji Temu Terdaftar di Tanggal $date ===" -ForegroundColor Cyan
# Saat ini pasien berada di 22:00. Pindahkan kembali penugasan pasien ke 21:30 (slot yang tersedia).
$sourceStartTime = "22:00"
$targetStartTime = "21:30"

$payload = @{
    targetDate = $date
    targetStartTime = $targetStartTime
    sourceStartTime = $sourceStartTime
    notes = "Pindah jadwal penugasan pasien dari $sourceStartTime ke $targetStartTime via PS1 test"
    rescheduleActiveAppointments = $true
} | ConvertTo-Json

Write-Host "Mengirim request reschedule: $sourceStartTime -> $targetStartTime..." -ForegroundColor Cyan
$rescheduleResult = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/$doctorId/sessions/$($nightSession.id)/reschedule" -Method Post -Headers $headers -Body $payload

Write-Host "`nHasil API Reschedule:" -ForegroundColor Green
Write-Host "Success: $($rescheduleResult.success)"
Write-Host "Message: $($rescheduleResult.message)"
Write-Host "Rescheduled Appointments Count: $($rescheduleResult.data.rescheduledAppointmentsCount)"
Write-Host "Session ID Tetap: $($rescheduleResult.data.sessionId)"

Write-Host "`n=== 4. Verifikasi State di Projection ===" -ForegroundColor Cyan
$intervals = $rescheduleResult.data.projection.intervals
$slot2130 = $intervals | Where-Object { $_.startTime -eq "21:30" }
$slot2200 = $intervals | Where-Object { $_.startTime -eq "22:00" }

Write-Host "Slot 21:30 Status: $($slot2130.status) (isOccupied: $($slot2130.isOccupied), Patient ApptId: $($slot2130.appointmentRef.appointmentId))" -ForegroundColor Yellow
Write-Host "Slot 22:00 Status: $($slot2200.status) (isOccupied: $($slot2200.isOccupied))" -ForegroundColor Yellow

if ($slot2130.isOccupied -eq $true -and $slot2200.isOccupied -eq $false) {
    Write-Host "`n>>> VERIFIKASI BERHASIL: Pasien berhasil dipindahkan kembali ke 21:30 dan slot 22:00 kembali kosong (tersedia) tanpa membuat sesi baru! <<<" -ForegroundColor Green
} else {
    Write-Error "Verifikasi gagal: slot state tidak sesuai ekspektasi!"
}
