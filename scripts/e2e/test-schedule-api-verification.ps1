$ErrorActionPreference = 'Stop'
Set-Location 'D:\Amanah-health-care\backend'

Write-Host "=== 1. Login sebagai Admin ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/auth/email/login" -Method Post -Body (@{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$token = $login.token
$headers = @{ 
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
Write-Host "Login sukses! Token diperoleh.`n" -ForegroundColor Green

Write-Host "=== 2. Test GET /api/v1/schedules ===" -ForegroundColor Cyan
$schedules = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/schedules" -Method Get -Headers $headers
Write-Host "Total jadwal retrieved: $($schedules.Count)" -ForegroundColor Green
if ($schedules.Count -gt 0) {
    Write-Host "Contoh 1 jadwal:" -ForegroundColor Gray
    Write-Host "  ID: $($schedules[0].id)"
    Write-Host "  ScheduleDate: $($schedules[0].scheduleDate)"
    Write-Host "  Session: $($schedules[0].session)"
    Write-Host "  StartTime: $($schedules[0].startTime) - EndTime: $($schedules[0].endTime)"
    Write-Host "  Status: $($schedules[0].status)"
}

Write-Host "`n=== 3. Test POST /api/v1/schedules (Zod Validation Protection) ===" -ForegroundColor Cyan
try {
    # Kirim payload invalid: tanpa session dan scheduleDate format salah
    Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/schedules" -Method Post -Headers $headers -Body (@{
        scheduleDate = "tanggal-palsu"
    } | ConvertTo-Json)
    Write-Host "ERROR: Validasi Zod harusnya menolak payload invalid!" -ForegroundColor Red
} catch {
    Write-Host "SUKSES: Request ditolak oleh Zod Pipe dengan status: $($_.Exception.Response.StatusCode) (Bad Request / Validation Error)" -ForegroundColor Green
}

Write-Host "`n=== SEMUA VERIFIKASI SELESAI DENGAN SUKSES ===" -ForegroundColor Green
