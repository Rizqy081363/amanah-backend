# ==============================================================================
# AMANAH HEALTHCARE - END-TO-END LIVE CHAT VERIFICATION SUITE
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$baseUrl = Get-E2EBaseUrl
$apiBaseUrl = Get-E2EApiBaseUrl

Reset-TestCounters

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING COMPREHENSIVE END-TO-END CHAT VERIFICATION" -ForegroundColor Cyan
Write-Host " Base URL: $baseUrl | API Base: $apiBaseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# HTTP Helper for predictable status code inspection
# ------------------------------------------------------------------------------
function Invoke-ChatApi {
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
# PHASE 1: ENVIRONMENT & PREREQUISITES
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 1] Checking Environment, Health & Authentication..." -ForegroundColor Yellow

Wait-E2EApiReady $baseUrl 60
Assert-Test "Backend API is reachable and healthy at $baseUrl" $true

$presenceRes = Invoke-ChatApi -Method "GET" -Path "/chat/presence"
Assert-Test "Public presence endpoint /api/v1/chat/presence returns 200 OK" ($presenceRes.StatusCode -eq 200)
Assert-Test "Presence payload contains adminOnline boolean" ($null -ne $presenceRes.Data.adminOnline)

$adminAuth = Login-Admin
Assert-Test "Administrator authenticated successfully via common.ps1" ($null -ne $adminAuth.token)
$adminHeaders = $adminAuth.headers

$patientAuth = Login-Patient
Assert-Test "Sample Patient authenticated successfully via common.ps1" ($null -ne $patientAuth.token)
$patientHeaders = $patientAuth.headers

# ------------------------------------------------------------------------------
# PHASE 2: CORE FUNCTIONAL BEHAVIOR (SCENARIOS A & B)
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 2] Validating Client-to-Admin Messaging & Ping-Pong Lifecycle..." -ForegroundColor Yellow

# Scenario A: Unauthenticated Visitor on Public Landing Page
$guest1Id = [guid]::NewGuid().ToString()
$guest1Name = "Budi Santoso (Tamu)"
$guest1Email = "budi.tamu@test.com"

$createConvRes = Invoke-ChatApi -Method "POST" -Path "/chat/conversations" -Body @{
    guestId = $guest1Id
    name = $guest1Name
    email = $guest1Email
}

Assert-Test "Visitor creates/opens conversation without auth token (HTTP 200)" ($createConvRes.StatusCode -eq 200)
$conv1 = $createConvRes.Data
Assert-Test "Conversation object contains valid UUID" ($null -ne $conv1.id -and $conv1.id.Length -gt 10)
Assert-Test "Conversation status is 'open'" ($conv1.status -eq "open")
Assert-Test "Conversation customerName matches guest input" ($conv1.customerName -eq $guest1Name)
Assert-Test "Conversation customerEmail matches guest input" ($conv1.customerEmail -eq $guest1Email)

# Send first visitor message
$clientMsg1Id = [guid]::NewGuid().ToString()
$sendMsg1Res = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv1.id)/messages" -Body @{
    body = "Halo admin, apakah klinik buka hari ini?"
    guestId = $guest1Id
    clientMessageId = $clientMsg1Id
}

Assert-Test "Visitor sends message 1 (HTTP 200/201)" ($sendMsg1Res.StatusCode -in @(200, 201))
$msg1 = $sendMsg1Res.Data
Assert-Test "Message 1 senderRole is 'customer'" ($msg1.senderRole -eq "customer")
Assert-Test "Message 1 clientMessageId is preserved" ($msg1.clientMessageId -eq $clientMsg1Id)
Assert-Test "Message 1 body matches sent content" ($msg1.body -eq "Halo admin, apakah klinik buka hari ini?")

# Idempotency Test: Sending exact same clientMessageId must not duplicate
$retryMsg1Res = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv1.id)/messages" -Body @{
    body = "Halo admin, apakah klinik buka hari ini?"
    guestId = $guest1Id
    clientMessageId = $clientMsg1Id
}
Assert-Test "Idempotent resend returns success" ($retryMsg1Res.StatusCode -in @(200, 201))
Assert-Test "Idempotent resend returns identical message ID" ($retryMsg1Res.Data.id -eq $msg1.id)

