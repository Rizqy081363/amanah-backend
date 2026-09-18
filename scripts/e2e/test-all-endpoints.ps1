# ==============================================================================
# AMANAH HEALTHCARE BACKEND - COMPREHENSIVE ALL-ENDPOINTS VERIFICATION SUITE
# ==============================================================================

param(
    [string]$BaseUrl = $env:E2E_BASE_URL
)

. "$PSScriptRoot\common.ps1"

$ErrorActionPreference = 'Stop'
$baseUrl = if ([string]::IsNullOrWhiteSpace($BaseUrl)) { Get-E2EBaseUrl } else { $BaseUrl.TrimEnd('/') }
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

Write-Host "Waiting for API readiness at $baseUrl ..." -ForegroundColor Cyan
Wait-E2EApiReady -url $baseUrl

Write-Host "=== 1. System Info & Health Endpoints ===" -ForegroundColor Cyan
$homeInfo = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
Assert-Test "GET / -> returns server info" ($homeInfo.name -eq "Amanah Healthcare Backend")

$healthLive = Invoke-RestMethod -Uri "$baseUrl/health/live" -Method Get
Assert-Test "GET /health/live -> returns status up" ($healthLive.status -eq "up")

$healthReady = Invoke-RestMethod -Uri "$baseUrl/health/ready" -Method Get
Assert-Test "GET /health/ready -> returns system ready" ($healthReady.status -eq "up")

Write-Host "`n=== 2. Authentication Lifecycle ===" -ForegroundColor Cyan
# 2.1 Admin Login
$adminLogin = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = "admin@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$adminToken = $adminLogin.token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
Assert-Test "POST /api/v1/auth/email/login (Admin) -> returns token" ($null -ne $adminToken -and $adminToken.Length -gt 20)

# 2.2 Doctor Login
$docLogin = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = "dokter@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$docToken = $docLogin.token
$docHeaders = @{ "Authorization" = "Bearer $docToken" }
Assert-Test "POST /api/v1/auth/email/login (Doctor) -> returns token" ($null -ne $docToken -and $docToken.Length -gt 20)

# 2.3 Patient Login
$patLogin = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = "pasien@amanah.com"; password = "secret123" } | ConvertTo-Json) -ContentType "application/json"
$patToken = $patLogin.token
$patHeaders = @{ "Authorization" = "Bearer $patToken" }
Assert-Test "POST /api/v1/auth/email/login (Patient) -> returns token" ($null -ne $patToken -and $patToken.Length -gt 20)

# 2.4 Profile Me
$meDoc = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/auth/me -> returns doctor profile" ($meDoc.email -eq "dokter@amanah.com" -and $meDoc.staffProfiles[0].staffCode -eq "DOC-AMANAH-001")

# 2.5 Refresh Token
$refreshRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/refresh" -Method Post -Headers (@{ "Authorization" = "Bearer $($docLogin.refreshToken)" })
Assert-Test "POST /api/v1/auth/refresh -> returns new access token" ($null -ne $refreshRes.token)

Write-Host "`n=== 3. Clinics & Analytics Endpoints ===" -ForegroundColor Cyan
# 3.1 List Clinics
$clinics = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics" -Method Get
Assert-Test "GET /api/v1/clinics -> returns clinics list" ($clinics.Count -gt 0)
$clinicId = $clinics[0].id

# 3.2 Get Clinic Detail
$clinicDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/$clinicId" -Method Get
Assert-Test "GET /api/v1/clinics/:id -> returns clinic detail" ($clinicDetail.id -eq $clinicId)

# 3.3 Get Clinic Services (Layanan)
$clinicServices = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/$clinicId/layanan" -Method Get
Assert-Test "GET /api/v1/clinics/:id/layanan -> returns services list" ($clinicServices.Count -gt 0)

# 3.4 Summary Analytics
$summary = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/analytics/summary" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/clinics/analytics/summary -> returns totalClinics" ($summary.totalClinics -gt 0)
Assert-Test "GET /api/v1/clinics/analytics/summary -> returns todayAppointments" ($summary.todayAppointments -ge 0)

