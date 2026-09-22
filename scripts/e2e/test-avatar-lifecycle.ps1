# ==============================================================================
# AMANAH HEALTHCARE BACKEND - AVATAR LIFECYCLE E2E VERIFICATION SUITE
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
$baseUrl = Get-E2EBaseUrl
$passed = 0
$failed = 0

function Assert-Test([string]$name, [bool]$condition, [string]$details = "") {
    if ($condition) {
        Write-Host " [PASS] $name" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $name - $details" -ForegroundColor Red
        $global:failed++
    }
}

function Invoke-CurlHttp {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = ""
    )
    $curlArgs = @("-s", "-i", "-X", $Method)
    foreach ($k in $Headers.Keys) {
        $curlArgs += "-H"
        $curlArgs += "$k`: $($Headers[$k])"
    }
    if ($Body) {
        $curlArgs += "-d"
        $curlArgs += $Body
    }
    $curlArgs += $Url

    $raw = (& curl.exe $curlArgs) -join "`n"
    $parts = $raw -split "(?:\r?\n){2}", 2
    $headerLines = $parts[0] -split "\r?\n"
    $statusLine = $headerLines[0]
    $statusCode = 0
    if ($statusLine -match "HTTP/\S+\s+(\d+)") {
        $statusCode = [int]$matches[1]
    }
    $bodyContent = if ($parts.Length -gt 1) { $parts[1] } else { "" }
    
    $headersMap = @{}
    foreach ($h in $headerLines[1..($headerLines.Length - 1)]) {
        if ($h -match "^([^:]+):\s*(.*)$") {
            $headersMap[$matches[1].Trim().ToLower()] = $matches[2].Trim()
        }
    }

    return [PSCustomObject]@{
        StatusCode = $statusCode
        Headers = $headersMap
        Content = $bodyContent
        Raw = $raw
    }
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Amanah Healthcare: Avatar Lifecycle & Contract E2E Suite" -ForegroundColor Cyan
Write-Host " Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. Login as Staff Doctor (dr. Ahmad Santoso)
# ------------------------------------------------------------------------------
Write-Host "`n1. Authenticating as Doctor (dr. Ahmad Santoso)..." -ForegroundColor Yellow
$loginBody = @{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginRes.token
$headers = @{ "Authorization" = "Bearer $token" }

# Reset user avatar to pristine initials state before starting tests
try {
    & curl.exe -s -X DELETE "$baseUrl/api/v1/users/me/avatar" -H "Authorization: Bearer $token" | Out-Null
    $loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $loginBody -ContentType "application/json"
} catch {}

$user = $loginRes.user
$userId = $user.id

Assert-Test "Authentication succeeded" ($null -ne $token -and $token.Length -gt 20)
Assert-Test "User has canonical avatar object" ($null -ne $user.avatar)
Assert-Test "Initials correctly strips 'dr.' prefix to 'AS'" ($user.avatar.initials -eq "AS")
Assert-Test "Canonical avatar URL is populated" ($user.avatar.url -match "^/api/v1/users/[0-9a-fA-F-]+/avatar")
Assert-Test "User imageUrl points to canonical avatar endpoint" ($user.imageUrl -match "^/api/v1/users/[0-9a-fA-F-]+/avatar")
Assert-Test "Staff photoUrl is synchronized" ($user.staff.photoUrl -match "^/api/v1/users/[0-9a-fA-F-]+/avatar")

# ------------------------------------------------------------------------------
# 2. Public Fallback SVG Delivery
# ------------------------------------------------------------------------------
Write-Host "`n2. Verifying Public Initials SVG Fallback Delivery..." -ForegroundColor Yellow
$svgUrl = "$baseUrl/api/v1/users/$userId/avatar"
$svgHttp = Invoke-CurlHttp -Url $svgUrl -Method "GET"

Assert-Test "SVG endpoint returns HTTP 200" ($svgHttp.StatusCode -eq 200)
Assert-Test "Content-Type is image/svg+xml" ($svgHttp.Headers["content-type"] -match "image/svg\+xml")
Assert-Test "SVG body contains user initials 'AS'" ($svgHttp.Content -match "<text[^>]*>AS</text>")
Assert-Test "Cache-Control header is present" ($null -ne $svgHttp.Headers["cache-control"])
$etag = $svgHttp.Headers["etag"]
Assert-Test "ETag header is present on SVG response" ($null -ne $etag -and $etag.Length -gt 0)

# Test 304 Not Modified for SVG
if ($etag) {
    $conditionalRes = Invoke-CurlHttp -Url $svgUrl -Method "GET" -Headers @{ "If-None-Match" = $etag }
    Assert-Test "ETag conditional request returns HTTP 304 Not Modified" ($conditionalRes.StatusCode -eq 304)
}

# ------------------------------------------------------------------------------
# 3. Security Defense: Rejecting Fake Image (Plain text disguised as JPG)
# ------------------------------------------------------------------------------
Write-Host "`n3. Testing Security Defense: Magic-Byte Sniffing against Fake Image..." -ForegroundColor Yellow
$tempFakeFile = [System.IO.Path]::GetTempFileName() + ".jpg"
[System.IO.File]::WriteAllText($tempFakeFile, "This is plain text disguised as an image file")

try {
    $uploadOutput = & curl.exe -s -w "\n%{http_code}" -X PATCH "$baseUrl/api/v1/users/me/avatar" `
        -H "Authorization: Bearer $token" `
        -F "file=@$tempFakeFile;type=image/jpeg"
    
    $lines = $uploadOutput -split "`n"
    $statusCode = [int]($lines[-1].Trim())
    Assert-Test "Fake image rejected with HTTP 422 (Unprocessable Entity)" ($statusCode -eq 422)
} finally {
    if (Test-Path $tempFakeFile) { Remove-Item $tempFakeFile -Force }
}

# ------------------------------------------------------------------------------
# 4. Valid Avatar Upload via PATCH /api/v1/users/me/avatar
# ------------------------------------------------------------------------------
Write-Host "`n4. Uploading Valid Avatar (PNG) via PATCH /api/v1/users/me/avatar..." -ForegroundColor Yellow
$tempPngFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "avatar-test-$(Get-Random).png")
& bun -e "const sharp = require('sharp'); sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 2, g: 132, b: 199 } } }).png().toFile('$($tempPngFile.Replace('\', '/'))')"

