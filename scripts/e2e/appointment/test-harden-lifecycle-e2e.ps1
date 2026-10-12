# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: HARDENED APPOINTMENT LIFECYCLE
# Full Deterministic, Idempotent, Invariant-Enforced Lifecycle Verification
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E SUITE] HARDENED APPOINTMENT LIFECYCLE (END-TO-END RUNTIME TRUTH)" -ForegroundColor Cyan
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
function Assert-DbField {
    param (
        [string]$Query,
        [string]$ExpectedValue,
        [string]$TestName
    )
    $actual = (Run-DockerSql $Query).Trim()
    Assert-Test $TestName ($actual -eq $ExpectedValue) "Expected: '$ExpectedValue', Actual: '$actual'"
}

# ==============================================================================
# PHASE 1: AUTHENTICATION & MASTER DATA DISCOVERY
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 1] AUTHENTICATION & RUNTIME DATA DISCOVERY" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

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

# 4. Discover Patient Profiles from Database
Write-Host "[1.4] Discovering Patient Profiles from DB..." -ForegroundColor White
$patient1Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient1Auth.user.id)';").Trim()
$patient2Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient2Auth.user.id)';").Trim()
Assert-Test "Patient 1 Profile ID found ($patient1Id)" ($null -ne $patient1Id -and $patient1Id.Length -gt 20)
Assert-Test "Patient 2 Profile ID found ($patient2Id)" ($null -ne $patient2Id -and $patient2Id.Length -gt 20)

# 5. Discover Target Service: USG Umum in Poli Umum
Write-Host "[1.5] Discovering Poli Umum & USG Umum IDs..." -ForegroundColor White
$poliUmumId = (Run-DockerSql "SELECT id FROM clinic_units WHERE code = 'poli_umum';").Trim()
$usgServiceId = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'usg_umum';").Trim()
Assert-Test "Poli Umum ID found ($poliUmumId)" ($null -ne $poliUmumId -and $poliUmumId.Length -gt 20)
Assert-Test "USG Umum Service ID found ($usgServiceId)" ($null -ne $usgServiceId -and $usgServiceId.Length -gt 20)

# 6. Verify Schedule Booking Option for Today's MALAM Session
$targetDate = (Run-DockerSql "SELECT CURRENT_DATE;").Trim()
Write-Host "[1.6] Checking Booking Options for Target Date: $targetDate..." -ForegroundColor White
$bookingOpts = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/schedules/booking-options?date=$targetDate" -Method Get -Headers $patient1Auth.headers)
$malamSession = $bookingOpts.sessions | Where-Object { $_.session -eq 'MALAM' }
Assert-Test "MALAM session exists for today" ($null -ne $malamSession)
Assert-Test "MALAM session is active and not disabled" ($malamSession.isDisabled -ne $true)
$targetSession = "MALAM"
Write-Host " Selected Session: $targetSession ($($malamSession.startTime) - $($malamSession.endTime))" -ForegroundColor Green

# ==============================================================================
# PHASE 2: APPOINTMENT 1 - FULL HAPPY PATH & EDGE-CASE INVARIANT REJECTIONS
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 2] APPOINTMENT 1: LIFECYCLE MUTATIONS & INVARIANT ENFORCEMENT" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# STEP 2.1: CREATE APPOINTMENT 1
Write-Host "`n[STEP 2.1] Booking Appointment 1 (Poli Umum, USG Umum, MALAM)..." -ForegroundColor Cyan
$book1Payload = @{
    patientId = $patient1Id
    poliklinikId = $poliUmumId
    layananId = $usgServiceId
    appointmentDate = $targetDate
    session = $targetSession
    visitType = "Pemeriksaan Baru"
    complaint = "USG Abdomen Rutin - Hardened Lifecycle Test 1"
} | ConvertTo-Json

