param (
  [string]$BaseUrl = "http://localhost:3001/api/v1",
  [string]$Date = "2026-09-26"
)

Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "   TEST: bookedPatientCount Harus 0 Saat Sesi CLOSED       " -ForegroundColor Cyan
Write-Host "   Bug: capacity - availableSlots = 12 saat admin close     " -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

function Assert-Result {
  param ([string]$TestName, [bool]$Condition, [string]$Details = "")
  if ($Condition) {
    Write-Host "  [PASS] $TestName" -ForegroundColor Green
  } else {
    Write-Host "  [FAIL] $TestName - $Details" -ForegroundColor Red
  }
}

# Login
$loginPayload = @{ email = "zikriahmadamikom@gmail.com"; password = "secret123" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BaseUrl/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$token = $login.token
Write-Host "✅ Auth: $($login.user.fullName ?? $login.user.name)" -ForegroundColor Green
Write-Host ""

# GET my-schedules untuk tanggal yang ada sesi CLOSED
Write-Host "--- GET /schedules/my-schedules?date=$Date ---" -ForegroundColor Yellow
$headers = @{ Authorization = "Bearer $token" }
$mySchedules = Invoke-RestMethod -Uri "$BaseUrl/schedules/my-schedules?date=$Date" -Headers $headers

Write-Host "  Total sesi ditemukan: $($mySchedules.Count)"

$closedSessions = $mySchedules | Where-Object { $_.status -eq "CLOSED" -or $_.rawStatus -eq "closed" }
$openSessions   = $mySchedules | Where-Object { $_.status -eq "OPEN"   -or $_.rawStatus -eq "open"   }

Write-Host "  Sesi CLOSED : $($closedSessions.Count)"
Write-Host "  Sesi OPEN   : $($openSessions.Count)"
Write-Host ""

foreach ($s in $mySchedules) {
  $color = if ($s.status -eq "CLOSED") { "DarkGray" } else { "White" }
  Write-Host "  Session: $($s.session) | status=$($s.status) | capacity=$($s.capacity) | availableSlots=$($s.availableSlots) | bookedPatientCount=$($s.bookedPatientCount)" -ForegroundColor $color
}
Write-Host ""

# Verifikasi: sesi CLOSED harus punya bookedPatientCount = jumlah appointment nyata (0 jika tidak ada)
# Cek juga booked-patients endpoint sebagai ground truth
Write-Host "--- GET /schedules/booked-patients?date=$Date (ground truth) ---" -ForegroundColor Yellow
$bookedPatients = Invoke-RestMethod -Uri "$BaseUrl/schedules/booked-patients?date=$Date" -Headers $headers
Write-Host "  Pasien aktif di booked-patients: $($bookedPatients.Count)"

# Group by scheduleSessionId
$countBySession = @{}
foreach ($p in $bookedPatients) {
  $sid = $p.scheduleSessionId ?? $p.schedule?.id ?? "unknown"
  if (-not $countBySession.ContainsKey($sid)) { $countBySession[$sid] = 0 }
  $countBySession[$sid]++
}
Write-Host ""

Write-Host "--- ASSERTIONS ---" -ForegroundColor Yellow
$allPass = $true

foreach ($s in $closedSessions) {
  $expectedCount = $countBySession[$s.id] ?? 0
  $actual = $s.bookedPatientCount
  $ok = $actual -eq $expectedCount
  if (-not $ok) { $allPass = $false }
  Assert-Result "CLOSED sesi '$($s.session)' bookedPatientCount = $expectedCount (actual=$actual)" $ok `
    "MASIH ADA BUG: formula capacity-availableSlots masih dipakai, harusnya $expectedCount bukan $actual"
}

foreach ($s in $openSessions) {
  $expectedCount = $countBySession[$s.id] ?? 0
  $actual = $s.bookedPatientCount
  $ok = $actual -eq $expectedCount
  if (-not $ok) { $allPass = $false }
  Assert-Result "OPEN sesi '$($s.session)' bookedPatientCount = $expectedCount (actual=$actual)" $ok `
    "Hitungan salah untuk sesi OPEN: harusnya $expectedCount bukan $actual"
}

# Calendar summary check
Write-Host ""
Write-Host "--- GET /schedules/calendar-summary?month=2026-09 (day $Date) ---" -ForegroundColor Yellow
$calSummary = Invoke-RestMethod -Uri "$BaseUrl/schedules/calendar-summary?month=2026-09" -Headers $headers
$day26 = $calSummary.days | Where-Object { $_.date -eq $Date }
if ($day26) {
  Write-Host "  date=$($day26.date) | status=$($day26.status) | bookedPatientCount=$($day26.bookedPatientCount) | capacityPercentage=$($day26.capacityPercentage)"
  $calOk = $day26.bookedPatientCount -eq $bookedPatients.Count
  if (-not $calOk) { $allPass = $false }
  Assert-Result "calendar-summary[$Date] bookedPatientCount = $($bookedPatients.Count) (actual=$($day26.bookedPatientCount))" $calOk `
    "calendar-summary masih salah: harusnya $($bookedPatients.Count) bukan $($day26.bookedPatientCount)"
}

# Day settings check
Write-Host ""
Write-Host "--- GET /schedules/day-settings?date=$Date ---" -ForegroundColor Yellow
$daySettings = Invoke-RestMethod -Uri "$BaseUrl/schedules/day-settings?date=$Date" -Headers $headers
Write-Host "  totalBookedPatients=$($daySettings.totalBookedPatients) | capacityPercentage=$($daySettings.capacityPercentage)"
$dsOk = $daySettings.totalBookedPatients -eq $bookedPatients.Count
if (-not $dsOk) { $allPass = $false }
Assert-Result "day-settings[$Date] totalBookedPatients = $($bookedPatients.Count) (actual=$($daySettings.totalBookedPatients))" $dsOk `
  "day-settings masih salah: harusnya $($bookedPatients.Count) bukan $($daySettings.totalBookedPatients)"

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
if ($allPass) {
  Write-Host "   ✅ SEMUA TEST PASS — Bug bookedPatientCount sudah fixed! " -ForegroundColor Green
} else {
  Write-Host "   ❌ ADA TEST GAGAL — Lihat detail di atas                 " -ForegroundColor Red
}
Write-Host "===========================================================" -ForegroundColor Cyan
