param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: ATTENDANCE VARIED SCENARIOS & REPLACEMENT VERIFICATION SUITE" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

function Get-DynamicStaffJwt([string]$email) {
    $backendDir = Resolve-Path "$PSScriptRoot\..\.."
    $jwtScript = Join-Path $backendDir "scripts\dev\get-jwt-user.ts"
    $token = (bun $jwtScript --email "$email" --raw).Trim()
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Failed to generate dynamic JWT token for $email"
    }
    return @{
        token = $token
        headers = @{
            Authorization = "Bearer $token"
            "Content-Type" = "application/json"
        }
    }
}

try {
    # --------------------------------------------------------------------------
    # 0. API Readiness & Dynamic Authoritative Tokens
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 0] API Readiness & Dynamic Staff Token Acquisition..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    $doctorEmail = "zikrifadhiilahahmad@gmail.com"
    $doctorAuth = Get-DynamicStaffJwt $doctorEmail
    Assert-Test "Doctor JWT generated for $doctorEmail" ($null -ne $doctorAuth.token)

    $origDocEmail = "dokter@amanah.com"
    $origDocAuth = Get-DynamicStaffJwt $origDocEmail
    Assert-Test "Original Doctor JWT generated for $origDocEmail" ($null -ne $origDocAuth.token)

    $workerEmail = "staff.operasional@amanah.clinic"
    $workerAuth = Get-DynamicStaffJwt $workerEmail
    Assert-Test "Replacement Worker JWT generated for $workerEmail" ($null -ne $workerAuth.token)

    $midwifeEmail = "bidan.siti@amanah.clinic"
    $midwifeAuth = Get-DynamicStaffJwt $midwifeEmail
    Assert-Test "Midwife JWT generated for $midwifeEmail" ($null -ne $midwifeAuth.token)

    $frontdeskEmail = "frontdesk.dimas@amanah-healthcare.test"
    $frontdeskAuth = Get-DynamicStaffJwt $frontdeskEmail
    Assert-Test "Frontdesk JWT generated for $frontdeskEmail" ($null -ne $frontdeskAuth.token)

    # Resolve Staff Profile IDs and Practitioner IDs from PostgreSQL
    $doctorProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$doctorEmail');").Trim()
    $doctorPractitionerId = (Run-DockerSql "SELECT id FROM practitioners WHERE staff_profile_id = '$doctorProfileId' LIMIT 1;").Trim()

    $origDocProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$origDocEmail');").Trim()
    $origDocPractitionerId = (Run-DockerSql "SELECT id FROM practitioners WHERE staff_profile_id = '$origDocProfileId' LIMIT 1;").Trim()

    $workerProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$workerEmail');").Trim()
    $midwifeProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$midwifeEmail');").Trim()
    $frontdeskProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$frontdeskEmail');").Trim()

    $afternoonSessionId = (Run-DockerSql "SELECT id FROM session_def WHERE code = 'afternoon';").Trim()
    $morningSessionId = (Run-DockerSql "SELECT id FROM session_def WHERE code = ;").Trim()

    Assert-Test "Doctor profile ID resolved: $doctorProfileId" (-not [string]::IsNullOrWhiteSpace($doctorProfileId))
    Assert-Test "Original Doctor profile ID resolved: $origDocProfileId" (-not [string]::IsNullOrWhiteSpace($origDocProfileId))
    Assert-Test "Worker profile ID resolved: $workerProfileId" (-not [string]::IsNullOrWhiteSpace($workerProfileId))
    Assert-Test "Midwife profile ID resolved: $midwifeProfileId" (-not [string]::IsNullOrWhiteSpace($midwifeProfileId))
    Assert-Test "Frontdesk profile ID resolved: $frontdeskProfileId" (-not [string]::IsNullOrWhiteSpace($frontdeskProfileId))

    # --------------------------------------------------------------------------
    # 1. Clean Baseline for Target Test Profiles for Today
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Preparing Clean Baseline for Target Test Actors..." -ForegroundColor Yellow
    $allTestProfiles = "'$doctorProfileId', '$origDocProfileId', '$workerProfileId', '$midwifeProfileId', '$frontdeskProfileId'"
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_type = 'attendance' AND source_id IN (SELECT id FROM staff_attendance_records WHERE staff_profile_id IN ($allTestProfiles) AND attendance_date = CURRENT_DATE);"
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE attendance_date = CURRENT_DATE AND staff_profile_id IN ($allTestProfiles);"
    Run-DockerSql "DELETE FROM replacement_opportunities WHERE work_date = CURRENT_DATE AND (original_staff_profile_id IN ($allTestProfiles) OR claimed_by_staff_profile_id IN ($allTestProfiles));"
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE start_date = CURRENT_DATE AND staff_profile_id IN ($allTestProfiles);"
    Write-Host "  >> Cleaned today's previous records for test actors." -ForegroundColor Gray

    # --------------------------------------------------------------------------
    # 2. Skenario 1: Early Checkout Flow with Edge Case Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Skenario 1: Early Checkout (Kepulangan Awal)..." -ForegroundColor Yellow

    # Active terminal QR rotation
    $rotRes1 = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $token1 = (Get-ResponseData $rotRes1).qrCodeIdentifier

    # Doctor check-in to afternoon session
    $docScanBody = @{ qrToken = $token1; deviceInfo = "Doctor Mobile (Early Checkout Scenario)" } | ConvertTo-Json
    $docScanRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $docScanBody
    $docScanData = Get-ResponseData $docScanRes
    Assert-Test "Doctor checked in successfully (HTTP 201 Created)" ($null -ne $docScanData.id)
    $doctorAttendanceId = $docScanData.id

    # Edge Case: Early Checkout WITHOUT notes MUST throw 400 EARLY_DEPARTURE_NOTES_REQUIRED
    $rotResCo1 = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $tokenCo1 = (Get-ResponseData $rotResCo1).qrCodeIdentifier

    $earlyCheckoutThrewRequired = $false
    $receivedTicket1 = $null
    try {
        $noNotesBody = @{ qrToken = $tokenCo1 } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $noNotesBody
    } catch {
        $errObj = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($errObj.code -eq "EARLY_DEPARTURE_NOTES_REQUIRED") {
            $earlyCheckoutThrewRequired = $true
            $receivedTicket1 = $errObj.details.checkoutTicket
        }
    }
    Assert-Test "Early departure without notes rejected with EARLY_DEPARTURE_NOTES_REQUIRED" $earlyCheckoutThrewRequired
    Assert-Test "Checkout ticket issued for early departure" (-not [string]::IsNullOrWhiteSpace($receivedTicket1))

    # Doctor completes checkout WITH ticket and notes
    $validEarlyCoBody = @{
        qrToken = $tokenCo1
        checkoutTicket = $receivedTicket1
        notes = "Izin pulang lebih awal untuk menghadiri simposium medis (Early Checkout Test)"
    } | ConvertTo-Json
    $earlyCoRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $validEarlyCoBody
    $earlyCoData = Get-ResponseData $earlyCoRes

    Assert-Test "Early checkout completed successfully" ($null -ne $earlyCoData.checkOutAt)
    Assert-Test "isEarlyDeparture flag set to true" ($earlyCoData.isEarlyDeparture -eq $true)

    # Adjust check-in time in database to 45 minutes ago so web table displays realistic duration (e.g. 45 menit)
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '45 minutes', check_out_at = NOW(), validated_duration_hours = 0.75 WHERE id = '$doctorAttendanceId';"
    Write-Host "  >> Record 1 Created: Doctor Early Checkout (Duration: ~45 menit, isEarlyDeparture: true)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 3. Skenario 2: Checkout Biasa / Normal Checkout
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Skenario 2: Checkout Biasa (Normal Checkout)..." -ForegroundColor Yellow

    # Admin registers manual check-in for Midwife Siti Rahmawati
    $midwifeManualBody = @{
        staffIdOrCode = $midwifeProfileId
        shift = "morning"
        status = "present"
        notes = "Presensi dinas pagi Bidan Siti"
    } | ConvertTo-Json
    $midwifeManualRes = Invoke-RestMethod -Uri "$apiBase/attendance/manual" -Method Post -Headers $adminAuth.headers -Body $midwifeManualBody
    $midwifeManualData = Get-ResponseData $midwifeManualRes
    Assert-Test "Midwife manual check-in recorded" ($null -ne $midwifeManualData.id)
    $midwifeAttendanceId = $midwifeManualData.id

    # Admin completes normal checkout without early departure
    $midwifeCoBody = @{
        staffId = $midwifeProfileId
        notes = "Dinas pagi selesai penuh sesuai jadwal (Normal Checkout Test)"
    } | ConvertTo-Json
    $midwifeCoRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $adminAuth.headers -Body $midwifeCoBody
    $midwifeCoData = Get-ResponseData $midwifeCoRes
    Assert-Test "Midwife normal checkout completed" ($null -ne $midwifeCoData.checkOutAt)

    # Adjust check-in & check-out time in DB to span normal shift hours (07:30 to 14:45 = 7 jam 15 menit)
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = CURRENT_DATE + TIME '07:30:00', check_out_at = CURRENT_DATE + TIME '14:45:00', validated_duration_hours = 7.25, is_early_departure = false WHERE id = '$midwifeAttendanceId';"
    Write-Host "  >> Record 2 Created: Midwife Normal Checkout (Duration: 7 jam 15 menit, isEarlyDeparture: false)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 4. Skenario 3: Replacement Shift (Presensi Pengganti) - INTI FOKUS USER
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Skenario 3: Replacement (Presensi Pengganti) Flow & Contract Verification..." -ForegroundColor Yellow

    # 4A: Create approved leave for dr. Ahmad Santoso (Original Staff)
    $origLeaveId = [guid]::NewGuid().ToString()
    Run-DockerSql "INSERT INTO staff_leave_requests (id, staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_at, created_at, updated_at) VALUES ('$origLeaveId', '$origDocProfileId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Izin dinas luar kota (Konferensi)', 'approved', NOW(), NOW(), NOW());"

    # 4B: Create claimed replacement opportunity for Budi Santoso (Worker)
    $repOppId = [guid]::NewGuid().ToString()
    Run-DockerSql "INSERT INTO replacement_opportunities (id, leave_request_id, session_id, work_date, original_staff_profile_id, original_practitioner_id, claimed_by_staff_profile_id, claimed_at, status, notes, created_at, updated_at) VALUES ('$repOppId', '$origLeaveId', '$afternoonSessionId', CURRENT_DATE, '$origDocProfileId', '$origDocPractitionerId', '$workerProfileId', NOW(), 'claimed', 'Menggantikan dinas sore dr. Ahmad Santoso', NOW(), NOW());"
    Assert-Test "Replacement opportunity created and claimed: $repOppId" (-not [string]::IsNullOrWhiteSpace($repOppId))

    # 4C: Worker Budi Santoso scans active terminal QR
    $rotResRep = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body "{}"
    $tokenRep = (Get-ResponseData $rotResRep).qrCodeIdentifier

    $workerScanBody = @{ qrToken = $tokenRep; deviceInfo = "Worker Mobile (Replacement Check-In)" } | ConvertTo-Json
    $workerScanRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $workerAuth.headers -Body $workerScanBody
    $workerScanData = Get-ResponseData $workerScanRes

    Assert-Test "Worker replacement scan succeeded (HTTP 201 Created)" ($null -ne $workerScanData.id)
    Assert-Test "isReplacement is true in scan response" ($workerScanData.isReplacement -eq $true)
    Assert-Test "replacementOpportunityId matches" ($workerScanData.replacementOpportunityId -eq $repOppId)
    Assert-Test "replacedStaffName contains 'dr. Ahmad'" ($workerScanData.replacedStaffName -match "Ahmad")
    Assert-Test "replacedStaffCode is DOC-AMANAH-001" ($workerScanData.replacedStaffCode -eq "DOC-AMANAH-001")
    $workerAttendanceId = $workerScanData.id
    Write-Host "  >> Replaced Doctor: $($workerScanData.replacedStaffName) ($($workerScanData.replacedStaffCode))" -ForegroundColor Green

    # 4D: Worker Budi Santoso checks out of replacement shift
    $workerCoBody = @{
        qrToken = $tokenRep
        notes = "Selesai tugas dinas pengganti dr. Ahmad Santoso (Presensi Pengganti)"
    } | ConvertTo-Json
    $workerCoRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $workerAuth.headers -Body $workerCoBody
    $workerCoData = Get-ResponseData $workerCoRes

    Assert-Test "Worker replacement checkout succeeded" ($null -ne $workerCoData.checkOutAt)

    # 4E: Database Assertion: Opportunity transitioned to 'completed'
    $repOppStatus = (Run-DockerSql "SELECT status FROM replacement_opportunities WHERE id = '$repOppId';").Trim()
    Assert-Test "Replacement opportunity automatically marked 'completed' in DB" ($repOppStatus -eq "completed")

    # Adjust check-in time in DB to 3 hours 30 minutes ago so duration displays '3 jam 30 menit'
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '3 hours 30 minutes', check_out_at = NOW(), validated_duration_hours = 3.5, is_early_departure = false WHERE id = '$workerAttendanceId';"
    Write-Host "  >> Record 3 Created: Worker Replacement (Replacing: dr. Ahmad Santoso, Status: Completed)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 5. Skenario 4: Sedang Berdinas (Active Ongoing Shift / Belum Checkout)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Skenario 4: Sedang Berdinas (Active Ongoing Shift)..." -ForegroundColor Yellow

    # Admin registers manual check-in for Dimas Prakoso (Frontdesk)
    $frontdeskBody = @{
        staffIdOrCode = $frontdeskProfileId
        shift = "afternoon"
        status = "present"
        notes = "Dinas aktif shift siang operasional frontdesk"
    } | ConvertTo-Json
    $frontdeskRes = Invoke-RestMethod -Uri "$apiBase/attendance/manual" -Method Post -Headers $adminAuth.headers -Body $frontdeskBody
    $frontdeskData = Get-ResponseData $frontdeskRes
    Assert-Test "Frontdesk check-in recorded" ($null -ne $frontdeskData.id)
    $frontdeskAttendanceId = $frontdeskData.id

    # Record is kept OPEN (check_out_time IS NULL)
    Assert-Test "Active record has no check-out time" ($null -eq $frontdeskData.checkOutAt)
    Write-Host "  >> Record 4 Created: Frontdesk Active Shift (checkOutTime: NULL, 'Sedang berdinas')" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 6. Skenario 5: BFF Endpoint Verification (Frontend-Web Contract)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Skenario 5: Frontend-Web BFF Contract Integrity Check..." -ForegroundColor Yellow

    $dailyRes = Invoke-RestMethod -Uri "$apiBase/attendance/daily?page=1&limit=20" -Method Get -Headers $adminAuth.headers
    $dailyData = Get-ResponseData $dailyRes

    Assert-Test "Daily BFF returned records" ($dailyData.records.Count -ge 4)

    # 6A: Verify Record 1 (Early Checkout) in BFF response
    $rec1 = $dailyData.records | Where-Object { $_.id -eq $doctorAttendanceId }
    Assert-Test "BFF contains Record 1 (Doctor Early Checkout)" ($null -ne $rec1)
    Assert-Test "Record 1 has isEarlyDeparture = true" ($rec1.isEarlyDeparture -eq $true)
    Assert-Test "Record 1 contains notes" (-not [string]::IsNullOrWhiteSpace($rec1.notes))

    # 6B: Verify Record 2 (Normal Checkout) in BFF response
    $rec2 = $dailyData.records | Where-Object { $_.id -eq $midwifeAttendanceId }
    Assert-Test "BFF contains Record 2 (Midwife Normal Checkout)" ($null -ne $rec2)
    Assert-Test "Record 2 has isEarlyDeparture = false" ($rec2.isEarlyDeparture -eq $false)
    Assert-Test "Record 2 has checkOutAt" (-not [string]::IsNullOrWhiteSpace($rec2.checkOutAt))

    # 6C: Verify Record 3 (Replacement) in BFF response
    $rec3 = $dailyData.records | Where-Object { $_.id -eq $workerAttendanceId }
    Assert-Test "BFF contains Record 3 (Replacement Record)" ($null -ne $rec3)
    Assert-Test "Record 3 has isReplacement = true" ($rec3.isReplacement -eq $true)
    Assert-Test "Record 3 has replacedStaffName" ($rec3.replacedStaffName -match "Ahmad")
    Assert-Test "Record 3 has replacedStaffCode = DOC-AMANAH-001" ($rec3.replacedStaffCode -eq "DOC-AMANAH-001")

    # 6D: Verify Record 4 (Active Shift) in BFF response
    $rec4 = $dailyData.records | Where-Object { $_.id -eq $frontdeskAttendanceId }
    Assert-Test "BFF contains Record 4 (Active Shift)" ($null -ne $rec4)
    Assert-Test "Record 4 checkOutAt is null" ($null -eq $rec4.checkOutAt)

    # --------------------------------------------------------------------------
    # 7. Summary Table & Visual Inspection Guide
    # --------------------------------------------------------------------------
    Write-Host "`n==============================================================================" -ForegroundColor Green
    Write-Host " REKAPITULASI DATA PRESENSI HARI INI YANG TERSEDIA DI WEBSITE WEB DASHBOARD" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green

    function Format-IsoTime([string]$isoStr) {
        if ([string]::IsNullOrWhiteSpace($isoStr)) { return "-" }
        try {
            $dt = [DateTime]::Parse($isoStr)
            return $dt.ToString("HH:mm:ss") + " WIB"
        } catch {
            return $isoStr
        }
    }

    $summaryList = @(
        [PSCustomObject]@{
            "No" = "1"
            "Nama Pegawai" = $rec1.nama_staf
            "Tipe Skenario" = "EARLY CHECKOUT (Pulang Cepat)"
            "Shift" = $rec1.shift
            "Masuk" = (Format-IsoTime $rec1.checkInAt)
            "Pulang" = (Format-IsoTime $rec1.checkOutAt)
            "Durasi Jam" = "$($rec1.validatedDurationHours) jam"
            "Badge Khusus / Catatan" = "Alasan: $($rec1.notes) (isEarlyDeparture: true)"
        },
        [PSCustomObject]@{
            "No" = "2"
            "Nama Pegawai" = $rec2.nama_staf
            "Tipe Skenario" = "CHECKOUT BIASA (Normal)"
            "Shift" = $rec2.shift
            "Masuk" = (Format-IsoTime $rec2.checkInAt)
            "Pulang" = (Format-IsoTime $rec2.checkOutAt)
            "Durasi Jam" = "$($rec2.validatedDurationHours) jam"
            "Badge Khusus / Catatan" = "Normal Checkout (isEarlyDeparture: false)"
        },
        [PSCustomObject]@{
            "No" = "3"
            "Nama Pegawai" = $rec3.nama_staf
            "Tipe Skenario" = "PENGGANTI (Replacement)"
            "Shift" = $rec3.shift
            "Masuk" = (Format-IsoTime $rec3.checkInAt)
            "Pulang" = (Format-IsoTime $rec3.checkOutAt)
            "Durasi Jam" = "$($rec3.validatedDurationHours) jam"
            "Badge Khusus / Catatan" = "Pill 'Pengganti' -> Menggantikan $($rec3.replacedStaffName) ($($rec3.replacedStaffCode))"
        },
        [PSCustomObject]@{
            "No" = "4"
            "Nama Pegawai" = $rec4.nama_staf
            "Tipe Skenario" = "SEDANG BERDINAS (Aktif)"
            "Shift" = $rec4.shift
            "Masuk" = (Format-IsoTime $rec4.checkInAt)
            "Pulang" = "-"
            "Durasi Jam" = "Sedang Berdinas"
            "Badge Khusus / Catatan" = "CheckOutAt NULL - Siap ditest klik tombol Checkout via Web!"
        }
    )

    $summaryList | Format-Table -AutoSize | Out-String | Write-Host -ForegroundColor Cyan

    Write-Host "CATATAN:" -ForegroundColor Yellow
    Write-Host "1. Data 4 record di atas SENGAJA DIPERTAHANKAN di PostgreSQL agar Anda bisa melihat langsung di browser." -ForegroundColor White
    Write-Host "2. Buka Web Dashboard di browser: http://localhost:3000/kehadiran-pegawai" -ForegroundColor White
    Write-Host "3. Klik baris 'Budi Santoso': Anda akan melihat badge 'Pengganti' dan kartu ungu pengganti dokter dr. Ahmad Santoso." -ForegroundColor White
    Write-Host "4. Klik baris 'zikrifadhiilahahmad': Anda akan melihat kartu alasan kepulangan awal." -ForegroundColor White
    Write-Host "5. Klik tombol 'Checkout' pada baris 'Dimas Prakoso': EarlyCheckoutModal akan langsung terbuka meminta catatan kepulangan awal!`n" -ForegroundColor White

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "$($_.ScriptStackTrace)" -ForegroundColor DarkGray
    if ($_.ErrorDetails) {
        Write-Host "Response Body: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} finally {
    Print-TestSummary "Attendance Varied Scenarios & Replacement Verification Suite"
}
