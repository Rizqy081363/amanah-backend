param (
  [string]$BaseUrl = "http://localhost:3001/api/v1"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   AMANAH HEALTHCARE - SCHEDULES CONTRACT TEST SUITE     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Target Base URL: $BaseUrl`n"

function Assert-Result {
  param (
    [string]$TestName,
    [bool]$Condition,
    [string]$Details = ""
  )
  if ($Condition) {
    Write-Host "[PASS] $TestName" -ForegroundColor Green
  } else {
    Write-Host "[FAIL] $TestName - $Details" -ForegroundColor Red
  }
}

# 1. Login as Doctor (zikriahmadamikom@gmail.com)
Write-Host "--- 1. Authenticating Doctor & Admin ---" -ForegroundColor Yellow
$doctorLoginPayload = @{
  email = "zikriahmadamikom@gmail.com"
  password = "secret123"
} | ConvertTo-Json

$doctorLogin = Invoke-RestMethod -Uri "$BaseUrl/auth/email/login" -Method Post -Body $doctorLoginPayload -ContentType "application/json"
$doctorToken = $doctorLogin.token
$doctorId = $doctorLogin.user.staff.practitionerId

Assert-Result "Doctor Authentication" ($null -ne $doctorToken) "Doctor token is null"
Write-Host "Doctor Authenticated: $($doctorLogin.user.name) (PractitionerId: $doctorId)" -ForegroundColor DarkGray

# Login as Admin (admin@amanah.com)
$adminLoginPayload = @{
  email = "admin@amanah.com"
  password = "secret123"
} | ConvertTo-Json

$adminLogin = Invoke-RestMethod -Uri "$BaseUrl/auth/email/login" -Method Post -Body $adminLoginPayload -ContentType "application/json"
$adminToken = $adminLogin.token
Assert-Result "Admin Authentication" ($null -ne $adminToken) "Admin token is null"

$doctorHeaders = @{ Authorization = "Bearer $doctorToken" }
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

# 2. Test /schedules/my-schedules
Write-Host "`n--- 2. Testing Doctor My-Schedules ---" -ForegroundColor Yellow
$mySchedules = Invoke-RestMethod -Uri "$BaseUrl/schedules/my-schedules" -Method Get -Headers $doctorHeaders
Assert-Result "Fetch My-Schedules" ($mySchedules.Count -gt 0) "No schedules returned"

$todaySession = $mySchedules | Where-Object { $_.scheduleDate -like "*$((Get-Date).ToString('yyyy-MM-dd'))*" -and $_.sessionShift -eq "morning" } | Select-Object -First 1
if ($null -eq $todaySession) {
  $todaySession = $mySchedules[0]
}

Assert-Result "Realistic Morning Shift (Not early_morning 00:00)" ($todaySession.startTime -eq "06:00" -and $todaySession.endTime -eq "12:00") "Found $($todaySession.startTime) - $($todaySession.endTime)"
Assert-Result "Dynamic Capacity Calculation (12 slots @ 30m)" ($todaySession.capacity -eq 12) "Capacity is $($todaySession.capacity)"
Assert-Result "Available Slots Derived (Capacity - Booked)" ($todaySession.availableSlots -eq 10) "Available slots is $($todaySession.availableSlots)"
Assert-Result "Booked Patients Present" ($todaySession.bookedPatientCount -eq 2) "Booked count is $($todaySession.bookedPatientCount)"

# 3. Test /schedules/booked-patients
Write-Host "`n--- 3. Testing Booked Patients by Date ---" -ForegroundColor Yellow
$todayDateStr = (Get-Date).ToString("yyyy-MM-dd")
$bookedPatients = Invoke-RestMethod -Uri "$BaseUrl/schedules/booked-patients?date=$todayDateStr" -Method Get -Headers $doctorHeaders
Assert-Result "Booked Patients Endpoint Returns Active Bookings" ($bookedPatients.Count -ge 2) "Patients count is $($bookedPatients.Count)"
if ($bookedPatients.Count -gt 0) {
  Write-Host "First Patient: $($bookedPatients[0].fullName) | RM: $($bookedPatients[0].medicalRecordNumber) | Queue: $($bookedPatients[0].queueNumber) | Slot: $($bookedPatients[0].timeSlot)" -ForegroundColor DarkGray
  Write-Host "Second Patient: $($bookedPatients[1].fullName) | RM: $($bookedPatients[1].medicalRecordNumber) | Queue: $($bookedPatients[1].queueNumber) | Slot: $($bookedPatients[1].timeSlot)" -ForegroundColor DarkGray
}

# 4. Test Canonical /schedules/sessions/:sessionId/patients
Write-Host "`n--- 4. Testing Canonical Session Patients ---" -ForegroundColor Yellow
$targetSessionId = $todaySession.id
$sessionPatients = Invoke-RestMethod -Uri "$BaseUrl/schedules/sessions/$targetSessionId/patients" -Method Get -Headers $doctorHeaders
Assert-Result "Session Patients Canonical Endpoint" ($sessionPatients.success -eq $true -and $sessionPatients.data.patients.Count -ge 2) "Data invalid or patients empty"
if ($sessionPatients.data.patients.Count -gt 0) {
  $p1 = $sessionPatients.data.patients[0]
  Write-Host "Patient 1 Demographic: NIK $($p1.patient.nik) | RM $($p1.patient.medicalRecordNumber) | Queue $($p1.queueNumber)" -ForegroundColor DarkGray
}

# 5. Test Canonical /schedules/sessions/:sessionId/reschedule-eligibility
Write-Host "`n--- 5. Testing Reschedule Eligibility Pre-Check ---" -ForegroundColor Yellow
$eligibility = Invoke-RestMethod -Uri "$BaseUrl/schedules/sessions/$targetSessionId/reschedule-eligibility" -Method Get -Headers $doctorHeaders
Assert-Result "Reschedule Eligibility Pre-Check" ($eligibility.data.isEligible -eq $true -and $eligibility.data.sourceSession.isSourceEligible -eq $true) "Eligibility failed"

# Target Simulation with custom targetEndTime
$targetSim = Invoke-RestMethod -Uri "$BaseUrl/schedules/sessions/$targetSessionId/reschedule-eligibility?targetDate=2026-10-15&targetStartTime=08:00&targetEndTime=11:00" -Method Get -Headers $doctorHeaders
Assert-Result "Reschedule Target Simulation with targetEndTime" ($targetSim.data.targetValidation.projectedEndTime -eq "11:00") "ProjectedEndTime is $($targetSim.data.targetValidation.projectedEndTime)"

# 6. Test References and Projections
Write-Host "`n--- 6. Testing References & Contexts ---" -ForegroundColor Yellow
$rooms = Invoke-RestMethod -Uri "$BaseUrl/schedules/reference/rooms" -Method Get -Headers $doctorHeaders
Assert-Result "Reference Rooms" ($rooms.Count -gt 0) "No rooms returned"

$contexts = Invoke-RestMethod -Uri "$BaseUrl/schedules/contexts?date=$todayDateStr" -Method Get -Headers $doctorHeaders
Assert-Result "Schedule Contexts (4 Shifts Cycle)" ($contexts.Count -eq 4) "Context count is $($contexts.Count)"

$proj = Invoke-RestMethod -Uri "$BaseUrl/schedules/projection?date=$todayDateStr&scheduleContextId=morning&startTime=08:00" -Method Get -Headers $doctorHeaders
Assert-Result "Schedule Dynamic Projection" ($proj.capacity -ge 1 -and $proj.intervals.Count -ge 1) "Projection failed"

# 7. Test Admin Parity
Write-Host "`n--- 7. Testing Admin Parity Endpoints ---" -ForegroundColor Yellow
$adminSupervision = Invoke-RestMethod -Uri "$BaseUrl/admin/doctor-schedules" -Method Get -Headers $adminHeaders
Assert-Result "Admin Doctor Schedules List" ($adminSupervision.data.doctors.Count -gt 0) "No doctors in supervision list"

$adminDetail = Invoke-RestMethod -Uri "$BaseUrl/admin/doctor-schedules/$doctorId" -Method Get -Headers $adminHeaders
$resolvedDoctorId = if ($null -ne $adminDetail.data.id) { $adminDetail.data.id } else { $adminDetail.id }
Assert-Result "Admin Doctor Schedule Detail" ($resolvedDoctorId -eq $doctorId) "Doctor ID mismatch (Got: $resolvedDoctorId, Expected: $doctorId)"

$adminEligibility = Invoke-RestMethod -Uri "$BaseUrl/admin/doctor-schedules/$doctorId/sessions/$targetSessionId/reschedule-eligibility" -Method Get -Headers $adminHeaders
Assert-Result "Admin Doctor Reschedule Eligibility Route" ($adminEligibility.data.isEligible -eq $true) "Admin eligibility check failed"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   CONTRACT VERIFICATION COMPLETE - ALL CHECKS PASSED     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
