param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: MANUAL PRESENCE (CHECK-IN/CHECK-OUT) & PAYROLL INTEGRITY CASCADE" -ForegroundColor Cyan
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
    # 1. API Readiness & Environment Check
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Checking API Readiness..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    # --------------------------------------------------------------------------
    # 2. Database Trigger Invariant Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Verifying PostgreSQL Cascade Trigger on staff_attendance_records..." -ForegroundColor Yellow
    $triggerCount = (Run-DockerSql "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'staff_attendance_records'::regclass AND tgname = 'trg_cascade_attendance_payroll_deletion';").Trim()
    Assert-Test "Trigger trg_cascade_attendance_payroll_deletion exists" ($triggerCount -eq "1")

    # --------------------------------------------------------------------------
    # 3. Clean Slate for Test Doctor
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Preparing Clean Slate for Test Doctor..." -ForegroundColor Yellow
    $doctorEmail = "dokter@amanah.com"
    $doctorAuth = Get-DynamicStaffJwt $doctorEmail
    Assert-Test "Doctor dynamic JWT generated" ($null -ne $doctorAuth.token)

    $doctorProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = '$doctorEmail');").Trim()
    Assert-Test "Doctor staff profile resolved ($doctorProfileId)" (-not [string]::IsNullOrWhiteSpace($doctorProfileId))

    # Clean existing attendance & payroll entries for today
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_type = 'attendance' AND source_id IN (SELECT id FROM staff_attendance_records WHERE staff_profile_id = '$doctorProfileId' AND attendance_date = CURRENT_DATE);"
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE staff_profile_id = '$doctorProfileId' AND attendance_date = CURRENT_DATE;"

    # --------------------------------------------------------------------------
    # 4. Generate Active Kiosk QR Session & Dynamic Manual PIN
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Ensuring Active Attendance QR Kiosk Session with Manual PIN..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

    $rotatePayload = @{
        sessionType = "location_check_in"
        shift = "morning"
    } | ConvertTo-Json

    $kioskRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $rotatePayload
    $kioskData = Get-ResponseData $kioskRes
    $manualPin = $kioskData.qrCodeIdentifier
    Assert-Test "Kiosk session generated with 6-char PIN ($manualPin)" ($manualPin.Length -eq 6)

    # --------------------------------------------------------------------------
    # 5. Doctor Performs Check-In via Manual PIN
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Doctor Check-In using Manual PIN..." -ForegroundColor Yellow
    $checkInBody = @{
        qrToken = $manualPin
        method = "manual_pin"
        deviceInfo = "E2E Automated Test Suite"
    } | ConvertTo-Json

    $checkInRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $checkInBody
    $checkInData = Get-ResponseData $checkInRes
    Assert-Test "Doctor successfully checked in" ($null -ne $checkInData.id)
    $attendanceRecordId = $checkInData.id

    $dbMethod = (Run-DockerSql "SELECT recorded_method FROM staff_attendance_records WHERE id = '$attendanceRecordId';").Trim()
    Assert-Test "Recorded method in DB is manual_pin ($dbMethod)" ($dbMethod -eq "manual_pin")

    # --------------------------------------------------------------------------
    # 6. Doctor Performs Check-Out via Manual PIN
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Doctor Check-Out using Manual PIN..." -ForegroundColor Yellow
    
    # Fast forward check-in by 2 hours in DB to simulate valid working time
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '2 hours' WHERE id = '$attendanceRecordId';"

    $checkoutBody = @{
        qrToken = $manualPin
        method = "manual_pin"
        notes = "Selesai dinas terjadwal E2E test"
    } | ConvertTo-Json

    # First checkout attempt might require ticket if early departure
    $checkoutRes = $null
    try {
        $checkoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutBody
    } catch {
        $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($errResponse.code -eq "EARLY_DEPARTURE_NOTES_REQUIRED" -and $errResponse.data.checkoutTicket) {
            Write-Host "  >> Early departure ticket intercepted: $($errResponse.data.checkoutTicket)" -ForegroundColor Gray
            $earlyBody = @{
                method = "manual_pin"
                checkoutTicket = $errResponse.data.checkoutTicket
                notes = "Izin pulang cepat keperluan keluarga (E2E)"
            } | ConvertTo-Json
            $checkoutRes = Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $earlyBody
        } else {
            throw $_
        }
    }

    $checkoutData = Get-ResponseData $checkoutRes
    Assert-Test "Doctor checkout completed successfully" ($null -ne $checkoutData.checkOutAt)
    Write-Host "  >> CheckOut timestamp: $($checkoutData.checkOutAt)" -ForegroundColor Gray
    Write-Host "  >> Validated duration: $($checkoutData.validatedDurationHours) hours" -ForegroundColor Gray

    # --------------------------------------------------------------------------
    # 7. Verify Attendance Payroll Entry Created
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Verifying Payroll Entry Creation..." -ForegroundColor Yellow
    $payrollEntry = Run-DockerSql "SELECT id, amount, entry_type, source_type, source_id FROM payroll_entries WHERE source_type = 'attendance' AND source_id = '$attendanceRecordId';"
    Assert-Test "Payroll entry created for attendanceRecordId ($attendanceRecordId)" (-not [string]::IsNullOrWhiteSpace($payrollEntry))
    Write-Host "  >> Payroll entry verified: $payrollEntry" -ForegroundColor Gray

    # --------------------------------------------------------------------------
    # 8. Test Cascading Deletion Trigger (Purge Invariant)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Testing Destructive Purge & Payroll Cascade..." -ForegroundColor Yellow
    
    # Delete the attendance record (simulating dev purge or administrative deletion)
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE id = '$attendanceRecordId';"

    # Verify that trigger deleted matching payroll_entries
    $survivingPayrollEntry = (Run-DockerSql "SELECT count(*) FROM payroll_entries WHERE source_type = 'attendance' AND source_id = '$attendanceRecordId';").Trim()
    Assert-Test "Payroll entry automatically purged by DB trigger (count = 0)" ($survivingPayrollEntry -eq "0")

    # Verify no orphaned attendance payroll entries in the entire system
    $totalOrphans = (Run-DockerSql "SELECT count(*) FROM payroll_entries WHERE source_type = 'attendance' AND source_id IS NOT NULL AND source_id NOT IN (SELECT id FROM staff_attendance_records);").Trim()
    Assert-Test "Zero total orphaned attendance payroll entries in DB" ($totalOrphans -eq "0")

    Write-Host "`n==============================================================================" -ForegroundColor Green
    Write-Host " ALL E2E TESTS PASSED: MANUAL PRESENCE & PAYROLL INTEGRITY CASCADE VERIFIED" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
}
catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Response body: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
finally {
    Print-TestSummary
}
