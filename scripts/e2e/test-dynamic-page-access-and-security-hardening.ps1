#!/usr/bin/env powershell
# ==============================================================================
# E2E Test Suite: Dynamic Page Access Registry, Role-Page Access & Security Hardening
# Canonical Rules: Deny-by-default, SSOT, Zero Speculation, Real Docker DB & API
# ==============================================================================
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

Reset-TestCounters
$apiUrl = Get-E2EApiBaseUrl

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "  E2E TEST: DYNAMIC PAGE REGISTRY, ROLE ACCESS & SECURITY HARDENING" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 1: Deny-by-default Fail-Closed Registration (No external role in DB)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 1] Testing Fail-Closed Registration (Rejection when no external role exists)..." -ForegroundColor Yellow
$randomSuffix = Get-Random -Minimum 100000 -Maximum 999999
$testEmail = "denied_reg_$randomSuffix@amanah.test"
$regPayload = @{
    email = $testEmail
    password = "SecretPassword123!"
    firstName = "FailClosed"
    lastName = "TestUser"
} | ConvertTo-Json

$regRejected = $false
$regErrorCode = ""
try {
    $null = Invoke-RestMethod -Uri "$apiUrl/auth/email/register" -Method Post -Body $regPayload -ContentType "application/json"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 422) {
        $regRejected = $true
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            try {
                $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json
                $regErrorCode = if ($errResponse.code) { $errResponse.code } else { $errResponse.errorCode }
            } catch {}
        }
    }
}
Assert-Test "Registration rejected with 422 Unprocessable Entity" $regRejected
Assert-Test "Error code is AUTH_NO_ELIGIBLE_EXTERNAL_ROLE" ($regErrorCode -eq "AUTH_NO_ELIGIBLE_EXTERNAL_ROLE")

# Verify database integrity: zero zombie accounts inserted
$userCountInDb = Run-DockerSql "SELECT COUNT(*) FROM users WHERE email = '$testEmail';"
Assert-Test "Database verified: zero users created for rejected registration" ($userCountInDb.Trim() -eq "0")

# ------------------------------------------------------------------------------
# STEP 2: Deny Unassigned User Access to Authenticated Endpoints
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Testing Unassigned User Access Denial (401 Unauthorized)..." -ForegroundColor Yellow
# Generate JWT for unassigned user in database if exists, or test invalid token
$blockedAccess = $false
try {
    $headers = @{
        Authorization = "Bearer invalid_or_unassigned_token_format"
    }
    $null = Invoke-RestMethod -Uri "$apiUrl/auth/me" -Method Get -Headers $headers
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        $blockedAccess = $true
    }
}
Assert-Test "Unauthenticated/invalid request to /auth/me rejected with 401" $blockedAccess

# ------------------------------------------------------------------------------
# STEP 3: Admin Login & Token Acquisition
# ------------------------------------------------------------------------------
Write-Host "`n[Step 3] Logging in as Admin..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$adminToken = $adminAuth.token
$adminHeaders = $adminAuth.headers
Assert-Test "Admin login successful and JWT token acquired" (-not [string]::IsNullOrWhiteSpace($adminToken))

# ------------------------------------------------------------------------------
# STEP 4: Application Pages Tree API (CMS Page Hierarchy)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 4] Fetching Page Hierarchy Tree from /admin/pages/tree..." -ForegroundColor Yellow
$treeRes = Invoke-RestMethod -Uri "$apiUrl/admin/pages/tree" -Method Get -Headers $adminHeaders
Assert-Test "Page tree returned successfully" ($null -ne $treeRes)

# Group count should be 5 parent groups
$groupSlugs = $treeRes | ForEach-Object { $_.slug }
Assert-Test "Found at least 5 parent groups" ($treeRes.Count -ge 5)
Assert-Test "Group 'admin.patient_care' exists" ($groupSlugs -contains "admin.patient_care")
Assert-Test "Group 'admin.hr_management' exists" ($groupSlugs -contains "admin.hr_management")
Assert-Test "Group 'admin.finance' exists" ($groupSlugs -contains "admin.finance")
Assert-Test "Group 'admin.system' exists" ($groupSlugs -contains "admin.system")
Assert-Test "Group 'external.patient_services' exists" ($groupSlugs -contains "external.patient_services")

