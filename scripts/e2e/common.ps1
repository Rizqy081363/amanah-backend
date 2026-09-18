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
        return $explicit.TrimEnd('/')
    }

    $backendDomain = Get-ConfigValue "BACKEND_DOMAIN"
    if (-not [string]::IsNullOrWhiteSpace($backendDomain)) {
        return $backendDomain.TrimEnd('/')
    }

    $apiPort = Get-ConfigValue "API_HOST_PORT" (Get-ConfigValue "APP_PORT" "3001")
    return "http://localhost:$apiPort"
}

function Get-E2EApiBaseUrl {
    $explicit = Get-ConfigValue "E2E_API_BASE_URL"
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return $explicit.TrimEnd('/')
    }

    return "$(Get-E2EBaseUrl)/api/v1"
}

function Get-E2EMailpitBaseUrl {
    $explicit = Get-ConfigValue "E2E_MAILPIT_BASE_URL"
    if (-not [string]::IsNullOrWhiteSpace($explicit)) {
        return $explicit.TrimEnd('/')
    }

    $mailpitPort = Get-ConfigValue "MAILPIT_HOST_PORT" (Get-ConfigValue "MAILPIT_PORT" "8025")
    return "http://localhost:$mailpitPort"
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
