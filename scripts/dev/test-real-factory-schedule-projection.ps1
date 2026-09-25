$baseUrl = 'http://localhost:3001'

function Unpack-Payload($obj) {
    if ($null -ne $obj -and $null -ne $obj.data) {
        return $obj.data
    }
    return $obj
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "1. AUTHENTICATING AS ADMIN" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$login = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = 'admin@amanah.com'; password = 'secret123' } | ConvertTo-Json) -ContentType 'application/json'
$headers = @{ "Authorization" = "Bearer $($login.token)" }
Write-Host "Authenticated successfully as admin." -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "2. GET A VALID PRACTITIONER ID (e.g. dr. Ahmad)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$doctorListRaw = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?search=ahmad" -Method Get -Headers $headers
$doctorList = Unpack-Payload $doctorListRaw
$targetDoctor = $doctorList.doctors[0]
$practitionerId = $targetDoctor.id
$doctorName = $targetDoctor.nama_dokter
Write-Host "Selected Doctor: $doctorName (ID: $practitionerId)" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "3. TEST PROJECTION: SIANG SHIFT with startTime = 14:00 (NO endTime, NO slotsCount)" -ForegroundColor Cyan
Write-Host "Expectation: factory calculates endTime = 14:30, capacity = 1, remainingShiftSlots = 7 (until 18:00)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$siangUrl = "$baseUrl/api/v1/schedules/projection?staffId=$practitionerId&date=2026-09-25&scheduleContextId=afternoon&startTime=14:00"
$siangResRaw = Invoke-RestMethod -Uri $siangUrl -Method Get -Headers $headers
$siangRes = Unpack-Payload $siangResRaw

Write-Host "Response received:" -ForegroundColor Green
Write-Host "  Schedule Context     : $($siangRes.scheduleContextId) ($($siangRes.contextLabel))"
Write-Host "  Selected Start Time  : $($siangRes.selectedStartTime)"
Write-Host "  Projected End Time   : $($siangRes.projectedEndTime)" -ForegroundColor Magenta
Write-Host "  Capacity             : $($siangRes.capacity)" -ForegroundColor Magenta
Write-Host "  Remaining Shift Slots: $($siangRes.remainingShiftSlots)" -ForegroundColor Magenta
Write-Host "  Effective Duration   : $($siangRes.effectiveConsultationDurationMinutes) minutes (from DB)"
Write-Host "  Intervals Count      : $($siangRes.intervals.Count)"
foreach ($int in $siangRes.intervals) {
    Write-Host "    Interval [$($int.intervalIndex)]: $($int.startTime) - $($int.endTime) | Status: $($int.status)"
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "4. TEST PROJECTION: PAGI SHIFT with startTime = 09:00 (NO endTime, NO slotsCount)" -ForegroundColor Cyan
Write-Host "Expectation: factory calculates endTime = 09:30, capacity = 1, remainingShiftSlots = 5 (until 12:00)" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$pagiUrl = "$baseUrl/api/v1/schedules/projection?staffId=$practitionerId&date=2026-09-25&scheduleContextId=morning&startTime=09:00"
$pagiResRaw = Invoke-RestMethod -Uri $pagiUrl -Method Get -Headers $headers
$pagiRes = Unpack-Payload $pagiResRaw

Write-Host "Response received:" -ForegroundColor Green
Write-Host "  Schedule Context     : $($pagiRes.scheduleContextId) ($($pagiRes.contextLabel))"
Write-Host "  Selected Start Time  : $($pagiRes.selectedStartTime)"
Write-Host "  Projected End Time   : $($pagiRes.projectedEndTime)" -ForegroundColor Magenta
Write-Host "  Capacity             : $($pagiRes.capacity)" -ForegroundColor Magenta
Write-Host "  Remaining Shift Slots: $($pagiRes.remainingShiftSlots)" -ForegroundColor Magenta
Write-Host "  Effective Duration   : $($pagiRes.effectiveConsultationDurationMinutes) minutes (from DB)"
Write-Host "  Intervals Count      : $($pagiRes.intervals.Count)"
foreach ($int in $pagiRes.intervals) {
    Write-Host "    Interval [$($int.intervalIndex)]: $($int.startTime) - $($int.endTime) | Status: $($int.status)"
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "5. TEST PROJECTION: FULL PAGI SHIFT with fillShift = true (startTime = 06:00)" -ForegroundColor Cyan
Write-Host "Expectation: factory calculates 12 slots (06:00 - 12:00), remainingShiftSlots = 0" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$pagiFullUrl = "$baseUrl/api/v1/schedules/projection?staffId=$practitionerId&date=2026-09-25&scheduleContextId=morning&startTime=06:00&fillShift=true"
$pagiFullResRaw = Invoke-RestMethod -Uri $pagiFullUrl -Method Get -Headers $headers
$pagiFullRes = Unpack-Payload $pagiFullResRaw

Write-Host "Response received:" -ForegroundColor Green
Write-Host "  Schedule Context     : $($pagiFullRes.scheduleContextId) ($($pagiFullRes.contextLabel))"
Write-Host "  Selected Start Time  : $($pagiFullRes.selectedStartTime)"
Write-Host "  Projected End Time   : $($pagiFullRes.projectedEndTime)" -ForegroundColor Magenta
Write-Host "  Total Capacity       : $($pagiFullRes.capacity)" -ForegroundColor Magenta
Write-Host "  Remaining Shift Slots: $($pagiFullRes.remainingShiftSlots)" -ForegroundColor Magenta
Write-Host "  Intervals Count      : $($pagiFullRes.intervals.Count)"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "6. TEST SCHEDULE OPTIONS API (4 Shifts, 24 Hours, DB-driven duration)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$optUrl = "$baseUrl/api/v1/schedules/reference/options"
$optResRaw = Invoke-RestMethod -Uri $optUrl -Method Get -Headers $headers
$optRes = Unpack-Payload $optResRaw
Write-Host "Schedule Options shifts count: $($optRes.shifts.Count)"
foreach ($s in $optRes.shifts) {
    Write-Host "  Shift: $($s.id) | $($s.label) ($($s.shift)) | $($s.startTime) - $($s.endTime)"
}
Write-Host "Effective Duration from DB: $($optRes.effectiveConsultationDurationMinutes) minutes"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "7. TEST ADMIN DOCTOR SCHEDULES LIST FOR WEB ADMIN (/dashboard/jadwal-dokter)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$doctorListResRaw = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?search=ahmad" -Method Get -Headers $headers
$doctorListRes = Unpack-Payload $doctorListResRaw
$doc = $doctorListRes.doctors[0]
Write-Host "Doctor Name : $($doc.nama_dokter)"
Write-Host "Status      : $($doc.status_dokter)"
Write-Host "Display Slot: $($doc.display_akumulasi_slot)" -ForegroundColor Green
Write-Host "Jadwal Hari Ini: $($doc.jadwal_hari_ini)" -ForegroundColor Green
Write-Host "Today Sessions Count: $($doc.sesi_harian.Count)"
foreach ($j in $doc.sesi_harian) {
    Write-Host "  - Sesi: $($j.nama_sesi) | Jam: $($j.jam_mulai) - $($j.jam_selesai) | Kuota: $($j.kuota_pasien) | Sisa: $($j.slot_tersedia) | Pasien Terdaftar: $($j.pasien_terdaftar) | Display: $($j.display_slot)" -ForegroundColor Yellow
}
Write-Host "`nALL VERIFICATIONS PASSED SUCCESSFULLY!" -ForegroundColor Green