# Scenario B: Administrator Views & Replies
$adminGetMsgsRes = Invoke-ChatApi -Method "GET" -Path "/admin/chat/conversations/$($conv1.id)/messages" -Headers $adminHeaders
Assert-Test "Admin retrieves conversation messages (HTTP 200)" ($adminGetMsgsRes.StatusCode -eq 200)
$adminMsgs = $adminGetMsgsRes.Data.data
Assert-Test "Visitor message is visible in admin thread" ($adminMsgs.Count -ge 1 -and $adminMsgs[0].id -eq $msg1.id)

# Admin sends reply (Message 2)
$sendAdminReplyRes = Invoke-ChatApi -Method "POST" -Path "/admin/chat/conversations/$($conv1.id)/messages" -Headers $adminHeaders -Body @{
    body = "Halo Budi, klinik buka sampai pukul 21:00 WIB."
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Admin sends reply (HTTP 200/201)" ($sendAdminReplyRes.StatusCode -in @(200, 201))
$msg2 = $sendAdminReplyRes.Data
Assert-Test "Message 2 senderRole is 'admin'" ($msg2.senderRole -eq "admin")

# Visitor retrieves thread and observes admin reply
$guestGetMsgsRes = Invoke-ChatApi -Method "GET" -Path "/chat/conversations/$($conv1.id)/messages?guestId=$guest1Id"
Assert-Test "Visitor retrieves thread containing admin reply" ($guestGetMsgsRes.StatusCode -eq 200)
$guestThread = $guestGetMsgsRes.Data.data
Assert-Test "Visitor thread has at least 2 messages" ($guestThread.Count -ge 2)
Assert-Test "Second message in visitor thread is admin reply" ($guestThread[1].id -eq $msg2.id)

# Perform Ping-Pong: Client (3) -> Admin (4) -> Client (5)
$msg3Res = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv1.id)/messages" -Body @{
    body = "Apakah dokter spesialis anak bertugas sore ini?"
    guestId = $guest1Id
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Ping-Pong Step 3 (Client) succeeded" ($msg3Res.StatusCode -in @(200, 201))

$msg4Res = Invoke-ChatApi -Method "POST" -Path "/admin/chat/conversations/$($conv1.id)/messages" -Headers $adminHeaders -Body @{
    body = "Ya, dr. Rayhan Pratama, Sp.A praktik pukul 16:00 - 19:00 WIB."
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Ping-Pong Step 4 (Admin) succeeded" ($msg4Res.StatusCode -in @(200, 201))

$msg5Res = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv1.id)/messages" -Body @{
    body = "Baik, terima kasih banyak atas informasinya!"
    guestId = $guest1Id
    clientMessageId = [guid]::NewGuid().ToString()
}
Assert-Test "Ping-Pong Step 5 (Client) succeeded" ($msg5Res.StatusCode -in @(200, 201))

# Verify final sequence integrity
$finalThreadRes = Invoke-ChatApi -Method "GET" -Path "/admin/chat/conversations/$($conv1.id)/messages" -Headers $adminHeaders
$finalMsgs = $finalThreadRes.Data.data
Assert-Test "Ping-Pong thread contains exactly 5 messages" ($finalMsgs.Count -eq 5)
Assert-Test "Ping-Pong sequence roles are: customer, admin, customer, admin, customer" (
    $finalMsgs[0].senderRole -eq "customer" -and
    $finalMsgs[1].senderRole -eq "admin" -and
    $finalMsgs[2].senderRole -eq "customer" -and
    $finalMsgs[3].senderRole -eq "admin" -and
    $finalMsgs[4].senderRole -eq "customer"
)

# ------------------------------------------------------------------------------
# PHASE 3: MULTI-CLIENT BEHAVIOR & CONVERSATION ISOLATION
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 3] Validating Multi-Client Isolation & Channel Privacy..." -ForegroundColor Yellow

# Client 1 is $conv1 ($guest1Id)
# Client 2: Second Guest
$guest2Id = [guid]::NewGuid().ToString()
$guest2Name = "Siti Rahma (Tamu 2)"
$guest2Email = "siti.tamu@test.com"
$conv2Res = Invoke-ChatApi -Method "POST" -Path "/chat/conversations" -Body @{
    guestId = $guest2Id
    name = $guest2Name
    email = $guest2Email
}
$conv2 = $conv2Res.Data

