# ==============================================================================
# E2E Test: Shift Overlap Mitigation & Gap Governance
# Amanah Healthcare Monorepo
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host " [E2E] Shift Overlap Mitigation & Invariant Validation Test" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Login Admin
$loginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

try {
    $loginRes = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/auth/email/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginRes.token
    $headers = @{
        Authorization = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "[OK] Admin login successful" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Admin login failed: $_" -ForegroundColor Red
    exit 1
}

# 2. Fetch current schedule configuration
$configRes = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration" -Method Get -Headers $headers
$data = if ($configRes.data) { $configRes.data } else { $configRes }
$sessionDefs = $data.sessionDefs

$morningDef = $sessionDefs | Where-Object { $_.code -eq "morning" }
$afternoonDef = $sessionDefs | Where-Object { $_.code -eq "afternoon" }

Write-Host "`n-- Current Baseline Master Shifts:" -ForegroundColor White
Write-Host "  Morning   : $($morningDef.defaultStartsAt) - $($morningDef.defaultEndsAt)" -ForegroundColor Gray
Write-Host "  Afternoon : $($afternoonDef.defaultStartsAt) - $($afternoonDef.defaultEndsAt)" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# TEST 1: Overlap Violation (Pagi ends at 13:00 while Siang starts at 12:00)
# Expected: HTTP 400 Bad Request with code SHIFT_OVERLAP_CONFLICT
# ------------------------------------------------------------------------------
Write-Host "`n-- TEST 1: Mengirim payload overlap (Pagi selesai 13:00, Siang mulai 12:00)..." -ForegroundColor Yellow

$overlapPayload = @{
    defs = @(
        @{
            id = $morningDef.id
            defaultStartsAt = "06:00:00"
            defaultEndsAt = "13:00:00"
            isActive = $true
        },
        @{
            id = $afternoonDef.id
            defaultStartsAt = "12:00:00"
            defaultEndsAt = "18:00:00"
            isActive = $true
        }
    )
} | ConvertTo-Json -Depth 5

$test1Passed = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs" -Method Put -Headers $headers -Body $overlapPayload
    Write-Host "[FAIL] Backend menerima payload overlap (seharusnya ditolak 400)!" -ForegroundColor Red
} catch {
    $statusCode = 0
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
    $rawError = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { "" }
    if (-not $rawError -and $_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $rawError = $reader.ReadToEnd()
        } catch {}
    }
    $respBody = try { $rawError | ConvertFrom-Json } catch { @{} }
    
    if ($statusCode -eq 400 -and ($respBody.code -eq "SHIFT_OVERLAP_CONFLICT" -or $rawError -match "SHIFT_OVERLAP_CONFLICT")) {
        Write-Host "[PASS] Overlap berhasil ditolak dengan HTTP 400: $($respBody.message)" -ForegroundColor Green
        $test1Passed = $true
    } else {
        Write-Host "[FAIL] Status code: $statusCode, response: $rawError" -ForegroundColor Red
    }
}

# ------------------------------------------------------------------------------
# TEST 2: Inverted Time Range (startsAt >= endsAt)
# Expected: HTTP 400 Bad Request with code INVALID_SHIFT_TIME_RANGE
# ------------------------------------------------------------------------------
Write-Host "`n-- TEST 2: Mengirim payload rentang waktu terbalik (Pagi 14:00 - 10:00)..." -ForegroundColor Yellow

$invertedPayload = @{
    defs = @(
        @{
            id = $morningDef.id
            defaultStartsAt = "14:00:00"
            defaultEndsAt = "10:00:00"
            isActive = $true
        }
    )
} | ConvertTo-Json -Depth 5

$test2Passed = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs" -Method Put -Headers $headers -Body $invertedPayload
    Write-Host "[FAIL] Backend menerima rentang terbalik (seharusnya ditolak 400)!" -ForegroundColor Red
} catch {
    $statusCode = 0
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
    $rawError = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { "" }
    if (-not $rawError -and $_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $rawError = $reader.ReadToEnd()
        } catch {}
    }
    $respBody = try { $rawError | ConvertFrom-Json } catch { @{} }
    
    if ($statusCode -eq 400 -and ($respBody.code -eq "INVALID_SHIFT_TIME_RANGE" -or $rawError -match "INVALID_SHIFT_TIME_RANGE")) {
        Write-Host "[PASS] Rentang terbalik berhasil ditolak dengan HTTP 400: $($respBody.message)" -ForegroundColor Green
        $test2Passed = $true
    } else {
        Write-Host "[FAIL] Status code: $statusCode, response: $rawError" -ForegroundColor Red
    }
}

