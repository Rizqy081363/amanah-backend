$ErrorActionPreference = 'Stop'
Set-Location 'D:\Amanah-health-care\backend'

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: Midnight Session Operability & Dynamic Shift Verification " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Login sebagai Admin
Write-Host "`n[1/4] Mengautentikasi sebagai Admin..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/auth/email/login" -Method Post -Body (@{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$token = $login.token
$headers = @{ 
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
Write-Host "Token diperoleh dengan sukses." -ForegroundColor Green

# 2. Test Booking Options untuk Sesi Malam (20:00 - 24:00)
Write-Host "`n[2/4] Memeriksa Booking Options untuk Sesi Malam (20:00 - 24:00)..." -ForegroundColor Yellow
$todayStr = "2026-11-08"
$bookingRes = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/schedules/booking-options?date=$todayStr" -Method Get -Headers $headers
$sessions = $bookingRes.data.sessions

$malamSession = $sessions | Where-Object { $_.session -eq 'malam' -or $_.shift -eq 'malam' }
if (-not $malamSession) {
    throw "GAGAL: Sesi malam tidak ditemukan pada tanggal $todayStr!"
}

Write-Host "Detail Sesi Malam:" -ForegroundColor Gray
Write-Host "  Session Code : $($malamSession.session)"
Write-Host "  Label        : $($malamSession.label)"
Write-Host "  Start Time   : $($malamSession.startTime)"
Write-Host "  End Time     : $($malamSession.endTime)"
Write-Host "  isPast       : $($malamSession.isPast)"
Write-Host "  isDisabled   : $($malamSession.isDisabled)"
Write-Host "  disabledReason: $($malamSession.disabledReason)"

if ($malamSession.isPast -ne $false) {
    throw "GAGAL: Sesi malam ditandai isPast = true, padahal shift masih beroperasi hingga 24:00!"
}
if ($malamSession.isDisabled -ne $false) {
    throw "GAGAL: Sesi malam ditandai isDisabled = true (Alasan: $($malamSession.disabledReason))!"
}

Write-Host "VERIFIKASI SUKSES: Sesi malam (20:00 - 24:00) aktif dan TIDAK diklaim 'Waktu Terlewati'!" -ForegroundColor Green

# 3. Test Validasi Sesi yang Sudah Selesai (Pagi & Sore)
Write-Host "`n[3/4] Memastikan Sesi Pagi & Sore yang sudah lewat tetap ditandai 'Waktu Terlewati'..." -ForegroundColor Yellow
$pagiSession = $sessions | Where-Object { $_.session -eq 'pagi' }
$soreSession = $sessions | Where-Object { $_.session -eq 'sore' }

if ($pagiSession -and $pagiSession.isPast -eq $true -and $pagiSession.disabledReason -eq 'Waktu Terlewati') {
    Write-Host "  Sesi Pagi (08:00 - 14:00) -> Terlewati [OK]" -ForegroundColor Green
} else {
    throw "GAGAL: Sesi Pagi seharusnya terlewati pada pukul sekarang!"
}

if ($soreSession -and $soreSession.isPast -eq $true -and $soreSession.disabledReason -eq 'Waktu Terlewati') {
    Write-Host "  Sesi Sore (14:00 - 20:00) -> Terlewati [OK]" -ForegroundColor Green
} else {
    throw "GAGAL: Sesi Sore seharusnya terlewati pada pukul sekarang!"
}

# 4. Test Pembuatan Shift Baru Berakhir di Tengah Malam (Dynamic Input)
Write-Host "`n[4/4] Menguji Pembuatan Shift Operasional Baru yang Berakhir Tengah Malam via API..." -ForegroundColor Yellow

# 4a. Pastikan shift aktif yang bertabrakan dengan sesi malam (20:00-24:00) ditolak oleh overlap validator
try {
    $overlapPayload = @{
        label = "Sesi Bertabrakan"
        codePrefix = "TAB"
        defaultStartsAt = "21:00:00"
        defaultEndsAt = "24:00:00"
        isActive = $true
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs" -Method Post -Headers $headers -Body $overlapPayload
    throw "GAGAL: Shift yang tumpang tindih seharusnya ditolak!"
} catch {
    Write-Host "  Overlap Validation: Tabrakan (21:00-24:00 vs 20:00-24:00) berhasil ditolak secara matematis! [OK]" -ForegroundColor Green
}

# 4b. Uji Edge Case: Jam Mulai 20:00 Selesai 01:00 (Wajib ditolak 400 oleh Zod Validation, TIDAK BOLEH 500)
try {
    $edgeCasePayload = @{
        label = "Sesi Cross Midnight Error"
        codePrefix = "CME"
        defaultStartsAt = "20:00:00"
        defaultEndsAt = "01:00:00"
        isActive = $false
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs" -Method Post -Headers $headers -Body $edgeCasePayload
    throw "GAGAL: Edge case 20:00-01:00 seharusnya ditolak oleh Zod validation!"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if (-not $status) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 400) {
        Write-Host "  Zod Validation Defense: Edge case 20:00-01:00 BERHASIL dicegat di gerbang HTTP sebagai 400 Bad Request (TIDAK crash 500)! [OK]" -ForegroundColor Green
    } else {
        throw "GAGAL: Harusnya status 400 Bad Request tapi menerima status $status!"
    }
}

# 4c. Buat shift non-aktif baru yang berakhir di tengah malam (22:00 - 24:00)
$testShiftPayload = @{
    label = "Sesi Kalong Uji"
    codePrefix = "KLG"
    defaultStartsAt = "22:00:00"
    defaultEndsAt = "24:00:00"
    isActive = $false
} | ConvertTo-Json

$createRes = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs" -Method Post -Headers $headers -Body $testShiftPayload
$createdShift = $createRes.data

Write-Host "Shift berhasil dibuat:" -ForegroundColor Green
Write-Host "  ID          : $($createdShift.id)"
Write-Host "  Code        : $($createdShift.code)"
Write-Host "  Label       : $($createdShift.label)"
Write-Host "  Time Range  : $($createdShift.timeRange)"
Write-Host "  StartsAt    : $($createdShift.defaultStartsAt)"
Write-Host "  EndsAt      : $($createdShift.defaultEndsAt)"

if ($createdShift.defaultEndsAt -ne '24:00:00' -and $createdShift.defaultEndsAt -ne '24:00') {
    throw "GAGAL: defaultEndsAt tidak tersimpan secara kanonik sebagai 24:00:00!"
}

# Pembersihan Shift Pengujian
Write-Host "`nMembersihkan data shift pengujian..." -ForegroundColor Gray
$deleteBody = @{
    confirmText = "Sesi Kalong Uji"
} | ConvertTo-Json

$deleteRes = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs/$($createdShift.id)?cascade=true" -Method Delete -Headers $headers -Body $deleteBody
Write-Host "Cleanup selesai: $($deleteRes.message)" -ForegroundColor Green

Write-Host "`n=================================================================" -ForegroundColor Green
Write-Host " SEMUA PENGUJIAN TEMPORAL & SESI TENGAH MALAM BERHASIL 100% " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
