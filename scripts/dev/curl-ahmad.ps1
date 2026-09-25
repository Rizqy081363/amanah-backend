$baseUrl = "http://localhost:3001"

# 1. Login with Invoke-RestMethod
$loginBody = @{
    email    = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$login = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody

$token = if ($login.token) { $login.token } else { $login.data.tokens.accessToken }
if (-not $token) {
    throw "Failed to login"
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "1. CARD SHOWCASE: GET /api/v1/admin/doctor-schedules?search=ahmad" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green

$headers = @{
    Authorization = "Bearer $token"
}

$card = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?search=ahmad" -Method Get -Headers $headers
$ahmadCard = if ($card.data.doctors) { $card.data.doctors[0] } else { $card.doctors[0] }
$docId = $ahmadCard.id

Write-Host "Doctor: $($ahmadCard.nama_dokter) (ID: $docId)" -ForegroundColor Yellow
$ahmadCard | ConvertTo-Json -Depth 5

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "2. DETAIL 24H: GET /api/v1/admin/doctor-schedules/$($docId)?date=2026-09-24" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green

$detail = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($docId)?date=2026-09-24" -Method Get -Headers $headers
$detailData = if ($detail.data) { $detail.data } else { $detail }

Write-Host "`n>>> WHOLE DAY SUMMARY & METRICS (48 SLOTS 24 JAM):" -ForegroundColor Magenta
$detailData.summary | ConvertTo-Json -Depth 5

Write-Host "`n>>> 4 SHIFTS SUMMARY & METRICS:" -ForegroundColor Magenta
foreach ($sh in $detailData.shifts) {
    $shiftName = if ($sh.label) { $sh.label } else { $sh.contextLabel }
    $range = if ($sh.timeRange) { $sh.timeRange } else { "$($sh.boundaryStartTime) - $($sh.boundaryEndTime)" }
    Write-Host "`n--- Shift: $shiftName ($range) ---" -ForegroundColor Cyan
    Write-Host "  Operational Status: $($sh.operationalStatus)" -ForegroundColor Green
    Write-Host "  Operational Label : $($sh.operationalLabel)" -ForegroundColor Green
    $sh.summary | ConvertTo-Json -Depth 5
}

Write-Host "`n>>> SAMPLE MULTI-DIMENSIONAL SLOTS DARI timeline_intervals (48 Interval):" -ForegroundColor Magenta
$samples = $detailData.timeline_intervals | Where-Object { 
    $_.startTime -in @('00:00', '06:00', '09:00', '11:00', '14:00', '19:00')
}

foreach ($s in $samples) {
    Write-Host "`nSlot $($s.timeRange):" -ForegroundColor Yellow
    Write-Host "  UI Status          : $($s.uiStatus)" -ForegroundColor Cyan
    Write-Host "  UI Label           : $($s.uiLabel)" -ForegroundColor Cyan
    Write-Host "  UI Variant         : $($s.uiVariant)" -ForegroundColor Cyan
    Write-Host "  Action Type        : $($s.actionType)" -ForegroundColor Cyan
    Write-Host "  Temporal State     : $($s.temporalState)"
    Write-Host "  Availability State : $($s.availabilityState)"
    Write-Host "  Effective Status   : $($s.effectiveStatus)"
    Write-Host "  Is Selectable      : $($s.isSelectable)"
    if ($s.closure) {
        Write-Host "  Closure Info       : Category=$($s.closure.category), Reason=$($s.closure.reasonText)" -ForegroundColor Red
    }
    if ($s.reschedule) {
        Write-Host "  Reschedule Info    : Source=$($s.reschedule.sourceDate) $($s.reschedule.sourceStartTime), Reason=$($s.reschedule.reasonText)" -ForegroundColor Cyan
    }
}

Write-Host "`n>>> SAMPLE MONTHLY SCHEDULE (24 Sep 2026):" -ForegroundColor Magenta
$day24 = $detailData.monthly_schedule | Where-Object { $_.date -eq '2026-09-24' }
$day24 | ConvertTo-Json -Depth 5
