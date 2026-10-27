$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

$patient = Login-Patient
$apiUrl = Get-E2EApiBaseUrl

Write-Host "Testing invalid input rejection on Appointment Creation..." -ForegroundColor Yellow
$badPayload = '{"poliklinikId":"not-uuid","layananId":"not-uuid","appointmentDate":"invalid-date","session":"invalid_shift","visitType":"invalid_type"}'

try {
    $res = Invoke-RestMethod -Uri "$apiUrl/appointments" -Method Post -Body $badPayload -ContentType 'application/json' -Headers $patient.headers
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

    if ($json.code -eq "VALIDATION_FAILED" -and $json.invalidParams.Count -ge 5) {
        Write-Host "`n[SUCCESS] ZodValidationPipe correctly rejected bad appointment creation schema input with RFC 7807 invalidParams!" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "`n[FAIL] Unexpected error structure" -ForegroundColor Red
        exit 1
    }
}
