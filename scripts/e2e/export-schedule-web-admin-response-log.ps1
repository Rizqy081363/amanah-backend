# ==============================================================================
# AMANAH HEALTHCARE BACKEND - SCHEDULE WEB ADMIN RESPONSE LOG EXPORTER
# Generates explicit endpoint evidence logs for Web Admin + shared schedule
# contract handoff. The log includes HTTP status, request body, and complete JSON
# responses for the schedule domain endpoints used by Web Admin.
# ==============================================================================

param(
    [string]$BaseUrl = $env:E2E_BASE_URL,
    [string]$OutputPath = "docs/qa/SCHEDULE-WEB-ADMIN-ENDPOINT-RESPONSE-LOG-2026-09-24.md"
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. "$PSScriptRoot\common.ps1"

$baseUrl = if ([string]::IsNullOrWhiteSpace($BaseUrl)) { Get-E2EBaseUrl } else { $BaseUrl.TrimEnd('/') }
$outputFullPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
} else {
    Join-Path (Get-Location) $OutputPath
}

function Invoke-SqlScalar([string]$sql) {
    return (docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -A -c $sql).Trim()
}

function Invoke-Sql([string]$sql) {
    docker compose exec -T postgres psql -U amanah -d amanah_healthcare -c $sql | Out-Null
}

function Convert-ToPrettyJson([object]$value) {
    if ($null -eq $value) {
        return ""
    }

    if ($value -is [string]) {
        if ([string]::IsNullOrWhiteSpace($value)) {
            return ""
        }

        try {
            return ($value | ConvertFrom-Json | ConvertTo-Json -Depth 80)
        } catch {
            return $value
        }
    }

    return ($value | ConvertTo-Json -Depth 80)
}

function Add-LogSection(
    [string]$title,
    [string]$method,
    [string]$path,
    [int]$statusCode,
    [object]$requestBody,
    [string]$responseBody
) {
    $requestJson = Convert-ToPrettyJson $requestBody
    $responseJson = Convert-ToPrettyJson $responseBody

    Add-Content -LiteralPath $outputFullPath -Value ""
    Add-Content -LiteralPath $outputFullPath -Value "## $title"
    Add-Content -LiteralPath $outputFullPath -Value ""
    Add-Content -LiteralPath $outputFullPath -Value '```http'
    Add-Content -LiteralPath $outputFullPath -Value "$method $path"
    Add-Content -LiteralPath $outputFullPath -Value "Authorization: Bearer <admin-or-doctor-token>"
    Add-Content -LiteralPath $outputFullPath -Value "HTTP Status: $statusCode"
    Add-Content -LiteralPath $outputFullPath -Value '```'
    Add-Content -LiteralPath $outputFullPath -Value ""

    if (-not [string]::IsNullOrWhiteSpace($requestJson)) {
        Add-Content -LiteralPath $outputFullPath -Value "Request body:"
        Add-Content -LiteralPath $outputFullPath -Value ""
        Add-Content -LiteralPath $outputFullPath -Value '```json'
        Add-Content -LiteralPath $outputFullPath -Value $requestJson
        Add-Content -LiteralPath $outputFullPath -Value '```'
        Add-Content -LiteralPath $outputFullPath -Value ""
    }

    Add-Content -LiteralPath $outputFullPath -Value "Response body:"
    Add-Content -LiteralPath $outputFullPath -Value ""
    Add-Content -LiteralPath $outputFullPath -Value '```json'
    Add-Content -LiteralPath $outputFullPath -Value $responseJson
    Add-Content -LiteralPath $outputFullPath -Value '```'
}

