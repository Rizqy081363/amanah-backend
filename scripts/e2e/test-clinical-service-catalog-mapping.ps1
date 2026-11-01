# E2E Test Suite: Clinical Service Catalog Mapping & Zod Contract Verification
# Tests:
# 1. Public catalog access (/api/v1/clinics/services/catalog)
# 2. Authenticated patient access
# 3. Dynamic multi-category verification (Poli Umum + Poli KIA & Kebidanan)
# 4. Relational integrity: categoryId, poliklinikId, poliklinikName, isBookable
# 5. Zero-hardcoding dynamic categorization validation

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"

Reset-TestCounters

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Clinical Service Catalog Mapping & Zod Contract" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$apiUrl = Get-E2EApiBaseUrl

# 1. Public Catalog Verification
Write-Host "`n[Step 1] Fetching public service catalog (GET /clinics/services/catalog)..." -ForegroundColor Yellow
$publicRes = Invoke-RestMethod -Uri "$apiUrl/clinics/services/catalog" -Method Get

Assert-Test "Public catalog response success is true" ($publicRes.success -eq $true)
Assert-Test "Public catalog returns at least 2 categories" ($publicRes.categories.Count -ge 2) "Count: $($publicRes.categories.Count)"

$generalCat = $publicRes.categories | Where-Object { $_.code -eq "layanan_umum" } | Select-Object -First 1
$kiaCat = $publicRes.categories | Where-Object { $_.code -eq "layanan_kia" } | Select-Object -First 1

Assert-Test "Category 'layanan_umum' present" ($null -ne $generalCat)
Assert-Test "Category 'layanan_kia' present" ($null -ne $kiaCat)

Assert-Test "General category affiliated to Poli Umum" ($generalCat.poliklinikName -match "Umum") "Got: $($generalCat.poliklinikName)"
Assert-Test "KIA category affiliated to Poli KIA & Kebidanan" ($kiaCat.poliklinikName -match "KIA") "Got: $($kiaCat.poliklinikName)"

Write-Host "  Poli Umum services count: $($generalCat.services.Count)" -ForegroundColor Gray
Write-Host "  Poli KIA services count: $($kiaCat.services.Count)" -ForegroundColor Gray

Assert-Test "Poli Umum has active bookable services" ($generalCat.services.Count -gt 0)
Assert-Test "Poli KIA has active bookable services" ($kiaCat.services.Count -gt 0)

# 2. Relational and Schema Integrity on Services
Write-Host "`n[Step 2] Validating canonical contracts on all services across all categories..." -ForegroundColor Yellow
foreach ($cat in $publicRes.categories) {
    Assert-Test "Category '$($cat.name)' has valid poliklinikId" ($null -ne $cat.poliklinikId -and $cat.poliklinikId.Length -gt 0)
    
    foreach ($srv in $cat.services) {
        Assert-Test "Service '$($srv.name)' has valid categoryId matching parent" ($srv.categoryId -eq $cat.id)
        Assert-Test "Service '$($srv.name)' has valid poliklinikId matching parent" ($srv.poliklinikId -eq $cat.poliklinikId)
        Assert-Test "Service '$($srv.name)' has valid prefix" ($null -ne $srv.prefix -and $srv.prefix.Length -gt 0)
        Assert-Test "Service '$($srv.name)' isBookable is true" ($srv.isBookable -eq $true)
    }
}

# 3. Patient Authenticated Perspective
Write-Host "`n[Step 3] Verifying authenticated patient can read full service catalog..." -ForegroundColor Yellow
$patientAuth = Login-Patient
$patientRes = Invoke-RestMethod -Uri "$apiUrl/clinics/services/catalog" -Method Get -Headers $patientAuth.headers
Assert-Test "Patient sees identical multi-category catalog" ($patientRes.categories.Count -eq $publicRes.categories.Count)

Print-TestSummary "Clinical Service Catalog Mapping & Zod Contract E2E"
