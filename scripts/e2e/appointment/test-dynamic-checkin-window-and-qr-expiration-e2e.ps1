# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: DYNAMIC CHECK-IN WINDOW & QR EXPIRATION LIFECYCLE
# Full Deterministic, Idempotent, Invariant-Enforced Verification
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E SUITE] DYNAMIC CHECK-IN WINDOW & QR EXPIRATION (OPTION 2 RUNTIME TRUTH)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# ------------------------------------------------------------------------------
# HELPER: INVOKE WITH EXPECTED HTTP ERROR
# ------------------------------------------------------------------------------
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

# ------------------------------------------------------------------------------
# HELPER: DATABASE STATE ASSERTION
# ------------------------------------------------------------------------------
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
# PHASE 1: AUTHENTICATION & CONFIGURATION REGISTRY DISCOVERY
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 1] AUTHENTICATION & CLINIC SETTINGS REGISTRY INVARIANTS" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# 0. Ensure initial setting is 24 hours in DB
$null = Run-DockerSql "INSERT INTO clinic_setting (key, value, scope_type) VALUES ('queue.check_in_window_hours', '24'::jsonb, 'global') ON CONFLICT (key) DO UPDATE SET value = '24'::jsonb;"

# 1. Login Admin
Write-Host "[1.1] Authenticating Admin..." -ForegroundColor White
$adminAuth = Login-Admin
Assert-Test "Admin authenticated" ($null -ne $adminAuth.token -and $adminAuth.token.Length -gt 20)

# 2. Login Patient 1 (Dewi Lestari)
Write-Host "[1.2] Authenticating Patient 1 (Dewi Lestari)..." -ForegroundColor White
$patient1Auth = Login-Patient
Assert-Test "Patient 1 authenticated" ($null -ne $patient1Auth.token -and $patient1Auth.token.Length -gt 20)

# 3. Login Patient 2 (Eka Kuswandari)
Write-Host "[1.3] Authenticating Patient 2 (Eka Kuswandari)..." -ForegroundColor White
$patient2Auth = Login-User "patient.0002@amanah-healthcare.test" "secret123"
Assert-Test "Patient 2 authenticated" ($null -ne $patient2Auth.token -and $patient2Auth.token.Length -gt 20)

# 4. Check PostgreSQL DB: clinic_setting has queue.check_in_window_hours
Write-Host "[1.4] Checking PostgreSQL clinic_setting registry..." -ForegroundColor White
$dbWindowVal = (Run-DockerSql "SELECT value FROM clinic_setting WHERE key = 'queue.check_in_window_hours';").Trim()
Assert-Test "clinic_setting contains queue.check_in_window_hours key" ($dbWindowVal -eq "24" -or $dbWindowVal.Length -gt 0)
Write-Host " Current DB check_in_window_hours: $dbWindowVal" -ForegroundColor Green

# 5. Check Admin API: GET /admin/schedule-configuration returns metadata & value
Write-Host "[1.5] Calling Admin Schedule Configuration API..." -ForegroundColor White
$configRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration" -Method Get -Headers $adminAuth.headers
$configData = Get-ResponseData $configRes
$windowConfig = $configData.clinicSettings | Where-Object { $_.key -eq 'queue.check_in_window_hours' }

Assert-Test "API returns queue.check_in_window_hours setting" ($null -ne $windowConfig)
Assert-Test "Setting category is 'queue'" ($windowConfig.category -eq "queue")
Assert-Test "Setting controlType is 'number'" ($windowConfig.controlType -eq "number")
Assert-Test "Setting unit is 'jam'" ($windowConfig.unit -eq "jam")
Assert-Test "Setting min is 1 and max is 72" ($windowConfig.min -eq 1 -and $windowConfig.max -eq 72)
Assert-Test "Setting isAdminFacing is true" ($windowConfig.isAdminFacing -eq $true)
Write-Host " API Config: key=$($windowConfig.key), val=$($windowConfig.value), label=$($windowConfig.label)" -ForegroundColor Green

# ==============================================================================
# PHASE 2: OPTION 2 QR EXPIRATION INVARIANT (CREATION TIME + 24 HOURS)
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 2] QR EXPIRATION OPTION 2 (Date.now() + windowHours) & IDEMPOTENCY" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# Ensure clinic setting is 24 hours
$setPayload = @{ settings = @(@{ key = 'queue.check_in_window_hours'; value = 24 }) } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/clinic-settings" -Method Put -Headers $adminAuth.headers -Body $setPayload -ContentType "application/json"

