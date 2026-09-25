$baseUrl = "http://localhost:3001"

$loginBody = @{
    email    = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$login = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody

$token = if ($login.token) { $login.token } else { $login.data.tokens.accessToken }
$headers = @{ Authorization = "Bearer $token" }

$res = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/c518facb-372e-4f07-9766-f3eacf54221f?date=2026-09-24" `
    -Method Get `
    -Headers $headers

$data = if ($res.data) { $res.data } else { $res }
$slot1730 = $data.timeline_intervals | Where-Object { $_.startTime -eq '17:30' }

Write-Host "KONDISI LIVE SLOT 17:30 - 18:00 PADA JAM SERVER SEKARANG:" -ForegroundColor Green
$slot1730 | ConvertTo-Json -Depth 5