$apt1Res = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $book1Payload -Headers $patient1Auth.headers)
$apt1Id = $apt1Res.id
Assert-Test "Appointment 1 created with UUID" ($null -ne $apt1Id -and $apt1Id.Length -gt 20)
Assert-Test "Appointment 1 initial status is 'booked'" ($apt1Res.status -eq "booked")
Assert-Test "Appointment 1 doctor is null" ($null -eq $apt1Res.staffId -and $null -eq $apt1Res.doctorId -and $null -eq $apt1Res.doctorName)
Assert-Test "Appointment 1 room is null" ($null -eq $apt1Res.roomId -and $null -eq $apt1Res.roomName)
Assert-Test "Appointment 1 queueNumber returned" ($null -ne $apt1Res.queueNumber)
$ticketNo1 = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apt1Id';").Trim()
Assert-Test "Ticket 1 queueNumber matches decomposed pattern (USG-Mxxx: $ticketNo1)" ($ticketNo1 -match "^USG-[A-Z0-9]+$")
Write-Host " Created Appointment 1: ID=$apt1Id, QueueOrd=$($apt1Res.queueNumber), TicketQueue=$ticketNo1, Code=$($apt1Res.bookingCode)" -ForegroundColor Green

# DB Check 2.1
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "booked" "DB: appointments.status is booked"
Assert-DbField "SELECT practitioner_id IS NULL FROM appointments WHERE id = '$apt1Id';" "t" "DB: appointments.practitioner_id is NULL"
Assert-DbField "SELECT room_id IS NULL FROM appointments WHERE id = '$apt1Id';" "t" "DB: appointments.room_id is NULL"
Assert-DbField "SELECT status FROM queue_tickets WHERE appointment_id = '$apt1Id';" "waiting" "DB: queue_tickets.status is waiting"

# STEP 2.2: INVARIANT - REJECT JUMPING DIRECTLY TO IN_SERVICE
Write-Host "`n[STEP 2.2] Testing Invariant: Reject in_service before doctor/room assignment..." -ForegroundColor Cyan
$invalidStatusPayload = @{
    status = "in_service"
    reason = "Bypass attempt without doctor/room"
} | ConvertTo-Json

$res22 = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Headers $adminAuth.headers -Body $invalidStatusPayload -ExpectedStatusCode 400
Assert-Test "Admin status update to in_service rejected with 400" ($res22.StatusCode -eq 400)
Assert-Test "Error message states doctor must be assigned" ($res22.ErrorBody -match "Dokter penanggung jawab belum ditugaskan")
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "booked" "DB: appointments.status remains booked"

# STEP 2.3: INVARIANT - REJECT QR GENERATION BEFORE DOCTOR & ROOM ASSIGNMENT
Write-Host "`n[STEP 2.3] Testing Invariant: Reject QR check-in generation before assignment..." -ForegroundColor Cyan
# Role check: Patient calling check-in-qr directly is rejected with 403 (Admin/Staff only)
$patientQrAttempt = Invoke-ExpectedError -Uri "$apiUrl/appointments/$apt1Id/check-in-qr" -Method Post -Headers $patient1Auth.headers -ExpectedStatusCode 403
Assert-Test "Patient calling check-in-qr rejected with 403 Forbidden" ($patientQrAttempt.StatusCode -eq 403)

# Domain Invariant: Admin calling check-in-qr before doctor assignment is rejected with 400 Bad Request
$res23 = Invoke-ExpectedError -Uri "$apiUrl/appointments/$apt1Id/check-in-qr" -Method Post -Headers $adminAuth.headers -ExpectedStatusCode 400
Assert-Test "Admin QR generation rejected with 400 before assignment" ($res23.StatusCode -eq 400)
Assert-Test "Error message states doctor must be assigned before QR" ($res23.ErrorBody -match "Dokter penanggung jawab belum ditugaskan")

# STEP 2.4: INVARIANT - REJECT CHECK-IN EXECUTION BEFORE ASSIGNMENT
Write-Host "`n[STEP 2.4] Testing Invariant: Reject check-in execution before assignment..." -ForegroundColor Cyan
$fakeCheckInPayload = @{
    manualCode = "ABC123XY"
    appointmentId = $apt1Id
} | ConvertTo-Json
$res24 = Invoke-ExpectedError -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $patient1Auth.headers -Body $fakeCheckInPayload -ExpectedStatusCode 400
Assert-Test "Check-in execution rejected with 400" ($res24.StatusCode -eq 400)
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "booked" "DB: appointments.status remains booked"

# STEP 2.5: QUERY CANDIDATES (DOCTOR & ROOM)
Write-Host "`n[STEP 2.5] Querying Candidate Doctors & Rooms..." -ForegroundColor Cyan
$docCandidates = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/candidates/doctors" -Method Get -Headers $adminAuth.headers)
Assert-Test "Doctor candidates returned in groups" ($docCandidates.groups.Count -gt 0)

