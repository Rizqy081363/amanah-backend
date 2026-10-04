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
$roomId = "b77d141b-2fa5-4481-9f47-a5a040faf57a" # Ruang Poli Umum 1 (ruangan sesi dokter)

Write-Host "Menguji ketersediaan slot di Ruang Poli Umum 1 ($roomId)..." -ForegroundColor Cyan
$slotsRes = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/schedules/slot-availability?date=${date}&shift=night&roomId=${roomId}&staffId=${doctorId}" -Headers $headers

Write-Host "`nHasil Ketersediaan Slot (21:00 - 24:00):" -ForegroundColor Green
$slotsRes.data.slots | Where-Object { $_.time -ge "21:00" } | ForEach-Object {
    $color = if ($_.isAvailable) { "Green" } else { "Yellow" }
    Write-Host " - Slot $($_.time)-$($_.endTime): isAvailable=$($_.isAvailable), status=$($_.status), label=$($_.displayLabel), conflict=$($_.conflict.type)" -ForegroundColor $color
}
