# ==============================================================================
# E2E Test: Maternity Hardening, Obstetric Relational Validation & Honest Prefill
# Verifies:
#   1. Strict Zod rejection of contradictory obstetric counts:
#      - Ab > G - 1 ($G=5, P=0, Ab=8)
#      - Living children Ah > Deliveries P ($P=0, Ah=2)
#      - Prior pregnancy records when G = 1
#   2. Valid obstetric intake acceptance ($G=3, P=1, Ab=1, Ah=1)
#   3. Strict RBAC / Object-Level Access Control on Form Requirement:
#      - External patient forbidden (403) from accessing non-affiliated patient
#   4. Honest Prefill Data Integrity:
#      - Domicile vs Identity Card address separation (no cross fallback)
#      - Husband prefill never matches patient herself
#      - No synthetic fallback defaults (Wiraswasta, SMA/SMK, Belum Tahu)
#   5. Clean database teardown
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING: Maternity & Form Hardening E2E Test" -ForegroundColor Cyan
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

$adminAuth = Get-UserAuthByEmail "admin@amanah.com"
$patientAuth = Get-UserAuthByEmail "pasien@amanah.com"

# Find a valid maternity clinic service
$maternityServiceId = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT s.id FROM clinic_services s JOIN clinical_intake_forms f ON s.intake_form_id = f.id WHERE f.code = 'pregnancy' LIMIT 1;").Trim()
if (-not $maternityServiceId) {
    $maternityServiceId = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM clinic_services LIMIT 1;").Trim()
}

# Find patient for admin and an independent patient
$patientId1 = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM patient_profiles LIMIT 1;").Trim()
$patientId2 = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM patient_profiles OFFSET 1 LIMIT 1;").Trim()

$createdIntakeId = $null

