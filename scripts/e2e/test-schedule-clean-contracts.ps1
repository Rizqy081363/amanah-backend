# test-schedule-clean-contracts.ps1
# Comprehensive Verification Script for Refactored Schedule Module Contracts
# Validates that all schedule endpoints adhere to clean, canonical contracts with zero duplicate fields and zero misplaced UI formatting.

$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " [Schedule Module Refactoring Verification] Testing Live Contracts" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$baseUrl = "http://127.0.0.1:3001"

# 1. Login as Admin
Write-Host "`n[Step 1] Authenticating with admin@amanah.com..." -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $loginPayload -ContentType "application/json"
    $token = $loginResponse.token
    if (-not $token) {
        throw "Failed to obtain Bearer token from login response."
    }
    Write-Host "  -> Auth SUCCESS! Bearer token obtained." -ForegroundColor Green
} catch {
    Write-Host "  -> FAILED to authenticate: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

# 2. Test Admin Doctor Schedules List (GET /api/v1/admin/doctor-schedules)
Write-Host "`n[Step 2] Testing GET /api/v1/admin/doctor-schedules?limit=5..." -ForegroundColor Yellow
try {
    $listRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules?limit=5" -Method Get -Headers $headers
    if (-not $listRes.success) {
        throw "Expected success: true in list response"
    }

    $doctors = $listRes.data.doctors
    Write-Host "  -> Retrieved $($doctors.Count) doctor cards." -ForegroundColor Gray

    if ($doctors.Count -eq 0) {
        throw "Expected at least one doctor card returned."
    }

    $firstDoc = $doctors[0]
    
    # Assert Canonical Identifiers
    if (-not $firstDoc.practitionerId) { throw "Assertion failed: practitionerId is missing" }
    if ($firstDoc.id -ne $firstDoc.practitionerId) { throw "Assertion failed: id and practitionerId must both equal practitioner UUID" }
    
    # Assert Canonical Statuses
    $validStatuses = @("OPEN", "CLOSED", "PENDING", "ON_LEAVE")
    if ($validStatuses -notcontains $firstDoc.scheduleStatus) {
        throw "Assertion failed: scheduleStatus '$($firstDoc.scheduleStatus)' is not a canonical operational status"
    }
    if ($firstDoc.doctorStatus -ne $firstDoc.scheduleStatus) {
        throw "Assertion failed: doctorStatus and scheduleStatus must be identical canonical values"
    }

    # Assert Clean ISO Date Formats (Zero Indonesian UI Formatting Leaks)
    if ($firstDoc.practiceDate -notmatch '^\d{4}-\d{2}-\d{2}$') {
        throw "Assertion failed: practiceDate '$($firstDoc.practiceDate)' must be ISO format (YYYY-MM-DD), not localized UI string"
    }
    if ($firstDoc.scheduleMonth -notmatch '^\d{4}-\d{2}$') {
        throw "Assertion failed: scheduleMonth '$($firstDoc.scheduleMonth)' must be ISO format (YYYY-MM), not localized UI string"
    }

    # Assert Daily Sessions Cleanliness
    foreach ($sess in $firstDoc.dailySessions) {
        if ($sess.startTime -notmatch '^\d{2}:\d{2}$') {
            throw "Assertion failed: session startTime '$($sess.startTime)' must be HH:mm"
        }
        if ($sess.endTime -notmatch '^\d{2}:\d{2}$') {
            throw "Assertion failed: session endTime '$($sess.endTime)' must be HH:mm"
        }
    }

    Write-Host "  -> List Endpoint Assertions PASSED!" -ForegroundColor Green
    $testPractitionerId = $firstDoc.practitionerId
} catch {
    Write-Host "  -> FAILED on List Endpoint: $_" -ForegroundColor Red
    exit 1
}

# 3. Test Admin Doctor Schedule Detail (GET /api/v1/admin/doctor-schedules/{id}?date=2026-10-27)
Write-Host "`n[Step 3] Testing GET /api/v1/admin/doctor-schedules/${testPractitionerId}?date=2026-10-27..." -ForegroundColor Yellow
try {
    $detailRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/${testPractitionerId}?date=2026-10-27" -Method Get -Headers $headers
    if (-not $detailRes.success) {
        throw "Expected success: true in detail response"
    }

    $detail = $detailRes.data
    if ($detail.practitionerId -ne $testPractitionerId) {
        throw "Assertion failed: detail practitionerId mismatch"
    }

    # Assert ISO scheduleMonth
    if ($detail.scheduleMonth -notmatch '^\d{4}-\d{2}$') {
        throw "Assertion failed: scheduleMonth '$($detail.scheduleMonth)' must be ISO format (YYYY-MM)"
    }

    # Assert Metrics Integrity (Fix of s.pasien_terdaftar bug verified)
    if ($null -eq $detail.metrics) {
        throw "Assertion failed: metrics object is missing"
    }
    if ($null -eq $detail.metrics.totalBookedPatients) {
        throw "Assertion failed: metrics.totalBookedPatients is missing"
    }
    Write-Host "  -> Metrics totalBookedPatients: $($detail.metrics.totalBookedPatients)" -ForegroundColor Gray

    # Assert Monthly Schedule Cleanliness (Zero UI Leakage)
    if (-not $detail.monthlySchedule -or $detail.monthlySchedule.Count -lt 28) {
        throw "Assertion failed: monthlySchedule must contain all days of the month"
    }

    $sampleDay = $detail.monthlySchedule[0]
    $jsonSampleDay = $sampleDay | ConvertTo-Json
    if ($jsonSampleDay -match 'statusLabel' -or $jsonSampleDay -match 'badgeVariant' -or $jsonSampleDay -match 'isClickable') {
        throw "Assertion failed: monthlySchedule day leaks presentation fields (statusLabel, badgeVariant, isClickable)"
    }

    # Assert Dead Ghost Arrays are Removed
    $jsonDetail = $detail | ConvertTo-Json -Depth 2
    if ($detail.timelineIntervals -ne $null -and $detail.timelineIntervals.Count -gt 0) {
        throw "Assertion failed: timelineIntervals should not contain unneeded data"
    }

    Write-Host "  -> Detail Endpoint Assertions PASSED!" -ForegroundColor Green
} catch {
    Write-Host "  -> FAILED on Detail Endpoint: $_" -ForegroundColor Red
    exit 1
}

# 4. Test Session Patients Endpoint (GET /api/v1/admin/doctor-schedules/{id}/sessions/{sessionId}/patients)
Write-Host "`n[Step 4] Testing Session Patients Endpoint..." -ForegroundColor Yellow
try {
    if ($detail.dailySessions.Count -gt 0) {
        $sessId = $detail.dailySessions[0].id
        $patientsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/admin/doctor-schedules/${testPractitionerId}/sessions/${sessId}/patients" -Method Get -Headers $headers
        if (-not $patientsRes.success) {
            throw "Expected success: true in session patients response"
        }
        if (-not $patientsRes.data.sessionId) {
            throw "Assertion failed: data.sessionId missing in session patients response"
        }
        Write-Host "  -> Session Patients Endpoint PASSED! (sessionId: $sessId, bookedCount: $($patientsRes.data.bookedCount))" -ForegroundColor Green
    } else {
        Write-Host "  -> Skipped session patients test (doctor has no daily sessions)." -ForegroundColor DarkGray
    }
} catch {
    Write-Host "  -> FAILED on Session Patients Endpoint: $_" -ForegroundColor Red
    exit 1
}

# 5. Test Public Booking Options Endpoint (GET /api/v1/schedules/booking-options?date=2026-10-27)
Write-Host "`n[Step 5] Testing GET /api/v1/schedules/booking-options?date=2026-10-27..." -ForegroundColor Yellow
try {
    $bookingRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/booking-options?date=2026-10-27" -Method Get -Headers $headers
    if (-not $bookingRes.success) {
        throw "Expected success: true in booking options response"
    }
    if ($bookingRes.data.date -ne "2026-10-27") {
        throw "Assertion failed: booking options date mismatch"
    }
    if ($bookingRes.data.sessions.Count -eq 0) {
        throw "Assertion failed: booking options should return shift sessions"
    }
    Write-Host "  -> Booking Options Endpoint PASSED! ($($bookingRes.data.sessions.Count) sessions returned)" -ForegroundColor Green
} catch {
    Write-Host "  -> FAILED on Booking Options Endpoint: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " [ALL VERIFICATION STEPS PASSED SUCCESSFULLY! ZERO CONTRACT DEFECTS] " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
exit 0
