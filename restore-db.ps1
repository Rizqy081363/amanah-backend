<#
.SYNOPSIS
    Script restore dynamic PostgreSQL database amanah_healthcare ke Docker container.

.DESCRIPTION
    Menghapus (DROP) database yang sedang berjalan saat ini, membuat ulang database kosong,
    lalu me-restore 100% schema, enum types, sequences, data, dan constraint dari file backup
    yang dipilih secara dynamic. Mendukung pencarian instan berdasarkan Git Commit Hash.

.PARAMETER BackupFile
    Nama file, path lengkap, atau potongan Commit Hash file backup yang ingin di-restore.
    Jika tidak diisi, script akan menampilkan daftar versi backup yang tersedia untuk dipilih,
    atau memilih yang paling baru jika menggunakan parameter -Latest.

.PARAMETER Latest
    Otomatis memilih file backup terbaru tanpa menampilkan menu pilihan.

.PARAMETER Force
    Melewati konfirmasi penghapusan database (berguna untuk otomatisasi/CI).

.PARAMETER ContainerName
    Nama docker container postgres (default: backend-postgres-1).

.PARAMETER DbUser
    Username postgres (default: amanah).

.PARAMETER DbName
    Nama database target yang akan di-restore (default: amanah_healthcare).

.PARAMETER MaintenanceDb
    Database default untuk proses drop/create (default: postgres).

.PARAMETER BackupDir
    Folder tempat mencari file backup (default: folder "backup" di root project).

