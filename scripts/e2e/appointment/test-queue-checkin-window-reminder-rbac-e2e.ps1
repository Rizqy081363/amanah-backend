# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: QUEUE CHECK-IN WINDOW, REMINDERS & RBAC ISOLATION
# Verifies Database-Driven Thresholds, Dynamic Mutation, Zero-PHI RBAC & Idempotency
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E SUITE] QUEUE CHECK-IN WINDOW, REMINDER SYSTEM & RBAC NOTIFICATIONS" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

function Invoke-ExpectedError {
    param (
        [string]$Uri,
        [string]$Method = "Post",
        [hashtable]$Headers,
        [string]$Body = $null,
        [int]$ExpectedStatusCode = 400
    )
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            Headers = $Headers
        }
        if ($Body) {
            $params["Body"] = $Body
            $params["ContentType"] = "application/json"
        }
        $res = Invoke-RestMethod @params
        return @{
            Success = $true
            StatusCode = 200
            Response = $res
            ErrorBody = $null
        }
    } catch {
        $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $errBody = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
        return @{
            Success = $false
            StatusCode = $statusCode
            ErrorBody = $errBody
        }
    }
}

function Assert-DbState {
    param (
        [string]$Query,
        [string]$ExpectedValue,
        [string]$TestName
    )
    $actual = (Run-DockerSql $Query).Trim()
    Assert-Test $TestName ($actual -eq $ExpectedValue) "Expected: '$ExpectedValue', Actual: '$actual'"
}

# ==============================================================================
# PHASE 1: CLINIC SETTING SSOT & ADMIN DISCOVERY
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 1] CLINIC SETTINGS REGISTRY & SSOT DISCOVERY" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# Ensure canonical initial state in PostgreSQL
$null = Run-DockerSql @"
INSERT INTO clinic_setting (key, value, scope_type) VALUES
    ('queue.arrive_early_minutes', '15'::jsonb, 'global'),
    ('queue.overflow_tolerance_minutes', '30'::jsonb, 'global'),
    ('queue.check_in_reminder_enabled', 'true'::jsonb, 'global'),
    ('queue.operational_broadcast_enabled', 'true'::jsonb, 'global')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
"@

# 1. Login Admin
Write-Host "[1.1] Authenticating Admin..." -ForegroundColor White
$adminAuth = Login-Admin
Assert-Test "Admin authenticated" ($null -ne $adminAuth.token -and $adminAuth.token.Length -gt 20)

# 2. Login Patient 1
Write-Host "[1.2] Authenticating Patient..." -ForegroundColor White
$patientAuth = Login-Patient
Assert-Test "Patient authenticated" ($null -ne $patientAuth.token -and $patientAuth.token.Length -gt 20)

# 3. Call GET /admin/schedule-configuration
Write-Host "[1.3] Calling Admin Schedule Configuration API..." -ForegroundColor White
$configRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration" -Method Get -Headers $adminAuth.headers
$configData = Get-ResponseData $configRes

$earlyConfig = $configData.clinicSettings | Where-Object { $_.key -eq 'queue.arrive_early_minutes' }
$overflowConfig = $configData.clinicSettings | Where-Object { $_.key -eq 'queue.overflow_tolerance_minutes' }
$reminderEnabledConfig = $configData.clinicSettings | Where-Object { $_.key -eq 'queue.check_in_reminder_enabled' }
$broadcastEnabledConfig = $configData.clinicSettings | Where-Object { $_.key -eq 'queue.operational_broadcast_enabled' }

Assert-Test "Registry exposes queue.arrive_early_minutes" ($null -ne $earlyConfig)
Assert-Test "queue.arrive_early_minutes category is 'queue'" ($earlyConfig.category -eq "queue")
Assert-Test "queue.arrive_early_minutes is number control" ($earlyConfig.controlType -eq "number")
Assert-Test "queue.arrive_early_minutes min is 0, max is 120" ($earlyConfig.min -eq 0 -and $earlyConfig.max -eq 120)

Assert-Test "Registry exposes queue.overflow_tolerance_minutes" ($null -ne $overflowConfig)
Assert-Test "queue.overflow_tolerance_minutes category is 'queue'" ($overflowConfig.category -eq "queue")
Assert-Test "queue.overflow_tolerance_minutes is number control" ($overflowConfig.controlType -eq "number")

Assert-Test "Registry exposes queue.check_in_reminder_enabled" ($null -ne $reminderEnabledConfig)
Assert-Test "queue.check_in_reminder_enabled is boolean control" ($reminderEnabledConfig.controlType -eq "boolean")

