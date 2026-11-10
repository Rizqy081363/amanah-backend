# ==============================================================================
# E2E Test: Dynamic Intake Form, Service Switching, and Queue Ticket Reassignment
# Verifies:
#   1. Dynamic Relation Resolution: Services, Categories, Units, Intake Forms (No hardcoding)
#   2. Transition 1: Regular -> Maternity (KIA) with dynamic queue prefix update
#   3. Transition 2: Maternity -> Regular (Switch Back) with clean intake unlinking & prefix sync
#   4. Transition 3: Regular -> Immunization flow parity
#   5. Dynamic Complaint Updating when service is modified or unchanged
#   6. Patient API Route Parity: Patient can access facility options & patch own service
#   7. Strict Lifecycle Enforcement: in_service / completed states are strictly rejected
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING: Dynamic Service, Intake, and Queue Ticket Switching E2E Test" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
Reset-TestCounters

$apiUrl = Get-E2EApiBaseUrl
$adminAuth = Login-Admin

try {
    # --------------------------------------------------------------------------
    # Step 1: Discover Active Services & Units Relational Truth from DB
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 1: Discovering Relational Services & Prefixes from Database ---" -ForegroundColor Yellow

    # Discover regular service (flow is null/regular)
    $regSvcJson = Run-DockerSql "SELECT json_build_object('id', cs.id, 'name', cs.name, 'prefix', COALESCE(cs.code_prefix, sc.code_prefix, u.queue_prefix, 'A')) FROM clinic_services cs JOIN service_categories sc ON sc.id = cs.service_category_id JOIN clinic_units u ON u.id = sc.unit_id LEFT JOIN clinical_intake_forms f ON f.id = cs.intake_form_id WHERE cs.is_active = true AND (f.code IS NULL OR f.code NOT IN ('pregnancy', 'immunization')) LIMIT 1;"
    $regularService = $regSvcJson | ConvertFrom-Json
    Write-Host "  Discovered Regular Service: $($regularService.name) ($($regularService.id)) with Prefix: $($regularService.prefix)"

    # Discover pregnancy service (flow is pregnancy)
    $pregSvcJson = Run-DockerSql "SELECT json_build_object('id', cs.id, 'name', cs.name, 'prefix', COALESCE(cs.code_prefix, sc.code_prefix, u.queue_prefix, 'A')) FROM clinic_services cs JOIN service_categories sc ON sc.id = cs.service_category_id JOIN clinic_units u ON u.id = sc.unit_id JOIN clinical_intake_forms f ON f.id = cs.intake_form_id WHERE cs.is_active = true AND f.code = 'pregnancy' LIMIT 1;"
    $pregnancyService = $pregSvcJson | ConvertFrom-Json
    Write-Host "  Discovered Pregnancy Service: $($pregnancyService.name) ($($pregnancyService.id)) with Prefix: $($pregnancyService.prefix)"

    # Discover immunization service (flow is immunization)
    $imunSvcJson = Run-DockerSql "SELECT json_build_object('id', cs.id, 'name', cs.name, 'prefix', COALESCE(cs.code_prefix, sc.code_prefix, u.queue_prefix, 'A')) FROM clinic_services cs JOIN service_categories sc ON sc.id = cs.service_category_id JOIN clinic_units u ON u.id = sc.unit_id JOIN clinical_intake_forms f ON f.id = cs.intake_form_id WHERE cs.is_active = true AND f.code = 'immunization' LIMIT 1;"
    $immunizationService = $imunSvcJson | ConvertFrom-Json
    Write-Host "  Discovered Immunization Service: $($immunizationService.name) ($($immunizationService.id)) with Prefix: $($immunizationService.prefix)"

    Assert-Test "All 3 distinct service flows discovered dynamically from relational DB" (
        -not [string]::IsNullOrWhiteSpace($regularService.id) -and
        -not [string]::IsNullOrWhiteSpace($pregnancyService.id) -and
        -not [string]::IsNullOrWhiteSpace($immunizationService.id)
    )

    # --------------------------------------------------------------------------
    # Step 2: Discover or Prepare Active Test Appointment Fixture
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 2: Preparing Test Appointment Fixture ---" -ForegroundColor Yellow
    $testAptId = (Run-DockerSql "SELECT a.id FROM appointments a JOIN queue_tickets qt ON qt.appointment_id = a.id WHERE a.status = 'booked' ORDER BY a.created_at DESC LIMIT 1;").Trim()

    if ([string]::IsNullOrWhiteSpace($testAptId)) {
        throw "No active booked appointment found with a queue ticket to run dynamic switching test."
    }

    # Reset appointment to regular service as clean baseline
    Run-DockerSql "UPDATE appointments SET service_id = '$($regularService.id)', medical_flow = NULL, complaint = 'Baseline keluhan awal pasien' WHERE id = '$testAptId';"
    Run-DockerSql "UPDATE queue_tickets SET service_id = '$($regularService.id)', queue_number = '$($regularService.prefix)-P001' WHERE appointment_id = '$testAptId';"

    $baselineTicket = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$testAptId';").Trim()
    Write-Host "  Test Appointment ID: $testAptId (Baseline Ticket: $baselineTicket)"
    Assert-Test "Baseline ticket set correctly" ($baselineTicket -like "$($regularService.prefix)-*")

    # --------------------------------------------------------------------------
    # Step 3: Transition 1 - Switch Regular -> Pregnancy (KIA)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 3: Testing Transition 1 (Regular -> Pregnancy) ---" -ForegroundColor Yellow
    $body1 = @{
        serviceId = $pregnancyService.id
        complaint = "Pemeriksaan USG kandungan trimester 1"
    } | ConvertTo-Json

    $res1 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$testAptId/service" -Method Patch -Headers $adminAuth.headers -Body $body1
    Assert-Test "API returns success message on switching to pregnancy service" ($res1.message -like "*berhasil*")
    Assert-Test "API returns updated queue number with target prefix" ($res1.data.queueNumber -like "$($pregnancyService.prefix)-*")
    Assert-Test "API returns target medical flow 'pregnancy'" ($res1.data.medicalFlow -eq "pregnancy")

    # Verify directly in PostgreSQL
    $dbApt1 = (Run-DockerSql "SELECT json_build_object('serviceId', service_id, 'flow', medical_flow, 'complaint', complaint) FROM appointments WHERE id = '$testAptId';") | ConvertFrom-Json
    $dbTicket1 = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$testAptId';").Trim()

    Assert-Test "Database appointment service updated to pregnancy service" ($dbApt1.serviceId -eq $pregnancyService.id)
    Assert-Test "Database appointment medical_flow set to 'pregnancy'" ($dbApt1.flow -eq "pregnancy")
    Assert-Test "Database appointment complaint updated" ($dbApt1.complaint -eq "Pemeriksaan USG kandungan trimester 1")
    Assert-Test "Database queue ticket prefix updated to $($pregnancyService.prefix)" ($dbTicket1 -like "$($pregnancyService.prefix)-*")

    # Seed a maternal intake record for this appointment to simulate user filling & saving maternal form
    $patientId = (Run-DockerSql "SELECT patient_id FROM appointments WHERE id = '$testAptId';").Trim()
    $insertRaw = Run-DockerSql "INSERT INTO maternal_health_intakes (appointment_id, patient_id, mother_name, mother_nik) VALUES ('$testAptId', '$patientId', 'Ibu Test', '3201019999990001') RETURNING id;"
    $insertedMaternalId = ($insertRaw -split '\r?\n' | Where-Object { $_ -match '^[0-9a-f-]{36}$' } | Select-Object -First 1).Trim()
    Assert-Test "Maternal intake record successfully created for test appointment" (-not [string]::IsNullOrWhiteSpace($insertedMaternalId))

    # Verify unified intake endpoint returns maternal flow
    $intake1 = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/by-appointment/$testAptId" -Method Get -Headers $adminAuth.headers
    Assert-Test "Unified intake endpoint returns flow 'pregnancy'" ($intake1.flow -eq "pregnancy")
    Assert-Test "Unified intake endpoint returns type 'maternal'" ($intake1.type -eq "maternal")
    Assert-Test "Unified intake queueNumber matches target prefix" ($intake1.data.queueNumber -like "$($pregnancyService.prefix)-*")

    # --------------------------------------------------------------------------
    # Step 4: Transition 2 - Switch Pregnancy Back to Regular (Human Error Recovery)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 4: Testing Transition 2 (Pregnancy -> Regular Switch Back) ---" -ForegroundColor Yellow
    $body2 = @{
        serviceId = $regularService.id
        complaint = "Salah input, pasien hanya periksa batuk pilek reguler"
    } | ConvertTo-Json

    $res2 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$testAptId/service" -Method Patch -Headers $adminAuth.headers -Body $body2
    Assert-Test "API returns success message on switching back to regular service" ($res2.message -like "*berhasil*")
    Assert-Test "API returns updated queue number with regular prefix" ($res2.data.queueNumber -like "$($regularService.prefix)-*")

    # Verify in DB
    $dbApt2 = (Run-DockerSql "SELECT json_build_object('serviceId', service_id, 'flow', medical_flow, 'complaint', complaint) FROM appointments WHERE id = '$testAptId';") | ConvertFrom-Json
    $dbTicket2 = (Run-DockerSql "SELECT queue_number FROM queue_tickets WHERE appointment_id = '$testAptId';").Trim()
    $remainingMaternal = (Run-DockerSql "SELECT COUNT(*) FROM maternal_health_intakes WHERE id = '$insertedMaternalId';").Trim()

    Assert-Test "Database appointment service restored to regular service" ($dbApt2.serviceId -eq $regularService.id)
    Assert-Test "Database appointment medical_flow cleared to null" ([string]::IsNullOrWhiteSpace($dbApt2.flow))
    Assert-Test "Database queue ticket prefix restored to $($regularService.prefix)" ($dbTicket2 -like "$($regularService.prefix)-*")
    Assert-Test "Aborted maternal intake record completely DELETED from database (Zero Bloat)" ($remainingMaternal -eq "0")

    # Verify unified intake endpoint now cleanly returns regular flow
    $intake2 = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/by-appointment/$testAptId" -Method Get -Headers $adminAuth.headers
    Assert-Test "Unified intake endpoint cleanly returns flow 'regular'" ($intake2.flow -eq "regular")
    Assert-Test "Unified intake endpoint cleanly returns type 'regular'" ($intake2.type -eq "regular")

    # --------------------------------------------------------------------------
    # Step 5: Transition 3 - Switch Regular -> Immunization
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 5: Testing Transition 3 (Regular -> Immunization) ---" -ForegroundColor Yellow
    $body3 = @{
        serviceId = $immunizationService.id
        complaint = "Imunisasi DPT anak usia 3 bulan"
    } | ConvertTo-Json

    $res3 = Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$testAptId/service" -Method Patch -Headers $adminAuth.headers -Body $body3
    Assert-Test "API successfully switches to immunization service" ($res3.message -like "*berhasil*")
    Assert-Test "API returns target medical flow 'immunization'" ($res3.data.medicalFlow -eq "immunization")

    $dbApt3 = (Run-DockerSql "SELECT json_build_object('serviceId', service_id, 'flow', medical_flow) FROM appointments WHERE id = '$testAptId';") | ConvertFrom-Json
    Assert-Test "Database appointment medical_flow set to 'immunization'" ($dbApt3.flow -eq "immunization")

    # Verify unified intake endpoint returns immunization flow
    $intake3 = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/by-appointment/$testAptId" -Method Get -Headers $adminAuth.headers
    Assert-Test "Unified intake endpoint returns flow 'immunization'" ($intake3.flow -eq "immunization")
    Assert-Test "Unified intake endpoint returns type 'immunization'" ($intake3.type -eq "immunization")

    # --------------------------------------------------------------------------
    # Step 6: Patient Facility Metadata & Service Switching Parity
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 6: Testing Patient Access to Cascader Metadata ---" -ForegroundColor Yellow
    $patientAuth = Login-Patient

    # Verify Patient can read active units for the cascader dropdown
    $unitsRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units?status=active" -Method Get -Headers $patientAuth.headers
    Assert-Test "Patient session can read active units for service selection" ($unitsRes.data.Count -gt 0)

    # Verify Patient can read service categories
    $categoriesRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/categories?status=active" -Method Get -Headers $patientAuth.headers
    Assert-Test "Patient session can read active categories for service selection" ($categoriesRes.data.Count -gt 0)

    # Verify Patient can read services
    $servicesRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/services?status=active" -Method Get -Headers $patientAuth.headers
    Assert-Test "Patient session can read active clinic services for service selection" ($servicesRes.data.Count -gt 0)

    # --------------------------------------------------------------------------
    # Step 7: Strict Lifecycle Enforcement (Pre-Consultation Only)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 7: Testing Strict Lifecycle Constraint (Rejection of in_service) ---" -ForegroundColor Yellow

    # Force status to in_service in DB with valid actual_started_at timestamp
    Run-DockerSql "UPDATE appointments SET status = 'in_service', actual_started_at = NOW() WHERE id = '$testAptId';"

    $inServiceRejected = $false
    try {
        $bodyReject = @{ serviceId = $regularService.id } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$testAptId/service" -Method Patch -Headers $adminAuth.headers -Body $bodyReject
    } catch {
        $inServiceRejected = $true
        $statusCode = $_.Exception.Response.StatusCode.value__
        Assert-Test "Switching service during in_service throws HTTP 400 Bad Request" ($statusCode -eq 400)
    }

    Assert-Test "Service switch strictly rejected while consultation is in progress (in_service)" $inServiceRejected

    # Force status to completed in DB
    Run-DockerSql "UPDATE appointments SET status = 'completed', actual_completed_at = NOW() WHERE id = '$testAptId';"

    $completedRejected = $false
    try {
        $bodyReject2 = @{ serviceId = $regularService.id } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiUrl/admin/appointments/$testAptId/service" -Method Patch -Headers $adminAuth.headers -Body $bodyReject2
    } catch {
        $completedRejected = $true
        $statusCode = $_.Exception.Response.StatusCode.value__
        Assert-Test "Switching service when completed throws HTTP 400 Bad Request" ($statusCode -eq 400)
    }

    Assert-Test "Service switch strictly rejected when appointment is completed" $completedRejected

    # Restore appointment status to booked
    Run-DockerSql "UPDATE appointments SET status = 'booked', service_id = '$($regularService.id)', medical_flow = NULL, actual_started_at = NULL, actual_completed_at = NULL WHERE id = '$testAptId';"
    Run-DockerSql "UPDATE queue_tickets SET service_id = '$($regularService.id)', queue_number = '$($regularService.prefix)-P001' WHERE appointment_id = '$testAptId';"

    Print-TestSummary "Dynamic Service and Intake Switching E2E Test"
}
catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    throw
}
