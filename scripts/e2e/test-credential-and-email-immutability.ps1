# ==============================================================================
# AMANAH HEALTHCARE BACKEND - CREDENTIAL, EMAIL IMMUTABILITY & AVATAR VERIFICATION
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

Write-Host "=== 1. Authentication Setup ===" -ForegroundColor Cyan
# 1.1 Login as Admin
$adminAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$adminToken = $adminAuth.token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }

# 1.2 Login as Staff Doctor
$doctorAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = "dokter@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$doctorToken = $doctorAuth.token
$doctorHeaders = @{ "Authorization" = "Bearer $doctorToken" }
$doctorId = $doctorAuth.user.id
$staffId = $doctorAuth.user.staff.id

Assert-Test "Admin and Doctor tokens acquired" ($adminToken.Length -gt 20 -and $doctorToken.Length -gt 20)

Write-Host "`n=== 2. Email Immutability Verification ===" -ForegroundColor Cyan
# 2.1 Attempt to change email via PATCH /api/v1/auth/me should be rejected with 400 Bad Request
$emailChangeAttempt = $null
$emailChangeCode = 0
$emailErrorMessage = ""
try {
    $body = @{ email = "new-email-hacked@amanah.com"; firstName = "Ahmad Updated" } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Method Patch -Body $body -ContentType "application/json" -Headers $doctorHeaders
    $emailChangeCode = 200
} catch {
    $emailChangeCode = [int]$_.Exception.Response.StatusCode
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $emailErrorMessage = $_.ErrorDetails.Message
    } elseif ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            if ($stream) {
                $reader = [System.IO.StreamReader]::new($stream)
                $emailErrorMessage = $reader.ReadToEnd()
            }
        } catch {}
    }
}

Assert-Test "Attempt to change email is rejected with HTTP 400" ($emailChangeCode -eq 400)
Assert-Test "Error message states email is permanent/immutable" ($emailErrorMessage -like "*Alamat email akun bersifat permanen dan tidak dapat diubah*")

# 2.2 Updating non-email fields succeeds
$profileUpdateBody = @{ firstName = "dr. Ahmad"; lastName = "Santoso, Sp.A" } | ConvertTo-Json
$profileUpdateRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Method Patch -Body $profileUpdateBody -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Updating non-email fields via PATCH /auth/me succeeds" ($null -ne $profileUpdateRes.id)

Write-Host "`n=== 3. Staff Credentials Endpoints (Mobile / Me) ===" -ForegroundColor Cyan
# 3.1 Get credentials for me
$credsBefore = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs/me/credentials" -Method Get -Headers $doctorHeaders
Assert-Test "GET /api/v1/staffs/me/credentials returns array" ($credsBefore -is [array] -or $null -ne $credsBefore)

# 3.2 Create new credential for me
$newCredBody = @{
    credentialType = "sip"
    credentialNumber = "SIP-TEST-999-E2E"
    issuer = "Dinas Kesehatan DKI Jakarta"
    issuedAt = "2024-01-01"
    expiresAt = "2029-01-01"
} | ConvertTo-Json

$createdCred = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs/me/credentials" -Method Post -Body $newCredBody -ContentType "application/json" -Headers $doctorHeaders
$credId = $createdCred.id
Assert-Test "POST /api/v1/staffs/me/credentials creates credential" ($null -ne $credId -and $createdCred.credentialNumber -eq "SIP-TEST-999-E2E")

# 3.3 Update newly created credential via PATCH /api/v1/staffs/me/credentials/:credentialId
$updateCredBody = @{
    credentialNumber = "SIP-TEST-999-REVISED"
    issuer = "Kemenkes RI"
    status = "expired"
} | ConvertTo-Json

$updatedCred = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs/me/credentials/$credId" -Method Patch -Body $updateCredBody -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "PATCH /api/v1/staffs/me/credentials/:credentialId updates credential" ($updatedCred.credentialNumber -eq "SIP-TEST-999-REVISED" -and $updatedCred.issuer -eq "Kemenkes RI" -and $updatedCred.status -eq "expired")

