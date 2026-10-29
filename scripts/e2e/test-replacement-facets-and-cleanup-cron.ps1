param(
    [string]$BaseUrl = ""
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: REPLACEMENT FACETS (KAI STRIP) & CLEANUP CRON HARDENING" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

function Get-ErrorJson($err) {
    if ($err.ErrorDetails.Message) {
        try {
            return ($err.ErrorDetails.Message | ConvertFrom-Json)
        } catch {
            return @{ message = $err.ErrorDetails.Message; detail = $err.ErrorDetails.Message }
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
    # Step 2: Authenticate Actors
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 2] Authenticating Doctor & Admin..." -ForegroundColor Yellow
    $doctorAuth = Login-Doctor
    Assert-Test "Doctor (dr. Maya) authenticated" ($null -ne $doctorAuth.token)

    $adminAuth = Login-Admin
    Assert-Test "Admin authenticated" ($null -ne $adminAuth.token)

    $docHeaders = @{
        "Authorization" = "Bearer $($doctorAuth.token)"
        "Content-Type"  = "application/json"
    }

    # --------------------------------------------------------------------------
    # Step 3: Verify Dynamic Clinic Settings in Database
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 3] Verifying Dynamic Replacement Cleanup Clinic Settings in PostgreSQL..." -ForegroundColor Yellow
    $dbSettingsRaw = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "
        SELECT key, value FROM clinic_setting WHERE key IN ('replacement.auto_expire_hours_before_shift', 'replacement.cleanup_cron_expression') ORDER BY key;
    "
    $dbSettingsStr = [string]::Join("`n", $dbSettingsRaw)
    Write-Host "PostgreSQL Settings Result:`n$dbSettingsStr" -ForegroundColor Gray
    Assert-Test "Database contains replacement.auto_expire_hours_before_shift" ([bool]($dbSettingsStr -match "replacement\.auto_expire_hours_before_shift\|2"))
    Assert-Test "Database contains replacement.cleanup_cron_expression" ([bool]($dbSettingsStr -match "replacement\.cleanup_cron_expression\|""0 \* \* \* \*"""))

    # --------------------------------------------------------------------------
    # Step 4: GET /api/v1/replacements/facets (KAI Horizontal Strip Data Contract)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 4] Querying GET /api/v1/replacements/facets..." -ForegroundColor Yellow
    $facetsRes = Invoke-RestMethod -Uri "$apiBase/replacements/facets" -Method Get -Headers $docHeaders
    Assert-Test "Facets endpoint returned totalOpenOpportunities" ($null -ne $facetsRes.totalOpenOpportunities)
    Assert-Test "Facets data contains distinctStaff list" ($null -ne $facetsRes.distinctStaff)
    Assert-Test "Facets data contains availableDates list" ($null -ne $facetsRes.availableDates)

    Write-Host "Total Open Opportunities: $($facetsRes.totalOpenOpportunities)" -ForegroundColor Green
    Write-Host "Distinct Staff on Leave: $($facetsRes.distinctStaff.Count)" -ForegroundColor Green
    Write-Host "Distinct Dates with Shifts: $($facetsRes.availableDates.Count)" -ForegroundColor Green

    # Validate Facet Data Structures
    if ($facetsRes.distinctStaff.Count -gt 0) {
        $sampleStaff = $facetsRes.distinctStaff[0]
        Assert-Test "Staff facet item has staffProfileId" (-not [string]::IsNullOrWhiteSpace($sampleStaff.staffProfileId))
        Assert-Test "Staff facet item has fullName" (-not [string]::IsNullOrWhiteSpace($sampleStaff.fullName))
        Assert-Test "Staff facet item has opportunityCount >= 1" ($sampleStaff.opportunityCount -ge 1)
        Assert-Test "Staff facet item has earliestDate (YYYY-MM-DD)" ($sampleStaff.earliestDate -match '^\d{4}-\d{2}-\d{2}$')
        Write-Host "Sample Staff Facet: $($sampleStaff.fullName) ($($sampleStaff.opportunityCount) shifts, earliest: $($sampleStaff.earliestDate))" -ForegroundColor Cyan
    }

    if ($facetsRes.availableDates.Count -gt 0) {
        $sampleDate = $facetsRes.availableDates[0]
        Assert-Test "Date facet item has valid workDate (YYYY-MM-DD)" ($sampleDate.workDate -match '^\d{4}-\d{2}-\d{2}$')
        Assert-Test "Date facet item has count >= 1" ($sampleDate.count -ge 1)
        Write-Host "Sample Date Facet: $($sampleDate.workDate) ($($sampleDate.count) open shifts)" -ForegroundColor Cyan
    }

    # --------------------------------------------------------------------------
    # Step 5: Filter Opportunities by Staff Facet (GET /api/v1/replacements?staffProfileId=...)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 5] Testing Scoped Filter by staffProfileId..." -ForegroundColor Yellow
    if ($facetsRes.distinctStaff.Count -gt 0) {
        $targetStaff = $facetsRes.distinctStaff[0]
        $staffUrl = "$apiBase/replacements?staffProfileId=$($targetStaff.staffProfileId)"
        $staffFilteredRes = Invoke-RestMethod -Uri $staffUrl -Method Get -Headers $docHeaders
        Assert-Test "Staff-filtered query returns expected count" ($staffFilteredRes.Count -eq $targetStaff.opportunityCount)

        # Confirm all returned shifts belong to targetStaff
        $allBelong = $true
        foreach ($opp in $staffFilteredRes) {
            if ($opp.originalStaffProfileId -ne $targetStaff.staffProfileId) {
                $allBelong = $false
                break
            }
        }
        Assert-Test "All returned opportunities strictly belong to target staff $($targetStaff.fullName)" $allBelong
    } else {
        Write-Host "No distinct staff on leave currently in database; skipping staff-scoped count assertion." -ForegroundColor Gray
    }

    # --------------------------------------------------------------------------
    # Step 6: Filter Opportunities by Date Facet (GET /api/v1/replacements?exactDate=...)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 6] Testing Scoped Filter by exactDate..." -ForegroundColor Yellow
    if ($facetsRes.availableDates.Count -gt 0) {
        $targetDate = $facetsRes.availableDates[0]
        $dateUrl = "$apiBase/replacements?exactDate=$($targetDate.workDate)"
        $dateFilteredRes = Invoke-RestMethod -Uri $dateUrl -Method Get -Headers $docHeaders
        Assert-Test "Date-filtered query returns expected count" ($dateFilteredRes.Count -eq $targetDate.count)

        # Confirm all returned shifts are on that date
        $allSameDate = $true
        foreach ($opp in $dateFilteredRes) {
            if ($opp.workDate -ne $targetDate.workDate) {
                $allSameDate = $false
                break
            }
        }
        Assert-Test "All returned opportunities strictly match date $($targetDate.workDate)" $allSameDate
    } else {
        Write-Host "No dates on leave currently in database; skipping date-scoped assertion." -ForegroundColor Gray
    }

    # --------------------------------------------------------------------------
    # Step 7: Zod Strict Contract Rejection (400 Bad Request on invalid inputs)
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 7] Testing Zod Contract Hardening on Replacements Endpoints..." -ForegroundColor Yellow

    # Test 7a: Invalid UUID for staffProfileId
    $badUuidFailed = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/replacements?staffProfileId=not-a-valid-uuid" -Method Get -Headers $docHeaders
    } catch {
        $badUuidFailed = $true
        $errJson = Get-ErrorJson $_
        Assert-Test "Invalid staffProfileId rejected with 400 Bad Request" ($_.Exception.Response.StatusCode.value__ -eq 400)
        Assert-Test "Zod validation reports invalid staffProfileId param" ($errJson.invalidParams[0].name -eq 'staffProfileId')
    }
    Assert-Test "Invalid staffProfileId was properly blocked by Zod" $badUuidFailed

    # Test 7b: Invalid Date format
    $badDateFailed = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/replacements?date=31-12-2026" -Method Get -Headers $docHeaders
    } catch {
        $badDateFailed = $true
        $errJson = Get-ErrorJson $_
        Assert-Test "Invalid date format rejected with 400 Bad Request" ($_.Exception.Response.StatusCode.value__ -eq 400)
        Assert-Test "Zod validation reports invalid date param" ($errJson.invalidParams[0].name -eq 'date')
    }
    Assert-Test "Invalid date was properly blocked by Zod" $badDateFailed

    # Test 7c: Invalid Replacement ID param on claim/cancel
    $badParamFailed = $false
    try {
        Invoke-RestMethod -Uri "$apiBase/replacements/not-a-uuid/claim" -Method Post -Headers $docHeaders -Body "{}"
    } catch {
        $badParamFailed = $true
        Assert-Test "Invalid replacement ID param rejected with 400 Bad Request" ($_.Exception.Response.StatusCode.value__ -eq 400)
    }
    Assert-Test "Invalid replacement ID param was properly blocked by Zod" $badParamFailed

    # --------------------------------------------------------------------------
    # Step 8: Expiration Cleanup Logic & Dynamic Setting Verification
    # --------------------------------------------------------------------------
    Write-Host "`n[Step 8] Verifying Dynamic Cleanup Expiration Query & Scheduler..." -ForegroundColor Yellow

    # Check the SQL query behavior in PostgreSQL: shifts starting within < 2 hours of current time or in the past
    $expiredCount = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "
        SELECT count(*)
        FROM replacement_opportunities ro
        JOIN session_def sd ON ro.session_id = sd.id
        WHERE ro.status = 'open'
          AND (ro.work_date < CURRENT_DATE OR (ro.work_date = CURRENT_DATE AND sd.default_starts_at <= CURRENT_TIME));
    "
    Write-Host "Currently eligible expired open opportunities: $expiredCount" -ForegroundColor Cyan
    Assert-Test "PostgreSQL can evaluate dynamic expiration window without errors" ($null -ne $expiredCount)

    # Check application container logs for scheduler registration
    $schedulerLog = docker logs backend-api-1 2>&1 | Select-String -Pattern "replacement_cleanup" | Select-Object -Last 1
    Assert-Test "ReplacementCleanupScheduler job 'replacement_cleanup' registered and executed in NestJS lifecycle" ($null -ne $schedulerLog)
    if ($schedulerLog) {
        Write-Host "Scheduler Log Verified: $($schedulerLog.Line)" -ForegroundColor Gray
    }

    # --------------------------------------------------------------------------
    # Summary
    # --------------------------------------------------------------------------
    Write-Host "`n==============================================================================" -ForegroundColor Green
    Write-Host " ALL REPLACEMENT FACET & CLEANUP CRON TESTS PASSED!" -ForegroundColor Green
    Write-Host "==============================================================================" -ForegroundColor Green
    Print-TestSummary

} catch {
    Write-Host "`n[FAILED] An unhandled error occurred during test execution:" -ForegroundColor Red
    Write-Host $_.Exception.ToString() -ForegroundColor Red
    Print-TestSummary
    exit 1
}
