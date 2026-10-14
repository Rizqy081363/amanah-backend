# ==============================================================================
# AMANAH HEALTHCARE - CHAT EDA & REAL-TIME NOTIFICATION VERIFICATION
# ==============================================================================
# Validates the complete Event-Driven Architecture (EDA) pipeline for chat:
# 1. Admin authentication & single-use WebSocket ticket issuance
# 2. Guest/Patient message submission via REST API
# 3. Redis Streams / Event dispatch and Notification Orchestrator processing
# 4. Invariant: Persistent notification creation in PostgreSQL 'notifications' table
# 5. Invariant: Admin notification inbox delivery via GET /api/v1/notifications
# 6. Real-time presence verification
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$baseUrl = Get-E2EBaseUrl
$apiBaseUrl = Get-E2EApiBaseUrl

Reset-TestCounters

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING CHAT EDA & NOTIFICATION PIPELINE VERIFICATION" -ForegroundColor Cyan
Write-Host " Target API Base: $apiBaseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        $Body = $null
    )
    $uri = "$apiBaseUrl$Path"
    $params = @{
        Uri = $uri
        Method = $Method
        Headers = $Headers
        ContentType = "application/json"
    }
    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }

    try {
        $res = Invoke-RestMethod @params
        return @{
            StatusCode = 200
            Data = $res
            Success = $true
        }
    } catch {
        $statusCode = 500
        $errBody = ""
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errBody = $reader.ReadToEnd()
            } catch {}
        }
        return @{
            StatusCode = $statusCode
            Error = $_.Exception.Message
            ErrorBody = $errBody
            Success = $false
        }
    }
}

# ------------------------------------------------------------------------------
# 1. Authenticate as Clinic Admin
# ------------------------------------------------------------------------------
Write-Host "`n[Step 1] Authenticating as Admin..." -ForegroundColor Yellow
$loginRes = Login-Admin
Assert-Test "Admin authentication succeeded" ($null -ne $loginRes.token) "Acquired JWT token"
$adminHeaders = $loginRes.headers

# ------------------------------------------------------------------------------
# 2. Issue Realtime Ticket
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Requesting Real-time WebSocket Handshake Ticket..." -ForegroundColor Yellow
$ticketRes = Invoke-Api -Method "POST" -Path "/realtime/ticket" -Headers $adminHeaders
Assert-Test "POST /api/v1/realtime/ticket returns HTTP 200" ($ticketRes.StatusCode -eq 200) "Got $($ticketRes.StatusCode)"
$ticket = $ticketRes.Data.ticket
Assert-Test "Single-use CSPRNG realtime ticket issued" ($null -ne $ticket -and $ticket.Length -gt 10) "Ticket length: $($ticket.Length)"

# ------------------------------------------------------------------------------
# 3. Create Guest Conversation
# ------------------------------------------------------------------------------
Write-Host "`n[Step 3] Creating Guest Conversation..." -ForegroundColor Yellow
$guestId = [guid]::NewGuid().ToString()
$convRes = Invoke-Api -Method "POST" -Path "/chat/conversations" -Body @{
    guestId = $guestId
    name = "Budi Santoso (EDA E2E)"
    email = "budi.santoso.eda@example.com"
}
Assert-Test "POST /api/v1/chat/conversations returns HTTP 200" ($convRes.StatusCode -eq 200) "Status: $($convRes.StatusCode)"
$conversationId = $convRes.Data.id
Assert-Test "Conversation created with valid ID" ($null -ne $conversationId) "ConversationId: $conversationId"

# ------------------------------------------------------------------------------
# 4. Send Message from Guest to Trigger EDA Pipeline
# ------------------------------------------------------------------------------
Write-Host "`n[Step 4] Sending Customer Message to Trigger Notification Pipeline..." -ForegroundColor Yellow
$testNonce = [guid]::NewGuid().ToString().Substring(0, 8)
$testMessageBody = "Halo Admin, saya butuh bantuan konsultasi [EDA-TEST-$testNonce]"
$clientMsgId = [guid]::NewGuid().ToString()

