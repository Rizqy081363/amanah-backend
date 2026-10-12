# ==============================================================================
# AMANAH HEALTHCARE - E2E TEST: UNASSIGNED PARALLEL QUEUE STREAMS
# Verifies that unassigned appointments in independent categories (Poli Umum vs Poli KIA)
# each start at queue 001, increment independently, and compact independently on assignment.
# ==============================================================================
param (
    [switch]$Standalone = $true
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\..\common.ps1"
if ($Standalone) { Reset-TestCounters }

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] UNASSIGNED PARALLEL QUEUE STREAMS (POLI UMUM & POLI KIA)" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl
$targetDate = "2026-10-26"

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
Write-Host "`n[STEP 1] Authenticating and discovering master data..." -ForegroundColor Yellow

$adminAuth = Login-Admin
Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)
$adminHeaders = @{ Authorization = "Bearer $($adminAuth.token)"; "Content-Type" = "application/json" }

$patient1Auth = Login-Patient # Dewi Lestari
$patient2Auth = Login-User "patient.0002@amanah-healthcare.test" "secret123"
$patient3Auth = Login-User "patient.0003@amanah-healthcare.test" "secret123"
$patient4Auth = Login-User "patient.0004@amanah-healthcare.test" "secret123"

$patient1Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient1Auth.user.id)';").Trim()
$patient2Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient2Auth.user.id)';").Trim()
$patient3Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient3Auth.user.id)';").Trim()
$patient4Id = (Run-DockerSql "SELECT id FROM patient_profiles WHERE user_id = '$($patient4Auth.user.id)';").Trim()

$poliUmumId = (Run-DockerSql "SELECT id FROM clinic_units WHERE code = 'poli_umum';").Trim()
$poliKiaId = (Run-DockerSql "SELECT id FROM clinic_units WHERE code = 'poli_kia';").Trim()

$serviceUmum1 = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'usg_umum';").Trim()
$serviceUmum2 = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'general_checkup';").Trim()
$serviceKIA1 = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'pregnancy_checkup';").Trim()
$serviceKIA2 = (Run-DockerSql "SELECT id FROM clinic_services WHERE code = 'persalinan_normal';").Trim()

$docA = (Run-DockerSql "SELECT id FROM practitioners WHERE display_name = 'dr. Ahmad Santoso';").Trim()

Assert-Test "Poli Umum ID discovered" ($poliUmumId.Length -gt 20)
Assert-Test "Poli KIA ID discovered" ($poliKiaId.Length -gt 20)
Assert-Test "Services discovered" ($serviceUmum1.Length -gt 20 -and $serviceKIA1.Length -gt 20)

# ------------------------------------------------------------------------------
# STEP 2: CREATE FIRST POLI UMUM APPOINTMENT (UNASSIGNED)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Patient 1 creates Poli Umum appointment (unassigned)..." -ForegroundColor Yellow

$apt1Body = @{
    patientId = $patient1Id
    poliklinikId = $poliUmumId
    layananId = $serviceUmum1
    staffId = $null
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan USG Umum"
} | ConvertTo-Json

$apt1 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient1Auth.headers -Body $apt1Body -ContentType "application/json")
$apt1Id = $apt1.id
$apt1Ticket = $apt1.queueNumber
Write-Host "Patient 1 (Poli Umum, unassigned) -> Ticket: $apt1Ticket, Queue: $($apt1.queueNumber)" -ForegroundColor Cyan
Assert-Test "Patient 1 (Poli Umum) starts at 001" ($apt1Ticket -match "001$")
Assert-Test "Patient 1 queue number is 1" ($apt1.queueNumber -eq 1 -or $apt1Ticket -match "001$")

# ------------------------------------------------------------------------------
# STEP 3: CREATE FIRST POLI KIA APPOINTMENT (UNASSIGNED) - THE CRITICAL CORE TEST
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Patient 2 creates Poli KIA appointment (unassigned)..." -ForegroundColor Yellow

$apt2Body = @{
    patientId = $patient2Id
    poliklinikId = $poliKiaId
    layananId = $serviceKIA1
    staffId = $null
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "Pemeriksaan Kehamilan ANC"
} | ConvertTo-Json

$apt2 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient2Auth.headers -Body $apt2Body -ContentType "application/json")
$apt2Id = $apt2.id
$apt2Ticket = $apt2.queueNumber
Write-Host "Patient 2 (Poli KIA, unassigned) -> Ticket: $apt2Ticket, Queue: $($apt2.queueNumber)" -ForegroundColor Cyan

# CRITICAL ASSERTION: MUST START AT 001, NOT 002!
Assert-Test "Patient 2 (Poli KIA) MUST start at 001 independently (NOT inherit Poli Umum 002!)" ($apt2Ticket -match "001$")

# Check DB persisted state
$dbApt2Queue = (Run-DockerSql "SELECT queue_number FROM appointments WHERE id = '$apt2Id';").Trim()
$dbTicket2No = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
$dbTicket2Pos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
Write-Host "DB Row for Patient 2: apt_queue=$dbApt2Queue, ticket_no=$dbTicket2No, waiting_pos=$dbTicket2Pos" -ForegroundColor DarkCyan
Assert-Test "DB appointments.queue_number is 1" ($dbApt2Queue -eq "1")
Assert-Test "DB queue_tickets.queue_number ends in 001" ($dbTicket2No -match "001$")
Assert-Test "DB queue_tickets.waiting_position is 1" ($dbTicket2Pos -eq "1")

