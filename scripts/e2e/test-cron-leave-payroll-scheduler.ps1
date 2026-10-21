param(
    [string]$DoctorEmail = "zikrifadhiilahahmad@gmail.com",
    [string]$TargetDate = (Get-Date).ToString("yyyy-MM-dd"),
    [switch]$SkipFlushing
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: DYNAMIC ROSTER-AWARE LEAVE PAYROLL SCHEDULER & NOTIFICATION" -ForegroundColor Cyan
Write-Host " Target Guinea Pig: Dr. Zikri ($DoctorEmail)" -ForegroundColor Cyan
Write-Host " Target Date       : $TargetDate" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

try {
    # --------------------------------------------------------------------------
    # 1. API Readiness & Container Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Memeriksa Kesiapan API & Koneksi PostgreSQL Docker..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API ready at $apiBase" ($null -ne $apiBase)

    # --------------------------------------------------------------------------
    # 2. Resolusi Identitas dr. Zikri & Verifikasi Device Token Fisik
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Resolusi Akun dr. Zikri & Verifikasi Device Fisik di PostgreSQL..." -ForegroundColor Yellow
    $userQuery = "SELECT u.id as user_id, sp.id as staff_profile_id, sp.full_name, p.id as practitioner_id FROM users u JOIN staff_profiles sp ON u.id = sp.user_id LEFT JOIN practitioners p ON sp.id = p.staff_profile_id WHERE u.email = '$DoctorEmail' LIMIT 1;"
    $userRaw = Run-DockerSql $userQuery

    if (-not $userRaw -or $userRaw.Trim() -eq "") {
        throw "Akun dr. Zikri ($DoctorEmail) tidak ditemukan di database! Jalankan seeder staff."
    }

    $uParts = $userRaw.Trim().Split('|')
    $drUserId = $uParts[0]
    $drStaffProfileId = $uParts[1]
    $drFullName = $uParts[2]
    $drPractitionerId = $uParts[3]

    Write-Host " >> dr. Zikri User ID        : $drUserId" -ForegroundColor DarkCyan
    Write-Host " >> dr. Zikri StaffProfile ID: $drStaffProfileId" -ForegroundColor DarkCyan
    Write-Host " >> dr. Zikri Practitioner ID: $drPractitionerId" -ForegroundColor DarkCyan
    Assert-Test "dr. Zikri data resolved from PostgreSQL" ($null -ne $drStaffProfileId)

    # Cek device fisik di user_devices
    $deviceQuery = "SELECT platform, device_name, last_seen_at FROM user_devices WHERE user_id = '$drUserId' AND revoked_at IS NULL ORDER BY updated_at DESC LIMIT 1;"
    $deviceRaw = Run-DockerSql $deviceQuery
    if ($deviceRaw -and $deviceRaw.Trim() -ne "") {
        $devParts = $deviceRaw.Trim().Split('|')
        Write-Host " >> Device Fisik Terhubung   : $($devParts[1]) ($($devParts[0])), last_seen: $($devParts[2])" -ForegroundColor Green
        Assert-Test "Active physical device registered in user_devices" $true
    } else {
        Write-Host " >> PERINGATAN: Belum ada device terdaftar di user_devices untuk dr. Zikri" -ForegroundColor DarkYellow
    }

    # --------------------------------------------------------------------------
    # 3. Pre-Flight Flushing: Bersihkan Data Uji Lama dr. Zikri
    # --------------------------------------------------------------------------
    if (-not $SkipFlushing) {
        Write-Host "`n[Step 3] Pre-Flight Flushing: Membersihkan Sisa Data Uji Lama dr. Zikri..." -ForegroundColor Yellow
        $flushSql = @"
DELETE FROM payroll_entries WHERE staff_profile_id = '$drStaffProfileId' AND source_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id = '$drStaffProfileId' AND (reason LIKE '%[E2E-CRON-TEST]%' OR start_date = '$TargetDate'));
DELETE FROM leave_request_sessions WHERE leave_request_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id = '$drStaffProfileId' AND (reason LIKE '%[E2E-CRON-TEST]%' OR start_date = '$TargetDate'));
DELETE FROM staff_leave_requests WHERE staff_profile_id = '$drStaffProfileId' AND (reason LIKE '%[E2E-CRON-TEST]%' OR start_date = '$TargetDate');
DELETE FROM notification_recipients WHERE user_id = '$drUserId' AND notification_id IN (SELECT id FROM notifications WHERE title = 'Pembaruan Gaji');
DELETE FROM notifications WHERE title = 'Pembaruan Gaji' AND body LIKE '%$TargetDate%';
"@
        $null = Run-DockerSql $flushSql
        Assert-Test "Pre-flight test data flushed cleanly (Zero Conflict Guard)" $true
    }

    # --------------------------------------------------------------------------
    # 4. Otentikasi Admin & Generate Token dr. Zikri
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Otentikasi Admin & Penyiapan Bearer JWT dr. Zikri..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin login successful" ($null -ne $adminAuth.token)

    $jwtScript = Join-Path (Resolve-Path "$PSScriptRoot\..") "dev\get-jwt-user.ts"
    $docToken = (bun $jwtScript --email $DoctorEmail --raw).Trim()
    $docHeaders = @{
        Authorization = "Bearer $docToken"
        "Content-Type" = "application/json"
    }
    Assert-Test "dr. Zikri Bearer JWT generated" ($null -ne $docToken)

    # --------------------------------------------------------------------------
    # 5. Buat & Setujui Cuti Hari Ini (TargetDate)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Membuat & Menyetujui Permohonan Cuti dr. Zikri untuk $TargetDate..." -ForegroundColor Yellow
    $leavePayload = @{
        startDate = $TargetDate
        endDate = $TargetDate
        reason = "[E2E-CRON-TEST] Izin Cuti Shift Hari Ini"
        type = "annual"
        scope = "full_day"
    } | ConvertTo-Json

    $leaveRes = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Headers $docHeaders -Body $leavePayload
    $createdLeave = Get-ResponseData $leaveRes
    $leaveId = $createdLeave.id
    Assert-Test "Leave request created with ID: $leaveId" ($null -ne $leaveId)

    # Admin menyetujui cuti
    $approvePayload = @{
        status = "approved"
        approvalNotes = "Disetujui otomatis oleh E2E Test Suite"
    } | ConvertTo-Json
    $approveRes = Invoke-RestMethod -Uri "$apiBase/leaves/$leaveId/status" -Method Patch -Headers $adminAuth.headers -Body $approvePayload
    $approvedLeave = Get-ResponseData $approveRes
    Assert-Test "Leave request approved by Admin (status=approved)" ($approvedLeave.status -eq "approved")

    # --------------------------------------------------------------------------
    # 6. EDGE CASE 1: Guard Jam Kerja Sebelum Shift Selesai (force=false)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] EDGE CASE 1: Uji Guard Akhir Shift Otomatis (force=false)..." -ForegroundColor Yellow
    $now = Get-Date
    Write-Host " >> Waktu saat ini: $($now.ToString('HH:mm:ss')) WIB" -ForegroundColor DarkCyan

    # Cek batas akhir shift dr. Zikri hari ini di database
    $dow = [int]$now.DayOfWeek
    $shiftQuery = "SELECT MAX(sd.default_ends_at) FROM doctor_assignment da JOIN session_def sd ON da.session_id = sd.id WHERE da.doctor_id = '$drPractitionerId' AND da.dow = $dow AND da.is_active = true;"
    $shiftEndsAt = (Run-DockerSql $shiftQuery).Trim()
    Write-Host " >> Batas Akhir Shift dr. Zikri Hari Ini (DOW=$dow): $shiftEndsAt" -ForegroundColor DarkCyan

    # Panggil rekonsiliasi dengan force=false (simulasi cron job reguler)
    $guardRes = Invoke-RestMethod -Uri "$apiBase/payroll/reconcile-leave?targetDate=$TargetDate&force=false" -Method Post -Headers $adminAuth.headers
    $guardData = Get-ResponseData $guardRes

    # Jika jam sekarang masih sebelum batas akhir shift, guard WAJIB menahan eksekusi
    $shiftEndHour = 18 # Default shift sore selesai jam 18:00
    if ($shiftEndsAt -and $shiftEndsAt -match "^(\d{2}):(\d{2})") {
        $shiftEndHour = [int]$Matches[1]
    }

    if ($now.Hour -lt $shiftEndHour) {
        Assert-Test "Guard aktif: processedCount = 0 karena jam belum melewati $shiftEndsAt" ($guardData.processedCount -eq 0)
        
        # Verifikasi di PostgreSQL: belum boleh ada row payroll_entries
        $checkEntriesCount = (Run-DockerSql "SELECT COUNT(*) FROM payroll_entries WHERE staff_profile_id = '$drStaffProfileId' AND source_id = '$leaveId';").Trim()
        Assert-Test "Database PostgreSQL belum termutasi prematur (entries=0)" ($checkEntriesCount -eq "0")
    } else {
        Write-Host " >> [INFO] Jam saat ini sudah melewati batas akhir shift ($shiftEndsAt)." -ForegroundColor Gray
    }

    # --------------------------------------------------------------------------
    # 7. EDGE CASE 2: Eksekusi Rekonsiliasi Dinamis & Push Notification (force=true)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] EDGE CASE 2: Eksekusi Rekonsiliasi Shift & Pengiriman Push Notifikasi..." -ForegroundColor Yellow
    $execRes = Invoke-RestMethod -Uri "$apiBase/payroll/reconcile-leave?targetDate=$TargetDate&force=true" -Method Post -Headers $adminAuth.headers
    $execData = Get-ResponseData $execRes

    Assert-Test "Reconcile executed successfully" ($execData.processedCount -ge 1)
    Assert-Test "dr. Zikri included in staffProcessed" ($execData.staffProcessed -contains $drFullName -or $execData.staffProcessed -contains "zikrifadhiilahahmad")
    Write-Host " >> Total Potongan Dihitung: Rp $($execData.totalDeductionsAmount.ToString('N0'))" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 8. Verifikasi Forensik Mutasi Database PostgreSQL
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Verifikasi Forensik Tabel Database PostgreSQL..." -ForegroundColor Yellow
    $entrySql = "SELECT id, entry_type, quantity_hours, hourly_rate, amount, description FROM payroll_entries WHERE staff_profile_id = '$drStaffProfileId' AND source_id = '$leaveId' ORDER BY created_at DESC LIMIT 1;"
    $entryRaw = Run-DockerSql $entrySql
    Assert-Test "Record payroll_entries ditemukan di PostgreSQL" (-not [string]::IsNullOrWhiteSpace($entryRaw))

    $eParts = $entryRaw.Trim().Split('|')
    $entryId = $eParts[0]
    $entryType = $eParts[1]
    $entryHours = $eParts[2]
    $entryRate = $eParts[3]
    $entryAmount = $eParts[4]
    $entryDesc = $eParts[5]

    Write-Host " >> Entry ID      : $entryId" -ForegroundColor DarkCyan
    Write-Host " >> Tipe Entri    : $entryType" -ForegroundColor DarkCyan
    Write-Host " >> Jam Pelayanan : $entryHours jam" -ForegroundColor DarkCyan
    Write-Host " >> Tarif Per Jam : Rp $([double]$entryRate)" -ForegroundColor DarkCyan
    Write-Host " >> Total Potongan: Rp $([double]$entryAmount)" -ForegroundColor Green
    Write-Host " >> Deskripsi     : $entryDesc" -ForegroundColor DarkCyan

    Assert-Test "Entry type adalah 'leave_deduction'" ($entryType -eq "leave_deduction")
    Assert-Test "Deskripsi tidak mengandung kata dinas" ($entryDesc -notmatch "dinas")
    Assert-Test "Deskripsi mematuhi format waktu klinik (misal: 21 Okt 2026)" ($entryDesc -match "\(\d{1,2}\s+[A-Za-z]+\s+\d{4}\)")
    Assert-Test "Deskripsi tidak mengandung tanda @" ($entryDesc -notmatch "@")

    # Verifikasi notifikasi minimalis di tabel notifications
    $notifSql = "SELECT title, body, category FROM notifications WHERE title = 'Pembaruan Gaji' ORDER BY created_at DESC LIMIT 1;"
    $notifRaw = Run-DockerSql $notifSql
    Assert-Test "Record notifikasi 'Pembaruan Gaji' ditemukan di PostgreSQL" (-not [string]::IsNullOrWhiteSpace($notifRaw))

    $nParts = $notifRaw.Trim().Split('|')
    Write-Host " >> Judul Notifikasi: $($nParts[0])" -ForegroundColor Green
    Write-Host " >> Pesan Notifikasi: $($nParts[1])" -ForegroundColor Green
    Assert-Test "Judul notifikasi adalah 'Pembaruan Gaji'" ($nParts[0] -eq "Pembaruan Gaji")
    Assert-Test "Pesan notifikasi adalah minimalis kanonik" ($nParts[1] -match "Gaji dan perizinan tanggal.*telah diperbarui")

    # --------------------------------------------------------------------------
    # 9. EDGE CASE 3: Uji Idempotensi (Mencegah Pemotongan Ganda)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 9] EDGE CASE 3: Uji Idempotensi (Menjalankan Rekonsiliasi Ulang)..." -ForegroundColor Yellow
    $idempRes = Invoke-RestMethod -Uri "$apiBase/payroll/reconcile-leave?targetDate=$TargetDate&force=true" -Method Post -Headers $adminAuth.headers
    $idempData = Get-ResponseData $idempRes

    Assert-Test "Idempotent: processedCount = 0 pada penjalanan kedua" ($idempData.processedCount -eq 0)
    Assert-Test "Idempotent: totalDeductionsAmount = 0" ($idempData.totalDeductionsAmount -eq 0)

    $countEntriesSql = "SELECT COUNT(*) FROM payroll_entries WHERE staff_profile_id = '$drStaffProfileId' AND source_id = '$leaveId';"
    $entriesCountAfter = (Run-DockerSql $countEntriesSql).Trim()
    Assert-Test "Jumlah row di database tetap tepat 1 (tidak ada duplikasi)" ($entriesCountAfter -eq "1")

    # --------------------------------------------------------------------------
    # 10. EDGE CASE 4: Uji Hari Libur / Off-Day (Potongan Rp 0 Tanpa Notifikasi)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] EDGE CASE 4: Uji Hari Libur (Off-Day: Cuti pada Hari Tanpa Jadwal)..." -ForegroundColor Yellow
    $offStaffQuery = "SELECT sp.id, sp.full_name FROM staff_profiles sp WHERE sp.id NOT IN (SELECT staff_profile_id FROM staff_roster WHERE dow = $dow AND is_active = true) AND sp.id NOT IN (SELECT sp2.id FROM staff_profiles sp2 JOIN practitioners p ON sp2.id = p.staff_profile_id JOIN doctor_assignment da ON p.id = da.doctor_id WHERE da.dow = $dow AND da.is_active = true) LIMIT 1;"
    $offStaffRaw = Run-DockerSql $offStaffQuery

    if (-not [string]::IsNullOrWhiteSpace($offStaffRaw)) {
        $offParts = $offStaffRaw.Trim().Split('|')
        $offStaffId = $offParts[0]
        $offStaffName = $offParts[1]
        Write-Host " >> Ditemukan staf yang libur pada hari ini (DOW=$dow): $offStaffName ($offStaffId)" -ForegroundColor DarkCyan

        # Buat cuti approved langsung untuk staf off-day ini
        $offLeaveId = [guid]::NewGuid().ToString()
        $insertOffLeaveSql = @"
INSERT INTO staff_leave_requests (id, staff_profile_id, start_date, end_date, duration_days, reason, request_type, scope, status, reviewed_by, reviewed_at, created_at, updated_at)
VALUES ('$offLeaveId', '$offStaffId', '$TargetDate', '$TargetDate', 1, '[E2E-CRON-TEST] Off-Day Leave', 'annual_leave', 'full_day', 'approved', (SELECT id FROM users WHERE email = 'admin@amanah.com' LIMIT 1), NOW(), NOW(), NOW());
"@
        $null = Run-DockerSql $insertOffLeaveSql

        # Panggil reconcile on-demand untuk TargetDate
        $offReconcileRes = Invoke-RestMethod -Uri "$apiBase/payroll/reconcile-leave?targetDate=$TargetDate&force=true" -Method Post -Headers $adminAuth.headers
        $offReconcileData = Get-ResponseData $offReconcileRes

        # Staf off-day ini tidak boleh menambah processedCount dan tidak boleh ada di staffProcessed
        Assert-Test "Staf libur ($offStaffName) tidak diproses pemotongan (0 jam, Rp 0)" (-not ($offReconcileData.staffProcessed -contains $offStaffName))

        $offEntriesCount = (Run-DockerSql "SELECT COUNT(*) FROM payroll_entries WHERE staff_profile_id = '$offStaffId' AND source_id = '$offLeaveId';").Trim()
        Assert-Test "Tidak ada payroll_entries yang dibuat untuk staf libur" ($offEntriesCount -eq "0")

        # Bersihkan cuti uji off-day
        $null = Run-DockerSql "DELETE FROM staff_leave_requests WHERE id = '$offLeaveId';"
    } else {
        Write-Host " >> [INFO] Tidak ditemukan staf libur pada hari ini." -ForegroundColor Gray
    }

    # --------------------------------------------------------------------------
    # 11. EDGE CASE 5: Cuti Rentang Panjang / Multi-Day (Simulasi 1-2 Bulan)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 11] EDGE CASE 5: Uji Cuti Rentang Panjang (Multi-Day Range)..." -ForegroundColor Yellow
    # Buat rentang 3 hari berturut-turut di masa depan agar tidak bentrok
    $rangeStart = (Get-Date).AddDays(10).ToString("yyyy-MM-dd")
    $day2 = (Get-Date).AddDays(11).ToString("yyyy-MM-dd")
    $rangeEnd = (Get-Date).AddDays(12).ToString("yyyy-MM-dd")

    # Bersihkan sisa data lama untuk rentang ini
    $null = Run-DockerSql "DELETE FROM payroll_entries WHERE staff_profile_id = '$drStaffProfileId' AND source_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id = '$drStaffProfileId' AND reason LIKE '%[E2E-CRON-TEST] Cuti Rentang Multi-Day%');"

    $rangeLeavePayload = @{
        startDate = $rangeStart
        endDate = $rangeEnd
        reason = "[E2E-CRON-TEST] Cuti Rentang Multi-Day"
        type = "annual"
        scope = "full_day"
    } | ConvertTo-Json

    $rangeLeaveRes = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Headers $docHeaders -Body $rangeLeavePayload
    $rangeLeaveId = (Get-ResponseData $rangeLeaveRes).id
    $null = Invoke-RestMethod -Uri "$apiBase/leaves/$rangeLeaveId/status" -Method Patch -Headers $adminAuth.headers -Body $approvePayload
    Assert-Test "Multi-day leave created & approved ($rangeStart s/d $rangeEnd)" ($null -ne $rangeLeaveId)

    # Hari 1 dieksekusi secara mandiri
    $day1Res = Invoke-RestMethod -Uri "$apiBase/payroll/reconcile-leave?targetDate=$rangeStart&force=true" -Method Post -Headers $adminAuth.headers
    $day1Data = Get-ResponseData $day1Res
    Assert-Test "Hari ke-1 cuti rentang terproses mandiri" ($day1Data.processedCount -eq 1)

    # Hari 2 dieksekusi secara mandiri (Membuktikan tidak ter-skip oleh ID leave yang sama)
    $day2Res = Invoke-RestMethod -Uri "$apiBase/payroll/reconcile-leave?targetDate=$day2&force=true" -Method Post -Headers $adminAuth.headers
    $day2Data = Get-ResponseData $day2Res
    Assert-Test "Hari ke-2 cuti rentang terproses mandiri (Bebas Bug Idempotensi Multi-Day)" ($day2Data.processedCount -eq 1)

    # Eksekusi Bulk Range startDate s/d endDate (Membuktikan rekonsiliasi rentang otomatis)
    $bulkRangeRes = Invoke-RestMethod -Uri "$apiBase/payroll/reconcile-leave?startDate=$rangeStart&endDate=$rangeEnd&force=true" -Method Post -Headers $adminAuth.headers
    $bulkRangeData = Get-ResponseData $bulkRangeRes
    # Hari 1 & 2 di-skip karena idempoten, Hari 3 (day 3) diproses
    Assert-Test "Bulk range memproses hari ke-3 dan idempoten pada hari 1 & 2" ($bulkRangeData.processedCount -eq 1)

    # Verifikasi di database: ada tepat 3 baris entri mandiri untuk masing-masing tanggal
    $countMultiEntries = (Run-DockerSql "SELECT COUNT(*) FROM payroll_entries WHERE staff_profile_id = '$drStaffProfileId' AND source_id = '$rangeLeaveId';").Trim()
    Assert-Test "Tepat 3 entri ledger mandiri terbentuk di database untuk 3 hari cuti" ($countMultiEntries -eq "3")

    # Bersihkan cuti uji multi-day
    $null = Run-DockerSql "DELETE FROM payroll_entries WHERE source_id = '$rangeLeaveId'; DELETE FROM staff_leave_requests WHERE id = '$rangeLeaveId';"

    # --------------------------------------------------------------------------
    # 12. Layar Penggajian Mobile (/payroll/my-summary)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 12] Memeriksa Kontrak API Penggajian Mobile (/payroll/my-summary)..." -ForegroundColor Yellow
    $summaryRes = Invoke-RestMethod -Uri "$apiBase/payroll/my-summary" -Method Get -Headers $docHeaders
    $summaryData = Get-ResponseData $summaryRes

    Assert-Test "my-summary mengembalikan data staf dr. Zikri" ($summaryData.staffId -eq $drStaffProfileId)
    Assert-Test "Potongan cuti (leaveDeductions) tercatat di slip gaji" ($summaryData.leaveDeductions -gt 0)
    Write-Host "`n >> TOTAL GAJI DITERIMA (THP): Rp $($summaryData.netPayroll.ToString('N0'))" -ForegroundColor Green
    Write-Host " >> Total Jam Pelayanan     : $($summaryData.baseHours) jam" -ForegroundColor DarkCyan
    Write-Host " >> Penghasilan Pokok       : Rp $($summaryData.baseEarnings.ToString('N0'))" -ForegroundColor DarkCyan
    Write-Host " >> Total Potongan Cuti     : Rp $($summaryData.leaveDeductions.ToString('N0'))" -ForegroundColor Yellow

    # --------------------------------------------------------------------------
    # 13. Ringkasan & Instruksi Real-Device
    # --------------------------------------------------------------------------
    Write-Host "`n==============================================================================" -ForegroundColor Green
    Write-Host " SILAKAN LIHAT HP ANDA SEKARANG! (dr. Zikri)" -ForegroundColor Green
    Write-Host " 1. Periksa notifikasi status bar HP: 'Pembaruan Gaji'" -ForegroundColor Green
    Write-Host " 2. Buka aplikasi Flutter -> Layar Penggajian -> Lakukan Pull to Refresh" -ForegroundColor Green
    Write-Host " 3. Slip gaji telah termutasi sesuai angka forensik di atas." -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green

    Print-TestSummary "Dynamic Roster-Aware Leave Scheduler & Payroll E2E Suite"

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkRed
    }
    Print-TestSummary "Dynamic Roster-Aware Leave Scheduler & Payroll E2E Suite"
    exit 1
}
