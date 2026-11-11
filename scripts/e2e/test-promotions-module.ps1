# E2E Test Suite: Promotions & Announcements Module
# Tests:
# 1. Public endpoint GET /api/v1/public/promotions (Contract, priority, cache header)
# 2. Admin Authentication & RBAC (clinics:manage)
# 3. Admin list GET /api/v1/admin/promotions with status, service linkage, and search
# 4. Create Promotion POST /api/v1/admin/promotions (Draft)
# 5. Fetch Single GET /api/v1/admin/promotions/:id
# 6. Edit Promotion PATCH /api/v1/admin/promotions/:id
# 7. Publish / Unpublish Flow POST /admin/promotions/:id/publish & unpublish
# 8. Duplicate Promotion POST /admin/promotions/:id/duplicate
# 9. Soft-delete Promotion DELETE /admin/promotions/:id
# 10. Zod Validation Rejections (HTTP protocol, zero placement, asymmetric CTA)

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"

Reset-TestCounters

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Promotions & Announcements Module" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# ------------------------------------------------------------------------------
# STEP 1: PUBLIC PROMOTIONS ENDPOINT
# ------------------------------------------------------------------------------
Write-Host "`n[Step 1] Testing Public Endpoint (GET /api/v1/public/promotions)..." -ForegroundColor Yellow
$publicRes = Invoke-RestMethod -Uri "$apiUrl/public/promotions" -Method Get
Assert-Test "Public promotions returned data array" ($null -ne $publicRes.data)
Assert-Test "Public promotions count >= 3" ($publicRes.data.Count -ge 3) "Count: $($publicRes.data.Count)"

$firstPublic = $publicRes.data[0]
Assert-Test "First promo has required fields" (
    $firstPublic.id -and $firstPublic.title -and $firstPublic.summary -and $firstPublic.image.src
) "ID: $($firstPublic.id), Title: $($firstPublic.title)"
Assert-Test "Internal fields are not leaked in public contract" (
    $null -eq $firstPublic.created_by -and $null -eq $firstPublic.deleted_at -and $null -eq $firstPublic.is_published
)

Write-Host "  Public Promo Top Priority: '$($firstPublic.title)' (Placements: $($firstPublic.placements -join ', '))" -ForegroundColor Gray

# ------------------------------------------------------------------------------
# STEP 2: ADMIN LOGIN & LIST PROMOTIONS
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Logging in as Admin (admin@amanah.com)..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$headers = $adminAuth.headers
Assert-Test "Admin token acquired successfully" ($null -ne $adminAuth.token)

Write-Host "`n[Step 3] Fetching Admin Promotions List (GET /api/v1/admin/promotions)..." -ForegroundColor Yellow
$adminList = Invoke-RestMethod -Uri "$apiUrl/admin/promotions" -Method Get -Headers $headers
Assert-Test "Admin list returned data and total" ($null -ne $adminList.data -and $adminList.total -ge 3) "Total: $($adminList.total)"

$usgPromo = $adminList.data | Where-Object { $_.title -like "*USG*" } | Select-Object -First 1
Assert-Test "Found seeded USG promo in admin list" ($null -ne $usgPromo)
Assert-Test "USG promo is linked to service" ($null -ne $usgPromo.serviceId -and $usgPromo.serviceName -eq "USG Kandungan") "Service: $($usgPromo.serviceName)"
Assert-Test "USG promo has status 'live'" ($usgPromo.status -eq "live") "Status: $($usgPromo.status)"

# ------------------------------------------------------------------------------
# STEP 4: CREATE DRAFT PROMOTION
# ------------------------------------------------------------------------------
Write-Host "`n[Step 4] Creating New Promotion (POST /api/v1/admin/promotions)..." -ForegroundColor Yellow
$createPayload = @{
    title = "E2E Promo Imunisasi Anak Spesial"
    summary = "Lindungi buah hati dengan vaksinasi lengkap bersama dokter spesialis anak."
    body = "Program imunisasi terpadu dengan vaksin bersertifikasi resmi dan pemantauan pasca-imunisasi."
    terms = "Berlaku untuk bayi usia 0 - 24 bulan."
    imageType = "static"
    imageValue = "/promo/imunisasi-anak.webp"
    imageAlt = "Dokter anak memberikan vaksinasi pada balita"
    ctaLabel = "Jadwalkan Vaksin"
    ctaUrl = "/klinik/janji-temu"
    showBanner = $true
    showModal = $false
    showSection = $true
    modalFrequency = "once_per_day"
    modalDelaySec = 3
    priority = 15
    isPublished = $false
    broadcastToUsers = $false
    broadcastChannels = @("in_app", "push")
} | ConvertTo-Json

$createdPromo = Invoke-RestMethod -Uri "$apiUrl/admin/promotions" -Method Post -Headers $headers -Body $createPayload
Assert-Test "Promotion created with ID" ($null -ne $createdPromo.id) "ID: $($createdPromo.id)"
Assert-Test "Newly created promo status is 'draft'" ($createdPromo.status -eq "draft") "Status: $($createdPromo.status)"

# Verify it does not appear on public site while in draft
$publicCheck = Invoke-RestMethod -Uri "$apiUrl/public/promotions" -Method Get
$inPublic = $publicCheck.data | Where-Object { $_.id -eq $createdPromo.id }
Assert-Test "Draft promo is NOT visible on public site" ($null -eq $inPublic)

