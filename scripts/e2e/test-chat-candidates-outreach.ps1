# ==============================================================================
# AMANAH HEALTHCARE - CHAT CANDIDATES & ZERO-MESSAGE OUTREACH TEST
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

$baseUrl = Get-E2EBaseUrl
$apiBaseUrl = Get-E2EApiBaseUrl

Reset-TestCounters

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING CHAT CANDIDATES & OUTREACH VERIFICATION SUITE" -ForegroundColor Cyan
Write-Host " Base URL: $baseUrl | API Base: $apiBaseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

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

# 1. Login as Admin
Write-Host "`n[1/4] Authenticating as Admin..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$adminToken = $adminAuth.token
$adminHeaders = $adminAuth.headers
Assert-Test "Admin authentication succeeded with Bearer token" ($null -ne $adminToken -and $adminToken.Length -gt 10)

# 2. Get Chat Candidates
Write-Host "`n[2/4] Fetching chat candidates for 'Chat Baru'..." -ForegroundColor Yellow
$candidatesRes = Invoke-ChatApi -Method "GET" -Path "/admin/chat/candidates" -Headers $adminHeaders
Assert-Test "Successfully retrieved candidates list" ($candidatesRes.Success)
$candidates = $candidatesRes.Data.data
Assert-Test "Candidate list is not empty (found $($candidates.Count) candidates)" ($candidates.Count -gt 0)

# Find an external candidate
$targetCandidate = $candidates | Where-Object { $_.email -eq "sexologydream@gmail.com" } | Select-Object -First 1
if ($null -eq $targetCandidate) {
    $targetCandidate = $candidates | Select-Object -First 1
}
Write-Host "Target Candidate: $($targetCandidate.name) ($($targetCandidate.email))" -ForegroundColor Cyan

# 3. Create or Get Conversation with Candidate
Write-Host "`n[3/4] Opening conversation with candidate $($targetCandidate.id)..." -ForegroundColor Yellow
$convRes = Invoke-ChatApi -Method "POST" -Path "/admin/chat/conversations" -Headers $adminHeaders -Body @{
    userId = $targetCandidate.id
}
Assert-Test "Successfully created/retrieved conversation (ID: $($convRes.Data.id))" ($convRes.Success)
$conversationId = $convRes.Data.id

# 4. Fetch Admin Conversations - must include this conversation even if 0 messages
Write-Host "`n[4/4] Verifying conversation appears in admin conversations inbox..." -ForegroundColor Yellow
$inboxRes = Invoke-ChatApi -Method "GET" -Path "/admin/chat/conversations" -Headers $adminHeaders
Assert-Test "Successfully fetched admin conversations" ($inboxRes.Success)
$items = $inboxRes.Data.data
$foundInInbox = $items | Where-Object { $_.id -eq $conversationId } | Select-Object -First 1
Assert-Test "Conversation $conversationId is included in admin inbox" ($null -ne $foundInInbox)
Write-Host "Verified conversation in inbox: $($foundInInbox.customerName) (lastMessageAt: $($foundInInbox.lastMessageAt))" -ForegroundColor Green

Print-TestSummary "CHAT CANDIDATES & OUTREACH VERIFICATION"