function Invoke-LoggedRequest(
    [string]$title,
    [string]$method,
    [string]$path,
    [hashtable]$headers,
    [object]$body = $null
) {
    $uri = "$baseUrl$path"
    $bodyJson = if ($null -ne $body) { $body | ConvertTo-Json -Depth 80 } else { $null }
    $statusCode = 0
    $content = ""

    try {
        if ($null -ne $bodyJson) {
            $response = Invoke-WebRequest -Uri $uri -Method $method -Headers $headers -Body $bodyJson -ContentType "application/json" -UseBasicParsing
        } else {
            $response = Invoke-WebRequest -Uri $uri -Method $method -Headers $headers -UseBasicParsing
        }
        $statusCode = [int]$response.StatusCode
        $content = $response.Content
    } catch {
        if ($null -ne $_.Exception -and $null -ne $_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            if ($null -ne $_.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) {
                $content = $_.ErrorDetails.Message
            } else {
                try {
                    $stream = $_.Exception.Response.GetResponseStream()
                    if ($null -ne $stream) {
                        $reader = New-Object System.IO.StreamReader($stream)
                        $content = $reader.ReadToEnd()
                    }
                } catch {
                    $content = $_.Exception.Message
                }
            }
        } else {
            $statusCode = 500
            $content = if ($null -ne $_.Exception) { $_.Exception.Message } else { "$_" }
        }
    }

    Add-LogSection -title $title -method $method -path $path -statusCode $statusCode -requestBody $body -responseBody $content

    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($content)) {
        try {
            $parsed = $content | ConvertFrom-Json
        } catch {
            $parsed = $content
        }
    }

    return [PSCustomObject]@{
        StatusCode = $statusCode
        Content = $content
        Json = $parsed
    }
}

function Require-Success([string]$name, [object]$result) {
    if ($result.StatusCode -lt 200 -or $result.StatusCode -gt 299) {
        throw "$name failed with HTTP $($result.StatusCode): $($result.Content)"
    }
}

function Login-User([string]$email, [string]$password) {
    $body = @{ email = $email; password = $password } | ConvertTo-Json
    return Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $body -ContentType "application/json"
}

Wait-E2EApiReady -url $baseUrl

$outputDirectory = Split-Path -Parent $outputFullPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$adminAuth = Login-User "admin@amanah.com" "secret123"
$doctorAuth = Login-User "dokter@amanah.com" "secret123"
$adminHeaders = @{ Authorization = "Bearer $($adminAuth.token)" }
$doctorHeaders = @{ Authorization = "Bearer $($doctorAuth.token)" }

$doctorId = Invoke-SqlScalar "SELECT p.id FROM practitioners p JOIN staff_profiles sp ON p.staff_profile_id = sp.id JOIN users u ON sp.user_id = u.id WHERE u.email = 'dokter@amanah.com';"
$patientProfileId = Invoke-SqlScalar "SELECT id FROM patient_profiles LIMIT 1;"
$serviceId = Invoke-SqlScalar "SELECT id FROM clinic_services LIMIT 1;"
$originalDuration = Invoke-SqlScalar "SELECT consultation_duration_minutes FROM practitioners WHERE id = '$doctorId';"

$listDate = "2026-09-24"
$adminDate = "2026-12-10"
$rescheduleTargetDate = "2026-12-11"
$closureDate = "2026-12-12"
$cutiDate = "2026-12-13"
$allDates = @($adminDate, $rescheduleTargetDate, $closureDate, $cutiDate)

function Clear-TestDates {
    $dateList = ($allDates | ForEach-Object { "'$_'" }) -join ","
    Invoke-Sql "DELETE FROM appointments WHERE scheduled_date IN ($dateList);"
    Invoke-Sql "DELETE FROM practitioner_schedule_sessions WHERE practitioner_id = '$doctorId' AND schedule_date IN ($dateList);"
    Invoke-Sql "DELETE FROM practitioner_schedule_day_settings WHERE practitioner_id = '$doctorId' AND schedule_date IN ($dateList);"
    Invoke-Sql "DELETE FROM practitioner_leave_periods WHERE practitioner_id = '$doctorId' AND start_date <= '$cutiDate' AND end_date >= '$cutiDate';"
}

Clear-TestDates

$generatedAt = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz")
Set-Content -LiteralPath $outputFullPath -Value "# Schedule Web Admin Endpoint E2E Response Log"
Add-Content -LiteralPath $outputFullPath -Value ""
Add-Content -LiteralPath $outputFullPath -Value "**Generated at:** $generatedAt"
Add-Content -LiteralPath $outputFullPath -Value ""
Add-Content -LiteralPath $outputFullPath -Value "**Base URL:** $baseUrl"
Add-Content -LiteralPath $outputFullPath -Value ""
Add-Content -LiteralPath $outputFullPath -Value "**Practitioner under test:** $doctorId"
Add-Content -LiteralPath $outputFullPath -Value ""
Add-Content -LiteralPath $outputFullPath -Value "**Contract:** persistent status is only 'open | closed'; API effective status is only 'OPEN | OCCUPIED | CLOSED'; mutation status is only 'OPEN | CLOSED'."

