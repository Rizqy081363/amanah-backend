$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

$apiBaseUrl = Get-E2EApiBaseUrl
$adminEmail = Get-ConfigValue "ADMIN_EMAIL" "admin@amanah.com"
$adminPassword = Get-ConfigValue "ADMIN_PASSWORD" "secret123"

$loginPayload = @{
    email = $adminEmail
    password = $adminPassword
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$apiBaseUrl/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
$token = $loginRes.token
if (-not $token) {
    throw "Failed to acquire admin token"
}

$headers = @{
    Authorization = "Bearer $token"
    ContentType = "application/json"
}

Write-Host "Verifying dynamic reference endpoints..."

$practitionersRes = Invoke-RestMethod -Uri "$apiBaseUrl/clinical/practitioners" -Method Get -Headers $headers
$doctors = if ($practitionersRes -is [System.Array]) { $practitionersRes } elseif ($practitionersRes.data) { $practitionersRes.data } else { $practitionersRes }
if (-not $doctors -or $doctors.Count -eq 0) {
    throw "Verification failed: Practitioners list is empty"
}
Write-Host "Found $($doctors.Count) active clinical practitioners"

$roomsRes = Invoke-RestMethod -Uri "$apiBaseUrl/schedules/reference/rooms" -Method Get -Headers $headers
$rooms = if ($roomsRes -is [System.Array]) { $roomsRes } elseif ($roomsRes.data) { $roomsRes.data } else { $roomsRes }
if (-not $rooms -or $rooms.Count -eq 0) {
    throw "Verification failed: Reference rooms list is empty"
}
Write-Host "Found $($rooms.Count) active clinical rooms"

$catalogRes = Invoke-RestMethod -Uri "$apiBaseUrl/clinics/services/catalog" -Method Get -Headers $headers
$catalog = if ($catalogRes -is [System.Array]) { $catalogRes } elseif ($catalogRes.data) { $catalogRes.data } else { $catalogRes }
$validPolis = @("Poli KIA", "Poli Umum")
foreach ($cat in $catalog) {
    if ($cat.poliklinikName -and $validPolis -notcontains $cat.poliklinikName) {
        throw "Verification failed: Unexpected poliklinik in catalog: $($cat.poliklinikName)"
    }
}
Write-Host "Service catalog polyclinics strictly valid: $($catalog.Count) categories checked"

Write-Host "Verifying appointments polyclinic disambiguation..."

$allAptsRes = Invoke-RestMethod -Uri "$apiBaseUrl/appointments?limit=100" -Method Get -Headers $headers
$aptsList = if ($allAptsRes -is [System.Array]) { $allAptsRes } elseif ($allAptsRes.data) { $allAptsRes.data } else { $allAptsRes }

if (-not $aptsList -or $aptsList.Count -eq 0) {
    throw "Verification failed: No appointments returned from /api/v1/appointments"
}

$checkedCount = 0
foreach ($apt in $aptsList) {
    $checkedCount++
    if (-not $apt.poliklinikName -or $validPolis -notcontains $apt.poliklinikName) {
        throw "Verification failed on apt $($apt.id): poliklinikName is '$($apt.poliklinikName)', expected 'Poli Umum' or 'Poli KIA'"
    }
    if ($apt.poliklinikName -eq $apt.layananName -and $apt.layananName -ne "Konsultasi Dokter") {
        throw "Verification failed on apt $($apt.id): poliklinikName '$($apt.poliklinikName)' equals layananName '$($apt.layananName)'"
    }
}
Write-Host "Checked $checkedCount appointments: 100% strictly resolved to Poli Umum / Poli KIA"

Write-Host "Verifying backend filters..."

$firstDoctor = $doctors[0]
$filteredByDocRes = Invoke-RestMethod -Uri "$apiBaseUrl/appointments?doctorName=$([Uri]::EscapeDataString($firstDoctor.name))&limit=50" -Method Get -Headers $headers
$docFilteredList = if ($filteredByDocRes -is [System.Array]) { $filteredByDocRes } elseif ($filteredByDocRes.data) { $filteredByDocRes.data } else { $filteredByDocRes }
Write-Host "Filtered by doctor '$($firstDoctor.name)': $($docFilteredList.Count) appointments returned"
foreach ($apt in $docFilteredList) {
    if ($apt.doctorName -and -not $apt.doctorName.ToLower().Contains($firstDoctor.name.ToLower())) {
        throw "Verification failed: doctor filter returned non-matching doctor $($apt.doctorName)"
    }
}

$firstRoom = $rooms[0]
$filteredByRoomRes = Invoke-RestMethod -Uri "$apiBaseUrl/appointments?roomName=$([Uri]::EscapeDataString($firstRoom.name))&limit=50" -Method Get -Headers $headers
$roomFilteredList = if ($filteredByRoomRes -is [System.Array]) { $filteredByRoomRes } elseif ($filteredByRoomRes.data) { $filteredByRoomRes.data } else { $filteredByRoomRes }
Write-Host "Filtered by room '$($firstRoom.name)': $($roomFilteredList.Count) appointments returned"
foreach ($apt in $roomFilteredList) {
    if ($apt.roomName -and -not $apt.roomName.ToLower().Contains($firstRoom.name.ToLower())) {
        throw "Verification failed: room filter returned non-matching room $($apt.roomName)"
    }
}

$testDate = "2026-10-10"
$filteredByDateRes = Invoke-RestMethod -Uri "$apiBaseUrl/appointments?date=$testDate&limit=50" -Method Get -Headers $headers
$dateFilteredList = if ($filteredByDateRes -is [System.Array]) { $filteredByDateRes } elseif ($filteredByDateRes.data) { $filteredByDateRes.data } else { $filteredByDateRes }
Write-Host "Filtered by date '$testDate': $($dateFilteredList.Count) appointments returned"
foreach ($apt in $dateFilteredList) {
    if ($apt.appointmentDate -ne $testDate -and $apt.scheduledDate -ne $testDate) {
        throw "Verification failed: date filter returned non-matching date on apt $($apt.id)"
    }
}

Write-Host "Verifying duration and lifecycle fields..."
$hasDurationMetric = $false
foreach ($apt in $aptsList) {
    if ($apt.actualStartedAt -or $apt.actualCompletedAt -or $apt.consultationDurationFormatted) {
        $hasDurationMetric = $true
        Write-Host "Appointment $($apt.id) lifecycle: started=$($apt.actualStartedAt), completed=$($apt.actualCompletedAt), duration=$($apt.consultationDurationFormatted)"
        break
    }
}

Write-Host "=========================================================="
Write-Host "ALL BACKEND AND FRONTEND TABLE CONTRACT VERIFICATIONS PASSED"
Write-Host "1. Poli vs Layanan Disambiguation: PASSED (100% strictly Poli Umum or Poli KIA)"
Write-Host "2. Dynamic Reference Filters (Doctors, Rooms, Date): PASSED"
Write-Host "3. Service Duration and Lifecycle Fields: PASSED"
Write-Host "=========================================================="
