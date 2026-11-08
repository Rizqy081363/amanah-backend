# ==============================================================================
# Skrip Pengujian Otomatis Keamanan: Isolasi Tenant & Pencegahan Celah IDOR
# Monorepo: Amanah Healthcare (Backend API Service)
# ==============================================================================

param(
    [string]$BaseUrl = "http://127.0.0.1:3001",
    [string]$ExternalUserEmail = "blueleather11@gmail.com",
    [string]$AdminUserEmail = "admin@amanah.com"
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " [SECURITY AUDIT] UJI ISOLASI TENANT & PENCEGAHAN IDOR" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Mengambil Token JWT Melalui CLI Resmi
Write-Host "[1/3] Menyiapkan token otentikasi..." -ForegroundColor Yellow

Push-Location "$PSScriptRoot\..\.."
try {
    $externalToken = (bun run db:jwt --email $ExternalUserEmail --raw 2>$null | Out-String).Trim()
    $adminToken = (bun run db:jwt --email $AdminUserEmail --raw 2>$null | Out-String).Trim()
} finally {
    Pop-Location
}

if (-not $externalToken -or $externalToken.Length -lt 20) {
    Write-Host "ERROR: Gagal menghasilkan token untuk $ExternalUserEmail" -ForegroundColor Red
    exit 1
}
if (-not $adminToken -or $adminToken.Length -lt 20) {
    Write-Host "ERROR: Gagal menghasilkan token untuk $AdminUserEmail" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Token JWT Eksternal ($ExternalUserEmail): OK ($($externalToken.Substring(0, 15))...)" -ForegroundColor Green
Write-Host "  [OK] Token JWT Admin ($AdminUserEmail): OK ($($adminToken.Substring(0, 15))...)" -ForegroundColor Green

# 2. Mengambil Target Pasien Lain dari Database untuk Uji Coba Penetrasi IDOR
Write-Host "`n[2/3] Mengambil data pasien target dari database untuk uji IDOR..." -ForegroundColor Yellow
$targetPatientQuery = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT id, full_name FROM patient_profiles ORDER BY created_at ASC LIMIT 1;"
if (-not $targetPatientQuery) {
    Write-Host "ERROR: Tidak ada data pasien di database untuk diuji." -ForegroundColor Red
    exit 1
}

$parts = $targetPatientQuery.Trim().Split('|')
$targetPatientId = $parts[0]
$targetPatientName = $parts[1]

Write-Host "  [TARGET PASIEN KORBAN]" -ForegroundColor Cyan
Write-Host "  ID Pasien : $targetPatientId" -ForegroundColor Gray
Write-Host "  Nama      : $targetPatientName" -ForegroundColor Gray

# Helper Function: Request HTTP dengan Tangkap Error Status
function Invoke-Endpoint {
    param(
        [string]$Uri,
        [string]$Token,
        [string]$Method = "GET"
    )

    $headers = @{
        Authorization = "Bearer $Token"
        "Content-Type" = "application/json"
    }

    try {
        $response = Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -ErrorAction Stop
        return @{
            StatusCode = 200
            Data = $response
            RawError = $null
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if (-not $statusCode -and $_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        $errorJson = $null
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorJson = $reader.ReadToEnd() | ConvertFrom-Json
        } catch {}

        return @{
            StatusCode = $statusCode
            Data = $errorJson
            RawError = $_.Exception.Message
        }
    }
}

# 3. Eksekusi Test Cases
Write-Host "`n[3/3] Menjalankan matriks pengujian keamanan..." -ForegroundColor Yellow

$testCount = 0
$passCount = 0
$failCount = 0

function Assert-Test {
    param(
        [string]$TestName,
        [bool]$Condition,
        [string]$Details
    )

    $script:testCount++
    if ($Condition) {
        $script:passCount++
        Write-Host "  [PASS] Test $script:testCount: $TestName" -ForegroundColor Green
        if ($Details) {
            Write-Host "         $Details" -ForegroundColor Gray
        }
    } else {
        $script:failCount++
        Write-Host "  [FAIL] Test $script:testCount: $TestName" -ForegroundColor Red
        if ($Details) {
            Write-Host "         $Details" -ForegroundColor Yellow
        }
    }
}

# --- TEST 1: Kebocoran Direktori Pasien (/api/v1/patients/directory) ---
$resExtDir = Invoke-Endpoint -Uri "$BaseUrl/api/v1/patients/directory?limit=5" -Token $externalToken
$containsVictim = $resExtDir.Data.data | Where-Object { $_.id -eq $targetPatientId }
Assert-Test -TestName "Eksternal Membaca Direktori Pasien (Wajib Terisolasi & Tidak Membocorkan Pasien Lain)" `
    -Condition ($resExtDir.StatusCode -eq 200 -and -not $containsVictim) `
    -Details "Eksternal: Status=$($resExtDir.StatusCode), Total=$($resExtDir.Data.meta.total), Rows=$($resExtDir.Data.data.Count), PasienKorbanDitemukan=$([bool]$containsVictim)"

$resAdminDir = Invoke-Endpoint -Uri "$BaseUrl/api/v1/patients/directory?limit=5" -Token $adminToken
Assert-Test -TestName "Admin Membaca Direktori Pasien (Tetap Bekerja Normal)" `
    -Condition ($resAdminDir.StatusCode -eq 200 -and $resAdminDir.Data.data.Count -gt 0) `
    -Details "Admin: Status=$($resAdminDir.StatusCode), Total=$($resAdminDir.Data.meta.total), Rows=$($resAdminDir.Data.data.Count)"

# --- TEST 2: Kebocoran Rekam Medis Keseluruhan (/api/v1/medical-records) ---
$resExtRecords = Invoke-Endpoint -Uri "$BaseUrl/api/v1/medical-records?limit=5" -Token $externalToken
Assert-Test -TestName "Eksternal Baru Membaca Semua Rekam Medis (Wajib 0 Data / Kosong)" `
    -Condition ($resExtRecords.StatusCode -eq 200 -and $resExtRecords.Data.data.Count -eq 0 -and $resExtRecords.Data.total -eq 0) `
    -Details "Eksternal: Status=$($resExtRecords.StatusCode), Total=$($resExtRecords.Data.total), Rows=$($resExtRecords.Data.data.Count)"

# --- TEST 3: IDOR - Profil Detail Pasien Korban (/api/v1/patients/:id) ---
$resExtPatientDetail = Invoke-Endpoint -Uri "$BaseUrl/api/v1/patients/$targetPatientId" -Token $externalToken
Assert-Test -TestName "IDOR Defense: Eksternal Mengakses Profil Detail Korban ($targetPatientName)" `
    -Condition ($resExtPatientDetail.StatusCode -eq 403) `
    -Details "Status=$($resExtPatientDetail.StatusCode), Detail=$($resExtPatientDetail.Data.detail)"

# --- TEST 4: IDOR - Dekripsi NIK Asli Korban (/api/v1/patients/affiliations/:id/unmask-nik) ---
$resExtUnmask = Invoke-Endpoint -Uri "$BaseUrl/api/v1/patients/affiliations/$targetPatientId/unmask-nik" -Token $externalToken
Assert-Test -TestName "IDOR Defense: Eksternal Mendekripsi NIK Korban ($targetPatientName)" `
    -Condition ($resExtUnmask.StatusCode -eq 403) `
    -Details "Status=$($resExtUnmask.StatusCode), Detail=$($resExtUnmask.Data.message)"

# --- TEST 5: IDOR - Riwayat Janji Temu Korban (/api/v1/appointments/history/patient/:id) ---
$resExtApptHistory = Invoke-Endpoint -Uri "$BaseUrl/api/v1/appointments/history/patient/$targetPatientId" -Token $externalToken
Assert-Test -TestName "IDOR Defense: Eksternal Mengakses Riwayat Janji Temu Korban" `
    -Condition ($resExtApptHistory.StatusCode -eq 403) `
    -Details "Status=$($resExtApptHistory.StatusCode), Detail=$($resExtApptHistory.Data.detail)"

# --- TEST 6: IDOR - Buku Imunisasi Anak Korban (/api/v1/immunization/patient/:id/ledger) ---
$resExtLedger = Invoke-Endpoint -Uri "$BaseUrl/api/v1/immunization/patient/$targetPatientId/ledger" -Token $externalToken
Assert-Test -TestName "IDOR Defense: Eksternal Mengakses Buku Imunisasi Korban" `
    -Condition ($resExtLedger.StatusCode -eq 403) `
    -Details "Status=$($resExtLedger.StatusCode), Detail=$($resExtLedger.Data.detail)"

# --- TEST 7: IDOR - Riwayat Kehamilan Korban (/api/v1/maternity/patient/:id/pregnancies) ---
$resExtPregnancies = Invoke-Endpoint -Uri "$BaseUrl/api/v1/maternity/patient/$targetPatientId/pregnancies" -Token $externalToken
Assert-Test -TestName "IDOR Defense: Eksternal Mengakses Riwayat Kehamilan Korban" `
    -Condition ($resExtPregnancies.StatusCode -eq 403) `
    -Details "Status=$($resExtPregnancies.StatusCode), Detail=$($resExtPregnancies.Data.detail)"

# --- TEST 8: IDOR - Rekam Medis Pasien Korban (/api/v1/medical-records/patient/:id) ---
$resExtMedRecPatient = Invoke-Endpoint -Uri "$BaseUrl/api/v1/medical-records/patient/$targetPatientId" -Token $externalToken
Assert-Test -TestName "IDOR Defense: Eksternal Mengakses Riwayat Rekam Medis Korban" `
    -Condition ($resExtMedRecPatient.StatusCode -eq 403) `
    -Details "Status=$($resExtMedRecPatient.StatusCode), Detail=$($resExtMedRecPatient.Data.detail)"

# --- TEST 9: Akses Listing Pasien Umum Staf (/api/v1/patients) ---
$resExtPatientsList = Invoke-Endpoint -Uri "$BaseUrl/api/v1/patients?limit=5" -Token $externalToken
Assert-Test -TestName "Eksternal Mengakses Listing Pasien Umum Staf (Wajib 403 Forbidden)" `
    -Condition ($resExtPatientsList.StatusCode -eq 403) `
    -Details "Status=$($resExtPatientsList.StatusCode), Detail=$($resExtPatientsList.Data.detail)"

# --- TEST 10: Akses Listing Imunisasi Umum Staf (/api/v1/immunization/history) ---
$resExtImmHistory = Invoke-Endpoint -Uri "$BaseUrl/api/v1/immunization/history" -Token $externalToken
Assert-Test -TestName "Eksternal Mengakses Listing Imunisasi Umum Staf (Wajib 403 Forbidden)" `
    -Condition ($resExtImmHistory.StatusCode -eq 403) `
    -Details "Status=$($resExtImmHistory.StatusCode), Detail=$($resExtImmHistory.Data.detail)"

# ==============================================================================
# HASIL AKHIR AUDIT
# ==============================================================================
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " RINGKASAN HASIL AUDIT KEAMANAN ISOLASI TENANT & IDOR" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Total Pengujian : $testCount" -ForegroundColor White
Write-Host " Berhasil (PASS) : $passCount" -ForegroundColor Green
Write-Host " Gagal    (FAIL) : $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
Write-Host "========================================================`n" -ForegroundColor Cyan

if ($failCount -gt 0) {
    Write-Host "AUDIT GAGAL: Masih ditemukan celah keamanan!" -ForegroundColor Red
    exit 1
} else {
    Write-Host "AUDIT SUKSES: Seluruh celah kebocoran data dan IDOR telah tertutup 100%!" -ForegroundColor Green
    exit 0
}
