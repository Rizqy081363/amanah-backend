param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: LEAVE REQUEST OVERLAP VALIDATION & CLINIC PERIOD POLICY" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

function Get-ErrorJson($err) {
    $raw = $err.ErrorDetails.Message
    if (-not $raw -and $err.Exception.Response) {
        $stream = $err.Exception.Response.GetResponseStream()
        if ($stream.CanSeek) { $stream.Position = 0 }
        $reader = [System.IO.StreamReader]::new($stream)
        $raw = $reader.ReadToEnd()
    }
    if ($raw) {
        try {
            return ($raw | ConvertFrom-Json)
        } catch {
            return @{ message = $raw; detail = $raw }
        }
    }
    return $null
}

try {
    # --------------------------------------------------------------------------
    # Step 1: Health and Readiness
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 1] Checking API Readiness..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    # --------------------------------------------------------------------------
    # Step 2: Authenticate Actors (Admin, Doctor, Operational Staff)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Authenticating Admin, Doctor, and Operational Staff..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

    $doctorAuth = Login-Doctor
    Assert-Test "Doctor authenticated" ($null -ne $doctorAuth.token)

    $staffAuth = Login-User "frontdesk.dimas@amanah-healthcare.test" "secret123"
    Assert-Test "Operational Staff (Dimas) authenticated" ($null -ne $staffAuth.token)

    # --------------------------------------------------------------------------
    # Step 3: Baseline Policy Setup & Data Sanitization
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Setting baseline policy to 'non_overlapping' & sanitizing test records..." -ForegroundColor Yellow
    $resetPolicyPayload = @{
        periodPolicy = "non_overlapping"
    } | ConvertTo-Json

    $policyRes = Invoke-RestMethod -Uri "$apiBase/work-policies/leave-policy" -Method Patch -Body $resetPolicyPayload -ContentType 'application/json' -Headers $adminAuth.headers
    Assert-Test "Policy set to non_overlapping" ($policyRes.periodPolicy -eq "non_overlapping")

    $testPrefix = "Overlap & Period Policy E2E Test"
    $cleanSql = "DELETE FROM staff_leave_requests WHERE reason LIKE '%$testPrefix%';"
    $null = Run-DockerSql $cleanSql
    Assert-Test "Sanitized prior test leaves with prefix '$testPrefix'" $true

    # Query active session def for session-scoped testing
    $sessId = (Run-DockerSql "SELECT id FROM session_def WHERE is_active = true LIMIT 1;").Trim()
    Assert-Test "Active session definition retrieved ($sessId)" ($sessId.Length -gt 0)

    # Dynamic date calculations
    $now = Get-Date
    $day10 = $now.AddDays(10).ToString("yyyy-MM-dd")
    $day11 = $now.AddDays(11).ToString("yyyy-MM-dd")
    $day15 = $now.AddDays(15).ToString("yyyy-MM-dd")
    $day16 = $now.AddDays(16).ToString("yyyy-MM-dd")
    $day17 = $now.AddDays(17).ToString("yyyy-MM-dd")
    $day18 = $now.AddDays(18).ToString("yyyy-MM-dd")
    $day19 = $now.AddDays(19).ToString("yyyy-MM-dd")
    $day20 = $now.AddDays(20).ToString("yyyy-MM-dd")
    $day21 = $now.AddDays(21).ToString("yyyy-MM-dd")
    $day25 = $now.AddDays(25).ToString("yyyy-MM-dd")
    $day40 = $now.AddDays(40).ToString("yyyy-MM-dd")
    $day41 = $now.AddDays(41).ToString("yyyy-MM-dd")

    # --------------------------------------------------------------------------
    # Test 1: Exact Date Duplicate Protection (Pending Request Blocks Duplicate)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 1] Testing exact date duplicate protection (Pending blocks duplicate)..." -ForegroundColor Yellow
    $exactPayload1 = @{
        startDate = $day10
        endDate = $day10
        reason = "$($testPrefix): Original Pending Request Day 10"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $req1 = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $exactPayload1 -ContentType 'application/json' -Headers $doctorAuth.headers
    $leave1 = Get-ResponseData $req1
    Assert-Test "First leave request submitted on $day10" ($null -ne $leave1.id)
    Assert-Test "First leave status is pending" ($leave1.status -eq "pending")

    # Attempt exact duplicate submission
    $exactPayloadDuplicate = @{
        startDate = $day10
        endDate = $day10
        reason = "$($testPrefix): Duplicate Pending Request on Day 10"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedDuplicate = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $exactPayloadDuplicate -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedDuplicate = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        $errorMsg = if ($json.detail) { $json.detail } else { $json.message }
        
        Assert-Test "Duplicate request rejected with HTTP 400" ($statusCode -eq 400)
        Assert-Test "Error message identifies pending conflict" ($errorMsg -match "menunggu persetujuan \(pending\)")
        Assert-Test "Error message mentions conflicting date $day10" ($errorMsg -match $day10)
    }
    Assert-Test "Backend rejected exact duplicate on pending date" $rejectedDuplicate

    # --------------------------------------------------------------------------
    # Test 2: Sub-Interval & Multi-Day Overlap Protection
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 2] Testing sub-interval and multi-day overlap protection..." -ForegroundColor Yellow
    # Create multi-day leave on Day 15 to Day 20
    $multiPayload = @{
        startDate = $day15
        endDate = $day20
        reason = "$($testPrefix): Multi-day Span Day 15 to Day 20"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $reqMulti = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $multiPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    $leaveMulti = Get-ResponseData $reqMulti
    Assert-Test "Multi-day leave ($day15 to $day20) submitted" ($null -ne $leaveMulti.id)

    # 2A: Interior Sub-Interval (Day 17 to Day 18)
    Write-Host "  Subtest 2A: Interior sub-interval ($day17 to $day18)..." -ForegroundColor Gray
    $interiorPayload = @{
        startDate = $day17
        endDate = $day18
        reason = "$($testPrefix): Interior Sub-interval"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedInterior = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $interiorPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedInterior = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Interior sub-interval rejected with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected interior sub-interval" $rejectedInterior

    # 2B: Start Date Overlap (Day 14 to Day 16)
    $day14 = $now.AddDays(14).ToString("yyyy-MM-dd")
    Write-Host "  Subtest 2B: Overlapping start boundary ($day14 to $day16)..." -ForegroundColor Gray
    $overlapStartPayload = @{
        startDate = $day14
        endDate = $day16
        reason = "$($testPrefix): Overlap Start Boundary"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedStart = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $overlapStartPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedStart = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Overlapping start boundary rejected with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected overlapping start boundary" $rejectedStart

    # 2C: End Date Overlap (Day 19 to Day 22)
    $day22 = $now.AddDays(22).ToString("yyyy-MM-dd")
    Write-Host "  Subtest 2C: Overlapping end boundary ($day19 to $day22)..." -ForegroundColor Gray
    $overlapEndPayload = @{
        startDate = $day19
        endDate = $day22
        reason = "$($testPrefix): Overlap End Boundary"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedEnd = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $overlapEndPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedEnd = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Overlapping end boundary rejected with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected overlapping end boundary" $rejectedEnd

    # 2D: Encompassing Range (Day 14 to Day 22)
    Write-Host "  Subtest 2D: Fully encompassing span ($day14 to $day22)..." -ForegroundColor Gray
    $encompassingPayload = @{
        startDate = $day14
        endDate = $day22
        reason = "$($testPrefix): Encompassing Span"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedEncompassing = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $encompassingPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedEncompassing = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Fully encompassing span rejected with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected fully encompassing span" $rejectedEncompassing

    # --------------------------------------------------------------------------
    # Test 3: Boundary Condition (Adjacent Non-Overlapping Dates MUST be Permitted)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 3] Testing adjacent non-overlapping dates (Boundary Condition)..." -ForegroundColor Yellow
    # Range [Day 15 .. Day 20] exists. Adjacent is Day 21 .. Day 21
    $adjacentPayload = @{
        startDate = $day21
        endDate = $day21
        reason = "$($testPrefix): Adjacent Date Allowed"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $reqAdj = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $adjacentPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    $leaveAdj = Get-ResponseData $reqAdj
    Assert-Test "Adjacent non-overlapping date ($day21) successfully created" ($null -ne $leaveAdj.id)

    # --------------------------------------------------------------------------
    # Test 4: Full-Day vs Session-Scoped Overlap Conflict
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 4] Testing full-day vs session-scoped overlap conflict..." -ForegroundColor Yellow
    # Full-day leave on Day 25
    $fullDay25Payload = @{
        startDate = $day25
        endDate = $day25
        reason = "$($testPrefix): Full Day on Day 25"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $req25 = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $fullDay25Payload -ContentType 'application/json' -Headers $doctorAuth.headers
    $leave25 = Get-ResponseData $req25
    Assert-Test "Full-day leave on $day25 created" ($null -ne $leave25.id)

    # Attempt session-scoped leave on the same day ($day25)
    $sessionOnFullDayPayload = @{
        startDate = $day25
        endDate = $day25
        reason = "$($testPrefix): Session on Full-Day Date"
        type = "annual_leave"
        scope = "session"
        sessionIds = @($sessId)
    } | ConvertTo-Json

    $rejectedSessionOnFull = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $sessionOnFullDayPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedSessionOnFull = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Session leave on existing full-day date rejected with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected session leave conflicting with full-day leave" $rejectedSessionOnFull

    # --------------------------------------------------------------------------
    # Test 5: Approved Leave Overlap Protection
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 5] Testing approved leave overlap protection..." -ForegroundColor Yellow
    # Admin approves the Day 10 leave
    $approvePayload = @{
        status = "approved"
        approvalNotes = "Approved by Admin for Overlap E2E Test"
    } | ConvertTo-Json

    $apprRes = Invoke-RestMethod -Uri "$apiBase/leaves/$($leave1.id)/status" -Method Patch -Body $approvePayload -ContentType 'application/json' -Headers $adminAuth.headers
    $approvedLeave = Get-ResponseData $apprRes
    Assert-Test "Day 10 leave status updated to approved" ($approvedLeave.status -eq "approved")

    # Attempt to submit new leave on Day 10
    $rejectedApprovedOverlap = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $exactPayloadDuplicate -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedApprovedOverlap = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        $errorMsg = if ($json.detail) { $json.detail } else { $json.message }
        
        Assert-Test "Overlap with approved leave rejected with HTTP 400" ($statusCode -eq 400)
        Assert-Test "Error message identifies 'telah disetujui'" ($errorMsg -match "telah disetujui")
    }
    Assert-Test "Backend rejected overlap with approved leave" $rejectedApprovedOverlap

    # --------------------------------------------------------------------------
    # Test 6: Cancelled Request Unblocks the Slot
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 6] Testing cancellation unblocks slot for resubmission..." -ForegroundColor Yellow
    # Cancel the adjacent leave ($leaveAdj.id on Day 21)
    $cancelRes = Invoke-RestMethod -Uri "$apiBase/leaves/$($leaveAdj.id)/cancel" -Method Patch -Headers $doctorAuth.headers
    $cancelledLeave = Get-ResponseData $cancelRes
    Assert-Test "Day 21 leave successfully cancelled" ($cancelledLeave.status -eq "cancelled")

    # Resubmit on Day 21
    $resubmitPayload = @{
        startDate = $day21
        endDate = $day21
        reason = "$($testPrefix): Resubmission After Cancellation on Day 21"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $resubmitReq = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $resubmitPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    $resubmittedLeave = Get-ResponseData $resubmitReq
    Assert-Test "Resubmission on unblocked date ($day21) succeeded" ($null -ne $resubmittedLeave.id)

    # --------------------------------------------------------------------------
    # Test 7: Strict Mode Protection (Policy B: previous_period_must_finish)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 7] Testing clinic strict mode (previous_period_must_finish)..." -ForegroundColor Yellow
    # Switch policy to strict mode
    $strictPolicyPayload = @{
        periodPolicy = "previous_period_must_finish"
    } | ConvertTo-Json

    $strictPolicyRes = Invoke-RestMethod -Uri "$apiBase/work-policies/leave-policy" -Method Patch -Body $strictPolicyPayload -ContentType 'application/json' -Headers $adminAuth.headers
    Assert-Test "Policy updated to previous_period_must_finish" ($strictPolicyRes.periodPolicy -eq "previous_period_must_finish")

    # Doctor currently has future leaves scheduled (Day 10, Day 15-20, Day 21, Day 25).
    # Attempt to submit a non-overlapping leave far in the future ($day40 to $day41)
    $futureStrictPayload = @{
        startDate = $day40
        endDate = $day41
        reason = "$($testPrefix): Future Leave Under Strict Policy"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedStrictFuture = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $futureStrictPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedStrictFuture = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        $errorMsg = if ($json.detail) { $json.detail } else { $json.message }
        
        Assert-Test "Future leave rejected under strict mode with HTTP 400" ($statusCode -eq 400)
        Assert-Test "Error message mentions prior period must finish" ($errorMsg -match "selesai terlebih dahulu")
    }
    Assert-Test "Backend enforced previous_period_must_finish constraint" $rejectedStrictFuture

    # --------------------------------------------------------------------------
    # Test 8: Mode Toggle Flexibility (Reverting to non_overlapping Unblocks)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 8] Testing mode toggle flexibility (Reverting to non_overlapping)..." -ForegroundColor Yellow
    $flexPolicyPayload = @{
        periodPolicy = "non_overlapping"
    } | ConvertTo-Json

    $flexPolicyRes = Invoke-RestMethod -Uri "$apiBase/work-policies/leave-policy" -Method Patch -Body $flexPolicyPayload -ContentType 'application/json' -Headers $adminAuth.headers
    Assert-Test "Policy reverted back to non_overlapping" ($flexPolicyRes.periodPolicy -eq "non_overlapping")

    # Now resubmit the future leave ($day40 to $day41)
    $flexReq = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $futureStrictPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    $flexLeave = Get-ResponseData $flexReq
    Assert-Test "Future non-overlapping leave successfully created in flexible mode" ($null -ne $flexLeave.id)

    # --------------------------------------------------------------------------
    # Test 9: Cross-Staff Isolation (Distinct Staff Do NOT Conflict)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 9] Testing cross-staff isolation (Dimas submits on Doctor's Day 25)..." -ForegroundColor Yellow
    $staffPayload = @{
        startDate = $day25
        endDate = $day25
        reason = "$($testPrefix): Dimas Leave on Same Day as Doctor"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $staffReq = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $staffPayload -ContentType 'application/json' -Headers $staffAuth.headers
    $staffLeave = Get-ResponseData $staffReq
    Assert-Test "Operational Staff leave on Day 25 created without interfering with Doctor" ($null -ne $staffLeave.id)

    # --------------------------------------------------------------------------
    # Test 10: Teardown & Final State Hygiene
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 10] Cleaning up test records and restoring baseline policy..." -ForegroundColor Yellow
    $null = Run-DockerSql "DELETE FROM staff_leave_requests WHERE reason LIKE '%$testPrefix%';"
    $remaining = Run-DockerSql "SELECT COUNT(*) FROM staff_leave_requests WHERE reason LIKE '%$testPrefix%';"
    Assert-Test "Test leave records purged from database (Count: $($remaining.Trim()))" ($remaining.Trim() -eq "0")

    # Ensure policy remains in non_overlapping
    $finalPolicyCheck = Invoke-RestMethod -Uri "$apiBase/work-policies/current" -Method Get -Headers $adminAuth.headers
    Assert-Test "Final leave policy is non_overlapping" ($finalPolicyCheck.policy.periodPolicy -eq "non_overlapping")

    Print-TestSummary "LEAVE OVERLAP VALIDATION & CLINIC PERIOD POLICY E2E"
    exit 0

} catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