# Check roster status: Bdn. Siti Rahmawati is rostered AVAILABLE for MALAM, dr. Ahmad Santoso is active
$allCandidateDoctors = @($docCandidates.groups | ForEach-Object { $_.doctors })
$rosteredDoc = $allCandidateDoctors | Where-Object { $_.availability -eq 'AVAILABLE' } | Select-Object -First 1
$drAhmad = $allCandidateDoctors | Where-Object { $_.name -like '*Ahmad Santoso*' } | Select-Object -First 1

Write-Host " Rostered Doctor for Night Session: $($rosteredDoc.name) (Status: $($rosteredDoc.availability))" -ForegroundColor Cyan
if ($drAhmad) {
    Write-Host " dr. Ahmad Santoso Status: $($drAhmad.availability) (Session: $($drAhmad.existingSessionId))" -ForegroundColor Cyan
}

$roomCandidates = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/candidates/rooms" -Method Get -Headers $adminAuth.headers))
Assert-Test "Room candidates returned" ($roomCandidates.Count -gt 0)
$targetRoom = $roomCandidates | Where-Object { $_.isAvailable -eq $true } | Select-Object -First 1
if (-not $targetRoom) { $targetRoom = $roomCandidates[0] }
Write-Host " Selected Room: $($targetRoom.name) (ID: $($targetRoom.id))" -ForegroundColor Cyan

# STEP 2.6: ASSIGN DOCTOR & ROOM
Write-Host "`n[STEP 2.6] Assigning Doctor & Room to Appointment 1..." -ForegroundColor Cyan
# Target doctor: use dr. Ahmad Santoso if found or rostered doctor
$targetDoctor = if ($drAhmad) { $drAhmad } else { $rosteredDoc }
$assignDocPayload = @{
    doctorId = $targetDoctor.id
    reason = "Penugasan dokter operasional E2E test"
} | ConvertTo-Json

$assignDocRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/doctor" -Method Patch -Body $assignDocPayload -Headers $adminAuth.headers
Assert-Test "Doctor assigned successfully via API" ($assignDocRes.message -match "Dokter berhasil")

$assignRoomPayload = @{
    roomId = $targetRoom.id
} | ConvertTo-Json
$assignRoomRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/room" -Method Patch -Body $assignRoomPayload -Headers $adminAuth.headers
Assert-Test "Room assigned successfully via API" ($assignRoomRes.message -match "Ruangan berhasil")

# DB Check 2.6
Assert-DbField "SELECT practitioner_id = '$($targetDoctor.id)' FROM appointments WHERE id = '$apt1Id';" "t" "DB: appointments.practitioner_id correctly set"
Assert-DbField "SELECT room_id = '$($targetRoom.id)' FROM appointments WHERE id = '$apt1Id';" "t" "DB: appointments.room_id correctly set"
Assert-DbField "SELECT doctor_id = '$($targetDoctor.id)' FROM queue_tickets WHERE appointment_id = '$apt1Id';" "t" "DB: queue_tickets.doctor_id synchronized"
Assert-DbField "SELECT room_id = '$($targetRoom.id)' FROM queue_tickets WHERE appointment_id = '$apt1Id';" "t" "DB: queue_tickets.room_id synchronized"

# STEP 2.7: VERIFY ALLOWED ACTIONS CONTAINS CHECK_IN
Write-Host "`n[STEP 2.7] Verifying allowedActions now exposes CHECK_IN..." -ForegroundColor Cyan
$apt1Detail = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id" -Method Get -Headers $adminAuth.headers)
$actions = @($apt1Detail.allowedActions)
Assert-Test "allowedActions includes CHECK_IN after assignment" ($actions -contains "CHECK_IN")
Assert-Test "allowedActions does NOT include CALL before check-in" (-not ($actions -contains "CALL"))
Assert-Test "allowedActions does NOT include START_SERVICE before check-in" (-not ($actions -contains "START_SERVICE"))

# STEP 2.8: INVARIANT - REJECT IN_SERVICE BEFORE CHECK-IN (EVEN WITH DOCTOR & ROOM)
Write-Host "`n[STEP 2.8] Testing Invariant: Reject in_service before check-in (doctor/room present)..." -ForegroundColor Cyan
$res28 = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Headers $adminAuth.headers -Body $invalidStatusPayload -ExpectedStatusCode 400
Assert-Test "Admin status update to in_service rejected without check-in (400)" ($res28.StatusCode -eq 400)
Assert-Test "Error message states patient must check-in first" ($res28.ErrorBody -match "Pasien belum melakukan check-in")
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "booked" "DB: appointments.status remains booked"

