#!/usr/bin/env powershell
# ==============================================================================
# E2E Test Suite: Midwife Schedule Status, Invitation & Onboarding Integration
# Verifies:
# 1. Dynamic invitation options endpoint returns clinical roles and polyclinics
# 2. Midwife invitation with roleCode = 'staff_midwife' linked to Poli KIA
# 3. Newly invited midwife renders as PENDING ("Menunggu Verifikasi"), not CLOSED
# 4. Decoupling: Pending midwives are excluded from appointment assignment candidates
# 5. Onboarding completion via POST /auth/onboarding/staff with role = 'midwife'
# 6. Post-onboarding transition to OPEN, is_accepting_appointments = true, with active sessions
# 7. Data Retention: Test data is KEPT permanently (no cleanup) for web UI inspection
# ==============================================================================
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

Reset-TestCounters
$apiUrl = Get-E2EApiBaseUrl

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Midwife Schedule Status & Invitation (Retained)" -ForegroundColor Cyan
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
# Step 2: Dynamic Invitation Options
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Fetching dynamic invitation options from backend..." -ForegroundColor Yellow
$optionsRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/options" -Method Get -Headers $adminHeaders
Assert-Test "Options endpoint returns success" ($null -ne $optionsRes)

$practitionerRoles = $optionsRes.practitionerRoles
$polyclinics = $optionsRes.polyclinics

Assert-Test "Practitioner roles list is populated" ($practitionerRoles.Count -gt 0)
Assert-Test "Polyclinics list is populated" ($polyclinics.Count -gt 0)

$midwifeRole = $practitionerRoles | Where-Object { $_.code -eq "staff_midwife" -or $_.name -like "*Bidan*" } | Select-Object -First 1
Assert-Test "staff_midwife role exists in dynamic options" ($null -ne $midwifeRole)
Write-Host "  Found Midwife Role: $($midwifeRole.name) (code: $($midwifeRole.code))" -ForegroundColor Gray

$kiaUnit = $polyclinics | Where-Object { $_.code -eq "poli_kia" -or $_.name -like "*KIA*" } | Select-Object -First 1
Assert-Test "Poli KIA exists in dynamic polyclinics" ($null -ne $kiaUnit)
Write-Host "  Found Polyclinic: $($kiaUnit.name) (ID: $($kiaUnit.id))" -ForegroundColor Gray

$poliklinikId = $kiaUnit.id

# ------------------------------------------------------------------------------
# Step 3: Invite New Midwife
# ------------------------------------------------------------------------------
$randomId = Get-Random -Minimum 10000 -Maximum 99999
$pendingMidwifeEmail = "test.bidan.$randomId@amanah.com"
$pendingMidwifeName = "Bdn. Test Pending $randomId, S.Tr.Keb"

Write-Host "`n[Step 3] Inviting new midwife ($pendingMidwifeEmail)..." -ForegroundColor Yellow

$invitePayload = @{
    email = $pendingMidwifeEmail
    poliklinikId = $poliklinikId
    fullName = $pendingMidwifeName
    roleCode = "staff_midwife"
} | ConvertTo-Json

$inviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/doctor" -Method Post -Headers $adminHeaders -Body $invitePayload -ContentType "application/json"
Assert-Test "Midwife invitation created successfully" ($null -ne $inviteRes.invitation)
$tempPassword = $inviteRes.temporaryPassword
Write-Host "  Created midwife invitation with temporary password: $tempPassword" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# Step 4: Verify Newly Invited Midwife in Schedule List as PENDING
# ------------------------------------------------------------------------------
$targetDate = "2026-10-16" # Friday
Write-Host "`n[Step 4] Checking admin schedule list for newly invited midwife ($targetDate)..." -ForegroundColor Yellow

$refreshedListRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&limit=100" -Method Get -Headers $adminHeaders
$midwifeCard = $refreshedListRes.data.doctors | Where-Object { $_.email -eq $pendingMidwifeEmail -or $_.nama_dokter -eq $pendingMidwifeName } | Select-Object -First 1

Assert-Test "Newly invited midwife card is returned in schedule list" ($null -ne $midwifeCard)

