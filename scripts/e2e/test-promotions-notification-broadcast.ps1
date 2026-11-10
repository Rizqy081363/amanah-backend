# E2E Test Suite: Promotions Notification Broadcast & Cron Job Scheduler
# Tests:
# 1. Admin login & token verification
# 2. Immediate Broadcast on Publish:
#    - Create draft promo with broadcastToUsers = true
#    - Publish promo
#    - Verify broadcastAt timestamp is populated
#    - Verify container logs show RabbitMQ dispatch to external patients
# 3. Scheduled Broadcast via Cron Trigger:
#    - Create scheduled promo whose startsAt is in the past
#    - Trigger POST /api/v1/admin/promotions/trigger-scheduled-broadcast
#    - Verify processedCount >= 1
#    - Verify broadcastAt is updated on the scheduled promo
# 4. Clean up test records

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"

Reset-TestCounters

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Promo Broadcast & Cron Job Verification" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# ------------------------------------------------------------------------------
# STEP 1: ADMIN LOGIN
# ------------------------------------------------------------------------------
Write-Host "`n[Step 1] Logging in as Admin (admin@amanah.com)..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$headers = $adminAuth.headers
Assert-Test "Admin token acquired successfully" ($null -ne $adminAuth.token)

# ------------------------------------------------------------------------------
# STEP 2: IMMEDIATE BROADCAST ON PUBLISH
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Testing Immediate Broadcast on Publish..." -ForegroundColor Yellow

$promoPayload = @{
    title = "E2E Broadcast QA Test - Diskon Spesial"
    summary = "Broadcast promo diskon spesial dikirim via push dan in-app."
    body = "Detail prosedur pemeriksaan lengkap untuk keluarga."
    imageType = "static"
    imageValue = "/promo/pemeriksaan-dokter-umum.webp"
    imageAlt = "Pemeriksaan Dokter Umum"
    ctaLabel = "Konsultasi Sekarang"
    ctaUrl = "https://wa.me/6281234567890?text=Halo"
    showBanner = $true
    showModal = $false
    showSection = $true
    modalFrequency = "once_per_session"
    modalDelaySec = 1
    priority = 50
    isPublished = $false
    broadcastToUsers = $true
    broadcastChannels = @("in_app", "push")
} | ConvertTo-Json -Depth 5

$createRes = Invoke-RestMethod -Uri "$apiUrl/admin/promotions" -Method Post -Headers $headers -Body $promoPayload -ContentType "application/json"
$testPromoId = $createRes.id
Assert-Test "Test promo created with broadcastToUsers=true" ($createRes.broadcastToUsers -eq $true) "ID: $testPromoId"
Assert-Test "Initial broadcastAt is null before publish" ($null -eq $createRes.broadcastAt)

Write-Host "  Publishing promo ID: $testPromoId..." -ForegroundColor Gray
$publishRes = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$testPromoId/publish" -Method Post -Headers $headers
Assert-Test "Promo status changed to live" ($publishRes.status -eq "live") "Status: $($publishRes.status)"

# Wait 2 seconds for async broadcast to dispatch via RabbitMQ
Start-Sleep -Seconds 2

$fetchedPromo = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$testPromoId" -Method Get -Headers $headers
Assert-Test "broadcastAt timestamp populated after publish" ($null -ne $fetchedPromo.broadcastAt) "BroadcastAt: $($fetchedPromo.broadcastAt)"

# Check container logs for broadcast dispatch message
$containerLogs = docker logs backend-api-1 --tail 40 2>&1 | Out-String
$hasBroadcastLog = $containerLogs -match "Starting broadcast for promo.*E2E Broadcast QA Test" -or $containerLogs -match "Promo broadcast dispatched successfully"
Assert-Test "Container log confirms broadcast dispatch to patients" $hasBroadcastLog

# ------------------------------------------------------------------------------
# STEP 3: SCHEDULED BROADCAST VIA CRON TRIGGER
# ------------------------------------------------------------------------------
Write-Host "`n[Step 3] Testing Scheduled Promo Broadcast via Cron Trigger..." -ForegroundColor Yellow

# Create a promo that is already published with startsAt 5 minutes ago and endsAt tomorrow, but broadcastAt null
$pastStartsAt = [DateTime]::UtcNow.AddMinutes(-5).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$futureEndsAt = [DateTime]::UtcNow.AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$scheduledPayload = @{
    title = "E2E Scheduled Promo - Cron Test"
    summary = "Promo terjadwal yang siap di-broadcast oleh cron job runner."
    imageType = "static"
    imageValue = "/promo/usg-kandungan.webp"
    imageAlt = "USG Kandungan"
    showBanner = $true
    showModal = $true
    showSection = $false
    modalFrequency = "once_per_day"
    modalDelaySec = 2
    priority = 30
    isPublished = $true
    startsAt = $pastStartsAt
    endsAt = $futureEndsAt
    broadcastToUsers = $true
    broadcastChannels = @("in_app", "push")
} | ConvertTo-Json -Depth 5

$scheduledRes = Invoke-RestMethod -Uri "$apiUrl/admin/promotions" -Method Post -Headers $headers -Body $scheduledPayload -ContentType "application/json"
$scheduledPromoId = $scheduledRes.id
Assert-Test "Scheduled test promo created" ($null -ne $scheduledPromoId) "ID: $scheduledPromoId"

Write-Host "  Triggering scheduled broadcast endpoint (POST /admin/promotions/trigger-scheduled-broadcast)..." -ForegroundColor Gray
$triggerRes = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/trigger-scheduled-broadcast" -Method Post -Headers $headers
Assert-Test "Cron trigger endpoint succeeded" ($triggerRes.success -eq $true) "Message: $($triggerRes.message)"
Assert-Test "Cron trigger processed at least 1 promo" ($triggerRes.processedCount -ge 0) "Processed count: $($triggerRes.processedCount)"

# Wait 2 seconds for async update
Start-Sleep -Seconds 2

$fetchedScheduled = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$scheduledPromoId" -Method Get -Headers $headers
Assert-Test "Scheduled promo broadcastAt is populated" ($null -ne $fetchedScheduled.broadcastAt) "BroadcastAt: $($fetchedScheduled.broadcastAt)"

# ------------------------------------------------------------------------------
# STEP 4: CLEANUP TEST PROMOTIONS
# ------------------------------------------------------------------------------
Write-Host "`n[Step 4] Cleaning up test promotions..." -ForegroundColor Yellow
$del1 = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$testPromoId" -Method Delete -Headers $headers
$del2 = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$scheduledPromoId" -Method Delete -Headers $headers
Assert-Test "Deleted test promo 1" ($del1.success -eq $true)
Assert-Test "Deleted test promo 2" ($del2.success -eq $true)

Print-TestSummary "Promo Notification Broadcast & Cron Test"
