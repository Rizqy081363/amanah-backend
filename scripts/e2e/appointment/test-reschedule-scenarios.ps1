# ==============================================================================
# AMANAH HEALTHCARE - COMPREHENSIVE RESCHEDULE SCENARIOS TEST (E2E)
# ==============================================================================
# Tests multi-appointment queue distribution across:
# 1. Same-day cross-session reschedule (e.g. Morning -> Night tail compaction)
# 2. Cross-date reschedule to a date with existing active queue
# 3. Queue tail allocation, compaction, carried_over flags, and DB audit integrity
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [SCENARIO MULTI-QUEUE] APPOINTMENT RESCHEDULE VARIATIONS & QUEUE COMPACTION" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# ------------------------------------------------------------------------------
# 1. Target Dates Setup & Fresh Database Cleanup
# ------------------------------------------------------------------------------
# Date 1: Tomorrow (fresh canvas)
# Date 2: Day after tomorrow (fresh canvas)
$date1 = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$date2 = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")

Write-Host "`n[PHASE 0] Purging Prior Records for Fresh Deterministic Testing ($date1, $date2)..." -ForegroundColor Yellow
Run-DockerSql "DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date IN ('$date1', '$date2'));"
Run-DockerSql "DELETE FROM queue_tickets WHERE queue_date IN ('$date1', '$date2');"
Run-DockerSql "DELETE FROM appointments WHERE scheduled_date IN ('$date1', '$date2');"
Write-Host " [CLEANUP] Database tables purged for target test dates ($date1, $date2)." -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2. Authenticate Admin and Discover Base Resources
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 1] Setup & Prerequisites..." -ForegroundColor Yellow
$adminAuth = Login-Admin
Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

# Discover Polyclinic and Service
$clinics = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics" -Method Get -Headers $adminAuth.headers))
Assert-Test "Active polyclinics discovered" ($clinics.Count -gt 0)
$targetPoli = $clinics | Where-Object { $_.kodePoli -eq 'POLI-UMUM' } | Select-Object -First 1
if (-not $targetPoli) { $targetPoli = $clinics[0] }
$poliId = $targetPoli.id

$services = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$poliId/layanan" -Method Get -Headers $adminAuth.headers))
Assert-Test "Polyclinic has available services" ($services.Count -gt 0)
$targetService = $services[0]
$serviceId = $targetService.id
Write-Host " Target Poliklinik: $($targetPoli.namaPoli) ($poliId)" -ForegroundColor Cyan
Write-Host " Target Layanan   : $($targetService.namaLayanan) ($serviceId)" -ForegroundColor Cyan

# Fetch 8 distinct patient profiles from DB to prevent Rule H2 same-day conflicts
$dbPatientsRaw = Run-DockerSql "SELECT id, full_name FROM patient_profiles ORDER BY created_at ASC LIMIT 8;"
$patientLines = $dbPatientsRaw -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$patientList = @()
foreach ($line in $patientLines) {
    $parts = $line.Split('|')
    if ($parts.Count -ge 2) {
        $patientList += @{
            id = $parts[0].Trim()
            name = $parts[1].Trim()
        }
    }
}
Assert-Test "Sufficient distinct patients found for queue tests" ($patientList.Count -ge 6)
Write-Host " Loaded $($patientList.Count) distinct patient profiles from database." -ForegroundColor Green

# Helper to book appointment
function Book-AppointmentHelper([string]$patientIdParam, [string]$date, [string]$sess, [string]$label) {
    $payload = @{
        patientId = $patientIdParam
        poliklinikId = $poliId
        layananId = $serviceId
        appointmentDate = $date
        session = $sess
        visitType = "new_visit"
        complaint = "Sample queue testing - $label"
    } | ConvertTo-Json

    $res = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $payload -Headers $adminAuth.headers)
    return $res
}

# ------------------------------------------------------------------------------
# 3. SCENARIO A: Pre-populate Fresh Date 1 with Morning (morning) and Night (night)
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 2] Populating Date 1 with Morning (morning) and Night (night) Queues..." -ForegroundColor Yellow