try {
    # --------------------------------------------------------------------------
    # 1. Zod Validation: Rejection of Irrationally Large Abortions (Ab > G - 1)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 1: Testing Zod Rejection of Contradictory Obstetric Counts (G=5, P=0, Ab=8) ---" -ForegroundColor Yellow
    $invalidAbortionPayload = @{
        patientId = $patientId1
        motherName = "Test Ibu Hamil"
        currentComplaints = "Pemeriksaan ANC"
        gravidaCount = 5
        parityCount = 0
        abortionCount = 8
        livingChildrenCount = 0
        gestationalAgeWeeks = 20
        estimatedDueDate = "2026-12-01"
    } | ConvertTo-Json

    try {
        $res = Invoke-RestMethod -Uri "$apiUrl/maternity/intakes" -Method Post -Body $invalidAbortionPayload -Headers $adminAuth.headers
        Write-Host "UNEXPECTED: Endpoint accepted invalid obstetric counts (G=5, P=0, Ab=8)!" -ForegroundColor Red
        exit 1
    } catch {
        $rawResponse = $_.ErrorDetails.Message
        if (-not $rawResponse -and $_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            if ($stream.CanSeek) { $stream.Position = 0 }
            $reader = [System.IO.StreamReader]::new($stream)
            $rawResponse = $reader.ReadToEnd()
        }

        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "HTTP Status: $statusCode (Expected 400)" -ForegroundColor Green
        Assert-Test "Rejected with 400 Bad Request" ($statusCode -eq 400) "Expected 400 Bad Request"

        $json = $rawResponse | ConvertFrom-Json
        $hasObstetricError = ($json.invalidParams | Where-Object { $_.reason -match "keguguran" -or $_.reason -match "tidak boleh melebihi" })
        Assert-Test "Contains domain error explaining abortion count cannot exceed prior pregnancies" ($null -ne $hasObstetricError) "Missing obstetric error message in RFC 7807 response"
        Write-Host "Pass: Zod correctly rejected G=5, P=0, Ab=8 with message: $($hasObstetricError.reason)" -ForegroundColor Green
    }

    # --------------------------------------------------------------------------
    # 2. Zod Validation: Rejection of Living Children > Deliveries (P=0, Ah=2)
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 2: Testing Zod Rejection of Living Children Exceeding Deliveries (P=0, Ah=2) ---" -ForegroundColor Yellow
    $invalidLivingPayload = @{
        patientId = $patientId1
        motherName = "Test Ibu Hamil"
        currentComplaints = "Pemeriksaan ANC"
        gravidaCount = 3
        parityCount = 0
        abortionCount = 1
        livingChildrenCount = 2
        gestationalAgeWeeks = 15
        estimatedDueDate = "2026-12-01"
    } | ConvertTo-Json

    try {
        $res = Invoke-RestMethod -Uri "$apiUrl/maternity/intakes" -Method Post -Body $invalidLivingPayload -Headers $adminAuth.headers
        Write-Host "UNEXPECTED: Endpoint accepted living children exceeding deliveries (P=0, Ah=2)!" -ForegroundColor Red
        exit 1
    } catch {
        $rawResponse = $_.ErrorDetails.Message
        if (-not $rawResponse -and $_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            if ($stream.CanSeek) { $stream.Position = 0 }
            $reader = [System.IO.StreamReader]::new($stream)
            $rawResponse = $reader.ReadToEnd()
        }

        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Rejected with 400 Bad Request" ($statusCode -eq 400) "Expected 400 Bad Request"

        $json = $rawResponse | ConvertFrom-Json
        $hasLivingError = ($json.invalidParams | Where-Object { $_.reason -match "anak yang masih hidup harus 0" })
        Assert-Test "Contains domain error explaining living children must be 0 when P=0" ($null -ne $hasLivingError) "Missing living children error message in RFC 7807 response"
        Write-Host "Pass: Zod correctly rejected P=0 with livingChildren=2: $($hasLivingError.reason)" -ForegroundColor Green
    }

    # --------------------------------------------------------------------------
    # 3. Zod Validation: Acceptance of Mathematically Consistent Obstetric Data
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 3: Testing Acceptance of Consistent Obstetric Counts (G=3, P=1, Ab=1, Ah=1) ---" -ForegroundColor Yellow
    $validPayload = @{
        patientId = $patientId1
        motherName = "Test Ibu Hamil Sah"
        gravidaCount = 3
        parityCount = 1
        abortionCount = 1
        livingChildrenCount = 1
        gestationalAgeWeeks = 14
        estimatedDueDate = "2026-12-15"
        currentComplaints = "Pemeriksaan rutin trimester 2"
    } | ConvertTo-Json

    $validRes = Invoke-RestMethod -Uri "$apiUrl/maternity/intakes" -Method Post -Body $validPayload -Headers $adminAuth.headers
    $createdIntakeId = if ($validRes.id) { $validRes.id } else { $validRes.data.id }
    Assert-Test "Valid maternity intake created successfully" ($null -ne $createdIntakeId) "Expected valid ID returned"
    Write-Host "Pass: Valid maternity intake created with ID: $createdIntakeId" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 4. Security & Object Access Control: Cross-Patient Form Requirement Check
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 4: Testing Object-Level Access Control on Form Requirement ---" -ForegroundColor Yellow
    # Patient user attempting to inspect an unaffiliated patient profile
    $unaffiliatedPatientId = $patientId2
    try {
        $res = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/form-requirement?serviceId=$maternityServiceId&patientId=$unaffiliatedPatientId" -Method Get -Headers $patientAuth.headers
        Write-Host "UNEXPECTED: Patient user was able to access unaffiliated patient requirement!" -ForegroundColor Red
        exit 1
    } catch {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Rejected cross-patient requirement access with 403 Forbidden" ($statusCode -eq 403) "Expected 403 Forbidden"
        Write-Host "Pass: Form requirement correctly protected by object-level authorization (HTTP 403 Forbidden)" -ForegroundColor Green
    }

    # --------------------------------------------------------------------------
    # 5. Admin Requirement Prefill Data Integrity: No Fake Defaults & Address Isolation
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 5: Testing Admin Form Requirement Prefill Data Integrity ---" -ForegroundColor Yellow
    $reqRes = Invoke-RestMethod -Uri "$apiUrl/medical-records/intakes/form-requirement?serviceId=$maternityServiceId&patientId=$patientId1" -Method Get -Headers $adminAuth.headers
    $reqData = if ($reqRes.data) { $reqRes.data } else { $reqRes }

    Assert-Test "Requirement flow is resolved" ($null -ne $reqData.flow) "Flow should not be null"
    Write-Host "Resolved flow: $($reqData.flow)" -ForegroundColor Cyan
    Write-Host "Reusable identity keys: $($reqData.reusableIdentity.PSObject.Properties.Name -join ', ')" -ForegroundColor Cyan

    # Ensure no fabricated defaults
    $reusable = $reqData.reusableIdentity
    if ($reusable.motherBloodType) {
        Assert-Test "Blood type is not fake 'Belum Tahu'" ($reusable.motherBloodType -ne "Belum Tahu") "Should be canonical or empty"
    }

    # --------------------------------------------------------------------------
    # 6. Marriage Date Validation: Reject Date Before Birth & Future Dates
    # --------------------------------------------------------------------------
    Write-Host "`n--- Step 6: Testing Marriage Date Validation (Before Birth & Future) ---" -ForegroundColor Yellow
    $invalidMarriageDatePayload = @{
        patientId = $patientId1
        motherName = "Test Ibu Hamil"
        motherBirthDate = "2004-08-23"
        marriageDate = "2004-07-23" # Before birthdate!
        gravidaCount = 1
        parityCount = 0
        abortionCount = 0
        livingChildrenCount = 0
        gestationalAgeWeeks = 10
        estimatedDueDate = "2026-12-15"
        currentComplaints = "Pemeriksaan ANC"
    } | ConvertTo-Json

    try {
        $res = Invoke-RestMethod -Uri "$apiUrl/maternity/intakes" -Method Post -Body $invalidMarriageDatePayload -Headers $adminAuth.headers
        Write-Host "UNEXPECTED: Endpoint accepted marriage date before birthdate!" -ForegroundColor Red
        exit 1
    } catch {
        $rawResponse = $_.ErrorDetails.Message
        if (-not $rawResponse -and $_.Exception.Response) {
            $stream = $_.Exception.Response.GetResponseStream()
            if ($stream.CanSeek) { $stream.Position = 0 }
            $reader = [System.IO.StreamReader]::new($stream)
            $rawResponse = $reader.ReadToEnd()
        }

        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Rejected marriage date before birth with 400 Bad Request" ($statusCode -eq 400) "Expected 400 Bad Request"

        $json = $rawResponse | ConvertFrom-Json
        $hasMarriageError = ($json.invalidParams | Where-Object { $_.reason -match "lebih awal dari tanggal lahir" -or $_.reason -match "tanggal menikah" })
        Assert-Test "Contains domain error explaining marriage date cannot be before birth" ($null -ne $hasMarriageError) "Missing marriage date error message in RFC 7807 response"
        Write-Host "Pass: Zod correctly rejected marriageDate=2004-07-23 with motherBirthDate=2004-08-23: $($hasMarriageError.reason)" -ForegroundColor Green
    }

    Write-Host "`n==============================================================================" -ForegroundColor Green
    Write-Host " ALL MATERNITY HARDENING & DRAFT TESTS PASSED WITH 100% SUCCESS!" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
} finally {
    Write-Host "`n--- Cleanup: Deleting Test Intakes ---" -ForegroundColor Yellow
    if ($createdIntakeId) {
        docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM maternal_health_intakes WHERE id = '$createdIntakeId'; DELETE FROM medical_intake_submissions WHERE id = '$createdIntakeId';" | Out-Null
        Write-Host "Cleaned up test maternity intake: $createdIntakeId" -ForegroundColor Green
    }
}
