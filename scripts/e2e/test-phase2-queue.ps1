# PowerShell Verification Test Suite for Phase 2 (Schedules, Appointments, & Queue Lifecycle)
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"
$baseUrl = Get-E2EApiBaseUrl
$totalTests = 0
$passedTests = 0
$failedTests = 0

function Assert-Test {
    param(
        [string]$Name,
        [scriptblock]$TestBlock
    )
    $script:totalTests++
    try {
        & $TestBlock
        $script:passedTests++
        Write-Host " [PASS] $Name" -ForegroundColor Green
    }
    catch {
        $script:failedTests++
        Write-Host "❌ [FAIL] $Name" -ForegroundColor Red
        Write-Host "   Error: $_" -ForegroundColor DarkRed
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " AMANAH HEALTHCARE - PHASE 2 SCHEDULES & QUEUE SUITE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------
# 1. Setup & Multi-Role Authentication
# -------------------------------------------------------------------
Write-Host "`n--- Setup: Authentication & Active Master Data ---" -ForegroundColor Yellow

$adminToken = $null
$dokterToken = $null
$pasienToken = $null
$poliUmumId = $null
$layananId = $null
$targetDate = (Get-Date).ToString("yyyy-MM-dd")

Assert-Test "Admin Login" {
    $body = @{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No admin token" }
    $script:adminToken = $res.token
}

Assert-Test "Dokter Login" {
    $body = @{ email = "dokter@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No dokter token" }
    $script:dokterToken = $res.token
}

Assert-Test "Pasien Login" {
    $body = @{ email = "pasien@amanah.com"; password = "secret123" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method Post -Body $body -ContentType "application/json"
    if (-not $res.token) { throw "No pasien token" }
    $script:pasienToken = $res.token
}

$adminHeaders = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
$dokterHeaders = @{ Authorization = "Bearer $dokterToken"; "Content-Type" = "application/json" }
$pasienHeaders = @{ Authorization = "Bearer $pasienToken"; "Content-Type" = "application/json" }

Assert-Test "Fetch Active Poli and Layanan for Testing" {
    $clinics = Invoke-RestMethod -Uri "$baseUrl/clinics" -Method Get
    if (-not $clinics -or $clinics.Count -lt 1) { throw "No clinics found" }
    $poliUmum = $clinics | Where-Object { $_.kodePoli -eq "POLI-UMUM" }
    if (-not $poliUmum) { $poliUmum = $clinics[0] }
    $script:poliUmumId = $poliUmum.id
    
    $services = Invoke-RestMethod -Uri "$baseUrl/clinics/$($script:poliUmumId)/layanan" -Method Get
    if (-not $services -or $services.Count -lt 1) { throw "No services found for poli" }
    $script:layananId = $services[0].id
    Write-Host "   -> Poli: $($poliUmum.namaPoli) [$($poliUmum.kodePoli)], ID: $($script:poliUmumId), Layanan ID: $($script:layananId)" -ForegroundColor Gray
}

$dokterStaffId = $null
Assert-Test "Dokter views self profile to obtain staffId" {
    $res = Invoke-RestMethod -Uri "$baseUrl/staffs/me" -Method Get -Headers $dokterHeaders
    if (-not $res.id) { throw "Dokter profile has no ID" }
    $script:dokterStaffId = $res.id
    Write-Host "   -> Dokter Staff ID: $($res.id) [$($res.fullName)]" -ForegroundColor Gray
}

# -------------------------------------------------------------------
# 2. Schedules CRUD
# -------------------------------------------------------------------
Write-Host "`n--- 1. Schedules (Jadwal Praktek Dokter) CRUD ---" -ForegroundColor Yellow

$createdScheduleId = $null

Assert-Test "POST /schedules - Admin creates Doctor Schedule" {
    $body = @{
        staffId = $script:dokterStaffId
        poliklinikId = $script:poliUmumId
        specificDate = $script:targetDate
        session = "PAGI"
        startTime = "08:00"
        endTime = "12:00"
        capacity = 25
        notes = "Praktek Dokter Umum Pagi Reguler"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/schedules" -Method Post -Headers $adminHeaders -Body $body
    if (-not $res.id) { throw "Created schedule has no ID" }
    if ($res.session -ne "PAGI") { throw "Session mismatch: $($res.session)" }
    $script:createdScheduleId = $res.id
    Write-Host "   -> Created Schedule ID: $($res.id) for $($res.specificDate) [$($res.session)]" -ForegroundColor Gray
}

Assert-Test "GET /schedules - Query Schedules by Date and Poli" {
    $res = Invoke-RestMethod -Uri "$baseUrl/schedules?date=$($script:targetDate)&poliklinikId=$($script:poliUmumId)" -Method Get -Headers $adminHeaders
    if (-not $res -or $res.Count -lt 1) { throw "No schedules returned" }
    $found = $res | Where-Object { $_.id -eq $script:createdScheduleId }
    if (-not $found) { throw "Created schedule not found in query results" }
}

Assert-Test "GET /schedules/:id - Fetch Schedule detail" {
    $res = Invoke-RestMethod -Uri "$baseUrl/schedules/$($script:createdScheduleId)" -Method Get -Headers $adminHeaders
    if ($res.id -ne $script:createdScheduleId) { throw "Schedule ID mismatch" }
    if ($res.capacity -ne 25) { throw "Capacity mismatch: $($res.capacity)" }
}

Assert-Test "GET /schedules/poli/:poliklinikId - Active Schedules for Poliklinik" {
    $res = Invoke-RestMethod -Uri "$baseUrl/schedules/poli/$($script:poliUmumId)?date=$($script:targetDate)" -Method Get -Headers $pasienHeaders
    if (-not $res -or $res.Count -lt 1) { throw "No active schedules for poliklinik" }
}

Assert-Test "GET /schedules/my-schedules - Dokter views own Schedule" {
    $res = Invoke-RestMethod -Uri "$baseUrl/schedules/my-schedules" -Method Get -Headers $dokterHeaders
    if ($null -eq $res) { throw "My schedules returned null" }
}

Assert-Test "PATCH /schedules/:id - Update Schedule capacity and notes" {
    $body = @{
        capacity = 30
        notes = "Kuota ditambah 5 pasien tambahan"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/schedules/$($script:createdScheduleId)" -Method Patch -Headers $adminHeaders -Body $body
    if ($res.capacity -ne 30) { throw "Updated capacity mismatch: $($res.capacity)" }
}

Assert-Test "PATCH /schedules/:id/availability - Toggle availability" {
    $body = @{ isAvailable = $true } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/schedules/$($script:createdScheduleId)/availability" -Method Patch -Headers $adminHeaders -Body $body
    if (-not $res.isAvailable) { throw "isAvailable should be true" }
}

# -------------------------------------------------------------------
# 3. Appointments & Queue Lifecycle
# -------------------------------------------------------------------
Write-Host "`n--- 2. Appointments & Queue Full Lifecycle ---" -ForegroundColor Yellow

$createdAppointmentId = $null
$createdQueueNumber = $null

Assert-Test "POST /appointments - Pasien books appointment" {
    $body = @{
        poliklinikId = $script:poliUmumId
        layananId = $script:layananId
        appointmentDate = $script:targetDate
        session = "PAGI"
        visitType = "Pemeriksaan Baru"
        complaint = "Sakit kepala berdenyut sejak kemarin malam"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/appointments" -Method Post -Headers $pasienHeaders -Body $body
    if (-not $res.id) { throw "Created appointment has no ID" }
    if (-not $res.queueNumber) { throw "Queue number not generated" }
    $script:createdAppointmentId = $res.id
    $script:createdQueueNumber = $res.queueNumber
    Write-Host "   -> Auto Queue Ticket: $($res.queueNumber), Status: $($res.status)" -ForegroundColor Gray
}

Assert-Test "GET /appointments/me - Pasien views personal appointment history" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/me" -Method Get -Headers $pasienHeaders
    if (-not $res -or $res.Count -lt 1) { throw "No appointments returned for patient" }
    $found = $res | Where-Object { $_.id -eq $script:createdAppointmentId }
    if (-not $found) { throw "Created appointment not in patient history" }
}

Assert-Test "GET /appointments/:id - Fetch Appointment detail with relations" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:createdAppointmentId)" -Method Get -Headers $pasienHeaders
    if ($res.id -ne $script:createdAppointmentId) { throw "Appointment ID mismatch" }
    if (-not $res.patientName) { throw "patientName not populated" }
    if (-not $res.poliklinikName) { throw "poliklinikName not populated" }
}

Assert-Test "GET /appointments/queue/display - Live TV monitor display (Public)" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/queue/display?date=$($script:targetDate)&poliklinikId=$($script:poliUmumId)" -Method Get
    if ($null -eq $res.statistics) { throw "Display queue missing statistics" }
    Write-Host "   -> TV Queue: Total: $($res.statistics.totalQueue), Waiting: $($res.statistics.waiting)" -ForegroundColor Gray
}

Assert-Test "PATCH /appointments/:id/check-in - Patient checks in at reception" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:createdAppointmentId)/check-in" -Method Patch -Headers $adminHeaders
    if ($res.status -ne "MENUNGGU") { throw "Status after check-in should be MENUNGGU, got: $($res.status)" }
}

Assert-Test "GET /appointments/queue/daily - Dokter views Daily Queue" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/queue/daily?poliklinikId=$($script:poliUmumId)&date=$($script:targetDate)" -Method Get -Headers $dokterHeaders
    if (-not $res -or $res.Count -lt 1) { throw "No daily queue returned" }
    $found = $res | Where-Object { $_.id -eq $script:createdAppointmentId }
    if (-not $found) { throw "Checked-in appointment not found in daily queue" }
}