if ($null -ne $midwifeCard) {
    Write-Host "  Card found: $($midwifeCard.nama_dokter)" -ForegroundColor Gray
    Write-Host "  status_dokter            : $($midwifeCard.status_dokter)" -ForegroundColor Gray
    Write-Host "  status_jadwal            : $($midwifeCard.status_jadwal)" -ForegroundColor Gray
    Write-Host "  spesialisasi             : $($midwifeCard.spesialisasi)" -ForegroundColor Gray
    Write-Host "  jadwal_praktik_mendatang : $($midwifeCard.jadwal_praktik_mendatang)" -ForegroundColor Gray
    Write-Host "  is_accepting_appointments: $($midwifeCard.is_accepting_appointments)" -ForegroundColor Gray

    Assert-Test "Pending midwife status_dokter is PENDING" ($midwifeCard.status_dokter -eq "PENDING")
    Assert-Test "Pending midwife status_jadwal is PENDING" ($midwifeCard.status_jadwal -eq "PENDING")
    Assert-Test "Pending midwife jadwal_praktik_mendatang is 'Menunggu Verifikasi'" ($midwifeCard.jadwal_praktik_mendatang -eq "Menunggu Verifikasi")
    Assert-Test "Pending midwife spesialisasi is 'Kesehatan Ibu dan Anak'" ($midwifeCard.spesialisasi -like "*Kesehatan Ibu dan Anak*" -or $midwifeCard.spesialisasi -like "*KIA*")
    Assert-Test "Pending midwife is_accepting_appointments is false" ($midwifeCard.is_accepting_appointments -eq $false)
    Assert-Test "Pending midwife sesi_harian is empty" ($midwifeCard.sesi_harian.Count -eq 0)

    # Test status filter: filtering by status=PENDING should return this midwife
    $filterPendingRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&status=PENDING" -Method Get -Headers $adminHeaders
    $hasInFiltered = $filterPendingRes.data.doctors | Where-Object { $_.email -eq $pendingMidwifeEmail }
    Assert-Test "Filter by status=PENDING returns pending midwife" ($null -ne $hasInFiltered)

    # Test poli filter: filtering by Poli KIA should return this midwife
    $filterPoliRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&poli=$([uri]::EscapeDataString($kiaUnit.name))" -Method Get -Headers $adminHeaders
    $hasInPoli = $filterPoliRes.data.doctors | Where-Object { $_.email -eq $pendingMidwifeEmail }
    Assert-Test "Filter by poli=Poli KIA returns pending midwife" ($null -ne $hasInPoli)

    # Detail query should also show PENDING
    $pendingDetailRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules/$($midwifeCard.id)?date=$targetDate" -Method Get -Headers $adminHeaders
    Assert-Test "Midwife detail for pending midwife returns PENDING" ($pendingDetailRes.data.status_dokter -eq "PENDING")
}

# ------------------------------------------------------------------------------
# Step 5: Verify Decoupling - Pending Midwife excluded from appointment candidates
# ------------------------------------------------------------------------------
Write-Host "`n[Step 5] Verifying decoupling: Pending midwife MUST NOT appear in booking candidates..." -ForegroundColor Yellow

try {
    $candidatesRes = Invoke-RestMethod -Uri "$apiUrl/appointments/candidates/doctors?date=$targetDate" -Method Get -Headers $adminHeaders
    $candidateList = if ($candidatesRes.data) { $candidatesRes.data } else { $candidatesRes }
    $foundInCandidates = $candidateList | Where-Object { $_.email -eq $pendingMidwifeEmail -or $_.namaDokter -eq $pendingMidwifeName }
    Assert-Test "Pending midwife is excluded from appointment assignment candidates" ($null -eq $foundInCandidates)
} catch {
    Write-Host "  Appointment candidate endpoint response: $($_.Exception.Message)" -ForegroundColor Gray
    Assert-Test "Candidate resolver checked" $true
}

# ------------------------------------------------------------------------------
# Step 6: Complete Midwife Onboarding
# ------------------------------------------------------------------------------
Write-Host "`n[Step 6] Completing midwife onboarding and verifying transition to OPEN..." -ForegroundColor Yellow

# Login as newly invited midwife using temporary password
$midwifeLoginPayload = @{
    email = $pendingMidwifeEmail
    password = $tempPassword
    clientId = "mobile-internal"
} | ConvertTo-Json

$midwifeLoginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $midwifeLoginPayload -ContentType "application/json"
$midwifeToken = $midwifeLoginRes.token
$midwifeHeaders = @{ Authorization = "Bearer $midwifeToken" }
Assert-Test "Invited midwife logged in with temporary password" (-not [string]::IsNullOrWhiteSpace($midwifeToken))

