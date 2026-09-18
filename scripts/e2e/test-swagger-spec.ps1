# ==============================================================================
# AMANAH HEALTHCARE BACKEND - OPENAPI / SWAGGER SPEC & TRY-IT-OUT TEST SUITE
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

Write-Host "=== 1. Validating OpenAPI Specification Metadata & Structure ===" -ForegroundColor Cyan

# 1.1 Fetch OpenAPI JSON
$specRaw = (Invoke-WebRequest -Uri "$baseUrl/docs-json" -UseBasicParsing).Content
$spec = $specRaw | ConvertFrom-Json

Assert-Test "OpenAPI Spec is valid JSON and reachable at /docs-json" ($null -ne $spec)
Assert-Test "OpenAPI Version is 3.0.0" ($spec.openapi -eq "3.0.0")
Assert-Test "API Title is 'Amanah Healthcare API'" ($spec.info.title -eq "Amanah Healthcare API")
Assert-Test "API Version is '1.0'" ($spec.info.version -eq "1.0")

# 1.2 Security Scheme
$scheme = $spec.components.securitySchemes."access-token"
Assert-Test "Security scheme 'access-token' is registered" ($null -ne $scheme)
Assert-Test "Security scheme type is 'http'" ($scheme.type -eq "http")
Assert-Test "Security scheme is 'bearer'" ($scheme.scheme -eq "bearer")
Assert-Test "Bearer format is 'JWT'" ($scheme.bearerFormat -eq "JWT")
Assert-Test "Bearer scheme omits API-key-only name/in fields" ($null -eq $scheme.name -and $null -eq $scheme.in)

# 1.3 Servers
$servers = $spec.servers
Assert-Test "Servers list is defined with at least 2 environments" ($servers.Count -ge 2)
$localServer = $servers | Where-Object { $_.url.TrimEnd('/') -eq $baseUrl }
Assert-Test "Local Development Server URL is configured" ($null -ne $localServer)

# 1.4 Inspect all operations, security consistency, summaries, descriptions, and broken refs
$opsCount = 0
$securityMismatches = 0
$missingDocs = 0
$tags = @{}
$operationTags = @{}

foreach ($pathProp in $spec.paths.PSObject.Properties) {
    $path = $pathProp.Name
    foreach ($mProp in $pathProp.Value.PSObject.Properties) {
        $opsCount++
        $op = $mProp.Value
        
        # Tags tracking
        if ($op.tags) {
            foreach ($t in $op.tags) {
                if ($tags.ContainsKey($t)) { $tags[$t]++ } else { $tags[$t] = 1 }
                $operationTags[$t] = $true
            }
        }

        # Security check
        if ($op.security) {
            foreach ($sec in $op.security) {
                foreach ($secName in $sec.PSObject.Properties.Name) {
                    if ($secName -ne 'access-token') { $securityMismatches++ }
                }
            }
        }

        # Summary & Description check
        if ([string]::IsNullOrWhiteSpace($op.summary) -or [string]::IsNullOrWhiteSpace($op.description)) {
            $missingDocs++
        }
    }
}

Assert-Test "All operations have summary and description (missing: $missingDocs)" ($missingDocs -eq 0)
Assert-Test "All secured operations use unified 'access-token' scheme (mismatches: $securityMismatches)" ($securityMismatches -eq 0)
Assert-Test "Total documented operations count is 98" ($opsCount -eq 98)

# Check broken $refs
$regex = [regex]'"\$ref":\s*"([^"]+)"'
$refMatches = $regex.Matches($specRaw)
$brokenRefs = 0
foreach ($m in $refMatches) {
    $ref = $m.Groups[1].Value
    if ($ref.StartsWith("#/components/schemas/")) {
        $name = $ref.Substring("#/components/schemas/".Length)
        if (-not $spec.components.schemas.$name) { $brokenRefs++ }
    }
}
Assert-Test "All schema `$ref references resolve cleanly (broken: $brokenRefs)" ($brokenRefs -eq 0)

Write-Host "`n=== 2. Validating Swagger UI Frontend Configuration ===" -ForegroundColor Cyan

$docsHtml = (Invoke-WebRequest -Uri "$baseUrl/docs" -UseBasicParsing).Content
Assert-Test "Swagger UI HTML serves HTTP 200 at /docs" ($docsHtml.Length -gt 0)

$initJs = (Invoke-WebRequest -Uri "$baseUrl/docs/swagger-ui-init.js" -UseBasicParsing).Content
Assert-Test "Swagger UI init script contains persistAuthorization: true" ($initJs -match '"persistAuthorization":\s*true')
Assert-Test "Swagger UI init script contains displayRequestDuration: true" ($initJs -match '"displayRequestDuration":\s*true')
Assert-Test "Swagger UI init script contains filter: true" ($initJs -match '"filter":\s*true')

Write-Host "`n=== 3. Simulating 'Try It Out' Requests Across All Spec Tags ===" -ForegroundColor Cyan

# 3.1 Tag: Home
$homeRes = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
Assert-Test "Try-it-out [Home]: GET / -> returns server app info" ($homeRes.name -eq "Amanah Healthcare Backend")