# 3.4 Delete credential via DELETE /api/v1/staffs/me/credentials/:credentialId
$deleteStatus = curl.exe -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $doctorToken" "$baseUrl/api/v1/staffs/me/credentials/$credId"
Assert-Test "DELETE /api/v1/staffs/me/credentials/:credentialId succeeds (204 No Content)" ($deleteStatus -eq "204")

Write-Host "`n=== 4. Staff Profile Self-Update (PATCH /api/v1/staffs/me) ===" -ForegroundColor Cyan
$staffUpdateBody = @{
    phoneNumber = "081299988877"
    fullName = "dr. Ahmad Santoso, Sp.A"
} | ConvertTo-Json

$updatedStaff = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs/me" -Method Patch -Body $staffUpdateBody -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "PATCH /api/v1/staffs/me updates staff profile" ($updatedStaff.phoneNumber -eq "081299988877" -and $updatedStaff.fullName -eq "dr. Ahmad Santoso, Sp.A")

Write-Host "`n=== 5. Web Admin Upload Avatar for Specific Doctor / Staff ===" -ForegroundColor Cyan
# Generate a test png
$tempAdminPng = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "admin-avatar-test-$(Get-Random).png")
& bun -e "const sharp = require('sharp'); sharp({ create: { width: 350, height: 350, channels: 3, background: { r: 124, g: 58, b: 237 } } }).png().toFile('$($tempAdminPng.Replace('\', '/'))')"

try {
    # 5.1 Admin uploads avatar by userId: PATCH /api/v1/users/:id/avatar
    $adminUploadOutput = & curl.exe -s -w "\n%{http_code}" -X PATCH "$baseUrl/api/v1/users/$doctorId/avatar" `
        -H "Authorization: Bearer $adminToken" `
        -F "file=@$tempAdminPng;type=image/png"
    
    $lines = $adminUploadOutput -split "`n"
    $statusCode = [int]($lines[-1].Trim())
    $bodyJson = ($lines[0..($lines.Length - 2)] -join "`n") | ConvertFrom-Json

    Assert-Test "Admin PATCH /api/v1/users/:id/avatar returns HTTP 200" ($statusCode -eq 200)
    Assert-Test "Admin upload returns avatar.hasCustomAvatar = true" ($bodyJson.avatar.hasCustomAvatar -eq $true)

    # 5.2 Admin uploads avatar by staffId: PATCH /api/v1/staffs/:id/avatar
    $staffUploadOutput = & curl.exe -s -w "\n%{http_code}" -X PATCH "$baseUrl/api/v1/staffs/$staffId/avatar" `
        -H "Authorization: Bearer $adminToken" `
        -F "file=@$tempAdminPng;type=image/png"
    
    $staffLines = $staffUploadOutput -split "`n"
    $staffStatusCode = [int]($staffLines[-1].Trim())
    $staffBodyJson = ($staffLines[0..($staffLines.Length - 2)] -join "`n") | ConvertFrom-Json

    Assert-Test "Admin PATCH /api/v1/staffs/:id/avatar returns HTTP 200" ($staffStatusCode -eq 200)
    Assert-Test "Staff upload returns avatar.hasCustomAvatar = true" ($staffBodyJson.avatar.hasCustomAvatar -eq $true)
} finally {
    if (Test-Path $tempAdminPng) { Remove-Item $tempAdminPng -Force }
}

Write-Host "`n=== 6. Newly Created Doctor Has Zero Ghost Schedules ===" -ForegroundColor Cyan
# Check newly created doctor (e.g. mobile test doctor) in admin overview
$overviewRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?search=mobile%20test" -Method Get -Headers $adminHeaders
if ($overviewRes.data.doctors.Count -ge 1) {
    $mobileDoc = $overviewRes.data.doctors[0]
    Assert-Test "Newly created doctor has 0 available slots and 0 capacity (No ghost data)" ($mobileDoc.slot_tersedia -eq 0 -and $mobileDoc.kapasitas_per_hari -eq 0)
} else {
    Write-Host " [INFO] Mobile test doctor not found in overview search, skipping ghost assertion" -ForegroundColor Yellow
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Credential & Avatar Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
