$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

$admin = Login-Admin
$apiUrl = Get-E2EApiBaseUrl

Write-Host "Testing invalid input rejection on Reschedule..." -ForegroundColor Yellow
$badPayload = '{"target_date":"not-a-date","session":"invalid_shift"}'

try {
    $res = Invoke-RestMethod -Uri "$apiUrl/appointments/3fcde615-060b-4b5b-9deb-91e7d1dd8f96/reschedule" -Method Post -Body $badPayload -ContentType 'application/json' -Headers $admin.headers
    Write-Host "UNEXPECTED: Endpoint accepted invalid payload!" -ForegroundColor Red
    exit 1
} catch {
    $rawResponse = $_.ErrorDetails.Message
    if (-not $rawResponse -and $_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        if ($stream.CanSeek) { $stream.Position = 0 }
        $reader = [System.IO.StreamReader]::new($stream)
        $rawResponse = $reader.ReadToEnd()
    }

    Write-Host "HTTP Status: $([int]$_.Exception.Response.StatusCode)" -ForegroundColor Green
    Write-Host "Response Body:" -ForegroundColor Cyan
    Write-Host $rawResponse

    $json = $rawResponse | ConvertFrom-Json
    Write-Host "Code: $($json.code)" -ForegroundColor Green
    Write-Host "Title: $($json.title)" -ForegroundColor Green
    Write-Host "Invalid params count: $($json.invalidParams.Count)" -ForegroundColor Green
    foreach ($p in $json.invalidParams) {
        Write-Host "  - $($p.name): $($p.reason) (code: $($p.code))" -ForegroundColor Yellow
    }

    if ($json.code -eq "VALIDATION_FAILED" -and $json.invalidParams.Count -ge 2) {
        Write-Host "`n[SUCCESS] ZodValidationPipe correctly rejected bad schema input with RFC 7807 invalidParams!" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "`n[FAIL] Unexpected error structure" -ForegroundColor Red
        exit 1
    }
}