# Morning: 3 appointments
Write-Host " Creating 3 appointments in Session morning on $date1..." -ForegroundColor Yellow
$pagi1 = Book-AppointmentHelper $patientList[0].id $date1 "morning" "PAGI-1"
Write-Host "  PAGI-1: ID=$($pagi1.id), Queue=$($pagi1.queueNumber)" -ForegroundColor Cyan

$pagi2 = Book-AppointmentHelper $patientList[1].id $date1 "morning" "PAGI-2"
Write-Host "  PAGI-2: ID=$($pagi2.id), Queue=$($pagi2.queueNumber)" -ForegroundColor Cyan

$pagi3 = Book-AppointmentHelper $patientList[2].id $date1 "morning" "PAGI-3"
Write-Host "  PAGI-3: ID=$($pagi3.id), Queue=$($pagi3.queueNumber)" -ForegroundColor Cyan

$servicePrefix = $pagi1.queueNumber.Substring(0, 3)
Assert-Test "Morning appointments created with sequential numbers" ($pagi1.queueNumber -eq "${servicePrefix}P001" -and $pagi2.queueNumber -eq "${servicePrefix}P002" -and $pagi3.queueNumber -eq "${servicePrefix}P003")

# Night: 3 appointments
Write-Host " Creating 3 appointments in Session night on $date1..." -ForegroundColor Yellow
$malam1 = Book-AppointmentHelper $patientList[3].id $date1 "night" "MALAM-1"
Write-Host "  MALAM-1: ID=$($malam1.id), Queue=$($malam1.queueNumber)" -ForegroundColor Cyan

$malam2 = Book-AppointmentHelper $patientList[4].id $date1 "night" "MALAM-2"
Write-Host "  MALAM-2: ID=$($malam2.id), Queue=$($malam2.queueNumber)" -ForegroundColor Cyan

$malam3 = Book-AppointmentHelper $patientList[5].id $date1 "night" "MALAM-3"
Write-Host "  MALAM-3: ID=$($malam3.id), Queue=$($malam3.queueNumber)" -ForegroundColor Cyan

Assert-Test "Night appointments created with night session prefixes" ($malam1.queueNumber -eq "${servicePrefix}M004" -and $malam2.queueNumber -eq "${servicePrefix}M005" -and $malam3.queueNumber -eq "${servicePrefix}M006")

# ------------------------------------------------------------------------------
# 4. SCENARIO A RESCHEDULE: Move PAGI-2 to night on Date 1
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 3] Rescheduling PAGI-2 from Morning to Night on Date 1..." -ForegroundColor Yellow
$rescheduleA_Payload = @{
    target_date = $date1
    session = "night"
} | ConvertTo-Json

$rescheduledA = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$($pagi2.id)/reschedule" -Method Post -Body $rescheduleA_Payload -Headers $adminAuth.headers)

Assert-Test "Reschedule A succeeded" ($null -ne $rescheduledA)
Assert-Test "Appointment status remains BOOKED" ($rescheduledA.status -eq "BOOKED" -or $rescheduledA.status -eq "booked")
Assert-Test "Rescheduled appointment session updated to night" ($rescheduledA.session -eq "night" -or $rescheduledA.sessionName -match "night|malam")
Write-Host " New Queue Number for Rescheduled PAGI-2: $($rescheduledA.queueNumber)" -ForegroundColor Green

# Query the database queue ordering for all appointments on Date 1
$dbActiveQueueDate1 = Run-DockerSql "SELECT a.id, a.queue_number, qt.queue_number FROM appointments a JOIN queue_tickets qt ON a.id = qt.appointment_id WHERE a.scheduled_date = '$date1' ORDER BY a.queue_number ASC;"
Write-Host "`nActive Queue State on Date 1 post-reschedule:" -ForegroundColor Cyan
Write-Host $dbActiveQueueDate1 -ForegroundColor Cyan

