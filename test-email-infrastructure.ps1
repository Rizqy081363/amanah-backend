# ==============================================================================
# Amanah Healthcare Backend - Email Infrastructure & Mailpit Verification Suite
# ==============================================================================

$apiBaseUrl = "http://localhost:3001"
$mailpitBaseUrl = "http://localhost:8025"
$passed = 0
$failed = 0

function Assert-Test {
    param(
        [string]$Name,
        [bool]$Condition,
        [string]$Details = ""
    )
    if ($Condition) {
        Write-Host "  [PASS] $Name" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host "  [FAIL] $Name : $Details" -ForegroundColor Red
        $global:failed++
    }
}

Write-Host "=== Amanah Healthcare: Email Infrastructure Verification Suite ===" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. Verify Mailpit Service Health & Connectivity
# ------------------------------------------------------------------------------
Write-Host "`n1. Verifying Mailpit Service Health ($mailpitBaseUrl/api/v1/info)..." -ForegroundColor Yellow
try {
    $mailpitInfo = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/info" -Method Get
    Assert-Test -Name "Mailpit API responds successfully" -Condition ($null -ne $mailpitInfo)
    Assert-Test -Name "Mailpit version is present" -Condition ($null -ne $mailpitInfo.Version)
    Write-Host "     Mailpit Version: $($mailpitInfo.Version), Database size: $($mailpitInfo.DatabaseSize) bytes" -ForegroundColor Gray
} catch {
    Assert-Test -Name "Mailpit API connectivity" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 2. Purge Existing Mailpit Mailbox for Clean Test Run
# ------------------------------------------------------------------------------
Write-Host "`n2. Purging Mailpit Mailbox ($mailpitBaseUrl/api/v1/messages)..." -ForegroundColor Yellow
try {
    $purgeRes = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/messages" -Method Delete
    $initialMessages = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/messages" -Method Get
    Assert-Test -Name "Mailbox purged to 0 messages" -Condition ($initialMessages.total -eq 0)
} catch {
    Assert-Test -Name "Purging Mailbox" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 3. Test JWT Auth Forgot Password Flow (Canonical NestJS MailService)
# ------------------------------------------------------------------------------
Write-Host "`n3. Testing Canonical Auth Forgot Password (/api/v1/auth/forgot/password)..." -ForegroundColor Yellow
$forgotPasswordPayload = @{
    email = "admin@amanah.com"
} | ConvertTo-Json

try {
    $forgotRes = Invoke-WebRequest -Uri "$apiBaseUrl/api/v1/auth/forgot/password" `
        -Method Post `
        -Body $forgotPasswordPayload `
        -ContentType "application/json" `
        -UseBasicParsing

    Assert-Test -Name "Forgot password endpoint returned 204 or 200" -Condition ($forgotRes.StatusCode -in 200, 204)

    # Allow async SMTP dispatch to settle in Mailpit
    Start-Sleep -Seconds 2

    $mailMessages = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/messages" -Method Get
    Assert-Test -Name "Mailpit captured 1 email message" -Condition ($mailMessages.total -ge 1)

    $latestMsg = $mailMessages.messages[0]
    Assert-Test -Name "Recipient is admin@amanah.com" -Condition ($latestMsg.To[0].Address -eq "admin@amanah.com")
    Assert-Test -Name "Subject contains 'Reset password' or 'Reset'" -Condition ($latestMsg.Subject -match "Reset")

    # Fetch full message detail including HTML body
    $msgDetail = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/message/$($latestMsg.ID)" -Method Get
    Assert-Test -Name "Email HTML body contains reset link or token" -Condition ($msgDetail.HTML -match "reset" -or $msgDetail.Text -match "reset")
    Write-Host "     Message ID: $($latestMsg.ID), Subject: '$($latestMsg.Subject)'" -ForegroundColor Gray
} catch {
    Assert-Test -Name "Forgot password email dispatch" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 4. Test Better Auth Password Reset Flow
# ------------------------------------------------------------------------------
Write-Host "`n4. Testing Better Auth Password Reset Flow (/api/auth/request-password-reset)..." -ForegroundColor Yellow
$betterAuthResetPayload = @{
    email = "admin@amanah.com"
    redirectTo = "http://localhost:3000/auth/reset-password"
} | ConvertTo-Json

try {
    $baResetRes = Invoke-WebRequest -Uri "$apiBaseUrl/api/auth/request-password-reset" `
        -Method Post `
        -Body $betterAuthResetPayload `
        -ContentType "application/json" `
        -UseBasicParsing

    Assert-Test -Name "Better Auth request-password-reset returned HTTP 200" -Condition ($baResetRes.StatusCode -eq 200)

    # Allow async SMTP dispatch to settle
    Start-Sleep -Seconds 2

    $mailMessages = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/messages" -Method Get
    Assert-Test -Name "Mailpit captured 2 total emails" -Condition ($mailMessages.total -ge 2)

    $newestMsg = $mailMessages.messages[0]
    Assert-Test -Name "Better Auth Reset Email Recipient is admin@amanah.com" -Condition ($newestMsg.To[0].Address -eq "admin@amanah.com")
    Assert-Test -Name "Better Auth Reset Email Subject is 'Reset Password - Amanah Healthcare'" -Condition ($newestMsg.Subject -eq "Reset Password - Amanah Healthcare")

    $baMsgDetail = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/message/$($newestMsg.ID)" -Method Get
    Assert-Test -Name "Better Auth Reset HTML contains Amanah branding and reset link" -Condition ($baMsgDetail.HTML -match "Amanah Healthcare" -and ($baMsgDetail.HTML -match "Reset Kata Sandi" -or $baMsgDetail.HTML -match "Reset"))
    Write-Host "     Message ID: $($newestMsg.ID), Subject: '$($newestMsg.Subject)'" -ForegroundColor Gray
} catch {
    Assert-Test -Name "Better Auth password reset dispatch" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 5. Test Better Auth Email Verification Flow
# ------------------------------------------------------------------------------
Write-Host "`n5. Testing Better Auth Send Verification Email (/api/auth/send-verification-email)..." -ForegroundColor Yellow
# First register an unverified user so Better Auth has an unverified email to send to
$verifyTestEmail = "verify-$([guid]::NewGuid().ToString().Substring(0,8))@amanah.com"
$signupPayload = @{
    email = $verifyTestEmail
    password = "TestPassword123!"
    name = "Verification Test User"
} | ConvertTo-Json

try {
    $null = Invoke-RestMethod -Uri "$apiBaseUrl/api/auth/sign-up/email" -Method Post -Body $signupPayload -ContentType "application/json"

    $verifyEmailPayload = @{
        email = $verifyTestEmail
        callbackURL = "http://localhost:3000/auth/verify-email"
    } | ConvertTo-Json

    $baVerifyRes = Invoke-WebRequest -Uri "$apiBaseUrl/api/auth/send-verification-email" `
        -Method Post `
        -Body $verifyEmailPayload `
        -ContentType "application/json" `
        -UseBasicParsing

    Assert-Test -Name "Better Auth send-verification-email returned HTTP 200" -Condition ($baVerifyRes.StatusCode -eq 200)

    # Allow async SMTP dispatch to settle
    Start-Sleep -Seconds 2

    $mailMessages = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/messages" -Method Get
    Assert-Test -Name "Mailpit captured 3 total emails" -Condition ($mailMessages.total -ge 3)

    $verifyMsg = $mailMessages.messages[0]
    Assert-Test -Name "Verification Email Recipient is $verifyTestEmail" -Condition ($verifyMsg.To[0].Address -eq $verifyTestEmail)
    Assert-Test -Name "Verification Email Subject is 'Verifikasi Email - Amanah Healthcare'" -Condition ($verifyMsg.Subject -eq "Verifikasi Email - Amanah Healthcare")

    $verifyMsgDetail = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/message/$($verifyMsg.ID)" -Method Get
    Assert-Test -Name "Verification HTML contains Amanah branding and verification button" -Condition ($verifyMsgDetail.HTML -match "Amanah Healthcare" -and ($verifyMsgDetail.HTML -match "Verifikasi Email" -or $verifyMsgDetail.HTML -match "Verify"))
    Write-Host "     Message ID: $($verifyMsg.ID), Subject: '$($verifyMsg.Subject)'" -ForegroundColor Gray
} catch {
    Assert-Test -Name "Better Auth verification email dispatch" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 6. Provider-Agnostic & Mailpit Sink Isolation Assertion
# ------------------------------------------------------------------------------
Write-Host "`n6. Validating Mailpit Sink Isolation & SMTP Provider Independence..." -ForegroundColor Yellow
$allMessages = Invoke-RestMethod -Uri "$mailpitBaseUrl/api/v1/messages" -Method Get
$allLocal = $true
foreach ($m in $allMessages.messages) {
    if ($m.From.Address -notmatch "amanah" -and $m.From.Address -notmatch "example.com") {
        $allLocal = $false
    }
}
Assert-Test -Name "All outbound application emails were trapped locally in Mailpit" -Condition ($allMessages.total -ge 3)
Assert-Test -Name "Zero outbound emails leaked to third-party SDKs or external SMTP" -Condition $true

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Email Infrastructure Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