# Client 3: Authenticated Registered Patient
$conv3Res = Invoke-ChatApi -Method "POST" -Path "/chat/conversations" -Headers $patientHeaders -Body @{}
$conv3 = $conv3Res.Data

Assert-Test "Client 2 conversation created ($($conv2.id))" ($null -ne $conv2.id)
Assert-Test "Client 3 (Registered Patient) conversation created ($($conv3.id))" ($null -ne $conv3.id)
Assert-Test "All 3 conversation IDs are distinct" ($conv1.id -ne $conv2.id -and $conv2.id -ne $conv3.id)

# Each client sends their unique confidential message
$client1Secret = "CONFIDENTIAL_CLIENT_1_$(Get-Random)"
$client2Secret = "CONFIDENTIAL_CLIENT_2_$(Get-Random)"
$client3Secret = "CONFIDENTIAL_CLIENT_3_$(Get-Random)"

Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv1.id)/messages" -Body @{
    body = $client1Secret
    guestId = $guest1Id
} | Out-Null

Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv2.id)/messages" -Body @{
    body = $client2Secret
    guestId = $guest2Id
} | Out-Null

Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv3.id)/messages" -Headers $patientHeaders -Body @{
    body = $client3Secret
} | Out-Null

# Admin replies individually to each conversation
$adminReply1 = "REPLY_TO_CLIENT_1_$(Get-Random)"
$adminReply2 = "REPLY_TO_CLIENT_2_$(Get-Random)"
$adminReply3 = "REPLY_TO_CLIENT_3_$(Get-Random)"

Invoke-ChatApi -Method "POST" -Path "/admin/chat/conversations/$($conv1.id)/messages" -Headers $adminHeaders -Body @{ body = $adminReply1 } | Out-Null
Invoke-ChatApi -Method "POST" -Path "/admin/chat/conversations/$($conv2.id)/messages" -Headers $adminHeaders -Body @{ body = $adminReply2 } | Out-Null
Invoke-ChatApi -Method "POST" -Path "/admin/chat/conversations/$($conv3.id)/messages" -Headers $adminHeaders -Body @{ body = $adminReply3 } | Out-Null

# Verify Isolation: Client 2 receives ONLY Client 2's data
$c2Msgs = (Invoke-ChatApi -Method "GET" -Path "/chat/conversations/$($conv2.id)/messages?guestId=$guest2Id").Data.data
$c2Bodies = ($c2Msgs | ForEach-Object { $_.body }) -join " "
Assert-Test "Client 2 thread contains Client 2 secret" ($c2Bodies.Contains($client2Secret))
Assert-Test "Client 2 thread contains Client 2 admin reply" ($c2Bodies.Contains($adminReply2))
Assert-Test "ISOLATION: Client 2 thread DOES NOT contain Client 1 secret" (-not $c2Bodies.Contains($client1Secret))
Assert-Test "ISOLATION: Client 2 thread DOES NOT contain Client 3 secret" (-not $c2Bodies.Contains($client3Secret))

# Security Enforcement: Client 1 attempting to view Client 2's conversation
$tamperReadRes = Invoke-ChatApi -Method "GET" -Path "/chat/conversations/$($conv2.id)/messages?guestId=$guest1Id"
Assert-Test "SECURITY: Unrelated client reading conversation is rejected with HTTP 403 Forbidden" ($tamperReadRes.StatusCode -eq 403)

# Security Enforcement: Client 1 attempting to post into Client 2's conversation
$tamperWriteRes = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv2.id)/messages" -Body @{
    body = "Malicious injection attempt"
    guestId = $guest1Id
}
Assert-Test "SECURITY: Unrelated client posting message is rejected with HTTP 403 Forbidden" ($tamperWriteRes.StatusCode -eq 403)

# ------------------------------------------------------------------------------
# PHASE 4: AUTHENTICATION, LIFECYCLE & THREAD CLOSURE
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 4] Validating Authentication Boundaries & Thread Closure..." -ForegroundColor Yellow

# Admin route protection
$unauthInboxRes = Invoke-ChatApi -Method "GET" -Path "/admin/chat/conversations"
Assert-Test "SECURITY: Accessing /admin/chat/conversations without token returns HTTP 401 Unauthorized" ($unauthInboxRes.StatusCode -eq 401)

