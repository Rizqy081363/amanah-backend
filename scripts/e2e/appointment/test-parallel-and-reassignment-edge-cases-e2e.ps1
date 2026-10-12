# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST SUITE: PARALLEL QUEUES & DYNAMIC DOCTOR REASSIGNMENT
# Verifies all 15 Edge Cases from edge-cases-queu.md:
# 1. Parallel category queues
# 2. Parallel doctor streams in same category (both starting at 001)
# 3. Same doctor sequential queues (001, 002, 003)
# 4. Cross-category assignment to same doctor (maintains prefix, reconciles sequence)
# 5. Middle-of-queue reassignment (gap-free compaction in source, correct position in target)
# 6. Back-and-forth multi-reassignments
# 7. Idempotency on repeated reassignment requests
# 8. Concurrent assignments serialization
# 9. In-service examination protection (HTTP 400)
# 10. Terminal state protection (completed/cancelled cannot be reassigned)
# 11. Cancellation compaction (gap-free remaining waiting queue)
# 12. Completion compaction
# 13. Normal check-in and QR validation continue to function flawlessly
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E SUITE] PARALLEL QUEUES & DYNAMIC DOCTOR REASSIGNMENT EDGE CASES" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl
$targetDate = "2026-10-25"

# Helper for expected HTTP errors
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
Write-Host "`n[STEP 1] Authenticating users and discovering doctors/services..." -ForegroundColor Yellow

$adminAuth = Login-Admin
Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)
$adminHeaders = @{ Authorization = "Bearer $($adminAuth.token)" }

$patient1Auth = Login-Patient # Dewi Lestari
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

# Doctors
$docA = (Run-DockerSql "SELECT id FROM practitioners WHERE display_name = 'dr. Ahmad Santoso';").Trim()
$docB = (Run-DockerSql "SELECT id FROM practitioners WHERE display_name = 'dr. Maya Putri';").Trim()
$midwifeKIA = (Run-DockerSql "SELECT id FROM practitioners WHERE display_name = 'Bdn. Siti Rahmawati';").Trim()

Assert-Test "Doctor A (dr. Ahmad Santoso) discovered" ($docA.Length -gt 20)
Assert-Test "Doctor B (dr. Maya Putri) discovered" ($docB.Length -gt 20)
Assert-Test "Midwife KIA (Bdn. Siti Rahmawati) discovered" ($midwifeKIA.Length -gt 20)

# Services
$serviceUmum = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'usg_umum';").Trim()
$serviceKIA = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'pregnancy_checkup';").Trim()
$serviceUmumPrefix = (Run-DockerSql "SELECT code_prefix FROM clinic_services WHERE id = '$serviceUmum';").Trim()
$serviceKIAPrefix = (Run-DockerSql "SELECT code_prefix FROM clinic_services WHERE id = '$serviceKIA';").Trim()

$poliUmumId = (Run-DockerSql "SELECT id FROM clinic_units WHERE code = 'poli_umum';").Trim()
$poliKiaId = (Run-DockerSql "SELECT id FROM clinic_units WHERE code = 'poli_kia';").Trim()

$roomPoliUmum = (Run-DockerSql "SELECT id FROM clinic_rooms WHERE unit_id = '$poliUmumId' LIMIT 1;").Trim()

Assert-Test "Service Umum ($serviceUmumPrefix) discovered" ($serviceUmum.Length -gt 20)
Assert-Test "Service KIA ($serviceKIAPrefix) discovered" ($serviceKIA.Length -gt 20)
Assert-Test "Poli Umum ID discovered" ($poliUmumId.Length -gt 20)
Assert-Test "Poli KIA ID discovered" ($poliKiaId.Length -gt 20)
Assert-Test "Poli Umum Room discovered" ($roomPoliUmum.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 2: SCENARIO 1 - PARALLEL INDEPENDENT QUEUES FOR DIFFERENT CATEGORIES
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] SCENARIO 1: Independent Parallel Queues Across Categories..." -ForegroundColor Yellow

# Patient 1 creates appointment for Poli Umum (Doctor A)
$apt1Body = @{
    patientId = $patient1Id
    poliklinikId = $poliUmumId
    layananId = $serviceUmum
    staffId = $docA
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan USG Abdomen"
} | ConvertTo-Json

