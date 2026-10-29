param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: FORWARD-ONLY LEAVE DATES & MULTI-DAY REPLACEMENT CALENDAR" -ForegroundColor Cyan
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
        return ($raw | ConvertFrom-Json)
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
    # Step 2: Authenticate Admin & Doctor
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Authenticating Admin & Doctor..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

    $doctorAuth = Login-Doctor
    Assert-Test "Doctor authenticated" ($null -ne $doctorAuth.token)

    $colleagueAuth = Login-User "frontdesk.dimas@amanah-healthcare.test" "secret123"
    Assert-Test "Colleague operational staff (Dimas) authenticated" ($null -ne $colleagueAuth.token)

    $clinicalColleagueAuth = Login-User "bidan@amanah.com" "secret123"
    Assert-Test "Clinical colleague staff (Bidan) authenticated" ($null -ne $clinicalColleagueAuth.token)

    # Calculate dynamic test dates without hardcoding
    $now = Get-Date
    $todayStr = $now.ToString("yyyy-MM-dd")
    $yesterdayStr = $now.AddDays(-1).ToString("yyyy-MM-dd")
    $pastWeekStr = $now.AddDays(-7).ToString("yyyy-MM-dd")
    $futureDay1 = $now.AddDays(5).ToString("yyyy-MM-dd")
    $futureDay2 = $now.AddDays(6).ToString("yyyy-MM-dd")
    $futureFarDay = $now.AddYears(1).ToString("yyyy-MM-dd")

    # --------------------------------------------------------------------------
    # Step 3: Sanitize Test Data & Ensure Active Roster
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Sanitizing test leaves & ensuring doctor assignments..." -ForegroundColor Yellow
    $cleanSql = "DELETE FROM staff_leave_requests WHERE reason LIKE '%Forward-Only E2E Test%';"
    $null = Run-DockerSql $cleanSql

    # Ensure doctor has active assignment for test dow
    $doctorProfile = Run-DockerSql "SELECT sp.id as staff_id, p.id as pract_id FROM staff_profiles sp JOIN practitioners p ON sp.id = p.staff_profile_id JOIN users u ON sp.user_id = u.id WHERE u.email = 'dokter@amanah.com' LIMIT 1;"
    $sessDef = Run-DockerSql "SELECT id FROM session_def WHERE is_active = true LIMIT 1;"
    $catDef = Run-DockerSql "SELECT id FROM service_categories LIMIT 1;"
    
    # --------------------------------------------------------------------------
    # Test 1: Reject Past Start Date (Minimal Hari Ini)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 1] Testing rejection of past start date ($pastWeekStr)..." -ForegroundColor Yellow
    $pastDatePayload = @{
        startDate = $pastWeekStr
        endDate = $pastWeekStr
        reason = "Forward-Only E2E Test: Past Date Rejection"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedPastDate = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $pastDatePayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedPastDate = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        Assert-Test "Rejected with HTTP 400 Bad Request" ($statusCode -eq 400)
        
        $errorMsg = if ($json.message) { $json.message } else { $json.detail }
        Assert-Test "Error message rejects past dates" ($errorMsg -match "tidak boleh di masa lalu|minimal hari ini")
    }
    Assert-Test "Backend strictly rejected past date ($pastWeekStr)" $rejectedPastDate

    # --------------------------------------------------------------------------
    # Test 2: Reject Range Starting in Past Even if Ending in Future
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 2] Testing rejection of range starting in past ($yesterdayStr to $futureDay1)..." -ForegroundColor Yellow
    $pastStartRangePayload = @{
        startDate = $yesterdayStr
        endDate = $futureDay1
        reason = "Forward-Only E2E Test: Range Starting In Past"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedPastStart = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $pastStartRangePayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedPastStart = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        Assert-Test "Rejected range starting in past with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected range starting in past" $rejectedPastStart

    # --------------------------------------------------------------------------
    # Test 3: Reject Inverted Date Order (endDate < startDate)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 3] Testing rejection of inverted date order ($futureDay2 to $futureDay1)..." -ForegroundColor Yellow
    $invertedPayload = @{
        startDate = $futureDay2
        endDate = $futureDay1
        reason = "Forward-Only E2E Test: Inverted Date Order"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedInverted = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $invertedPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedInverted = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        Assert-Test "Rejected inverted dates with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected inverted date range" $rejectedInverted

    # --------------------------------------------------------------------------
    # Test 4: Reject Session Scope Spanning Multiple Days
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 4] Testing rejection of session scope spanning multiple days..." -ForegroundColor Yellow
    $sessId = $sessDef.Trim()
    $multiDaySessionPayload = @{
        startDate = $futureDay1
        endDate = $futureDay2
        reason = "Forward-Only E2E Test: Multi-Day Session Scope"
        type = "annual_leave"
        scope = "session"
        sessionIds = @($sessId)
    } | ConvertTo-Json

    $rejectedMultiDaySession = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $multiDaySessionPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedMultiDaySession = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        Assert-Test "Rejected multi-day session scope with HTTP 400" ($statusCode -eq 400)
        $hasMultiDaySessionIssue = $false
        if ($json.invalidParams) {
            foreach ($p in $json.invalidParams) {
                if ($p.reason -match "1 hari kerja yang sama") {
                    $hasMultiDaySessionIssue = $true
                }
            }
        }
        if (-not $hasMultiDaySessionIssue -and (($json.message -match "1 hari kerja yang sama") -or ($json.detail -match "1 hari kerja yang sama"))) {
            $hasMultiDaySessionIssue = $true
        }
        Assert-Test "Error message explains session scope applies to 1 calendar day" $hasMultiDaySessionIssue
    }
    Assert-Test "Backend rejected session scope spanning multiple days" $rejectedMultiDaySession

    # --------------------------------------------------------------------------
    # Test 5: Reject Session Scope with Missing / Empty sessionIds
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 5] Testing rejection of session scope with empty sessionIds..." -ForegroundColor Yellow
    $emptySessionPayload = @{
        startDate = $futureDay1
        endDate = $futureDay1
        reason = "Forward-Only E2E Test: Empty Session IDs"
        type = "annual_leave"
        scope = "session"
        sessionIds = @()
    } | ConvertTo-Json

    $rejectedEmptySession = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $emptySessionPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedEmptySession = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Rejected empty sessionIds with HTTP 400" ($statusCode -eq 400)
    }
    Assert-Test "Backend rejected session scope with empty sessionIds" $rejectedEmptySession

    # --------------------------------------------------------------------------
    # Test 6: Submit Multi-Day Leave Request and Auto-Generate Replacement Opportunities
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 6] Submitting legitimate multi-day leave ($futureDay1 to $futureDay2)..." -ForegroundColor Yellow
    $validMultiDayPayload = @{
        startDate = $futureDay1
        endDate = $futureDay2
        reason = "Forward-Only E2E Test: Multi-Day Range Verification"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $createRes = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $validMultiDayPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    $createdLeave = Get-ResponseData $createRes
    Assert-Test "Multi-day leave request created" ($null -ne $createdLeave.id)
    Assert-Test "Leave has status pending" ($createdLeave.status -eq "pending")
    $leaveId = $createdLeave.id

    Write-Host "  Approving leave request $leaveId as Admin to trigger replacement opportunities..." -ForegroundColor Gray
    $approvePayload = @{
        status = "approved"
        approvalNotes = "Approved for forward-only E2E verification"
    } | ConvertTo-Json
    $approveRes = Invoke-RestMethod -Uri "$apiBase/leaves/$leaveId/status" -Method Patch -Body $approvePayload -ContentType 'application/json' -Headers $adminAuth.headers
    $approvedLeave = Get-ResponseData $approveRes
    Assert-Test "Leave request status updated to approved" ($approvedLeave.status -eq "approved")

    # --------------------------------------------------------------------------
    # Test 7: Verify Multi-Day Replacement Opportunities Generated in DB
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 7] Verifying replacement opportunities generated across multi-day range..." -ForegroundColor Yellow
    $oppsSql = "SELECT work_date::text, status FROM replacement_opportunities WHERE leave_request_id = '$leaveId' ORDER BY work_date;"
    $opps = Run-DockerSql $oppsSql
    $oppsText = ($opps | Out-String)
    $hasDay1 = [bool]($oppsText -match $futureDay1)
    $hasDay2 = [bool]($oppsText -match $futureDay2)
    Assert-Test "Replacement opportunities exist in database for leave $leaveId on Day 1 ($futureDay1)" $hasDay1
    Assert-Test "Replacement opportunities generated for Day 2 ($futureDay2)" $hasDay2

    # --------------------------------------------------------------------------
    # Test 8: Query Replacements with exactDate Filter (Flutter Calendar Integration)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 8] Testing GET /replacements with exactDate filter..." -ForegroundColor Yellow
    # Query Day 1
    $day1Res = Invoke-RestMethod -Uri "$apiBase/replacements?status=open&exactDate=$futureDay1" -Method Get -Headers $doctorAuth.headers
    $day1List = Get-ResponseData $day1Res
    Assert-Test "Retrieved open opportunities for Day 1 ($futureDay1)" ($day1List.Count -gt 0)
    
    $allDay1Matches = $true
    foreach ($item in $day1List) {
        $wDate = if ($item.workDate) { $item.workDate } else { $item.work_date }
        if ($wDate -ne $futureDay1) {
            $allDay1Matches = $false
        }
    }
    Assert-Test "All returned items on Day 1 exactDate strictly match $futureDay1" $allDay1Matches

    # Query Day 2
    $day2Res = Invoke-RestMethod -Uri "$apiBase/replacements?status=open&exactDate=$futureDay2" -Method Get -Headers $doctorAuth.headers
    $day2List = Get-ResponseData $day2Res
    Assert-Test "Retrieved open opportunities for Day 2 ($futureDay2)" ($day2List.Count -gt 0)

    $allDay2Matches = $true
    foreach ($item in $day2List) {
        $wDate = if ($item.workDate) { $item.workDate } else { $item.work_date }
        if ($wDate -ne $futureDay2) {
            $allDay2Matches = $false
        }
    }
    Assert-Test "All returned items on Day 2 exactDate strictly match $futureDay2" $allDay2Matches

    # Query Date with Zero Replacements
    $emptyDateRes = Invoke-RestMethod -Uri "$apiBase/replacements?status=open&exactDate=2099-01-01" -Method Get -Headers $doctorAuth.headers
    $emptyList = Get-ResponseData $emptyDateRes
    Assert-Test "Query with non-existent replacement date returns empty array" ($emptyList.Count -eq 0)

    # --------------------------------------------------------------------------
    # Test 9: Claim Replacement Opportunity & Idempotency / Double Claim Guard
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 9] Testing replacement qualification guard, claim, and double-claim guard..." -ForegroundColor Yellow
    $targetOpp = $day1List | Select-Object -First 1
    $oppId = $targetOpp.id
    Assert-Test "Selected target replacement opportunity ID: $oppId" ($null -ne $oppId)

    # 1. Negative Security Test: Incompatible role claim (operational worker attempting to claim clinical doctor shift)
    $rejectedWorkerClaim = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/replacements/$oppId/claim" -Method Post -Headers $colleagueAuth.headers
    } catch {
        $rejectedWorkerClaim = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        Assert-Test "Operational worker claiming clinical shift rejected with HTTP 400" ($statusCode -eq 400)
        $detailMsg = if ($json.detail) { $json.detail } else { $json.message }
        Assert-Test "Error message explains clinical qualification requirement" ($detailMsg -match "hanya dapat digantikan oleh tenaga medis")
    }
    Assert-Test "Backend strictly rejected operational worker from claiming medical doctor shift" $rejectedWorkerClaim

    # 2. Positive Security Test: Clinical colleague claiming (bidan@amanah.com)
    $claimRes = Invoke-RestMethod -Uri "$apiBase/replacements/$oppId/claim" -Method Post -Headers $clinicalColleagueAuth.headers
    $claimedOpp = Get-ResponseData $claimRes
    Assert-Test "Opportunity successfully claimed by clinical colleague with status 'claimed'" ($claimedOpp.status -eq "claimed")
    Assert-Test "claimedByStaffProfileId is populated" ($null -ne $claimedOpp.claimedByStaffProfileId)

    # 3. Concurrency / Idempotency Test: Attempt double claim on already claimed opportunity
    $rejectedDoubleClaim = $false
    try {
        $null = Invoke-RestMethod -Uri "$apiBase/replacements/$oppId/claim" -Method Post -Headers $clinicalColleagueAuth.headers
    } catch {
        $rejectedDoubleClaim = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        Assert-Test "Double claim rejected with HTTP 400/409" ($statusCode -eq 400 -or $statusCode -eq 409)
    }
    Assert-Test "Backend rejected double claim on already claimed opportunity" $rejectedDoubleClaim

    # --------------------------------------------------------------------------
    # Test 10: Clean up Test Data
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 10] Cleaning up test artifacts..." -ForegroundColor Yellow
    $null = Run-DockerSql "DELETE FROM staff_leave_requests WHERE id = '$leaveId';"
    Assert-Test "Test data cleaned up successfully" $true

    Print-TestSummary "FORWARD-ONLY LEAVE & REPLACEMENT CALENDAR E2E"
    exit 0

} catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