# Count total children
$totalChildren = 0
foreach ($g in $treeRes) {
    if ($g.children) {
        $totalChildren += $g.children.Count
    }
}
Assert-Test "Found all 23 child application pages across parent groups" ($totalChildren -eq 23)

# ------------------------------------------------------------------------------
# STEP 5: Role-Page Access for Admin Role
# ------------------------------------------------------------------------------
Write-Host "`n[Step 5] Checking Page Access for Admin Role..." -ForegroundColor Yellow
# Get admin role ID from DB
$adminRoleId = Run-DockerSql "SELECT id FROM roles WHERE code = 'admin' LIMIT 1;"
$adminRoleId = $adminRoleId.Trim()
Assert-Test "Admin role ID resolved from database" (-not [string]::IsNullOrWhiteSpace($adminRoleId))

$adminPagesRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$adminRoleId/pages" -Method Get -Headers $adminHeaders
Assert-Test "Admin role has 19 assigned page IDs" ($adminPagesRes.Count -eq 19)

# ------------------------------------------------------------------------------
# STEP 6: Effective Routes on /auth/me and /admin/pages/my-routes
# ------------------------------------------------------------------------------
Write-Host "`n[Step 6] Verifying Accessible Routes on /auth/me..." -ForegroundColor Yellow
$meRes = Invoke-RestMethod -Uri "$apiUrl/auth/me" -Method Get -Headers $adminHeaders
Assert-Test "/auth/me returns accessibleRoutes array" ($null -ne $meRes.accessibleRoutes)
Assert-Test "accessibleRoutes contains '/admin/payroll'" ($meRes.accessibleRoutes -contains "/admin/payroll")
Assert-Test "accessibleRoutes contains '/admin/staff'" ($meRes.accessibleRoutes -contains "/admin/staff")
Assert-Test "accessibleRoutes contains '/admin/appointment-pasien'" ($meRes.accessibleRoutes -contains "/admin/appointment-pasien")
Assert-Test "accessibleRoutes excludes external patient route '/klinik/antrean'" (-not ($meRes.accessibleRoutes -contains "/klinik/antrean"))

# ------------------------------------------------------------------------------
# STEP 7: CMS Kill-Switch Toggle & Dynamic Route Recalculation
# ------------------------------------------------------------------------------
Write-Host "`n[Step 7] Testing CMS Kill-Switch on Payroll Page..." -ForegroundColor Yellow
# Find payroll page ID
$payrollPageId = Run-DockerSql "SELECT id FROM application_pages WHERE route_path = '/admin/payroll' LIMIT 1;"
$payrollPageId = $payrollPageId.Trim()
Assert-Test "Payroll page ID resolved: $payrollPageId" (-not [string]::IsNullOrWhiteSpace($payrollPageId))

# 7a. Disable Payroll in CMS
$disablePayload = @{ isEnabled = $false } | ConvertTo-Json
$toggleRes = Invoke-RestMethod -Uri "$apiUrl/admin/pages/$payrollPageId/toggle" -Method Patch -Headers $adminHeaders -Body $disablePayload -ContentType "application/json"
Assert-Test "CMS Kill-Switch disabled payroll (isEnabled = false)" ($toggleRes.isEnabled -eq $false)

# Verify route is immediately removed from admin's accessibleRoutes
$myRoutesAfterDisable = Invoke-RestMethod -Uri "$apiUrl/admin/pages/my-routes" -Method Get -Headers $adminHeaders
Assert-Test "/admin/payroll immediately excluded when killed in CMS" (-not ($myRoutesAfterDisable -contains "/admin/payroll"))

# 7b. Re-enable Payroll in CMS
$enablePayload = @{ isEnabled = $true } | ConvertTo-Json
$toggleRes2 = Invoke-RestMethod -Uri "$apiUrl/admin/pages/$payrollPageId/toggle" -Method Patch -Headers $adminHeaders -Body $enablePayload -ContentType "application/json"
Assert-Test "CMS Kill-Switch re-enabled payroll (isEnabled = true)" ($toggleRes2.isEnabled -eq $true)

