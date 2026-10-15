$ErrorActionPreference = 'Stop'

function Get-DotEnvValue([string]$name) {
    $envFiles = @(
        (Join-Path (Resolve-Path "$PSScriptRoot\..\..") ".env"),
        (Join-Path (Resolve-Path "$PSScriptRoot\..\..") ".env.example")
    )

    foreach ($envFile in $envFiles) {
        if (-not (Test-Path -LiteralPath $envFile)) {
            continue
        }

        $line = Get-Content -LiteralPath $envFile |
            Where-Object { $_ -match "^\s*$([regex]::Escape($name))\s*=" } |
            Select-Object -First 1

        if ($line) {
            $value = ($line -replace "^\s*$([regex]::Escape($name))\s*=\s*", "").Trim()
            return $value.Trim('"').Trim("'")
        }
    }

    return $null
}

function Get-ConfigValue([string]$name, [string]$defaultValue = "") {
    $envValue = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue.Trim()
    }

    $fileValue = Get-DotEnvValue $name
    if (-not [string]::IsNullOrWhiteSpace($fileValue)) {
        return $fileValue.Trim()
    }

    return $defaultValue
}

function Get-E2EBaseUrl {
    $explicit = Get-ConfigValue "E2E_BASE_URL"
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return ($explicit -replace '^http://localhost', 'http://127.0.0.1').TrimEnd('/')
    }

    $backendDomain = Get-ConfigValue "BACKEND_DOMAIN"
    if (-not [string]::IsNullOrWhiteSpace($backendDomain)) {
        return ($backendDomain -replace '^http://localhost', 'http://127.0.0.1').TrimEnd('/')
    }

    $apiPort = Get-ConfigValue "API_HOST_PORT" (Get-ConfigValue "APP_PORT" "3001")
    return "http://127.0.0.1:$apiPort"
}

function Get-E2EApiBaseUrl {
    $explicit = Get-ConfigValue "E2E_API_BASE_URL"
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return ($explicit -replace '^http://localhost', 'http://127.0.0.1').TrimEnd('/')
    }

    return "$(Get-E2EBaseUrl)/api/v1"
}

function Get-E2EMailpitBaseUrl {
    $explicit = Get-ConfigValue "E2E_MAILPIT_BASE_URL"
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return ($explicit -replace '^http://localhost', 'http://127.0.0.1').TrimEnd('/')
    }

    $mailpitPort = Get-ConfigValue "MAILPIT_HOST_PORT" (Get-ConfigValue "MAILPIT_PORT" "8025")
    return "http://127.0.0.1:$mailpitPort"
}

function Wait-E2EApiReady([string]$url = (Get-E2EBaseUrl), [int]$timeoutSeconds = 60) {
    $deadline = (Get-Date).AddSeconds($timeoutSeconds)
    $lastError = ""

    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "$($url.TrimEnd('/'))/health/ready" -Method Get -TimeoutSec 5
            if ($health.status -eq "up") {
                return
            }
            $lastError = "health/ready returned status '$($health.status)'"
        } catch {
            $lastError = $_.Exception.Message
        }

        Start-Sleep -Seconds 2
    }

    throw "API is not reachable at $url after ${timeoutSeconds}s. Last error: $lastError. Check docker-compose ps -a and docker-compose logs api."
}

# ------------------------------------------------------------------------------
# CENTRALIZED ASSERTION ENGINE & COUNTERS
# ------------------------------------------------------------------------------
$global:E2EPassCount = 0
$global:E2EFailCount = 0

function Assert-Test([string]$name, [bool]$condition, [string]$details = "") {
    if ($condition) {
        Write-Host " [PASS] $name" -ForegroundColor Green
        $global:E2EPassCount++
    } else {
        Write-Host " [FAIL] $name - $details" -ForegroundColor Red
        $global:E2EFailCount++
        throw "Assertion Failed: $name. Details: $details"
    }
}

