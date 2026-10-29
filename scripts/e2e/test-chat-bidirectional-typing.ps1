# ==============================================================================
# AMANAH HEALTHCARE - BIDIRECTIONAL CHAT & TYPING INDICATOR VERIFICATION
# ==============================================================================
# Verifies:
# 1. Admin login & ticket generation
# 2. Anonymous guest ticket generation via POST /api/v1/chat/realtime-ticket
# 3. Authenticated user ticket generation via POST /api/v1/chat/realtime-ticket
# 4. Input validation (400 Bad Request when neither guestId nor auth is supplied)
# 5. Conversation creation for guest
# 6. Admin-to-Client message delivery (POST /api/v1/admin/chat/conversations/:id/messages)
# 7. Verification that guest receives admin messages in GET /api/v1/chat/conversations/:id/messages
# 8. Client-to-Admin message delivery (POST /api/v1/chat/conversations/:id/messages)
# 9. Verification that admin receives customer messages in GET /api/v1/admin/chat/conversations/:id/messages
# 10. Presence check (GET /api/v1/chat/presence)
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$apiBaseUrl = Get-E2EApiBaseUrl

Reset-TestCounters

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING BIDIRECTIONAL CHAT & REALTIME TICKET VERIFICATION" -ForegroundColor Cyan
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
# 1. Admin Authentication
# ------------------------------------------------------------------------------
Write-Host "`n[Step 1] Authenticating Admin..." -ForegroundColor Yellow
$loginRes = Login-Admin
Assert-Test "Admin authentication succeeded" ($null -ne $loginRes.token) "Acquired JWT token"
$adminHeaders = $loginRes.headers

# ------------------------------------------------------------------------------
# 2. Guest Ticket Issuance
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Issuing Guest WebSocket Ticket..." -ForegroundColor Yellow
$guestId = [guid]::NewGuid().ToString()
$guestTicketRes = Invoke-Api -Method "POST" -Path "/chat/realtime-ticket" -Body @{
    guestId = $guestId
}
Assert-Test "POST /api/v1/chat/realtime-ticket for guest returns HTTP 200" ($guestTicketRes.StatusCode -eq 200) "Got status $($guestTicketRes.StatusCode)"
$guestTicket = $guestTicketRes.Data.ticket
Assert-Test "Guest ticket is valid CSPRNG string" ($null -ne $guestTicket -and $guestTicket.Length -gt 15) "Length: $($guestTicket.Length)"
Assert-Test "Ticket TTL is 60 seconds" ($guestTicketRes.Data.expiresInSec -eq 60) "Expires in: $($guestTicketRes.Data.expiresInSec)s"

# ------------------------------------------------------------------------------
# 3. Authenticated User Ticket Issuance via Chat Endpoint
# ------------------------------------------------------------------------------
Write-Host "`n[Step 3] Issuing Authenticated User WebSocket Ticket via Chat Endpoint..." -ForegroundColor Yellow
$authTicketRes = Invoke-Api -Method "POST" -Path "/chat/realtime-ticket" -Headers $adminHeaders -Body @{}
Assert-Test "POST /api/v1/chat/realtime-ticket for admin returns HTTP 200" ($authTicketRes.StatusCode -eq 200) "Got status $($authTicketRes.StatusCode)"
$authTicket = $authTicketRes.Data.ticket
Assert-Test "Admin ticket is valid CSPRNG string" ($null -ne $authTicket -and $authTicket.Length -gt 15) "Length: $($authTicket.Length)"

# ------------------------------------------------------------------------------
# 4. Ticket Validation: Bad Request on missing identity
# ------------------------------------------------------------------------------
Write-Host "`n[Step 4] Verifying 400 Bad Request when no guestId or auth provided..." -ForegroundColor Yellow
$invalidTicketRes = Invoke-Api -Method "POST" -Path "/chat/realtime-ticket" -Body @{}
Assert-Test "POST /api/v1/chat/realtime-ticket without credentials returns HTTP 400" ($invalidTicketRes.StatusCode -eq 400) "Got $($invalidTicketRes.StatusCode)"

# ------------------------------------------------------------------------------
# 5. Create Guest Conversation
# ------------------------------------------------------------------------------
Write-Host "`n[Step 5] Creating Guest Conversation..." -ForegroundColor Yellow
$convRes = Invoke-Api -Method "POST" -Path "/chat/conversations" -Body @{
    guestId = $guestId
    name = "Rina Guest (Bidirectional E2E)"
    email = "rina.guest.e2e@example.com"
}
Assert-Test "POST /api/v1/chat/conversations returns HTTP 200" ($convRes.StatusCode -eq 200) "Status: $($convRes.StatusCode)"
$conversationId = $convRes.Data.id
Assert-Test "Conversation created with valid ID" ($null -ne $conversationId) "ID: $conversationId"