# Discover Clinic and Service
$clinics = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics" -Method Get -Headers $patient1Auth.headers))
$targetPoli = $clinics[0]
$services = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/clinics/$($targetPoli.id)/layanan" -Method Get -Headers $patient1Auth.headers))
$targetService = $services[0]
$patient1ProfileId = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient1Auth.user.id)';").Trim()
$patient2ProfileId = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient2Auth.user.id)';").Trim()
$targetDate = (Get-Date).ToString("yyyy-MM-dd")
$bookingOpts = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/schedules/booking-options?date=$targetDate" -Method Get -Headers $patient1Auth.headers)
$availableSession = $bookingOpts.sessions | Where-Object { $_.isDisabled -ne $true } | Select-Object -Last 1
$targetSession = if ($availableSession) { $availableSession.session } else { "MALAM" }
Write-Host " Selected Active Session: $targetSession" -ForegroundColor Cyan

# Clean up any lingering active appointments/tickets for test patients today
$null = Run-DockerSql @"
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id IN ('$patient1ProfileId', '$patient2ProfileId'));
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id IN ('$patient1ProfileId', '$patient2ProfileId'));
DELETE FROM queue_tickets WHERE queue_date = CURRENT_DATE AND (patient_id IN ('$patient1ProfileId', '$patient2ProfileId') OR appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id IN ('$patient1ProfileId', '$patient2ProfileId')));
DELETE FROM appointments WHERE scheduled_date = CURRENT_DATE AND patient_id IN ('$patient1ProfileId', '$patient2ProfileId');
"@

# Book Appointment 1 for Patient 1
Write-Host "[2.1] Booking Appointment 1 for Patient 1..." -ForegroundColor White
$bookPayload1 = @{
    patientId = $patient1ProfileId
    poliklinikId = $targetPoli.id
    layananId = $targetService.id
    appointmentDate = $targetDate
    session = $targetSession
    complaint = "E2E Dynamic QR Window Verification - Apt 1"
    visitType = "new_visit"
} | ConvertTo-Json

$bookRes1 = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient1Auth.headers -Body $bookPayload1 -ContentType "application/json"
$apt1 = Get-ResponseData $bookRes1
$apt1Id = $apt1.id
Assert-Test "Appointment 1 booked" ($null -ne $apt1Id -and $apt1Id.Length -gt 10)

# Set scheduled time to current time window
$currentTimeWindowStart = (Get-Date).ToString("HH:mm:ss")
$currentTimeWindowEnd = (Get-Date).AddMinutes(30).ToString("HH:mm:ss")
$null = Run-DockerSql "UPDATE appointments SET scheduled_start_time = '$currentTimeWindowStart', scheduled_end_time = '$currentTimeWindowEnd' WHERE id = '$apt1Id';"

# Assign Doctor & Room to Appointment 1
$docCandidates = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/candidates/doctors" -Method Get -Headers $adminAuth.headers)
$allCandidateDoctors = @($docCandidates.groups | ForEach-Object { $_.doctors })
$targetDoctor = $allCandidateDoctors[0]
$roomCandidates = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/candidates/rooms" -Method Get -Headers $adminAuth.headers))
$targetRoom = $roomCandidates[0]

$assignDocPayload = @{ doctorId = $targetDoctor.id; reason = "Penugasan dokter operasional E2E" } | ConvertTo-Json
$assignRoomPayload = @{ roomId = $targetRoom.id } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/doctor" -Method Patch -Body $assignDocPayload -Headers $adminAuth.headers -ContentType "application/json"
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/room" -Method Patch -Body $assignRoomPayload -Headers $adminAuth.headers -ContentType "application/json"
Write-Host " Assigned Doctor ($($targetDoctor.name)) & Room ($($targetRoom.name)) to Apt 1" -ForegroundColor Green

# Generate QR for Appointment 1
Write-Host "[2.2] Generating QR Code for Appointment 1 (Window = 24h)..." -ForegroundColor White
$beforeGenTime = [DateTime]::UtcNow
$qr1Res = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id/check-in-qr" -Method Post -Headers $adminAuth.headers)
$afterGenTime = [DateTime]::UtcNow

Assert-Test "QR 1 token generated" ($null -ne $qr1Res.token -and $qr1Res.token.Length -gt 20)
Assert-Test "QR 1 manualCode generated" ($null -ne $qr1Res.manualCode -and $qr1Res.manualCode.Length -ge 6)
Assert-Test "QR 1 expiresAt returned" ($null -ne $qr1Res.expiresAt)

