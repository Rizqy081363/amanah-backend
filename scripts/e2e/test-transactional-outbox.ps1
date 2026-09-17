#!/usr/bin/env pwsh
# ==============================================================================
# Amanah Healthcare - Fase 8: Transactional Outbox Pattern & Reliable Dispatcher
# Canonical Rules: ARC-089..094, ARC-096, OPS-144..168, database-design.md
# ==============================================================================
$ErrorActionPreference = "Stop"
$BaseUrl = "http://localhost:3001"
$ApiPrefix = "$BaseUrl/api/v1"

$PassCount = 0
$FailCount = 0

function Assert-Condition($condition, $message) {
    if ($condition) {
        Write-Host "  [PASS] $message" -ForegroundColor Green
        $script:PassCount++
    } else {
        Write-Host "  [FAIL] $message" -ForegroundColor Red
        $script:FailCount++
    }
}

Write-Host "`n=== [FASE 8] TRANSACTIONAL OUTBOX & EVENT DISPATCHING VERIFICATION ===" -ForegroundColor Cyan

# 1. Login Accounts
Write-Host "`n[STEP 1] Authenticating Actors..." -ForegroundColor Yellow

$AdminLoginRes = Invoke-RestMethod -Uri "$ApiPrefix/auth/email/login" -Method Post -Body (@{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$AdminToken = $AdminLoginRes.token
Assert-Condition ($AdminToken -ne $null) "Admin successfully authenticated"

$StaffLoginRes = Invoke-RestMethod -Uri "$ApiPrefix/auth/email/login" -Method Post -Body (@{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$StaffToken = $StaffLoginRes.token
Assert-Condition ($StaffToken -ne $null) "Staff/Doctor successfully authenticated"

$PatientLoginRes = Invoke-RestMethod -Uri "$ApiPrefix/auth/email/login" -Method Post -Body (@{
    email = "pasien@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$PatientToken = $PatientLoginRes.token
Assert-Condition ($PatientToken -ne $null) "Patient successfully authenticated"

# 2. Outbox Observability Endpoints (OPS-161)
Write-Host "`n[STEP 2] Verifying Outbox Metrics and Status Endpoints (OPS-161)..." -ForegroundColor Yellow

$InitialMetrics = Invoke-RestMethod -Uri "$ApiPrefix/outbox/metrics" -Method Get
Assert-Condition ($InitialMetrics -ne $null) "GET /api/v1/outbox/metrics responded successfully"
Assert-Condition ($InitialMetrics.pending -ne $null) "Metrics include 'pending' count: $($InitialMetrics.pending)"
Assert-Condition ($InitialMetrics.processing -ne $null) "Metrics include 'processing' count: $($InitialMetrics.processing)"
Assert-Condition ($InitialMetrics.published -ne $null) "Metrics include 'published' count: $($InitialMetrics.published)"
Assert-Condition ($InitialMetrics.deadLetter -ne $null) "Metrics include 'deadLetter' count: $($InitialMetrics.deadLetter)"

$StatusRes = Invoke-RestMethod -Uri "$ApiPrefix/outbox/status" -Method Get
Assert-Condition ($StatusRes.total -eq $InitialMetrics.total) "GET /api/v1/outbox/status returns consistent metrics"

# 3. Create Appointment & Verify Outbox Persistence (ARC-093, OPS-159)
Write-Host "`n[STEP 3] Creating Appointment & Verifying Transactional Outbox Event..." -ForegroundColor Yellow

$Clinics = Invoke-RestMethod -Uri "$ApiPrefix/clinics" -Method Get
$PoliId = $Clinics[0].id
$Services = Invoke-RestMethod -Uri "$ApiPrefix/clinics/$PoliId/layanan" -Method Get
$ServiceId = $Services[0].id
$RandomOffset = Get-Random -Minimum 100 -Maximum 9000
$TargetDate = (Get-Date).AddDays($RandomOffset).ToString("yyyy-MM-dd")

$CreateBody = @{
    poliklinikId = $PoliId
    layananId = $ServiceId
    appointmentDate = $TargetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "E2E Test Transactional Outbox Pattern"
} | ConvertTo-Json

$AppointmentRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments" -Method Post -Headers @{
    Authorization = "Bearer $PatientToken"
} -Body $CreateBody -ContentType "application/json"

$AppointmentId = $AppointmentRes.id
Assert-Condition ($AppointmentId -ne $null) "Appointment created with ID: $AppointmentId"

# Allow background worker to claim and publish
Start-Sleep -Milliseconds 800

# Direct check in PostgreSQL outbox_events table
$OutboxDbRecord = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status, event_type, aggregate_type, aggregate_id FROM outbox_events WHERE aggregate_id = '$AppointmentId' AND event_type = 'appointment.created.v1';"
Assert-Condition ($OutboxDbRecord -ne "") "Outbox event recorded in PostgreSQL for appointment.created.v1"
Assert-Condition ($OutboxDbRecord -like "published*") "Outbox event status is 'published'"

# 4. Status Transition: Check-in via Outbox
Write-Host "`n[STEP 4] Check-in Appointment & Verifying Status Transition Outbox Event..." -ForegroundColor Yellow

$CheckInRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments/$AppointmentId/check-in" -Method Patch -Headers @{
    Authorization = "Bearer $PatientToken"
}
Assert-Condition ($CheckInRes.status -eq "MENUNGGU") "Appointment check-in returned MENUNGGU"

Start-Sleep -Milliseconds 800

$CheckInOutbox = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status FROM outbox_events WHERE aggregate_id = '$AppointmentId' AND event_type = 'appointment.status_changed.v1' AND payload->>'newStatus' = 'MENUNGGU';"
Assert-Condition ($CheckInOutbox -like "*published*") "Check-in outbox event published successfully"

# 5. Status Transition: Call Patient via Outbox
Write-Host "`n[STEP 5] Calling Patient & Verifying Outbox Dispatching..." -ForegroundColor Yellow

$CallRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments/$AppointmentId/call" -Method Patch -Headers @{
    Authorization = "Bearer $StaffToken"
}
Assert-Condition ($CallRes.status -eq "SEDANG_DIPERIKSA") "Appointment call returned SEDANG_DIPERIKSA"

Start-Sleep -Milliseconds 800

$CallOutbox = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status FROM outbox_events WHERE aggregate_id = '$AppointmentId' AND event_type = 'appointment.status_changed.v1' AND payload->>'newStatus' = 'SEDANG_DIPERIKSA';"
Assert-Condition ($CallOutbox -like "*published*") "Call patient outbox event published successfully"

# 6. Status Transition: Complete Appointment via Outbox
Write-Host "`n[STEP 6] Completing Appointment & Verifying Final Outbox Event..." -ForegroundColor Yellow

$CompleteRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments/$AppointmentId/complete" -Method Patch -Headers @{
    Authorization = "Bearer $StaffToken"
}
Assert-Condition ($CompleteRes.status -eq "SELESAI") "Appointment complete returned SELESAI"

Start-Sleep -Milliseconds 800

$CompleteOutbox = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status FROM outbox_events WHERE aggregate_id = '$AppointmentId' AND event_type = 'appointment.status_changed.v1' AND payload->>'newStatus' = 'SELESAI';"
Assert-Condition ($CompleteOutbox -like "*published*") "Complete appointment outbox event published successfully"

# 7. Verify Side Effects from Outbox Event Handlers
Write-Host "`n[STEP 7] Verifying Side Effects in appointment_status_events and audit_logs..." -ForegroundColor Yellow

$DbStatusEvents = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT new_status FROM appointment_status_events WHERE appointment_id = '$AppointmentId' ORDER BY created_at ASC;"
$StatusLines = ($DbStatusEvents -split "`n") | Where-Object { $_.Trim() -ne "" }
Assert-Condition ($StatusLines.Count -ge 4) "appointment_status_events recorded at least 4 transitions via outbox"

$AuditLogs = Invoke-RestMethod -Uri "$ApiPrefix/audit-logs?entityTable=appointments&entityId=$AppointmentId" -Method Get -Headers @{
    Authorization = "Bearer $AdminToken"
}
Assert-Condition ($AuditLogs.data.Count -ge 4) "audit_logs recorded at least 4 actions via outbox dispatch"

# 8. Test Manual Process Trigger (POST /api/v1/outbox/process)
Write-Host "`n[STEP 8] Testing Manual Outbox Sweep Endpoint..." -ForegroundColor Yellow

# Insert a synthetic pending event
$SyntheticId = [guid]::NewGuid().ToString()
docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -c "INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status) VALUES ('$SyntheticId', 'appointment', '$AppointmentId', 'appointment.status_changed.v1', jsonb_build_object('appointmentId', '$AppointmentId', 'previousStatus', 'SELESAI', 'newStatus', 'SELESAI', 'reason', 'Sweep test'), 'pending');" | Out-Null

$ProcessRes = Invoke-RestMethod -Uri "$ApiPrefix/outbox/process" -Method Post
Assert-Condition ($ProcessRes.processedCount -ge 1) "POST /api/v1/outbox/process claimed and processed pending event(s)"

$SyntheticStatus = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status FROM outbox_events WHERE id = '$SyntheticId';"
Assert-Condition ($SyntheticStatus -like "*published*") "Synthetic event transitioned to 'published'"

# 9. Test Dead-Letter Replay Procedure (OPS-154)
Write-Host "`n[STEP 9] Verifying Dead-Letter Replay Procedure (OPS-154)..." -ForegroundColor Yellow

# Insert a dead letter event
$DeadLetterId = [guid]::NewGuid().ToString()
docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -c "INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload, status, retry_count, max_retries, error_message) VALUES ('$DeadLetterId', 'test', 'item-99', 'test.fatal.v1', '{}', 'dead_letter', 5, 5, 'Simulated fatal error');" | Out-Null

$ReprocessRes = Invoke-RestMethod -Uri "$ApiPrefix/outbox/reprocess-dead-letters" -Method Post
Assert-Condition ($ReprocessRes.reprocessedCount -ge 1) "POST /api/v1/outbox/reprocess-dead-letters re-queued dead letters"

$RequeuedStatus = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT status, retry_count FROM outbox_events WHERE id = '$DeadLetterId';"
Assert-Condition ($RequeuedStatus -like "pending|0") "Dead letter event reset to status 'pending' with retry_count 0"

# Clean up synthetic test rows
docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM outbox_events WHERE id IN ('$SyntheticId', '$DeadLetterId');" | Out-Null

# Final Summary
Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "FASE 8 TRANSACTIONAL OUTBOX VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "Total Passed: $PassCount" -ForegroundColor Green
Write-Host "Total Failed: $FailCount" -ForegroundColor $(if ($FailCount -eq 0) { "Green" } else { "Red" })
Write-Host "==================================================" -ForegroundColor Cyan

if ($FailCount -gt 0) {
    exit 1
}