try {
    $filterRes = Invoke-LoggedRequest "01. Admin Filter Options" "GET" "/api/v1/admin/doctor-schedules/filter-options" $adminHeaders
    Require-Success "admin filter options" $filterRes

    $listRes = Invoke-LoggedRequest "02. Admin Doctor Schedule Cards - 2026-09-24" "GET" "/api/v1/admin/doctor-schedules?date=$listDate&page=1&limit=6" $adminHeaders
    Require-Success "doctor schedule cards" $listRes

    $listOpenRes = Invoke-LoggedRequest "03. Admin Doctor Schedule Cards Filtered by OPEN" "GET" "/api/v1/admin/doctor-schedules?date=$listDate&status=OPEN&page=1&limit=6" $adminHeaders
    Require-Success "doctor cards filtered by OPEN" $listOpenRes

    $listOccRes = Invoke-LoggedRequest "04. Admin Doctor Schedule Cards Filtered by OCCUPIED" "GET" "/api/v1/admin/doctor-schedules?date=$listDate&status=OCCUPIED&page=1&limit=6" $adminHeaders
    Require-Success "doctor cards filtered by OCCUPIED" $listOccRes

    $listClosedRes = Invoke-LoggedRequest "05. Admin Doctor Schedule Cards Filtered by CLOSED" "GET" "/api/v1/admin/doctor-schedules?date=$listDate&status=CLOSED&page=1&limit=6" $adminHeaders
    Require-Success "doctor cards filtered by CLOSED" $listClosedRes

    $detailRes = Invoke-LoggedRequest "06. Admin Doctor Schedule Detail - Calendar, Sessions, Timeline" "GET" "/api/v1/admin/doctor-schedules/${doctorId}?date=$listDate&month=2026-09" $adminHeaders
    Require-Success "doctor schedule detail" $detailRes

    $durationBody = @{
        consultationDurationMinutes = 30
        startPrecisionMinutes = 1
    }
    $durationRes = Invoke-LoggedRequest "07. Admin Update Effective Consultation Duration" "PATCH" "/api/v1/admin/doctor-schedules/${doctorId}/duration" $adminHeaders $durationBody
    Require-Success "duration update" $durationRes

    $createSessionBody = @{
        schedule_date = $adminDate
        nama_sesi = "Sesi Pagi Evidence"
        jam_mulai = "08:00"
        jam_selesai = "10:00"
        kuota_pasien = 4
        slot_tersedia = 4
        status_sesi = "OPEN"
    }
    $createSessionRes = Invoke-LoggedRequest "08. Admin Create Doctor Session" "POST" "/api/v1/admin/doctor-schedules/${doctorId}/sessions" $adminHeaders $createSessionBody
    Require-Success "create session" $createSessionRes
    $sessionId = $createSessionRes.Json.data.id

    $updateSessionBody = @{
        nama_sesi = "Sesi Pagi Evidence Updated"
        kuota_pasien = 4
        slot_tersedia = 2
        status_sesi = "OPEN"
    }
    $updateSessionRes = Invoke-LoggedRequest "09. Admin Update Doctor Session" "PATCH" "/api/v1/admin/doctor-schedules/${doctorId}/sessions/$sessionId" $adminHeaders $updateSessionBody
    Require-Success "update session" $updateSessionRes

    $aptOneId = [System.Guid]::NewGuid().ToString()
    $aptTwoId = [System.Guid]::NewGuid().ToString()
    $codeOne = "LOG-SCHED-" + [System.Guid]::NewGuid().ToString().Substring(0, 8)
    $codeTwo = "LOG-SCHED-" + [System.Guid]::NewGuid().ToString().Substring(0, 8)
    Invoke-Sql "INSERT INTO appointments (id, patient_id, practitioner_id, service_id, schedule_session_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, booking_code, complaint) VALUES ('$aptOneId', '$patientProfileId', '$doctorId', '$serviceId', '$sessionId', '$adminDate', '08:00:00', '08:30:00', 'waiting', '$codeOne', 'Evidence log waiting patient'), ('$aptTwoId', '$patientProfileId', '$doctorId', '$serviceId', '$sessionId', '$adminDate', '08:30:00', '09:00:00', 'booked', '$codeTwo', 'Evidence log booked patient');"
    Invoke-Sql "UPDATE practitioner_schedule_sessions SET available_slots = 2 WHERE id = '$sessionId';"

    $detailAfterSeedRes = Invoke-LoggedRequest "10. Admin Detail After Session + Patients Seed" "GET" "/api/v1/admin/doctor-schedules/${doctorId}?date=$adminDate&month=2026-12" $adminHeaders
    Require-Success "detail after seed" $detailAfterSeedRes

    $patientsAllRes = Invoke-LoggedRequest "11. Admin Session Patients - All Statuses" "GET" "/api/v1/admin/doctor-schedules/${doctorId}/sessions/$sessionId/patients?status=all" $adminHeaders
    Require-Success "session patients all" $patientsAllRes

    $patientsWaitingRes = Invoke-LoggedRequest "12. Admin Session Patients - Waiting Filter" "GET" "/api/v1/admin/doctor-schedules/${doctorId}/sessions/$sessionId/patients?status=waiting" $adminHeaders
    Require-Success "session patients waiting" $patientsWaitingRes

    $accPatientsRes = Invoke-LoggedRequest "13. Admin Doctor Accumulated Patients by Date" "GET" "/api/v1/admin/doctor-schedules/${doctorId}/patients?date=$adminDate&status=all" $adminHeaders
    Require-Success "accumulated patients" $accPatientsRes

    $rej14 = Invoke-LoggedRequest "14. Contract Rejection - Legacy Admin Filter Status Buka" "GET" "/api/v1/admin/doctor-schedules?date=$adminDate&status=Buka" $adminHeaders
    if ($rej14.StatusCode -ne 400) { throw "Expected 400 for legacy filter but got $($rej14.StatusCode)" }

    $legacySessionBody = @{ status_sesi = "Tutup" }
    $rej15 = Invoke-LoggedRequest "15. Contract Rejection - Legacy Admin Session Status Tutup" "PATCH" "/api/v1/admin/doctor-schedules/${doctorId}/sessions/$sessionId" $adminHeaders $legacySessionBody
    if ($rej15.StatusCode -ne 422) { throw "Expected 422 for legacy session status but got $($rej15.StatusCode)" }

    $eligibilityRes = Invoke-LoggedRequest "16. Admin Reschedule Eligibility - Valid Target" "GET" "/api/v1/admin/doctor-schedules/${doctorId}/sessions/$sessionId/reschedule-eligibility?targetDate=$rescheduleTargetDate&targetStartTime=09:00" $adminHeaders
    Require-Success "reschedule eligibility" $eligibilityRes

    $rescheduleBody = @{
        targetDate = $rescheduleTargetDate
        targetStartTime = "09:00"
        reason = "Evidence log reschedule"
        rescheduleActiveAppointments = $true
    }
    $rescheduleRes = Invoke-LoggedRequest "17. Admin Reschedule Session" "POST" "/api/v1/admin/doctor-schedules/${doctorId}/sessions/$sessionId/reschedule" $adminHeaders $rescheduleBody
    Require-Success "reschedule session" $rescheduleRes

    $detailAfterRescheduleRes = Invoke-LoggedRequest "18. Admin Detail After Reschedule" "GET" "/api/v1/admin/doctor-schedules/${doctorId}?date=$rescheduleTargetDate&month=2026-12" $adminHeaders
    Require-Success "detail after reschedule" $detailAfterRescheduleRes

    $guard19 = Invoke-LoggedRequest "19. Admin Delete Session Guard" "DELETE" "/api/v1/admin/doctor-schedules/${doctorId}/sessions/$sessionId" $adminHeaders
    if ($guard19.StatusCode -ne 403) { throw "Expected 403 for delete guard but got $($guard19.StatusCode)" }

    $closeSessionOneBody = @{
        schedule_date = $closureDate
        nama_sesi = "Sesi Pagi Closure Evidence"
        jam_mulai = "08:00"
        jam_selesai = "09:00"
        kuota_pasien = 2
        slot_tersedia = 2
        status_sesi = "OPEN"
    }
    $closeSessionOneRes = Invoke-LoggedRequest "20. Admin Create Session for Calendar Closure" "POST" "/api/v1/admin/doctor-schedules/${doctorId}/sessions" $adminHeaders $closeSessionOneBody
    Require-Success "create closure session one" $closeSessionOneRes
    $closeSessionOneId = $closeSessionOneRes.Json.data.id

    $closeSessionTwoBody = @{
        schedule_date = $closureDate
        nama_sesi = "Sesi Siang Closure Evidence"
        jam_mulai = "13:00"
        jam_selesai = "14:00"
        kuota_pasien = 2
        slot_tersedia = 2
        status_sesi = "OPEN"
    }
    $closeSessionTwoRes = Invoke-LoggedRequest "21. Admin Create Second Session for Calendar Closure" "POST" "/api/v1/admin/doctor-schedules/${doctorId}/sessions" $adminHeaders $closeSessionTwoBody
    Require-Success "create closure session two" $closeSessionTwoRes

    $closeAptId = [System.Guid]::NewGuid().ToString()
    $closeBookingCode = "LOG-CLOSE-" + [System.Guid]::NewGuid().ToString().Substring(0, 8)
    Invoke-Sql "INSERT INTO appointments (id, patient_id, practitioner_id, service_id, schedule_session_id, scheduled_date, scheduled_start_time, scheduled_end_time, status, booking_code, complaint) VALUES ('$closeAptId', '$patientProfileId', '$doctorId', '$serviceId', '$closeSessionOneId', '$closureDate', '08:00:00', '08:30:00', 'booked', '$closeBookingCode', 'Evidence log closure appointment');"

    $closeDayBody = @{
        status = "CLOSED"
        notes = "Evidence log calendar closure"
    }
    $closeDayRes = Invoke-LoggedRequest "22. Admin Close Calendar Day" "PATCH" "/api/v1/admin/doctor-schedules/${doctorId}/days/$closureDate" $adminHeaders $closeDayBody
    Require-Success "close day" $closeDayRes

    $detailAfterCloseRes = Invoke-LoggedRequest "23. Admin Detail After Calendar Day Closed" "GET" "/api/v1/admin/doctor-schedules/${doctorId}?date=$closureDate&month=2026-12" $adminHeaders
    Require-Success "detail after close day" $detailAfterCloseRes

    $openDayBody = @{
        status = "OPEN"
        notes = "Evidence log calendar restore"
    }
    $openDayRes = Invoke-LoggedRequest "24. Admin Reopen Calendar Day" "PATCH" "/api/v1/admin/doctor-schedules/${doctorId}/days/$closureDate" $adminHeaders $openDayBody
    Require-Success "open day" $openDayRes

    $cutiBody = @{
        date = $cutiDate
        is_cuti = $true
        cuti_reason = "Evidence log cuti metadata"
        cuti_start = $cutiDate
        cuti_end = $cutiDate
    }
    $cutiRes = Invoke-LoggedRequest "25. Admin Set Cuti Metadata via Doctor Schedule Update" "PATCH" "/api/v1/admin/doctor-schedules/${doctorId}" $adminHeaders $cutiBody
    Require-Success "set cuti metadata" $cutiRes

    $detailAfterCutiRes = Invoke-LoggedRequest "26. Admin Detail After Cuti Metadata" "GET" "/api/v1/admin/doctor-schedules/${doctorId}?date=$cutiDate&month=2026-12" $adminHeaders
    Require-Success "detail after cuti" $detailAfterCutiRes

    $optionsRes = Invoke-LoggedRequest "27. Shared Schedule Reference Options for Web/Mobile" "GET" "/api/v1/schedules/reference/options" $doctorHeaders
    Require-Success "reference options" $optionsRes

    $legacyMobileDayBody = @{
        status = "Tutup"
        notes = "Legacy mobile status must be rejected"
    }
    $rej28 = Invoke-LoggedRequest "28. Contract Rejection - Legacy Mobile Day Status Tutup" "PATCH" "/api/v1/schedules/days/$closureDate" $doctorHeaders $legacyMobileDayBody
    if ($rej28.StatusCode -ne 400) { throw "Expected 400 for legacy mobile day status but got $($rej28.StatusCode)" }

    Add-Content -LiteralPath $outputFullPath -Value ""
    Add-Content -LiteralPath $outputFullPath -Value "## Verification Summary"
    Add-Content -LiteralPath $outputFullPath -Value ""
    Add-Content -LiteralPath $outputFullPath -Value '```text'
    Add-Content -LiteralPath $outputFullPath -Value "Export completed successfully."
    Add-Content -LiteralPath $outputFullPath -Value "All setup-dependent endpoints returned expected successful responses."
    Add-Content -LiteralPath $outputFullPath -Value "Legacy status payloads were logged as rejected responses."
    Add-Content -LiteralPath $outputFullPath -Value '```'
} finally {
    if (-not [string]::IsNullOrWhiteSpace($originalDuration)) {
        Invoke-Sql "UPDATE practitioners SET consultation_duration_minutes = $originalDuration WHERE id = '$doctorId';"
    }
    Clear-TestDates
}

Write-Host "Schedule Web Admin endpoint response log exported to: $outputFullPath" -ForegroundColor Green
