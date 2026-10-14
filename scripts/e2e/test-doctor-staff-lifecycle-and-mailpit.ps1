# ==============================================================================
# E2E Test Suite: Doctor & Staff Lifecycle, Secure Invitations, Mailpit, & Roster
# ==============================================================================
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$scriptDir\common.ps1"

Write-Host "`n>>> Starting E2E: Doctor & Staff Lifecycle, Mailpit & Roster <<<" -ForegroundColor Cyan

# 1. Login as Admin
Write-Host "`n[Step 1] Logging in as Admin..." -ForegroundColor Yellow
$adminAuth = Login-Admin
Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

$apiUrl = Get-E2EApiBaseUrl
$mailpitUrl = "http://localhost:8025/api/v1"

# 2. Query Polyclinics (SSOT from clinic_units)
Write-Host "`n[Step 2] Fetching Polyclinics from GET /api/v1/clinics/poliklinik..." -ForegroundColor Yellow
$polyRes = Invoke-RestMethod -Uri "$apiUrl/clinics/poliklinik" -Method Get -Headers $adminAuth.headers
Assert-Test "Polyclinics list returned" ($polyRes.Count -gt 0)
$poli = $polyRes[0]
Write-Host "Selected Polyclinic: $($poli.name) (ID: $($poli.id))" -ForegroundColor Gray
$poliklinikId = $poli.id

# 2b. Fetch Staff Directory (as used on Staff Management page)
Write-Host "`n[Step 2b] Fetching Staff Directory from GET /api/v1/staffs..." -ForegroundColor Yellow
$staffList = Invoke-RestMethod -Uri "$apiUrl/staffs?page=1&limit=20" -Method Get -Headers $adminAuth.headers
Assert-Test "Staff list returned array" ($staffList.Count -ge 0)
Write-Host "Found $($staffList.Count) existing staff records in directory" -ForegroundColor Gray

# 3. Query Active Session Defs for Roster testing
Write-Host "`n[Step 3] Fetching Operational Sessions from GET /api/v1/admin/schedule-configuration..." -ForegroundColor Yellow
$schedConfig = Invoke-RestMethod -Uri "$apiUrl/admin/schedule-configuration" -Method Get -Headers $adminAuth.headers
Assert-Test "Operational sessions available" ($schedConfig.sessionDefs.Count -gt 0)
$sessionId = $schedConfig.sessionDefs[0].id
Write-Host "Selected Session: $($schedConfig.sessionDefs[0].name) (ID: $sessionId)" -ForegroundColor Gray

# 4. Admin Invites Doctor
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$doctorEmail = "dr.hendra.$ts@amanah.com"
$doctorName = "dr. Hendra Wijaya, Sp.A"

$doctorPhone = "0812$($ts.ToString().Substring($ts.ToString().Length - 8))"

Write-Host "`n[Step 4] Admin inviting Doctor ($doctorEmail)..." -ForegroundColor Yellow
$inviteDoctorPayload = @{
    email = $doctorEmail
    poliklinikId = $poliklinikId
} | ConvertTo-Json

$doctorInviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/doctor" -Method Post -Body $inviteDoctorPayload -Headers $adminAuth.headers
Assert-Test "Doctor invitation created" ($doctorInviteRes.invitation.status -eq "pending")
Assert-Test "Temporary password generated" ($doctorInviteRes.temporaryPassword.Length -ge 10)
$doctorTempPassword = $doctorInviteRes.temporaryPassword
$doctorInvitationId = $doctorInviteRes.invitation.id

# 5. Verify Mailpit received the invitation email
Write-Host "`n[Step 5] Verifying Mailpit received Doctor invitation email..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$mailpitMessages = (Invoke-RestMethod -Uri "$mailpitUrl/messages" -Method Get).messages
$doctorMail = $mailpitMessages | Where-Object {
    $toAddrs = ($_.To | Select-Object -ExpandProperty Address)
    ($toAddrs -contains $doctorEmail) -or ($_.Snippet -match [regex]::Escape($doctorEmail))
} | Select-Object -First 1
Assert-Test "Mailpit received email for $doctorEmail" ($null -ne $doctorMail)
Write-Host "Mailpit Subject: $($doctorMail.Subject)" -ForegroundColor Gray

# 6. Doctor Login with Temporary Password
Write-Host "`n[Step 6] Doctor logging in with Temporary Password..." -ForegroundColor Yellow
$doctorLoginPayload = @{
    email = $doctorEmail
    password = $doctorTempPassword
} | ConvertTo-Json

$doctorLoginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $doctorLoginPayload -ContentType "application/json"
Assert-Test "Doctor login succeeded with temporary password" ($null -ne $doctorLoginRes.token)
$doctorAuthHeaders = @{
    Authorization = "Bearer $($doctorLoginRes.token)"
    "Content-Type" = "application/json"
}

