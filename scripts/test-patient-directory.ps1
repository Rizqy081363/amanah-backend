# ==============================================================================
# Skrip Pengujian Otomatis REST API Direktori Pasien (Amanah Healthcare)
# ==============================================================================
param(
    [string]$BaseUrl = "http://127.0.0.1:3001",
    [string]$Email = "admin@amanah.com",
    [string]$Password = "secret123"
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " [TEST SUITE] PENGUJIAN API DATA PASIEN & DUAL-MODE SSOT" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Login Otentikasi Admin
Write-Host "[1/5] Melakukan otentikasi login admin..." -NoNewline
try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json

    $loginRes = Invoke-RestMethod -Uri "$BaseUrl/api/v1/auth/email/login" `
        -Method Post `
        -Body $loginBody `
        -ContentType "application/json"

    $token = $loginRes.token
    if (-not $token) {
        throw "Token otentikasi tidak ditemukan dalam respons login."
    }
    $headers = @{
        Authorization = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host " [OK]" -ForegroundColor Green
} catch {
    Write-Host " [FAIL]" -ForegroundColor Red
    Write-Host "Error login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$testPassed = 0
$testFailed = 0

function Run-TestCase {
    param(
        [string]$Name,
        [string]$Endpoint,
        [scriptblock]$Validator
    )

    Write-Host "`n---> Menguji: $Name" -ForegroundColor Yellow
    Write-Host "     GET $Endpoint" -ForegroundColor Gray
    
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $res = Invoke-RestMethod -Uri "$BaseUrl$Endpoint" -Headers $headers -Method Get
        $sw.Stop()
        Write-Host "     Status: 200 OK | Durasi: $($sw.ElapsedMilliseconds)ms" -ForegroundColor Green
        
        $pass = & $Validator $res
        if ($pass -eq $false) {
            Write-Host "     VALIDASI GAGAL!" -ForegroundColor Red
            $script:testFailed++
        } else {
            Write-Host "     VALIDASI SUKSES!" -ForegroundColor Green
            $script:testPassed++
        }
    } catch {
        $sw.Stop()
        Write-Host "     Status: GAGAL / HTTP ERROR $($_.Exception.Response.StatusCode) | Durasi: $($sw.ElapsedMilliseconds)ms" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host "     Pesan Error: $($_.ErrorDetails.Message)" -ForegroundColor Red
        } else {
            Write-Host "     Exception: $($_.Exception.Message)" -ForegroundColor Red
        }
        $script:testFailed++
    }
}

# 2. Case 1: Default Browsing (Mode A - Hierarki Pohon Keluarga)
Run-TestCase -Name "Mode A - Default Browsing (Tanpa Filter, Pohon Hierarki)" `
    -Endpoint "/api/v1/patients/directory?page=1&limit=10" `
    -Validator {
        param($res)
        $items = $res.data
        Write-Host "     Hasil: $($items.Count) pasien utama ditemukan (Total: $($res.meta.total))." -ForegroundColor Gray
        if ($items.Count -gt 0) {
            $masterWithAff = $items | Where-Object { $_.affiliates -and $_.affiliates.Count -gt 0 }
            if ($masterWithAff) {
                Write-Host "     Ditemukan akun utama ($($masterWithAff[0].fullName)) dengan $($masterWithAff[0].affiliates.Count) anggota keluarga bersarang." -ForegroundColor Cyan
            }
        }
        return ($res.meta.page -eq 1)
    }

# 3. Case 2: Filter gender=female & bloodType=AB (Sebelumnya crash 500 karena enum case-sensitive)
Run-TestCase -Name "Mode B - Filter gender=female & bloodType=AB (Fix Error 500 Enum)" `
    -Endpoint "/api/v1/patients/directory?page=1&limit=10&gender=female&bloodType=AB" `
    -Validator {
        param($res)
        Write-Host "     Hasil: $($res.data.Count) pasien cocok. Meta total: $($res.meta.total)." -ForegroundColor Gray
        return ($null -ne $res.data)
    }

# 4. Case 3: Filter bloodType=a (Normalisasi input lowercase enum)
Run-TestCase -Name "Mode B - Filter bloodType=a (Lowercase enum input)" `
    -Endpoint "/api/v1/patients/directory?page=1&limit=10&bloodType=a" `
    -Validator {
        param($res)
        Write-Host "     Hasil: $($res.data.Count) pasien cocok. Meta total: $($res.meta.total)." -ForegroundColor Gray
        return ($null -ne $res.data)
    }

# 5. Case 4: Pencarian Global (Search)
Run-TestCase -Name "Mode B - Pencarian Global Agnostik (search=RM)" `
    -Endpoint "/api/v1/patients/directory?page=1&limit=10&search=RM" `
    -Validator {
        param($res)
        Write-Host "     Hasil: $($res.data.Count) pasien cocok dengan query 'RM'." -ForegroundColor Gray
        return ($null -ne $res.data)
    }

# 6. Case 5: Referensi Opsi Formulir Pasien (SSOT)
Run-TestCase -Name "SSOT - Referensi Opsi Pasien (/reference/options)" `
    -Endpoint "/api/v1/patients/reference/options" `
    -Validator {
        param($res)
        $bloodCount = $res.data.bloodTypes.Count
        $genderCount = $res.data.genders.Count
        Write-Host "     Opsi: $bloodCount tipe golongan darah, $genderCount gender." -ForegroundColor Gray
        return ($bloodCount -gt 0 -and $genderCount -gt 0)
    }

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " HASIL PENGUJIAN: $testPassed LULUS, $testFailed GAGAL" -ForegroundColor $(if ($testFailed -eq 0) { "Green" } else { "Red" })
Write-Host "========================================================`n" -ForegroundColor Cyan

if ($testFailed -gt 0) {
    exit 1
} else {
    exit 0
}