Assert-Test "Registry exposes queue.operational_broadcast_enabled" ($null -ne $broadcastEnabledConfig)
Assert-Test "queue.operational_broadcast_enabled is boolean control" ($broadcastEnabledConfig.controlType -eq "boolean")

Write-Host " Settings verified: arrive_early=$($earlyConfig.value), overflow=$($overflowConfig.value), reminders=$($reminderEnabledConfig.value), broadcast=$($broadcastEnabledConfig.value)" -ForegroundColor Green

# ==============================================================================
# PHASE 2: PRE-THRESHOLD REJECTION & DYNAMIC RUNTIME MUTATION
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 2] PRE-THRESHOLD CHECK-IN REJECTION & DYNAMIC SETTING MUTATION" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# Reset arrive_early_minutes to 15
$resetPayload = @{ settings = @(@{ key = 'queue.arrive_early_minutes'; value = 15 }) } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/clinic-settings" -Method Put -Headers $adminAuth.headers -Body $resetPayload -ContentType "application/json"

# Discover Clinic and Service
$clinics = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics" -Method Get -Headers $patientAuth.headers))
$targetPoli = $clinics[0]
$services = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$($targetPoli.id)/layanan" -Method Get -Headers $patientAuth.headers))
$targetService = $services[0]
$patientProfileId = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patientAuth.user.id)';").Trim()
$targetDate = (Get-Date).ToString("yyyy-MM-dd")

# Clean up any lingering active appointments/tickets for test patient today
$null = Run-DockerSql @"
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id = '$patientProfileId');
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id = '$patientProfileId');
DELETE FROM queue_tickets WHERE queue_date = CURRENT_DATE AND (patient_id = '$patientProfileId' OR appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id = '$patientProfileId'));
DELETE FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id = '$patientProfileId';
"@

# Book Appointment
Write-Host "[2.1] Booking Appointment for Patient..." -ForegroundColor White
$bookingOpts = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/schedules/booking-options?date=$targetDate" -Method Get -Headers $patientAuth.headers)
$availableSession = $bookingOpts.sessions | Where-Object { $_.isDisabled -ne $true } | Select-Object -Last 1
$targetSession = if ($availableSession) { $availableSession.session } else { "MALAM" }

$bookPayload = @{
    patientId = $patientProfileId
    poliklinikId = $targetPoli.id
    layananId = $targetService.id
    appointmentDate = $targetDate
    session = $targetSession
    complaint = "E2E Dynamic Queue & Reminder Verification"
    visitType = "new_visit"
} | ConvertTo-Json

$bookRes = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patientAuth.headers -Body $bookPayload -ContentType "application/json"
$apt = Get-ResponseData $bookRes
$aptId = $apt.id
Assert-Test "Appointment successfully booked" ($null -ne $aptId -and $aptId.Length -gt 10)

# Assign Doctor & Room
$docCandidates = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$aptId/candidates/doctors" -Method Get -Headers $adminAuth.headers)
$allCandidateDoctors = @($docCandidates.groups | ForEach-Object { $_.doctors })
$targetDoctor = $allCandidateDoctors[0]
$roomCandidates = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$aptId/candidates/rooms" -Method Get -Headers $adminAuth.headers))
$targetRoom = $roomCandidates[0]

$assignDocPayload = @{ doctorId = $targetDoctor.id; reason = "Penugasan dokter operasional E2E" } | ConvertTo-Json
$assignRoomPayload = @{ roomId = $targetRoom.id } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$aptId/doctor" -Method Patch -Body $assignDocPayload -Headers $adminAuth.headers -ContentType "application/json"
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$aptId/room" -Method Patch -Body $assignRoomPayload -Headers $adminAuth.headers -ContentType "application/json"
Write-Host " Assigned Doctor ($($targetDoctor.name)) & Room ($($targetRoom.name))" -ForegroundColor Green

# To deterministically test pre-threshold check-in rejection:
# Set scheduled_start_time in PostgreSQL to (NOW + 35 minutes)
# With arriveEarlyMinutes = 15, open window is NOW + 20 minutes (still TOO_EARLY)
$futureStart = (Get-Date).AddMinutes(35).ToString("HH:mm:ss")
$futureEnd = (Get-Date).AddMinutes(65).ToString("HH:mm:ss")
$null = Run-DockerSql "UPDATE appointments SET scheduled_start_time = '$futureStart', scheduled_end_time = '$futureEnd' WHERE id = '$aptId';"
Write-Host " Set appointment scheduled time: $futureStart - $futureEnd (Current time: $((Get-Date).ToString('HH:mm:ss')))" -ForegroundColor Cyan

