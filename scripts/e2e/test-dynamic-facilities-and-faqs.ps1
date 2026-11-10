# E2E Test Suite: Dynamic Facilities & FAQs Landing Page & Admin Integration
# Tests:
# 1. Public facilities endpoint (GET /api/v1/clinics/facilities)
# 2. Public FAQs endpoint with path filtering (GET /api/v1/clinics/faqs?path=/fasilitas)
# 3. Admin facilities CRUD (GET, POST, PATCH, DELETE /api/v1/admin/facilities/items)
# 4. Admin FAQs CRUD (GET, POST, PATCH, DELETE /api/v1/admin/facilities/faqs)
# 5. Cache invalidation verification

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"

Reset-TestCounters

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Dynamic Facilities & FAQs (Database & Admin)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# ------------------------------------------------------------------------------
# 1. PUBLIC FACILITIES VERIFICATION
# ------------------------------------------------------------------------------
Write-Host "`n[Step 1] Fetching public facilities (GET /clinics/facilities)..." -ForegroundColor Yellow
$publicFacilities = Invoke-RestMethod -Uri "$apiUrl/clinics/facilities" -Method Get

Assert-Test "Public facilities returns at least 4 items" ($publicFacilities.Count -ge 4) "Count: $($publicFacilities.Count)"

$apotek = $publicFacilities | Where-Object { $_.slug -eq "apotek" } | Select-Object -First 1
$ruangBersalin = $publicFacilities | Where-Object { $_.slug -eq "ruang-persalinan" } | Select-Object -First 1

Assert-Test "Facility 'apotek' is present" ($null -ne $apotek)
Assert-Test "Apotek has valid image URL" ($apotek.imageUrl -match "\.(webp|png|jpg|jpeg)") "Got: $($apotek.imageUrl)"
Assert-Test "Apotek has valid CTA URL" ($apotek.ctaUrl.Length -gt 0) "Got: $($apotek.ctaUrl)"

Assert-Test "Facility 'ruang-persalinan' is present" ($null -ne $ruangBersalin)
Assert-Test "Ruang Persalinan linked to canonical service" ($ruangBersalin.serviceName -match "Persalinan") "Got: $($ruangBersalin.serviceName)"

# ------------------------------------------------------------------------------
# 2. PUBLIC FAQS VERIFICATION
# ------------------------------------------------------------------------------
Write-Host "`n[Step 2] Fetching public FAQs for /fasilitas (GET /clinics/faqs?path=/fasilitas)..." -ForegroundColor Yellow
$publicFaqs = Invoke-RestMethod -Uri "$apiUrl/clinics/faqs?path=/fasilitas" -Method Get

Assert-Test "Public FAQs for /fasilitas returns at least 6 items" ($publicFaqs.Count -ge 6) "Count: $($publicFaqs.Count)"

$generalFaq = $publicFaqs | Where-Object { $_.category -eq "general" } | Select-Object -First 1
$facilityFaq = $publicFaqs | Where-Object { $_.category -eq "fasilitas" } | Select-Object -First 1

Assert-Test "General FAQ appears in /fasilitas" ($null -ne $generalFaq)
Assert-Test "Fasilitas-specific FAQ appears in /fasilitas" ($null -ne $facilityFaq)
Assert-Test "FAQ solutionSteps is an array with at least 1 step" ($facilityFaq.solutionSteps.Count -ge 1)

# ------------------------------------------------------------------------------
# 3. ADMIN FACILITIES CRUD
# ------------------------------------------------------------------------------
Write-Host "`n[Step 3] Admin facilities lifecycle (GET, POST, PATCH, DELETE)..." -ForegroundColor Yellow
$admin = Login-Admin
$adminFacilities = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/items" -Method Get -Headers $admin.headers

Assert-Test "Admin can retrieve all facilities" ($adminFacilities.Count -ge 4) "Count: $($adminFacilities.Count)"

# CREATE with auto displayOrder (displayOrder omitted)
$testSlug = "lab-e2e-$(Get-Date -Format 'HHmmss')"
$newFacilityPayload = @{
    title = "Laboratorium Klinik Modern E2E"
    slug = $testSlug
    summary = "Pemeriksaan darah lengkap dan laboratorium diagnostik cepat."
    imageUrl = "/healthcare/assets/images/fasilitas-lab.webp"
    ctaUrl = "/kontak"
    isPublished = $true
} | ConvertTo-Json

$createdFacility = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/items" -Method Post -Body $newFacilityPayload -Headers $admin.headers
Assert-Test "Created facility has valid ID" ($null -ne $createdFacility.id -and $createdFacility.id.Length -gt 0)
Assert-Test "Created facility has correct slug" ($createdFacility.slug -eq $testSlug)
Assert-Test "Created facility auto-assigned displayOrder at end (> 4)" ($createdFacility.displayOrder -gt 4) "Got: $($createdFacility.displayOrder)"

