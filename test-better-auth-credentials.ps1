# ==============================================================================
# Amanah Healthcare Backend - Better Auth & Demo Credentials Verification Suite
# ==============================================================================

$baseUrl = "http://localhost:3001"
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

Write-Host "=== Amanah Healthcare: Better Auth & Persistent Demo Credentials Suite ===" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1. Admin Demo Login via Better Auth
# ------------------------------------------------------------------------------
Write-Host "`n1. Testing Admin Demo Login via Better Auth (/api/auth/sign-in/email)..." -ForegroundColor Yellow
$adminLoginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

try {
    $adminRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/sign-in/email" -Method Post -Body $adminLoginBody -ContentType "application/json"
    $adminToken = $adminRes.token
    $adminUser = $adminRes.user

    Assert-Test -Name "Admin login returns auth token" -Condition ($null -ne $adminToken -and $adminToken.Length -gt 10)
    Assert-Test -Name "Admin user email is admin@amanah.com" -Condition ($adminUser.email -eq "admin@amanah.com")
    Assert-Test -Name "Admin user role is 'admin'" -Condition ($adminUser.role -eq "admin")
    Assert-Test -Name "Admin email is marked verified" -Condition ($adminUser.emailVerified -eq $true)
} catch {
    Assert-Test -Name "Admin login" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 2. Admin Session Retrieval via Bearer Token
# ------------------------------------------------------------------------------
Write-Host "`n2. Testing Admin Session Retrieval (/api/auth/get-session)..." -ForegroundColor Yellow
try {
    $sessionRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/get-session" -Method Get -Headers @{ Authorization = "Bearer $adminToken" }
    Assert-Test -Name "Get-session returns valid session object" -Condition ($null -ne $sessionRes.session)
    Assert-Test -Name "Session user matches admin" -Condition ($sessionRes.user.email -eq "admin@amanah.com")
    Assert-Test -Name "Session user role is admin" -Condition ($sessionRes.user.role -eq "admin")
} catch {
    Assert-Test -Name "Admin session retrieval" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 3. Admin Access to Better Auth Admin Plugin API
# ------------------------------------------------------------------------------
Write-Host "`n3. Testing Admin Access to Better Auth Admin API (/api/auth/admin/list-users)..." -ForegroundColor Yellow
try {
    $adminListRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/admin/list-users" -Method Get -Headers @{ Authorization = "Bearer $adminToken" }
    Assert-Test -Name "Admin list-users returns users list" -Condition ($null -ne $adminListRes.users -and $adminListRes.users.Count -gt 0)
} catch {
    Assert-Test -Name "Admin list-users" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 4. Patient Demo Login via Better Auth
# ------------------------------------------------------------------------------
Write-Host "`n4. Testing Patient Demo Login via Better Auth (/api/auth/sign-in/email)..." -ForegroundColor Yellow
$patientLoginBody = @{
    email = "pasien@amanah.com"
    password = "secret123"
} | ConvertTo-Json

try {
    $patientRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/sign-in/email" -Method Post -Body $patientLoginBody -ContentType "application/json"
    $patientToken = $patientRes.token
    $patientUser = $patientRes.user

    Assert-Test -Name "Patient login returns auth token" -Condition ($null -ne $patientToken -and $patientToken.Length -gt 10)
    Assert-Test -Name "Patient user email is pasien@amanah.com" -Condition ($patientUser.email -eq "pasien@amanah.com")
    Assert-Test -Name "Patient user role is 'patient'" -Condition ($patientUser.role -eq "patient")
    Assert-Test -Name "Patient user name is 'Dewi Lestari'" -Condition ($patientUser.name -eq "Dewi Lestari")
} catch {
    Assert-Test -Name "Patient login" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 5. Patient Session Retrieval
# ------------------------------------------------------------------------------
Write-Host "`n5. Testing Patient Session Retrieval (/api/auth/get-session)..." -ForegroundColor Yellow
try {
    $patSessionRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/get-session" -Method Get -Headers @{ Authorization = "Bearer $patientToken" }
    Assert-Test -Name "Patient get-session returns valid session" -Condition ($null -ne $patSessionRes.session)
    Assert-Test -Name "Patient session user matches pasien@amanah.com" -Condition ($patSessionRes.user.email -eq "pasien@amanah.com")
} catch {
    Assert-Test -Name "Patient session retrieval" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# 6. Patient RBAC Denial on Admin API
# ------------------------------------------------------------------------------
Write-Host "`n6. Testing RBAC Denial for Patient on Admin Endpoint (/api/auth/admin/list-users)..." -ForegroundColor Yellow
try {
    $forbiddenRes = Invoke-RestMethod -Uri "$baseUrl/api/auth/admin/list-users" -Method Get -Headers @{ Authorization = "Bearer $patientToken" }
    Assert-Test -Name "Patient should be denied admin access" -Condition $false -Details "Request unexpectedly succeeded"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test -Name "Patient is blocked with 403 Forbidden" -Condition ($statusCode -eq 403)
}

# ------------------------------------------------------------------------------
# 7. Backward Compatibility: NestJS JWT Auth Login
# ------------------------------------------------------------------------------
Write-Host "`n7. Testing Backward-Compatible JWT Login (/api/v1/auth/email/login)..." -ForegroundColor Yellow
try {
    $jwtAdminRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
    Assert-Test -Name "Admin JWT login returns JWT token" -Condition ($null -ne $jwtAdminRes.token -and $jwtAdminRes.token.Length -gt 20)
    Assert-Test -Name "Admin JWT login user id matches canonical" -Condition ($jwtAdminRes.user.email -eq "admin@amanah.com")

    $jwtPatientRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $patientLoginBody -ContentType "application/json"
    Assert-Test -Name "Patient JWT login returns JWT token" -Condition ($null -ne $jwtPatientRes.token -and $jwtPatientRes.token.Length -gt 20)
    Assert-Test -Name "Patient JWT login user id matches canonical" -Condition ($jwtPatientRes.user.email -eq "pasien@amanah.com")

    # Verify /api/v1/auth/me
    $jwtMeRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Method Get -Headers @{ Authorization = "Bearer $($jwtAdminRes.token)" }
    Assert-Test -Name "JWT /me returns current user profile" -Condition ($jwtMeRes.email -eq "admin@amanah.com")
} catch {
    Assert-Test -Name "JWT Auth compatibility" -Condition $false -Details $_.Exception.Message
}

# ------------------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------------------
Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
