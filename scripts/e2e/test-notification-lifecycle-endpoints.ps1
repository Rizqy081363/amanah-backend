# ==============================================================================
# AMANAH HEALTHCARE - NOTIFICATION & APPOINTMENT LIFECYCLE E2E TEST SUITE
# Hardening, Security, Authorization, and Full Lifecycle Functional Verification
# ==============================================================================

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
$baseUrl = Get-E2EBaseUrl
$passed = 0
$failed = 0

function Assert-Test([string]$name, [bool]$condition, [string]$details = "") {
    if ($condition) {
        Write-Host " [PASS] $name" -ForegroundColor Green
        $global:passed++
    } else {
        Write-Host " [FAIL] $name - $details" -ForegroundColor Red
        $global:failed++
    }
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " Amanah Healthcare: E2E Notification & Appointment Lifecycle Verification" -ForegroundColor Cyan
Write-Host " Target API: $baseUrl" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# Ensure API is ready
Wait-E2EApiReady $baseUrl 60
Write-Host "API is healthy and ready.`n" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 1. AUTHENTICATION & ROLE ACQUISITION
# ------------------------------------------------------------------------------
Write-Host "=== 1. Authentication & Role Acquisition ===" -ForegroundColor Cyan

# 1.1 Admin
$adminAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$adminToken = $adminAuth.token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
Assert-Test "Admin Login (admin@amanah.com)" ($null -ne $adminToken -and $adminToken.Length -gt 20)

# 1.2 Staff / Doctor
$doctorAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$doctorToken = $doctorAuth.token
$doctorHeaders = @{ "Authorization" = "Bearer $doctorToken" }
Assert-Test "Doctor Login (dokter@amanah.com)" ($null -ne $doctorToken -and $doctorToken.Length -gt 20)

# 1.3 Patient
$patientAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{
    email = "patient.0004@amanah-healthcare.test"
    password = "secret123"
} | ConvertTo-Json) -ContentType "application/json"
$patientToken = $patientAuth.token
$patientHeaders = @{ "Authorization" = "Bearer $patientToken" }
Assert-Test "Patient Login (patient.0004@amanah-healthcare.test)" ($null -ne $patientToken -and $patientToken.Length -gt 20)

# ------------------------------------------------------------------------------
# 2. SECURITY HARDENING & AUTHORIZATION NEGATIVE TESTS
# ------------------------------------------------------------------------------
Write-Host "`n=== 2. Security Hardening & Authorization Controls ===" -ForegroundColor Cyan

# 2.1 Missing Token -> 401 Unauthorized
$unauthNotifications = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me" -Method Get
} catch {
    $unauthNotifications = $_.Exception.Response.StatusCode.value__ -eq 401
}
Assert-Test "Security: Anonymous request to /notifications/me returns 401" $unauthNotifications

$unauthHistory = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/me" -Method Get
} catch {
    $unauthHistory = $_.Exception.Response.StatusCode.value__ -eq 401
}
Assert-Test "Security: Anonymous request to /appointments/history/me returns 401" $unauthHistory

$unauthCall = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/00000000-0000-0000-0000-000000000001/call" -Method Post
} catch {
    $unauthCall = $_.Exception.Response.StatusCode.value__ -eq 401
}
Assert-Test "Security: Anonymous request to /appointments/:id/call returns 401" $unauthCall

# 2.2 Patient Forbidden on Staff/Doctor Call Operations -> 403 Forbidden
$patientForbiddenCall = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/00000000-0000-0000-0000-000000000001/call" -Method Post -Headers $patientHeaders
} catch {
    $patientForbiddenCall = $_.Exception.Response.StatusCode.value__ -eq 403
}
Assert-Test "Security: Patient role calling /appointments/:id/call returns 403 Forbidden" $patientForbiddenCall

$patientForbiddenNoShow = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/00000000-0000-0000-0000-000000000001/no-show" -Method Post -Headers $patientHeaders
} catch {
    $patientForbiddenNoShow = $_.Exception.Response.StatusCode.value__ -eq 403
}
Assert-Test "Security: Patient role calling /appointments/:id/no-show returns 403 Forbidden" $patientForbiddenNoShow

$patientForbiddenCrossHistory = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/patient/00000000-0000-0000-0000-000000000001" -Method Get -Headers $patientHeaders
} catch {
    $patientForbiddenCrossHistory = $_.Exception.Response.StatusCode.value__ -eq 403
}
Assert-Test "Security: Patient querying another patient's history endpoint returns 403 Forbidden" $patientForbiddenCrossHistory

# 2.3 Input Validation Hardening -> 400 Bad Request on invalid UUIDs
$invalidUuidCall = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/invalid-uuid-string/call" -Method Post -Headers $doctorHeaders
} catch {
    $invalidUuidCall = $_.Exception.Response.StatusCode.value__ -eq 400
}
Assert-Test "Validation: Non-UUID appointment id on /call rejected with 400 Bad Request" $invalidUuidCall

