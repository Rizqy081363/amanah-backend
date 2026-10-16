#!/usr/bin/env powershell
# ==============================================================================
# E2E Test Suite: Invite-Only Closed Workforce Authentication & Onboarding
# Canonical Rules: Separation of Concerns, SSOT, Zero Zombie Accounts
# ==============================================================================
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

Reset-TestCounters
$apiUrl = Get-E2EApiBaseUrl

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Invite-Only Closed Authentication Architecture" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Admin Login
Write-Host "`n[Step 1] Logging in as Admin via common.ps1..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$adminToken = $adminAuth.token
$adminHeaders = $adminAuth.headers
Assert-Test "Admin login successful and token acquired" (-not [string]::IsNullOrWhiteSpace($adminToken))

# 2. Test Client Surface Restriction: Patient blocked from mobile-internal
Write-Host "`n[Step 2] Testing Client Surface Restriction: Patient blocked from mobile-internal..." -ForegroundColor Yellow
$patientCred = Get-PatientCredentials
$patientLoginPayload = @{
    email = $patientCred.email
    password = $patientCred.password
    clientId = "mobile-internal"
} | ConvertTo-Json

$blockedAsExpected = $false
try {
    $null = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $patientLoginPayload -ContentType "application/json"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 403) {
        $blockedAsExpected = $true
    } else {
        Write-Host "  Unexpected status code on patient mobile-internal login: $statusCode" -ForegroundColor Red
    }
}
Assert-Test "Patient login to mobile-internal blocked with 403 CLIENT_NOT_ALLOWED" $blockedAsExpected

# 3. Admin Invites Doctor
$randomId = Get-Random -Minimum 10000 -Maximum 99999
$testDocEmail = "test.dr.invitee.$randomId@amanah.com"
$testDocName = "Dr. Test Invitee $randomId"
Write-Host "`n[Step 3] Inviting new doctor ($testDocEmail, $testDocName)..." -ForegroundColor Yellow

# Query active polyclinic ID from database
$poliklinikId = Run-DockerSql "SELECT id FROM clinic_units WHERE unit_type = 'polyclinic' LIMIT 1;"
$poliklinikId = $poliklinikId.Trim()

$invitePayload = @{
    email = $testDocEmail
    poliklinikId = $poliklinikId
    fullName = $testDocName
} | ConvertTo-Json

$inviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/doctor" -Method Post -Headers $adminHeaders -Body $invitePayload
$invitationId = $inviteRes.invitation.id
$tempPassword = $inviteRes.temporaryPassword

Assert-Test "Doctor invited successfully with invitation.id and tempPassword" (-not [string]::IsNullOrWhiteSpace($invitationId) -and -not [string]::IsNullOrWhiteSpace($tempPassword))

# 4. Verify Schedule Isolation (Pending doctor must NOT appear in schedule query)
Write-Host "`n[Step 4] Verifying pending doctor is excluded from Doctor Schedules..." -ForegroundColor Yellow
$scheduleRes = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules" -Method Get -Headers $adminHeaders
$foundPendingInSchedule = $false
if ($scheduleRes.data.doctors) {
    foreach ($doc in $scheduleRes.data.doctors) {
        if ($doc.nama_dokter -match [regex]::Escape($testDocName)) {
            $foundPendingInSchedule = $true
            break
        }
    }
}
Assert-Test "Pending doctor excluded from active doctor schedules" (-not $foundPendingInSchedule)

# 5. Doctor First Login with Temporary Password on mobile-internal
Write-Host "`n[Step 5] Doctor logging in with temporary credentials on mobile-internal..." -ForegroundColor Yellow
$docLoginPayload = @{
    email = $testDocEmail
    password = $tempPassword
    clientId = "mobile-internal"
} | ConvertTo-Json

$docLoginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $docLoginPayload -ContentType "application/json"
$docToken = $docLoginRes.token
$needsOnboarding = $docLoginRes.user.needsOnboarding

Assert-Test "Doctor login successful with token" (-not [string]::IsNullOrWhiteSpace($docToken))
Assert-Test "Doctor user object returns needsOnboarding = true" ($needsOnboarding -eq $true)

