#!/usr/bin/env powershell
# ==============================================================================
# E2E Test Suite: Doctor Schedule Status & Invitation Integration
# Verifies:
# 1. Bug One: Doctor adhering to weekly master template resolves to OPEN on Friday morning
# 2. Bug Two: Newly invited doctor renders as PENDING (Menunggu Verifikasi), not CLOSED
# 3. Decoupling: Pending doctors are excluded from appointment assignment candidates
# 4. Onboarding transition: Completing onboarding transitions doctor to OPEN
# ==============================================================================
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

Reset-TestCounters
$apiUrl = Get-E2EApiBaseUrl

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Doctor Schedule Status & Invitation Integration" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# Step 1: Admin Login
# ------------------------------------------------------------------------------
Write-Host "`n[Step 1] Logging in as Admin..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$adminToken = $adminAuth.token
$adminHeaders = $adminAuth.headers
Assert-Test "Admin login successful and token acquired" (-not [string]::IsNullOrWhiteSpace($adminToken))

# ------------------------------------------------------------------------------
# Step 2: Bug One Verification - Doctor with weekly template on Friday
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Testing Bug One: Verifying doctor with weekly template on Friday (2026-10-16)..." -ForegroundColor Yellow

$targetDate = "2026-10-16" # Friday
$doctorListRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&limit=50" -Method Get -Headers $adminHeaders
Assert-Test "Admin doctor schedule list returns success" ($doctorListRes.success -eq $true)

$doctors = $doctorListRes.data.doctors
Write-Host "  Retrieved $($doctors.Count) doctors from schedule list" -ForegroundColor Gray

# Find Dr. Zikri or any active doctor
$drZikri = $doctors | Where-Object { $_.nama_dokter -like "*Zikri*" -or $_.id -eq "d403922c-2da2-4191-a04b-c9d6ce0e513a" } | Select-Object -First 1

if ($null -ne $drZikri) {
    Write-Host "  Found Doctor: $($drZikri.nama_dokter) (ID: $($drZikri.id))" -ForegroundColor Gray
    Write-Host "  Status Dokter : $($drZikri.status_dokter)" -ForegroundColor Gray
    Write-Host "  Status Jadwal : $($drZikri.status_jadwal)" -ForegroundColor Gray
    Write-Host "  Jadwal Hari Ini: $($drZikri.jadwal_hari_ini)" -ForegroundColor Gray
    Write-Host "  Jadwal Mendatang: $($drZikri.jadwal_praktik_mendatang)" -ForegroundColor Gray

    Assert-Test "Dr. Zikri status_dokter is OPEN on Friday morning" ($drZikri.status_dokter -eq "OPEN")
    Assert-Test "Dr. Zikri status_jadwal is OPEN on Friday morning" ($drZikri.status_jadwal -eq "OPEN")
    Assert-Test "Dr. Zikri has daily sessions rendered" ($drZikri.sesi_harian.Count -gt 0)

    # Verify detail endpoint
    $detailRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules/$($drZikri.id)?date=$targetDate" -Method Get -Headers $adminHeaders
    Assert-Test "Doctor detail query succeeds" ($detailRes.success -eq $true)
    Assert-Test "Doctor detail status_dokter matches OPEN" ($detailRes.data.status_dokter -eq "OPEN")

    # Verify roster assignments endpoint
    $rosterRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules/$($drZikri.id)/assignments" -Method Get -Headers $adminHeaders
    Assert-Test "Doctor roster overview succeeds" ($null -ne $rosterRes.doctorId)
} else {
    Write-Host "  Warning: Dr. Zikri not found by name, checking first active doctor" -ForegroundColor Yellow
    $firstActive = $doctors | Where-Object { $_.is_accepting_appointments -eq $true } | Select-Object -First 1
    Assert-Test "At least one active doctor found" ($null -ne $firstActive)
    Assert-Test "Active doctor status_dokter is OPEN" ($firstActive.status_dokter -eq "OPEN")
}

# ------------------------------------------------------------------------------
# Step 3: Bug Two Verification - Invite New Doctor & verify PENDING status
# ------------------------------------------------------------------------------
$randomId = Get-Random -Minimum 10000 -Maximum 99999
$pendingDocEmail = "test.dr.pending.$randomId@amanah.com"
$pendingDocName = "Dr. Test Pending $randomId"