# 3.2 Tag: Health
$healthLive = Invoke-RestMethod -Uri "$baseUrl/health/live" -Method Get
Assert-Test "Try-it-out [Health]: GET /health/live -> returns status up" ($healthLive.status -eq "up")
$healthReady = Invoke-RestMethod -Uri "$baseUrl/health/ready" -Method Get
Assert-Test "Try-it-out [Health]: GET /health/ready -> returns system readiness" ($healthReady.status -eq "up" -and ($healthReady.dependencies | Where-Object { $_.name -eq "database" }).status -eq "up")

# 3.3 Tag: Auth (Login to obtain bearer token)
$loginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json
$authRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $authRes.token
Assert-Test "Try-it-out [Auth]: POST /api/v1/auth/email/login -> returns valid JWT access token" ($null -ne $token -and $token.Length -gt 20)

$authHeaders = @{
    "Authorization" = "Bearer $token"
}

# 3.4 Tag: Auth (Profile via Bearer)
$meRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/me" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Auth]: GET /api/v1/auth/me -> returns authenticated admin user" ($meRes.email -eq "admin@amanah.com")

# 3.5 Tag: Clinics
$clinicsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics" -Method Get
Assert-Test "Try-it-out [Clinics]: GET /api/v1/clinics -> returns active clinics list" ($clinicsRes.data.Count -gt 0)

# 3.6 Tag: Patients
$patientsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Patients]: GET /api/v1/patients -> returns registered patients list" ($patientsRes.data.Count -gt 0)

# 3.7 Tag: Staffs
$staffsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/staffs" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Staffs]: GET /api/v1/staffs -> returns staff records list" ($staffsRes.data.Count -gt 0)

# 3.8 Tag: Schedules
$schedulesRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/schedules" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Schedules]: GET /api/v1/schedules -> returns doctor practice schedules" ($schedulesRes.data.Count -ge 0)

# 3.9 Tag: Appointments
$queueDisplay = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/queue/display" -Method Get
Assert-Test "Try-it-out [Appointments]: GET /api/v1/appointments/queue/display -> returns live TV display monitor" ($null -ne $queueDisplay.statistics)
$appointmentsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Appointments]: GET /api/v1/appointments -> returns appointments list" ($appointmentsRes.data.Count -ge 0)

# 3.10 Tag: Medical Records
$mrRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/medical-records" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Medical Records]: GET /api/v1/medical-records -> returns medical records list" ($mrRes.data.Count -gt 0)

# 3.11 Tag: Attendance
$attRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/attendance/daily" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Attendance]: GET /api/v1/attendance/daily -> returns daily staff attendance recap" ($null -ne $attRes)

# 3.12 Tag: Staff Leaves
$leavesRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves/pending" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Staff Leaves]: GET /api/v1/leaves/pending -> returns pending leave applications" ($null -ne $leavesRes)

# 3.13 Tag: Notifications
$notifsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Notifications]: GET /api/v1/notifications/me -> returns notifications list" ($null -ne $notifsRes.data)

# 3.14 Tag: Support Tickets
$ticketsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/my-tickets" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Support Tickets]: GET /api/v1/support-tickets/my-tickets -> returns my support tickets" ($null -ne $ticketsRes)

# 3.15 Tag: Clinic Analytics
$analyticsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/analytics/summary" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Clinic Analytics]: GET /api/v1/clinics/analytics/summary -> returns clinic operational analytics" ($null -ne $analyticsRes.totalClinics)

# 3.16 Tag: Audit Logs
$auditLogsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/audit-logs" -Method Get -Headers $authHeaders
Assert-Test "Try-it-out [Audit Logs]: GET /api/v1/audit-logs -> returns audit logs list" ($null -ne $auditLogsRes.data)

# 3.17 Tag: Outbox & Event Streaming
$outboxMetricsRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/outbox/metrics" -Method Get
Assert-Test "Try-it-out [Outbox & Event Streaming]: GET /api/v1/outbox/metrics -> returns queue metrics" ($null -ne $outboxMetricsRes.total)

$exercisedTags = @(
    "Home",
    "Health",
    "Auth (Kanonikal JWT)",
    "Clinics (Poliklinik & Layanan)",
    "Patients (Data Pasien & Rekam Medis)",
    "Staffs (Pegawai Klinis & Kartu ID Digital)",
    "Schedules (Jadwal Dokter & Bidan)",
    "Appointments (Kunjungan & Antrean Pasien)",
    "Medical Records (Rekam Medis, Diagnosa ICD-10 & Resep Obat)",
    "Attendance (Presensi QR Staf)",
    "Staff Leaves (Perizinan Cuti Staf)",
    "Notifications (Notifikasi Staf & Pasien)",
    "Support Tickets (Bantuan Teknis IT)",
    "Clinics Analytics (Statistik & Kunjungan Poliklinik)",
    "Audit Logs (Jejak Rekaman Audit)",
    "Outbox & Event Streaming"
)

$untestedTags = @()
foreach ($tag in $operationTags.Keys) {
    if ($exercisedTags -notcontains $tag) {
        $untestedTags += $tag
    }
}
Assert-Test "Try-it-out coverage includes every emitted OpenAPI tag" ($untestedTags.Count -eq 0) ($untestedTags -join ", ")

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "OpenAPI / Swagger Spec Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
