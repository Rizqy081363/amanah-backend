$ErrorActionPreference = "Continue"
$BaseUrl = "http://localhost:3001"
$passed = 0
$failed = 0

function Assert-Test([string]$description, [bool]$condition) {
    if ($condition) {
        Write-Host " [PASS] $description" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $description" -ForegroundColor Red
        $global:failed++
    }
}

function Get-BodyJson($response) {
    $content = $response.Content
    if ($content -is [byte[]]) {
        $content = [System.Text.Encoding]::UTF8.GetString($content)
    }
    if ([string]::IsNullOrWhiteSpace($content)) {
        return $null
    }
    return ($content | ConvertFrom-Json)
}

function Get-HeaderVal($response, [string]$headerName) {
    $val = $response.Headers[$headerName]
    if ($null -eq $val) {
        return ""
    }
    if ($val -is [System.Collections.IEnumerable] -and -not ($val -is [string])) {
        foreach ($item in $val) {
            return [string]$item
        }
    }
    return [string]$val
}

Write-Host "=== Phase 2: Distributed Idempotency Verification ===" -ForegroundColor Cyan

# 1. Normal Request without Idempotency-Key (Pass-through)
Write-Host "`n--- 1. Normal Request without Idempotency-Key ---" -ForegroundColor Yellow
$loginBody = '{"email":"admin@amanah.com","password":"secret123"}'
$res1 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json" `
    -SkipHttpErrorCheck

$is200 = $res1.StatusCode -eq 200
$replay1 = Get-HeaderVal $res1 "Idempotent-Replay"
Assert-Test "Normal request succeeds with 200 OK" $is200
Assert-Test "Normal request without Idempotency-Key has no Idempotent-Replay header" ([string]::IsNullOrEmpty($replay1))

# 2. First Execution with Idempotency-Key
Write-Host "`n--- 2. First Request with Idempotency-Key ---" -ForegroundColor Yellow
$key1 = "idemp-key-" + (Get-Random)
$res2 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $key1 } `
    -SkipHttpErrorCheck

$is200_2 = $res2.StatusCode -eq 200
$replay2 = Get-HeaderVal $res2 "Idempotent-Replay"
Assert-Test "First execution with Idempotency-Key returns 200 OK" $is200_2
Assert-Test "First execution does not have Idempotent-Replay header" ([string]::IsNullOrEmpty($replay2))

# 3. Repeated Request with IDENTICAL Idempotency-Key and IDENTICAL Payload (API-141)
Write-Host "`n--- 3. Repeated Request with Identical Key & Payload (API-141) ---" -ForegroundColor Yellow
$res3 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $key1 } `
    -SkipHttpErrorCheck

$is200_3 = $res3.StatusCode -eq 200
$replay3 = Get-HeaderVal $res3 "Idempotent-Replay"
$lookup3 = Get-HeaderVal $res3 "X-Cache-Lookup"
Assert-Test "Replayed request returns original 200 OK status" $is200_3
Assert-Test "Replayed request contains Idempotent-Replay: true header" ($replay3 -eq "true")
Assert-Test "Replayed request contains X-Cache-Lookup: HIT header" ($lookup3 -eq "HIT")

# 4. Repeated Request with IDENTICAL Idempotency-Key but DIFFERENT Payload (API-142)
Write-Host "`n--- 4. Repeated Request with Mismatched Payload (API-142) ---" -ForegroundColor Yellow
$mismatchedBody = '{"email":"admin@amanah.com","password":"differentpassword"}'
$res4 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body $mismatchedBody `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $key1 } `
    -SkipHttpErrorCheck

$is409 = $res4.StatusCode -eq 409
$contentType4 = Get-HeaderVal $res4 "Content-Type"
$isProblemJson = $contentType4 -like "*application/problem+json*"
$body4 = Get-BodyJson $res4
$hasMismatchCode = ($null -ne $body4) -and ($body4.code -eq "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH")
Assert-Test "Mismatched payload returns 409 Conflict" $is409
Assert-Test "Mismatched payload returns application/problem+json" $isProblemJson
Assert-Test "Problem details has code IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" $hasMismatchCode

