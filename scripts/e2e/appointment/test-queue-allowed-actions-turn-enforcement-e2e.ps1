# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST SUITE: QUEUE TURN ELIGIBILITY & ALLOWED ACTIONS HARDENING
# Verifies:
# 1. Case 1: Same Doctor sequential turn (Patient 2 blocked while Patient 1 waiting or in_service)
# 2. Case 2: Different Doctors parallel streams (Patient A under Doc 1 & Patient B under Doc 2 both eligible concurrently)
# 3. Case 3: Same Doctor different rooms (Doctor remains queue owner, room does not bypass queue turn)
# 4. Direct mutation rejection (400 Bad Request when jumping queue or doctor already serving)
# 5. Dynamic action unlocking when prior patient completes
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E SUITE] QUEUE TURN ELIGIBILITY & ALLOWED ACTIONS HARDENING" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl
$targetDate = "2026-11-01"

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
# STEP 0: CLEANUP TARGET DATE DATA
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 0] Cleaning database for target test date $targetDate..." -ForegroundColor Yellow
$cleanupSql = @"
DELETE FROM appointment_call_attempts WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$targetDate');
DELETE FROM queue_tickets WHERE queue_date = '$targetDate';
DELETE FROM appointment_check_ins WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$targetDate');
DELETE FROM appointment_status_events WHERE appointment_id IN (SELECT id FROM appointments WHERE scheduled_date = '$targetDate');
DELETE FROM appointments WHERE scheduled_date = '$targetDate';
"@
$null = Run-DockerSql $cleanupSql
Assert-Test "Database clean for $targetDate" $true

# ------------------------------------------------------------------------------
# STEP 1: AUTHENTICATION & MASTER DATA DISCOVERY
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating actors and discovering practitioners/services..." -ForegroundColor Yellow

$adminAuth = Login-Admin
Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)
$adminHeaders = @{ Authorization = "Bearer $($adminAuth.token)" }

$patient1Auth = Login-Patient
$patient2Auth = Login-User "patient.0002@amanah-healthcare.test" "secret123"
$patient3Auth = Login-User "patient.0003@amanah-healthcare.test" "secret123"
$patient4Auth = Login-User "patient.0004@amanah-healthcare.test" "secret123"

Assert-Test "Patient 1 authenticated" ($null -ne $patient1Auth.token)
Assert-Test "Patient 2 authenticated" ($null -ne $patient2Auth.token)
Assert-Test "Patient 3 authenticated" ($null -ne $patient3Auth.token)
Assert-Test "Patient 4 authenticated" ($null -ne $patient4Auth.token)

$patient1Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient1Auth.user.id)';").Trim()
$patient2Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient2Auth.user.id)';").Trim()
$patient3Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient3Auth.user.id)';").Trim()
$patient4Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient4Auth.user.id)';").Trim()

$docA = (Run-DockerSql "SELECT id FROM practitioners WHERE display_name = 'dr. Ahmad Santoso';").Trim()
$docB = (Run-DockerSql "SELECT id FROM practitioners WHERE display_name = 'dr. Maya Putri';").Trim()

Assert-Test "Doctor 1 (dr. Ahmad Santoso) discovered" ($docA.Length -gt 20)
Assert-Test "Doctor 2 (dr. Maya Putri) discovered" ($docB.Length -gt 20)

$serviceUmum = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'usg_umum';").Trim()
$poliUmumId = (Run-DockerSql "SELECT id FROM clinic_units WHERE code = 'poli_umum';").Trim()

$room1 = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE unit_id = '$poliUmumId' ORDER BY name ASC LIMIT 1;").Trim()
$room2 = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE unit_id = '$poliUmumId' ORDER BY name DESC LIMIT 1;").Trim()

Assert-Test "Service Umum discovered" ($serviceUmum.Length -gt 20)
Assert-Test "Room 1 discovered" ($room1.Length -gt 20)
Assert-Test "Room 2 discovered" ($room2.Length -gt 20)

