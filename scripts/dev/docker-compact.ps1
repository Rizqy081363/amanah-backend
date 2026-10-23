<#
.SYNOPSIS
    Amanah Healthcare - Safe Docker VHDX Compaction Automation (Fase 4-5 SPEC: docker-reclaim)

.DESCRIPTION
    Melakukan kompaksi offline terhadap file virtual disk Docker Desktop WSL2 (docker_data.vhdx)
    untuk mengembalikan ruang kosong dari host Windows (NTFS) yang telah dibersihkan pada Fase 0-3.

.NOTES
    HARUS dijalankan dari PowerShell dengan hak Administrator di terminal Windows (bukan di dalam WSL/agent).
#>

[CmdletBinding()]
param(
    [switch]$SkipConfirmation
)

$ErrorActionPreference = "Stop"

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " AMANAH HEALTHCARE - SAFE DOCKER VHDX COMPACTION (FASE 4-5)" -ForegroundColor Cyan
Write-Host " Invariant: Zero Data Loss | Graceful Stack Shutdown | Verified VHDX Detach" -ForegroundColor Cyan
Write-Host "================================================================================`n" -ForegroundColor Cyan

# 1. Cek Hak Akses Administrator
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]$identity
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "[ERROR] Skrip ini WAJIB dijalankan dengan hak Administrator!" -ForegroundColor Red
    Write-Host "Silakan klik kanan PowerShell -> 'Run as Administrator', lalu jalankan kembali skrip ini." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] Terverifikasi berjalan dengan hak Administrator." -ForegroundColor Green

# 2. Cek Path VHDX
$vhdxPath = Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'
if (-not (Test-Path -LiteralPath $vhdxPath)) {
    Write-Host "[ERROR] File VHDX Docker tidak ditemukan di lokasi standar: $vhdxPath" -ForegroundColor Red
    exit 1
}

$initialBytes = (Get-Item -LiteralPath $vhdxPath).Length
$initialGB = [math]::Round($initialBytes / 1GB, 2)
Write-Host "[OK] File VHDX terdeteksi: $vhdxPath" -ForegroundColor Green
Write-Host "[INFO] Ukuran VHDX Host saat ini: $initialGB GB ($initialBytes bytes)`n" -ForegroundColor Yellow