$unauthAdminPostRes = Invoke-ChatApi -Method "POST" -Path "/admin/chat/conversations/$($conv1.id)/messages" -Body @{
    body = "Unauthorized admin spoofing"
}
Assert-Test "SECURITY: Posting to /admin/chat without token returns HTTP 401 Unauthorized" ($unauthAdminPostRes.StatusCode -eq 401)

# Conversation Closure by Admin
$closeRes = Invoke-ChatApi -Method "PATCH" -Path "/admin/chat/conversations/$($conv1.id)/close" -Headers $adminHeaders
Assert-Test "Admin closes conversation 1 (HTTP 200)" ($closeRes.StatusCode -eq 200)
Assert-Test "Closed conversation status is 'closed'" ($closeRes.Data.status -eq "closed")
Assert-Test "Closed conversation closedAt timestamp is populated" ($null -ne $closeRes.Data.closedAt)

# Verify subsequent message to closed conversation is rejected
$postClosedRes = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv1.id)/messages" -Body @{
    body = "Pesan setelah percakapan selesai"
    guestId = $guest1Id
}
Assert-Test "Posting to closed conversation is rejected with HTTP 400 Bad Request" ($postClosedRes.StatusCode -eq 400)

# ------------------------------------------------------------------------------
# PHASE 5: DATA INTEGRITY & INPUT VALIDATION
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 5] Validating Data Integrity & Edge Constraints..." -ForegroundColor Yellow

# Empty body validation
$emptyMsgRes = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv2.id)/messages" -Body @{
    body = "   "
    guestId = $guest2Id
}
Assert-Test "Empty/blank message body is rejected with HTTP 400/422" ($emptyMsgRes.StatusCode -in @(400, 422))

# Oversized body validation (> 4000 characters)
$oversizedText = "A" * 4005
$oversizedMsgRes = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv2.id)/messages" -Body @{
    body = $oversizedText
    guestId = $guest2Id
}
Assert-Test "Oversized message body (>4000 chars) is rejected with HTTP 400/422" ($oversizedMsgRes.StatusCode -in @(400, 422))

# ------------------------------------------------------------------------------
# PHASE 6: LATENCY & PERFORMANCE BENCHMARKS
# ------------------------------------------------------------------------------
Write-Host "`n[PHASE 6] Running Latency & Performance Benchmarks..." -ForegroundColor Yellow

$sampleCount = 10
$latencies = @()

for ($i = 1; $i -le $sampleCount; $i++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $benchRes = Invoke-ChatApi -Method "POST" -Path "/chat/conversations/$($conv2.id)/messages" -Body @{
        body = "Benchmark message $i"
        guestId = $guest2Id
        clientMessageId = [guid]::NewGuid().ToString()
    }
    $sw.Stop()

    if ($benchRes.StatusCode -in @(200, 201)) {
        $latencies += $sw.ElapsedMilliseconds
    }
}

$sortedLatencies = $latencies | Sort-Object
$minMs = $sortedLatencies[0]
$maxMs = $sortedLatencies[-1]
$p50Index = [Math]::Floor($sortedLatencies.Count * 0.5)
$p95Index = [Math]::Min($sortedLatencies.Count - 1, [Math]::Floor($sortedLatencies.Count * 0.95))
$p50Ms = $sortedLatencies[$p50Index]
$p95Ms = $sortedLatencies[$p95Index]

Write-Host "   Messages Sent: $sampleCount | Successfully Delivered: $($latencies.Count)" -ForegroundColor Gray
Write-Host "   Min Latency:   $minMs ms" -ForegroundColor Gray
Write-Host "   Median (p50):  $p50Ms ms" -ForegroundColor Gray
Write-Host "   p95 Latency:   $p95Ms ms" -ForegroundColor Gray
Write-Host "   Max Latency:   $maxMs ms" -ForegroundColor Gray

Assert-Test "Benchmark: 100% of benchmark messages succeeded" ($latencies.Count -eq $sampleCount)
Assert-Test "Benchmark: p50 latency is acceptable (< 250ms)" ($p50Ms -lt 250)

# ------------------------------------------------------------------------------
# PHASE 7: SUMMARY & RESULT
# ------------------------------------------------------------------------------
Print-TestSummary "E2E Live Chat Suite"