# 3.5 Monthly Analytics
$monthly = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/analytics/monthly?year=2026" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/clinics/analytics/monthly -> returns monthly buckets" ($monthly.Count -gt 0)

Write-Host "`n=== 4. Patients Endpoints ===" -ForegroundColor Cyan
# 4.1 List Patients
$patients = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/patients -> returns registered patients" ($patients.Count -gt 0)
$patientId = $patients[0].id

# 4.2 Get Patient by ID
$patientDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/$patientId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/patients/:id -> returns patient record" ($patientDetail.id -eq $patientId)

# 4.3 Get Patient Me (Patient portal)
$patientMe = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/me" -Method Get -Headers $patHeaders
Assert-Test "GET /api/v1/patients/me -> returns patient profile" ($null -ne $patientMe.id)

Write-Host "`n=== 5. Staffs & Practitioners Endpoints ===" -ForegroundColor Cyan
# 5.1 List Staffs
$staffs = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs" -Method Get -Headers $adminHeaders
Assert-Test "GET /api/v1/staffs -> returns staff records" ($staffs.Count -gt 0)
$staffId = $staffs[0].id

# 5.2 Get Staff Detail
$staffDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs/$staffId" -Method Get -Headers $adminHeaders
Assert-Test "GET /api/v1/staffs/:id -> returns staff profile" ($staffDetail.id -eq $staffId)

# 5.3 Filter Staff by Profession (Doctors)
$doctors = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs/profession/dokter" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/staffs/profession/:profession -> returns doctors" ($doctors.Count -gt 0)

# 5.4 Staff Credentials
$credentials = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs/$staffId/credentials" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/staffs/:id/credentials -> returns credentials" ($credentials -is [System.Array])

Write-Host "`n=== 6. Schedules Endpoints ===" -ForegroundColor Cyan
# 6.1 List Schedules
$schedules = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/schedules -> returns practice sessions" ($schedules.Count -gt 0)
$scheduleId = $schedules[0].id

# 6.2 Doctor's Own Schedules
$mySchedules = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/my-schedules" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/schedules/my-schedules -> returns sessions for doctor" ($mySchedules.Count -gt 0)

# 6.3 Clinic Schedules by Poliklinik ID
$poliSchedules = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/poli/$clinicId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/schedules/poli/:poliklinikId -> returns schedules for clinic" ($poliSchedules.Count -ge 0)

# 6.4 Single Session Detail
$sessionDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules/$scheduleId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/schedules/:id -> returns schedule details" ($sessionDetail.id -eq $scheduleId)

Write-Host "`n=== 7. Appointments & Queue Monitor Endpoints ===" -ForegroundColor Cyan
# 7.1 Public Queue Display
$queueDisplay = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/queue/display" -Method Get
Assert-Test "GET /api/v1/appointments/queue/display -> returns live display" ($null -ne $queueDisplay.statistics)

# 7.2 Daily Clinic Queue
$dailyQueue = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/queue/daily?poliklinikId=$clinicId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/appointments/queue/daily -> returns clinic queue" ($null -ne $dailyQueue)

# 7.3 List Appointments
$apts = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Get -Headers $docHeaders
$aptList = if ($null -ne $apts.data) { $apts.data } else { $apts }
Assert-Test "GET /api/v1/appointments -> returns appointments list" ($aptList.Count -gt 0)
$aptId = $aptList[0].id

# 7.4 Get Single Appointment
$aptDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$aptId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/appointments/:id -> returns appointment details" ($aptDetail.id -eq $aptId)

Write-Host "`n=== 8. Medical Records Endpoints ===" -ForegroundColor Cyan
# 8.1 List Medical Records
$mrList = Invoke-RestMethod -Uri "$baseUrl/api/v1/medical-records" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/medical-records -> returns clinical records" ($mrList.data.Count -gt 0)
$mrId = $mrList.data[0].id

# 8.2 Get Single Medical Record
$mrDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/medical-records/$mrId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/medical-records/:id -> returns medical record details" ($mrDetail.id -eq $mrId)

