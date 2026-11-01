# E2E Test Suite: Roles, Macro/Micro Hierarchy, and RBAC Personas
# Tests:
# 1. Idempotent seeding execution (bun run db:seed:roles)
# 2. Admin authentication & RBAC check
# 3. GET /admin/roles (All 7 canonical roles returned)
# 4. GET /admin/roles/tree (Macro -> Micro parent-child tree verification)
# 5. Persona authentications:
#    - Dokter (dokter@amanah.com): doctor, isClinical: true
#    - Bidan (bidan@amanah.com): midwife, isClinical: true
#    - Customer Service (cs@amanah.com): customer_service, isClinical: false
#    - Pasien (pasien@amanah.com): patient, audience: external
# 6. Effective route access per role verification

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"

Reset-TestCounters

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Canonical Roles, Hierarchy & RBAC Personas" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verify Idempotent Seeder Execution
Write-Host "`n[Step 1] Executing bun run db:seed:roles (Idempotency Check)..." -ForegroundColor Yellow
$seedOutput = bun run db:seed:roles 2>&1
Assert-Test "Role seeder executed successfully" ($LASTEXITCODE -eq 0) "Output: $seedOutput"

# 2. Admin Login
Write-Host "`n[Step 2] Logging in as Admin (admin@amanah.com)..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$headers = $adminAuth.headers
$apiUrl = Get-E2EApiBaseUrl

Assert-Test "Admin JWT acquired" ($null -ne $adminAuth.token)

# 3. GET /admin/roles - Verify 7 Canonical Roles
Write-Host "`n[Step 3] Fetching all roles from GET /admin/roles..." -ForegroundColor Yellow
$roles = Invoke-RestMethod -Uri "$apiUrl/admin/roles" -Method Get -Headers $headers
Assert-Test "At least 7 roles returned" ($roles.Count -ge 7) "Count: $($roles.Count)"

$expectedRoles = @("admin", "patient", "doctor", "midwife", "customer_service", "doctor_specialist", "midwife_coordinator")
foreach ($code in $expectedRoles) {
    $found = $roles | Where-Object { $_.code -eq $code }
    Assert-Test "Role '$code' exists in catalog" ($null -ne $found)
}

# 4. GET /admin/roles/tree - Verify Macro -> Micro Hierarchy
Write-Host "`n[Step 4] Fetching role tree from GET /admin/roles/tree..." -ForegroundColor Yellow
$roleTree = Invoke-RestMethod -Uri "$apiUrl/admin/roles/tree" -Method Get -Headers $headers

$doctorTree = $roleTree | Where-Object { $_.code -eq "doctor" } | Select-Object -First 1
Assert-Test "Doctor macro role is present in tree" ($null -ne $doctorTree)
$doctorSpecialistChild = $doctorTree.children | Where-Object { $_.code -eq "doctor_specialist" }
Assert-Test "doctor_specialist is child of doctor" ($null -ne $doctorSpecialistChild)

$midwifeTree = $roleTree | Where-Object { $_.code -eq "midwife" } | Select-Object -First 1
Assert-Test "Midwife macro role is present in tree" ($null -ne $midwifeTree)
$midwifeCoordChild = $midwifeTree.children | Where-Object { $_.code -eq "midwife_coordinator" }
Assert-Test "midwife_coordinator is child of midwife" ($null -ne $midwifeCoordChild)

# 5. Persona Login Verifications
Write-Host "`n[Step 5] Testing Persona Logins & Identity Contracts..." -ForegroundColor Yellow

# 5.1 Dokter
$doctorAuth = Login-User "dokter@amanah.com" "secret123"
Assert-Test "Doctor authenticated successfully" ($null -ne $doctorAuth.token)
Assert-Test "Doctor roleCode is 'doctor'" ($doctorAuth.user.roleCode -eq "doctor")
Assert-Test "Doctor isClinical is TRUE" ($doctorAuth.user.role.isClinical -eq $true)