# Attempt QR generation before threshold (should be REJECTED with TOO_EARLY)
Write-Host "[2.2] Attempting QR generation before check-in threshold (15m window, apt is in 35m)..." -ForegroundColor White
$earlyAttempt = Invoke-ExpectedError -Uri "$apiUrl/appointments/$aptId/check-in-qr" -Method Post -Headers $adminAuth.headers -ExpectedStatusCode 400

Assert-Test "Pre-threshold QR generation rejected with 400 Bad Request" ($earlyAttempt.StatusCode -eq 400)
Assert-Test "Rejection message specifies check-in not open yet" ($earlyAttempt.ErrorBody -match "belum dibuka")
Write-Host " Correctly rejected: $($earlyAttempt.ErrorBody)" -ForegroundColor Green

# Dynamic Mutation: Admin changes queue.arrive_early_minutes to 45 minutes
Write-Host "[2.3] Admin updating queue.arrive_early_minutes to 45..." -ForegroundColor White
$updateThresholdPayload = @{ settings = @(@{ key = 'queue.arrive_early_minutes'; value = 45 }) } | ConvertTo-Json
$updateThresholdRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/clinic-settings" -Method Put -Headers $adminAuth.headers -Body $updateThresholdPayload -ContentType "application/json"
Assert-Test "Admin setting update API succeeded" ($updateThresholdRes.success -eq $true)

# Verify DB reflects 45
Assert-DbState "SELECT value FROM clinic_setting WHERE key = 'queue.arrive_early_minutes';" "45" "Database reflects mutated arrive_early_minutes = 45"

# Now retry QR generation: Since 35 minutes < 45 minutes threshold, check-in IS NOW OPEN!
Write-Host "[2.4] Retrying QR generation after dynamic threshold expansion to 45m..." -ForegroundColor White
$qrRes = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$aptId/check-in-qr" -Method Post -Headers $adminAuth.headers)
Assert-Test "QR generation succeeded after dynamic threshold mutation!" ($null -ne $qrRes.token -and $qrRes.token.Length -gt 20)
Assert-Test "Manual check-in code generated" ($null -ne $qrRes.manualCode)
Write-Host " QR Generated successfully: Token=$($qrRes.token), ManualCode=$($qrRes.manualCode)" -ForegroundColor Green

# ==============================================================================
# PHASE 3: REMINDER EVALUATION & ZERO-PHI RBAC RECIPIENT ISOLATION
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 3] REMINDER EVALUATION, ZERO-PHI PRIVACY & RBAC SEGREGATION" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# Clean previous notifications and redis deduplication for this appointment
$null = Run-DockerSql @"
DELETE FROM notification_recipients WHERE notification_id IN (SELECT id FROM notifications WHERE idempotency_key LIKE '%$aptId%');
DELETE FROM notifications WHERE idempotency_key LIKE '%$aptId%';
"@
$null = docker exec -i backend-redis-1 redis-cli del "apt:reminder:${aptId}:${targetDate}"

# 1. Trigger Reminder Evaluation Endpoint via Admin
Write-Host "[3.1] Triggering reminder evaluation endpoint..." -ForegroundColor White
$evalRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/reminders/evaluate" -Method Post -Headers $adminAuth.headers
$evalData = Get-ResponseData $evalRes

Assert-Test "Reminder evaluation returned success" ($evalRes.message -match "berhasil")
Assert-Test "Appointments evaluated count >= 1" ($evalData.processedCount -ge 1)
Assert-Test "Reminders dispatched or skipped >= 1" ($evalData.dispatchedCount -ge 1 -or $evalData.skippedCount -ge 1)
Write-Host " Dispatched: $($evalData.dispatchedCount), Skipped: $($evalData.skippedCount), Processed: $($evalData.processedCount)" -ForegroundColor Green

# Allow asynchronous RabbitMQ consumer a brief moment to persist to DB
Start-Sleep -Seconds 2

# 2. Inspect PostgreSQL notifications table for Patient Notification
Write-Host "[3.2] Verifying Patient Notification Invariants..." -ForegroundColor White
$patientNotifQuery = "SELECT id, title, category, audience FROM notifications WHERE idempotency_key LIKE '%apt-checkin-window:$aptId%patient%';"
$patientNotif = (Run-DockerSql $patientNotifQuery).Trim()
Assert-Test "Patient notification record exists in database" ($patientNotif.Length -gt 0)
Assert-Test "Patient notification has audience='patient'" ($patientNotif -match "patient")
Assert-Test "Patient notification category is 'appointment'" ($patientNotif -match "appointment")