# 8.3 Get Patient Medical Records
$patientMR = Invoke-RestMethod -Uri "$baseUrl/api/v1/medical-records/patient/$patientId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/medical-records/patient/:patientId -> returns records for patient" ($null -ne $patientMR)

Write-Host "`n=== 9. Staff Attendance Endpoints ===" -ForegroundColor Cyan
# 9.1 My Attendance History
$attHistory = Invoke-RestMethod -Uri "$baseUrl/api/v1/attendance/my-history" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/attendance/my-history -> returns attendance history" ($attHistory.Count -gt 0)

# 9.2 Daily Attendance Recap
$dailyAtt = Invoke-RestMethod -Uri "$baseUrl/api/v1/attendance/daily" -Method Get -Headers $adminHeaders
Assert-Test "GET /api/v1/attendance/daily -> returns daily staff attendance" ($null -ne $dailyAtt)

Write-Host "`n=== 10. Staff Leaves Endpoints ===" -ForegroundColor Cyan
# 10.1 My Leaves History
$myLeaves = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves/my-leaves" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/leaves/my-leaves -> returns staff leave history" ($myLeaves.Count -gt 0)

# 10.2 Pending Leaves for Admin
$pendingLeaves = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves/pending" -Method Get -Headers $adminHeaders
Assert-Test "GET /api/v1/leaves/pending -> returns pending leave applications" ($pendingLeaves.Count -gt 0)

# 10.3 Request Leave & Cancel Lifecycle
$newLeave = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves" -Method Post -Body (@{
    startDate = "2026-12-01"
    endDate = "2026-12-02"
    reason = "Izin riset dan studi banding klinik terakreditasi"
    type = "seminar_symposium"
} | ConvertTo-Json) -ContentType "application/json" -Headers $docHeaders
Assert-Test "POST /api/v1/leaves -> creates leave request" ($newLeave.status -eq "MENUNGGU_KONFIRMASI")

$cancelLeave = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves/$($newLeave.id)/cancel" -Method Patch -Headers $docHeaders
Assert-Test "PATCH /api/v1/leaves/:id/cancel -> cancels leave request" ($cancelLeave.status -eq "DIBATALKAN")

Write-Host "`n=== 11. Notifications Endpoints ===" -ForegroundColor Cyan
# 11.1 Fetch Notifications
$notifs = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/notifications/me -> returns seeded notifications" ($notifs.data.Count -gt 0)

# 11.2 Read Single Notification
if ($notifs.data.Count -gt 0) {
    $firstNotifId = $notifs.data[0].id
    $readOne = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/$firstNotifId/read" -Method Patch -Headers $docHeaders
    Assert-Test "PATCH /api/v1/notifications/:id/read -> marks single notification as read" ($readOne.success -eq $true)
}

# 11.3 Read All Notifications
$readAll = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/read-all" -Method Patch -Headers $docHeaders
Assert-Test "PATCH /api/v1/notifications/read-all -> marks all as read" ($readAll.success -eq $true)

Write-Host "`n=== 12. Support Tickets Endpoints ===" -ForegroundColor Cyan
# 12.1 List My Tickets
$tickets = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/my-tickets" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/support-tickets/my-tickets -> returns tickets" ($tickets.Count -gt 0)
$ticketId = $tickets[0].id

# 12.2 Get Ticket Detail
$ticketDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/$ticketId" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/support-tickets/:id -> returns ticket detail" ($ticketDetail.id -eq $ticketId)

# 12.3 Get Ticket Messages Thread
$ticketMsgs = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/$ticketId/messages" -Method Get -Headers $docHeaders
Assert-Test "GET /api/v1/support-tickets/:id/messages -> returns conversation thread" ($ticketMsgs.Count -gt 0)

# 12.4 Post New Message to Ticket
$newMsg = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/$ticketId/messages" -Method Post -Body (@{
    message = "Konfirmasi teknisi: kabel adaptor dan bluetooth bridge telah normal."
} | ConvertTo-Json) -ContentType "application/json" -Headers $docHeaders
Assert-Test "POST /api/v1/support-tickets/:id/messages -> posts new chat reply" ($null -ne $newMsg.id)

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "All Endpoints Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