# STEP 2.9: GENERATE CHECK-IN QR & VERIFY IDEMPOTENCY
Write-Host "`n[STEP 2.9] Generating Check-In QR & Testing Idempotency..." -ForegroundColor Cyan
$qrRes1 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id/check-in-qr" -Method Post -Headers $adminAuth.headers)
Assert-Test "QR token generated" ($null -ne $qrRes1.token -and $qrRes1.token.Length -gt 20)
Assert-Test "Manual code generated (unconfusable)" ($null -ne $qrRes1.manualCode -and $qrRes1.manualCode.Length -ge 6)
Assert-Test "QR payload is valid JSON" ($null -ne $qrRes1.qrPayload -and $qrRes1.qrPayload.StartsWith("{"))
Write-Host " Generated QR: Token=$($qrRes1.token.Substring(0,8))..., Code=$($qrRes1.manualCode)" -ForegroundColor Green

# Repeat call to test idempotency:
$qrRes2 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id/check-in-qr" -Method Post -Headers $adminAuth.headers)
Assert-Test "Idempotent QR: exact same token returned" ($qrRes1.token -eq $qrRes2.token)
Assert-Test "Idempotent QR: exact same manualCode returned" ($qrRes1.manualCode -eq $qrRes2.manualCode)
Assert-Test "Idempotent QR: exact same expiration deadline returned" ($qrRes1.appointmentEligibilityDeadline -eq $qrRes2.appointmentEligibilityDeadline)

# DB Check 2.9: Only 1 active check-in record exists
Assert-DbField "SELECT count(*) FROM appointment_check_ins WHERE appointment_id = '$apt1Id';" "1" "DB: Exactly 1 record in appointment_check_ins"
Assert-DbField "SELECT is_used FROM appointment_check_ins WHERE appointment_id = '$apt1Id';" "f" "DB: appointment_check_ins.is_used is FALSE"

# STEP 2.10: EXECUTE CHECK-IN VIA QR TOKEN
Write-Host "`n[STEP 2.10] Executing Patient Check-In via QR Token..." -ForegroundColor Cyan
$checkInPayload = @{
    token = $qrRes1.token
    appointmentId = $apt1Id
} | ConvertTo-Json
$checkInRes = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Body $checkInPayload -Headers $patient1Auth.headers)
Assert-Test "Check-in transitioned appointment to 'waiting'" ($checkInRes.status -eq "waiting" -or $checkInRes.status -eq "WAITING")

# DB Check 2.10
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "waiting" "DB: appointments.status is waiting"
Assert-DbField "SELECT checked_in_at IS NOT NULL FROM appointments WHERE id = '$apt1Id';" "t" "DB: appointments.checked_in_at is populated"
Assert-DbField "SELECT is_used FROM appointment_check_ins WHERE appointment_id = '$apt1Id';" "t" "DB: appointment_check_ins.is_used is TRUE"

# STEP 2.11: REPEAT CHECK-IN IDEMPOTENCY
Write-Host "`n[STEP 2.11] Testing Repeat Check-In Idempotency..." -ForegroundColor Cyan
$repeatCheckIn = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Body $checkInPayload -Headers $patient1Auth.headers)
Assert-Test "Repeat check-in returns current waiting status idempotently" ($repeatCheckIn.status -eq "waiting" -or $repeatCheckIn.status -eq "WAITING")
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "waiting" "DB: appointments.status remains waiting"

# STEP 2.12: INVARIANT - REJECT DIRECT TRANSITION FROM WAITING TO COMPLETED
Write-Host "`n[STEP 2.12] Testing Invariant: Reject completed directly from waiting..." -ForegroundColor Cyan
$completeAttemptPayload = @{
    status = "completed"
    reason = "Direct completion bypass attempt"
} | ConvertTo-Json
$res212 = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Headers $adminAuth.headers -Body $completeAttemptPayload -ExpectedStatusCode 400
Assert-Test "Direct completion from waiting rejected with 400" ($res212.StatusCode -eq 400)
Assert-Test "Error states examination must be in_service first" ($res212.ErrorBody -match "in_service")
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "waiting" "DB: status remains waiting"

