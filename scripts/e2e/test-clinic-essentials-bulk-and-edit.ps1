# E2E Test Suite: Clinic Essentials Edit, Toggle Active, and Bulk Operations
# Tests:
# 1. Admin authentication & RBAC check (clinics:manage)
# 2. Single item Edit (PATCH) & verification
# 3. Single item Toggle Active/Inactive (PATCH)
# 4. Zod Schema Validation rejection on malformed bulk payloads
# 5. Bulk Deactivate (POST /admin/facilities/bulk) with relational cascading
# 6. Bulk Activate (POST /admin/facilities/bulk)
# 7. Relational conflict guard (deactivating unit-type with active units)
# 8. Full restoration to clean seeded state

$ErrorActionPreference = "Stop"

. "$PSScriptRoot\common.ps1"

Reset-TestCounters

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  E2E Test: Clinic Essentials Edit & Bulk Operations" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Admin Login
Write-Host "`n[Step 1] Logging in as Admin (admin@amanah.com)..." -ForegroundColor Yellow
$adminAuth = Login-Admin
$headers = $adminAuth.headers
$apiUrl = Get-E2EApiBaseUrl

Assert-Test "Admin JWT acquired" ($null -ne $adminAuth.token)

# 2. Fetch all 6 clinic essentials
Write-Host "`n[Step 2] Fetching initial clinic essentials catalogue..." -ForegroundColor Yellow
$unitTypes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/unit-types" -Method Get -Headers $headers
$units = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units" -Method Get -Headers $headers
$rooms = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/rooms" -Method Get -Headers $headers
$categories = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/categories" -Method Get -Headers $headers
$services = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/services" -Method Get -Headers $headers
$forms = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/forms" -Method Get -Headers $headers

Assert-Test "Unit Types returned" ($unitTypes.Count -gt 0) "Count: $($unitTypes.Count)"
Assert-Test "Units returned" ($units.Count -gt 0) "Count: $($units.Count)"
Assert-Test "Rooms returned" ($rooms.Count -gt 0) "Count: $($rooms.Count)"
Assert-Test "Categories returned" ($categories.Count -gt 0) "Count: $($categories.Count)"
Assert-Test "Services returned" ($services.Count -gt 0) "Count: $($services.Count)"
Assert-Test "Forms returned" ($forms.Count -gt 0) "Count: $($forms.Count)"

Write-Host "  Unit Types: $($unitTypes.Count), Units: $($units.Count), Rooms: $($rooms.Count)" -ForegroundColor Gray
Write-Host "  Categories: $($categories.Count), Services: $($services.Count), Forms: $($forms.Count)" -ForegroundColor Gray

# 3. Test Single Item Edit (PATCH)
Write-Host "`n[Step 3] Testing Single Item Edit (PATCH /admin/facilities/units/:id)..." -ForegroundColor Yellow
$targetUnit = $units | Select-Object -First 1
$originalLocation = $targetUnit.location
$testLocation = "Gedung A Lantai 1 (Updated via E2E)"

$patchPayload = @{
    location = $testLocation
} | ConvertTo-Json

$updatedUnit = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units/$($targetUnit.id)" -Method Patch -Headers $headers -Body $patchPayload
Assert-Test "Unit location updated via PATCH" ($updatedUnit.location -eq $testLocation) "Expected: $testLocation, Got: $($updatedUnit.location)"

# Restore unit location immediately
$restorePayload = @{
    location = $originalLocation
} | ConvertTo-Json
$restoredUnit = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units/$($targetUnit.id)" -Method Patch -Headers $headers -Body $restorePayload
Assert-Test "Unit location restored" ($restoredUnit.location -eq $originalLocation)

# 4. Test Single Item Toggle Active / Inactive
Write-Host "`n[Step 4] Testing Single Item Toggle Active (PATCH isActive)..." -ForegroundColor Yellow
$toggleOffPayload = @{
    isActive = $false
} | ConvertTo-Json
$offUnit = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units/$($targetUnit.id)" -Method Patch -Headers $headers -Body $toggleOffPayload
Assert-Test "Unit toggled to Inactive" ($offUnit.isActive -eq $false)

$toggleOnPayload = @{
    isActive = $true
} | ConvertTo-Json
$onUnit = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units/$($targetUnit.id)" -Method Patch -Headers $headers -Body $toggleOnPayload
Assert-Test "Unit toggled back to Active" ($onUnit.isActive -eq $true)