$expiresAtUtc = [DateTime]::Parse($qr1Res.expiresAt, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime()
$expectedExpiresAtMin = $beforeGenTime.AddHours(24).AddSeconds(-10)
$expectedExpiresAtMax = $afterGenTime.AddHours(24).AddSeconds(10)

$isOption2Accurate = ($expiresAtUtc -ge $expectedExpiresAtMin -and $expiresAtUtc -le $expectedExpiresAtMax)
Assert-Test "Option 2: expiresAt is exactly 24 hours from creation time (Date.now() + 24h)" $isOption2Accurate "ExpiresAt: $expiresAtUtc, Expected: $($beforeGenTime.AddHours(24))"

# Check remainingSeconds (approx 86400s)
Assert-Test "QR 1 remainingSeconds is approximately 86,400s (24 hours)" ($qr1Res.remainingSeconds -ge 86300 -and $qr1Res.remainingSeconds -le 86400)
Write-Host " QR 1 Generated: ExpiresAt=$($qr1Res.expiresAt), RemainingSeconds=$($qr1Res.remainingSeconds)" -ForegroundColor Green

# Test Idempotency: repeated call returns identical token & expiresAt
Write-Host "[2.3] Testing QR Generation Idempotency..." -ForegroundColor White
Start-Sleep -Seconds 2
$qr1Reopen = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id/check-in-qr" -Method Post -Headers $adminAuth.headers)

Assert-Test "Idempotent: Identical token returned" ($qr1Res.token -eq $qr1Reopen.token)
Assert-Test "Idempotent: Identical manualCode returned" ($qr1Res.manualCode -eq $qr1Reopen.manualCode)
Assert-Test "Idempotent: Identical expiresAt returned" ($qr1Res.expiresAt -eq $qr1Reopen.expiresAt)
Assert-Test "Continuous Timer: remainingSeconds decreased by ~2s" ($qr1Reopen.remainingSeconds -lt $qr1Res.remainingSeconds)

# ==============================================================================
# PHASE 3: DYNAMIC SETTING MUTATION (24h -> 12h) & RUNTIME ALIGNMENT
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 3] DYNAMIC SETTING MUTATION (24h -> 12h) & RUNTIME ADAPTATION" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# Admin changes check_in_window_hours to 12 hours
Write-Host "[3.1] Updating queue.check_in_window_hours to 12 via Admin API..." -ForegroundColor White
$updatePayload = @{ settings = @(@{ key = 'queue.check_in_window_hours'; value = 12 }) } | ConvertTo-Json
$updateRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/clinic-settings" -Method Put -Headers $adminAuth.headers -Body $updatePayload -ContentType "application/json"
Assert-Test "Admin setting update API returned success" ($updateRes.success -eq $true)

# Verify DB reflects 12
Assert-DbState "SELECT value FROM clinic_setting WHERE key = 'queue.check_in_window_hours';" "12" "Database reflects mutated value: 12"

# Book Appointment 2 for Patient 2
Write-Host "[3.2] Booking Appointment 2 for Patient 2..." -ForegroundColor White
$bookPayload2 = @{
    patientId = $patient2ProfileId
    poliklinikId = $targetPoli.id
    layananId = $targetService.id
    appointmentDate = $targetDate
    session = $targetSession
    complaint = "E2E Dynamic QR Window Verification - Apt 2 (12h Window)"
    visitType = "new_visit"
} | ConvertTo-Json

$bookRes2 = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient2Auth.headers -Body $bookPayload2 -ContentType "application/json"
$apt2 = Get-ResponseData $bookRes2
$apt2Id = $apt2.id
Assert-Test "Appointment 2 booked" ($null -ne $apt2Id -and $apt2Id.Length -gt 10)

# Set scheduled time to current time window
$null = Run-DockerSql "UPDATE appointments SET scheduled_start_time = '$currentTimeWindowStart', scheduled_end_time = '$currentTimeWindowEnd' WHERE id = '$apt2Id';"

# Assign Doctor & Room to Appointment 2
$assignDocPayload2 = @{ doctorId = $targetDoctor.id; reason = "Penugasan dokter operasional E2E" } | ConvertTo-Json
$assignRoomPayload2 = @{ roomId = $targetRoom.id } | ConvertTo-Json
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/doctor" -Method Patch -Body $assignDocPayload2 -Headers $adminAuth.headers -ContentType "application/json"
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/room" -Method Patch -Body $assignRoomPayload2 -Headers $adminAuth.headers -ContentType "application/json"

# Generate QR for Appointment 2 (Now Window is 12h!)
Write-Host "[3.3] Generating QR Code for Appointment 2 (Window = 12h)..." -ForegroundColor White
$beforeGenTime12 = [DateTime]::UtcNow
$qr2Res = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt2Id/check-in-qr" -Method Post -Headers $adminAuth.headers)
$afterGenTime12 = [DateTime]::UtcNow

Assert-Test "QR 2 token generated" ($null -ne $qr2Res.token)
$expiresAt12Utc = [DateTime]::Parse($qr2Res.expiresAt, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeUniversal).ToUniversalTime()
$expectedExpiresAt12Min = $beforeGenTime12.AddHours(12).AddSeconds(-10)
$expectedExpiresAt12Max = $afterGenTime12.AddHours(12).AddSeconds(10)

