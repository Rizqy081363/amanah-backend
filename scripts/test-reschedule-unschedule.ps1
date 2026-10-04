$ErrorActionPreference = "Stop"

$login = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/auth/email/login" -Method Post -Body (@{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"

$headers = @{
    Authorization = "Bearer $($login.token)"
    "Content-Type" = "application/json"
}

$doctorId = "f996d696-30c8-4fcf-ba77-babfd7c36dca"
$date = "2026-10-04"

$detail = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/${doctorId}?date=${date}" -Headers $headers

# Pasien saat ini berada di 22:00. Cari sesi 22:00:
$targetSession = $detail.data.sesi_harian | Where-Object { $_.jam_mulai -le "22:00" -and $_.jam_selesai -ge "22:30" } | Select-Object -First 1

Write-Host "Target sesi: $($targetSession.id) ($($targetSession.jam_mulai)-$($targetSession.jam_selesai))" -ForegroundColor Cyan

# Pindahkan pasien dari 22:00 ke 22:30 dengan unscheduleSourceSlot = $false (slot asal tetap Available/Hijau)
$payload = @{
    targetDate = $date
    targetStartTime = "22:30"
    sourceStartTime = "22:00"
    notes = "Pindahkan pasien dari 22:00 ke 22:30 dengan unscheduleSourceSlot = false"
    rescheduleActiveAppointments = $true
    unscheduleSourceSlot = $false
} | ConvertTo-Json

Write-Host "`nEksekusi reschedule: 22:00 -> 22:30 dengan unscheduleSourceSlot = false..." -ForegroundColor Yellow
$res = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/$doctorId/sessions/$($targetSession.id)/reschedule" -Method Post -Headers $headers -Body $payload

Write-Host "Hasil: $($res.message)" -ForegroundColor Green

# Fetch detail terbaru
$detailUpdated = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/doctor-schedules/${doctorId}?date=${date}" -Headers $headers

Write-Host "`n=== Timeline Intervals Setelah Reschedule (22:00 - 23:00) ===" -ForegroundColor Cyan
$detailUpdated.data.timeline_intervals | Where-Object { $_.startTime -in @("22:00", "22:30") } | ForEach-Object {
    Write-Host " - Slot $($_.startTime)-$($_.endTime): status=$($_.status), uiStatus=$($_.uiStatus), uiLabel=$($_.uiLabel), availabilityState=$($_.availabilityState), isOccupied=$($_.isOccupied), patient=$($_.patientInfo.patientName)"
}