function Reset-TestCounters {
    $global:E2EPassCount = 0
    $global:E2EFailCount = 0
}

function Print-TestSummary([string]$suiteName = "Test Suite") {
    Write-Host "`n==============================================================================" -ForegroundColor Cyan
    Write-Host " $suiteName - RESULT SUMMARY" -ForegroundColor Cyan
    Write-Host " Passed: $global:E2EPassCount | Failed: $global:E2EFailCount" -ForegroundColor $(if ($global:E2EFailCount -eq 0) { "Green" } else { "Red" })
    Write-Host "==============================================================================" -ForegroundColor Cyan
    if ($global:E2EFailCount -gt 0) {
        throw "$suiteName failed with $global:E2EFailCount error(s)."
    }
}

# ------------------------------------------------------------------------------
# CANONICAL CREDENTIAL SOURCES
# ------------------------------------------------------------------------------
function Get-AdminCredentials {
    return @{
        email = "admin@amanah.com"
        password = "secret123"
    }
}

function Get-DoctorCredentials {
    return @{
        email = "dokter@amanah.com"
        password = "secret123"
    }
}

function Get-PatientCredentials {
    return @{
        email = "pasien@amanah.com"
        password = "secret123"
    }
}

# ------------------------------------------------------------------------------
# AUTHENTICATION HELPERS
# ------------------------------------------------------------------------------
function Login-User([string]$email, [string]$password) {
    $apiUrl = Get-E2EApiBaseUrl
    $payload = @{
        email = $email
        password = $password
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$apiUrl/auth/email/login" -Method Post -Body $payload -ContentType "application/json"
    $token = $res.token

    return @{
        token = $token
        user = $res.user
        headers = @{
            Authorization = "Bearer $token"
            "Content-Type" = "application/json"
        }
    }
}

function Login-Admin {
    $cred = Get-AdminCredentials
    return Login-User $cred.email $cred.password
}

function Login-Doctor {
    $cred = Get-DoctorCredentials
    return Login-User $cred.email $cred.password
}

function Login-Patient {
    $cred = Get-PatientCredentials
    return Login-User $cred.email $cred.password
}

# ------------------------------------------------------------------------------
# API RESPONSE DATA EXTRACTOR
# ------------------------------------------------------------------------------
function Get-ResponseData($response) {
    if ($response -is [System.Management.Automation.PSCustomObject] -and $response.PSObject.Properties['data']) {
        return $response.data
    }
    return $response
}

# ------------------------------------------------------------------------------
# CENTRALIZED DOCKER CONTAINER RESOLUTION (INDUSTRY CANONICAL STANDARD)
# ------------------------------------------------------------------------------
function Get-E2EPostgresContainerName {
    # 1. Explicit Environment Override
    $explicit = Get-ConfigValue "E2E_POSTGRES_CONTAINER"
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return $explicit.Trim()
    }

    # 2. Dynamic Auto-Detection of Active PostgreSQL Container
    try {
        $detected = docker ps --filter "name=postgres" --filter "status=running" --format "{{.Names}}" 2>$null | Select-Object -First 1
        if (-not [string]::IsNullOrWhiteSpace($detected)) {
            return $detected.Trim()
        }
    } catch {}

    # 3. Canonical Default
    return "backend-postgres-1"
}

# ------------------------------------------------------------------------------
# DIRECT DOCKER POSTGRESQL QUERY HELPER
# ------------------------------------------------------------------------------
function Run-DockerSql([string]$sql, [string]$container = "", [string]$user = "amanah", [string]$db = "amanah_healthcare") {
    if ([string]::IsNullOrWhiteSpace($container)) {
        $container = Get-E2EPostgresContainerName
    }
    $cleanSql = $sql -replace "`r`n", " " -replace "`n", " "
    $cmd = "docker exec -i $container psql -U $user -d $db -t -A -c `"$cleanSql`""
    $res = Invoke-Expression $cmd
    return $res
}