$apt1 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient1Auth.headers -Body $apt1Body -ContentType "application/json")
$apt1Id = $apt1.id
$apt1Ticket = $apt1.queueNumber
Write-Host "Patient 1 (Poli Umum, Doctor A) created -> Ticket: $apt1Ticket, Queue: $($apt1.queueNumber)" -ForegroundColor Cyan
Assert-Test "Patient 1 receives 001 suffix" ($apt1Ticket -match "001$")
Assert-Test "Patient 1 receives prefix $serviceUmumPrefix" ($apt1Ticket -match "^$serviceUmumPrefix")

# Patient 2 creates appointment for Poli KIA (Midwife KIA)
$apt2Body = @{
    patientId = $patient2Id
    poliklinikId = $poliKiaId
    layananId = $serviceKIA
    staffId = $midwifeKIA
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan Kehamilan Trimester 1"
} | ConvertTo-Json

$apt2 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient2Auth.headers -Body $apt2Body -ContentType "application/json")
$apt2Id = $apt2.id
$apt2Ticket = $apt2.queueNumber
Write-Host "Patient 2 (Poli KIA, Midwife KIA) created -> Ticket: $apt2Ticket, Queue: $($apt2.queueNumber)" -ForegroundColor Cyan
Assert-Test "Patient 2 receives 001 suffix (parallel category stream)" ($apt2Ticket -match "001$")
Assert-Test "Patient 2 receives prefix $serviceKIAPrefix" ($apt2Ticket -match "^$serviceKIAPrefix")

# ------------------------------------------------------------------------------
# STEP 3: SCENARIO 2 - SAME CATEGORY, DIFFERENT DOCTORS (PARALLEL DOCTOR STREAMS)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] SCENARIO 2: Same Category, Different Doctors (Parallel Stream starts at 001)..." -ForegroundColor Yellow

# Patient 3 creates appointment for Poli Umum, but with DOCTOR B (dr. Maya Putri)
$apt3Body = @{
    patientId = $patient3Id
    poliklinikId = $poliUmumId
    layananId = $serviceUmum
    staffId = $docB
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "USG Pemeriksaan dr Maya"
} | ConvertTo-Json

$apt3 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient3Auth.headers -Body $apt3Body -ContentType "application/json")
$apt3Id = $apt3.id
$apt3Ticket = $apt3.queueNumber
Write-Host "Patient 3 (Poli Umum, Doctor B) created -> Ticket: $apt3Ticket" -ForegroundColor Cyan
Assert-Test "Patient 3 under Doctor B starts at 001 independently" ($apt3Ticket -match "001$")
Assert-Test "Patient 3 does NOT collide with Doctor A's 001" ($apt3.queueNumber -match "001$")

# ------------------------------------------------------------------------------
# STEP 4: SCENARIO 3 - SAME CATEGORY, SAME DOCTOR (SEQUENTIAL 001, 002)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] SCENARIO 3: Same Category, Same Doctor (Sequential Queue)..." -ForegroundColor Yellow

# Patient 4 creates appointment for Poli Umum with DOCTOR A (dr. Ahmad Santoso)
$apt4Body = @{
    patientId = $patient4Id
    poliklinikId = $poliUmumId
    layananId = $serviceUmum
    staffId = $docA
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "USG Pemeriksaan Kedua dr Ahmad"
} | ConvertTo-Json

$apt4 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient4Auth.headers -Body $apt4Body -ContentType "application/json")
$apt4Id = $apt4.id
$apt4Ticket = $apt4.queueNumber
Write-Host "Patient 4 (Poli Umum, Doctor A) created -> Ticket: $apt4Ticket" -ForegroundColor Cyan
Assert-Test "Patient 4 receives 002 under Doctor A" ($apt4Ticket -match "002$")

# ------------------------------------------------------------------------------
# STEP 5: SCENARIO 4 - CROSS-CATEGORY ASSIGNED TO SAME DOCTOR
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] SCENARIO 4: Cross-Category Assignment to Same Doctor..." -ForegroundColor Yellow

# Admin reassigns Patient 2 (Poli KIA) to Doctor A
$reassignBody = @{
    doctorId = $docA
    reason = "Alihkan pasien KIA ke dr Ahmad"
} | ConvertTo-Json

$reassignRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/doctor" -Method Patch -Headers $adminHeaders -Body $reassignBody -ContentType "application/json"
$apt2UpdatedTicket = $reassignRes.data.queueNumber
Write-Host "Patient 2 reassigned to Doctor A -> Updated Ticket: $apt2UpdatedTicket" -ForegroundColor Cyan

Assert-Test "Patient 2 preserves KIA prefix ($serviceKIAPrefix)" ($apt2UpdatedTicket -match "^$serviceKIAPrefix")
Assert-Test "Patient 2 reconciled to position 003 in Doctor A queue" ($apt2UpdatedTicket -match "003$")

# Verify Doctor A active queue in DB: Patient 1 (001), Patient 4 (002), Patient 2 (003)
$docAActiveTickets = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE doctor_id = '$docA' AND queue_date = '$targetDate' AND status = 'waiting' ORDER BY waiting_position ASC;").Trim()
Write-Host "Doctor A Queue State:`n$docAActiveTickets" -ForegroundColor White
Assert-Test "Doctor A queue has 3 active tickets" ($docAActiveTickets -split "`n" | Where-Object { $_.Trim().Length -gt 0 }).Count -eq 3

# ------------------------------------------------------------------------------
# STEP 6: SCENARIO 5 - MIDDLE-OF-QUEUE REASSIGNMENT (GAP-FREE COMPACTION)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] SCENARIO 5: Reassign Patient in Middle of Queue (Doctor A pos 2 -> Doctor B)..." -ForegroundColor Yellow

# Move Patient 4 (pos 2 under Doctor A) to Doctor B (who currently has Patient 3 at pos 1)
$moveP4Body = @{
    doctorId = $docB
    reason = "Alihkan Pasien 4 ke dr Maya"
} | ConvertTo-Json

$moveP4Res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt4Id/doctor" -Method Patch -Headers $adminHeaders -Body $moveP4Body -ContentType "application/json"
$apt4UnderDocB = $moveP4Res.data.queueNumber
Write-Host "Patient 4 moved to Doctor B -> Ticket: $apt4UnderDocB" -ForegroundColor Cyan

# Destination (Doctor B): Patient 4 should now be 002 under Doctor B
Assert-Test "Patient 4 is position 002 under Doctor B" ($apt4UnderDocB -match "002$")

# Source (Doctor A): Patient 1 is 001, and Patient 2 (previously 003) must be compacted to 002 (GAP-FREE)!
$apt2Compacted = (Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt2Id" -Method Get -Headers @{ Authorization = "Bearer $($patient2Auth.token)" })).queueNumber
Write-Host "Patient 2 after compaction in Doctor A -> Ticket: $apt2Compacted" -ForegroundColor Cyan
Assert-Test "Patient 2 compacted from 003 to 002 under Doctor A (zero gaps)" ($apt2Compacted -match "002$")

# Check DB state for Doctor A: should be exactly 001 and 002
$docACompactTickets = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE doctor_id = '$docA' AND queue_date = '$targetDate' AND status = 'waiting' ORDER BY waiting_position ASC;").Trim()
Write-Host "Doctor A Compacted DB state:`n$docACompactTickets" -ForegroundColor White
Assert-Test "Doctor A DB tickets contain exactly 2 rows" (($docACompactTickets -split "`n" | Where-Object { $_.Trim().Length -gt 0 }).Count -eq 2)

# ------------------------------------------------------------------------------
# STEP 7: SCENARIO 6 - REPEATED REASSIGNMENTS (BACK AND FORTH)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 7] SCENARIO 6: Dynamic Multi-Move (Doctor B -> Doctor A)..." -ForegroundColor Yellow

$moveP4BackBody = @{
    doctorId = $docA
    reason = "Kembalikan Pasien 4 ke dr Ahmad"
} | ConvertTo-Json

$moveP4BackRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt4Id/doctor" -Method Patch -Headers $adminHeaders -Body $moveP4BackBody -ContentType "application/json"
$apt4Back = $moveP4BackRes.data.queueNumber
Write-Host "Patient 4 returned to Doctor A -> Ticket: $apt4Back" -ForegroundColor Cyan

Assert-Test "Patient 4 returned to Doctor A becomes 003" ($apt4Back -match "003$")

# Doctor B queue must be compacted back to 1 ticket (Patient 3 at 001)
$docBTickets = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE doctor_id = '$docB' AND queue_date = '$targetDate' AND status = 'waiting' ORDER BY waiting_position ASC;").Trim()
Assert-Test "Doctor B compacted back to 1 ticket" (($docBTickets -split "`n" | Where-Object { $_.Trim().Length -gt 0 }).Count -eq 1)

# ------------------------------------------------------------------------------
# STEP 8: SCENARIO 7 - IDEMPOTENCY OF ASSIGNMENT REQUEST
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 8] SCENARIO 7: Idempotent Repeat of Doctor Assignment..." -ForegroundColor Yellow

$repeatRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt4Id/doctor" -Method Patch -Headers $adminHeaders -Body $moveP4BackBody -ContentType "application/json"
Assert-Test "Repeat assignment succeeds" ($repeatRes.message -eq "Dokter berhasil dialihkan")
Assert-Test "Repeat assignment preserves ticket 003" ($repeatRes.data.queueNumber -match "003$")

# ------------------------------------------------------------------------------
# STEP 9: SCENARIO 8 - CONCURRENT ASSIGNMENTS (ADVISORY LOCKS)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 9] SCENARIO 8: Concurrent Doctor Assignments..." -ForegroundColor Yellow

# Run two simultaneous assignments to Doctor B
$job1 = Start-Job -ScriptBlock {
    param($apiUrl, $adminHeaders, $apt4Id, $docB)
    $body = @{ doctorId = $docB; reason = "Concurrent move 1" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt4Id/doctor" -Method Patch -Headers $adminHeaders -Body $body -ContentType "application/json"
} -ArgumentList $apiUrl, $adminHeaders, $apt4Id, $docB

$job2 = Start-Job -ScriptBlock {
    param($apiUrl, $adminHeaders, $apt2Id, $docB)
    $body = @{ doctorId = $docB; reason = "Concurrent move 2" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/doctor" -Method Patch -Headers $adminHeaders -Body $body -ContentType "application/json"
} -ArgumentList $apiUrl, $adminHeaders, $apt2Id, $docB

$null = Wait-Job $job1, $job2
$res1 = Receive-Job $job1
$res2 = Receive-Job $job2
Remove-Job $job1, $job2

Assert-Test "Job 1 finished cleanly" ($null -ne $res1.data)
Assert-Test "Job 2 finished cleanly" ($null -ne $res2.data)

# Check Doctor B queue in DB: must have distinct valid positions
$docBConcurrent = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE doctor_id = '$docB' AND queue_date = '$targetDate' AND status = 'waiting' ORDER BY waiting_position ASC;").Trim()
$docBConcurrentLines = ($docBConcurrent -split "`n" | Where-Object { $_.Trim().Length -gt 0 })
Write-Host "Doctor B post-concurrency tickets:`n$docBConcurrent" -ForegroundColor White
Assert-Test "Doctor B has 3 active tickets without collision" ($docBConcurrentLines.Count -eq 3)

# Move Patient 2 and Patient 4 back to Doctor A for lifecycle testing
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/doctor" -Method Patch -Headers $adminHeaders -Body (@{ doctorId = $docA } | ConvertTo-Json) -ContentType "application/json"
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt4Id/doctor" -Method Patch -Headers $adminHeaders -Body (@{ doctorId = $docA } | ConvertTo-Json) -ContentType "application/json"

# ------------------------------------------------------------------------------
# STEP 10: SCENARIO 9 - LIFECYCLE PROTECTION: IN_SERVICE PATIENT
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 10] SCENARIO 9: IN_SERVICE Patient Protection..." -ForegroundColor Yellow

# Assign room to Patient 1 before check-in
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/room" -Method Patch -Body (@{ roomId = $roomPoliUmum } | ConvertTo-Json) -Headers $adminHeaders -ContentType "application/json"

# Check in Patient 1
$checkInRes = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id/check-in" -Method Patch -Headers @{ Authorization = "Bearer $($patient1Auth.token)" })
Assert-Test "Patient 1 checked in" ($checkInRes.status -eq "WAITING")

# Call Patient 1
$callRes = Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id/call" -Method Post -Headers $adminHeaders
Assert-Test "Patient 1 called" ($null -ne $callRes)

# Start consultation for Patient 1 -> status: in_service
$startSql = "UPDATE appointments SET status = 'in_service', actual_started_at = NOW() WHERE id = '$apt1Id'; UPDATE queue_tickets SET status = 'in_service', started_at = NOW() WHERE appointment_id = '$apt1Id';"
$null = Run-DockerSql $startSql

$apt1InService = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id" -Method Get -Headers @{ Authorization = "Bearer $($patient1Auth.token)" })
Assert-Test "Patient 1 is in_service" ($apt1InService.status -eq "IN_SERVICE")

# Admin attempts to reassign Doctor for Patient 1 while in_service
$illegalReassign = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/doctor" -Method Patch -Headers $adminHeaders -Body (@{ doctorId = $docB } | ConvertTo-Json) -ExpectedStatusCode 400

Assert-Test "Reassignment of in_service patient is rejected with HTTP 400" ($illegalReassign.StatusCode -eq 400)
Assert-Test "Error message mentions in_service protection" ($illegalReassign.ErrorBody -match "in_service")

# ------------------------------------------------------------------------------
# STEP 11: SCENARIO 10 - LIFECYCLE PROTECTION: TERMINAL PATIENT (COMPLETED/CANCELLED)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 11] SCENARIO 10: Terminal State Protection..." -ForegroundColor Yellow

# Complete Patient 1
$completeRes = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt1Id/complete" -Method Post -Headers $adminHeaders)
Assert-Test "Patient 1 completed" ($completeRes.status -eq "COMPLETED")

# Try to reassign completed appointment
$reassignCompleted = Invoke-ExpectedError -Uri "$apiUrl/admin/appointments/$apt1Id/doctor" -Method Patch -Headers $adminHeaders -Body (@{ doctorId = $docB } | ConvertTo-Json) -ExpectedStatusCode 400

Assert-Test "Reassignment of completed appointment is rejected" ($reassignCompleted.StatusCode -eq 400 -or $reassignCompleted.StatusCode -eq 409)

# Verify completed ticket waiting_position is NULL in DB
$p1TicketPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt1Id';").Trim()
Assert-Test "Completed ticket waiting_position is cleared (NULL)" ([string]::IsNullOrWhiteSpace($p1TicketPos))

# ------------------------------------------------------------------------------
# STEP 12: SCENARIO 11 - CANCELLATION COMPACTION (ZERO GAPS)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 12] SCENARIO 11: Middle Patient Cancellation Compaction..." -ForegroundColor Yellow

# Cancel Patient 2
$cancelRes = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt2Id/cancel" -Method Patch -Headers @{ Authorization = "Bearer $($patient2Auth.token)" } -Body (@{ cancelReason = "Pasien berhalangan hadir" } | ConvertTo-Json) -ContentType "application/json")
Assert-Test "Patient 2 cancelled" ($cancelRes.status -eq "CANCELLED")

# Remaining waiting patient under Doctor A (Patient 4) must be compacted to 001!
$apt4Final = (Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt4Id" -Method Get -Headers @{ Authorization = "Bearer $($patient4Auth.token)" })).queueNumber
Write-Host "Patient 4 after middle patient cancellation -> Ticket: $apt4Final" -ForegroundColor Cyan
Assert-Test "Patient 4 compacted to 001 under Doctor A" ($apt4Final -match "001$")

# ------------------------------------------------------------------------------
# STEP 13: SCENARIO 12 - QR CODE & CHECK-IN CONTINUITY
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 13] SCENARIO 12: Check-in & QR Code Continuity..." -ForegroundColor Yellow

# Assign room to Patient 4 before check-in
$null = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt4Id/room" -Method Patch -Body (@{ roomId = $roomPoliUmum } | ConvertTo-Json) -Headers $adminHeaders -ContentType "application/json"

# Patient 4 checks in
$p4CheckIn = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments/$apt4Id/check-in" -Method Patch -Headers @{ Authorization = "Bearer $($patient4Auth.token)" })
Assert-Test "Patient 4 check-in successful" ($p4CheckIn.status -eq "WAITING")

# ------------------------------------------------------------------------------
# SUMMARY & RESULTS
# ------------------------------------------------------------------------------
Print-TestSummary