# ------------------------------------------------------------------------------
# STEP 4: CREATE SECOND APPOINTMENTS IN EACH STREAM (SHOULD INCREMENT TO 002 INDEPENDENTLY)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Creating 2nd unassigned appointments in both Poli Umum & Poli KIA..." -ForegroundColor Yellow

# Patient 3 in Poli Umum
$apt3Body = @{
    patientId = $patient3Id
    poliklinikId = $poliUmumId
    layananId = $serviceUmum2
    staffId = $null
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "General Checkup Umum"
} | ConvertTo-Json
$apt3 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient3Auth.headers -Body $apt3Body -ContentType "application/json")
$apt3Ticket = $apt3.queueNumber
Write-Host "Patient 3 (Poli Umum 2nd) -> Ticket: $apt3Ticket" -ForegroundColor Cyan
Assert-Test "Patient 3 receives 002 in Poli Umum stream" ($apt3Ticket -match "002$")

# Patient 4 in Poli KIA
$apt4Body = @{
    patientId = $patient4Id
    poliklinikId = $poliKiaId
    layananId = $serviceKIA2
    staffId = $null
    appointmentDate = $targetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "Persalinan Normal"
} | ConvertTo-Json
$apt4 = Get-ResponseData (Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Headers $patient4Auth.headers -Body $apt4Body -ContentType "application/json")
$apt4Ticket = $apt4.queueNumber
Write-Host "Patient 4 (Poli KIA 2nd) -> Ticket: $apt4Ticket" -ForegroundColor Cyan
Assert-Test "Patient 4 receives 002 in Poli KIA stream" ($apt4Ticket -match "002$")

# ------------------------------------------------------------------------------
# STEP 5: ASSIGN PATIENT 1 (POLI UMUM #1) TO DOCTOR A & VERIFY STREAM COMPACTION
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Assigning Patient 1 (Poli Umum #1) to Doctor A..." -ForegroundColor Yellow

$assignBody = @{
    doctorId = $docA
    reason = "Penugasan dokter Poli Umum"
} | ConvertTo-Json

$assignRes = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt1Id/doctor" -Method Patch -Headers $adminHeaders -Body $assignBody
Assert-Test "Patient 1 assigned to Doctor A successfully" ($null -ne $assignRes)

# Patient 1 is now in Doctor A's stream: Position 1
$docATicket1 = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apt1Id';").Trim()
$docAPos1 = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt1Id';").Trim()
Assert-Test "Patient 1 has position 1 under Doctor A" ($docAPos1 -eq "1" -and $docATicket1 -match "001$")

# Remaining Poli Umum unassigned appointment (Patient 3) must compact from #2 to #1!
$apt3CompactTicket = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$($apt3.id)';").Trim()
$apt3CompactPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$($apt3.id)';").Trim()
Write-Host "Patient 3 after Patient 1 assigned: ticket=$apt3CompactTicket, pos=$apt3CompactPos" -ForegroundColor Cyan
Assert-Test "Patient 3 compacted to position 1 in unassigned Poli Umum" ($apt3CompactPos -eq "1" -and $apt3CompactTicket -match "001$")

# Poli KIA unassigned appointments must remain COMPLETELY UNCHANGED!
$apt2CheckTicket = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
$apt2CheckPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
$apt4CheckTicket = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$($apt4.id)';").Trim()
$apt4CheckPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$($apt4.id)';").Trim()
Assert-Test "Poli KIA Patient 2 remains 001 (position 1)" ($apt2CheckPos -eq "1" -and $apt2CheckTicket -match "001$")
Assert-Test "Poli KIA Patient 4 remains 002 (position 2)" ($apt4CheckPos -eq "2" -and $apt4CheckTicket -match "002$")

# ------------------------------------------------------------------------------
# STEP 6: CROSS-CATEGORY ASSIGNMENT (PATIENT 2 FROM POLI KIA TO DOCTOR A)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Assigning Patient 2 (Poli KIA) to Doctor A (Cross-Category)..." -ForegroundColor Yellow

$assign2Body = @{
    doctorId = $docA
    reason = "Penugasan lintas poli ke dr Ahmad"
} | ConvertTo-Json

$assign2Res = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$apt2Id/doctor" -Method Patch -Headers $adminHeaders -Body $assign2Body
Assert-Test "Patient 2 assigned to Doctor A successfully" ($null -ne $assign2Res)

# Under Doctor A: Patient 1 is #1, Patient 2 is #2!
$docAPos2 = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
$docATicket2 = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$apt2Id';").Trim()
Write-Host "Doctor A stream: Patient 2 pos=$docAPos2, ticket=$docATicket2" -ForegroundColor Cyan
Assert-Test "Patient 2 placed at position 2 in Doctor A stream" ($docAPos2 -eq "2")
Assert-Test "Patient 2 ticket ends with 002 in Doctor A stream" ($docATicket2 -match "002$")

# Remaining Poli KIA unassigned appointment (Patient 4) must compact to #1!
$apt4CompactTicket = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$($apt4.id)';").Trim()
$apt4CompactPos = (Run-DockerSql "SELECT waiting_position FROM queue_tickets WHERE appointment_id = '$($apt4.id)';").Trim()
Write-Host "Poli KIA Patient 4 after compaction: ticket=$apt4CompactTicket, pos=$apt4CompactPos" -ForegroundColor Cyan
Assert-Test "Patient 4 compacted to position 1 in unassigned Poli KIA" ($apt4CompactPos -eq "1" -and $apt4CompactTicket -match "001$")

# ------------------------------------------------------------------------------
# SUMMARY & RESULTS
# ------------------------------------------------------------------------------
Print-TestSummary "Unassigned Parallel Queue Streams"
