<#
.SYNOPSIS
  Tampilkan dan simpan log docker compose.

.DESCRIPTION
  Mode snapshot (default): tampilkan N baris terakhir lalu selesai.
  Mode watch (-Watch)    : ikuti log secara live sampai Ctrl+C.
  Simpan (-Save/-Verbose): tulis semua baris ke file log bertimestamp,
                           misalnya logs\api-20261011-153045.log.
                           Setiap baris diawali timestamp ISO 8601.
                           Kode warna ANSI dibuang agar file bersih.

.EXAMPLE
  .\devlog.ps1                       # snapshot 100 baris terakhir
  .\devlog.ps1 -Watch                # live
  .\devlog.ps1 -Watch -Save          # live + simpan ke file
  .\devlog.ps1 -Watch -Verbose       # sama dengan -Save
  .\devlog.ps1 -Save -Keep 10        # simpan, sisakan 10 file log terbaru
  .\devlog.ps1 -Json                 # tampilan JSON pretty-print
  .\devlog.ps1 -Service worker -Tail 50
#>
[CmdletBinding()]
param(
  [string]$Service = 'api',
  [int]$Tail = 100,
  [switch]$Watch,
  [switch]$Json,
  [switch]$Save,
  [string]$LogDir = 'logs',
  [int]$Keep = 0
)

# -Verbose dipakai sebagai alias untuk -Save. Matikan output verbose bawaan
# supaya cmdlet lain tidak ikut mencetak pesan VERBOSE.
$SaveToFile = $Save.IsPresent -or [bool]$PSBoundParameters['Verbose']
$VerbosePreference = 'SilentlyContinue'

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Invariant = [System.Globalization.CultureInfo]::InvariantCulture

# Key yang nilainya disamarkan saat payload ditampilkan di layar.
$SensitiveKey = '(?i)^(pin|otp)$|pass(word|wd)?|token|secret|authorization|cookie|api[-_]?key'
$MaxPayloadChars = 600

# Pola escape sequence ANSI: warna/style (CSI), OSC, dan escape 2-byte lain.
$AnsiRegex = [regex]'\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1B]*(?:\x07|\x1B\\)|[@-Z\\-_])'

function Remove-Ansi {
  param([string]$Text)

  if ([string]::IsNullOrEmpty($Text)) { return $Text }
  $AnsiRegex.Replace($Text, '').TrimEnd("`r")
}

function Get-Stamp {
  (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss.fffzzz', $Invariant)
}

function Write-Log {
  param(
    [string]$Level,
    [string[]]$Lines,
    [ConsoleColor]$Color
  )

  $first = $true
  foreach ($line in $Lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }

    if ($first) {
      $prefix = $Level.PadRight(6)
      $first = $false
    }
    else {
      $prefix = ' ' * 6
    }

    Write-Host "$prefix $line" -ForegroundColor $Color
  }
}

function Hide-Secrets {
  param($Value)

  if ($null -eq $Value) { return $null }

  if ($Value -is [System.Management.Automation.PSCustomObject]) {
    $copy = [ordered]@{}
    foreach ($prop in $Value.PSObject.Properties) {
      if ($prop.Name -match $SensitiveKey) { $copy[$prop.Name] = '***' }
      else { $copy[$prop.Name] = Hide-Secrets $prop.Value }
    }
    return $copy
  }

  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string]) {
    $items = @()
    foreach ($item in $Value) { $items += , (Hide-Secrets $item) }
    return , $items
  }

  return $Value
}

function Hide-SecretsInText {
  param([string]$Text)

  $Text -replace '(?i)((?:pass\w*|token|secret|authorization)["'']?\s*[:=]\s*["'']?)[^"''&\s,}]+', '$1***'
}

function Limit-Text {
  param([string]$Text)

  if ($Text.Length -gt $MaxPayloadChars) {
    $Text.Substring(0, $MaxPayloadChars) + '...(truncated)'
  }
  else {
    $Text
  }
}

function Format-Payload {
  param($Value)

  if ($Value -is [string]) {
    try { $Value = $Value | ConvertFrom-Json -ErrorAction Stop }
    catch { return Limit-Text (Hide-SecretsInText $Value) }
  }

  Limit-Text (ConvertTo-Json -InputObject (Hide-Secrets $Value) -Depth 10 -Compress)
}

# Ambil body, query, dan params dari entri log (jika backend mencatatnya).
function Get-PayloadLines {
  param($Entry)

  $lines = @()
  $sources = [ordered]@{
    payload = @($Entry.body, $Entry.payload, $Entry.requestBody, $Entry.reqBody, $Entry.req.body)
    query   = @($Entry.query, $Entry.req.query)
    params  = @($Entry.params, $Entry.req.params)
  }

  foreach ($name in $sources.Keys) {
    foreach ($candidate in $sources[$name]) {
      if ($null -ne $candidate -and "$candidate" -ne '') {
        $text = Format-Payload $candidate
        if ($text) { $lines += "${name}: $text" }
        break
      }
    }
  }

  $lines
}