$msgRes = Invoke-Api -Method "POST" -Path "/chat/conversations/$conversationId/messages" -Body @{
    body = $testMessageBody
    clientMessageId = $clientMsgId
    guestId = $guestId
}
Assert-Test "POST /api/v1/chat/conversations/:id/messages returns HTTP 200" ($msgRes.StatusCode -eq 200) "Status: $($msgRes.StatusCode)"
$messageId = $msgRes.Data.id
Assert-Test "Message persisted with ID" ($null -ne $messageId) "Message ID: $messageId"

# ------------------------------------------------------------------------------
# 5. Verify PostgreSQL Notifications Table Invariant
# ------------------------------------------------------------------------------
Write-Host "`n[Step 5] Checking Database 'notifications' table for EDA event processing..." -ForegroundColor Yellow

# Allow brief propagation window for async Redis Stream -> Worker -> DB
Start-Sleep -Seconds 2

$dbCheckQuery = "SELECT id, category, audience, title, body FROM notifications WHERE category = 'support' AND body LIKE '%$testNonce%' LIMIT 1;"
$dbResult = docker exec -i amanah-backend-postgres-1 psql -U amanah -d amanah_healthcare -t -c $dbCheckQuery

Write-Host "DB Query Result: $dbResult" -ForegroundColor Gray
$notificationFound = ($null -ne $dbResult -and $dbResult.Trim().Length -gt 0)
Assert-Test "Notification record was automatically created in PostgreSQL 'notifications' table via EDA pipeline!" $notificationFound "Found in DB"

# ------------------------------------------------------------------------------
# 6. Verify Admin Notification API (Inbox & Unread Counters)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 6] Verifying Admin Notification Inbox API..." -ForegroundColor Yellow
$notifApiRes = Invoke-Api -Method "GET" -Path "/notifications/me?page=1&limit=10" -Headers $adminHeaders
Assert-Test "GET /api/v1/notifications/me returns HTTP 200" ($notifApiRes.StatusCode -eq 200) "Status: $($notifApiRes.StatusCode)"

$items = if ($notifApiRes.Data.items) { $notifApiRes.Data.items } else { $notifApiRes.Data.data }
$chatNotif = $items | Where-Object { $_.category -eq 'support' -or $_.body -like "*$testNonce*" } | Select-Object -First 1

Assert-Test "Chat notification found in Admin Inbox API payload" ($null -ne $chatNotif) "Found in Inbox"
if ($chatNotif) {
    Write-Host "  Notification ID: $($chatNotif.id)" -ForegroundColor Green
    Write-Host "  Title: $($chatNotif.title)" -ForegroundColor Green
    Write-Host "  Audience: $($chatNotif.audience)" -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# 7. Verify Presence Endpoint
# ------------------------------------------------------------------------------
Write-Host "`n[Step 7] Checking Presence API..." -ForegroundColor Yellow
$presenceRes = Invoke-Api -Method "GET" -Path "/chat/presence"
Assert-Test "GET /api/v1/chat/presence returns HTTP 200" ($presenceRes.StatusCode -eq 200) "Status: $($presenceRes.StatusCode)"
Assert-Test "Presence endpoint returns boolean adminOnline flag" ($null -ne $presenceRes.Data.adminOnline) "adminOnline: $($presenceRes.Data.adminOnline)"

# ------------------------------------------------------------------------------
# 8. Cleanup Test Resources
# ------------------------------------------------------------------------------
Write-Host "`n[Step 8] Cleaning up test data..." -ForegroundColor Yellow
if ($conversationId) {
    $null = Invoke-Api -Method "POST" -Path "/chat/conversations/$conversationId/close" -Headers $adminHeaders
    $null = docker exec -i amanah-backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM messages WHERE conversation_id = '$conversationId';"
    $null = docker exec -i amanah-backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM conversations WHERE id = '$conversationId';"
    $null = docker exec -i amanah-backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM notifications WHERE category = 'support' AND body LIKE '%$testNonce%';"
}

Print-TestSummary "Chat EDA & Notification Verification"