# 5. Invalid Idempotency-Key (bounds check)
Write-Host "`n--- 5. Invalid Idempotency-Key bounds check ---" -ForegroundColor Yellow
$overlengthKey = "a" * 150
$res5 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $overlengthKey } `
    -SkipHttpErrorCheck

$is400 = $res5.StatusCode -eq 400
$body5 = Get-BodyJson $res5
$hasInvalidCode = ($null -ne $body5) -and ($body5.code -eq "INVALID_IDEMPOTENCY_KEY")
Assert-Test "Overlength key returns 400 Bad Request" $is400
Assert-Test "Problem details has code INVALID_IDEMPOTENCY_KEY" $hasInvalidCode

# 6. Endpoint Scoping (API-140)
Write-Host "`n--- 6. Endpoint Scoping (API-140) ---" -ForegroundColor Yellow
$key2 = "scope-key-" + (Get-Random)
$scopeRes1 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $key2 } `
    -SkipHttpErrorCheck

$scopeRes2 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/forgot-password" `
    -Method Post `
    -Body '{"email":"admin@amanah.com"}' `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $key2 } `
    -SkipHttpErrorCheck

$is200_scope1 = $scopeRes1.StatusCode -eq 200
$isNot409_scope2 = $scopeRes2.StatusCode -ne 409
Assert-Test "Key executes successfully on endpoint A" $is200_scope1
Assert-Test "Same key on different endpoint B does not trigger conflict" $isNot409_scope2

# 7. Query Parameter Mismatch Detection (API-142)
Write-Host "`n--- 7. Query Parameter Mismatch Detection (API-142) ---" -ForegroundColor Yellow
$key3 = "query-key-" + (Get-Random)
$qRes1 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login?ref=portal" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $key3 } `
    -SkipHttpErrorCheck

$qRes2 = Invoke-WebRequest -Uri "$BaseUrl/api/v1/auth/email/login?ref=mobile" `
    -Method Post `
    -Body $loginBody `
    -ContentType "application/json" `
    -Headers @{ "Idempotency-Key" = $key3 } `
    -SkipHttpErrorCheck

$is200_q1 = $qRes1.StatusCode -eq 200
$is409_q2 = $qRes2.StatusCode -eq 409
$qBody2 = Get-BodyJson $qRes2
$hasQueryMismatchCode = ($null -ne $qBody2) -and ($qBody2.code -eq "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH")
Assert-Test "Query variant 1 executes successfully" $is200_q1
Assert-Test "Query variant 2 returns 409 Conflict" $is409_q2
Assert-Test "Query mismatch returns IDEMPOTENCY_KEY_PAYLOAD_MISMATCH" $hasQueryMismatchCode

# 8. High-Concurrency Concurrent Execution (API-144)
Write-Host "`n--- 8. High-Concurrency Simultaneous Execution (API-144) ---" -ForegroundColor Yellow
$concurrentKey = "concurrent-key-" + (Get-Random)

# Launch two parallel web requests at the exact same instant
$job1 = Start-Job -ScriptBlock {
    param($url, $body, $key)
    Invoke-WebRequest -Uri $url -Method Post -Body $body -ContentType "application/json" -Headers @{ "Idempotency-Key" = $key } -SkipHttpErrorCheck
} -ArgumentList "$BaseUrl/api/v1/auth/email/login", $loginBody, $concurrentKey

$job2 = Start-Job -ScriptBlock {
    param($url, $body, $key)
    Invoke-WebRequest -Uri $url -Method Post -Body $body -ContentType "application/json" -Headers @{ "Idempotency-Key" = $key } -SkipHttpErrorCheck
} -ArgumentList "$BaseUrl/api/v1/auth/email/login", $loginBody, $concurrentKey

$jobResults = Wait-Job $job1, $job2 | Receive-Job
Remove-Job $job1, $job2

$statuses = $jobResults | ForEach-Object { $_.StatusCode }
$hasValidOutcome = ($statuses -contains 200) -and (($statuses -contains 200) -or ($statuses -contains 409))
Assert-Test "Concurrent execution resolves safely without crashing (Status: $($statuses -join ', '))" $hasValidOutcome

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Idempotency Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 }