# ------------------------------------------------------------------------------
# TEST 3: Valid Gap (Pagi 06:00 - 10:00, Siang 12:00 - 18:00 -> Jeda 2 Jam)
# Expected: HTTP 200 OK (Gap operasional klinik diizinkan dan sah)
# ------------------------------------------------------------------------------
Write-Host "`n-- TEST 3: Mengirim konfigurasi dengan jeda klinik sah (Pagi 06:00-10:00, Siang 12:00-18:00)..." -ForegroundColor Yellow

$gapPayload = @{
    defs = @(
        @{
            id = $morningDef.id
            defaultStartsAt = "06:00:00"
            defaultEndsAt = "10:00:00"
            isActive = $true
        },
        @{
            id = $afternoonDef.id
            defaultStartsAt = "12:00:00"
            defaultEndsAt = "18:00:00"
            isActive = $true
        }
    )
} | ConvertTo-Json -Depth 5

$test3Passed = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs" -Method Put -Headers $headers -Body $gapPayload
    if ($res.success -eq $true) {
        Write-Host "[PASS] Jeda operasional sah (gap 2 jam) berhasil disimpan dengan HTTP 200 OK" -ForegroundColor Green
        $test3Passed = $true
    }
} catch {
    Write-Host "[FAIL] Gagal menyimpan jeda operasional sah: $_" -ForegroundColor Red
}

# ------------------------------------------------------------------------------
# TEST 4: Restorasi ke Baseline Default (Pagi 06:00 - 12:00)
# Expected: HTTP 200 OK
# ------------------------------------------------------------------------------
Write-Host "`n-- TEST 4: Mengembalikan konfigurasi ke default kanonikal (Pagi 06:00-12:00)..." -ForegroundColor Yellow

$restorePayload = @{
    defs = @(
        @{
            id = $morningDef.id
            defaultStartsAt = "06:00:00"
            defaultEndsAt = "12:00:00"
            isActive = $true
        },
        @{
            id = $afternoonDef.id
            defaultStartsAt = "12:00:00"
            defaultEndsAt = "18:00:00"
            isActive = $true
        }
    )
} | ConvertTo-Json -Depth 5

$test4Passed = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:3001/api/v1/admin/schedule-configuration/session-defs" -Method Put -Headers $headers -Body $restorePayload
    if ($res.success -eq $true) {
        Write-Host "[PASS] Restorasi konfigurasi shift master berhasil (HTTP 200 OK)" -ForegroundColor Green
        $test4Passed = $true
    }
} catch {
    Write-Host "[FAIL] Gagal merestorasi konfigurasi shift master: $_" -ForegroundColor Red
}

Write-Host "`n==================================================================" -ForegroundColor Cyan
Write-Host " RINGKASAN HASIL PENGUJIAN E2E:" -ForegroundColor Cyan
Write-Host "  Test 1: Penolakan Overlap 400        : $(if ($test1Passed) {'PASS'} else {'FAIL'})" -ForegroundColor $(if ($test1Passed) {'Green'} else {'Red'})
Write-Host "  Test 2: Penolakan Range Terbalik 400 : $(if ($test2Passed) {'PASS'} else {'FAIL'})" -ForegroundColor $(if ($test2Passed) {'Green'} else {'Red'})
Write-Host "  Test 3: Dukungan Jeda/Gap Sah 200    : $(if ($test3Passed) {'PASS'} else {'FAIL'})" -ForegroundColor $(if ($test3Passed) {'Green'} else {'Red'})
Write-Host "  Test 4: Restorasi Bersih 200         : $(if ($test4Passed) {'PASS'} else {'FAIL'})" -ForegroundColor $(if ($test4Passed) {'Green'} else {'Red'})
Write-Host "==================================================================`n" -ForegroundColor Cyan

if (-not ($test1Passed -and $test2Passed -and $test3Passed -and $test4Passed)) {
    exit 1
}
