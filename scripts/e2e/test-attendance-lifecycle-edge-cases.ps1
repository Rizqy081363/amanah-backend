param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: COMPLETE ATTENDANCE LIFECYCLE & ALL EDGE CASES VERIFICATION" -ForegroundColor Cyan
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
    # 1. Clean Baseline for Target Test Staff for Today
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Preparing Clean Baseline for Test Cycle..." -ForegroundColor Yellow
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE attendance_date = CURRENT_DATE AND (staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email IN ('dokter@amanah.com', 'staff.operasional@amanah.clinic'))));"
    Run-DockerSql "DELETE FROM staff_leave_requests WHERE staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id IN (SELECT id FROM users WHERE email = 'dokter@amanah.com')) AND start_date = CURRENT_DATE;"
    Write-Host "  >> Cleaned previous test attendance and leave records for today." -ForegroundColor Gray

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
    # 3. Edge Case 2: Staf Without Roster Schedule (Outlier)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Edge Case 2: Staf Without Roster Schedule (Outlier)..." -ForegroundColor Yellow
    # Rotate an active QR code first
    $qrPayload = @{ sessionType = "location_check_in"; shift = "morning"; rotationSeconds = 30 } | ConvertTo-Json
    $activeQrRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrPayload
    $activeQrToken = (Get-ResponseData $activeQrRes).qrCodeIdentifier

    $unrosteredThrew403 = $false
    try {
        $scanUnrosteredBody = @{ qrToken = $activeQrToken; shift = "morning" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $workerAuth.headers -Body $scanUnrosteredBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 403) {
            $unrosteredThrew403 = $true
        }
    }
    Assert-Test "Unrostered staff scan correctly rejected with 403 Forbidden" $unrosteredThrew403

    # --------------------------------------------------------------------------
    # 4. Edge Case 3: Staf on Approved Leave
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Edge Case 3: Staf on Approved Leave Trying to Scan..." -ForegroundColor Yellow
    # Create approved leave for doctor for today
    $doctorProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'dokter@amanah.com')").Trim()
    Run-DockerSql "INSERT INTO staff_leave_requests (id, staff_profile_id, request_type, start_date, end_date, duration_days, reason, status, reviewed_at, created_at, updated_at) VALUES (gen_random_uuid(), '$doctorProfileId', 'annual_leave', CURRENT_DATE, CURRENT_DATE, 1, 'Cuti Sakit E2E Edge Case', 'approved', NOW(), NOW(), NOW());"

    $onLeaveThrew403 = $false
    try {
        $scanLeaveBody = @{ qrToken = $activeQrToken; shift = "morning" } | ConvertTo-Json
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
    $rotARes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrPayload
    $tokenA = (Get-ResponseData $rotARes).qrCodeIdentifier
    Write-Host "  >> Token A generated: $tokenA" -ForegroundColor Gray

    # 5B: Generate Token B (Supersedes Token A)
    $rotBRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $qrPayload
    $tokenB = (Get-ResponseData $rotBRes).qrCodeIdentifier
    Write-Host "  >> Token B generated: $tokenB (Token A must be invalidated)" -ForegroundColor Gray

    # 5C: Try to scan with old Token A -> MUST FAIL (400 Invalid Token)
    $oldTokenThrew400 = $false
    try {
        $scanOldBody = @{ qrToken = $tokenA; shift = "morning" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanOldBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) {
            $oldTokenThrew400 = $true
        }
    }
    Assert-Test "Old/Rotated Token A scan rejected with 400 Bad Request" $oldTokenThrew400

    # 5D: Scan with active Token B -> MUST SUCCEED (201 Created)
    $scanActiveBody = @{ qrToken = $tokenB; shift = "morning"; deviceInfo = "E2E Mobile Device" } | ConvertTo-Json
    $scanRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $scanActiveBody
    $scanData = Get-ResponseData $scanRes
    Assert-Test "Active Token B scan succeeded" ($null -ne $scanData.id)
    Assert-Test "Attendance status is present or late" ($scanData.status -in @("present", "late"))
    Write-Host "  >> Doctor checked in successfully (ID: $($scanData.id), Status: $($scanData.status))" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 6. Edge Case 5: Table List Verification (Data Transfer & Realtime BFF)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Edge Case 5: Real-time Data Verification in Daily Attendance List..." -ForegroundColor Yellow
    $dailyRes = Invoke-RestMethod -Uri "$apiBase/attendance/daily?page=1&limit=20" -Method Get -Headers $adminAuth.headers
    $dailyData = Get-ResponseData $dailyRes
    $foundDoctorRecord = $dailyData.records | Where-Object { $_.id -eq $scanData.id }
    Assert-Test "Doctor attendance record is present in Daily Attendance BFF table" ($null -ne $foundDoctorRecord)
    Assert-Test "Doctor record has valid nama_staf and kategori" ($foundDoctorRecord.kategori -eq "Dokter" -and -not [string]::IsNullOrWhiteSpace($foundDoctorRecord.nama_staf))
    Assert-Test "Doctor record has waktu_presensi in WIB format" ($foundDoctorRecord.waktu_presensi -match "WIB")
    Write-Host "  >> Record: $($foundDoctorRecord.nama_staf) | $($foundDoctorRecord.kategori) | $($foundDoctorRecord.waktu_presensi) | $($foundDoctorRecord.shift)" -ForegroundColor Green

    # --------------------------------------------------------------------------
    # 7. Edge Case 6: Duplicate Check-In on Same Day
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Edge Case 6: Duplicate Check-In Guard..." -ForegroundColor Yellow
    $duplicateCheckinThrew409 = $false
    try {
        $duplicateBody = @{ qrToken = $tokenB; shift = "morning" } | ConvertTo-Json
        Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $duplicateBody
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 409) {
            $duplicateCheckinThrew409 = $true
        }
    }
    Assert-Test "Duplicate check-in correctly rejected with 409 Conflict" $duplicateCheckinThrew409

    # --------------------------------------------------------------------------
    # 8. Edge Case 7: Normal Check-Out with QR Token (Proximity Verification)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Edge Case 7: Doctor Check-Out with Active QR Token..." -ForegroundColor Yellow
    $checkoutPayload = @{ qrToken = $tokenB } | ConvertTo-Json
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
    # 10. Edge Case 9: Administrative Manual Check-in & Admin Check-out for Staff
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] Edge Case 9: Administrative Manual Check-in & Admin Check-out..." -ForegroundColor Yellow
    $manualPayload = @{
        staffIdOrCode = "STF-OPS-001"
        shift = "morning"
        status = "present"
        notes = "Presensi manual dicatat Admin E2E Verification"
    } | ConvertTo-Json
    $manualRes = Invoke-RestMethod -Uri "$apiBase/attendance/manual" -Method Post -Headers $adminAuth.headers -Body $manualPayload
    $manualData = Get-ResponseData $manualRes
    Assert-Test "Admin manual check-in succeeded" ($null -ne $manualData.id)
    $workerProfileId = $manualData.staffId

    # Admin check-out on behalf of worker
    $adminCheckoutPayload = @{ staffId = $workerProfileId } | ConvertTo-Json
    $adminCheckoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $adminAuth.headers -Body $adminCheckoutPayload
    $adminCheckoutData = Get-ResponseData $adminCheckoutRes
    Assert-Test "Admin check-out on behalf of worker succeeded" ($null -ne $adminCheckoutData.checkOutAt)

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "$($_.ScriptStackTrace)" -ForegroundColor DarkGray
} finally {
    Print-TestSummary "Attendance Lifecycle & Edge Cases Suite"
}
