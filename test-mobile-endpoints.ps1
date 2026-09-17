# ==============================================================================
# AMANAH HEALTHCARE BACKEND - MOBILE ENDPOINTS VERIFICATION SUITE
# ==============================================================================

$ErrorActionPreference = 'Stop'
$baseUrl = "http://localhost:3001"
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

Write-Host "=== 1. Authentication Setup ===" -ForegroundColor Cyan

# 1.1 Login as Admin
$adminLoginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json
$adminAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $adminLoginBody -ContentType "application/json"
$adminToken = $adminAuth.token
$adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
Assert-Test "Admin authentication successful" ($null -ne $adminToken -and $adminToken.Length -gt 20)

# 1.2 Login as Staff (Doctor)
$staffLoginBody = @{
    email = "dokter@amanah.com"
    password = "secret123"
} | ConvertTo-Json
$staffAuth = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body $staffLoginBody -ContentType "application/json"
$staffToken = $staffAuth.token
$staffHeaders = @{ "Authorization" = "Bearer $staffToken" }
Assert-Test "Staff authentication successful" ($null -ne $staffToken -and $staffToken.Length -gt 20)

Write-Host "`n=== 2. Notifications Module Endpoints ===" -ForegroundColor Cyan

# 2.1 Get my notifications
$notifs = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me?limit=10" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/notifications/me returns valid structure" ($null -ne $notifs.data -and $null -ne $notifs.unreadCount)

# 2.2 Mark all as read
$markAll = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/read-all" -Method Patch -Headers $staffHeaders
Assert-Test "PATCH /api/v1/notifications/read-all marks notifications as read" ($markAll.success -eq $true)

# 2.3 Verify unread count is 0
$notifsAfter = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/me" -Method Get -Headers $staffHeaders
Assert-Test "Unread notifications count is now 0 after read-all" ($notifsAfter.unreadCount -eq 0)

Write-Host "`n=== 3. Support Tickets Module Endpoints ===" -ForegroundColor Cyan

# 3.1 Create Support Ticket
$ticketBody = @{
    title = "Thermal Printer Kasir Sering Macet saat Cetak Struk Antrean"
    description = "Printer bluetooth di meja pendaftaran kasir mati mendadak saat lampu indikator merah menyala."
    priority = "high"
    sourceChannel = "mobile_app"
} | ConvertTo-Json

$createdTicket = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets" -Method Post -Body $ticketBody -ContentType "application/json" -Headers $staffHeaders
$ticketId = $createdTicket.id
Assert-Test "POST /api/v1/support-tickets creates ticket with valid ID" ($null -ne $ticketId)
Assert-Test "Ticket has generated ticketNumber format (TK-YYYY-XXXX)" ($createdTicket.ticketNumber -match '^TK-\d{4}-\d{4}$')
Assert-Test "Ticket initial status is open" ($createdTicket.status -eq "open")

# 3.2 List my tickets
$myTickets = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/my-tickets" -Method Get -Headers $staffHeaders
$foundTicket = $myTickets | Where-Object { $_.id -eq $ticketId }
Assert-Test "GET /api/v1/support-tickets/my-tickets lists created ticket" ($null -ne $foundTicket)

# 3.3 Get single ticket by ID
$ticketDetail = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/$ticketId" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/support-tickets/:id returns full ticket detail" ($ticketDetail.id -eq $ticketId -and $ticketDetail.title -eq $createdTicket.title)

# 3.4 Get ticket messages (should include initial description message)
$messages = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/$ticketId/messages" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/support-tickets/:id/messages contains initial message" ($messages.Count -ge 1 -and $messages[0].body -like "*Printer bluetooth*")

# 3.5 Send new chat message to ticket
$msgBody = @{
    message = "Sudah dicoba ganti kertas roll baru, tetap macet setelah 3 detik."
} | ConvertTo-Json
$sentMsg = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/$ticketId/messages" -Method Post -Body $msgBody -ContentType "application/json" -Headers $staffHeaders
Assert-Test "POST /api/v1/support-tickets/:id/messages returns created message" ($null -ne $sentMsg.id -and $sentMsg.senderType -eq "reporter")