# STEP 2.13: ADVANCE TO IN_SERVICE
Write-Host "`n[STEP 2.13] Advancing Appointment 1 to in_service (Sedang Diperiksa)..." -ForegroundColor Cyan
$inServicePayload = @{
    status = "in_service"
    reason = "Pasien masuk ke ruang periksa dokter"
} | ConvertTo-Json
$inServiceRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Body $inServicePayload -Headers $adminAuth.headers
Assert-Test "Status successfully advanced to in_service" ($inServiceRes.data.newStatus -eq "in_service")

# DB Check 2.13
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "in_service" "DB: appointments.status is in_service"
Assert-DbField "SELECT actual_started_at IS NOT NULL FROM appointments WHERE id = '$apt1Id';" "t" "DB: appointments.actual_started_at is populated"
Assert-DbField "SELECT status FROM queue_tickets WHERE appointment_id = '$apt1Id';" "in_service" "DB: queue_tickets.status is in_service"

# STEP 2.14: INVARIANTS WHILE IN_SERVICE
Write-Host "`n[STEP 2.14] Testing Invariants while in_service (Cannot revert or cancel)..." -ForegroundColor Cyan
# Revert to booked
$revertBooked = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Headers $adminAuth.headers -Body (@{ status = "booked" } | ConvertTo-Json) -ExpectedStatusCode 400
Assert-Test "Revert to booked rejected with 400" ($revertBooked.StatusCode -eq 400)

# Revert to waiting
$revertWaiting = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Headers $adminAuth.headers -Body (@{ status = "waiting" } | ConvertTo-Json) -ExpectedStatusCode 400
Assert-Test "Revert to waiting rejected with 400" ($revertWaiting.StatusCode -eq 400)

# Cancel during in_service
$cancelInService = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/cancel" -Method Patch -Headers $adminAuth.headers -Body (@{ reason = "Cancel attempt during exam" } | ConvertTo-Json) -ExpectedStatusCode 400
Assert-Test "Cancel during examination rejected with 400" ($cancelInService.StatusCode -eq 400)
Assert-Test "Error explains cannot cancel while examining" ($cancelInService.ErrorBody -match "pemeriksaan")
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "in_service" "DB: appointments.status remains in_service"

# STEP 2.15: COMPLETE APPOINTMENT 1
Write-Host "`n[STEP 2.15] Completing Appointment 1..." -ForegroundColor Cyan
$completePayload = @{
    status = "completed"
    reason = "Pemeriksaan selesai, rekam medis tersimpan"
} | ConvertTo-Json
$completeRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Body $completePayload -Headers $adminAuth.headers
Assert-Test "Status successfully advanced to completed" ($completeRes.data.newStatus -eq "completed")

# DB Check 2.15
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "completed" "DB: appointments.status is completed"
Assert-DbField "SELECT actual_completed_at IS NOT NULL FROM appointments WHERE id = '$apt1Id';" "t" "DB: appointments.actual_completed_at is populated"
Assert-DbField "SELECT status FROM queue_tickets WHERE appointment_id = '$apt1Id';" "completed" "DB: queue_tickets.status is completed"

# STEP 2.16: TERMINAL STATE IMMUTABILITY
Write-Host "`n[STEP 2.16] Testing Invariant: Terminal status cannot be modified..." -ForegroundColor Cyan
$mutateTerminal = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/status" -Method Patch -Headers $adminAuth.headers -Body (@{ status = "waiting" } | ConvertTo-Json) -ExpectedStatusCode 400
Assert-Test "Mutating terminal appointment rejected with 400" ($mutateTerminal.StatusCode -eq 400)
Assert-Test "Error states appointment is terminal" ($mutateTerminal.ErrorBody -match "terminal")
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt1Id';" "completed" "DB: appointments.status remains completed"

# ==============================================================================
# PHASE 3: APPOINTMENT 2 - MANUAL CODE CHECK-IN, ROLE SECURITY & QUEUE CALLING
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 3] APPOINTMENT 2: MANUAL CODE, ROLE SECURITY & CALL LIFECYCLE" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# STEP 3.1: CREATE APPOINTMENT 2
Write-Host "`n[STEP 3.1] Booking Appointment 2 for Patient 2 (Eka Kuswandari)..." -ForegroundColor Cyan
$book2Payload = @{
    patientId = $patient2Id
    poliklinikId = $poliUmumId
    layananId = $usgServiceId
    appointmentDate = $targetDate
    session = $targetSession
    visitType = "Pemeriksaan Baru"
    complaint = "USG Abdomen Rutin - Hardened Lifecycle Test 2"
} | ConvertTo-Json