$docHeaders = @{
    Authorization = "Bearer " + $docToken
    "Content-Type" = "application/json"
}

# 6. Doctor Completes Onboarding with complete demographics and domicile
Write-Host "`n[Step 6] Doctor completing onboarding (demographics & domicile)..." -ForegroundColor Yellow
$onboardingPayload = @{
    fullName = "$testDocName, Sp.A"
    birthDate = "1988-06-15"
    gender = "male"
    provinsi = "Jawa Barat"
    provinsiId = "32"
    kabupaten = "Kabupaten Bogor"
    kabupatenId = "3201"
    line1 = "Jl. Sehat Sejahtera No. 10"
    rt = "005"
    rw = "002"
    emergencyContactName = "Keluarga Dokter"
    emergencyContactPhone = "081299990000"
} | ConvertTo-Json

$onboardingRes = Invoke-RestMethod -Uri "$apiUrl/auth/onboarding/staff" -Method Post -Headers $docHeaders -Body $onboardingPayload
$onboardedNeeds = $onboardingRes.needsOnboarding
Assert-Test "Onboarding completion returns needsOnboarding = false" ($onboardedNeeds -eq $false)

# Verify DB state via Docker SQL
$invStatus = Run-DockerSql "SELECT status FROM staff_invitations WHERE id = '$invitationId';"
Assert-Test "Database staff_invitations status updated to 'accepted'" ($invStatus.Trim() -eq "accepted")

$acceptedUserId = Run-DockerSql "SELECT accepted_user_id FROM staff_invitations WHERE id = '$invitationId';"
Assert-Test "Database staff_invitations accepted_user_id is populated" (-not [string]::IsNullOrWhiteSpace($acceptedUserId.Trim()))

# 7. Doctor Subsequent Login
Write-Host "`n[Step 7] Doctor subsequent login check..." -ForegroundColor Yellow
$subsequentLoginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $docLoginPayload -ContentType "application/json"
Assert-Test "Subsequent login confirms needsOnboarding = false" ($subsequentLoginRes.user.needsOnboarding -eq $false)

# 8. Revocation Flow & Zombie Invalidation
$revokeRandomId = Get-Random -Minimum 10000 -Maximum 99999
$testRevokeEmail = "test.dr.revoked.$revokeRandomId@amanah.com"
$testRevokeName = "Dr. Test To Be Revoked $revokeRandomId"
Write-Host "`n[Step 8] Inviting second doctor for revocation test ($testRevokeEmail)..." -ForegroundColor Yellow

$revokeInvitePayload = @{
    email = $testRevokeEmail
    poliklinikId = $poliklinikId
    fullName = $testRevokeName
} | ConvertTo-Json

$revokeInviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/doctor" -Method Post -Headers $adminHeaders -Body $revokeInvitePayload
$revokeInvitationId = $revokeInviteRes.invitation.id
$revokeTempPassword = $revokeInviteRes.temporaryPassword

Write-Host "  Doctor invited. Now revoking invitation ID: $revokeInvitationId..." -ForegroundColor Gray
$null = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/$revokeInvitationId" -Method Delete -Headers $adminHeaders
Assert-Test "Invitation deletion/revocation API succeeded" $true

# Verify DB status is revoked
$revDbStatus = Run-DockerSql "SELECT status FROM staff_invitations WHERE id = '$revokeInvitationId';"
Assert-Test "Database staff_invitations status marked 'revoked'" ($revDbStatus.Trim() -eq "revoked")

# Assert that revoked doctor CANNOT login
Write-Host "  Attempting login with revoked temporary password..." -ForegroundColor Gray
$revokedLoginBlocked = $false
try {
    $revokedPayload = @{
        email = $testRevokeEmail
        password = $revokeTempPassword
        clientId = "mobile-internal"
    } | ConvertTo-Json
    $null = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $revokedPayload -ContentType "application/json"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        $revokedLoginBlocked = $true
    }
}
Assert-Test "Login with revoked credentials blocked (401/403) - Zero zombie account" $revokedLoginBlocked

# Print Final Summary
Print-TestSummary "Invite-Only Closed Workforce Authentication & Onboarding"
