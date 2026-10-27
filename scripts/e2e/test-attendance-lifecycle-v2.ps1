param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: DYNAMIC ATTENDANCE LIFECYCLE & CORE CONTRACT VERIFICATION (V2)" -ForegroundColor Cyan
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
    # 0. API Readiness & Dynamic Auth Tokens
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 0] API Readiness & Acquiring Authoritative Tokens..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated successfully" ($null -ne $adminAuth.token)

    $doctorAuth = Get-DynamicStaffJwt "dokter@amanah.com"
    Assert-Test "Doctor dynamic JWT generated" ($null -ne $doctorAuth.token)

    $workerAuth = Get-DynamicStaffJwt "staff.operasional@amanah.clinic"
    Assert-Test "Worker dynamic JWT generated" ($null -ne $workerAuth.token)

    # --------------------------------------------------------------------------
    # 1. Dynamic Roster Discovery & Clean Database Flush for Today
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Dynamic DB Discovery & Flushing Baseline for Test Subjects..." -ForegroundColor Yellow
    $currentDow = (Run-DockerSql "SELECT EXTRACT(DOW FROM CURRENT_DATE);").Trim()
    Write-Host "  >> Current Database Day-of-Week: $currentDow" -ForegroundColor Gray

    # Dynamically discover doctor's assigned shift for today from database
    $doctorShift = (Run-DockerSql "SELECT sd.code FROM doctor_assignment da JOIN practitioners p ON da.doctor_id = p.id JOIN session_def sd ON da.session_id = sd.id WHERE p.staff_profile_id = (SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'dokter@amanah.com')) AND (da.dow = EXTRACT(DOW FROM CURRENT_DATE) OR da.dow IS NULL) LIMIT 1;").Trim()
    if ([string]::IsNullOrWhiteSpace($doctorShift)) {
        $doctorShift = "morning"
    }
    Write-Host "  >> Doctor dynamic active shift for today: $doctorShift" -ForegroundColor Gray

    # Dynamically find an unrostered shift for worker on today
    $workerUnrosteredShift = (Run-DockerSql "SELECT sd.code FROM session_def sd WHERE sd.id NOT IN (SELECT session_id FROM staff_roster WHERE staff_profile_id = (SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'staff.operasional@amanah.clinic')) AND dow = EXTRACT(DOW FROM CURRENT_DATE)) LIMIT 1;").Trim()
    if ([string]::IsNullOrWhiteSpace($workerUnrosteredShift)) {
        $workerUnrosteredShift = "night"
    }
    Write-Host "  >> Worker unrostered shift for today: $workerUnrosteredShift" -ForegroundColor Gray

    # Flush test subjects' attendance records and leave requests for CURRENT_DATE
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE attendance_date = CURRENT_DATE AND (staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('dokter@amanah.com', 'staff.operasional@amanah.clinic'))));"
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE (staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('dokter@amanah.com', 'staff.operasional@amanah.clinic')))) AND start_date = CURRENT_DATE;"
    Write-Host "  >> Flushed previous attendance records and leave requests for today." -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 2. Edge Case 1: Check-out Before Check-in
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Edge Case 1: Staff Check-out Before Check-in..." -ForegroundColor Yellow
    $checkoutBeforeCheckinThrew404 = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body "{}"
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 404) {
            $checkoutBeforeCheckinThrew404 = $true
        } else {
            Write-Host "  >> Unexpected status code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        }
    }
    Assert-Test "Check-out before check-in correctly rejected with 404 Not Found" $checkoutBeforeCheckinThrew404

    # --------------------------------------------------------------------------
    # 3. Edge Case 2: Staf Scanning Unrostered Shift Session
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Edge Case 2: Staf Scanning Session Without Roster ($workerUnrosteredShift)..." -ForegroundColor Yellow
    # Terminal generates active QR code for the unrostered shift
    $qrUnrosteredPayload = @{ sessionType = "location_check_in"; shift = $workerUnrosteredShift; rotationSeconds = 60 } | ConvertTo-Json
    $activeUnrosteredQrRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrUnrosteredPayload
    $unrosteredQrToken = (Get-ResponseData $activeUnrosteredQrRes).qrCodeIdentifier

    $unrosteredThrew403 = $false
    try {
        $scanUnrosteredBody = @{ qrToken = $unrosteredQrToken; shift = $workerUnrosteredShift } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $workerAuth.headers -Body $scanUnrosteredBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 403) {
            $unrosteredThrew403 = $true
        }
    }
    Assert-Test "Unrostered session scan correctly rejected with 403 Forbidden" $unrosteredThrew403

    # --------------------------------------------------------------------------
    # 4. Edge Case 3: Staf on Approved Leave Trying to Scan
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Edge Case 3: Staf on Approved Leave Trying to Scan..." -ForegroundColor Yellow
    $doctorProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'dokter@amanah.com')").Trim()
    Run-DockerSql "INSERT INTO staff_leave_requests (id, staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_at, created_at, updated_at) VALUES (gen_random_uuid(), '$doctorProfileId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Cuti Sakit E2E Verification V2', 'approved', NOW(), NOW(), NOW());"

    # Terminal generates QR for doctor's valid shift
    $qrValidPayload = @{ sessionType = "location_check_in"; shift = $doctorShift; rotationSeconds = 60 } | ConvertTo-Json
    $activeQrRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrValidPayload
    $activeQrToken = (Get-ResponseData $activeQrRes).qrCodeIdentifier

    $onLeaveThrew403 = $false
    try {
        $scanLeaveBody = @{ qrToken = $activeQrToken; shift = $doctorShift } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanLeaveBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 403) {
            $onLeaveThrew403 = $true
        }
    }
    Assert-Test "Staff on approved leave scan correctly rejected with 403 Forbidden" $onLeaveThrew403

    # Clean up test leave so doctor can proceed with normal cycle
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE staff_profile_id = '$doctorProfileId' AND start_date = CURRENT_DATE;"

    # --------------------------------------------------------------------------
    # 5. Edge Case 4: QR Session Rotation & Anti-Cheat (Old Token Invalidation)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Edge Case 4: QR Rotation & Invalidation of Previous Token..." -ForegroundColor Yellow
    # 5A: Generate Token A
    $rotARes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrValidPayload
    $tokenA = (Get-ResponseData $rotARes).qrCodeIdentifier

    # 5B: Generate Token B (Supersedes Token A)
    $rotBRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrValidPayload
    $tokenB = (Get-ResponseData $rotBRes).qrCodeIdentifier

    # 5C: Try to scan with old Token A -> MUST FAIL (400 Invalid Token)
    $oldTokenThrew400 = $false
    try {
        $scanOldBody = @{ qrToken = $tokenA; shift = $doctorShift } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanOldBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $oldTokenThrew400 = $true
        }
    }
    Assert-Test "Old/Rotated Token A scan rejected with 400 Bad Request" $oldTokenThrew400

    # 5D: Scan with active Token B -> MUST SUCCEED (201 Created)
    $scanActiveBody = @{ qrToken = $tokenB; shift = $doctorShift; deviceInfo = "Dynamic E2E Mobile Client" } | ConvertTo-Json
    $scanRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanActiveBody
    $scanData = Get-ResponseData $scanRes
    Assert-Test "Active Token B scan succeeded" ($null -ne $scanData.id)
    Assert-Test "Attendance status is present or late" ($scanData.status -in @("present", "late"))
    Write-Host "  >> Doctor checked in successfully (ID: $($scanData.id), Status: $($scanData.status), Shift: $($scanData.shift))" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 6. Edge Case 5: Real-time Data Verification in Daily Attendance BFF List
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Edge Case 5: Real-time Data Verification in Daily Attendance List..." -ForegroundColor Yellow
    $dailyRes = Invoke-RestMethod -Uri "$apiBase/attendance/daily?page=1&limit=20" -Method Get -Headers $adminAuth.headers
    $dailyData = Get-ResponseData $dailyRes
    $foundDoctorRecord = $dailyData.records | Where-Object { $_.id -eq $scanData.id }
    Assert-Test "Doctor attendance record is present in Daily Attendance BFF table" ($null -ne $foundDoctorRecord)
    Assert-Test "Doctor record has valid nama_staf and kategori" ($foundDoctorRecord.kategori -eq "Dokter" -and -not [string]::IsNullOrWhiteSpace($foundDoctorRecord.nama_staf))
    Assert-Test "Doctor record has waktu_presensi in WIB format" ($foundDoctorRecord.waktu_presensi -match "WIB")
    Write-Host "  >> BFF Record: $($foundDoctorRecord.nama_staf) | $($foundDoctorRecord.kategori) | $($foundDoctorRecord.waktu_presensi) | $($foundDoctorRecord.shift)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 7. Edge Case 6: Duplicate Check-In on Same Day
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Edge Case 6: Duplicate Check-In Guard..." -ForegroundColor Yellow
    $duplicateCheckinThrew409 = $false
    try {
        $duplicateBody = @{ qrToken = $tokenB; shift = $doctorShift } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $duplicateBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) {
            $duplicateCheckinThrew409 = $true
        }
    }
    Assert-Test "Duplicate check-in correctly rejected with 409 Conflict" $duplicateCheckinThrew409

    # --------------------------------------------------------------------------
    # 8. Edge Case 7: Normal Check-Out with QR Token (With Optional Notes for Early Departure)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Edge Case 7: Doctor Check-Out with Active QR Token..." -ForegroundColor Yellow
    $checkoutPayload = @{ qrToken = $tokenB; notes = "Penyelesaian dinas dokter E2E" } | ConvertTo-Json
    $checkoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutPayload
    $checkoutData = Get-ResponseData $checkoutRes
    Assert-Test "Doctor check-out recorded" ($null -ne $checkoutData.checkOutAt)
    Assert-Test "Doctor validatedDurationHours computed" ([double]$checkoutData.validatedDurationHours -ge 0.5)
    Write-Host "  >> Checked out at $($checkoutData.checkOutAt) (Duration: $($checkoutData.validatedDurationHours) jam)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 9. Edge Case 8: Duplicate Check-Out on Same Day
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 9] Edge Case 8: Duplicate Check-Out Guard..." -ForegroundColor Yellow
    $duplicateCheckoutThrew409 = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutPayload
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) {
            $duplicateCheckoutThrew409 = $true
        }
    }
    Assert-Test "Duplicate check-out correctly rejected with 409 Conflict" $duplicateCheckoutThrew409

    # --------------------------------------------------------------------------
    # 10. Edge Case 9: Administrative Manual Check-in & Admin Check-out for Worker
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] Edge Case 9: Administrative Manual Check-in & Admin Check-out..." -ForegroundColor Yellow
    $manualPayload = @{
        staffIdOrCode = "STF-OPS-001"
        shift = "morning"
        status = "present"
        notes = "Presensi manual dicatat Admin E2E Verification V2"
    } | ConvertTo-Json
    $manualRes = Invoke-RestMethod -Uri "$apiBase/attendance/manual" -Method Post -Headers $adminAuth.headers -Body $manualPayload
    $manualData = Get-ResponseData $manualRes
    Assert-Test "Admin manual check-in succeeded" ($null -ne $manualData.id)
    $workerProfileId = $manualData.staffId

    # Admin check-out on behalf of worker (administrative entry)
    $adminCheckoutPayload = @{ staffId = $workerProfileId; notes = "Checkout dinas oleh Admin" } | ConvertTo-Json
    $adminCheckoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $adminAuth.headers -Body $adminCheckoutPayload
    $adminCheckoutData = Get-ResponseData $adminCheckoutRes
    Assert-Test "Admin check-out on behalf of worker succeeded" ($null -ne $adminCheckoutData.checkOutAt)
    Write-Host "  >> Worker checked out by admin at $($adminCheckoutData.checkOutAt)" -ForegroundColor Green

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "$($_.ScriptStackTrace)" -ForegroundColor DarkGray
} finally {
    Print-TestSummary "Dynamic Attendance Lifecycle Suite (V2)"
}