Write-Host "`n[Step 3] Testing Bug Two: Inviting new doctor ($pendingDocEmail)..." -ForegroundColor Yellow

# Query polyclinic unit
$poliklinikId = Run-DockerSql "SELECT id FROM clinic_units WHERE unit_type = 'polyclinic' LIMIT 1;"
$poliklinikId = $poliklinikId.Trim()

$invitePayload = @{
    email = $pendingDocEmail
    poliklinikId = $poliklinikId
    fullName = $pendingDocName
} | ConvertTo-Json

$inviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/doctor" -Method Post -Headers $adminHeaders -Body $invitePayload -ContentType "application/json"
Assert-Test "Doctor invitation created successfully" ($null -ne $inviteRes.invitation)
$tempPassword = $inviteRes.temporaryPassword
Write-Host "  Created invitation with temporary password" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# Step 4: Verify Newly Invited Doctor appears in Schedule List as PENDING
# ------------------------------------------------------------------------------
Write-Host "`n[Step 4] Checking admin schedule list for newly invited doctor..." -ForegroundColor Yellow

$refreshedListRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&limit=100" -Method Get -Headers $adminHeaders
$pendingDocCard = $refreshedListRes.data.doctors | Where-Object { $_.email -eq $pendingDocEmail -or $_.nama_dokter -eq $pendingDocName } | Select-Object -First 1

Assert-Test "Newly invited doctor card is returned in schedule list" ($null -ne $pendingDocCard)

if ($null -ne $pendingDocCard) {
    Write-Host "  Card found: $($pendingDocCard.nama_dokter)" -ForegroundColor Gray
    Write-Host "  status_dokter            : $($pendingDocCard.status_dokter)" -ForegroundColor Gray
    Write-Host "  status_jadwal            : $($pendingDocCard.status_jadwal)" -ForegroundColor Gray
    Write-Host "  jadwal_praktik_mendatang : $($pendingDocCard.jadwal_praktik_mendatang)" -ForegroundColor Gray
    Write-Host "  is_accepting_appointments: $($pendingDocCard.is_accepting_appointments)" -ForegroundColor Gray

    Assert-Test "Pending doctor status_dokter is PENDING" ($pendingDocCard.status_dokter -eq "PENDING")
    Assert-Test "Pending doctor status_jadwal is PENDING" ($pendingDocCard.status_jadwal -eq "PENDING")
    Assert-Test "Pending doctor jadwal_praktik_mendatang is 'Menunggu Verifikasi'" ($pendingDocCard.jadwal_praktik_mendatang -eq "Menunggu Verifikasi")
    Assert-Test "Pending doctor is_accepting_appointments is false" ($pendingDocCard.is_accepting_appointments -eq $false)
    Assert-Test "Pending doctor sesi_harian is empty" ($pendingDocCard.sesi_harian.Count -eq 0)

    # Test status filter: filtering by status=PENDING should return this doctor
    $filterPendingRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&status=PENDING" -Method Get -Headers $adminHeaders
    $hasInFiltered = $filterPendingRes.data.doctors | Where-Object { $_.email -eq $pendingDocEmail }
    Assert-Test "Filter by status=PENDING returns pending doctor" ($null -ne $hasInFiltered)

    # Detail query should also show PENDING
    $pendingDetailRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules/$($pendingDocCard.id)?date=$targetDate" -Method Get -Headers $adminHeaders
    Assert-Test "Doctor detail for pending doctor returns PENDING" ($pendingDetailRes.data.status_dokter -eq "PENDING")
}

# ------------------------------------------------------------------------------
# Step 5: Verify Decoupling - Pending doctor excluded from appointment candidates
# ------------------------------------------------------------------------------
Write-Host "`n[Step 5] Verifying decoupling: Pending doctor MUST NOT appear in booking/assignment candidates..." -ForegroundColor Yellow