function Format-JsonLine {
  param([string]$Line)

  try {
    $Line | ConvertFrom-Json -ErrorAction Stop | ConvertTo-Json -Depth 100
  }
  catch {
    $Line
  }
}

function Format-LogLine {
  param([string]$Line)

  try {
    $log = $Line | ConvertFrom-Json -ErrorAction Stop

    $message = [string]$log.msg
    if (-not $message) { $message = [string]$log.message }
    if (-not $message -and $log.err) { $message = [string]$log.err.message }

    $method = [string]$log.method
    if (-not $method -and $log.req) { $method = [string]$log.req.method }

    $path = [string]$log.path
    if (-not $path) { $path = [string]$log.url }
    if (-not $path -and $log.req) { $path = [string]$log.req.url }

    $requestId = [string]$log.requestId
    if (-not $requestId -and $log.req) { $requestId = [string]$log.req.id }

    $level = 0
    [void][int]::TryParse([string]$log.level, [ref]$level)

    # HTTP response
    if ($null -ne $log.statusCode) {
      $code = [int]$log.statusCode

      if ($code -lt 400)     { $tag = 'OK';    $color = 'Green' }
      elseif ($code -lt 500) { $tag = 'WARN';  $color = 'Yellow' }
      else                   { $tag = 'ERROR'; $color = 'Red' }

      $route = "$method $path".Trim()
      $text = "$code  $route"
      if ($null -ne $log.durationMs) { $text += "  $($log.durationMs)ms" }
      if ($requestId)                { $text += "  id=$requestId" }

      $lines = @($text)
      if ($code -ge 400 -and $message) { $lines += $message }
      if ($code -ge 400) { $lines += Get-PayloadLines $log }

      Write-Log -Level $tag -Lines $lines -Color $color
    }
    # Error aplikasi
    elseif ($level -ge 50 -or $log.err) {
      $lines = @($message, $path)
      if ($requestId) { $lines += "id=$requestId" }
      $lines += Get-PayloadLines $log

      Write-Log -Level 'ERROR' -Lines $lines -Color Red
    }
    # Warning
    elseif ($level -ge 40) {
      Write-Log -Level 'WARN' -Lines @($message) -Color Yellow
    }
    # Aplikasi siap
    elseif ($message -match '(?i)\b(ready|listening|started|success|completed|connected)\b') {
      Write-Log -Level 'READY' -Lines @($message) -Color Green
    }
  }
  catch {
    # Baris non-JSON: tampilkan hanya error dan warning penting
    if ($Line -match '(?i)\b(error|fatal|exception|failed|ECONNREFUSED|ETIMEDOUT|panic)\b') {
      Write-Log -Level 'ERROR' -Lines @($Line.Trim()) -Color Red
    }
    elseif ($Line -match '(?i)\b(WARN|WARNING)\b') {
      Write-Log -Level 'WARN' -Lines @($Line.Trim()) -Color Yellow
    }
  }
}

# --- Siapkan file log (opsional) ---------------------------------------------

$writer = $null
$logFile = $null

if ($SaveToFile) {
  if (-not [System.IO.Path]::IsPathRooted($LogDir)) {
    $LogDir = Join-Path (Get-Location).Path $LogDir
  }
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

  $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss', $Invariant)
  $logFile = Join-Path $LogDir "$Service-$stamp.log"

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $writer = New-Object System.IO.StreamWriter($logFile, $false, $utf8NoBom)
  $writer.AutoFlush = $true

  # Retensi: sisakan $Keep file terbaru milik service ini (0 = simpan semua).
  if ($Keep -gt 0) {
    $pattern = '^' + [regex]::Escape($Service) + '-\d{8}-\d{6}\.log$'
    Get-ChildItem -Path $LogDir -File |
      Where-Object { $_.Name -match $pattern } |
      Sort-Object Name -Descending |
      Select-Object -Skip $Keep |
      Remove-Item -Force
  }
}

# --- Jalankan -----------------------------------------------------------------

$mode = if ($Watch) { 'watch' } else { 'snapshot' }
$target = if ($logFile) { $logFile } else { 'off' }
Write-Host "service=$Service mode=$mode tail=$Tail save=$target" -ForegroundColor DarkGray

$dockerArgs = @('compose', 'logs', "--tail=$Tail", '--no-log-prefix')
if ($Watch) { $dockerArgs += '-f' }
$dockerArgs += $Service

try {
  & docker @dockerArgs |
    ForEach-Object {
      # Buang kode warna ANSI dulu, baru dipakai untuk file maupun tampilan.
      $line = Remove-Ansi ([string]$_)

      if ($writer) { $writer.WriteLine("$(Get-Stamp) $line") }

      if ($Json) { Format-JsonLine $line }
      else       { Format-LogLine  $line }
    }
}
finally {
  if ($writer) {
    $writer.Dispose()
    Write-Host "log saved: $logFile" -ForegroundColor DarkGray
  }
}