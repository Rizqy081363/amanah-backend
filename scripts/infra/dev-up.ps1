param(
    [switch]$Build,
    [switch]$SkipPortCheck
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path "$PSScriptRoot\..\.."

function Read-EnvFile([string]$path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $path) {
        if ($line -match '^\s*$' -or $line -match '^\s*#') {
            continue
        }
        if ($line -notmatch '^\s*([^=]+?)\s*=\s*(.*)\s*$') {
            continue
        }

        $key = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        $values[$key] = $value
    }

    return $values
}

$defaults = Read-EnvFile (Join-Path $repoRoot ".env.example")
$local = Read-EnvFile (Join-Path $repoRoot ".env")

function Get-InfraValue([string]$name, [string]$defaultValue) {
    $envValue = [Environment]::GetEnvironmentVariable($name)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }
    if ($local.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($local[$name])) {
        return $local[$name]
    }
    if ($defaults.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($defaults[$name])) {
        return $defaults[$name]
    }
    return $defaultValue
}

function Get-ComposeCommand {
    try {
        $null = & docker compose version 2>$null
        if ($LASTEXITCODE -eq 0) {
            return @("docker", "compose")
        }
    } catch {
        # Fall through to docker-compose.
    }

    try {
        $null = & docker-compose version 2>$null
        if ($LASTEXITCODE -eq 0) {
            return @("docker-compose")
        }
    } catch {
        # Report below.
    }

    throw "Docker Compose was not found. Install Docker Desktop or make docker-compose available on PATH."
}

function Invoke-Compose([string[]]$arguments) {
    $compose = Get-ComposeCommand
    $exe = $compose[0]
    $prefixArgs = @()
    if ($compose.Count -gt 1) {
        $prefixArgs = $compose[1..($compose.Count - 1)]
    }

    & $exe @prefixArgs @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose command failed: $($compose -join ' ') $($arguments -join ' ')"
    }
}

function Test-PortListening([int]$port) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        return $null -ne $connections
    } catch {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $iar = $client.BeginConnect("127.0.0.1", $port, $null, $null)
            $connected = $iar.AsyncWaitHandle.WaitOne(250, $false)
            if ($connected) {
                $client.EndConnect($iar)
            }
            return $connected
        } catch {
            return $false
        } finally {
            $client.Dispose()
        }
    }
}

$ports = [ordered]@{
    API_HOST_PORT = Get-InfraValue "API_HOST_PORT" "3001"
    POSTGRES_HOST_PORT = Get-InfraValue "POSTGRES_HOST_PORT" "5433"
    REDIS_HOST_PORT = Get-InfraValue "REDIS_HOST_PORT" "6379"
    SMTP_HOST_PORT = Get-InfraValue "SMTP_HOST_PORT" "1025"
    MAILPIT_HOST_PORT = Get-InfraValue "MAILPIT_HOST_PORT" "8025"
    ADMINER_HOST_PORT = Get-InfraValue "ADMINER_HOST_PORT" "8080"
}

function Set-DefaultProcessEnv([string]$name, [string]$value) {
    $envValue = [Environment]::GetEnvironmentVariable($name)
    $localValue = if ($local.ContainsKey($name)) { $local[$name] } else { $null }
    $defaultValue = if ($defaults.ContainsKey($name)) { $defaults[$name] } else { $null }

    if (
        [string]::IsNullOrWhiteSpace($envValue) -and
        (
            -not $local.ContainsKey($name) -or
            $localValue -eq $defaultValue
        )
    ) {
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

Set-DefaultProcessEnv "BACKEND_DOMAIN" "http://localhost:$($ports.API_HOST_PORT)"
Set-DefaultProcessEnv "BETTER_AUTH_URL" "http://localhost:$($ports.API_HOST_PORT)"
Set-DefaultProcessEnv "E2E_BASE_URL" "http://localhost:$($ports.API_HOST_PORT)"
Set-DefaultProcessEnv "E2E_MAILPIT_BASE_URL" "http://localhost:$($ports.MAILPIT_HOST_PORT)"

$args = @("up", "-d")
if ($Build) {
    $args += "--build"
}

Push-Location $repoRoot
try {
    if (-not $SkipPortCheck) {
        $existingContainers = @()
        try {
            $existingContainers = Invoke-Compose @("ps", "-q") 2>$null
        } catch {
            $existingContainers = @()
        }

        if (-not $existingContainers) {
            $conflicts = @()
            foreach ($entry in $ports.GetEnumerator()) {
                $portNumber = [int]$entry.Value
                if (Test-PortListening $portNumber) {
                    $conflicts += "$($entry.Key)=$portNumber"
                }
            }

            if ($conflicts.Count -gt 0) {
                throw "Port conflict detected: $($conflicts -join ', '). Update these variables in .env, then rerun bun run infra:up."
            }
        }
    }

    Invoke-Compose $args

    $baseUrl = Get-InfraValue "E2E_BASE_URL" (Get-InfraValue "BACKEND_DOMAIN" "http://localhost:$($ports.API_HOST_PORT)")
    $deadline = (Get-Date).AddSeconds([int](Get-InfraValue "WAIT_TIMEOUT_SECONDS" "60"))
    $lastError = ""

    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "$($baseUrl.TrimEnd('/'))/health/ready" -Method Get -TimeoutSec 5
            if ($health.status -eq "up") {
                Write-Host "Amanah infrastructure is ready at $baseUrl" -ForegroundColor Green
                exit 0
            }
            $lastError = "health/ready returned status '$($health.status)'"
        } catch {
            $lastError = $_.Exception.Message
        }

        Start-Sleep -Seconds 2
    }

    throw "Containers started, but API did not become ready at $baseUrl. Last error: $lastError"
} finally {
    Pop-Location
}