try {
    $uploadOutput = & curl.exe -s -w "\n%{http_code}" -X PATCH "$baseUrl/api/v1/users/me/avatar" `
        -H "Authorization: Bearer $token" `
        -F "file=@$tempPngFile;type=image/png"
    
    $lines = $uploadOutput -split "`n"
    $statusCode = [int]($lines[-1].Trim())
    $bodyJson = ($lines[0..($lines.Length - 2)] -join "`n") | ConvertFrom-Json

    Assert-Test "Avatar upload returns HTTP 200" ($statusCode -eq 200)
    Assert-Test "Upload response returns avatar.type 'custom'" ($bodyJson.avatar.type -eq "custom")
    Assert-Test "Upload response returns avatar.hasCustomAvatar = true" ($bodyJson.avatar.hasCustomAvatar -eq $true)
    Assert-Test "Upload response contains avatarUrl with cache-busting version" ($bodyJson.avatarUrl -match "\?v=\d+")
} finally {
    if (Test-Path $tempPngFile) { Remove-Item $tempPngFile -Force }
}

# ------------------------------------------------------------------------------
# 5. Public Delivery of Uploaded Custom Avatar (WebP)
# ------------------------------------------------------------------------------
Write-Host "`n5. Verifying Delivery of Uploaded Custom Avatar (WebP)..." -ForegroundColor Yellow
$customHttp = Invoke-CurlHttp -Url "$baseUrl/api/v1/users/$userId/avatar" -Method "GET"

Assert-Test "Custom avatar delivery returns HTTP 200" ($customHttp.StatusCode -eq 200)
Assert-Test "Content-Type is image/webp" ($customHttp.Headers["content-type"] -eq "image/webp")
$customEtag = $customHttp.Headers["etag"]
Assert-Test "Custom avatar delivery includes ETag" ($null -ne $customEtag -and $customEtag.Length -gt 0)

if ($customEtag) {
    $conditionalWebp = Invoke-CurlHttp -Url "$baseUrl/api/v1/users/$userId/avatar" -Method "GET" -Headers @{ "If-None-Match" = $customEtag }
    Assert-Test "Custom avatar conditional request returns HTTP 304 Not Modified" ($conditionalWebp.StatusCode -eq 304)
}