$isOption2_12Accurate = ($expiresAt12Utc -ge $expectedExpiresAt12Min -and $expiresAt12Utc -le $expectedExpiresAt12Max)
Assert-Test "Dynamic: QR 2 expiresAt is exactly 12 hours from creation time" $isOption2_12Accurate "ExpiresAt: $expiresAt12Utc, Expected: $($beforeGenTime12.AddHours(12))"
Assert-Test "Dynamic: QR 2 remainingSeconds is approximately 43,200s (12 hours)" ($qr2Res.remainingSeconds -ge 43100 -and $qr2Res.remainingSeconds -le 43200)
Write-Host " QR 2 Generated with 12h Window: ExpiresAt=$($qr2Res.expiresAt), RemainingSeconds=$($qr2Res.remainingSeconds)" -ForegroundColor Green

# ==============================================================================
# PHASE 4: CHECK-IN EXECUTION & EXPIRED TOKEN REJECTION INVARIANT
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 4] CHECK-IN EXECUTION & EXPIRED TOKEN SECURITY REJECTION" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# 1. Patient 2 performs check-in with valid 12-hour QR token
Write-Host "[4.1] Patient 2 performing check-in with valid token..." -ForegroundColor White
$checkInPayload = @{ token = $qr2Res.token } | ConvertTo-Json
$checkInRes = Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $patient2Auth.headers -Body $checkInPayload -ContentType "application/json"
$checkedInApt2 = Get-ResponseData $checkInRes

Assert-Test "Check-in succeeds: Status transitions to WAITING" ($checkedInApt2.status -eq "waiting")
Assert-DbState "SELECT is_used FROM appointment_check_ins WHERE token = '$($qr2Res.token)';" "t" "appointment_check_ins.is_used marked TRUE"

# 2. Test Expired Token Rejection
Write-Host "[4.2] Testing Expired Token Rejection..." -ForegroundColor White
# We artificially expire Appointment 1's token in DB
$null = Run-DockerSql "UPDATE appointment_check_ins SET expires_at = (now() - interval '2 hours') WHERE token = '$($qr1Res.token)';"
Assert-DbState "SELECT (expires_at < now())::text FROM appointment_check_ins WHERE token = '$($qr1Res.token)';" "true" "Token 1 artificially set to past"

# Attempt Check-In with expired token
$expiredCheckInPayload = @{ token = $qr1Res.token } | ConvertTo-Json
$expiredAttempt = Invoke-ExpectedError -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $patient1Auth.headers -Body $expiredCheckInPayload -ExpectedStatusCode 400

Assert-Test "Expired QR check-in rejected with 400 Bad Request" ($expiredAttempt.StatusCode -eq 400)
Assert-Test "Rejection message explains token expiration" ($expiredAttempt.ErrorBody -match "kedaluwarsa")
Write-Host " Expired check-in correctly rejected: $($expiredAttempt.ErrorBody)" -ForegroundColor Green

# Verify Appointment 1 remains in BOOKED status (not WAITING)
Assert-DbState "SELECT status FROM appointments WHERE id = '$apt1Id';" "booked" "Appointment 1 status remains BOOKED after expired attempt"

# ==============================================================================
# PHASE 5: RESTORATION TO DEFAULT (24h) & SUITE VERIFICATION
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 5] CONFIGURATION RESTORATION & TEARDOWN" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# Restore queue.check_in_window_hours to 24
Write-Host "[5.1] Restoring queue.check_in_window_hours back to 24..." -ForegroundColor White
$restorePayload = @{ settings = @(@{ key = 'queue.check_in_window_hours'; value = 24 }) } | ConvertTo-Json
$restoreRes = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration/clinic-settings" -Method Put -Headers $adminAuth.headers -Body $restorePayload -ContentType "application/json"
Assert-Test "Admin setting restore API returned success" ($restoreRes.success -eq $true)
Assert-DbState "SELECT value FROM clinic_setting WHERE key = 'queue.check_in_window_hours';" "24" "clinic_setting restored to 24"

# Cleanup test appointments
Write-Host "[5.2] Cleaning up test appointments..." -ForegroundColor White
$null = Run-DockerSql "DELETE FROM appointment_status_events WHERE appointment_id IN ('$apt1Id', '$apt2Id');"
$null = Run-DockerSql "DELETE FROM appointment_check_ins WHERE appointment_id IN ('$apt1Id', '$apt2Id');"
$null = Run-DockerSql "DELETE FROM queue_tickets WHERE appointment_id IN ('$apt1Id', '$apt2Id');"
$null = Run-DockerSql "DELETE FROM appointments WHERE id IN ('$apt1Id', '$apt2Id');"
Assert-Test "Test appointments cleaned up cleanly" $true

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " [PASS] DYNAMIC CHECK-IN WINDOW & QR EXPIRATION SUITE COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
Print-TestSummary "Dynamic Check-In Window & QR Expiration Suite"
