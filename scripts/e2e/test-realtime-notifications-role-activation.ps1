#!/usr/bin/env powershell
# ==============================================================================
# E2E Test Suite: Real-Time User Provisioning Notifications & Dynamic Role Activation
# Verifies:
#   1. Reversible Dynamic Role Activation/Deactivation (API + PostgreSQL SSOT)
#   2. Administrative Lockout Prevention (roles:manage protection, HTTP 400)
#   3. Deactivated Role Guard on Staff Invitation & Invitation Options Exclusion
#   4. Real-Time User Provisioning Notification (PostgreSQL notifications, recipient, badge, body)
#   5. Dynamic Role User Count Update
# ==============================================================================
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

Reset-TestCounters
$apiUrl = Get-E2EApiBaseUrl

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "  E2E TEST: REAL-TIME NOTIFICATIONS & DYNAMIC ROLE ACTIVATION LIFECYCLE" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 0: Wait for API Ready & Acquire Admin Authentication
# ------------------------------------------------------------------------------
Write-Host "`n[Step 0] Checking API Readiness and Logging in as Admin..." -ForegroundColor Yellow
Wait-E2EApiReady
$adminAuth = Login-Admin
$adminToken = $adminAuth.token
$adminHeaders = $adminAuth.headers
$adminUser = $adminAuth.user
$adminUserId = $adminUser.id

Assert-Test "Admin login successful and JWT token acquired" (-not [string]::IsNullOrWhiteSpace($adminToken))
Assert-Test "Admin user ID resolved from authentication token" (-not [string]::IsNullOrWhiteSpace($adminUserId))

$randomSuffix = Get-Random -Minimum 100000 -Maximum 999999
$testRoleCode = "test_role_$randomSuffix"
$testRoleName = "Test Role $randomSuffix"
$testRoleId = $null
$testUserEmail = "realtime_user_$randomSuffix@amanah.test"
$testUserId = $null