$apt2Res = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $book2Payload -Headers $patient2Auth.headers)
$apt2Id = $apt2Res.id
Assert-Test "Appointment 2 created with UUID" ($null -ne $apt2Id -and $apt2Id.Length -gt 20)
Assert-Test "Appointment 2 initial status is 'booked'" ($apt2Res.status -eq "booked")
Assert-Test "Appointment 2 queueNumber returned" ($null -ne $apt2Res.queueNumber)
$ticketNo2 = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
Assert-Test "Ticket 2 queueNumber matches decomposed pattern (USG-Mxxx: $ticketNo2)" ($ticketNo2 -match "^USG-[A-Z0-9]+$")
Assert-Test "Ticket 2 allocated active ticket ($ticketNo2)" ($null -ne $ticketNo2 -and $ticketNo2.Length -gt 0)
Write-Host " Created Appointment 2: ID=$apt2Id, QueueOrd=$($apt2Res.queueNumber), TicketQueue=$ticketNo2, Code=$($apt2Res.bookingCode)" -ForegroundColor Green

# STEP 3.2: ASSIGN DOCTOR & ROOM TO APPOINTMENT 2
Write-Host "`n[STEP 3.2] Assigning Doctor & Room to Appointment 2..." -ForegroundColor Cyan
$assignDoc2 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/doctor" -Method Patch -Body (@{ doctorId = $targetDoctor.id } | ConvertTo-Json) -Headers $adminAuth.headers
Assert-Test "Doctor assigned to Appointment 2" ($assignDoc2.message -match "Dokter berhasil")

$assignRoom2 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/room" -Method Patch -Body (@{ roomId = $targetRoom.id } | ConvertTo-Json) -Headers $adminAuth.headers
Assert-Test "Room assigned to Appointment 2" ($assignRoom2.message -match "Ruangan berhasil")

# STEP 3.3: GENERATE QR & MANUAL CODE
Write-Host "`n[STEP 3.3] Generating Credentials for Appointment 2..." -ForegroundColor Cyan
$qrResApt2 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt2Id/check-in-qr" -Method Post -Headers $adminAuth.headers)
$manualCodeApt2 = $qrResApt2.manualCode
$tokenApt2 = $qrResApt2.token
Assert-Test "Manual code generated for Appointment 2" ($null -ne $manualCodeApt2 -and $manualCodeApt2.Length -ge 6)
Write-Host " Appointment 2 Credentials: Code=$manualCodeApt2, Token=$($tokenApt2.Substring(0,8))..." -ForegroundColor Green

# STEP 3.4: ROLE SECURITY - PATIENT 1 CANNOT CHECK-IN FOR PATIENT 2
Write-Host "`n[STEP 3.4] Testing Role Security: Patient 1 unauthorized check-in for Patient 2..." -ForegroundColor Cyan
$tamperPayload = @{
    token = $tokenApt2
    appointmentId = $apt2Id
} | ConvertTo-Json
$tamperRes = Invoke-ExpectedError -Uri "$apiUrl/appointments/check-in" -Method Post -Headers $patient1Auth.headers -Body $tamperPayload -ExpectedStatusCode 403
Assert-Test "Cross-patient check-in rejected with 403 Forbidden" ($tamperRes.StatusCode -eq 403)
Assert-Test "Error message indicates forbidden authorization" ($tamperRes.ErrorBody -match "tidak memiliki izin")
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt2Id';" "booked" "DB: status remains booked"

# STEP 3.5: EXECUTE CHECK-IN USING MANUAL CODE AS PATIENT 2
Write-Host "`n[STEP 3.5] Executing Check-In via Manual Code as Patient 2..." -ForegroundColor Cyan
$manualCheckInPayload = @{
    manualCode = $manualCodeApt2
    appointmentId = $apt2Id
} | ConvertTo-Json
$manualCheckInRes = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/check-in" -Method Post -Body $manualCheckInPayload -Headers $patient2Auth.headers)
Assert-Test "Check-in via manual code succeeded" ($manualCheckInRes.status -eq "waiting" -or $manualCheckInRes.status -eq "WAITING")

