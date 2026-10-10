<#
.SYNOPSIS
    Script backup PostgreSQL database amanah_healthcare dari Docker container.

.DESCRIPTION
    Menjalankan pg_dump secara lengkap (100% schema, tabel, relasi, tipe enum, sequences, dan data)
    dari container backend-postgres-1, lalu menyimpannya ke folder backup.
    Otomatis menyematkan Git commit hash jika tersedia untuk sinkronisasi 1-to-1 dengan kode.

.PARAMETER Tag
    Label opsional untuk nama backup (misal: "sebelum-migrasi" atau "pre-task").
    Jika kosong, otomatis mengambil commit hash terbaru dari Git.

.PARAMETER FromGitHook
    Switch penanda jika script dijalankan dari Git hook (post-commit).
    Jika container Docker tidak aktif, script akan graceful exit 0 tanpa menggagalkan proses Git.

.PARAMETER MaxBackups
    Batas maksimal file backup yang disimpan (rotasi otomatis file lama, default: 30 file).

.PARAMETER ContainerName
    Nama docker container postgres (default: backend-postgres-1).

.PARAMETER DbUser
    Username postgres (default: amanah).

.PARAMETER DbName
    Nama database postgres (default: amanah_healthcare).

.PARAMETER OutputDir
    Folder tujuan backup (default: folder "backup" di root script).

.EXAMPLE
    .\backup-db.ps1
    .\backup-db.ps1 -Tag "pre-update"
    .\backup-db.ps1 -FromGitHook
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Tag = "",

    [switch]$FromGitHook,

    [int]$MaxBackups = 30,

    [string]$ContainerName = "backend-postgres-1",

    [string]$DbUser = "amanah",

    [string]$DbName = "amanah_healthcare",

    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

# 1. Tentukan folder output
if (-not $OutputDir) {
    if ($PSScriptRoot) {
        $OutputDir = Join-Path $PSScriptRoot "backup"
    } else {
        $OutputDir = Join-Path (Get-Location) "backup"
    }
}

if (-not (Test-Path -Path $OutputDir)) {
    Write-Host "[INFO] Membuat folder backup di: $OutputDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

# 2. Cek apakah docker container sedang aktif
$running = docker ps --filter "name=^/?${ContainerName}$" --filter "status=running" --format "{{.Names}}"
if (-not $running) {
    if ($FromGitHook) {
        Write-Host "[GIT HOOK] Container '$ContainerName' tidak sedang berjalan. Backup database otomatis dilewati." -ForegroundColor Yellow
        exit 0
    }
    Write-Error "Container '$ContainerName' tidak ditemukan atau tidak sedang berjalan! Pastikan docker compose aktif."
    exit 1
}

# 3. Deteksi Git Commit Hash jika Tag belum ditentukan
if (-not $Tag) {
    try {
        $gitHash = (git rev-parse --short HEAD 2>$null).Trim()
        if ($gitHash) {
            $Tag = "commit_$gitHash"
        }
    } catch {
        # Abaikan jika bukan git repository
    }
}

# 4. Format nama file backup
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$cleanTag = if ($Tag) { "_" + ($Tag -replace '[^a-zA-Z0-9_-]', '_') } else { "" }
$filename = "backup_${DbName}_${timestamp}${cleanTag}.sql"
$localPath = Join-Path $OutputDir $filename
$tempInContainer = "/tmp/$filename"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "            DATABASE BACKUP: $DbName" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Container : $ContainerName"
Write-Host "User      : $DbUser"
Write-Host "Database  : $DbName"
if ($Tag) {
    Write-Host "Tag/Ref   : $Tag" -ForegroundColor Magenta
}
Write-Host "Output    : $localPath"
Write-Host "----------------------------------------------------------"

try {
    Write-Host "[1/3] Menjalankan pg_dump di dalam container..." -ForegroundColor Cyan
    docker exec $ContainerName pg_dump -U $DbUser -d $DbName --clean --if-exists -f $tempInContainer
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump gagal dengan exit code $LASTEXITCODE."
    }

    Write-Host "[2/3] Menyalin file backup ke host..." -ForegroundColor Cyan
    docker cp "${ContainerName}:${tempInContainer}" "$localPath"
    if ($LASTEXITCODE -ne 0) {
        throw "docker cp gagal dengan exit code $LASTEXITCODE."
    }

    Write-Host "[3/3] Membersihkan file sementara di dalam container..." -ForegroundColor Cyan
    docker exec $ContainerName rm -f $tempInContainer

    $fileInfo = Get-Item $localPath
    $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)

    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "BACKUP BERHASIL 100%!" -ForegroundColor Green
    Write-Host "File   : $($fileInfo.Name)" -ForegroundColor Green
    Write-Host "Ukuran : $sizeMB MB ($($fileInfo.Length) bytes)" -ForegroundColor Green
    Write-Host "Lokasi : $($fileInfo.FullName)" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green

    # 5. Rotasi otomatis file backup lama (agar disk tidak membengkak)
    if ($MaxBackups -gt 0) {
        $allBackups = Get-ChildItem -Path $OutputDir -File | 
            Where-Object { $_.Extension -in @(".sql", ".dump", ".tar") } | 
            Sort-Object LastWriteTime -Descending

        if ($allBackups.Count -gt $MaxBackups) {
            $toDelete = $allBackups | Select-Object -Skip $MaxBackups
            foreach ($old in $toDelete) {
                Remove-Item -Path $old.FullName -Force -ErrorAction SilentlyContinue
                Write-Host "[ROTASI] Menghapus backup lama: $($old.Name)" -ForegroundColor DarkGray
            }
        }
    }
}
catch {
    docker exec $ContainerName rm -f $tempInContainer 2>$null
    if ($FromGitHook) {
        Write-Host "[GIT HOOK WARN] Backup gagal dijalankan: $_" -ForegroundColor Yellow
        exit 0
    }
    Write-Error "Gagal melakukan backup: $_"
    exit 1
}