# ------------------------------------------------------------------------------
# 6. Profile Retrieval Synchronicity via GET /api/v1/auth/me
# ------------------------------------------------------------------------------
Write-Host "`n6. Verifying Profile Retrieval Synchronicity (/api/v1/auth/me)..." -ForegroundColor Yellow
$meRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Method Get -Headers $headers

Assert-Test "GET /auth/me returns avatar.type 'custom'" ($meRes.avatar.type -eq "custom")
Assert-Test "GET /auth/me returns avatar.hasCustomAvatar = true" ($meRes.avatar.hasCustomAvatar -eq $true)
Assert-Test "GET /auth/me imageUrl matches canonical avatar URL" ($meRes.imageUrl -match "^/api/v1/users/$userId/avatar")
Assert-Test "GET /auth/me staff.photoUrl matches canonical avatar URL" ($meRes.staff.photoUrl -match "^/api/v1/users/$userId/avatar")

# ------------------------------------------------------------------------------
# 7. Auth Alias Route Verification via POST /api/v1/auth/me/avatar
# ------------------------------------------------------------------------------
Write-Host "`n7. Testing Auth Alias Route (POST /api/v1/auth/me/avatar)..." -ForegroundColor Yellow
$tempJpgFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "avatar-alias-$(Get-Random).jpg")
& bun -e "const sharp = require('sharp'); sharp({ create: { width: 300, height: 300, channels: 3, background: { r: 16, g: 185, b: 129 } } }).jpeg().toFile('$($tempJpgFile.Replace('\', '/'))')"

try {
    $aliasOutput = & curl.exe -s -w "\n%{http_code}" -X POST "$baseUrl/api/v1/auth/me/avatar" `
        -H "Authorization: Bearer $token" `
        -F "file=@$tempJpgFile;type=image/jpeg"
    
    $aliasLines = $aliasOutput -split "`n"
    $aliasStatus = [int]($aliasLines[-1].Trim())
    $aliasJson = ($aliasLines[0..($aliasLines.Length - 2)] -join "`n") | ConvertFrom-Json

    Assert-Test "Auth alias POST /auth/me/avatar returns HTTP 200" ($aliasStatus -eq 200)
    Assert-Test "Auth alias upload returns avatar.type 'custom'" ($aliasJson.avatar.type -eq "custom")
} finally {
    if (Test-Path $tempJpgFile) { Remove-Item $tempJpgFile -Force }
}

# ------------------------------------------------------------------------------
# 8. Avatar Deletion & Clean Reversion to Initials
# ------------------------------------------------------------------------------
Write-Host "`n8. Testing Avatar Deletion & Reversion to Initials (DELETE /api/v1/users/me/avatar)..." -ForegroundColor Yellow
$deleteRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/users/me/avatar" -Method Delete -Headers $headers
Assert-Test "DELETE /users/me/avatar returns success status" ($deleteRes.statusCode -eq 200)

# Verify subsequent GET /users/:id/avatar reverts back to SVG
$revertedHttp = Invoke-CurlHttp -Url "$baseUrl/api/v1/users/$userId/avatar" -Method "GET"
Assert-Test "Reverted delivery returns HTTP 200" ($revertedHttp.StatusCode -eq 200)
Assert-Test "Reverted delivery Content-Type is image/svg+xml" ($revertedHttp.Headers["content-type"] -match "image/svg\+xml")
Assert-Test "Reverted delivery body contains initials 'AS'" ($revertedHttp.Content -match "<text[^>]*>AS</text>")

# Verify subsequent GET /auth/me reflects initials state
$meReverted = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Method Get -Headers $headers
Assert-Test "Reverted /auth/me returns avatar.type 'initials'" ($meReverted.avatar.type -eq "initials")
Assert-Test "Reverted /auth/me returns avatar.hasCustomAvatar = false" ($meReverted.avatar.hasCustomAvatar -eq $false)

# ------------------------------------------------------------------------------
# Final Scorecard
# ------------------------------------------------------------------------------
Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " Avatar Lifecycle Verification Results: $passed Passed, $failed Failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "=================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