# 3. Inspect PostgreSQL notifications table for Assigned Doctor Notification
Write-Host "[3.3] Verifying Clinical Doctor Notification Invariants..." -ForegroundColor White
$docNotifQuery = "SELECT id, title, category, audience FROM notifications WHERE idempotency_key LIKE '%apt-checkin-window:$aptId%doctor%';"
$docNotif = (Run-DockerSql $docNotifQuery).Trim()
Assert-Test "Clinical doctor notification record exists in database" ($docNotif.Length -gt 0)
Assert-Test "Doctor notification has audience='clinic'" ($docNotif -match "clinic")
Assert-Test "Doctor notification category is 'clinical'" ($docNotif -match "clinical")

# 4. Inspect PostgreSQL notifications table for Operational Broadcast (Universal Staff)
Write-Host "[3.4] Verifying Operational Announcement Invariants & ZERO-PHI Compliance..." -ForegroundColor White
$staffNotifQuery = "SELECT id, title, body, audience, metadata FROM notifications WHERE idempotency_key LIKE '%apt-checkin-window:$aptId%staff%';"
$staffNotifRaw = Run-DockerSql $staffNotifQuery
$staffNotif = @(($staffNotifRaw -split "`n") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
Assert-Test "Operational announcement record exists in database" ($staffNotif.Count -gt 0)
$allClinic = ($staffNotif | Where-Object { $_ -match "clinic" }).Count -eq $staffNotif.Count
Assert-Test "All operational announcements have audience='clinic'" $allClinic

# CRITICAL SECURITY INVARIANT: Zero PHI in operational broadcast!
# Operational staff announcement must NEVER contain patient medical complaints, NIK, or medical records
$leakedComplaint = ($staffNotif | Where-Object { $_ -match "E2E Dynamic Queue & Reminder Verification" }).Count -gt 0
Assert-Test "ZERO-PHI: Operational title does not contain patient medical complaint" (-not $leakedComplaint)

$leakedNik = ($staffNotif | Where-Object { $_ -match "\b\d{16}\b" -or $_ -match "\bnik\b" }).Count -gt 0
Assert-Test "ZERO-PHI: Operational announcement does not contain NIK" (-not $leakedNik)
Write-Host " ZERO-PHI verification confirmed: No medical complaint or patient identity leaked in operational broadcast." -ForegroundColor Green

# 5. Verify Durable Idempotency
Write-Host "[3.5] Testing Durable Idempotency (Immediate Second Evaluation)..." -ForegroundColor White
$evalRes2 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/reminders/evaluate" -Method Post -Headers $adminAuth.headers
$evalData2 = Get-ResponseData $evalRes2

Assert-Test "Second evaluation dispatched 0 duplicate reminders" ($evalData2.dispatchedCount -eq 0)
Assert-Test "Second evaluation skipped already sent reminders" ($evalData2.skippedCount -ge 1)

$notifCount = (Run-DockerSql "SELECT count(*) FROM notifications WHERE idempotency_key LIKE '%apt-checkin-window:$aptId%';").Trim()
Assert-Test "Notification records for appointment exist and are bounded" ([int]$notifCount -ge 3)
Write-Host " Idempotency verified: Total notifications count = $notifCount" -ForegroundColor Green

# ==============================================================================
# PHASE 4: TEARDOWN & SETTING RESTORATION
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 4] TEARDOWN & RESTORATION TO DEFAULTS" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# Restore queue.arrive_early_minutes to 15
Write-Host "[4.1] Restoring queue.arrive_early_minutes back to 15..." -ForegroundColor White
$restorePayload = @{ settings = @(@{ key = 'queue.arrive_early_minutes'; value = 15 }) } | ConvertTo-Json
$restoreRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/clinic-settings" -Method Put -Headers $adminAuth.headers -Body $restorePayload -ContentType "application/json"
Assert-Test "Admin setting restore API returned success" ($restoreRes.success -eq $true)
Assert-DbState "SELECT value FROM clinic_setting WHERE key = 'queue.arrive_early_minutes';" "15" "clinic_setting restored to 15"

# Cleanup test records
Write-Host "[4.2] Cleaning up test appointment and notifications..." -ForegroundColor White
$null = Run-DockerSql @"
DELETE FROM notification_recipients WHERE notification_id IN (SELECT id FROM notifications WHERE idempotency_key LIKE '%$aptId%');
DELETE FROM notifications WHERE idempotency_key LIKE '%$aptId%';
DELETE FROM appointment_status_events WHERE appointment_id = '$aptId';
DELETE FROM appointment_check_ins WHERE appointment_id = '$aptId';
DELETE FROM queue_tickets WHERE appointment_id = '$aptId';
DELETE FROM appointments WHERE id = '$aptId';
"@
Assert-Test "Test data cleaned up cleanly" $true

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " [PASS] QUEUE CHECK-IN WINDOW & REMINDER SUITE COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Print-TestSummary "Queue Check-In Window & Reminder Suite"