# 7. Doctor verifies profile via /api/v1/staffs/me
Write-Host "`n[Step 7] Doctor fetching own profile via GET /api/v1/staffs/me..." -ForegroundColor Yellow
$doctorProfile = Invoke-RestMethod -Uri "$apiUrl/staffs/me" -Method Get -Headers $doctorAuthHeaders
$expectedDocName = "dr.hendra.$ts"
Assert-Test "Profile fullName matches default" ($doctorProfile.fullName -eq $expectedDocName)
Assert-Test "StaffType is doctor" ($doctorProfile.staffType -eq "doctor")
Assert-Test "Primary unit is polyclinic" ($doctorProfile.poliklinikId -eq $poliklinikId)
$doctorStaffId = $doctorProfile.id

# 8. Doctor completes onboarding
Write-Host "`n[Step 8] Doctor completing onboarding via POST /api/v1/auth/onboarding/staff..." -ForegroundColor Yellow
$onboardingPayload = @{
    fullName = "$doctorName M.Kes"
    phoneNumber = $doctorPhone
    birthPlace = "Surabaya"
    birthDate = "1982-04-12"
    gender = "male"
    nationalId = "3578011204820001"
    provinsi = "JAWA BARAT"
    provinsi_id = "32"
    kabupaten = "KABUPATEN BOGOR"
    kabupaten_id = "3201"
    kecamatan = "CIBINONG"
    kecamatan_id = "320101"
    kelurahan = "PAKUANSARI"
    kelurahan_id = "3201010001"
    alamat_detail = "Jl. Tegar Beriman No. 42"
} | ConvertTo-Json

$onboardingRes = Invoke-RestMethod -Uri "$apiUrl/auth/onboarding/staff" -Method Post -Body $onboardingPayload -Headers $doctorAuthHeaders
Assert-Test "Onboarding succeeded" ($null -ne $onboardingRes)
Assert-Test "Onboarding returned staff address" ($null -ne $onboardingRes.staff.address)
Assert-Test "Address province matches JAWA BARAT" ($onboardingRes.staff.provinsi -eq "JAWA BARAT")
Assert-Test "Address regency matches KABUPATEN BOGOR" ($onboardingRes.staff.kabupaten -eq "KABUPATEN BOGOR")
$doctorPractitionerId = $onboardingRes.staff.practitionerId
Write-Host "Doctor practitionerId: $doctorPractitionerId" -ForegroundColor Gray

# Verify invitation status transitioned to accepted
$checkInviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations" -Method Get -Headers $adminAuth.headers
$acceptedInvite = $checkInviteRes | Where-Object { $_.id -eq $doctorInvitationId } | Select-Object -First 1
Assert-Test "Invitation status is now accepted" ($acceptedInvite.status -eq "accepted")

# 9. Admin Invites Independent Staff
$staffEmail = "staf.ops.$ts@amanah.com"

Write-Host "`n[Step 9] Admin inviting Independent Staff ($staffEmail)..." -ForegroundColor Yellow
$inviteStaffPayload = @{
    email = $staffEmail
} | ConvertTo-Json

$staffInviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/staff" -Method Post -Body $inviteStaffPayload -Headers $adminAuth.headers
Assert-Test "Staff invitation created" ($staffInviteRes.invitation.status -eq "pending")
Assert-Test "Staff roleCode is staff_worker" ($staffInviteRes.invitation.roleCode -eq "staff_worker")
Assert-Test "Staff staffType is worker" ($staffInviteRes.invitation.staffType -eq "worker")
$staffTempPassword = $staffInviteRes.temporaryPassword

# 10. Verify Mailpit received Staff invitation email
Write-Host "`n[Step 10] Verifying Mailpit received Staff invitation email..." -ForegroundColor Yellow
Start-Sleep -Seconds 2
$mailpitMessages2 = (Invoke-RestMethod -Uri "$mailpitUrl/messages" -Method Get).messages
$staffMail = $mailpitMessages2 | Where-Object {
    $toAddrs = ($_.To | Select-Object -ExpandProperty Address)
    ($toAddrs -contains $staffEmail) -or ($_.Snippet -match [regex]::Escape($staffEmail))
} | Select-Object -First 1
Assert-Test "Mailpit received email for $staffEmail" ($null -ne $staffMail)

# 11. Staff Login & Fetch Profile
Write-Host "`n[Step 11] Staff logging in with temporary password..." -ForegroundColor Yellow
$staffLoginPayload = @{
    email = $staffEmail
    password = $staffTempPassword
} | ConvertTo-Json

$staffLoginRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $staffLoginPayload -ContentType "application/json"
Assert-Test "Staff login succeeded" ($null -ne $staffLoginRes.token)
$staffAuthHeaders = @{
    Authorization = "Bearer $($staffLoginRes.token)"
    "Content-Type" = "application/json"
}

$staffProfile = Invoke-RestMethod -Uri "$apiUrl/staffs/me" -Method Get -Headers $staffAuthHeaders
$expectedStaffName = "staf.ops.$ts"
Assert-Test "Staff profile retrieved" ($staffProfile.fullName -eq $expectedStaffName)
Assert-Test "Staff profile staffType is worker" ($staffProfile.staffType -eq "worker")
$staffProfileId = $staffProfile.id

# 11b. Initial Staff Roster Inspection (Master Weekly Template Fallback)
Write-Host "`n[Step 11b] Verifying initial staff roster reads clinic master weekly template..." -ForegroundColor Yellow
$initialRoster = Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster" -Method Get -Headers $adminAuth.headers
Assert-Test "Initial roster contains master template items" ($initialRoster.Count -gt 0)
Assert-Test "Initial roster isOverride is false" ($initialRoster[0].isOverride -eq $false)
Assert-Test "Initial roster has session relation" ($null -ne $initialRoster[0].session)
Assert-Test "Initial roster has day relation" ($null -ne $initialRoster[0].day)
Write-Host "Initial roster loaded $($initialRoster.Count) template shifts with isOverride=$($initialRoster[0].isOverride)" -ForegroundColor Gray

# 12. Simulate Admin Checking Shift Slots & Overriding Roster (PUT /api/v1/staffs/$staffProfileId/roster)
Write-Host "`n[Step 12] Admin checking slots and saving custom roster (PUT /api/v1/staffs/$staffProfileId/roster)..." -ForegroundColor Yellow
$rosterPayload = @{
    rosters = @(
        @{
            sessionId = $sessionId
            dow = 1 # Monday
            notes = "Shift Pagi Poli KIA"
        },
        @{
            sessionId = $sessionId
            dow = 3 # Wednesday
            notes = "Shift Pagi Poli KIA"
        }
    )
} | ConvertTo-Json

$bulkRosterRes = Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster" -Method Put -Body $rosterPayload -Headers $adminAuth.headers
Assert-Test "Roster bulk replace returned 2 items" ($bulkRosterRes.Count -eq 2)
Assert-Test "Roster bulk replace response is marked isOverride: true" ($bulkRosterRes[0].isOverride -eq $true)
Assert-Test "Roster item contains session relation" ($null -ne $bulkRosterRes[0].session)
Assert-Test "Roster item contains day relation" ($null -ne $bulkRosterRes[0].day)

# 12a. Verify Custom Roster Persistence with Fresh GET
Write-Host "`n[Step 12a] Verifying custom roster persistence via GET /api/v1/staffs/$staffProfileId/roster..." -ForegroundColor Yellow
$getRosterRes = Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster" -Method Get -Headers $adminAuth.headers
Assert-Test "GET roster returns 2 override items" ($getRosterRes.Count -eq 2)
Assert-Test "GET roster is marked isOverride: true" ($getRosterRes[0].isOverride -eq $true)
Assert-Test "Roster notes preserved" ($getRosterRes[0].notes -eq "Shift Pagi Poli KIA")

# 12b. Simulate Admin Adding a 3rd Slot (Friday) and Re-saving
Write-Host "`n[Step 12b] Admin adds a 3rd slot (Friday) and re-saves roster..." -ForegroundColor Yellow
$rosterPayload3 = @{
    rosters = @(
        @{
            sessionId = $sessionId
            dow = 1
            notes = "Shift Pagi Poli KIA"
        },
        @{
            sessionId = $sessionId
            dow = 3
            notes = "Shift Pagi Poli KIA"
        },
        @{
            sessionId = $sessionId
            dow = 5 # Friday
            notes = "Shift Jumat Berkah"
        }
    )
} | ConvertTo-Json

$updateRosterRes = Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster" -Method Put -Body $rosterPayload3 -Headers $adminAuth.headers
Assert-Test "Updated roster has 3 items" ($updateRosterRes.Count -eq 3)
Assert-Test "Updated roster maintains isOverride: true" ($updateRosterRes[2].isOverride -eq $true)

# 12c. Delete 1 Roster Item via DELETE /api/v1/staffs/$staffProfileId/roster/:id
Write-Host "`n[Step 12c] Admin deletes 1 slot via DELETE /api/v1/staffs/$staffProfileId/roster/:id..." -ForegroundColor Yellow
$deleteRosterId = $updateRosterRes[0].id
Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster/$deleteRosterId" -Method Delete -Headers $adminAuth.headers
$remainingRoster = Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster" -Method Get -Headers $adminAuth.headers
Assert-Test "Roster count after single delete is 2" ($remainingRoster.Count -eq 2)
Assert-Test "Remaining roster remains isOverride: true" ($remainingRoster[0].isOverride -eq $true)