# 5. Test Zod Validation Rejection on Invalid Bulk Request
Write-Host "`n[Step 5] Testing Zod Validation on Bulk Action..." -ForegroundColor Yellow
try {
    $invalidPayload = @{
        resource = "invalid-resource"
        action = "nuke"
        ids = @("not-a-uuid")
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Headers $headers -Body $invalidPayload
    Assert-Test "Invalid bulk action was rejected" $false "Expected 400 Bad Request"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test "Invalid bulk action rejected with 400" ($statusCode -eq 400) "Status: $statusCode"
}

# 6. Test Bulk Deactivation & Cascading Impact
Write-Host "`n[Step 6] Testing Bulk Deactivate on Unit..." -ForegroundColor Yellow
$unitToDeactivate = $units | Where-Object { $_.code -eq "poli_kia" } | Select-Object -First 1
if (-not $unitToDeactivate) {
    $unitToDeactivate = $units[0]
}

$bulkDeactPayload = @{
    resource = "units"
    action = "deactivate"
    ids = [string[]]@($unitToDeactivate.id)
} | ConvertTo-Json

$bulkDeactRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Headers $headers -Body $bulkDeactPayload
Assert-Test "Bulk deactivate succeeded" ($bulkDeactRes.success -eq $true)
Assert-Test "Bulk deactivate affected 1 unit" ($bulkDeactRes.count -eq 1)

# Verify unit state in database
$refetchedUnits = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units" -Method Get -Headers $headers
$deactivatedUnit = $refetchedUnits | Where-Object { $_.id -eq $unitToDeactivate.id }
Assert-Test "Unit is now inactive" ($deactivatedUnit.isActive -eq $false)

# Verify cascading impact: rooms belonging to this unit should also be deactivated
$refetchedRooms = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/rooms" -Method Get -Headers $headers
$childRooms = $refetchedRooms | Where-Object { $_.unitId -eq $unitToDeactivate.id }
foreach ($room in $childRooms) {
    Assert-Test "Child room $($room.name) cascaded to inactive" ($room.isActive -eq $false)
}

# 7. Test Bulk Activation
Write-Host "`n[Step 7] Testing Bulk Activate on Unit..." -ForegroundColor Yellow
$bulkActPayload = @{
    resource = "units"
    action = "activate"
    ids = [string[]]@($unitToDeactivate.id)
} | ConvertTo-Json

$bulkActRes = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Headers $headers -Body $bulkActPayload
Assert-Test "Bulk activate succeeded" ($bulkActRes.success -eq $true)
Assert-Test "Bulk activate affected 1 unit" ($bulkActRes.count -eq 1)

$refetchedUnitsAfterAct = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units" -Method Get -Headers $headers
$reactivatedUnit = $refetchedUnitsAfterAct | Where-Object { $_.id -eq $unitToDeactivate.id }
Assert-Test "Unit is back to active" ($reactivatedUnit.isActive -eq $true)

# Reactivate rooms as well to fully restore state
$childRoomIds = @($childRooms | ForEach-Object { $_.id })
if ($childRoomIds.Count -gt 0) {
    $bulkRoomsActPayload = @{
        resource = "rooms"
        action = "activate"
        ids = [string[]]@($childRoomIds)
    } | ConvertTo-Json
    $null = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Headers $headers -Body $bulkRoomsActPayload
    Write-Host "  Restored $($childRoomIds.Count) child rooms back to active." -ForegroundColor Gray
}

# Reactivate categories as well to fully restore state
$childCategories = @($categories | Where-Object { $_.unitId -eq $unitToDeactivate.id })
$childCategoryIds = @($childCategories | ForEach-Object { $_.id })
if ($childCategoryIds.Count -gt 0) {
    $bulkCatsActPayload = @{
        resource = "categories"
        action = "activate"
        ids = [string[]]@($childCategoryIds)
    } | ConvertTo-Json
    $null = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Headers $headers -Body $bulkCatsActPayload
    Write-Host "  Restored $($childCategoryIds.Count) child categories back to active." -ForegroundColor Gray
}

# 8. Test Relational Conflict Guard (Deactivating unit-type with active units)
Write-Host "`n[Step 8] Testing Conflict Guard on Unit Type..." -ForegroundColor Yellow
$targetUnitType = $unitTypes | Select-Object -First 1
try {
    $deactTypePayload = @{
        resource = "unit-types"
        action = "deactivate"
        ids = @($targetUnitType.id)
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$apiUrl/admin/facilities/bulk" -Method Post -Headers $headers -Body $deactTypePayload
    Assert-Test "Conflict guard prevented unit-type deactivation" $false "Expected 409 Conflict"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test "Conflict guard threw 409 Conflict" ($statusCode -eq 409) "Status: $statusCode"
}

# 9. Final Integrity Verification & Summary
Write-Host "`n[Step 9] Final Verification: Ensuring all seeded data is restored..." -ForegroundColor Yellow
$finalUnits = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/units" -Method Get -Headers $headers
$inactiveUnits = $finalUnits | Where-Object { $_.isActive -eq $false }
Assert-Test "All units are active after test restoration" ($inactiveUnits.Count -eq 0) "Inactive units: $($inactiveUnits.Count)"

$finalCats = Invoke-RestMethod -Uri "$apiUrl/admin/facilities/categories" -Method Get -Headers $headers
$inactiveCats = $finalCats | Where-Object { $_.isActive -eq $false }
Assert-Test "All categories are active after test restoration" ($inactiveCats.Count -eq 0) "Inactive categories: $($inactiveCats.Count)"

Print-TestSummary "Clinic Essentials Edit & Bulk Operations E2E"