# test-admin-patient-management-e2e.ps1
# E2E test script for Admin Patient Data Management feature

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " [E2E TEST] Admin Patient Data Management Feature" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$baseUrl = "http://127.0.0.1:3001"

# 1. Admin Login
Write-Host "1. Authenticating as Admin..." -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
    $token = $loginRes.token
    if (-not $token) {
        throw "Login succeeded but token is missing."
    }
    Write-Host "   -> Admin authenticated successfully. Token acquired." -ForegroundColor Green
} catch {
    Write-Host "   -> FAILED to authenticate: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
}

# 2. Get Patient Directory with Aggregated Stats
Write-Host "`n2. Testing GET /api/v1/patients/directory..." -ForegroundColor Yellow
try {
    $dirRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/directory?page=1&limit=10" -Method Get -Headers $headers
    
    if ($null -eq $dirRes.data -or $null -eq $dirRes.meta -or $null -eq $dirRes.summary) {
        throw "Directory response structure invalid. Expected data, meta, and summary properties."
    }

    Write-Host "   -> Meta: Total=$($dirRes.meta.total), Page=$($dirRes.meta.page), TotalPages=$($dirRes.meta.totalPages)" -ForegroundColor Green
    Write-Host "   -> Summary: Patients=$($dirRes.summary.totalPatients), Appointments=$($dirRes.summary.totalAppointments), CompletedVisits=$($dirRes.summary.totalCompletedVisits), Missed/Cancelled=$($dirRes.summary.totalMissedOrCancelled)" -ForegroundColor Green

    if ($dirRes.data.Count -gt 0) {
        $first = $dirRes.data[0]
        Write-Host "   -> Sample patient: '$($first.fullName)' (MRN: $($first.medicalRecordNumber))" -ForegroundColor Cyan
        Write-Host "      - Masked NIK: '$($first.maskedNik)'" -ForegroundColor Gray
        Write-Host "      - Age: $($first.age) th, Gender: $($first.gender), Blood: $($first.bloodType)" -ForegroundColor Gray
        Write-Host "      - Aggregated: TotalAppts=$($first.totalAppointments), Completed=$($first.completedVisits), Missed=$($first.missedAppointments), Cancelled=$($first.cancelledAppointments), LastVisit=$($first.lastVisitDate)" -ForegroundColor Gray

        # Validate inclusion criteria: patient must have at least 1 appointment
        foreach ($p in $dirRes.data) {
            if ($p.totalAppointments -le 0) {
                throw "Inclusion criteria violation: patient $($p.fullName) has 0 appointments but appears in directory."
            }
            if ($p.maskedNik -and (-not ($p.maskedNik -like "*`*`*`*`*`*`*`*`*"))) {
                throw "Security violation: NIK '$($p.maskedNik)' is not masked."
            }
        }
        Write-Host "   -> Inclusion criteria and NIK masking verified across all records." -ForegroundColor Green
    } else {
        Write-Host "   -> Note: 0 patients returned from directory query." -ForegroundColor Gray
    }
} catch {
    Write-Host "   -> FAILED GET /api/v1/patients/directory: $_" -ForegroundColor Red
    exit 1
}

# 3. Get Authorized Patient Detail
if ($dirRes.data.Count -gt 0) {
    $targetPatientId = $dirRes.data[0].id
    Write-Host "`n3. Testing GET /api/v1/patients/$targetPatientId (Detail)..." -ForegroundColor Yellow
    try {
        $detail = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/$targetPatientId" -Method Get -Headers $headers
        if (-not $detail.id -or -not $detail.fullName) {
            throw "Patient detail missing essential fields."
        }
        Write-Host "   -> Detail loaded for '$($detail.fullName)'." -ForegroundColor Green
        Write-Host "   -> Address: $($detail.address)" -ForegroundColor Gray
    } catch {
        Write-Host "   -> FAILED GET /api/v1/patients/${targetPatientId}: $_" -ForegroundColor Red
        exit 1
    }

    # 4. Get Patient Appointment History Timeline
    Write-Host "`n4. Testing GET /api/v1/appointments/history/patient/$targetPatientId..." -ForegroundColor Yellow
    try {
        $historyRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/patient/$targetPatientId" -Method Get -Headers $headers
        if ($null -eq $historyRes.data) {
            throw "History timeline response missing data array."
        }
        Write-Host "   -> Found $($historyRes.data.Count) timeline appointment entries." -ForegroundColor Green
        foreach ($h in $historyRes.data) {
            Write-Host "      - Date: $($h.scheduledDate) $($h.scheduledStartTime), Status: $($h.status), Poli: $($h.poliklinikName), HasForm: $($h.hasAssociatedForm)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "   -> FAILED GET history timeline: $_" -ForegroundColor Red
        exit 1
    }

    # 5. Test Update Patient Demographics
    Write-Host "`n5. Testing PATCH /api/v1/patients/$targetPatientId (Edit Demographics)..." -ForegroundColor Yellow
    $originalPekerjaan = $detail.pekerjaan
    $testPekerjaan = "Pegawai Swasta Test"
    $patchPayload = @{
        pekerjaan = $testPekerjaan
    } | ConvertTo-Json

    try {
        $updated = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/$targetPatientId" -Method Patch -Body $patchPayload -Headers $headers -ContentType "application/json"
        if ($updated.pekerjaan -ne $testPekerjaan) {
            throw "Patient occupation not updated. Expected '$testPekerjaan', got '$($updated.pekerjaan)'."
        }
        Write-Host "   -> Patient occupation updated successfully to '$($updated.pekerjaan)'." -ForegroundColor Green

        # Revert
        $revertPayload = @{ pekerjaan = $originalPekerjaan } | ConvertTo-Json
        $null = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/$targetPatientId" -Method Patch -Body $revertPayload -Headers $headers -ContentType "application/json"
        Write-Host "   -> Reverted occupation back to '$originalPekerjaan'." -ForegroundColor Gray
    } catch {
        Write-Host "   -> FAILED PATCH /api/v1/patients/${targetPatientId}: $_" -ForegroundColor Red
        exit 1
    }

    # 6. Test Bulk Delete & Restore
    Write-Host "`n6. Testing POST /api/v1/patients/bulk-delete..." -ForegroundColor Yellow
    $bulkDeletePayload = @{
        ids = @($targetPatientId)
    } | ConvertTo-Json

    try {
        $bulkRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/bulk-delete" -Method Post -Body $bulkDeletePayload -Headers $headers -ContentType "application/json"
        if ($bulkRes.count -ne 1) {
            throw "Expected bulk delete count = 1, got $($bulkRes.count)."
        }
        Write-Host "   -> Bulk delete soft-deleted $($bulkRes.count) patient successfully." -ForegroundColor Green

        # Verify status is inactive
        $inactivePatient = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/$targetPatientId" -Method Get -Headers $headers
        if ($inactivePatient.status -ne "inactive") {
            throw "Expected status 'inactive', got '$($inactivePatient.status)'."
        }
        Write-Host "   -> Confirmed patient status is now 'inactive'." -ForegroundColor Green

        # Restore patient to active
        $restorePayload = @{ status = "active" } | ConvertTo-Json
        $null = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/$targetPatientId" -Method Patch -Body $restorePayload -Headers $headers -ContentType "application/json"
        Write-Host "   -> Restored patient status back to 'active'." -ForegroundColor Gray
    } catch {
        Write-Host "   -> FAILED bulk delete test: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " [SUCCESS] All E2E backend verification tests passed 100%!" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Cyan
exit 0
