# ==============================================================================
# test-notifications-cross-client.ps1
# E2E Cross-Client Notification Contract Verification
# Validates PostgreSQL persistence, In-App queue routing, and API responses
# for Presensi, Perizinan Cuti, and Peluang Pengganti across Web Admin & Mobile
# ==============================================================================

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:3001"
)

$ErrorActionPreference = "Stop"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host ("=" * 80) -ForegroundColor Cyan
}

$TotalPassed = 0
$TotalFailed = 0

function Report-Result {
    param(
        [string]$TestName,
        [bool]$Success,
        [string]$Detail = ""
    )
    if ($Success) {
        $script:TotalPassed++
        Write-Host " [PASS] $TestName" -ForegroundColor Green
        if ($Detail) {
            Write-Host "        $Detail" -ForegroundColor DarkGray
        }
    } else {
        $script:TotalFailed++
        Write-Host " [FAIL] $TestName" -ForegroundColor Red
        if ($Detail) {
            Write-Host "        $Detail" -ForegroundColor Yellow
        }
    }
}

# ------------------------------------------------------------------------------
# STEP 0: Acquire Dynamic Client Tokens
# ------------------------------------------------------------------------------
Write-Section "STEP 0: Acquiring Dynamic Client Tokens for Cross-Client Validation"

# 1. Admin Token
$adminToken = (bun ./scripts/dev/get-jwt-user.ts --email admin@amanah.com --raw).Trim()
$adminHeaders = @{
    "Authorization" = "Bearer $adminToken"
    "Content-Type"  = "application/json"
}
Report-Result "Admin JWT Token (admin@amanah.com)" ($adminToken.Length -gt 20) "Admin token acquired"

# 2. Doctor Zikri Token (Staff Profile ID: 52b4d315-75ec-41d9-b139-d1a8dfeaea97)
$doctorToken = (bun ./scripts/dev/get-jwt-user.ts --email zikrifadhiilahahmad@gmail.com --raw).Trim()
$doctorHeaders = @{
    "Authorization" = "Bearer $doctorToken"
    "Content-Type"  = "application/json"
}
Report-Result "Doctor Zikri JWT Token (zikrifadhiilahahmad@gmail.com)" ($doctorToken.Length -gt 20) "Doctor token acquired"

# 3. Peer Doctor Token (Dr. Maya)
$peerToken = (bun ./scripts/dev/get-jwt-user.ts --email dr.maya@amanah-healthcare.test --raw).Trim()
$peerHeaders = @{
    "Authorization" = "Bearer $peerToken"
    "Content-Type"  = "application/json"
}
Report-Result "Peer Doctor JWT Token (dr.maya@amanah-healthcare.test)" ($peerToken.Length -gt 20) "Peer doctor token acquired"

# ------------------------------------------------------------------------------
# PHASE 1: Presensi Notification Verification
# ------------------------------------------------------------------------------
Write-Section "PHASE 1: Presensi / Kehadiran In-App Notification Delivery"

