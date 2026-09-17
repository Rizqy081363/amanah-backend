#!/usr/bin/env pwsh
# ==============================================================================
# Amanah Healthcare - Phase 4: Event-Driven Auditing & Status History Verification
# Canonical Rules: ARC-041, ARC-093, ARC-119..122, ARC-136, database-design.md
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

Write-Host "`n=== [PHASE 4] EVENT-DRIVEN AUDITING & STATUS HISTORY VERIFICATION ===" -ForegroundColor Cyan

# 1. Login Accounts
Write-Host "`n[STEP 1] Authenticating Actors (Admin, Staff, Patient)..." -ForegroundColor Yellow

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
Assert-Condition ($StaffToken -ne $null) "Doctor/Staff successfully authenticated"

$PatientLoginRes = Invoke-RestMethod -Uri "$ApiPrefix/auth/email/login" -Method Post -Body (@{
    email = "pasien@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$PatientToken = $PatientLoginRes.token
Assert-Condition ($PatientToken -ne $null) "Patient successfully authenticated"

# 2. RBAC Enforcement on Audit Log Endpoint (ARC-130)
Write-Host "`n[STEP 2] Verifying RBAC Security Boundaries on /api/v1/audit-logs..." -ForegroundColor Yellow

try {
    Invoke-RestMethod -Uri "$ApiPrefix/audit-logs" -Method Get -Headers @{ Authorization = "Bearer $PatientToken" }
    Assert-Condition $false "Patient should be forbidden from accessing /audit-logs"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Condition ($statusCode -eq 403) "Patient received HTTP 403 Forbidden on /audit-logs"
}

try {
    Invoke-RestMethod -Uri "$ApiPrefix/audit-logs" -Method Get
    Assert-Condition $false "Unauthenticated user should be unauthorized"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Condition ($statusCode -eq 401) "Unauthenticated request received HTTP 401 Unauthorized"
}

# 3. Create Appointment & Verify Event-Driven Audit Record (ARC-119..122, ARC-136)
Write-Host "`n[STEP 3] Patient Creating Appointment & Verifying Async Audit Logging..." -ForegroundColor Yellow

# Get a valid poliklinik and clinic service
$Clinics = Invoke-RestMethod -Uri "$ApiPrefix/clinics" -Method Get
$PoliId = $Clinics[0].id
$Services = Invoke-RestMethod -Uri "$ApiPrefix/clinics/$PoliId/layanan" -Method Get
$ServiceId = $Services[0].id
$RandomOffset = Get-Random -Minimum 50 -Maximum 5000
$TargetDate = (Get-Date).AddDays($RandomOffset).ToString("yyyy-MM-dd")

$CreateBody = @{
    poliklinikId = $PoliId
    layananId = $ServiceId
    appointmentDate = $TargetDate
    session = "PAGI"
    visitType = "Pemeriksaan Baru"
    complaint = "E2E Test Asynchronous Event Auditing"
} | ConvertTo-Json

$AppointmentRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments" -Method Post -Headers @{
    Authorization = "Bearer $PatientToken"
} -Body $CreateBody -ContentType "application/json"

$AppointmentId = $AppointmentRes.id
Assert-Condition ($AppointmentId -ne $null) "Appointment created successfully with ID: $AppointmentId"

# Allow asynchronous event handler to complete in background task
Start-Sleep -Milliseconds 600

$AuditLogsRes = Invoke-RestMethod -Uri "$ApiPrefix/audit-logs?entityTable=appointments&entityId=$AppointmentId" -Method Get -Headers @{
    Authorization = "Bearer $AdminToken"
}

Assert-Condition ($AuditLogsRes.data.Count -ge 1) "Audit log found for appointment $AppointmentId"
$CreateLog = $AuditLogsRes.data | Where-Object { $_.action -eq "create_appointment" }
Assert-Condition ($CreateLog -ne $null) "Audit action 'create_appointment' recorded"
Assert-Condition ($CreateLog.entityTable -eq "appointments") "Entity table matches 'appointments'"
Assert-Condition ($CreateLog.newValues.session -eq "PAGI") "New values contain session 'PAGI'"

# 4. Status Transition: Check-in & Verify Audit Log
Write-Host "`n[STEP 4] Check-in Appointment & Verifying Status Transition Event..." -ForegroundColor Yellow

$CheckInRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments/$AppointmentId/check-in" -Method Patch -Headers @{
    Authorization = "Bearer $PatientToken"
}
Assert-Condition ($CheckInRes.status -eq "MENUNGGU") "Appointment status transitioned to MENUNGGU"

Start-Sleep -Milliseconds 600