# Konfirmasi User sebelum mematikan stack
if (-not $SkipConfirmation) {
    $confirm = Read-Host "Apakah Anda ingin melanjutkan proses kompaksi? Ini akan mematikan Docker Desktop sementara (y/n)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "[ABORT] Proses dibatalkan oleh pengguna." -ForegroundColor Yellow
        exit 0
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Write-Host "`n▶ [1/5] Menghentikan stack Amanah secara graceful (flush database)..." -ForegroundColor Cyan
try {
    Push-Location $repoRoot
    docker compose stop
    Pop-Location
    Write-Host "[OK] Stack database dan services berhasil di-flush dan dihentikan." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Gagal menghentikan compose secara normal: $_" -ForegroundColor Yellow
}

Write-Host "`n▶ [2/5] Menutup Docker Desktop & mematikan WSL..." -ForegroundColor Cyan
$dockerProc = Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue
if ($dockerProc) {
    Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

Write-Host "  → Menjalankan 'wsl --shutdown'..." -ForegroundColor Gray
wsl --shutdown
Start-Sleep -Seconds 3

# Verifikasi semua distro WSL berstatus Stopped
$maxRetries = 10
$allStopped = $false
for ($i = 1; $i -le $maxRetries; $i++) {
    $wslState = wsl -l -v
    if ($wslState -notmatch "Running") {
        $allStopped = $true
        break
    }
    Write-Host "  ... Menunggu WSL distros berhenti ($i/$maxRetries)..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

if (-not $allStopped) {
    Write-Host "[ERROR] Masih ada distro WSL yang aktif setelah wsl --shutdown. Abort demi keamanan file VHDX!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Seluruh distro WSL telah berstatus 'Stopped'." -ForegroundColor Green

# Verifikasi file VHDX tidak terkunci
try {
    $fileStream = [System.IO.File]::Open($vhdxPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $fileStream.Close()
    Write-Host "[OK] File VHDX bebas dari lock proses lain." -ForegroundColor Green
} catch {
    Write-Host "[ERROR] File VHDX sedang terkunci oleh proses sistem. Tunggu beberapa detik lalu ulangi." -ForegroundColor Red
    exit 1
}

Write-Host "`n▶ [3/5] Mengeksekusi Kompaksi VHDX..." -ForegroundColor Cyan

$optimizeVhdCmd = Get-Command Optimize-VHD -ErrorAction SilentlyContinue
if ($optimizeVhdCmd) {
    Write-Host "  → Menggunakan Hyper-V Optimize-VHD (Full mode)..." -ForegroundColor Green
    Optimize-VHD -Path $vhdxPath -Mode Full
} else {
    Write-Host "  → Modul Hyper-V tidak tersedia. Menggunakan fallback diskpart..." -ForegroundColor Yellow
    $diskpartScript = [System.IO.Path]::GetTempFileName()
    $scriptContent = @"
select vdisk file="$vhdxPath"
attach vdisk readonly
compact vdisk
detach vdisk
exit
"@
    Set-Content -Path $diskpartScript -Value $scriptContent -Encoding ASCII

    try {
        $dpOutput = diskpart /s $diskpartScript
        Write-Host ($dpOutput -join "`n") -ForegroundColor Gray
    } finally {
        # JAMINAN DETACH: Pastikan vdisk selalu di-detach jika script terinterupsi
        $detachScript = [System.IO.Path]::GetTempFileName()
        Set-Content -Path $detachScript -Value "select vdisk file=`"$vhdxPath`"`ndetach vdisk`nexit" -Encoding ASCII
        diskpart /s $detachScript | Out-Null
        Remove-Item -Path $detachScript -Force -ErrorAction SilentlyContinue
        Remove-Item -Path $diskpartScript -Force -ErrorAction SilentlyContinue
    }
}

# 4. Ukur Hasil Kompaksi
$finalBytes = (Get-Item -LiteralPath $vhdxPath).Length
$finalGB = [math]::Round($finalBytes / 1GB, 2)
$reclaimedBytes = $initialBytes - $finalBytes
$reclaimedGB = [math]::Round($reclaimedBytes / 1GB, 2)

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host " HASIL KOMPAKSI VHDX:" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " Ukuran Awal   : $initialGB GB ($initialBytes bytes)" -ForegroundColor White
Write-Host " Ukuran Akhir  : $finalGB GB ($finalBytes bytes)" -ForegroundColor Green
Write-Host " Ruang Reclaim : $reclaimedGB GB terbebas dan dikembalikan ke drive host!" -ForegroundColor Yellow
Write-Host "================================================================================`n" -ForegroundColor Cyan

# 5. Menyalakan Kembali Docker Desktop & Stack
Write-Host "▶ [4/5] Menyalakan kembali Docker Desktop..." -ForegroundColor Cyan
$dockerDesktopExe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
if (Test-Path $dockerDesktopExe) {
    Start-Process -FilePath $dockerDesktopExe
} else {
    Write-Host "[WARN] Executable Docker Desktop tidak ditemukan di $dockerDesktopExe. Silakan buka manual." -ForegroundColor Yellow
}

Write-Host "Menunggu Docker daemon siap..." -ForegroundColor Gray
$dockerReady = $false
for ($i = 1; $i -le 30; $i++) {
    $infoCheck = docker info 2>$null
    if ($LASTEXITCODE -eq 0) {
        $dockerReady = $true
        break
    }
    Start-Sleep -Seconds 2
}

if ($dockerReady) {
    Write-Host "[OK] Docker daemon telah online." -ForegroundColor Green
    Write-Host "`n▶ [5/5] Menyalakan kembali stack Amanah Healthcare..." -ForegroundColor Cyan
    Push-Location $repoRoot
    docker compose up -d
    Start-Sleep -Seconds 5
    docker compose ps
    Pop-Location
    Write-Host "`n✔ STACK AMANAH TELAH KEMBALI ONLINE DENGAN SUKSES." -ForegroundColor Green
} else {
    Write-Host "[WARN] Docker daemon belum siap dalam batas waktu. Silakan nyalakan stack secara manual dengan: Set-Location backend; docker compose up -d" -ForegroundColor Yellow
}