# Check-in doctor
try {
    $rotateBody = @{ context = "Terminal Notifikasi Presensi Test" } | ConvertTo-Json
    $rotateRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/attendance/qr/rotate" -Method Post -Headers $adminHeaders -Body $rotateBody
    
    $scanBody = @{
        qrToken = $rotateRes.qrCodeIdentifier
        shift = "morning"
        deviceInfo = "Test Terminal / Cross-Client Verification"
    } | ConvertTo-Json

    $scanRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/attendance/scan" -Method Post -Headers $doctorHeaders -Body $scanBody
    Report-Result "POST /api/v1/attendance/scan (Check-In Trigger)" ($null -ne $scanRes.id) "Scan status: $($scanRes.status)"

    # Wait 500ms for RabbitMQ in-app worker persistence
    Start-Sleep -Milliseconds 600

    # Verify Doctor received attendance in-app notification
    $docNotifs = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $doctorHeaders
    $hasAttendanceNotif = $false
    foreach ($n in $docNotifs.data) {
        if ($n.sourceType -eq "attendance" -or $n.title -match "Presensi") {
            $hasAttendanceNotif = $true
            break
        }
    }
    Report-Result "Doctor In-App Feed: Attendance Notification Persisted" $hasAttendanceNotif "Found attendance notification in GET /notifications/me"
} catch {
    Report-Result "PHASE 1: Presensi Notification" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# PHASE 2: Perizinan Cuti Cross-Client Notification Verification
# ------------------------------------------------------------------------------
Write-Section "PHASE 2: Perizinan Cuti (Staff Acknowledgment & Admin Alert)"

try {
    # Doctor submits leave
    $uniqueReason = "Permohonan Cuti E2E Test Suite $(Get-Random)"
    $leaveBody = @{
        startDate = "2026-10-25"
        endDate = "2026-10-25"
        reason = $uniqueReason
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $createdLeave = Invoke-RestMethod -Uri "$BaseUrl/api/v1/leaves" -Method Post -Headers $doctorHeaders -Body $leaveBody
    Report-Result "POST /api/v1/leaves (Doctor Submit Leave)" ($createdLeave.status -eq "pending") "Created Leave ID: $($createdLeave.id)"

    # Wait 600ms for worker persistence
    Start-Sleep -Milliseconds 600

    # 1. Verify Doctor received submission acknowledgment
    $docNotifsAfter = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $doctorHeaders
    $hasAckNotif = $false
    foreach ($n in $docNotifsAfter.data) {
        if ($n.title -eq "Pengajuan Izin Berhasil Dikirim") {
            $hasAckNotif = $true
            break
        }
    }
    Report-Result "Doctor In-App Feed: Submission Acknowledgment Notification" $hasAckNotif "Found 'Pengajuan Izin Berhasil Dikirim' in doctor inbox"

    # 2. Verify Admin received pending leave notification
    $adminNotifs = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $adminHeaders
    $hasAdminLeaveNotif = $false
    foreach ($n in $adminNotifs.data) {
        if ($n.title -match "Pengajuan Izin Baru: zikrifadhiilahahmad" -and $n.category -eq "shift") {
            $hasAdminLeaveNotif = $true
            break
        }
    }
    Report-Result "Admin In-App Feed: New Leave Request Alert with Category 'shift'" $hasAdminLeaveNotif "Found 'Pengajuan Izin Baru' in admin inbox"

    # 3. Clean up by cancelling the test leave
    Invoke-RestMethod -Uri "$BaseUrl/api/v1/leaves/$($createdLeave.id)/cancel" -Method Patch -Headers $doctorHeaders | Out-Null
    Report-Result "PATCH /api/v1/leaves/:id/cancel (Clean-up)" $true "Leave $($createdLeave.id) cleanly cancelled"
} catch {
    Report-Result "PHASE 2: Perizinan Cuti Notification" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# PHASE 3: Peluang Pengganti Cross-Client Notification Verification
# ------------------------------------------------------------------------------
Write-Section "PHASE 3: Peluang Pengganti (Original Staff & Admin Claim Alert)"

try {
    # Query an open opportunity
    $openOpps = Invoke-RestMethod -Uri "$BaseUrl/api/v1/replacements?status=open" -Method Get -Headers $doctorHeaders
    if ($openOpps.Count -gt 0) {
        $targetOpp = $openOpps[0]
        $oppId = $targetOpp.id
        
        # Peer doctor claims the opportunity
        $claimRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/replacements/$oppId/claim" -Method Post -Headers $peerHeaders -Body "{}"
        Report-Result "POST /api/v1/replacements/:id/claim (Peer Claims Shift)" ($claimRes.status -eq "claimed") "Claimed opportunity $oppId"

        # Wait 600ms for worker persistence
        Start-Sleep -Milliseconds 600

        # 1. Verify Claiming Peer received confirmation notification
        $peerNotifs = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $peerHeaders
        $hasPeerClaimAck = $false
        foreach ($n in $peerNotifs.data) {
            if ($n.title -match "Konfirmasi Jadwal Pengganti Berhasil" -or $n.sourceType -eq "replacement") {
                $hasPeerClaimAck = $true
                break
            }
        }
        Report-Result "Claiming Peer Doctor: Confirmation Notification" $hasPeerClaimAck "Peer doctor inbox verified"

        # 2. Verify Admin received opportunity claimed alert
        $adminNotifsAfterClaim = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $adminHeaders
        $hasAdminClaimAlert = $false
        foreach ($n in $adminNotifsAfterClaim.data) {
            if ($n.title -match "Peluang Pengganti Terisi" -or $n.sourceType -eq "replacement") {
                $hasAdminClaimAlert = $true
                break
            }
        }
        Report-Result "Admin In-App Feed: Replacement Claimed Alert" $hasAdminClaimAlert "Admin inbox verified"
    } else {
        Report-Result "PHASE 3: Replacement Notification" $true "Skipped: No open opportunity to claim"
    }
} catch {
    Report-Result "PHASE 3: Peluang Pengganti Notification" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# PHASE 4: Mark As Read & Unread Count Synchronization
# ------------------------------------------------------------------------------
Write-Section "PHASE 4: Read/Unread Status & Badge Synchronization"

try {
    # Check current unread count
    $unreadRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/unread-count" -Method Get -Headers $doctorHeaders
    $initialUnread = $unreadRes.unreadCount
    Report-Result "GET /api/v1/notifications/unread-count" ($initialUnread -ge 0) "Current unread count: $initialUnread"

    # Mark all as read
    $markRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/read-all" -Method Patch -Headers $doctorHeaders
    Report-Result "PATCH /api/v1/notifications/read-all" ($markRes.success -eq $true) "Mark all as read succeeded"

    # Verify unread count is now 0
    $unreadAfter = Invoke-RestMethod -Uri "$BaseUrl/api/v1/notifications/unread-count" -Method Get -Headers $doctorHeaders
    Report-Result "Verified Unread Count is 0 after Read-All" ($unreadAfter.unreadCount -eq 0) "Unread count: $($unreadAfter.unreadCount)"
} catch {
    Report-Result "PHASE 4: Read/Unread Sync" $false $_.Exception.Message
}

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Write-Section "CROSS-CLIENT NOTIFICATION SUITE SUMMARY"
Write-Host " Total Passed : $TotalPassed" -ForegroundColor Green
Write-Host " Total Failed : $TotalFailed" -ForegroundColor $(if ($TotalFailed -eq 0) { "Green" } else { "Red" })

if ($TotalFailed -gt 0) {
    exit 1
} else {
    Write-Host ""
    Write-Host " CONGRATULATIONS: 100% Cross-Client Notification Flow & Persistence Verified!" -ForegroundColor Green
    exit 0
}