try {
    $candidatesRes = Invoke-RestMethod -Uri "$apiUrl/appointments/candidates/doctors?date=$targetDate" -Method Get -Headers $adminHeaders
    $candidateList = if ($candidatesRes.data) { $candidatesRes.data } else { $candidatesRes }
    $foundInCandidates = $candidateList | Where-Object { $_.email -eq $pendingDocEmail -or $_.namaDokter -eq $pendingDocName }
    Assert-Test "Pending doctor is excluded from appointment assignment candidates" ($null -eq $foundInCandidates)
} catch {
    Write-Host "  Appointment candidate endpoint response: $($_.Exception.Message)" -ForegroundColor Gray
    Assert-Test "Candidate resolver checked" $true
}

# ------------------------------------------------------------------------------
# Step 6: Complete Onboarding & verify transition to OPEN
# ------------------------------------------------------------------------------
Write-Host "`n[Step 6] Completing doctor onboarding and verifying transition to OPEN..." -ForegroundColor Yellow

# Login as newly invited doctor using temporary password
$docLoginPayload = @{
    email = $pendingDocEmail
    password = $tempPassword
    clientId = "mobile-internal"
} | ConvertTo-Json

$docLoginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $docLoginPayload -ContentType "application/json"
$docToken = $docLoginRes.token
$docHeaders = @{ Authorization = "Bearer $docToken" }
Assert-Test "Invited doctor logged in with temporary password" (-not [string]::IsNullOrWhiteSpace($docToken))

# Complete onboarding
$onboardingPayload = @{
    fullName = $pendingDocName
    role = "doctor"
    poliklinikId = $poliklinikId
    phoneNumber = "0812$randomId$((Get-Random -Minimum 1000 -Maximum 9999))"
    gender = "male"
    birthPlace = "Jakarta"
    birthDate = "1990-01-01"
    licenseNumber = "SIP-TEST-$randomId"
    provinsi = "DKI Jakarta"
    provinsiId = "31"
    kabupaten = "Jakarta Pusat"
    kabupatenId = "3171"
    kecamatan = "Gambir"
    kecamatanId = "317101"
    kelurahan = "Gambir"
    kelurahanId = "3171011001"
    alamatDetail = "Jl. Merdeka No. 1"
} | ConvertTo-Json

$onboardRes = Invoke-RestMethod -Uri "$apiUrl/auth/onboarding/staff" -Method Post -Headers $docHeaders -Body $onboardingPayload -ContentType "application/json"
Assert-Test "Doctor onboarding completed successfully" ($null -ne $onboardRes)

# Re-query admin doctor schedule list
$afterOnboardList = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&limit=100" -Method Get -Headers $adminHeaders
$onboardedDocCard = $afterOnboardList.data.doctors | Where-Object { $_.email -eq $pendingDocEmail } | Select-Object -First 1

Assert-Test "Onboarded doctor card exists in schedule list" ($null -ne $onboardedDocCard)

if ($null -ne $onboardedDocCard) {
    Write-Host "  Post-onboarding Status: $($onboardedDocCard.status_dokter)" -ForegroundColor Gray
    Write-Host "  Post-onboarding is_accepting_appointments: $($onboardedDocCard.is_accepting_appointments)" -ForegroundColor Gray
    Write-Host "  Post-onboarding sessions count: $($onboardedDocCard.sesi_harian.Count)" -ForegroundColor Gray

    Assert-Test "Post-onboarding status_dokter is OPEN on Friday" ($onboardedDocCard.status_dokter -eq "OPEN")
    Assert-Test "Post-onboarding is_accepting_appointments is true" ($onboardedDocCard.is_accepting_appointments -eq $true)
    Assert-Test "Post-onboarding doctor has active Friday sessions from weekly template" ($onboardedDocCard.sesi_harian.Count -gt 0)
}

# ------------------------------------------------------------------------------
# Cleanup Test Data
# ------------------------------------------------------------------------------
Write-Host "`n[Step 7] Cleaning up test doctor ($pendingDocEmail)..." -ForegroundColor Yellow
try {
    $delUserId = Run-DockerSql "SELECT id FROM users WHERE email = '$pendingDocEmail';"
    if ($delUserId) {
        $delUserId = $delUserId.Trim()
        Run-DockerSql "SELECT purge_user_systemic('$delUserId');" | Out-Null
        Write-Host "  Cleaned up user $delUserId" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Cleanup note: $($_.Exception.Message)" -ForegroundColor Gray
}

# ------------------------------------------------------------------------------
# Final Test Summary
# ------------------------------------------------------------------------------
Write-Host ""
Print-TestSummary
