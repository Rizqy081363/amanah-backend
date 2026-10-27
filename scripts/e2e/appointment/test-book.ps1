# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: APPOINTMENT BOOKING (HONEST RUNTIME DISCOVERY)
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [SCENARIO 1] APPOINTMENT BOOKING JOURNEY (API-FIRST & RUNTIME TRUTH)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# 1. Login Patient
Write-Host "`n[STEP 1] Authenticating as Patient..." -ForegroundColor Yellow
$patientAuth = Login-Patient
Assert-Test "Patient authenticated successfully" ($null -ne $patientAuth.token -and $patientAuth.token.Length -gt 20)

# 2. Discover Patient Profile / Primary Affiliation
Write-Host "`n[STEP 2] Discovering Patient Affiliations..." -ForegroundColor Yellow
$affiliations = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/patients/affiliations/me" -Method Get -Headers $patientAuth.headers))
Assert-Test "Patient has at least one active profile/affiliation" ($affiliations.Count -gt 0)
$primaryAff = $affiliations | Where-Object { $_.isPrimary -eq $true } | Select-Object -First 1
if (-not $primaryAff) { $primaryAff = $affiliations[0] }
$targetPatientId = $primaryAff.patientId
Assert-Test "Primary Patient ID extracted from runtime" ($null -ne $targetPatientId -and $targetPatientId.Length -gt 10)

# 3. Discover Active Polyclinics
Write-Host "`n[STEP 3] Discovering Active Polyclinics..." -ForegroundColor Yellow
$clinics = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics" -Method Get -Headers $patientAuth.headers))
Assert-Test "Active polyclinics discovered" ($clinics.Count -gt 0)
$targetPoli = $clinics | Where-Object { $_.kodePoli -eq 'POLI-UMUM' } | Select-Object -First 1
if (-not $targetPoli) { $targetPoli = $clinics[0] }
$poliId = $targetPoli.id
Assert-Test "Target Polyclinic ID extracted ($($targetPoli.namaPoli))" ($null -ne $poliId)

# 4. Discover Available Services for Polyclinic
Write-Host "`n[STEP 4] Discovering Services for Polyclinic..." -ForegroundColor Yellow
$services = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$poliId/layanan" -Method Get -Headers $patientAuth.headers))
Assert-Test "Polyclinic has available services" ($services.Count -gt 0)
$targetService = $services[0]
$serviceId = $targetService.id
Assert-Test "Target Service extracted ($($targetService.namaLayanan))" ($null -ne $serviceId)

# 5. Discover Open Schedule Options for Target Date
Write-Host "`n[STEP 5] Discovering Open Session Shifts..." -ForegroundColor Yellow
$bookingDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

# Purge any prior active tickets for target patient on this date to satisfy Rule H2
Run-DockerSql "DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$bookingDate' AND patient_id = '$targetPatientId');"
Run-DockerSql "DELETE FROM queue_tickets WHERE queue_date = '$bookingDate' AND patient_id = '$targetPatientId';"
Run-DockerSql "DELETE FROM appointments WHERE scheduled_date = '$bookingDate' AND patient_id = '$targetPatientId';"

$bookingOptions = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/schedules/booking-options?date=$bookingDate" -Method Get -Headers $patientAuth.headers)
Assert-Test "Schedule booking options returned for target date" ($null -ne $bookingOptions.sessions)

$openSession = $bookingOptions.sessions | Where-Object { $_.isDisabled -ne $true } | Select-Object -First 1
if (-not $openSession) { $openSession = $bookingOptions.sessions[0] }
$sessionCode = if ($openSession.session) { $openSession.session } else { "morning" }
Write-Host " Selected Open Session: $sessionCode ($($openSession.startTime) - $($openSession.endTime))" -ForegroundColor Cyan

# 6. Execute Booking Request via API
Write-Host "`n[STEP 6] Submitting Appointment Booking..." -ForegroundColor Yellow
$bookPayload = @{
    patientId = $targetPatientId
    poliklinikId = $poliId
    layananId = $serviceId
    appointmentDate = $bookingDate
    session = $sessionCode
    visitType = "new_visit"
    complaint = "Pemeriksaan kesehatan rutin berkala (E2E Test)"
} | ConvertTo-Json

$createdAppt = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $bookPayload -Headers $patientAuth.headers)
$createdAptId = $createdAppt.id
Assert-Test "Appointment created and returned valid UUID" ($null -ne $createdAptId -and $createdAptId.Length -gt 20)
Assert-Test "Queue number assigned in response" ($null -ne $createdAppt.queueNumber)
Assert-Test "Appointment status is booked" ($createdAppt.status -eq "booked")
Write-Host " Created Appointment: ID=$createdAptId, QueueNo=$($createdAppt.queueNumber), BookingCode=$($createdAppt.bookingCode)" -ForegroundColor Green

# 7. Verify via Downstream Patient Read Model (/appointments/me)
Write-Host "`n[STEP 7] Verifying Patient Appointment Read Model..." -ForegroundColor Yellow
$myAppts = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/me" -Method Get -Headers $patientAuth.headers)
$foundInReadModel = $myAppts | Where-Object { $_.id -eq $createdAptId }
Assert-Test "Newly created appointment visible in GET /appointments/me" ($null -ne $foundInReadModel)

# 8. Verify Direct Database State via Docker PostgreSQL
Write-Host "`n[STEP 8] Verifying Database State via Docker PostgreSQL..." -ForegroundColor Yellow
$dbAptStatus = Run-DockerSql "SELECT status FROM appointments WHERE id = '$createdAptId';"
Assert-Test "Database appointments.status matches 'booked'" ($dbAptStatus.Trim() -eq "booked")

$dbTicket = Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$createdAptId';"
Assert-Test "Database queue_tickets record exists and has queue_number" (-not [string]::IsNullOrWhiteSpace($dbTicket))

Write-Host "`n[SCENARIO 1 COMPLETED] Booking test passed honestly without synthetic mocks." -ForegroundColor Green
if ($Standalone) { Print-TestSummary "Appointment Booking Scenario" }

# Export created ID for chained suites if needed
$global:LastCreatedAppointmentId = $createdAptId
return $createdAppt