try {
    # ------------------------------------------------------------------------------
    # STEP 1: Dynamic Role Creation & Reversible Activation / Deactivation
    # ------------------------------------------------------------------------------
    Write-Host "`n[Step 1] Testing Dynamic Role Creation & Reversible Activation Toggle..." -ForegroundColor Yellow
    $createRolePayload = @{
        code = $testRoleCode
        name = $testRoleName
        description = "Temporary test role for activation lifecycle"
        tier = "macro"
        audience = "internal"
        isClinical = $false
        isActive = $true
    } | ConvertTo-Json

    $createRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles" -Method Post -Body $createRolePayload -Headers $adminHeaders
    $createdRole = Get-ResponseData $createRes
    $testRoleId = $createdRole.id

    Assert-Test "Role created successfully with ID" (-not [string]::IsNullOrWhiteSpace($testRoleId))
    Assert-Test "Created role isActive property is true in API response" ($createdRole.isActive -eq $true)

    # Verify PostgreSQL DB state
    $dbIsActive1 = Run-DockerSql "SELECT is_active FROM roles WHERE id = '$testRoleId';"
    Assert-Test "PostgreSQL DB confirms role is_active = true ('t')" ($dbIsActive1.Trim() -eq "t")

    # Deactivate the role via PATCH
    Write-Host "   -> Deactivating role via PATCH /admin/roles/$testRoleId (isActive = false)..." -ForegroundColor Gray
    $deactivatePayload = @{ isActive = $false } | ConvertTo-Json
    $deactivateRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$testRoleId" -Method Patch -Body $deactivatePayload -Headers $adminHeaders
    $deactivatedRole = Get-ResponseData $deactivateRes

    Assert-Test "API response confirms role isActive = false" ($deactivatedRole.isActive -eq $false)

    # Verify PostgreSQL DB state
    $dbIsActive2 = Run-DockerSql "SELECT is_active FROM roles WHERE id = '$testRoleId';"
    Assert-Test "PostgreSQL DB confirms role is_active = false ('f')" ($dbIsActive2.Trim() -eq "f")

    # Re-activate the role via PATCH
    Write-Host "   -> Re-enabling role via PATCH /admin/roles/$testRoleId (isActive = true)..." -ForegroundColor Gray
    $reactivatePayload = @{ isActive = $true } | ConvertTo-Json
    $reactivateRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$testRoleId" -Method Patch -Body $reactivatePayload -Headers $adminHeaders
    $reactivatedRole = Get-ResponseData $reactivateRes

    Assert-Test "API response confirms role isActive restored to true" ($reactivatedRole.isActive -eq $true)

    # Verify PostgreSQL DB state
    $dbIsActive3 = Run-DockerSql "SELECT is_active FROM roles WHERE id = '$testRoleId';"
    Assert-Test "PostgreSQL DB confirms role is_active restored to true ('t')" ($dbIsActive3.Trim() -eq "t")

    # ------------------------------------------------------------------------------
    # STEP 2: Administrative Lockout Prevention
    # ------------------------------------------------------------------------------
    Write-Host "`n[Step 2] Testing Administrative Lockout Prevention..." -ForegroundColor Yellow
    $adminRoleId = Run-DockerSql "SELECT id FROM roles WHERE code = 'admin' LIMIT 1;"
    $adminRoleId = $adminRoleId.Trim()
    Assert-Test "Found canonical admin role in database" (-not [string]::IsNullOrWhiteSpace($adminRoleId))

    $lockoutBlocked = $false
    $lockoutErrorMessage = ""
    try {
        $attemptDeactivateAdmin = @{ isActive = $false } | ConvertTo-Json
        $null = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$adminRoleId" -Method Patch -Body $attemptDeactivateAdmin -Headers $adminHeaders
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 400) {
            $lockoutBlocked = $true
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                try {
                    $errObj = $_.ErrorDetails.Message | ConvertFrom-Json
                    $lockoutErrorMessage = if ($errObj.message) { $errObj.message } else { $_.ErrorDetails.Message }
                } catch {
                    $lockoutErrorMessage = $_.ErrorDetails.Message
                }
            } else {
                $lockoutErrorMessage = $_.Exception.Message
            }
        }
    }

    Assert-Test "Attempt to deactivate sole roles:manage role rejected with HTTP 400 Bad Request" $lockoutBlocked
    Assert-Test "Error message explicitly details administrative lockout prevention" ($lockoutErrorMessage -match "administrative lockout|roles:manage")

    # Verify admin role is still active in database
    $adminRoleDbActive = Run-DockerSql "SELECT is_active FROM roles WHERE id = '$adminRoleId';"
    Assert-Test "PostgreSQL DB confirms admin role remains active ('t')" ($adminRoleDbActive.Trim() -eq "t")

    # ------------------------------------------------------------------------------
    # STEP 3: Deactivated Role Guard on Staff Invitation & Invitation Options
    # ------------------------------------------------------------------------------
    Write-Host "`n[Step 3] Testing Deactivated Role Guard in Staff Invitation & Options..." -ForegroundColor Yellow

    # Deactivate test role again
    $null = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$testRoleId" -Method Patch -Body (@{ isActive = $false } | ConvertTo-Json) -Headers $adminHeaders

    # Check invitation options
    $optionsRes = Invoke-RestMethod -Uri "$apiUrl/admin/invitations/options" -Method Get -Headers $adminHeaders
    $optionsData = Get-ResponseData $optionsRes
    $availableRoleIds = @($optionsData.roles | ForEach-Object { $_.id })

    Assert-Test "Invitation options excludes deactivated test role" (-not ($availableRoleIds -contains $testRoleId))

    # Attempt to invite staff with the deactivated role
    $inviteBlocked = $false
    $inviteErrorMessage = ""
    try {
        $invitePayload = @{
            email = "staff_inv_$randomSuffix@amanah.test"
            fullName = "Staff Inactive Role Test"
            roleId = $testRoleId
        } | ConvertTo-Json
        $null = Invoke-RestMethod -Uri "$apiUrl/admin/invitations" -Method Post -Body $invitePayload -Headers $adminHeaders
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 400) {
            $inviteBlocked = $true
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                try {
                    $errObj = $_.ErrorDetails.Message | ConvertFrom-Json
                    $inviteErrorMessage = if ($errObj.message) { $errObj.message } else { $_.ErrorDetails.Message }
                } catch {
                    $inviteErrorMessage = $_.ErrorDetails.Message
                }
            } else {
                $inviteErrorMessage = $_.Exception.Message
            }
        }
    }

    Assert-Test "Invitation with deactivated role rejected with HTTP 400 Bad Request" $inviteBlocked
    Assert-Test "Invitation rejection error identifies inactive role" ($inviteErrorMessage -match "dinonaktifkan|tidak dapat digunakan")

    # ------------------------------------------------------------------------------
    # STEP 4: Real-Time User Provisioning Notification & Role User Count
    # ------------------------------------------------------------------------------
    Write-Host "`n[Step 4] Testing Real-Time User Provisioning Notification & Role Count..." -ForegroundColor Yellow

    # Find the active default external role
    $extRoleRaw = Run-DockerSql "SELECT id, name FROM roles WHERE audience = 'external' AND is_active = true ORDER BY is_default DESC, created_at ASC LIMIT 1;"
    $extRoleParts = $extRoleRaw.Trim().Split('|')
    $externalRoleId = $extRoleParts[0].Trim()
    $externalRoleName = $extRoleParts[1].Trim()

    Assert-Test "Identified active external role in database" (-not [string]::IsNullOrWhiteSpace($externalRoleId))

    # Get initial user count for the external role from API
    $initialRoleRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$externalRoleId" -Method Get -Headers $adminHeaders
    $initialRoleData = Get-ResponseData $initialRoleRes
    $initialUserCount = [int]$initialRoleData.userCount
    Write-Host "   -> Initial user count for role '$externalRoleName' is: $initialUserCount" -ForegroundColor Gray

    # Register new external user
    $regPayload = @{
        email = $testUserEmail
        password = "ValidPassword123!"
        firstName = "Zikri"
        lastName = "Fadila Ahmad"
    } | ConvertTo-Json

    $regRes = Invoke-RestMethod -Uri "$apiUrl/auth/email/register" -Method Post -Body $regPayload -Headers @{ "Content-Type" = "application/json" }
    Assert-Test "User registration request succeeded" ($null -ne $regRes)

    # Retrieve test user ID from database
    $testUserId = (Run-DockerSql "SELECT id FROM users WHERE email = '$testUserEmail' LIMIT 1;").Trim()
    Assert-Test "New user persisted in PostgreSQL with valid UUID" (-not [string]::IsNullOrWhiteSpace($testUserId))

    # Allow async notification stream worker to process domain event into PostgreSQL notifications table
    Write-Host "   -> Waiting 2.5s for notification event pipeline (Redis Stream -> Orchestrator -> Delivery)..." -ForegroundColor Gray
    Start-Sleep -Seconds 3

    # Query notifications table in PostgreSQL for the admin recipient
    $notifQuery = @"
