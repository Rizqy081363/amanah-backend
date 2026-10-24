param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: REALTIME CHECKOUT SHIFT EARNINGS NOTIFICATION (SSOT UPSTREAM)" -ForegroundColor Cyan
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
    # 2. Prepare Clean Slate for Doctor
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Preparing Clean Slate for Doctor..." -ForegroundColor Yellow
    $doctorEmail = "dokter@amanah.com"
    $doctorAuth = Get-DynamicStaffJwt $doctorEmail
    Assert-Test "Doctor dynamic JWT generated" ($null -ne $doctorAuth.token)

    $doctorUserId = (Run-DockerSql "SELECT id FROM users WHERE email = '$doctorEmail';").Trim()
    $doctorProfileId = (Run-DockerSql "SELECT id FROM staff_profiles WHERE user_id = '$doctorUserId';").Trim()
    Assert-Test "Doctor user ($doctorUserId) and staff profile ($doctorProfileId) resolved" (-not [string]::IsNullOrWhiteSpace($doctorProfileId))

    # Clean existing today attendance, payroll, and notifications for clean assertion
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_type = 'attendance' AND source_id IN (SELECT id FROM staff_attendance_records WHERE staff_profile_id = '$doctorProfileId' AND attendance_date = CURRENT_DATE);"
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE staff_profile_id = '$doctorProfileId' AND attendance_date = CURRENT_DATE;"
    Run-DockerSql "DELETE FROM notification_recipients WHERE user_id = '$doctorUserId';"
    Run-DockerSql "DELETE FROM notifications WHERE source_type IN ('attendance', 'payroll') AND created_at >= CURRENT_DATE;"

    # --------------------------------------------------------------------------
    # 3. Ensure Active Attendance QR Session & Manual PIN
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Rotating Kiosk Session for Manual PIN..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

    $rotatePayload = @{
        sessionType = "location_check_in"
        shift = "morning"
    } | ConvertTo-Json

    $kioskRes = Invoke-RestMethod -Uri "$apiBase/attendance/qr/rotate" -Method Post -Headers $adminAuth.headers -Body $rotatePayload
    $kioskData = Get-ResponseData $kioskRes
    $manualPin = $kioskData.qrCodeIdentifier
    Assert-Test "Active Kiosk PIN received: $manualPin" ($manualPin.Length -eq 6)

    # --------------------------------------------------------------------------
    # 4. Doctor Check-In via Manual PIN
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Doctor Check-In via Manual PIN..." -ForegroundColor Yellow
    $checkInBody = @{
        qrToken = $manualPin
        method = "manual_pin"
        deviceInfo = "E2E Automated Notification Test"
    } | ConvertTo-Json

    $checkInRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $checkInBody
    $checkInData = Get-ResponseData $checkInRes
    $attendanceRecordId = $checkInData.id
    Assert-Test "Doctor successfully checked in (recordId: $attendanceRecordId)" ($null -ne $attendanceRecordId)

    # Fast-forward check_in_at by 2 hours in PostgreSQL to simulate 2 hours of validated duty
    Run-DockerSql "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '2 hours' WHERE id = '$attendanceRecordId';"
    Write-Host "Simulated 2 hours of validated duty for attendance record $attendanceRecordId" -ForegroundColor Cyan

    # --------------------------------------------------------------------------
    # 5. Doctor Check-Out via Manual PIN
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Doctor Check-Out via Manual PIN..." -ForegroundColor Yellow

    function Invoke-DoctorCheckOut([string]$pin, [string]$notes = "Selesai dinas (E2E Test)") {
        $checkoutPayload = @{
            qrToken = $pin
            method = "manual_pin"
            notes = $notes
        } | ConvertTo-Json

        try {
            return Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $checkoutPayload
        } catch {
            $errResponse = $_.ErrorDetails.Message | ConvertFrom-Json
            if ($errResponse.code -eq "EARLY_DEPARTURE_NOTES_REQUIRED" -and $errResponse.data.checkoutTicket) {
                Write-Host "  >> Early departure ticket intercepted: $($errResponse.data.checkoutTicket)" -ForegroundColor Gray
                $earlyPayload = @{
                    method = "manual_pin"
                    checkoutTicket = $errResponse.data.checkoutTicket
                    notes = $notes
                } | ConvertTo-Json
                return Invoke-RestMethod -Uri "$apiBase/attendance/checkout" -Method Post -Headers $doctorAuth.headers -Body $earlyPayload
            }
            throw $_
        }
    }

    $checkOutRes = Invoke-DoctorCheckOut $manualPin "Dinas terjadwal selesai (E2E)"
    $checkOutData = Get-ResponseData $checkOutRes
    Assert-Test "Doctor successfully checked out" ($null -ne $checkOutData.id)

    # Wait 2 seconds for RabbitMQ async consumers to process the in-app notifications
    Write-Host "Waiting 2.5s for RabbitMQ and In-App Notification Worker..." -ForegroundColor Gray
    Start-Sleep -Milliseconds 2500

    # --------------------------------------------------------------------------
    # 6. Verify Attendance & Payroll Ledger Invariants
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Verifying Attendance & Payroll Ledger Records..." -ForegroundColor Yellow
    $dbCheckOut = (Run-DockerSql "SELECT check_out_at FROM staff_attendance_records WHERE id = '$attendanceRecordId';").Trim()
    Assert-Test "Attendance check_out_at is persisted in DB ($dbCheckOut)" (-not [string]::IsNullOrWhiteSpace($dbCheckOut))

    $dbDuration = (Run-DockerSql "SELECT validated_duration_hours FROM staff_attendance_records WHERE id = '$attendanceRecordId';").Trim()
    $durationVal = [double]$dbDuration
    Assert-Test "Validated duration is recorded (duration: $durationVal hours)" ($durationVal -ge 1.9)

    $payrollAmount = (Run-DockerSql "SELECT amount FROM payroll_entries WHERE source_id = '$attendanceRecordId' AND source_type = 'attendance';").Trim()
    Assert-Test "Payroll shift entry generated (amount: Rp $payrollAmount)" ([double]$payrollAmount -gt 0)

    # --------------------------------------------------------------------------
    # 7. Verify Two Distinct Realtime Notifications Dispatched to Doctor
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Verifying Two Distinct Notifications (Attendance vs Payroll Earnings)..." -ForegroundColor Yellow

    # Notification 1: Attendance checkout notification
    $attNotifTitle = (Run-DockerSql "SELECT title FROM notifications WHERE source_type = 'attendance' AND source_id = '$attendanceRecordId' ORDER BY created_at DESC LIMIT 1;").Trim()
    Assert-Test "Notification 1 (Attendance) title is valid checkout notice ($attNotifTitle)" ($attNotifTitle -in @("Presensi Pulang Berhasil", "Peringatan: Kepulangan Lebih Awal"))

    $attNotifIcon = (Run-DockerSql "SELECT badge_icon FROM notifications WHERE source_type = 'attendance' AND source_id = '$attendanceRecordId' ORDER BY created_at DESC LIMIT 1;").Trim()
    Assert-Test "Notification 1 badge_icon is 'clock' ($attNotifIcon)" ($attNotifIcon -eq "clock")

    # Notification 2: Dedicated shift earnings notification
    $payrollNotif = (Run-DockerSql "SELECT title || '|||' || body || '|||' || badge_icon || '|||' || category FROM notifications WHERE source_type = 'payroll' AND source_id = '$attendanceRecordId' ORDER BY created_at DESC LIMIT 1;").Trim()
    Assert-Test "Notification 2 (Payroll Shift Earnings) exists in DB" (-not [string]::IsNullOrWhiteSpace($payrollNotif))

    $parts = $payrollNotif -split '\|\|\|'
    $payTitle = $parts[0].Trim()
    $payBody = $parts[1].Trim()
    $payIcon = $parts[2].Trim()
    $payCategory = $parts[3].Trim()

    Write-Host "   Title: $payTitle" -ForegroundColor Green
    Write-Host "   Body:  $payBody" -ForegroundColor Green
    Write-Host "   Icon:  $payIcon" -ForegroundColor Green
    Write-Host "   Cat:   $payCategory" -ForegroundColor Green

    Assert-Test "Notification 2 title is 'Upah Hari Ini Masuk'" ($payTitle -eq "Upah Hari Ini Masuk")
    Assert-Test "Notification 2 badge_icon is 'wallet'" ($payIcon -eq "wallet")
    Assert-Test "Notification 2 category is 'shift'" ($payCategory -eq "shift")
    Assert-Test "Notification 2 body contains formatted earnings amount" ($payBody.Contains("Upah dinas sebesar Rp"))
    Assert-Test "Notification 2 body contains validated hours" ($payBody.Contains("jam kerja"))

    # Verify recipient linkage
    $recipientCount = (Run-DockerSql "SELECT count(*) FROM notification_recipients nr JOIN notifications n ON nr.notification_id = n.id WHERE nr.user_id = '$doctorUserId' AND n.source_type = 'payroll';").Trim()
    Assert-Test "Payroll notification is linked to Doctor recipient user ($doctorUserId)" ([int]$recipientCount -ge 1)

    # --------------------------------------------------------------------------
    # 8. Test Replacement Shift Notification ("Upah Pengganti Masuk")
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Testing Replacement Shift Checkout Notification..." -ForegroundColor Yellow

    # Clean today records again for replacement test
    Run-DockerSql "DELETE FROM payroll_entries WHERE source_type = 'attendance' AND source_id IN (SELECT id FROM staff_attendance_records WHERE staff_profile_id = '$doctorProfileId' AND attendance_date = CURRENT_DATE);"
    Run-DockerSql "DELETE FROM staff_attendance_records WHERE staff_profile_id = '$doctorProfileId' AND attendance_date = CURRENT_DATE;"

    # Check-in doctor
    $repCheckInRes = Invoke-RestMethod -Uri "$apiBase/attendance/scan" -Method Post -Headers $doctorAuth.headers -Body $checkInBody
    $repCheckInData = Get-ResponseData $repCheckInRes
    $repAttendanceId = $repCheckInData.id
    Assert-Test "Doctor replacement shift check-in created ($repAttendanceId)" ($null -ne $repAttendanceId)

    # Mark as replacement duty & simulate 2 hours elapsed
    Run-DockerSql "UPDATE staff_attendance_records SET is_replacement = true, check_in_at = NOW() - INTERVAL '2 hours' WHERE id = '$repAttendanceId';"

    # Check-out doctor
    $repCheckOutRes = Invoke-DoctorCheckOut $manualPin "Dinas pengganti selesai (E2E)"
    $repCheckOutData = Get-ResponseData $repCheckOutRes
    Assert-Test "Doctor replacement shift check-out completed" ($null -ne $repCheckOutData.id)

    Start-Sleep -Milliseconds 2500

    $repPayNotif = (Run-DockerSql "SELECT title || '|||' || body FROM notifications WHERE source_type = 'payroll' AND source_id = '$repAttendanceId' ORDER BY created_at DESC LIMIT 1;").Trim()
    Assert-Test "Replacement payroll notification generated" (-not [string]::IsNullOrWhiteSpace($repPayNotif))

    $repParts = $repPayNotif -split '\|\|\|'
    $repTitle = $repParts[0].Trim()
    $repBody = $repParts[1].Trim()

    Write-Host "   Replacement Title: $repTitle" -ForegroundColor Magenta
    Write-Host "   Replacement Body:  $repBody" -ForegroundColor Magenta

    Assert-Test "Replacement title is 'Upah Pengganti Masuk'" ($repTitle -eq "Upah Pengganti Masuk")
    Assert-Test "Replacement body contains 'Upah dinas pengganti sebesar Rp'" ($repBody.Contains("Upah dinas pengganti sebesar Rp"))
    Assert-Test "Replacement body contains 'jam dinas'" ($repBody.Contains("jam dinas"))

} catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "$($_.ScriptStackTrace)" -ForegroundColor DarkRed
    exit 1
}

# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------
Print-TestSummary