$invalidUuidNotifRead = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/invalid-uuid-string/read" -Method Patch -Headers $patientHeaders
} catch {
    $invalidUuidNotifRead = $_.Exception.Response.StatusCode.value__ -eq 400
}
Assert-Test "Validation: Non-UUID notification id on /read rejected with 400 Bad Request" $invalidUuidNotifRead

# ------------------------------------------------------------------------------
# 3. APPOINTMENT CALL RETRY & NO-SHOW LIFECYCLE (US-004 & RETRY POLICY)
# ------------------------------------------------------------------------------
Write-Host "`n=== 3. Appointment Call Retry & No-Show Lifecycle ===" -ForegroundColor Cyan

# 3.1 Setup fresh appointment for patient
# Find available clinic and service
$clinics = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics" -Method Get -Headers $doctorHeaders
$poliklinikId = $clinics[0].id
$layananList = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/$poliklinikId/layanan" -Method Get -Headers $doctorHeaders
$layananId = $layananList[0].id

# Resolve Patient Profile ID
$patientMe = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/me" -Method Get -Headers $patientHeaders
$patientProfileId = $patientMe.id

$createAptBody = @{
    poliklinikId = $poliklinikId
    layananId = $layananId
    complaint = "E2E Lifecycle Call & Retry Test"
    appointmentDate = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
    session = "PAGI"
} | ConvertTo-Json

$createdApt = $null
try {
    $createdApt = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Post -Body $createAptBody -ContentType "application/json" -Headers $patientHeaders
} catch {
    # If appointment cannot be created due to slot clash, find an existing waiting appointment
    $allApts = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments?limit=10" -Method Get -Headers $doctorHeaders
    $createdApt = $allApts.data | Where-Object { $_.status -in @('booked', 'waiting', 'SUDAH_BUAT_JANJI', 'MENUNGGU') } | Select-Object -First 1
}

$aptId = $createdApt.id
Assert-Test "Target appointment acquired for lifecycle testing ($aptId)" ($null -ne $aptId)

# 3.2 Attempt 1: Call Patient
$call1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan ke-1 melalui E2E" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Call Attempt 1: Returns attemptNumber = 1" ($call1.attemptNumber -eq 1)
Assert-Test "Call Attempt 1: Returns maxAttempts = 3" ($call1.maxAttempts -eq 3)
Assert-Test "Call Attempt 1: Returns status = called" ($call1.status -eq "called")

# Verify call attempts query
$attemptsAfter1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call-attempts" -Method Get -Headers $doctorHeaders
Assert-Test "Query call-attempts has 1 attempt record" ($attemptsAfter1.Count -ge 1)

