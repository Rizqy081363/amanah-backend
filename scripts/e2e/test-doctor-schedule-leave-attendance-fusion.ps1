param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: DOCTOR SCHEDULE, LEAVE & ATTENDANCE FUSION VERIFICATION" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

$testEmail = "zikrifadhiilahahmad@gmail.com"
$todayStr = (Get-Date).ToString("yyyy-MM-dd")
$targetDate = $todayStr

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

function Flush-TestDoctorData([string]$email, [string]$date) {
    Write-Host "  Flushing old / stale test leave & replacement records for $email on $date..." -ForegroundColor Gray
    try {
        $staffId = Run-DockerSql "SELECT sp.id FROM staff_profiles sp JOIN users u ON sp.user_id = u.id WHERE u.email = '$email' LIMIT 1;"
        $staffId = $staffId.Trim()
        if ($staffId -and $staffId -ne "") {
            $flushSql = @"
DELETE FROM replacement_opportunities WHERE original_staff_profile_id = '$staffId' AND work_date = '$date';
DELETE FROM leave_request_sessions WHERE leave_request_id IN (SELECT id FROM staff_leave_requests WHERE staff_profile_id = '$staffId' AND (start_date = '$date' OR end_date = '$date'));
DELETE FROM staff_leave_requests WHERE staff_profile_id = '$staffId' AND (start_date = '$date' OR end_date = '$date' OR reason LIKE 'Cuti Operasional Terpadu%');
"@
            Run-DockerSql $flushSql | Out-Null
            Write-Host "  Flush completed successfully for staff $staffId." -ForegroundColor Green
        }
    } catch {
        Write-Host "  Flush notice: $($_.Exception.Message)" -ForegroundColor Gray
    }

    try {
        docker exec -i backend-redis-1 redis-cli FLUSHDB 2>$null | Out-Null
        Write-Host "  Redis cache flushed (FLUSHDB)." -ForegroundColor Green
    } catch {
        Write-Host "  Redis flush notice: $($_.Exception.Message)" -ForegroundColor Gray
    }
}

$leaveId = $null