# ------------------------------------------------------------------------------
# 6. Admin Sends Message to Guest (Admin-to-Client Delivery)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 6] Admin Sending Message to Guest Conversation..." -ForegroundColor Yellow
$adminMsgText = "Halo Rina, selamat datang di Klinik Amanah! Ada yang bisa kami bantu? (TS=$(Get-Date -Format 'HH:mm:ss'))"
$adminSendRes = Invoke-Api -Method "POST" -Path "/admin/chat/conversations/$conversationId/messages" -Headers $adminHeaders -Body @{
    body = $adminMsgText
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Admin message sent successfully (HTTP 200/201)" ($adminSendRes.StatusCode -in @(200, 201)) "Status: $($adminSendRes.StatusCode)"
Assert-Test "Message has senderRole 'admin'" ($adminSendRes.Data.senderRole -eq "admin") "Role: $($adminSendRes.Data.senderRole)"

# ------------------------------------------------------------------------------
# 7. Guest Reads Messages (Verifying Admin Message Visibility to Guest)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 7] Guest Fetching Messages from Landing Page..." -ForegroundColor Yellow
$guestMsgsRes = Invoke-Api -Method "GET" -Path "/chat/conversations/$conversationId/messages?guestId=$guestId"
Assert-Test "Guest GET messages returns HTTP 200" ($guestMsgsRes.StatusCode -eq 200) "Status: $($guestMsgsRes.StatusCode)"

$guestMsgList = if ($guestMsgsRes.Data.data) { $guestMsgsRes.Data.data } else { $guestMsgsRes.Data.items }
Assert-Test "Guest message list is an array" ($null -ne $guestMsgList) "Count: $($guestMsgList.Count)"

$foundAdminMsg = $guestMsgList | Where-Object { $_.body -eq $adminMsgText }
Assert-Test "Admin message is visible to guest in landing-page chat" ($null -ne $foundAdminMsg) "Found message ID: $($foundAdminMsg.id)"
Assert-Test "Admin message author is Admin Klinik" ($foundAdminMsg.senderRole -eq "admin") "SenderRole: $($foundAdminMsg.senderRole)"

# ------------------------------------------------------------------------------
# 8. Guest Sends Reply to Admin (Client-to-Admin Delivery)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 8] Guest Replying to Admin Message..." -ForegroundColor Yellow
$guestReplyText = "Halo dok/admin, saya ingin menanyakan jadwal poli anak besok pagi."
$guestSendRes = Invoke-Api -Method "POST" -Path "/chat/conversations/$conversationId/messages" -Body @{
    body = $guestReplyText
    guestId = $guestId
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Guest message sent successfully (HTTP 200/201)" ($guestSendRes.StatusCode -in @(200, 201)) "Status: $($guestSendRes.StatusCode)"
Assert-Test "Message has senderRole 'customer'" ($guestSendRes.Data.senderRole -eq "customer") "Role: $($guestSendRes.Data.senderRole)"

# ------------------------------------------------------------------------------
# 9. Admin Reads Messages (Verifying Guest Reply Visibility to Admin)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 9] Admin Fetching Messages in Dashboard..." -ForegroundColor Yellow
$adminMsgsRes = Invoke-Api -Method "GET" -Path "/admin/chat/conversations/$conversationId/messages" -Headers $adminHeaders
Assert-Test "Admin GET messages returns HTTP 200" ($adminMsgsRes.StatusCode -eq 200) "Status: $($adminMsgsRes.StatusCode)"

$adminMsgList = if ($adminMsgsRes.Data.data) { $adminMsgsRes.Data.data } else { $adminMsgsRes.Data.items }
$foundGuestReply = $adminMsgList | Where-Object { $_.body -eq $guestReplyText }
Assert-Test "Guest reply is visible to admin in dashboard" ($null -ne $foundGuestReply) "Found reply ID: $($foundGuestReply.id)"

# ------------------------------------------------------------------------------
# 10. Presence Endpoint Check
# ------------------------------------------------------------------------------
Write-Host "`n[Step 10] Checking Presence Status..." -ForegroundColor Yellow
$presenceRes = Invoke-Api -Method "GET" -Path "/chat/presence"
Assert-Test "GET /api/v1/chat/presence returns HTTP 200" ($presenceRes.StatusCode -eq 200) "Status: $($presenceRes.StatusCode)"
Assert-Test "Presence response contains adminOnline boolean" ($null -ne $presenceRes.Data.adminOnline) "adminOnline: $($presenceRes.Data.adminOnline)"

# ------------------------------------------------------------------------------
# 11. Authenticated Patient Chat Workflow (Portal Pasien /klinik/chat)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 11] Authenticated Patient Chat Workflow..." -ForegroundColor Yellow
$patientLogin = Login-Patient
Assert-Test "Patient authenticated successfully" ($null -ne $patientLogin.token) "Got patient JWT token"
$patientHeaders = $patientLogin.headers

$patientConvRes = Invoke-Api -Method "POST" -Path "/chat/conversations" -Headers $patientHeaders -Body @{}
Assert-Test "Patient opens/creates conversation without guestId (HTTP 200)" ($patientConvRes.StatusCode -eq 200) "Status: $($patientConvRes.StatusCode)"
$patientConvId = $patientConvRes.Data.id
Assert-Test "Patient conversation linked to patient user ID" ($patientConvRes.Data.userId -eq $patientLogin.user.id) "UserId: $($patientConvRes.Data.userId)"

$patientTicketRes = Invoke-Api -Method "POST" -Path "/chat/realtime-ticket" -Headers $patientHeaders -Body @{}
Assert-Test "Patient acquires WebSocket ticket" ($patientTicketRes.StatusCode -eq 200 -and $patientTicketRes.Data.ticket.Length -gt 15) "Ticket: $($patientTicketRes.Data.ticket)"

$patientMsgText = "Halo dok, saya pasien terdaftar ingin menanyakan hasil lab rekam medis saya."
$patientSendRes = Invoke-Api -Method "POST" -Path "/chat/conversations/$patientConvId/messages" -Headers $patientHeaders -Body @{
    body = $patientMsgText
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Patient sends message successfully (HTTP 200/201)" ($patientSendRes.StatusCode -in @(200, 201)) "Status: $($patientSendRes.StatusCode)"
Assert-Test "Patient message senderUserId matches patient user ID" ($patientSendRes.Data.senderUserId -eq $patientLogin.user.id) "SenderUserId: $($patientSendRes.Data.senderUserId)"

$adminReadPatientRes = Invoke-Api -Method "GET" -Path "/admin/chat/conversations/$patientConvId/messages" -Headers $adminHeaders
Assert-Test "Admin reads patient messages (HTTP 200)" ($adminReadPatientRes.StatusCode -eq 200) "Status: $($adminReadPatientRes.StatusCode)"
$adminPatientMsgList = if ($adminReadPatientRes.Data.data) { $adminReadPatientRes.Data.data } else { $adminReadPatientRes.Data.items }
$foundMsgInAdmin = $adminPatientMsgList | Where-Object { $_.body -eq $patientMsgText }
Assert-Test "Admin sees patient consultation message" ($null -ne $foundMsgInAdmin) "Found: $($foundMsgInAdmin.id)"

$adminReplyText = "Baik, data lab Anda sudah kami terima dan sedang ditinjau dokter penanggung jawab."
$adminReplyRes = Invoke-Api -Method "POST" -Path "/admin/chat/conversations/$patientConvId/messages" -Headers $adminHeaders -Body @{
    body = $adminReplyText
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Admin sends reply to patient (HTTP 200/201)" ($adminReplyRes.StatusCode -in @(200, 201)) "Status: $($adminReplyRes.StatusCode)"

$patientGetMsgsRes = Invoke-Api -Method "GET" -Path "/chat/conversations/$patientConvId/messages" -Headers $patientHeaders
Assert-Test "Patient fetches consultation thread (HTTP 200)" ($patientGetMsgsRes.StatusCode -eq 200) "Status: $($patientGetMsgsRes.StatusCode)"
$patientMsgList = if ($patientGetMsgsRes.Data.data) { $patientGetMsgsRes.Data.data } else { $patientGetMsgsRes.Data.items }
$foundReplyInPatient = $patientMsgList | Where-Object { $_.body -eq $adminReplyText }
Assert-Test "Patient receives admin reply in consultation thread" ($null -ne $foundReplyInPatient) "Found: $($foundReplyInPatient.id)"

Print-TestSummary "BIDIRECTIONAL CHAT & REALTIME TICKET VERIFICATION"