Assert-Test "PATCH /appointments/:id/call - Dokter calls patient into examination room" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:createdAppointmentId)/call" -Method Patch -Headers $dokterHeaders
    if ($res.status -ne "SEDANG_DIPERIKSA") { throw "Status after call should be SEDANG_DIPERIKSA, got: $($res.status)" }
    if (-not $res.calledAt) { throw "calledAt timestamp not recorded" }
}

Assert-Test "GET /appointments/queue/display - Verify TV display shows serving ticket" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/queue/display?date=$($script:targetDate)&poliklinikId=$($script:poliUmumId)" -Method Get
    if (-not $res.currentTicket) { throw "No current serving ticket on TV display" }
    if ($res.currentTicket.queueNumber -ne $script:createdQueueNumber) { throw "Serving ticket mismatch on display" }
    Write-Host "   -> TV Display Serving Ticket: $($res.currentTicket.queueNumber)" -ForegroundColor Gray
}

Assert-Test "PATCH /appointments/:id/complete - Dokter completes examination" {
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:createdAppointmentId)/complete" -Method Patch -Headers $dokterHeaders
    if ($res.status -ne "SELESAI") { throw "Status after complete should be SELESAI, got: $($res.status)" }
    if (-not $res.completedAt) { throw "completedAt timestamp not recorded" }
}