# Verify route is restored in accessibleRoutes
$myRoutesAfterEnable = Invoke-RestMethod -Uri "$apiUrl/admin/pages/my-routes" -Method Get -Headers $adminHeaders
Assert-Test "/admin/payroll immediately restored when re-enabled in CMS" ($myRoutesAfterEnable -contains "/admin/payroll")

# ------------------------------------------------------------------------------
# STEP 8: Dynamic Role Page Assignment (Grant/Revoke) on Custom Role
# ------------------------------------------------------------------------------
Write-Host "`n[Step 8] Testing Dynamic Role Creation & Page Assignment..." -ForegroundColor Yellow
$testRoleCode = "test_staff_clerk_$randomSuffix"
$createRolePayload = @{
    name = "Test Staff Clerk $randomSuffix"
    code = $testRoleCode
    description = "Temporary role for E2E dynamic page access testing"
    tier = "micro"
    audience = "internal"
    isClinical = $false
    permissions = @("app:access", "profile:read")
} | ConvertTo-Json

$newRoleRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles" -Method Post -Headers $adminHeaders -Body $createRolePayload -ContentType "application/json"
$newRoleId = $newRoleRes.id
Assert-Test "New custom role created successfully (ID: $newRoleId)" (-not [string]::IsNullOrWhiteSpace($newRoleId))

# Find IDs for 'chat' and 'notifications' pages
$chatPageId = (Run-DockerSql "SELECT id FROM application_pages WHERE route_path = '/admin/chat' LIMIT 1;").Trim()
$notifPageId = (Run-DockerSql "SELECT id FROM application_pages WHERE route_path = '/admin/notifications' LIMIT 1;").Trim()

# Assign only chat and notifications to this role
$assignPayload = @{
    pageIds = @($chatPageId, $notifPageId)
} | ConvertTo-Json

$assignRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$newRoleId/pages" -Method Put -Headers $adminHeaders -Body $assignPayload -ContentType "application/json"
Assert-Test "Pages assigned to custom role successfully" ($assignRes.Count -eq 2)

# Verify assigned page IDs
$assignedPageIds = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$newRoleId/pages" -Method Get -Headers $adminHeaders
Assert-Test "Role has exactly 2 assigned page IDs" ($assignedPageIds.Count -eq 2)
Assert-Test "Assigned pages include chat page ID" ($assignedPageIds -contains $chatPageId)
Assert-Test "Assigned pages include notification page ID" ($assignedPageIds -contains $notifPageId)

# Verify effective routes for this role
$effectiveRoutes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$newRoleId/effective-routes" -Method Get -Headers $adminHeaders
Assert-Test "Effective routes count is 2" ($effectiveRoutes.Count -eq 2)
Assert-Test "Effective routes include '/admin/chat'" ($effectiveRoutes -contains "/admin/chat")
Assert-Test "Effective routes include '/admin/notifications'" ($effectiveRoutes -contains "/admin/notifications")
Assert-Test "Effective routes exclude '/admin/payroll'" (-not ($effectiveRoutes -contains "/admin/payroll"))

# ------------------------------------------------------------------------------
# STEP 9: Validation Test (isUUID from class-validator)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 9] Testing Validation Rejection on Invalid UUID..." -ForegroundColor Yellow
$invalidUuidPayload = @{
    pageIds = @("not-a-valid-uuid-string")
} | ConvertTo-Json

$invalidUuidRejected = $false
try {
    $null = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$newRoleId/pages" -Method Put -Headers $adminHeaders -Body $invalidUuidPayload -ContentType "application/json"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 400 -or $statusCode -eq 422) {
        $invalidUuidRejected = $true
    }
}
Assert-Test "PUT with malformed UUID rejected by class-validator isUUID" $invalidUuidRejected

# Clean up: Delete temporary role
Write-Host "`n[Step 10] Cleaning up temporary custom role..." -ForegroundColor Yellow
$delSuccess = $false
try {
    $null = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$newRoleId" -Method Delete -Headers $adminHeaders
    $delSuccess = $true
} catch {
    $delSuccess = $false
}
Assert-Test "Temporary role deleted cleanly" $delSuccess

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "Dynamic Page Registry & Security Hardening E2E"