# DB Check 3.5
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt2Id';" "waiting" "DB: appointments.status is waiting"
Assert-DbField "SELECT checked_in_at IS NOT NULL FROM appointments WHERE id = '$apt2Id';" "t" "DB: appointments.checked_in_at is populated"
Assert-DbField "SELECT is_used FROM appointment_check_ins WHERE appointment_id = '$apt2Id';" "t" "DB: appointment_check_ins.is_used is TRUE"

# STEP 3.6: CALL PATIENT IN WAITING QUEUE
Write-Host "`n[STEP 3.6] Calling Patient 2 in Waiting Queue..." -ForegroundColor Cyan
$callRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$apt2Id/call" -Method Post -Headers $adminAuth.headers -Body (@{ notes = "Panggilan antrean E2E test" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Patient calling action executed successfully" ($null -ne $callRes.attemptNumber -or $callRes.success -eq $true)

# DB Check 3.6
Assert-DbField "SELECT last_called_at IS NOT NULL FROM appointments WHERE id = '$apt2Id';" "t" "DB: appointments.last_called_at is populated"
$callAttemptsCount = (Run-DockerSql "SELECT count(*) FROM appointment_call_attempts WHERE appointment_id = '$apt2Id';").Trim()
Assert-Test "DB: appointment_call_attempts recorded call log" ([int]$callAttemptsCount -ge 1)

# ==============================================================================
# PHASE 4: QUEUE RECALCULATION & COMPACTION ENGINE (18:00 - 24:00 NIGHT SHIFT)
# ==============================================================================
Write-Host "`n------------------------------------------------------------------------------" -ForegroundColor Yellow
Write-Host " [PHASE 4] QUEUE RECALCULATION, COMPACTION & MIDNIGHT BOUNDARY (18:00-24:00)" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Yellow

# STEP 4.1: AUTHENTICATE PATIENT 3 & BOOK APPOINTMENT 3
Write-Host "`n[STEP 4.1] Authenticating Patient 3 (Drajat Jelita) & Booking Appointment 3..." -ForegroundColor Cyan
$patient3Auth = Login-User "patient.0003@amanah-healthcare.test" "secret123"
Assert-Test "Patient 3 authenticated" ($null -ne $patient3Auth.token -and $patient3Auth.token.Length -gt 20)

$patient3Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient3Auth.user.id)';").Trim()
Assert-Test "Patient 3 Profile ID found ($patient3Id)" ($null -ne $patient3Id -and $patient3Id.Length -gt 20)

$book3Payload = @{
    patientId = $patient3Id
    poliklinikId = $poliUmumId
    layananId = $usgServiceId
    appointmentDate = $targetDate
    session = $targetSession
    visitType = "Pemeriksaan Baru"
    complaint = "USG Abdomen Rutin - Recalculation Test 3"
} | ConvertTo-Json

$apt3Res = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $book3Payload -Headers $patient3Auth.headers)
$apt3Id = $apt3Res.id
Assert-Test "Appointment 3 created with UUID" ($null -ne $apt3Id -and $apt3Id.Length -gt 20)
Assert-Test "Appointment 3 initial status is 'booked'" ($apt3Res.status -eq "booked")
$ticketNo3 = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apt3Id';").Trim()
Assert-Test "Ticket 3 queueNumber matches decomposed pattern (USG-Mxxx: $ticketNo3)" ($ticketNo3 -match "^USG-[A-Z0-9]+$")
Assert-Test "Ticket 3 is sequential after Ticket 2 ($ticketNo2 != $ticketNo3)" ($ticketNo2 -ne $ticketNo3)
Write-Host " Created Appointment 3: ID=$apt3Id, TicketQueue=$ticketNo3, Code=$($apt3Res.bookingCode)" -ForegroundColor Green

# STEP 4.2: ASSIGN DOCTOR TO APPOINTMENT 3 (SHARED PARTITION WITH APPOINTMENT 2)
Write-Host "`n[STEP 4.2] Assigning Same Doctor ($($targetDoctor.name)) to Appointment 3..." -ForegroundColor Cyan
$assignDoc3 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt3Id/doctor" -Method Patch -Body (@{ doctorId = $targetDoctor.id } | ConvertTo-Json) -Headers $adminAuth.headers
Assert-Test "Doctor assigned to Appointment 3" ($assignDoc3.message -match "Dokter berhasil")