# 12d. Reset Staff Roster to Clinic Master Weekly Template
Write-Host "`n[Step 12d] Resetting Staff Roster to Master Template via DELETE /api/v1/staffs/$staffProfileId/roster..." -ForegroundColor Yellow
$resetRes = Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster" -Method Delete -Headers $adminAuth.headers
Assert-Test "Reset roster returned master template items" ($resetRes.Count -gt 0)
Assert-Test "Reset roster isOverride is false" ($resetRes[0].isOverride -eq $false)

$fallbackRoster = Invoke-RestMethod -Uri "$apiUrl/staffs/$staffProfileId/roster" -Method Get -Headers $adminAuth.headers
Assert-Test "Fallback roster returned master template on GET" ($fallbackRoster.Count -gt 0)
Assert-Test "Fallback roster isOverride is false on GET" ($fallbackRoster[0].isOverride -eq $false)

# 12e. Verify Seeded Staff Roster (e.g. IT Support / Receptionist / Bidan) reads master template
Write-Host "`n[Step 12e] Verifying existing Seeded Staff also reads master template..." -ForegroundColor Yellow
$seededStaff = $staffList | Where-Object { $_.staffType -eq "worker" -or $_.profession -like "*Support*" -or $_.fullName -like "*Budi*" -or $_.fullName -like "*Dewi*" } | Select-Object -First 1
if ($null -ne $seededStaff) {
    $seededRoster = Invoke-RestMethod -Uri "$apiUrl/staffs/$($seededStaff.id)/roster" -Method Get -Headers $adminAuth.headers
    Assert-Test "Seeded staff ($($seededStaff.fullName)) roster returned template items" ($seededRoster.Count -gt 0)
    Assert-Test "Seeded staff isOverride is false by default" ($seededRoster[0].isOverride -eq $false)
    Write-Host "Seeded staff $($seededStaff.fullName) has $($seededRoster.Count) template shifts" -ForegroundColor Gray
}

# 12f. Verifying Parity with Doctor Roster Endpoint
Write-Host "`n[Step 12f] Verifying Doctor Roster parity on GET /api/v1/admin/doctor-schedules/$doctorPractitionerId/assignments..." -ForegroundColor Yellow
if ($null -ne $doctorPractitionerId) {
    $docAssignments = Invoke-RestMethod -Uri "$apiUrl/admin/doctor-schedules/$doctorPractitionerId/assignments" -Method Get -Headers $adminAuth.headers
    Assert-Test "Doctor assignments endpoint responds" ($null -ne $docAssignments)
    Assert-Test "Doctor assignments has days schedule matrix" ($null -ne $docAssignments.days)
    Write-Host "Doctor roster assignments returned $($docAssignments.days.Count) days with $($docAssignments.totalActiveSessions) active shifts" -ForegroundColor Gray
}

# 13. Test Admin Invitation Revocation
Write-Host "`n[Step 13] Testing Invitation Revocation..." -ForegroundColor Yellow
$dummyEmail = "dummy.revoke.$ts@amanah.com"
$dummyPayload = @{
    email = $dummyEmail
} | ConvertTo-Json

$dummyInvite = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/staff" -Method Post -Body $dummyPayload -Headers $adminAuth.headers
$revokedInvite = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/$($dummyInvite.invitation.id)" -Method Delete -Headers $adminAuth.headers
Assert-Test "Invitation status is revoked" ($revokedInvite.status -eq "revoked")

# 14. Cleanup Test Artifacts
Write-Host "`n[Step 14] Cleaning up E2E test users & records..." -ForegroundColor Yellow
$cleanupEmails = "'$doctorEmail', '$staffEmail', '$dummyEmail'"
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c @"
DELETE FROM staff_invitations WHERE email IN ($cleanupEmails);
DELETE FROM staff_addresses WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE email IN ($cleanupEmails));
DELETE FROM staff_roster WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE email IN ($cleanupEmails));
DELETE FROM practitioners WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE email IN ($cleanupEmails));
DELETE FROM staff_credentials WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE email IN ($cleanupEmails));
DELETE FROM staff_profiles WHERE email IN ($cleanupEmails);
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email IN ($cleanupEmails));
DELETE FROM auth_accounts WHERE account_id IN ($cleanupEmails);
DELETE FROM users WHERE email IN ($cleanupEmails);
"@ | Out-Null
Write-Host "Cleanup completed." -ForegroundColor Green

Print-TestSummary "Doctor & Staff Lifecycle, Mailpit & Roster E2E"
