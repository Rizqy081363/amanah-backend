# ==============================================================================
# E2E Test: Patient Intake Parity & Emergency Contact / Email Lifecycle
# Verifies:
#   1. Canonical Intake JSONB Schema has 13 steps including step_email & step_emergency_contact
#   2. Patient Affiliation Creation with Email and Emergency Contact
#   3. Direct PostgreSQL persistence in patient_profiles and patient_emergency_contacts
#   4. Patient Affiliation Creation with optional fields omitted (100% optional check)
#   5. Admin Patient Update API (email update)
#   6. Clean teardown of test fixtures
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING: Patient Intake Parity & Emergency Contact E2E Test" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Wait-E2EApiReady
Reset-TestCounters

$apiUrl = Get-E2EApiBaseUrl

function Get-UserAuthByEmail([string]$email) {
    Push-Location "$PSScriptRoot\..\.."
    $rawOutput = bun run db:jwt --email $email --raw
    Pop-Location
    $token = ($rawOutput | Where-Object { $_ -match "^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+" } | Select-Object -First 1).Trim()
    if (-not $token) {
        throw "Failed to generate JWT for user $email"
    }
    return @{
        token = $token
        headers = @{
            Authorization = "Bearer $token"
            "Content-Type" = "application/json"
        }
    }
}

$patientAuth = Get-UserAuthByEmail "lexguarddidier@gmail.com"
$adminAuth = Get-UserAuthByEmail "admin@amanah.com"

# Generate 16-digit unique NIKs for this test run
$timeStr = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString().PadRight(10, '0').Substring(0, 10)
$testNik1 = "320101$timeStr"
$testNik2 = "320102$timeStr"
$testEmail1 = "e2e.patient.$timeStr@example.com"
$updatedEmail2 = "e2e.updated.$timeStr@example.com"