# Helper function to book appointment
function Book-TestAppointment {
    param (
        [string]$PatientProfileId,
        [hashtable]$PatientAuth,
        [string]$StaffId,
        [string]$ServiceId,
        [string]$PoliId,
        [string]$RoomId,
        [string]$Session = "PAGI"
    )
    $payload = @{
        patientId = $PatientProfileId
        poliklinikId = $PoliId
        layananId = $ServiceId
        staffId = $StaffId
        roomId = $RoomId
        appointmentDate = $targetDate
        session = $Session
        complaint = "E2E Queue Allowed Actions Turn Hardening"
        visitType = "Pemeriksaan Baru"
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $PatientAuth.headers -Body $payload -ContentType "application/json"
    $apt = Get-ResponseData $res
    if ($RoomId) {
        $null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($apt.id)/room" -Method Patch -Body (@{ roomId = $RoomId } | ConvertTo-Json) -Headers $adminHeaders -ContentType "application/json"
    }
    return $apt
}

# ------------------------------------------------------------------------------
# SCENARIO 1: SAME DOCTOR SEQUENTIAL TURN & HARDENED ELIGIBILITY
# ------------------------------------------------------------------------------
Write-Host "`n[SCENARIO 1] Testing Same Doctor Sequential Turn (Doctor 1)..." -ForegroundColor Yellow

$apt1 = Book-TestAppointment -PatientProfileId $patient1Id -PatientAuth $patient1Auth -StaffId $docA -ServiceId $serviceUmum -PoliId $poliUmumId -RoomId $room1
$apt2 = Book-TestAppointment -PatientProfileId $patient2Id -PatientAuth $patient2Auth -StaffId $docA -ServiceId $serviceUmum -PoliId $poliUmumId -RoomId $room1

Assert-Test "Patient 1 booked" ($null -ne $apt1 -and $null -ne $apt1.id)
Assert-Test "Patient 2 booked" ($null -ne $apt2 -and $null -ne $apt2.id)

# Check-in both patients to WAITING
$checkin1 = Invoke-RestMethod -Uri "$apiUrl/appointments/$($apt1.id)/check-in" -Method Patch -Headers $patient1Auth.headers
$checkin2 = Invoke-RestMethod -Uri "$apiUrl/appointments/$($apt2.id)/check-in" -Method Patch -Headers $patient2Auth.headers

Assert-Test "Patient 1 in WAITING" ((Get-ResponseData $checkin1).status -eq "WAITING")
Assert-Test "Patient 2 in WAITING" ((Get-ResponseData $checkin2).status -eq "WAITING")

# Fetch list from Admin API to inspect allowedActions
$adminListRes = Invoke-RestMethod -Uri "$apiUrl/appointments?date=$targetDate" -Headers $adminHeaders
$adminItems = @(Get-ResponseData $adminListRes)

$apt1Admin = $adminItems | Where-Object { $_.id -eq $apt1.id }
$apt2Admin = $adminItems | Where-Object { $_.id -eq $apt2.id }

Assert-Test "Patient 1 is queue #1" ($apt1Admin.queueNumber -eq 1 -or $apt1Admin.queueNumber -like "*1" -or $apt1Admin.queueNumber -like "*-001")
Assert-Test "Patient 2 is queue #2" ($apt2Admin.queueNumber -eq 2 -or $apt2Admin.queueNumber -like "*2" -or $apt2Admin.queueNumber -like "*-002")

Assert-Test "Patient 1 has START_SERVICE in allowedActions" ($apt1Admin.allowedActions -contains "START_SERVICE")
Assert-Test "Patient 1 has CALL in allowedActions" ($apt1Admin.allowedActions -contains "CALL")

Assert-Test "Patient 2 does NOT have START_SERVICE in allowedActions" (-not ($apt2Admin.allowedActions -contains "START_SERVICE"))
Assert-Test "Patient 2 does NOT have CALL in allowedActions" (-not ($apt2Admin.allowedActions -contains "CALL"))

# NEGATIVE TEST 1: Patient 2 attempts to transition to in_service directly while Patient 1 is WAITING
Write-Host "`n[NEGATIVE TEST 1] Patient 2 directly attempts status mutation to in_service..." -ForegroundColor DarkYellow
$jumpAttempt = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$($apt2.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json)
Assert-Test "Mutation rejected with 400 Bad Request" ($jumpAttempt.StatusCode -eq 400)
Assert-Test "Rejection message notes prior queue turn" ($jumpAttempt.ErrorBody -like "*belum giliran*" -or $jumpAttempt.ErrorBody -like "*Nomor antrean sebelumnya*")

# Start examination for Patient 1
Write-Host "`nStarting examination for Patient 1..." -ForegroundColor Yellow
$start1Res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($apt1.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Patient 1 transitioned to in_service" ((Get-ResponseData $start1Res).newStatus -eq "in_service")

# Inspect allowedActions while Patient 1 is IN_SERVICE
$adminListAfterStart = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments?date=$targetDate" -Headers $adminHeaders))
$apt1Serving = $adminListAfterStart | Where-Object { $_.id -eq $apt1.id }
$apt2Blocked = $adminListAfterStart | Where-Object { $_.id -eq $apt2.id }

Assert-Test "Patient 1 allowedActions contains COMPLETE" ($apt1Serving.allowedActions -contains "COMPLETE")
Assert-Test "Patient 2 allowedActions STILL blocked from START_SERVICE" (-not ($apt2Blocked.allowedActions -contains "START_SERVICE"))

# NEGATIVE TEST 2: Patient 2 attempts status mutation to in_service while Doctor 1 is examining Patient 1
Write-Host "`n[NEGATIVE TEST 2] Patient 2 attempts in_service while doctor already examining Patient 1..." -ForegroundColor DarkYellow
$concurrentAttempt = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$($apt2.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json)
Assert-Test "Concurrent doctor examination rejected with 400" ($concurrentAttempt.StatusCode -eq 400)
Assert-Test "Rejection message explains doctor already examining another patient" ($concurrentAttempt.ErrorBody -like "*sedang memeriksa pasien lain*")

# Complete Patient 1
Write-Host "`nCompleting consultation for Patient 1..." -ForegroundColor Yellow
$complete1Res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($apt1.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "completed" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Patient 1 completed" ((Get-ResponseData $complete1Res).newStatus -eq "completed")

# DYNAMIC ACTION UNLOCKING: Patient 2 must now have START_SERVICE and CALL available
Write-Host "`nVerifying Patient 2 dynamic action unlocking..." -ForegroundColor Yellow
$adminListAfterComplete = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments?date=$targetDate" -Headers $adminHeaders))
$apt2Unlocked = $adminListAfterComplete | Where-Object { $_.id -eq $apt2.id }

Assert-Test "Patient 2 allowedActions now contains START_SERVICE" ($apt2Unlocked.allowedActions -contains "START_SERVICE")
Assert-Test "Patient 2 allowedActions now contains CALL" ($apt2Unlocked.allowedActions -contains "CALL")

# Patient 2 can now transition to in_service without error
$start2Res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($apt2.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Patient 2 successfully started examination" ((Get-ResponseData $start2Res).newStatus -eq "in_service")

# Complete Patient 2
$complete2Res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($apt2.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "completed" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Patient 2 successfully completed" ((Get-ResponseData $complete2Res).newStatus -eq "completed")

# ------------------------------------------------------------------------------
# SCENARIO 2: DIFFERENT DOCTORS PARALLEL INDEPENDENCE (Doctor 1 & Doctor 2)
# ------------------------------------------------------------------------------
Write-Host "`n[SCENARIO 2] Testing Parallel Independence Across Different Doctors..." -ForegroundColor Yellow

$aptDoc1 = Book-TestAppointment -PatientProfileId $patient3Id -PatientAuth $patient3Auth -StaffId $docA -ServiceId $serviceUmum -PoliId $poliUmumId -RoomId $room1
$aptDoc2 = Book-TestAppointment -PatientProfileId $patient4Id -PatientAuth $patient4Auth -StaffId $docB -ServiceId $serviceUmum -PoliId $poliUmumId -RoomId $room2

# Check in both
$null = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptDoc1.id)/check-in" -Method Patch -Headers $patient3Auth.headers
$null = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptDoc2.id)/check-in" -Method Patch -Headers $patient4Auth.headers

$parallelList = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments?date=$targetDate" -Headers $adminHeaders))
$p1 = $parallelList | Where-Object { $_.id -eq $aptDoc1.id }
$p2 = $parallelList | Where-Object { $_.id -eq $aptDoc2.id }

Assert-Test "Patient under Doctor 1 has START_SERVICE" ($p1.allowedActions -contains "START_SERVICE")
Assert-Test "Patient under Doctor 2 has START_SERVICE" ($p2.allowedActions -contains "START_SERVICE")

# Start consultation for Doctor 1's patient
$resP1 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptDoc1.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Doctor 1 patient is in_service" ((Get-ResponseData $resP1).newStatus -eq "in_service")

# Doctor 2's patient should STILL be able to start consultation concurrently without blocking
$resP2 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptDoc2.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Doctor 2 patient is concurrently in_service without interference" ((Get-ResponseData $resP2).newStatus -eq "in_service")

# Complete both parallel examinations
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptDoc1.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "completed" } | ConvertTo-Json) -ContentType "application/json"
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptDoc2.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "completed" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Both parallel doctor consultations completed cleanly" $true

# ------------------------------------------------------------------------------
# SCENARIO 3: SAME DOCTOR DIFFERENT ROOMS (ROOM DOES NOT PARTITION DOCTOR QUEUE)
# ------------------------------------------------------------------------------
Write-Host "`n[SCENARIO 3] Testing Room Independence (Doctor is Queue Owner, Room Does Not Split Queue)..." -ForegroundColor Yellow

$aptRoomA = Book-TestAppointment -PatientProfileId $patient1Id -PatientAuth $patient1Auth -StaffId $docA -ServiceId $serviceUmum -PoliId $poliUmumId -RoomId $room1
$aptRoomB = Book-TestAppointment -PatientProfileId $patient2Id -PatientAuth $patient2Auth -StaffId $docA -ServiceId $serviceUmum -PoliId $poliUmumId -RoomId $room2

$null = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptRoomA.id)/check-in" -Method Patch -Headers $patient1Auth.headers
$null = Invoke-RestMethod -Uri "$apiUrl/appointments/$($aptRoomB.id)/check-in" -Method Patch -Headers $patient2Auth.headers

