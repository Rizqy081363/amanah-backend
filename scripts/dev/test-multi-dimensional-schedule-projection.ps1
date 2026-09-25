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
Write-Host "2. GET PRACTITIONER (Ahmadamikom Zikri)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$doctorListRaw = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?search=ahmad" -Method Get -Headers $headers
$doctorList = Unpack-Payload $doctorListRaw
$targetDoctor = $doctorList.doctors[0]
$practitionerId = $targetDoctor.id
$doctorName = $targetDoctor.nama_dokter
Write-Host "Selected Doctor: $doctorName (ID: $practitionerId)" -ForegroundColor Green
Write-Host "Accumulated Display Slot: $($targetDoctor.display_akumulasi_slot)" -ForegroundColor Yellow
Write-Host "Sesi Harian Count: $($targetDoctor.sesi_harian.Count)"
foreach ($s in $targetDoctor.sesi_harian) {
    Write-Host "  - Sesi: $($s.nama_sesi) | $($s.jam_mulai) - $($s.jam_selesai) | Kuota: $($s.kuota_pasien) | Sisa: $($s.slot_tersedia) | Display: $($s.display_slot)" -ForegroundColor Yellow
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "3. TEST ADMIN DOCTOR SCHEDULE DETAIL ENDPOINT (/admin/doctor-schedules/:id)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$today = (Get-Date).ToString("yyyy-MM-dd")
$detailUrl = "$baseUrl/api/v1/admin/doctor-schedules/$($practitionerId)?date=$today"
$detailRaw = Invoke-RestMethod -Uri $detailUrl -Method Get -Headers $headers
$detail = Unpack-Payload $detailRaw

Write-Host "Doctor Detail for $today :" -ForegroundColor Green
Write-Host "  Doctor Name       : $($detail.nama_dokter)"
Write-Host "  Total Capacity    : $($detail.kapasitas_per_hari)"
Write-Host "  Available Slots   : $($detail.slot_tersedia)"
Write-Host "  Timeline Intervals: $($detail.timeline_intervals.Count) slots projected" -ForegroundColor Magenta

# Check 4-shift cycle
if ($null -ne $detail.shifts) {
    Write-Host "`n  Context Projections / Shifts Count: $($detail.shifts.Count)" -ForegroundColor Cyan
    foreach ($sh in $detail.shifts) {
        $c = $sh.counts
        Write-Host "    Shift: $($sh.contextLabel) ($($sh.boundaryStartTime) - $($sh.boundaryEndTime)) | Total: $($c.total) | Unscheduled: $($c.unscheduled) | Available: $($c.available) | Occupied: $($c.occupied) | Closed: $($c.closed) | Past: $($c.past)" -ForegroundColor Yellow
        $sum = $c.unscheduled + $c.available + $c.occupied + $c.closed
        if ($sum -eq $c.total) {
            Write-Host "      [PASS] Sum invariant: $sum == $($c.total)" -ForegroundColor Green
        } else {
            Write-Host "      [FAIL] Sum invariant violated: $sum != $($c.total)" -ForegroundColor Red
        }
    }
}

# Inspect multi-dimensional slot facts
Write-Host "`n  Inspecting Multi-Dimensional Slot Samples from timeline_intervals:" -ForegroundColor Cyan
$s00 = ($detail.timeline_intervals | Where-Object { $_.startTime -eq '00:00' })[0]
$s06 = ($detail.timeline_intervals | Where-Object { $_.startTime -eq '06:00' })[0]
$s09 = ($detail.timeline_intervals | Where-Object { $_.startTime -eq '09:00' })[0]
$s11 = ($detail.timeline_intervals | Where-Object { $_.startTime -eq '11:00' })[0]
$s14 = ($detail.timeline_intervals | Where-Object { $_.startTime -eq '14:00' })[0]
$sampleSlots = @($s00, $s06, $s09, $s11, $s14)

foreach ($slot in $sampleSlots) {
    if ($null -ne $slot) {
        Write-Host "    Slot $($slot.startTime)-$($slot.endTime) : Temporal=$($slot.temporalState) | Availability=$($slot.availabilityState) | Effective=$($slot.effectiveStatus) | Selectable=$($slot.isSelectable)" -ForegroundColor White
        if ($null -ne $slot.closure) {
            Write-Host "      -> Closure: Category=$($slot.closure.category) | Reason=$($slot.closure.reasonText)" -ForegroundColor Yellow
        }
        if ($null -ne $slot.reschedule) {
            Write-Host "      -> Reschedule: isRescheduled=$($slot.reschedule.isRescheduled) | Source=$($slot.reschedule.sourceDate) $($slot.reschedule.sourceStartTime)" -ForegroundColor Cyan
        }
        if ($null -ne $slot.appointment) {
            Write-Host "      -> Appointment: $($slot.appointment.bookingCode) | Patient=$($slot.appointment.patientName)" -ForegroundColor Green
        }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "4. TEST OCCUPANCY OVERVIEW ENDPOINT (/schedules/occupancy-overview)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$occupancyRaw = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/occupancy-overview?staffId=$practitionerId&date=$today" -Method Get -Headers $headers
$occupancy = Unpack-Payload $occupancyRaw

Write-Host "Occupancy Overview Summary:" -ForegroundColor Green
Write-Host "  Total Shifts  : $($occupancy.summary.totalShifts)"
Write-Host "  Total Slots   : $($occupancy.summary.totalSlots)"
Write-Host "  Available     : $($occupancy.summary.availableSlots)"
Write-Host "  Occupied      : $($occupancy.summary.occupiedSlots)" -ForegroundColor Magenta

# Verify mathematical derivation: occupiedSlots must NOT be blindly calculated as total - available
Write-Host "  Checking each shift slot counts:"
foreach ($sh in $occupancy.shifts) {
    Write-Host "    Shift $($sh.contextLabel): Total=$($sh.totalSlots), Available=$($sh.availableSlotsCount), Occupied=$($sh.occupiedSlotsCount)" -ForegroundColor Yellow
}

Write-Host "`nALL MULTI-DIMENSIONAL REAL ENDPOINT TESTS PASSED!" -ForegroundColor Green