$AuditLogsRes2 = Invoke-RestMethod -Uri "$ApiPrefix/audit-logs?entityTable=appointments&entityId=$AppointmentId" -Method Get -Headers @{
    Authorization = "Bearer $AdminToken"
}
$CheckInLog = $AuditLogsRes2.data | Where-Object { $_.action -eq "update_appointment_status" -and $_.newValues.status -eq "MENUNGGU" }
Assert-Condition ($CheckInLog -ne $null) "Audit action recorded status change to MENUNGGU"
Assert-Condition ($CheckInLog.oldValues.status -eq "SUDAH_BUAT_JANJI") "Audit log captures previous status 'SUDAH_BUAT_JANJI'"

# 5. Status Transition: Call Patient
Write-Host "`n[STEP 5] Doctor Calling Patient & Verifying Audit Log..." -ForegroundColor Yellow

$CallRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments/$AppointmentId/call" -Method Patch -Headers @{
    Authorization = "Bearer $StaffToken"
}
Assert-Condition ($CallRes.status -eq "SEDANG_DIPERIKSA") "Appointment status transitioned to SEDANG_DIPERIKSA"

Start-Sleep -Milliseconds 600

$AuditLogsRes3 = Invoke-RestMethod -Uri "$ApiPrefix/audit-logs?entityTable=appointments&entityId=$AppointmentId" -Method Get -Headers @{
    Authorization = "Bearer $AdminToken"
}
$CallLog = $AuditLogsRes3.data | Where-Object { $_.action -eq "update_appointment_status" -and $_.newValues.status -eq "SEDANG_DIPERIKSA" }
Assert-Condition ($CallLog -ne $null) "Audit action recorded status change to SEDANG_DIPERIKSA"

# 6. Status Transition: Complete Exam
Write-Host "`n[STEP 6] Completing Examination & Verifying Final Status Event..." -ForegroundColor Yellow

$CompleteRes = Invoke-RestMethod -Uri "$ApiPrefix/appointments/$AppointmentId/complete" -Method Patch -Headers @{
    Authorization = "Bearer $StaffToken"
}
Assert-Condition ($CompleteRes.status -eq "SELESAI") "Appointment status transitioned to SELESAI"

Start-Sleep -Milliseconds 600

$AuditLogsRes4 = Invoke-RestMethod -Uri "$ApiPrefix/audit-logs?entityTable=appointments&entityId=$AppointmentId" -Method Get -Headers @{
    Authorization = "Bearer $AdminToken"
}
$CompleteLog = $AuditLogsRes4.data | Where-Object { $_.action -eq "update_appointment_status" -and $_.newValues.status -eq "SELESAI" }
Assert-Condition ($CompleteLog -ne $null) "Audit action recorded status change to SELESAI"

# 7. Verify Audit Log Detail Retrieval Endpoint
Write-Host "`n[STEP 7] Verifying Single Audit Log Retrieval by ID..." -ForegroundColor Yellow

$LogId = $CreateLog.id
$SingleLogRes = Invoke-RestMethod -Uri "$ApiPrefix/audit-logs/$LogId" -Method Get -Headers @{
    Authorization = "Bearer $AdminToken"
}
Assert-Condition ($SingleLogRes.id -eq $LogId) "Single audit log detail matches requested ID"
Assert-Condition ($SingleLogRes.action -eq "create_appointment") "Single audit log detail contains correct action"

# 8. Direct PostgreSQL Query: appointment_status_events Verification (database-design.md:212)
Write-Host "`n[STEP 8] Verifying appointment_status_events Records in PostgreSQL..." -ForegroundColor Yellow

$DbStatusEvents = docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT previous_status, new_status FROM appointment_status_events WHERE appointment_id = '$AppointmentId' ORDER BY created_at ASC;"

$EventLines = ($DbStatusEvents -split "`n") | Where-Object { $_.Trim() -ne "" }
Assert-Condition ($EventLines.Count -ge 4) "PostgreSQL recorded at least 4 status history events for appointment"
Assert-Condition ($EventLines[0] -like "*|booked") "Initial event: new_status is booked"
Assert-Condition ($EventLines[1] -like "*|waiting") "Second event: new_status is waiting"
Assert-Condition ($EventLines[2] -like "*|in_service") "Third event: new_status is in_service"
Assert-Condition ($EventLines[3] -like "*|completed") "Fourth event: new_status is completed"

# Final Summary
Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "PHASE 4 AUDIT & STATUS EVENT VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "Total Passed: $PassCount" -ForegroundColor Green
Write-Host "Total Failed: $FailCount" -ForegroundColor $(if ($FailCount -eq 0) { "Green" } else { "Red" })
Write-Host "==================================================" -ForegroundColor Cyan

if ($FailCount -gt 0) {
    exit 1
}