# Verify:
# 1. PAGI-2 is at the tail of the night session (position 6, queue_number KR-M006)
# 2. PAGI-3 was compacted from KR-P003 down to KR-P002 in the morning session
$dbPagi3 = Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$($pagi3.id)';"
Assert-Test "PAGI-3 was compacted smoothly to position 2" ($dbPagi3.Trim() -eq "${servicePrefix}P002")

$dbRescheduledA = Run-DockerSql "SELECT carried_over, queue_number FROM queue_tickets WHERE appointment_id = '$($pagi2.id)';"
Assert-Test "Rescheduled PAGI-2 placed at the TAIL of the active queue" ($dbRescheduledA -match "${servicePrefix}M006")
Assert-Test "Database ticket for PAGI-2 marked carried_over=true" ($dbRescheduledA -match "t\|")

# ------------------------------------------------------------------------------
# 5. SCENARIO B: Cross-Date Reschedule with Existing Queue on Target Date
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 4] Pre-populating Date 2 with existing morning queue..." -ForegroundColor Yellow
$date2_1 = Book-AppointmentHelper $patientList[0].id $date2 "morning" "DATE2-1"
Write-Host "  Date2-PAGI-1: ID=$($date2_1.id), Queue=$($date2_1.queueNumber)" -ForegroundColor Cyan

$date2_2 = Book-AppointmentHelper $patientList[1].id $date2 "morning" "DATE2-2"
Write-Host "  Date2-PAGI-2: ID=$($date2_2.id), Queue=$($date2_2.queueNumber)" -ForegroundColor Cyan

$date2Prefix = $date2_1.queueNumber.Substring(0, 3)
Assert-Test "Date 2 initial morning appointments created" ($date2_1.queueNumber -eq "${date2Prefix}P001" -and $date2_2.queueNumber -eq "${date2Prefix}P002")

# Now reschedule PAGI-3 from Date 1 to Date 2 in session morning
Write-Host "`n[PHASE 5] Rescheduling PAGI-3 from Date 1 to Date 2 (Session morning)..." -ForegroundColor Yellow
$rescheduleB_Payload = @{
    target_date = $date2
    session = "morning"
} | ConvertTo-Json

$rescheduledB = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$($pagi3.id)/reschedule" -Method Post -Body $rescheduleB_Payload -Headers $adminAuth.headers)

Assert-Test "Reschedule B succeeded" ($null -ne $rescheduledB)
Assert-Test "Appointment scheduled date updated to Date 2 ($date2)" ($rescheduledB.appointmentDate -eq $date2)
Write-Host " New Queue Number for PAGI-3 on Date 2: $($rescheduledB.queueNumber)" -ForegroundColor Green

Assert-Test "Rescheduled appointment placed at the TAIL of Date 2's morning queue" ($rescheduledB.queueNumber -eq "${date2Prefix}P003")

# Verify DB state of Ticket B
$dbTicketB = Run-DockerSql "SELECT to_char(queue_date, 'YYYY-MM-DD'), carried_over, queue_number FROM queue_tickets WHERE appointment_id = '$($pagi3.id)';"
Assert-Test "Database ticket for PAGI-3 reflects new date ($date2)" ($dbTicketB -match $date2)
Assert-Test "Database ticket for PAGI-3 marked carried_over=true" ($dbTicketB -match "t\|")
Write-Host " Database Ticket Record: $dbTicketB" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 6. Audit Trail Verification in Database
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 6] Verifying Database Audit Trail (appointment_status_events)..." -ForegroundColor Yellow
$eventsA = Run-DockerSql "SELECT count(*) FROM appointment_status_events WHERE appointment_id = '$($pagi2.id)';"
Assert-Test "Audit event recorded for Reschedule A" ([int]$eventsA.Trim() -ge 1)

$eventsB = Run-DockerSql "SELECT count(*) FROM appointment_status_events WHERE appointment_id = '$($pagi3.id)';"
Assert-Test "Audit event recorded for Reschedule B" ([int]$eventsB.Trim() -ge 1)

Write-Host "`n[COMPLETED] All multi-queue and cross-date reschedule scenarios successfully verified!" -ForegroundColor Green
if ($Standalone) { Print-TestSummary "Appointment Reschedule Variations Suite" }