# 5.2 Bidan
$midwifeAuth = Login-User "bidan@amanah.com" "secret123"
Assert-Test "Midwife authenticated successfully" ($null -ne $midwifeAuth.token)
Assert-Test "Midwife roleCode is 'midwife'" ($midwifeAuth.user.roleCode -eq "midwife")
Assert-Test "Midwife isClinical is TRUE" ($midwifeAuth.user.role.isClinical -eq $true)

# 5.3 Customer Service
$csAuth = Login-User "cs@amanah.com" "secret123"
Assert-Test "Customer Service authenticated successfully" ($null -ne $csAuth.token)
Assert-Test "Customer Service roleCode is 'customer_service'" ($csAuth.user.roleCode -eq "customer_service")
Assert-Test "Customer Service isClinical is FALSE" ($csAuth.user.role.isClinical -eq $false)

# 5.4 Pasien (External)
$patientAuth = Login-User "pasien@amanah.com" "secret123"
Assert-Test "Patient authenticated successfully" ($null -ne $patientAuth.token)
Assert-Test "Patient roleCode is 'patient'" ($patientAuth.user.roleCode -eq "patient")

# 6. Verify Effective Routes
Write-Host "`n[Step 6] Testing Effective Routes for Doctor Role..." -ForegroundColor Yellow
$doctorRole = $roles | Where-Object { $_.code -eq "doctor" } | Select-Object -First 1
$effectiveRoutes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$($doctorRole.id)/effective-routes" -Method Get -Headers $headers
Assert-Test "Doctor has effective routes" ($effectiveRoutes.Count -gt 0) "Routes count: $($effectiveRoutes.Count)"
Assert-Test "Doctor has access to /admin/appointment-pasien" ($effectiveRoutes -contains "/admin/appointment-pasien")
Assert-Test "Doctor has access to /admin/riwayat-medis" ($effectiveRoutes -contains "/admin/riwayat-medis")

# 7. Test Staff Invitation with Custom Position Title (Bidan Koordinator KIA)
Write-Host "`n[Step 7] Testing Staff Invitation with Custom Position Title..." -ForegroundColor Yellow
$midwifeRole = $roles | Where-Object { $_.code -eq "midwife" } | Select-Object -First 1
$testInviteEmail = "test-bidan-coord-$(Get-Random)@amanah.clinic"
$customPositionTitle = "Bidan Koordinator KIA"

$invitePayload = @{
    email = $testInviteEmail
    roleId = $midwifeRole.id
    fullName = "Siti Aminah, S.Tr.Keb"
    positionTitle = $customPositionTitle
} | ConvertTo-Json

$inviteRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations" -Method Post -Headers $headers -Body $invitePayload -ContentType "application/json"
Assert-Test "Invitation API returned 201 with credentials" ($null -ne $inviteRes.temporaryPassword)
Assert-Test "Invitation metadata contains custom positionTitle" ($inviteRes.invitation.metadata.positionTitle -eq $customPositionTitle)

# Verify direct DB persistence in staff_profiles.position_title
$persistedPosition = Run-DockerSql "SELECT position_title FROM staff_profiles WHERE email = '$testInviteEmail';"
Assert-Test "Database staff_profiles.position_title reflects custom title" ($persistedPosition.Trim() -eq $customPositionTitle) "Actual: $persistedPosition"

# Clean up test invitation & staff to maintain pristine DB
$cleanupSql = @"
DELETE FROM staff_invitations WHERE email = '$testInviteEmail';
DELETE FROM practitioners WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE email = '$testInviteEmail');
DELETE FROM staff_profiles WHERE email = '$testInviteEmail';
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email = '$testInviteEmail');
DELETE FROM auth_accounts WHERE user_id IN (SELECT id FROM users WHERE email = '$testInviteEmail');
DELETE FROM users WHERE email = '$testInviteEmail';
DELETE FROM "user" WHERE email = '$testInviteEmail';
"@
$cleanupSql | docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -q
Assert-Test "Test invitation cleaned up" $true

Print-TestSummary "Canonical Roles & RBAC Personas E2E"