# 3.3 Attempt 1 Unanswered -> Mark No-Show (triggers Requeue)
$noShow1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Body (@{ notes = "Pasien tidak merespons panggilan 1" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Unanswered Attempt 1: Requeued = true" ($noShow1.requeued -eq $true)
Assert-Test "Unanswered Attempt 1: RemainingAttempts = 2" ($noShow1.remainingAttempts -eq 2)
Assert-Test "Unanswered Attempt 1: Status returns to waiting" ($noShow1.status -eq "waiting")

# 3.4 Attempt 2: Call Patient
$call2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan ke-2 setelah requeue" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Call Attempt 2: Returns attemptNumber = 2" ($call2.attemptNumber -eq 2)

# 3.5 Attempt 2 Unanswered -> Mark No-Show (triggers 2nd Requeue)
$noShow2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Body (@{ notes = "Pasien tidak merespons panggilan 2" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Unanswered Attempt 2: Requeued = true" ($noShow2.requeued -eq $true)
Assert-Test "Unanswered Attempt 2: RemainingAttempts = 1" ($noShow2.remainingAttempts -eq 1)

# 3.6 Attempt 3: Call Patient (Final attempt)
$call3 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Body (@{ notes = "Panggilan ke-3 batas akhir" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Call Attempt 3: Returns attemptNumber = 3" ($call3.attemptNumber -eq 3)

# 3.7 Attempt 3 Unanswered -> Terminal NO_SHOW
$noShow3 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/no-show" -Method Post -Body (@{ notes = "Pasien tidak hadir setelah 3x panggilan" } | ConvertTo-Json) -ContentType "application/json" -Headers $doctorHeaders
Assert-Test "Unanswered Attempt 3: Terminal noShow = true" ($noShow3.noShow -eq $true)
Assert-Test "Unanswered Attempt 3: Terminal status is 'no_show'" ($noShow3.status -eq "no_show")

# 3.8 Call after Terminal Status is Rejected (Guard Policy)
$rejectedCallAfterTerminal = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId/call" -Method Post -Headers $doctorHeaders
} catch {
    $rejectedCallAfterTerminal = $_.Exception.Response.StatusCode.value__ -eq 400
}
Assert-Test "Lifecycle Policy: Calling terminal no_show appointment rejected with 400 Bad Request" $rejectedCallAfterTerminal

# ------------------------------------------------------------------------------
# 4. PATIENT APPOINTMENT HISTORY API (US-001, US-002)
# ------------------------------------------------------------------------------
Write-Host "`n=== 4. Patient Appointment History API ===" -ForegroundColor Cyan

# 4.1 Patient queries own history
$historyMe = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/me" -Method Get -Headers $patientHeaders
Assert-Test "GET /appointments/history/me returns valid structure" ($null -ne $historyMe.data -and $null -ne $historyMe.total)
Assert-Test "History includes terminal appointments" ($historyMe.data.Count -gt 0)

# Verify terminal statuses in history
$validStatuses = @('completed', 'no_show', 'cancelled')
$allStatusesTerminal = $true
foreach ($item in $historyMe.data) {
    if ($item.status -notin $validStatuses) {
        $allStatusesTerminal = $false
        break
    }
}
Assert-Test "All returned history records have terminal status (completed, no_show, cancelled)" $allStatusesTerminal

# Verify our 3-attempt no_show appointment is present with callAttemptsCount = 3
$testedAptInHistory = $historyMe.data | Where-Object { $_.id -eq $aptId }
Assert-Test "Newly terminal no_show appointment ($aptId) present in history" ($null -ne $testedAptInHistory)
if ($testedAptInHistory) {
    Assert-Test "History record includes callAttemptsCount = 3" ($testedAptInHistory.callAttemptsCount -eq 3)
    Assert-Test "History record includes estimatedDurationMinutes = 30 (SSOT DB)" ($testedAptInHistory.estimatedDurationMinutes -eq 30)
    Assert-Test "History record includes scheduledStartTime" ($null -ne $testedAptInHistory.scheduledStartTime)
    Assert-Test "History record includes scheduledEndTime" ($null -ne $testedAptInHistory.scheduledEndTime)
}

# 4.2 Status filtering on history
$noShowFilter = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/me?status=no_show" -Method Get -Headers $patientHeaders
$allFilteredNoShow = $true
foreach ($item in $noShowFilter.data) {
    if ($item.status -ne 'no_show') { $allFilteredNoShow = $false; break }
}
Assert-Test "Status filter '?status=no_show' returns only no_show records" ($allFilteredNoShow -and $noShowFilter.data.Count -gt 0)

# 4.3 Doctor / Admin queries patient history by ID (US-002 Consistency)
$doctorViewOfHistory = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/history/patient/$patientProfileId" -Method Get -Headers $doctorHeaders
Assert-Test "Doctor GET /appointments/history/patient/:patientId returns identical count as patient" ($doctorViewOfHistory.total -eq $historyMe.total)

# 4.4 Doctor Daily Queue timing verification (SSOT Matriks Spesifikasi)
$dailyQueue = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/queue/daily?poliklinikId=$poliklinikId&date=$((Get-Date).AddDays(2).ToString('yyyy-MM-dd'))" -Method Get -Headers $doctorHeaders
if ($dailyQueue.Count -gt 0) {
    Assert-Test "Doctor daily queue exposes estimatedDurationMinutes = 30" ($dailyQueue[0].estimatedDurationMinutes -eq 30)
    Assert-Test "Doctor daily queue exposes scheduledStartTime" ($null -ne $dailyQueue[0].scheduledStartTime)
    Assert-Test "Doctor daily queue exposes scheduledEndTime" ($null -ne $dailyQueue[0].scheduledEndTime)
}

# ------------------------------------------------------------------------------
# 5. NOTIFICATION INFRASTRUCTURE & SYNC ENDPOINTS
# ------------------------------------------------------------------------------
Write-Host "`n=== 5. Notification Infrastructure & Sync Endpoints ===" -ForegroundColor Cyan

# 5.1 Unread count for patient
$unreadCount = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/unread-count" -Method Get -Headers $patientHeaders
Assert-Test "GET /notifications/unread-count returns integer count" ($null -ne $unreadCount.unreadCount -and $unreadCount.unreadCount -ge 0)

# 5.2 List patient notifications
$patientNotifs = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $patientHeaders
Assert-Test "GET /notifications/me returns notifications array" ($null -ne $patientNotifs.data)

# 5.3 Mark single notification as read (if exists)
if ($patientNotifs.data.Count -gt 0) {
    $firstNotif = $patientNotifs.data[0]
    $markSingle = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/$($firstNotif.id)/read" -Method Patch -Headers $patientHeaders
    Assert-Test "PATCH /notifications/:id/read returns success = true" ($markSingle.success -eq $true)
}

# 5.4 Mark all notifications as read
$markAll = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/read-all" -Method Patch -Headers $patientHeaders
Assert-Test "PATCH /notifications/read-all returns success = true" ($markAll.success -eq $true)

# 5.5 Verify unread count is exactly 0
$unreadCountAfter = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/unread-count" -Method Get -Headers $patientHeaders
Assert-Test "Unread notifications count is verified 0 after read-all" ($unreadCountAfter.unreadCount -eq 0)

# ------------------------------------------------------------------------------
# SUMMARY & VERIFICATION
# ------------------------------------------------------------------------------
Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " Lifecycle & Notification Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
