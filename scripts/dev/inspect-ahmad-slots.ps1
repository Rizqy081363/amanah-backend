$baseUrl = "http://localhost:3001"

# 1. Login
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

# 2. Search doctors matching "amikom"
$searchRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?search=amikom" -Method Get -Headers $headers
$doctors = if ($searchRes.data.doctors) { $searchRes.data.doctors } else { $searchRes.doctors }

Write-Host "Ditemukan $($doctors.Count) dokter dengan kata kunci 'amikom'." -ForegroundColor Yellow

foreach ($doc in $doctors) {
    $docId = $doc.id
    $docName = $doc.nama_dokter
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "ANALISIS LENGKAP: $docName (ID: $docId)" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Green

    $detailRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($docId)?date=2026-09-24" -Method Get -Headers $headers
    $data = if ($detailRes.data) { $detailRes.data } else { $detailRes }

    # Shifts breakdown
    Write-Host "`n>>> RINGKASAN 4 SESI / SHIFT:" -ForegroundColor Yellow
    foreach ($sh in $data.shifts) {
        Write-Host "Shift $($sh.shiftName) ($($sh.timeRange)):"
        Write-Host "  Operational Status : $($sh.operationalStatus)"
        Write-Host "  Operational Label  : $($sh.operationalLabel)"
        Write-Host "  Total Slots        : $($sh.totalShiftSlots)"
        Write-Host "  Scheduled Slots    : $($sh.metrics.scheduledSlots)"
        Write-Host "  Unscheduled Slots  : $($sh.metrics.unscheduledSlots)"
        Write-Host "  Available Slots    : $($sh.metrics.availableSlots)"
        Write-Host "  Closed Slots       : $($sh.metrics.closedSlots)"
        Write-Host "  Occupied Slots     : $($sh.metrics.occupiedSlots)"
    }

    # Group timeline_intervals by shift
    Write-Host "`n>>> RINCIAN SLOT PER SESI (48 Interval 24 Jam):" -ForegroundColor Yellow
    foreach ($sh in $data.shifts) {
        Write-Host "`n=== SESI: $($sh.shiftName) ($($sh.timeRange)) ===" -ForegroundColor Magenta
        $shiftSlots = $data.timeline_intervals | Where-Object { 
            $_.startTime -ge $sh.boundaryStartTime -and $_.startTime -lt $sh.boundaryEndTime 
        }

        foreach ($sl in $shiftSlots) {
            $extra = ""
            if ($sl.reschedule -and $sl.reschedule.isRescheduled) {
                $extra += " [DIJADWALKAN ULANG dari $($sl.reschedule.sourceDate) $($sl.reschedule.sourceStartTime), Alasan: $($sl.reschedule.reasonText)]"
            }
            if ($sl.closure) {
                $extra += " [DITUTUP: $($sl.closure.reasonText)]"
            }
            if ($sl.appointment) {
                $extra += " [TERISI PASIEN: $($sl.appointment.patientName)]"
            }

            Write-Host "  $($sl.timeRange) | uiStatus: $($sl.uiStatus) | uiLabel: '$($sl.uiLabel)' | effectiveStatus: $($sl.effectiveStatus) | availability: $($sl.availabilityState)$extra"
        }
    }
}