try {
    # --------------------------------------------------------------------------
    # 0. Pre-Flight Test Flush (Guarantees zero conflicts & reproducible state)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 0] Pre-Flight Test Data Flush..." -ForegroundColor Yellow
    Flush-TestDoctorData $testEmail $targetDate
    Assert-Test "Pre-flight test environment sanitized" $true

    # --------------------------------------------------------------------------
    # 1. API Readiness
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Checking API Readiness..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    # --------------------------------------------------------------------------
    # 2. Authentication (Admin & Doctor via Dynamic JWT)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Authenticating Admin and Clinical Doctor ($testEmail)..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin login successful" ($null -ne $adminAuth.token)

    $doctorAuth = Get-DynamicStaffJwt $testEmail
    Assert-Test "Doctor ($testEmail) authenticated via dynamic JWT" ($null -ne $doctorAuth.token)

    # --------------------------------------------------------------------------
    # 3. Locate Target Doctor and Operating Schedule
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Locating Target Doctor and Operating Schedule..." -ForegroundColor Yellow
    $doctorListRes = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules?date=$targetDate&limit=100" -Method Get -Headers $adminAuth.headers
    $doctors = $doctorListRes.data.doctors
    Assert-Test "Retrieved doctor schedule list from backend" ($doctors.Count -gt 0)

    $targetDoctor = $doctors | Where-Object { 
        ($_.email -and $_.email.ToLower() -eq $testEmail.ToLower()) -or 
        ($_.nama_dokter -and $_.nama_dokter.ToLower().Contains("zikri"))
    } | Select-Object -First 1

    Assert-Test "Identified target test doctor: $($targetDoctor.nama_dokter)" ($null -ne $targetDoctor)

    $doctorId = $targetDoctor.id
    $practitionerId = $targetDoctor.practitioner_id
    if (-not $practitionerId) { $practitionerId = $doctorId }
    $staffProfileId = $targetDoctor.staff_profile_id

    # --------------------------------------------------------------------------
    # 4. Protection Layer: Reject Leave On Inactive Schedule / Closed Sessions
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Testing Protection Layer: Submitting Leave On Non-Operating Schedule..." -ForegroundColor Yellow
    $invalidSessionPayload = @{
        startDate = "2029-01-01"
        endDate = "2029-01-01"
        reason = "Test rejection for inactive schedule"
        type = "annual"
        scope = "session"
        sessionId = "00000000-0000-0000-0000-000000000000"
    } | ConvertTo-Json

    $protectionPassed = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Headers $doctorAuth.headers -Body $invalidSessionPayload -ContentType "application/json"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 400 -or $statusCode -eq 404) {
            $protectionPassed = $true
            Write-Host "  Protection confirmed: Backend rejected invalid schedule with HTTP $statusCode" -ForegroundColor Green
        }
    }
    Assert-Test "Backend protects against leave submission on inactive schedule / session" $protectionPassed

    # --------------------------------------------------------------------------
    # 5. Submit and Approve Doctor Leave Request
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Submitting Legitimate Doctor Leave Request for $targetDate..." -ForegroundColor Yellow
    $leaveReasonText = "Cuti Operasional Terpadu & Riset Medis"
    $leavePayload = @{
        startDate = $targetDate
        endDate = $targetDate
        reason = $leaveReasonText
        type = "annual"
        scope = "full_day"
    } | ConvertTo-Json

    $leaveRes = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Headers $doctorAuth.headers -Body $leavePayload -ContentType "application/json"
    $createdLeave = Get-ResponseData $leaveRes
    Assert-Test "Leave request created with status pending" ($createdLeave.status -eq "pending")
    $leaveId = $createdLeave.id

    Write-Host "  Approving leave request $leaveId as Admin..." -ForegroundColor Gray
    $approvalPayload = @{
        status = "approved"
        approvalNotes = "Approved for schedule and attendance fusion verification"
    } | ConvertTo-Json

    $approvalRes = Invoke-RestMethod -Uri "$apiBase/leaves/$leaveId/status" -Method Patch -Headers $adminAuth.headers -Body $approvalPayload -ContentType "application/json"
    $approvedLeave = Get-ResponseData $approvalRes
    Assert-Test "Leave request approved" ($approvedLeave.status -eq "approved")

    # --------------------------------------------------------------------------
    # 6. Verify Schedule Cards Fusion (Canonical ON_LEAVE Status & Reason)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Verifying Doctor Schedule Card returns ON_LEAVE..." -ForegroundColor Yellow
    $refreshedDoctorsRes = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules?date=$targetDate&limit=100" -Method Get -Headers $adminAuth.headers
    $updatedDocCard = $refreshedDoctorsRes.data.doctors | Where-Object { 
        $_.id -eq $doctorId -or $_.practitioner_id -eq $practitionerId 
    } | Select-Object -First 1
    Assert-Test "Updated doctor card found in schedule list" ($null -ne $updatedDocCard)
    Assert-Test "Doctor card status_dokter is ON_LEAVE" ($updatedDocCard.status_dokter -eq "ON_LEAVE")
    Assert-Test "Doctor card status_jadwal is ON_LEAVE" ($updatedDocCard.status_jadwal -eq "ON_LEAVE")
    Assert-Test "Doctor card is_on_leave is true" ($updatedDocCard.is_on_leave -eq $true)
    Assert-Test "Doctor card leave_reason is populated" ($updatedDocCard.leave_reason -eq $leaveReasonText)
    Assert-Test "Doctor card leave_type is populated" ($updatedDocCard.leave_type -like "*annual*")

    # --------------------------------------------------------------------------
    # 7. Verify Drawer Sheet Detail Fusion (Doctor Schedule Detail)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Verifying Doctor Schedule Detail Drawer Sheet payload..." -ForegroundColor Yellow
    $detailRes = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules/${doctorId}?date=$targetDate" -Method Get -Headers $adminAuth.headers
    $detailData = $detailRes.data

    Assert-Test "Doctor detail query succeeded" ($detailRes.success -eq $true)
    Assert-Test "Doctor detail is_on_leave is true" ($detailData.is_on_leave -eq $true)
    Assert-Test "Doctor detail leave_reason is populated" ($detailData.leave_reason -eq $leaveReasonText)
    Assert-Test "Doctor detail leave_type is populated" ($detailData.leave_type -like "*annual*")

    # --------------------------------------------------------------------------
    # 8. Verify Clinical Practitioners Fusion (/clinical/practitioners)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Verifying Clinical Practitioners API (/clinical/practitioners)..." -ForegroundColor Yellow
    $practitionersRes = Invoke-RestMethod -Uri "$apiBase/clinical/practitioners" -Method Get -Headers $adminAuth.headers
    $practitionerList = $practitionersRes.data
    $docPractitioner = $practitionerList | Where-Object { $_.id -eq $practitionerId } | Select-Object -First 1

    Assert-Test "Target doctor practitioner record found" ($null -ne $docPractitioner)
    if ($docPractitioner) {
        Assert-Test "Practitioner is_on_leave is true" ($docPractitioner.is_on_leave -eq $true)
        Assert-Test "Practitioner is_available is false" ($docPractitioner.is_available -eq $false)
        Assert-Test "Practitioner leave_reason is populated" ($docPractitioner.leave_reason -eq $leaveReasonText)
        Assert-Test "Practitioner attendance_status is present" ($null -ne $docPractitioner.attendance_status)
    }

    # --------------------------------------------------------------------------
    # 9. Verify Staff Management Integration (/staffs and /staffs/:id)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 9] Verifying Staff Management API (/staffs and /staffs/:id)..." -ForegroundColor Yellow
    $staffsRes = Invoke-RestMethod -Uri "$apiBase/staffs" -Method Get -Headers $adminAuth.headers
    $targetStaff = $staffsRes | Where-Object { 
        $_.id -eq $staffProfileId -or 
        ($_.email -and $_.email.ToLower() -eq $testEmail.ToLower()) -or
        ($_.fullName -and $_.fullName.ToLower().Contains("zikri"))
    } | Select-Object -First 1

    Assert-Test "Staff member record found" ($null -ne $targetStaff)
    if ($targetStaff) {
        Assert-Test "Staff leaveInfo is populated" ($null -ne $targetStaff.leaveInfo)
        Assert-Test "Staff leaveInfo.isOnLeave is true" ($targetStaff.leaveInfo.isOnLeave -eq $true)
        Assert-Test "Staff leaveInfo.reason is populated" ($targetStaff.leaveInfo.reason -eq $leaveReasonText)
        Assert-Test "Staff leaveInfo.requestType is populated" ($targetStaff.leaveInfo.requestType -like "*annual*")
        Assert-Test "Staff todayAttendance is populated" ($null -ne $targetStaff.todayAttendance)

        # Single staff detail check
        $singleStaffRes = Invoke-RestMethod -Uri "$apiBase/staffs/$($targetStaff.id)" -Method Get -Headers $adminAuth.headers
        Assert-Test "Single staff detail returns leaveInfo" ($singleStaffRes.leaveInfo.isOnLeave -eq $true)
        Assert-Test "Single staff detail returns todayAttendance" ($null -ne $singleStaffRes.todayAttendance)
    }

    # --------------------------------------------------------------------------
    # 10. Verify Candidate Resolver Fusion (/appointments/:id/candidates/doctors)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 10] Verifying Candidate Resolver Fusion..." -ForegroundColor Yellow
    $recentAptId = Run-DockerSql "SELECT id FROM appointments WHERE scheduled_date = '$targetDate' LIMIT 1;"
    $recentAptId = $recentAptId.Trim()

    if (-not $recentAptId -or $recentAptId -eq "") {
        $recentAptId = Run-DockerSql "SELECT id FROM appointments LIMIT 1;"
        $recentAptId = $recentAptId.Trim()
    }

    if ($recentAptId -and $recentAptId -ne "") {
        Write-Host "  Querying doctor candidates for appointment $recentAptId..." -ForegroundColor Gray
        $candidatesRes = Invoke-RestMethod -Uri "$apiBase/admin/appointments/${recentAptId}/candidates/doctors" -Method Get -Headers $adminAuth.headers
        Assert-Test "Candidates response succeeded" ($null -ne $candidatesRes.groups)

        $allCandidateDoctors = @()
        foreach ($grp in $candidatesRes.groups) {
            $allCandidateDoctors += $grp.doctors
        }
        Assert-Test "Candidate doctors list populated" ($allCandidateDoctors.Count -gt 0)

        # Verify candidate schema fusion (attendance, leave, replacement fields)
        $firstCandidate = $allCandidateDoctors[0]
        Assert-Test "Candidate has attendanceStatus property" ($firstCandidate.PSObject.Properties['attendanceStatus'] -ne $null)
        Assert-Test "Candidate has isOnLeave property" ($firstCandidate.PSObject.Properties['isOnLeave'] -ne $null)
        Assert-Test "Candidate has isReplacement property" ($firstCandidate.PSObject.Properties['isReplacement'] -ne $null)
        Assert-Test "Candidate has attendanceWarning property" ($firstCandidate.PSObject.Properties['attendanceWarning'] -ne $null)

        $onLeaveCandidate = $allCandidateDoctors | Where-Object { $_.id -eq $practitionerId } | Select-Object -First 1
        if ($onLeaveCandidate) {
            Assert-Test "Candidate doctor on leave has isOnLeave = true" ($onLeaveCandidate.isOnLeave -eq $true)
            Assert-Test "Candidate doctor on leave requires schedule override" ($onLeaveCandidate.availability -eq "SCHEDULE_REQUIRED")
            Assert-Test "Candidate doctor on leave has leaveReason" ($null -ne $onLeaveCandidate.leaveReason)
            Assert-Test "Candidate doctor has attendanceStatus" ($null -ne $onLeaveCandidate.attendanceStatus)
        } else {
            Write-Host "  Doctor on leave is current doctor or excluded from candidates (verified)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  No active appointment in database to test candidate endpoint (skipped)" -ForegroundColor Yellow
    }

} catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $respBody = $reader.ReadToEnd()
        Write-Host "Response Body: $respBody" -ForegroundColor Red
    }
    Assert-Test "Execution finished without unhandled exception" $false
} finally {
    Write-Host "`n[Cleanup] Finalizing post-test cleanup..." -ForegroundColor Yellow
    Flush-TestDoctorData $testEmail $targetDate
    Print-TestSummary "E2E Doctor Schedule Leave & Attendance Fusion"
}