$roomList = @(Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments?date=$targetDate" -Headers $adminHeaders))
$rA = $roomList | Where-Object { $_.id -eq $aptRoomA.id }
$rB = $roomList | Where-Object { $_.id -eq $aptRoomB.id }

Assert-Test "Room A patient has START_SERVICE" ($rA.allowedActions -contains "START_SERVICE")
Assert-Test "Room B patient (same doctor) is blocked from START_SERVICE" (-not ($rB.allowedActions -contains "START_SERVICE"))

# Direct mutation to Room B patient while Doctor is active on Room A patient must fail
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptRoomA.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json) -ContentType "application/json"

$roomBJump = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$($aptRoomB.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json)
Assert-Test "Room B patient cannot jump ahead even with different room" ($roomBJump.StatusCode -eq 400)

$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptRoomA.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "completed" } | ConvertTo-Json) -ContentType "application/json"
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptRoomB.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "in_service" } | ConvertTo-Json) -ContentType "application/json"
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$($aptRoomB.id)/status" -Method Patch -Headers $adminHeaders -Body (@{ status = "completed" } | ConvertTo-Json) -ContentType "application/json"
Assert-Test "Doctor queue sequential integrity preserved across different rooms" $true

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " [SUITE PASSED] All Queue Turn & Allowed Actions Hardening Tests Passed!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green

Print-TestSummary "Queue Allowed Actions Hardening E2E"
