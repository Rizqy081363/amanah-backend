$baseUrl = "http://localhost:3001"

# 1. Login as Admin
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

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "VERIFIKASI ZERO OVER-ENGINEERING SCHEDULE ENGINE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Green

# Fetch all doctor schedule cards
$listRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules" -Method Get -Headers $headers
$doctors = if ($listRes.data.doctors) { $listRes.data.doctors } else { $listRes.doctors }

Write-Host "Ditemukan $($doctors.Count) praktisi/dokter di sistem." -ForegroundColor Yellow

foreach ($doc in $doctors) {
    $docId = $doc.id
    $docName = $doc.nama_dokter
    Write-Host "`n----------------------------------------------------------" -ForegroundColor Gray
    Write-Host "Dokter: $docName (ID: $docId)" -ForegroundColor Yellow
    Write-Host "  Display Akumulasi Slot: $($doc.display_akumulasi_slot)"
    Write-Host "  Sesi Aktif: $($doc.sesi_harian.Count)"

    # Get Detail 24H
    $detailRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/$($docId)?date=2026-09-24" -Method Get -Headers $headers
    $data = if ($detailRes.data) { $detailRes.data } else { $detailRes }

    # Verify Summary
    $summary = $data.summary
    Write-Host "  Summary 24 Jam:" -ForegroundColor Cyan
    Write-Host "    Total: $($summary.totalDaySlots) | Scheduled: $($summary.scheduledSlots) | Unscheduled: $($summary.unscheduledSlots)"
    Write-Host "    Available: $($summary.availableSlots) | Completed: $($summary.completedSlots) | Occupied: $($summary.occupiedSlots) | Closed: $($summary.closedSlots)"
    Write-Host "    Coverage Display : $($summary.scheduleCoverage.displayText)"
    Write-Host "    Occupancy Display: $($summary.patientOccupancy.displayText)"
    Write-Host "    Notice           : $($summary.unscheduledNotice)"

    # Verify Shifts
    Write-Host "  Shift Breakdown:" -ForegroundColor Cyan
    foreach ($sh in $data.shifts) {
        Write-Host "    $($sh.shiftName) ($($sh.timeRange)):"
        Write-Host "      Status: $($sh.operationalStatus) | Label: $($sh.operationalLabel)"
        Write-Host "      Slots: Total=$($sh.totalShiftSlots), Avail=$($sh.availableSlotsCount), Patients=$($sh.registeredPatientsCount)"
    }

    # Inspect Sample Slots (first slot of each shift)
    Write-Host "  Sample Slots UI-Ready Attributes:" -ForegroundColor Cyan
    $sampleSlots = $data.timeline_intervals | Where-Object { $_.startTime -in @('00:00', '06:00', '12:00', '18:00') }
    foreach ($sl in $sampleSlots) {
        Write-Host "    [$($sl.startTime)-$($sl.endTime)] uiStatus=$($sl.uiStatus), uiLabel='$($sl.uiLabel)', uiVariant=$($sl.uiVariant), action=$($sl.actionType), isClickable=$($sl.isClickable)"
    }
}