.EXAMPLE
    # Menampilkan menu interaktif memilih versi backup yang tersedia:
    .\restore-db.ps1

    # Restore versi terbaru secara otomatis:
    .\restore-db.ps1 -Latest

    # Restore berdasarkan commit hash:
    .\restore-db.ps1 "b04c99e"

    # Restore file spesifik:
    .\restore-db.ps1 -BackupFile "backup_amanah_healthcare_20261010_074447.sql"
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$BackupFile = "",

    [switch]$Latest,

    [switch]$Force,

    [string]$ContainerName = "backend-postgres-1",

    [string]$DbUser = "amanah",

    [string]$DbName = "amanah_healthcare",

    [string]$MaintenanceDb = "postgres",

    [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"

# 1. Tentukan folder backup
if (-not $BackupDir) {
    if ($PSScriptRoot) {
        $candidate1 = Join-Path $PSScriptRoot "backup"
        if (Test-Path $candidate1) {
            $BackupDir = $candidate1
        } else {
            $BackupDir = $PSScriptRoot
        }
    } else {
        $BackupDir = Join-Path (Get-Location) "backup"
    }
}

# 2. Cek ketersediaan container Docker
$running = docker ps --filter "name=^/?${ContainerName}$" --filter "status=running" --format "{{.Names}}"
if (-not $running) {
    Write-Error "Container '$ContainerName' tidak ditemukan atau tidak sedang berjalan! Pastikan container aktif dengan 'docker compose up -d postgres'."
    exit 1
}

# 3. Cari file backup yang tersedia
$backupFiles = @()
if (Test-Path $BackupDir) {
    $backupFiles = Get-ChildItem -Path $BackupDir -File | 
        Where-Object { $_.Extension -in @(".sql", ".dump", ".tar") } | 
        Sort-Object LastWriteTime -Descending
}

# 4. Tentukan file target yang akan di-restore
$selectedFile = $null

if ($BackupFile) {
    # 4a. Cek jika path eksak (absolut / relatif langsung)
    if (Test-Path $BackupFile) {
        $selectedFile = Get-Item $BackupFile
    } else {
        $inBackupDir = Join-Path $BackupDir $BackupFile
        if (Test-Path $inBackupDir) {
            $selectedFile = Get-Item $inBackupDir
        } else {
            # 4b. Coba cari berdasarkan kecocokan nama atau Git commit hash
            $matched = $backupFiles | Where-Object { $_.Name -like "*$BackupFile*" }
            if ($matched.Count -ge 1) {
                $selectedFile = $matched[0] # Pilih yang paling baru dari hasil pencocokan
                Write-Host "[MATCH] Ditemukan file backup untuk query '$BackupFile': $($selectedFile.Name)" -ForegroundColor Cyan
            } else {
                Write-Error "File backup atau pencocokan commit '$BackupFile' tidak ditemukan di folder '$BackupDir'!"
                exit 1
            }
        }
    }
} elseif ($Latest) {
    if ($backupFiles.Count -eq 0) {
        Write-Error "Tidak ada file backup yang ditemukan di '$BackupDir'!"
        exit 1
    }
    $selectedFile = $backupFiles[0]
} else {
    if ($backupFiles.Count -eq 0) {
        Write-Error "Tidak ditemukan file backup (*.sql / *.dump) di folder '$BackupDir'!"
        exit 1
    }

    if ($backupFiles.Count -eq 1) {
        $selectedFile = $backupFiles[0]
        Write-Host "[INFO] Ditemukan 1 file backup: $($selectedFile.Name)" -ForegroundColor Cyan
    } else {
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host "         DAFTAR VERSI FILE BACKUP TERSEDIA" -ForegroundColor Cyan
        Write-Host "==========================================================" -ForegroundColor Cyan
        Write-Host "Folder: $BackupDir`n"

        for ($i = 0; $i -lt $backupFiles.Count; $i++) {
            $item = $backupFiles[$i]
            $sizeMB = [math]::Round($item.Length / 1MB, 2)
            $badge = if ($i -eq 0) { " (TERBARU)" } else { "" }

            # Cek apakah nama file memiliki commit hash
            $commitMatch = [regex]::Match($item.Name, 'commit_([a-zA-Z0-9]+)')
            $commitLabel = if ($commitMatch.Success) { " [Git Commit: $($commitMatch.Groups[1].Value)]" } else { "" }

            Write-Host "  [$($i + 1)] $($item.Name) - $sizeMB MB$commitLabel - $($item.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))$badge"
        }

        Write-Host ""
        $choice = Read-Host "Pilih nomor file backup yang ingin di-restore (atau 'q' untuk batal) [Default: 1]"
        if ([string]::IsNullOrWhiteSpace($choice)) {
            $choiceIndex = 0
        } elseif ($choice -in @("q", "Q", "exit", "batal")) {
            Write-Host "[BATAL] Proses restore dibatalkan." -ForegroundColor Yellow
            exit 0
        } elseif ($choice -match '^\d+$') {
            $choiceIndex = ([int]$choice) - 1
        } else {
            Write-Error "Input '$choice' tidak valid! Masukkan angka nomor pilihan atau 'q' untuk batal."
            exit 1
        }

        if ($choiceIndex -lt 0 -or $choiceIndex -ge $backupFiles.Count) {
            Write-Error "Pilihan nomor '$choice' tidak valid!"
            exit 1
        }

        $selectedFile = $backupFiles[$choiceIndex]
    }
}

if (-not $selectedFile -or -not (Test-Path $selectedFile.FullName)) {
    Write-Error "File backup yang dipilih tidak valid atau tidak dapat diakses!"
    exit 1
}

$fileSizeMB = [math]::Round($selectedFile.Length / 1MB, 2)

# Ekstrak tag commit jika ada
$commitRef = [regex]::Match($selectedFile.Name, 'commit_([a-zA-Z0-9]+)')
$commitDisplay = if ($commitRef.Success) { $commitRef.Groups[1].Value } else { "N/A" }

# 5. Konfirmasi sebelum drop & restore
Write-Host "`n==========================================================" -ForegroundColor Red
Write-Host "           PERINGATAN RESTORE DATABASE (DESTRUCTIVE)" -ForegroundColor Red
Write-Host "==========================================================" -ForegroundColor Red
Write-Host "Container   : $ContainerName"
Write-Host "Target DB   : $DbName"
Write-Host "File Backup : $($selectedFile.Name)"
if ($commitDisplay -ne "N/A") {
    Write-Host "Git Commit  : $commitDisplay" -ForegroundColor Magenta
}
Write-Host "Ukuran File : $fileSizeMB MB ($($selectedFile.Length) bytes)"
Write-Host "Tanggal     : $($selectedFile.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-Host "----------------------------------------------------------"
Write-Host "Tindakan ini akan:" -ForegroundColor Yellow
Write-Host "1. Memutuskan semua koneksi aktif ke '$DbName'." -ForegroundColor Yellow
Write-Host "2. MENGHAPUS (DROP) total database '$DbName' yang sedang aktif." -ForegroundColor Yellow
Write-Host "3. Membuat database kosong baru '$DbName'." -ForegroundColor Yellow
Write-Host "4. Me-restore 100% schema, enum, tabel, & data dari file backup." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Red

if (-not $Force) {
    $confirm = Read-Host "Apakah Anda yakin ingin melanjutkan proses restore ini? (y/N)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "[BATAL] Proses restore dibatalkan oleh user." -ForegroundColor Yellow
        exit 0
    }
}