# -------------------------------------------------------------------
# 4. Cancellation & Cleanup
# -------------------------------------------------------------------
Write-Host "`n--- 3. Cancellation & Deletion Lifecycle ---" -ForegroundColor Yellow

$secondAppointmentId = $null

Assert-Test "POST /appointments - Book second appointment for cancellation test" {
    $body = @{
        poliklinikId = $script:poliUmumId
        layananId = $script:layananId
        appointmentDate = $script:targetDate
        session = "SIANG"
        visitType = "Kontrol Ulang"
        complaint = "Kontrol berkala pasca perawatan"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$baseUrl/appointments" -Method Post -Headers $pasienHeaders -Body $body
    if (-not $res.id) { throw "Second appointment has no ID" }
    $script:secondAppointmentId = $res.id
}

Assert-Test "PATCH /appointments/:id/cancel - Pasien cancels appointment" {
    $body = @{ reason = "Ada keperluan mendadak di luar kota" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "$baseUrl/appointments/$($script:secondAppointmentId)/cancel" -Method Patch -Headers $pasienHeaders -Body $body
    if ($res.status -ne "BATAL") { throw "Status should be BATAL, got: $($res.status)" }
    if ($res.cancellationReason -ne "Ada keperluan mendadak di luar kota") { throw "Cancellation reason mismatch" }
}

Assert-Test "DELETE /appointments/:id - Admin soft deletes appointment" {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/appointments/$($script:secondAppointmentId)" -Method Delete -Headers $adminHeaders
    if ($res.StatusCode -ne 204) { throw "Expected status 204, got $($res.StatusCode)" }
}

Assert-Test "DELETE /schedules/:id - Admin deletes test schedule" {
    $res = Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/schedules/$($script:createdScheduleId)" -Method Delete -Headers $adminHeaders
    if ($res.StatusCode -ne 204) { throw "Expected status 204, got $($res.StatusCode)" }
}

# -------------------------------------------------------------------
# Final Summary
# -------------------------------------------------------------------
Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "                TEST RESULTS SUMMARY" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Total Tests Run : $totalTests"
Write-Host "Passed          : $passedTests" -ForegroundColor Green
Write-Host "Failed          : $failedTests" -ForegroundColor $(if ($failedTests -eq 0) { "Green" } else { "Red" })

if ($failedTests -eq 0) {
    Write-Host "`n✨ ALL PHASE 2 SCHEDULE & QUEUE TESTS COMPLETED AND PASSED 100%!" -ForegroundColor Green
} else {
    Write-Host "`n❌ SOME TESTS FAILED." -ForegroundColor Red
    exit 1
}