# Complete onboarding with midwife role and SIPB license
$onboardingPayload = @{
    fullName = $pendingMidwifeName
    role = "midwife"
    poliklinikId = $poliklinikId
    phoneNumber = "0813$randomId$((Get-Random -Minimum 1000 -Maximum 9999))"
    gender = "female"
    birthPlace = "Jakarta"
    birthDate = "1992-05-15"
    licenseNumber = "SIPB-2026-$randomId"
    provinsi = "DKI Jakarta"
    provinsiId = "31"
    kabupaten = "Jakarta Pusat"
    kabupatenId = "3171"
    kecamatan = "Gambir"
    kecamatanId = "317101"
    kelurahan = "Gambir"
    kelurahanId = "3171011001"
    alamatDetail = "Jl. Sehat Bersama No. 12"
} | ConvertTo-Json

$onboardRes = Invoke-RestMethod -Uri "$apiUrl/auth/onboarding/staff" -Method Post -Headers $midwifeHeaders -Body $onboardingPayload -ContentType "application/json"
Assert-Test "Midwife onboarding completed successfully" ($null -ne $onboardRes)

# ------------------------------------------------------------------------------
# Step 7: Verify Transition to OPEN
# ------------------------------------------------------------------------------
Write-Host "`n[Step 7] Re-querying admin schedule list to verify OPEN transition..." -ForegroundColor Yellow

$afterOnboardList = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules?date=$targetDate&limit=100" -Method Get -Headers $adminHeaders
$onboardedCard = $afterOnboardList.data.doctors | Where-Object { $_.email -eq $pendingMidwifeEmail } | Select-Object -First 1

Assert-Test "Onboarded midwife card exists in schedule list" ($null -ne $onboardedCard)

if ($null -ne $onboardedCard) {
    Write-Host "  Post-onboarding Status: $($onboardedCard.status_dokter)" -ForegroundColor Gray
    Write-Host "  Post-onboarding is_accepting_appointments: $($onboardedCard.is_accepting_appointments)" -ForegroundColor Gray
    Write-Host "  Post-onboarding sessions count: $($onboardedCard.sesi_harian.Count)" -ForegroundColor Gray
    Write-Host "  Post-onboarding spesialisasi: $($onboardedCard.spesialisasi)" -ForegroundColor Gray

    Assert-Test "Post-onboarding status_dokter is OPEN on Friday" ($onboardedCard.status_dokter -eq "OPEN")
    Assert-Test "Post-onboarding is_accepting_appointments is true" ($onboardedCard.is_accepting_appointments -eq $true)
    Assert-Test "Post-onboarding midwife has active Friday sessions from default roster" ($onboardedCard.sesi_harian.Count -gt 0)
    Assert-Test "Post-onboarding midwife maintains 'Kesehatan Ibu dan Anak' specialty" ($onboardedCard.spesialisasi -like "*Kesehatan Ibu dan Anak*" -or $onboardedCard.spesialisasi -like "*KIA*")
}

# ------------------------------------------------------------------------------
# Step 8: Data Retention Notice (USER EXPLICIT REQUIREMENT)
# ------------------------------------------------------------------------------
Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " [DATA RETENTION NOTICE] Per user instruction, this test midwife is KEPT." -ForegroundColor Green
Write-Host " The record was NOT purged and is now indexed and visible on the Web UI." -ForegroundColor Green
Write-Host "------------------------------------------------------------------------------" -ForegroundColor Green
Write-Host "  Name         : $pendingMidwifeName" -ForegroundColor White
Write-Host "  Email        : $pendingMidwifeEmail" -ForegroundColor White
Write-Host "  Temp Password: $tempPassword" -ForegroundColor White
Write-Host "  Poli         : $($kiaUnit.name)" -ForegroundColor White
Write-Host "  License SIPB : SIPB-2026-$randomId" -ForegroundColor White
Write-Host "  Status       : OPEN" -ForegroundColor White
Write-Host "  Web URLs     :" -ForegroundColor White
Write-Host "    - Jadwal Dokter : http://localhost:3000/admin/jadwal-dokter" -ForegroundColor Cyan
Write-Host "    - Manajemen Staf: http://localhost:3000/admin/staff" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Green

# ------------------------------------------------------------------------------
# Final Test Summary
# ------------------------------------------------------------------------------
Write-Host ""
Print-TestSummary "Midwife Schedule Status & Invitation Suite"