try {
    # --------------------------------------------------------------------------
    # 1. Canonical Intake Schema Verification (Database SSOT)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 1: Checking Canonical Intake Schema in Database ---" -ForegroundColor Yellow
    $schemaStepCount = Run-DockerSql "SELECT jsonb_array_length(schema->'steps') FROM clinical_intake_forms WHERE code = 'standard-registration';"
    Assert-Test "Standard registration schema has exactly 13 steps" ($schemaStepCount.Trim() -eq "13") "Expected 13 steps, got: $schemaStepCount"

    $hasStepEmail = Run-DockerSql "SELECT EXISTS(SELECT 1 FROM clinical_intake_forms, jsonb_array_elements(schema->'steps') step WHERE code = 'standard-registration' AND step->>'id' = 'step_email');"
    Assert-Test "Schema contains step_email" ($hasStepEmail.Trim() -eq "t") "step_email not found in schema"

    $hasStepEmergency = Run-DockerSql "SELECT EXISTS(SELECT 1 FROM clinical_intake_forms, jsonb_array_elements(schema->'steps') step WHERE code = 'standard-registration' AND step->>'id' = 'step_emergency_contact');"
    Assert-Test "Schema contains step_emergency_contact" ($hasStepEmergency.Trim() -eq "t") "step_emergency_contact not found in schema"

    # --------------------------------------------------------------------------
    # 2. Patient Affiliation Creation with Full Contact & Emergency Contact
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 2: Create Affiliation with Email and Emergency Contact ---" -ForegroundColor Yellow
    $payload1 = @{
        name = "E2E Pasien Kontak Lengkap"
        nik = $testNik1
        birthDate = "1992-06-15"
        birthPlace = "Jakarta"
        gender = "male"
        phone = "081234567890"
        email = $testEmail1
        relationshipType = "kerabat"
        relationLabel = "Kerabat Dekat"
        bloodType = "O"
        line1 = "Jl. Merdeka No. 42"
        occupation = "Software Engineer"
        emergencyContactName = "Ibu Siti Darurat"
        emergencyContactPhone = "089876543210"
        emergencyContactRelationship = "Orang Tua"
    } | ConvertTo-Json

    $res1 = Invoke-RestMethod -Uri "$apiUrl/patients/affiliations" -Method Post -Body $payload1 -Headers $patientAuth.headers
    $data1 = Get-ResponseData $res1
    $patientId1 = $data1.patientId
    if (-not $patientId1) { $patientId1 = $data1.patient.id }

    Assert-Test "Affiliation created successfully" (-not [string]::IsNullOrWhiteSpace($patientId1)) "Patient ID was empty"

    # --------------------------------------------------------------------------
    # 3. Direct DB Persistence Verification (PostgreSQL SSOT)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 3: Verifying Database Records in PostgreSQL ---" -ForegroundColor Yellow
    $dbEmail = Run-DockerSql "SELECT email FROM patient_profiles WHERE id = '$patientId1';"
    Assert-Test "Database patient_profiles.email matches" ($dbEmail.Trim() -eq $testEmail1) "Expected $testEmail1 in DB, got $dbEmail"

    $dbEmergency = Run-DockerSql "SELECT name || '|' || phone || '|' || relationship FROM patient_emergency_contacts WHERE patient_id = '$patientId1' LIMIT 1;"
    Assert-Test "Database patient_emergency_contacts row matches" ($dbEmergency.Trim() -eq "Ibu Siti Darurat|089876543210|Orang Tua") "Expected Ibu Siti Darurat|089876543210|Orang Tua, got $dbEmergency"

    # --------------------------------------------------------------------------
    # 4. Optionality Verification (Omission of Email & Emergency Contact)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 4: Create Affiliation with Optional Fields Omitted ---" -ForegroundColor Yellow
    $payload2 = @{
        name = "E2E Pasien Tanpa Kontak Tambahan"
        nik = $testNik2
        birthDate = "1995-08-20"
        birthPlace = "Bandung"
        gender = "female"
        phone = "08111222333"
        relationshipType = "anak"
        relationLabel = "Anak Kedua"
        motherName = "Ibu Kandung"
        bloodType = "B"
        line1 = "Jl. Asia Afrika No. 1"
        occupation = "Pelajar"
    } | ConvertTo-Json

    $res2 = Invoke-RestMethod -Uri "$apiUrl/patients/affiliations" -Method Post -Body $payload2 -Headers $patientAuth.headers
    $data2 = Get-ResponseData $res2
    $patientId2 = $data2.patientId
    if (-not $patientId2) { $patientId2 = $data2.patient.id }

    Assert-Test "Optional affiliation created without error" (-not [string]::IsNullOrWhiteSpace($patientId2)) "Patient ID was empty"

    $dbEmail2 = Run-DockerSql "SELECT COALESCE(email, 'NULL') FROM patient_profiles WHERE id = '$patientId2';"
    Assert-Test "Email is NULL in DB when omitted" ($dbEmail2.Trim() -eq "NULL") "Expected NULL in DB, got $dbEmail2"

    $dbEmergencyCount = Run-DockerSql "SELECT count(*) FROM patient_emergency_contacts WHERE patient_id = '$patientId2';"
    Assert-Test "No emergency contact record created in DB" ($dbEmergencyCount.Trim() -eq "0") "Expected 0 records, got $dbEmergencyCount"

    # --------------------------------------------------------------------------
    # 5. Admin Patient Update Parity (Update Email)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 5: Admin Updates Patient Email via PATCH /patients/:id ---" -ForegroundColor Yellow
    $patchPayload = @{
        email = $updatedEmail2
    } | ConvertTo-Json

    $resPatch = Invoke-RestMethod -Uri "$apiUrl/patients/$patientId2" -Method Patch -Body $patchPayload -Headers $adminAuth.headers
    $dataPatch = Get-ResponseData $resPatch
    Assert-Test "Admin PATCH /patients/:id returns updated email" ($dataPatch.email -eq $updatedEmail2) "Expected $updatedEmail2, got $($dataPatch.email)"

    $dbUpdatedEmail = Run-DockerSql "SELECT email FROM patient_profiles WHERE id = '$patientId2';"
    Assert-Test "Database patient_profiles.email updated correctly" ($dbUpdatedEmail.Trim() -eq $updatedEmail2) "Expected $updatedEmail2 in DB, got $dbUpdatedEmail"

    # --------------------------------------------------------------------------
    # 6. Patient Affiliations Directory Listing Enrichment Verification
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 6: Patient Affiliation List Query Check ---" -ForegroundColor Yellow
    $listRes = Invoke-RestMethod -Uri "$apiUrl/patients/affiliations/me" -Method Get -Headers $patientAuth.headers
    $listData = Get-ResponseData $listRes

    $found1 = $listData | Where-Object { $_.patientId -eq $patientId1 }
    Assert-Test "Enriched list item contains emergencyContactName" ($found1.patient.emergencyContactName -eq "Ibu Siti Darurat") "Expected Ibu Siti Darurat, got $($found1.patient.emergencyContactName)"
    Assert-Test "Enriched list item contains emergencyContactPhone" ($found1.patient.emergencyContactPhone -eq "089876543210") "Expected 089876543210, got $($found1.patient.emergencyContactPhone)"
    Assert-Test "Enriched list item contains email" ($found1.patient.email -eq $testEmail1) "Expected $testEmail1, got $($found1.patient.email)"

} finally {
    # --------------------------------------------------------------------------
    # 7. Teardown / Cleanup
    # --------------------------------------------------------------------------
    Write-Host "`n--- Teardown: Cleaning Up Test Records ---" -ForegroundColor Yellow
    if ($patientId1) {
        $clean1 = Run-DockerSql "DELETE FROM patient_emergency_contacts WHERE patient_id = '$patientId1'; DELETE FROM patient_affiliations WHERE patient_id = '$patientId1'; DELETE FROM patient_addresses WHERE patient_id = '$patientId1'; DELETE FROM patient_profiles WHERE id = '$patientId1';"
        Write-Host "Cleaned fixture 1: $patientId1" -ForegroundColor Gray
    }
    if ($patientId2) {
        $clean2 = Run-DockerSql "DELETE FROM patient_emergency_contacts WHERE patient_id = '$patientId2'; DELETE FROM patient_affiliations WHERE patient_id = '$patientId2'; DELETE FROM patient_addresses WHERE patient_id = '$patientId2'; DELETE FROM patient_profiles WHERE id = '$patientId2';"
        Write-Host "Cleaned fixture 2: $patientId2" -ForegroundColor Gray
    }
}

Print-TestSummary "Patient Intake Parity & Emergency Contact E2E"