$randomId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$ext = $selectedFile.Extension
$tempInContainer = "/tmp/restore_${randomId}${ext}"

try {
    # 6. Putuskan koneksi aktif
    Write-Host "`n[1/5] Memutuskan koneksi aktif ke database '$DbName'..." -ForegroundColor Cyan
    docker exec -i $ContainerName psql -U $DbUser -d $MaintenanceDb -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DbName' AND pid <> pg_backend_pid();" | Out-Null

    # 7. Hapus database aktif
    Write-Host "[2/5] Menghapus (DROP) database '$DbName'..." -ForegroundColor Cyan
    docker exec -i $ContainerName psql -U $DbUser -d $MaintenanceDb -c "DROP DATABASE IF EXISTS `"$DbName`" WITH (FORCE);"
    if ($LASTEXITCODE -ne 0) {
        throw "Gagal menghapus database '$DbName'."
    }

    # 8. Buat database baru kosong
    Write-Host "[3/5] Membuat database kosong baru '$DbName'..." -ForegroundColor Cyan
    docker exec -i $ContainerName psql -U $DbUser -d $MaintenanceDb -c "CREATE DATABASE `"$DbName`" OWNER `"$DbUser`";"
    if ($LASTEXITCODE -ne 0) {
        throw "Gagal membuat database baru '$DbName'."
    }

    # 9. Salin file backup ke dalam container
    Write-Host "[4/5] Menyalin file backup ke dalam container..." -ForegroundColor Cyan
    docker cp "$($selectedFile.FullName)" "${ContainerName}:${tempInContainer}"
    if ($LASTEXITCODE -ne 0) {
        throw "Gagal menyalin file backup ke container."
    }

    # 10. Eksekusi restore
    Write-Host "[5/5] Me-restore schema dan data 100% ke database '$DbName'..." -ForegroundColor Cyan
    if ($ext -eq ".dump" -or $ext -eq ".tar") {
        docker exec -i $ContainerName pg_restore -U $DbUser -d $DbName -v $tempInContainer
    } else {
        docker exec -i $ContainerName psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -f $tempInContainer | Out-Null
    }

    if ($LASTEXITCODE -ne 0) {
        throw "Restore database gagal saat mengeksekusi dump."
    }

    # 11. Bersihkan file temp di container
    docker exec $ContainerName rm -f $tempInContainer

    # 12. Verifikasi hasil restore
    $tableCount = docker exec -i $ContainerName psql -U $DbUser -d $DbName -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
    $drizzleCount = docker exec -i $ContainerName psql -U $DbUser -d $DbName -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'drizzle';"

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "RESTORE BERHASIL 100%!" -ForegroundColor Green
    Write-Host "Database       : $DbName" -ForegroundColor Green
    Write-Host "Tabel (public) : $tableCount tabel" -ForegroundColor Green
    Write-Host "Tabel (drizzle): $drizzleCount tabel" -ForegroundColor Green
    Write-Host "Status         : Database kembali 100% sesuai file backup!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
}
catch {
    docker exec $ContainerName rm -f $tempInContainer 2>$null
    Write-Error "Terjadi error saat proses restore: $_"
    exit 1
}