SELECT json_build_object('id', n.id, 'title', n.title, 'body', n.body, 'badge_icon', n.badge_icon, 'audience', n.audience)::text
FROM notifications n
JOIN notification_recipients nr ON n.id = nr.notification_id
WHERE n.title = 'Pengguna Baru Terdaftar'
  AND nr.user_id = '$adminUserId'
ORDER BY n.created_at DESC
LIMIT 1;
"@
    $notifRaw = (Run-DockerSql $notifQuery).Trim()
    Assert-Test "Notification record found in database for admin recipient" (-not [string]::IsNullOrWhiteSpace($notifRaw))

    $notifObj = $notifRaw | ConvertFrom-Json
    $notifId = $notifObj.id
    $notifTitle = $notifObj.title
    $notifBody = $notifObj.body
    $notifBadgeIcon = $notifObj.badge_icon
    $notifAudience = $notifObj.audience

    Assert-Test "Notification title is 'Pengguna Baru Terdaftar'" ($notifTitle -eq "Pengguna Baru Terdaftar")
    Assert-Test "Notification badge icon is 'user-plus'" ($notifBadgeIcon -eq "user-plus")
    Assert-Test "Notification audience is 'internal'" ($notifAudience -eq "internal")
    Assert-Test "Notification body contains user full name" ($notifBody -match "Zikri Fadila Ahmad")
    Assert-Test "Notification body contains user email address" ($notifBody -match [regex]::Escape($testUserEmail))
    Assert-Test "Notification body contains resolved dynamic role name" ($notifBody -match [regex]::Escape($externalRoleName))

    # Verify updated role user count in API
    $updatedRoleRes = Invoke-RestMethod -Uri "$apiUrl/admin/roles/$externalRoleId" -Method Get -Headers $adminHeaders
    $updatedRoleData = Get-ResponseData $updatedRoleRes
    $updatedUserCount = [int]$updatedRoleData.userCount
    Write-Host "   -> Updated user count for role '$externalRoleName' is: $updatedUserCount (was: $initialUserCount)" -ForegroundColor Gray

    Assert-Test "Role user count incremented by 1 in API" ($updatedUserCount -eq ($initialUserCount + 1))

} finally {
    # ------------------------------------------------------------------------------
    # STEP 5: Safe Cleanup of Test Artifacts
    # ------------------------------------------------------------------------------
    Write-Host "`n[Step 5] Cleaning up test artifacts from database..." -ForegroundColor Yellow

    if (-not [string]::IsNullOrWhiteSpace($testUserId)) {
        # Delete user in users (cascades automatically to user_roles, auth_accounts, notification_recipients)
        Run-DockerSql "DELETE FROM users WHERE id = '$testUserId';" | Out-Null
        Write-Host "   -> Cleaned up test user ($testUserId)" -ForegroundColor Gray
    }

    # Clean up test notifications created during test
    if (-not [string]::IsNullOrWhiteSpace($testUserEmail)) {
        $testNotifIds = Run-DockerSql "SELECT id FROM notifications WHERE body LIKE '%$testUserEmail%';"
        foreach ($nid in ($testNotifIds -split "`n")) {
            $cleanNid = $nid.Trim()
            if (-not [string]::IsNullOrWhiteSpace($cleanNid)) {
                Run-DockerSql "DELETE FROM notification_recipients WHERE notification_id = '$cleanNid';" | Out-Null
                Run-DockerSql "DELETE FROM notifications WHERE id = '$cleanNid';" | Out-Null
            }
        }
        Write-Host "   -> Cleaned up test user notifications" -ForegroundColor Gray
    }

    if (-not [string]::IsNullOrWhiteSpace($testRoleId)) {
        # Delete test role
        Run-DockerSql "DELETE FROM role_permissions WHERE role_id = '$testRoleId';" | Out-Null
        Run-DockerSql "DELETE FROM role_page_access WHERE role_id = '$testRoleId';" | Out-Null
        Run-DockerSql "DELETE FROM user_roles WHERE role_id = '$testRoleId';" | Out-Null
        Run-DockerSql "DELETE FROM roles WHERE id = '$testRoleId';" | Out-Null
        Write-Host "   -> Cleaned up test role ($testRoleId)" -ForegroundColor Gray
    }
}

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "Real-Time User Provisioning Notifications & Dynamic Role Activation E2E"