$assignRoom3 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt3Id/room" -Method Patch -Body (@{ roomId = $targetRoom.id } | ConvertTo-Json) -Headers $adminAuth.headers
Assert-Test "Room assigned to Appointment 3" ($assignRoom3.message -match "Ruangan berhasil")

# STEP 4.3: VERIFY SEQUENTIAL QUEUE COMPACTION (1..N FIFO ORDER)
Write-Host "`n[STEP 4.3] Verifying Sequential Queue Compaction (1..N FIFO Order)..." -ForegroundColor Cyan
# At this point, Appointment 1 is completed.
# Appointment 2 is waiting (first active under this doctor).
# Appointment 3 is booked (second active under this doctor).
$apt2QueueNum = (Run-DockerSql "SELECT queue_number FROM appointments WHERE id = '$apt2Id';").Trim()
$apt2WaitingPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
Assert-Test "Appointment 2 queue_number is compacted to 1 ($apt2QueueNum)" ($apt2QueueNum -eq "1")
Assert-Test "Appointment 2 ticket waiting_position is 1 ($apt2WaitingPos)" ($apt2WaitingPos -eq "1")

$apt3QueueNum = (Run-DockerSql "SELECT queue_number FROM appointments WHERE id = '$apt3Id';").Trim()
$apt3WaitingPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt3Id';").Trim()
Assert-Test "Appointment 3 queue_number is compacted to 2 ($apt3QueueNum)" ($apt3QueueNum -eq "2")
Assert-Test "Appointment 3 ticket waiting_position is 2 ($apt3WaitingPos)" ($apt3WaitingPos -eq "2")

# STEP 4.4: VERIFY NIGHT SHIFT MIDNIGHT BOUNDARY RESOLUTION (NO TEMPORAL RANGE ERROR)
Write-Host "`n[STEP 4.4] Verifying Night Shift (18:00-24:00) Temporal Midnight Resolution..." -ForegroundColor Cyan
# Check docker logs of backend-api for any Temporal range error
$dockerRecentLogs = docker logs backend-api-1 --tail 50 2>&1
$hasRangeError = $dockerRecentLogs | Select-String -Pattern "value out of range: 0 <= 24 <= 23"
Assert-Test "Backend logs have NO Temporal 'value out of range' error" ($null -eq $hasRangeError)

# STEP 4.5: AUTOMATIC COMPACTION ON CANCEL (ELIMINATE GAPS)
Write-Host "`n[STEP 4.5] Testing Automatic Queue Compaction on Middle Appointment Cancellation..." -ForegroundColor Cyan
# Cancel Appointment 2
$cancelRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/cancel" -Method Patch -Headers $adminAuth.headers -Body (@{ reason = "Pasien berhalangan hadir - E2E compaction test" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Appointment 2 cancelled by admin" ($cancelRes.message -match "dibatalkan" -or $cancelRes.data.status -eq "cancelled")

# DB Check 4.5: Appointment 2 is cancelled and its ticket waiting_position is cleared (NULL)
Assert-DbField "SELECT status FROM appointments WHERE id = '$apt2Id';" "cancelled" "DB: Appointment 2 status is cancelled"
Assert-DbField "SELECT waiting_position IS NULL FROM queue_tickets WHERE appointment_id = '$apt2Id';" "t" "DB: Cancelled ticket waiting_position is cleared (NULL)"

# DB Check 4.5: Appointment 3 automatically shifted up from position 2 to position 1!
$apt3CompactedQueueNum = (Run-DockerSql "SELECT queue_number FROM appointments WHERE id = '$apt3Id';").Trim()
$apt3CompactedWaitingPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt3Id';").Trim()
Assert-Test "Appointment 3 automatically compacted from position 2 -> 1 in appointments ($apt3CompactedQueueNum)" ($apt3CompactedQueueNum -eq "1")
Assert-Test "Appointment 3 automatically compacted from position 2 -> 1 in queue_tickets ($apt3CompactedWaitingPos)" ($apt3CompactedWaitingPos -eq "1")

# ==============================================================================
# PHASE 5: SUMMARY & RESULTS REPORT
# ==============================================================================
Write-Host "`n[COMPLETED] All End-to-End Hardened Lifecycle & Recalculation Tests Completed." -ForegroundColor Green
if ($Standalone) {
    Print-TestSummary "Hardened Appointment Lifecycle & Recalculation E2E Suite"
}