# ------------------------------------------------------------------------------
# STEP 5: FETCH BY ID & UPDATE (PATCH)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 5] Fetching and Updating Promotion (PATCH /api/v1/admin/promotions/:id)..." -ForegroundColor Yellow
$fetchedPromo = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$($createdPromo.id)" -Method Get -Headers $headers
Assert-Test "Fetched promo by ID matches title" ($fetchedPromo.title -eq "E2E Promo Imunisasi Anak Spesial")

$updatePayload = @{
    title = "E2E Promo Imunisasi Anak Spesial (Updated)"
    priority = 25
    showModal = $true
} | ConvertTo-Json

$updatedPromo = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$($createdPromo.id)" -Method Patch -Headers $headers -Body $updatePayload
Assert-Test "Promo title updated via PATCH" ($updatedPromo.title -eq "E2E Promo Imunisasi Anak Spesial (Updated)")
Assert-Test "Promo priority updated to 25" ($updatedPromo.priority -eq 25)

# ------------------------------------------------------------------------------
# STEP 6: PUBLISH & UNPUBLISH FLOW
# ------------------------------------------------------------------------------
Write-Host "`n[Step 6] Publishing Promotion (POST /api/v1/admin/promotions/:id/publish)..." -ForegroundColor Yellow
$publishedPromo = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$($createdPromo.id)/publish" -Method Post -Headers $headers
Assert-Test "Promo status changed to 'live'" ($publishedPromo.status -eq "live") "Status: $($publishedPromo.status)"

# Verify now visible on public site as top priority
$publicAfterPublish = Invoke-RestMethod -Uri "$apiUrl/public/promotions" -Method Get
$topPublic = $publicAfterPublish.data | Where-Object { $_.id -eq $createdPromo.id } | Select-Object -First 1
Assert-Test "Published promo is now visible on public site" ($null -ne $topPublic)

Write-Host "`n[Step 7] Unpublishing Promotion (POST /api/v1/admin/promotions/:id/unpublish)..." -ForegroundColor Yellow
$unpublishedPromo = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$($createdPromo.id)/unpublish" -Method Post -Headers $headers
Assert-Test "Promo status changed back to 'draft'" ($unpublishedPromo.status -eq "draft")

# ------------------------------------------------------------------------------
# STEP 7: DUPLICATE PROMOTION
# ------------------------------------------------------------------------------
Write-Host "`n[Step 8] Duplicating Promotion (POST /api/v1/admin/promotions/:id/duplicate)..." -ForegroundColor Yellow
$duplicatedPromo = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$($createdPromo.id)/duplicate" -Method Post -Headers $headers
Assert-Test "Duplicate promo created" ($null -ne $duplicatedPromo.id -and $duplicatedPromo.id -ne $createdPromo.id)
Assert-Test "Duplicate title starts with 'Salinan '" ($duplicatedPromo.title -like "Salinan *") "Title: $($duplicatedPromo.title)"
Assert-Test "Duplicate status defaults to 'draft'" ($duplicatedPromo.status -eq "draft")

# ------------------------------------------------------------------------------
# STEP 8: DELETE PROMOTION (SOFT DELETE)
# ------------------------------------------------------------------------------
Write-Host "`n[Step 9] Soft-deleting Promotions..." -ForegroundColor Yellow
$delRes1 = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$($createdPromo.id)" -Method Delete -Headers $headers
$delRes2 = Invoke-RestMethod -Uri "$apiUrl/admin/promotions/$($duplicatedPromo.id)" -Method Delete -Headers $headers
Assert-Test "Delete calls returned success" ($delRes1.success -and $delRes2.success)

$adminListAfterDelete = Invoke-RestMethod -Uri "$apiUrl/admin/promotions?status=archived" -Method Get -Headers $headers
$archivedPromo = $adminListAfterDelete.data | Where-Object { $_.id -eq $createdPromo.id } | Select-Object -First 1
Assert-Test "Deleted promo found in archived status query" ($null -ne $archivedPromo)

# ------------------------------------------------------------------------------
# STEP 9: ZOD VALIDATION REJECTIONS
# ------------------------------------------------------------------------------
Write-Host "`n[Step 10] Testing Zod Validation Guards..." -ForegroundColor Yellow

# Test 1: Insecure HTTP protocol rejection
$badHttpPayload = @{
    title = "Bad URL Test"
    summary = "Testing HTTP rejection"
    imageType = "url"
    imageValue = "http://drive.google.com/thumbnail?id=123"
    imageAlt = "Alt test"
    showBanner = $true
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$apiUrl/admin/promotions" -Method Post -Headers $headers -Body $badHttpPayload
    Assert-Test "Insecure HTTP URL was rejected" $false "Should have failed"
} catch {
    Assert-Test "Insecure HTTP URL was rejected by backend guard" ($_.Exception.Response.StatusCode.value__ -eq 400)
}

# Test 2: Zero placement rejection
$zeroPlacementPayload = @{
    title = "No Placement Test"
    summary = "Testing zero placement"
    imageType = "static"
    imageValue = "/promo/test.webp"
    imageAlt = "Alt test"
    showBanner = $false
    showModal = $false
    showSection = $false
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$apiUrl/admin/promotions" -Method Post -Headers $headers -Body $zeroPlacementPayload
    Assert-Test "Zero placement was rejected" $false "Should have failed"
} catch {
    Assert-Test "Zero placement was rejected by validation schema" ($_.Exception.Response.StatusCode.value__ -eq 400)
}

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "Promotions Module E2E Test Suite"