$createdFacilityId = $createdFacility.id

# BULK DEACTIVATE FACILITY
$bulkDeactivatePayload = @{
    resource = "facilities"
    action = "deactivate"
    ids = @($createdFacilityId)
} | ConvertTo-Json

$bulkDeactivateRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Body $bulkDeactivatePayload -Headers $admin.headers
Assert-Test "Bulk deactivate facility succeeded" ($bulkDeactivateRes.success -eq $true)

# Verify deactivated
$adminItemsList = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/items" -Method Get -Headers $admin.headers
$checkFacilityAfterBulk = $adminItemsList | Where-Object { $_.id -eq $createdFacilityId } | Select-Object -First 1
Assert-Test "Facility is deactivated after bulk action" ([bool]($checkFacilityAfterBulk.isPublished -eq $false))

# BULK DELETE FACILITY
$bulkDeletePayload = @{
    resource = "facilities"
    action = "delete"
    ids = @($createdFacilityId)
} | ConvertTo-Json

$bulkDeleteRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Body $bulkDeletePayload -Headers $admin.headers
Assert-Test "Bulk delete facility succeeded" ($bulkDeleteRes.success -eq $true)

# Verify deletion
$adminFacilitiesAfter = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/items" -Method Get -Headers $admin.headers
$deletedCheck = $adminFacilitiesAfter | Where-Object { $_.id -eq $createdFacilityId }
Assert-Test "Facility was removed from database via bulk delete" ($null -eq $deletedCheck)

# ------------------------------------------------------------------------------
# 4. ADMIN FAQS CRUD
# ------------------------------------------------------------------------------
Write-Host "`n[Step 4] Admin FAQs lifecycle (GET, POST, PATCH, DELETE)..." -ForegroundColor Yellow
$adminFaqs = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/faqs" -Method Get -Headers $admin.headers
Assert-Test "Admin can retrieve all FAQs" ($adminFaqs.Count -ge 16) "Count: $($adminFaqs.Count)"

# CREATE FAQ with auto displayOrder (displayOrder omitted)
$newFaqPayload = @{
    category = "fasilitas"
    title = "Apakah laboratorium buka pada hari libur? (E2E Test)"
    solutionSteps = @("Ya, laboratorium siaga 24 jam untuk kasus gawat darurat.")
    paths = @("/fasilitas", "/kontak")
    isPublished = $true
} | ConvertTo-Json

$createdFaq = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/faqs" -Method Post -Body $newFaqPayload -Headers $admin.headers
Assert-Test "Created FAQ has valid ID" ($null -ne $createdFaq.id -and $createdFaq.id.Length -gt 0)
Assert-Test "Created FAQ paths contains /fasilitas" ($createdFaq.paths -contains "/fasilitas")
Assert-Test "Created FAQ auto-assigned displayOrder at end (> 16)" ($createdFaq.displayOrder -gt 16) "Got: $($createdFaq.displayOrder)"

$createdFaqId = $createdFaq.id

# BULK DEACTIVATE FAQ
$bulkDeactivateFaqPayload = @{
    resource = "faqs"
    action = "deactivate"
    ids = @($createdFaqId)
} | ConvertTo-Json

$bulkDeactivateFaqRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Body $bulkDeactivateFaqPayload -Headers $admin.headers
Assert-Test "Bulk deactivate FAQ succeeded" ($bulkDeactivateFaqRes.success -eq $true)

# Verify deactivated
$adminFaqsList = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/faqs" -Method Get -Headers $admin.headers
$checkFaqAfterBulk = $adminFaqsList | Where-Object { $_.id -eq $createdFaqId } | Select-Object -First 1
Assert-Test "FAQ is deactivated after bulk action" ($checkFaqAfterBulk.isPublished -eq $false) "Got isPublished: $($checkFaqAfterBulk.isPublished)"

# BULK DELETE FAQ
$bulkDeleteFaqPayload = @{
    resource = "faqs"
    action = "delete"
    ids = @($createdFaqId)
} | ConvertTo-Json

$bulkDeleteFaqRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Body $bulkDeleteFaqPayload -Headers $admin.headers
Assert-Test "Bulk delete FAQ succeeded" ($bulkDeleteFaqRes.success -eq $true)

# Verify deletion
$adminFaqsAfter = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/faqs" -Method Get -Headers $admin.headers
$deletedFaqCheck = $adminFaqsAfter | Where-Object { $_.id -eq $createdFaqId }
Assert-Test "FAQ was removed from database via bulk delete" ($null -eq $deletedFaqCheck)

# ------------------------------------------------------------------------------
# SUMMARY
# ------------------------------------------------------------------------------
Print-TestSummary "Dynamic Facilities & FAQs Landing Page & Admin E2E"
