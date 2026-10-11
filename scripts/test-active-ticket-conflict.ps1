$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\e2e\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " TEST: ONE ACTIVE TICKET PER PATIENT PER CATEGORY (RULE H2 & DB CONSTRAINT)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

$apiUrl = Get-E2EApiBaseUrl
$patientAuth = Login-User "pasien@amanah.com" "secret123"
$headers = $patientAuth.headers

$patientId = "713184cd-bc43-4ff6-b958-2692e686a1f6"
$categoryId = "c993f9d1-6cac-4710-b682-4795974189a6"
$layananId = "ce594a2b-b609-40d1-95fa-1124c7805864"
$testDate = "2026-10-11"

# ------------------------------------------------------------------------------
# STEP 1: Verify Pre-Check Endpoint GET /api/v1/appointments/active-ticket
# ------------------------------------------------------------------------------
Write-Host "`n[1] Testing GET /api/v1/appointments/active-ticket endpoint..." -ForegroundColor Yellow
$checkUri = "$apiUrl/appointments/active-ticket?patientId=$patientId&categoryId=$categoryId&date=$testDate"
$checkRes = Invoke-RestMethod -Uri $checkUri -Method Get -Headers $headers

Assert-Test "Pre-check endpoint returns hasActiveTicket = true" ($checkRes.hasActiveTicket -eq $true) "Expected hasActiveTicket true"
Assert-Test "Pre-check returns existing ticket USG-S001" ($checkRes.activeTicket.queueNumber -eq "USG-S001") "Queue number mismatch: $($checkRes.activeTicket.queueNumber)"
Write-Host "  Found active ticket: $($checkRes.activeTicket.queueNumber) (status: $($checkRes.activeTicket.status))" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# STEP 2: Attempt Duplicate Booking via POST /api/v1/appointments (Expect 409 Conflict)
# ------------------------------------------------------------------------------
Write-Host "`n[2] Testing POST /api/v1/appointments duplicate booking (expecting 409 Conflict, NOT 500)..." -ForegroundColor Yellow

$bookingPayload = @{
    patientId = $patientId
    layananId = $layananId
    poliklinikId = "8f3e2ba0-c65a-4b0d-b4b1-8b0bb3b31350"
    appointmentDate = $testDate
    session = "SIANG"
    visitType = "Pemeriksaan Baru"
    complaint = "Test duplicate booking guard"
} | ConvertTo-Json

$gotConflict = $false
$statusCode = 0
$responseBody = $null

try {
    $res = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $headers -Body $bookingPayload
    Write-Host "  UNEXPECTED SUCCESS: $($res | ConvertTo-Json -Compress)" -ForegroundColor Red
} catch {
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $responseBody = $_.ErrorDetails.Message | ConvertFrom-Json
    } elseif ($_.Exception.Response.Content) {
        $raw = $_.Exception.Response.Content.ReadAsStringAsync().Result
        $responseBody = $raw | ConvertFrom-Json
    }
}

Assert-Test "Duplicate booking returns HTTP 409 Conflict (not 500)" ($statusCode -eq 409) "Got HTTP status code: $statusCode"
Assert-Test "Error code is ACTIVE_TICKET_CONFLICT" ($responseBody.code -eq "ACTIVE_TICKET_CONFLICT") "Got code: $($responseBody.code)"
Assert-Test "Response includes activeTicket object" ($null -ne $responseBody.activeTicket) "activeTicket is null in response"
Assert-Test "Active ticket queue number is USG-S001" ($responseBody.activeTicket.queueNumber -eq "USG-S001") "Expected USG-S001, got $($responseBody.activeTicket.queueNumber)"

Write-Host "  Conflict message: $($responseBody.message)" -ForegroundColor Green
Write-Host "  Active ticket details: ID $($responseBody.activeTicket.id), No $($responseBody.activeTicket.queueNumber), Status $($responseBody.activeTicket.status)" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# STEP 3: Verify Database Invariant - No Orphan Appointment Created
# ------------------------------------------------------------------------------
Write-Host "`n[3] Verifying no orphaned appointment was inserted in database..." -ForegroundColor Yellow
$orphanQuery = "SELECT count(*) FROM appointments WHERE patient_id = '$patientId' AND scheduled_date = '$testDate' AND complaint = 'Test duplicate booking guard';"
$orphanCount = Run-DockerSql $orphanQuery
Assert-Test "Orphan appointment count is 0" ([int]$orphanCount.Trim() -eq 0) "Orphan count in DB: $orphanCount"

Print-TestSummary "Active Ticket Policy & Conflict Guard"