# 3.6 Verify message list updated
$messagesAfter = Invoke-RestMethod -Uri "$baseUrl/api/v1/support-tickets/$ticketId/messages" -Method Get -Headers $staffHeaders
Assert-Test "Messages thread updated with new chat entry" ($messagesAfter.Count -ge 2 -and ($messagesAfter | Where-Object { $_.id -eq $sentMsg.id }))

Write-Host "`n=== 4. Clinic Analytics Endpoints ===" -ForegroundColor Cyan

# 4.1 Summary analytics
$summary = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/analytics/summary" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/clinics/analytics/summary returns totalClinics" ($null -ne $summary.totalClinics)
Assert-Test "GET /api/v1/clinics/analytics/summary returns todayAppointments" ($null -ne $summary.todayAppointments)
Assert-Test "GET /api/v1/clinics/analytics/summary returns waitingQueues" ($null -ne $summary.waitingQueues)
Assert-Test "GET /api/v1/clinics/analytics/summary returns completedExams" ($null -ne $summary.completedExams)

# 4.2 Monthly analytics
$monthly = Invoke-RestMethod -Uri "$baseUrl/api/v1/clinics/analytics/monthly?year=2026" -Method Get -Headers $staffHeaders
Assert-Test "GET /api/v1/clinics/analytics/monthly returns months array" ($monthly.Count -gt 0)
Assert-Test "Monthly data contains day intervals with patient metrics" ($null -ne $monthly[0].data -and $monthly[0].data.Count -gt 0 -and $null -ne $monthly[0].data[0].patients)

Write-Host "`n=== 5. Staff Leaves Lifecycle & Cancellation ===" -ForegroundColor Cyan

# 5.1 Request Leave
$leaveBody = @{
    startDate = "2026-10-12"
    endDate = "2026-10-14"
    reason = "Menghadiri Seminar Nasional Dokter Spesialis Anak"
    type = "seminar_symposium"
} | ConvertTo-Json
$createdLeave = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves" -Method Post -Body $leaveBody -ContentType "application/json" -Headers $staffHeaders
$leaveId = $createdLeave.id
Assert-Test "POST /api/v1/leaves creates leave request" ($null -ne $leaveId)
Assert-Test "Created leave status is MENUNGGU_KONFIRMASI" ($createdLeave.status -eq "MENUNGGU_KONFIRMASI")

# 5.2 Verify leave appears in my-leaves
$myLeaves = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves/my-leaves" -Method Get -Headers $staffHeaders
$foundLeave = $myLeaves | Where-Object { $_.id -eq $leaveId }
Assert-Test "GET /api/v1/leaves/my-leaves lists created leave" ($null -ne $foundLeave)

# 5.3 Cancel the leave request
$cancelledLeave = Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves/$leaveId/cancel" -Method Patch -Headers $staffHeaders
Assert-Test "PATCH /api/v1/leaves/:id/cancel updates status to DIBATALKAN" ($cancelledLeave.status -eq "DIBATALKAN")
Assert-Test "Cancelled leave has non-null cancelledAt timestamp" ($null -ne $cancelledLeave.cancelledAt)

# 5.4 Attempting to cancel already cancelled leave returns 400 Bad Request
$cancelAgainFailed = $false
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/leaves/$leaveId/cancel" -Method Patch -Headers $staffHeaders
} catch {
    $cancelAgainFailed = $_.Exception.Response.StatusCode.value__ -eq 400
}
Assert-Test "Cancelling non-pending leave rejected with HTTP 400 Bad Request" $cancelAgainFailed

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host "Mobile Endpoints Suite Results: Passed = $passed, Failed = $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==============================================================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    exit 1
}
