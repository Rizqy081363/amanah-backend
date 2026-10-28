param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: LEAVE ZOD VALIDATION CONTRACTS & REJECTION HARDENING" -ForegroundColor Cyan
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
    return ($raw | ConvertFrom-Json)
}

try {
    # 1. Health and Readiness
    Write-Host "`n[Step 1] Checking API Readiness..." -ForegroundColor Yellow
    Wait-E2EApiReady
    $apiBase = Get-E2EApiBaseUrl
    Assert-Test "API is ready at $apiBase" ($null -ne $apiBase)

    # 2. Authenticate
    Write-Host "`n[Step 2] Authenticating Admin & Doctor..." -ForegroundColor Yellow
    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

    $doctorAuth = Login-Doctor
    Assert-Test "Doctor authenticated" ($null -ne $doctorAuth.token)

    $todayStr = (Get-Date).ToString("yyyy-MM-dd")
    $tomorrowStr = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
    $yesterdayStr = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")

    # Clean old test leaves for clean state
    $flushSql = "DELETE FROM staff_leave_requests WHERE reason LIKE '%Zod Contract Verification%';"
    $null = Run-DockerSql $flushSql

    # --------------------------------------------------------------------------
    # Test 1: Reject Non-Canonical Leave Type ("cutiTahunan")
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 1] Testing rejection of non-canonical leave type ('cutiTahunan')..." -ForegroundColor Yellow
    $badTypePayload = @{
        startDate = $tomorrowStr
        endDate = $tomorrowStr
        reason = "Test Zod Contract Verification Non-Canonical Type"
        type = "cutiTahunan"
        scope = "full_day"
    } | ConvertTo-Json

    $rejected = $false
    try {
        $res = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $badTypePayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejected = $true
        $statusCode = [int]$_.Exception.Response.StatusCode
        $json = Get-ErrorJson $_
        
        Assert-Test "Rejected with HTTP 400 Bad Request" ($statusCode -eq 400)
        Assert-Test "Response code is VALIDATION_FAILED" ($json.code -eq "VALIDATION_FAILED")
        
        $hasTypeParam = $false
        foreach ($p in $json.invalidParams) {
            if ($p.name -eq "type") {
                $hasTypeParam = $true
                Write-Host "  Observed invalidParam: $($p.name) -> $($p.reason)" -ForegroundColor Gray
            }
        }
        Assert-Test "invalidParams explicitly targets 'type'" $hasTypeParam
    }
    Assert-Test "Backend rejected 'cutiTahunan' without fallback" $rejected

    # --------------------------------------------------------------------------
    # Test 2: Reject Invalid Date Ordering (endDate < startDate)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 2] Testing rejection when endDate precedes startDate..." -ForegroundColor Yellow
    $badDateOrderPayload = @{
        startDate = $tomorrowStr
        endDate = $yesterdayStr
        reason = "Test Zod Contract Verification Inverted Dates"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $rejectedDateOrder = $false
    try {
        $res = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $badDateOrderPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedDateOrder = $true
        $json = Get-ErrorJson $_
        
        $hasEndDateParam = $false
        foreach ($p in $json.invalidParams) {
            if ($p.name -eq "endDate") {
                $hasEndDateParam = $true
                Write-Host "  Observed invalidParam: $($p.name) -> $($p.reason)" -ForegroundColor Gray
            }
        }
        Assert-Test "invalidParams explicitly targets 'endDate'" $hasEndDateParam
    }
    Assert-Test "Backend rejected inverted date range" $rejectedDateOrder

    # --------------------------------------------------------------------------
    # Test 3: Reject Session Scope with Empty SessionIds
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 3] Testing rejection when scope is 'session' but sessionIds is empty..." -ForegroundColor Yellow
    $badSessionPayload = @{
        startDate = $tomorrowStr
        endDate = $tomorrowStr
        reason = "Test Zod Contract Verification Missing Session IDs"
        type = "annual_leave"
        scope = "session"
        sessionIds = @()
    } | ConvertTo-Json

    $rejectedSession = $false
    try {
        $res = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $badSessionPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    } catch {
        $rejectedSession = $true
        $json = Get-ErrorJson $_
        
        $hasSessionParam = $false
        foreach ($p in $json.invalidParams) {
            if ($p.name -eq "sessionIds") {
                $hasSessionParam = $true
                Write-Host "  Observed invalidParam: $($p.name) -> $($p.reason)" -ForegroundColor Gray
            }
        }
        Assert-Test "invalidParams explicitly targets 'sessionIds'" $hasSessionParam
    }
    Assert-Test "Backend rejected session scope with empty sessionIds" $rejectedSession

    # --------------------------------------------------------------------------
    # Test 4: Reject Invalid Status Query Filter
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 4] Testing rejection of invalid status query filter..." -ForegroundColor Yellow
    $rejectedQuery = $false
    try {
        $res = Invoke-RestMethod -Uri "$apiBase/leaves/all?status=unknown_status" -Method Get -Headers $adminAuth.headers
    } catch {
        $rejectedQuery = $true
        $json = Get-ErrorJson $_
        
        $hasStatusParam = $false
        foreach ($p in $json.invalidParams) {
            if ($p.name -eq "status") {
                $hasStatusParam = $true
                Write-Host "  Observed invalidParam: $($p.name) -> $($p.reason)" -ForegroundColor Gray
            }
        }
        Assert-Test "invalidParams explicitly targets 'status' query filter" $hasStatusParam
    }
    Assert-Test "Backend rejected unknown status query filter" $rejectedQuery

    # --------------------------------------------------------------------------
    # Test 5: Accept Valid Canonical Leave Request (annual_leave)
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 5] Testing valid leave submission with canonical 'annual_leave'..." -ForegroundColor Yellow
    # First check eligible sessions on target date
    $sessionsRes = Invoke-RestMethod -Uri "$apiBase/leaves/eligible-sessions?date=$tomorrowStr" -Method Get -Headers $doctorAuth.headers
    $sessions = Get-ResponseData $sessionsRes

    $validPayload = @{
        startDate = $tomorrowStr
        endDate = $tomorrowStr
        reason = "Test Zod Contract Verification Valid Canonical Submission"
        type = "annual_leave"
        scope = "full_day"
    } | ConvertTo-Json

    $createdLeaveRes = Invoke-RestMethod -Uri "$apiBase/leaves" -Method Post -Body $validPayload -ContentType 'application/json' -Headers $doctorAuth.headers
    $createdLeave = Get-ResponseData $createdLeaveRes
    Assert-Test "Leave created with valid ID" ($null -ne $createdLeave.id)
    Assert-Test "Created leave has canonical type 'annual_leave'" ($createdLeave.type -eq "annual_leave")
    Assert-Test "Status is pending" ($createdLeave.status -eq "pending")

    $leaveId = $createdLeave.id

    # --------------------------------------------------------------------------
    # Test 6: Reject Invalid Review Status ('maybe')
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 6] Testing rejection of invalid review status ('maybe')..." -ForegroundColor Yellow
    $badReviewPayload = @{
        status = "maybe"
        approvalNotes = "Consideration"
    } | ConvertTo-Json

    $rejectedReview = $false
    try {
        $res = Invoke-RestMethod -Uri "$apiBase/leaves/$leaveId/status" -Method Patch -Body $badReviewPayload -ContentType 'application/json' -Headers $adminAuth.headers
    } catch {
        $rejectedReview = $true
        $json = Get-ErrorJson $_
        
        $hasReviewParam = $false
        foreach ($p in $json.invalidParams) {
            if ($p.name -eq "status") {
                $hasReviewParam = $true
                Write-Host "  Observed invalidParam: $($p.name) -> $($p.reason)" -ForegroundColor Gray
            }
        }
        Assert-Test "invalidParams explicitly targets 'status' in review" $hasReviewParam
    }
    Assert-Test "Backend rejected invalid review status" $rejectedReview

    # --------------------------------------------------------------------------
    # Test 7: Staff Self-Cancel Pending Leave
    # --------------------------------------------------------------------------
    Write-Host "`n[Test 7] Testing staff self-cancellation of pending leave..." -ForegroundColor Yellow
    $cancelRes = Invoke-RestMethod -Uri "$apiBase/leaves/$leaveId/cancel" -Method Patch -Headers $doctorAuth.headers -Body "{}" -ContentType 'application/json'
    $cancelledLeave = Get-ResponseData $cancelRes
    Assert-Test "Leave status updated to cancelled" ($cancelledLeave.status -eq "cancelled")
    Assert-Test "cancelledAt timestamp is set" ($null -ne $cancelledLeave.cancelledAt)

    Write-Host "`n==============================================================================" -ForegroundColor Green
    Write-Host " ALL LEAVE ZOD VALIDATION CONTRACT TESTS PASSED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
    exit 0

} catch {
    Write-Host "`n[FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
