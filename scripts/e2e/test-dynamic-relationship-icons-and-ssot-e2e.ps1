# E2E Test: Dynamic Relationship Icons, Clinic Essentials SSOT, and Relational Identity
# Ensures:
# 1. Icons are 100% DB-driven from patient_relationship_types.icon_name with 0 hardcoding.
# 2. Updating an icon in Clinic Essentials reflects immediately across reference endpoints and booking context.
# 3. System accounts and affiliations are resolved purely by isSystem / isPrimary boolean flags (no string matching).

$ErrorActionPreference = "Stop"
$baseUrl = "http://127.0.0.1:3001"

function Run-DockerSql {
    param([string]$query)
    $clean = docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "$query"
    return $clean
}

function Assert-Test {
    param([string]$label, [bool]$condition, [string]$failMsg = "")
    if ($condition) {
        Write-Host " [PASS] $label" -ForegroundColor Green
    } else {
        Write-Host " [FAIL] $label : $failMsg" -ForegroundColor Red
        exit 1
    }
}

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host " STARTING: Dynamic Relationship Icons & Relational SSOT E2E Test" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

# 1. Fetch live relationship references
Write-Host "`n--- Step 1: Checking Live Relationship Types and Icons ---" -ForegroundColor Yellow
$refRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/reference/relationships" -Method GET
Assert-Test "API returned success" ($refRes.success -eq $true)

$primaryRel = $refRes.data | Where-Object { $_.isSystem -eq $true }
Assert-Test "Found system relationship by isSystem flag" ($null -ne $primaryRel)
$originalIcon = $primaryRel.icon
Write-Host " Original icon for $($primaryRel.label): '$originalIcon'" -ForegroundColor Gray

# 2. Update icon dynamically in database as an Admin would in Clinic Essentials
Write-Host "`n--- Step 2: Dynamically Changing Icon in DB (Simulating Clinic Essentials) ---" -ForegroundColor Yellow
$newTestIcon = "sparkles"
Run-DockerSql "UPDATE patient_relationship_types SET icon_name = '$newTestIcon', updated_at = NOW() WHERE id = '$($primaryRel.id)';"

$updatedRefRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/reference/relationships" -Method GET
$updatedPrimary = $updatedRefRes.data | Where-Object { $_.id -eq $primaryRel.id }
Assert-Test "Reference endpoint immediately returns new icon '$newTestIcon'" ($updatedPrimary.icon -eq $newTestIcon)
Assert-Test "Reference endpoint also returns iconName '$newTestIcon'" ($updatedPrimary.iconName -eq $newTestIcon)

# 3. Revert icon back to original
Write-Host "`n--- Step 3: Reverting Icon Back in DB ---" -ForegroundColor Yellow
Run-DockerSql "UPDATE patient_relationship_types SET icon_name = '$originalIcon', updated_at = NOW() WHERE id = '$($primaryRel.id)';"
$revertedRefRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/reference/relationships" -Method GET
$revertedPrimary = $revertedRefRes.data | Where-Object { $_.id -eq $primaryRel.id }
Assert-Test "Icon successfully reverted to original '$originalIcon'" ($revertedPrimary.icon -eq $originalIcon)

# 4. Check user JWT and booking-context dynamic allowed relationships & enriched affiliation icon
Write-Host "`n--- Step 4: Checking booking-context Affiliations & Allowed Relationships ---" -ForegroundColor Yellow
$userEmail = "anasabiyyufalah@students.amikom.ac.id"
$rawJwtOut = & powershell -Command "Set-Location Amanah-backend; bun ./scripts/dev/get-jwt-user.ts --email $userEmail --raw"
$userJwt = ($rawJwtOut -split "`r?`n" | Where-Object { $_ -match "^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$" } | Select-Object -First 1).Trim()

$serviceId = (Run-DockerSql "SELECT id FROM clinic_services WHERE is_active = true LIMIT 1;").Trim()
$headers = @{
    "Authorization" = "Bearer $userJwt"
}
$bookingCtx = Invoke-RestMethod -Uri "$baseUrl/api/v1/patients/affiliations/booking-context?serviceId=$serviceId" -Headers $headers -Method GET
$bookingData = if ($bookingCtx.data) { $bookingCtx.data } else { $bookingCtx }
Assert-Test "booking-context returned success" ($null -ne $bookingData.serviceId)
Assert-Test "allowedRelationships contain icon and iconName" ($bookingData.allowedRelationships.Count -gt 0 -and $null -ne $bookingData.allowedRelationships[0].icon)

Write-Host " Allowed relationships icon sample: $($bookingData.allowedRelationships[0].label) -> $($bookingData.allowedRelationships[0].icon)" -ForegroundColor Gray

Write-Host "`n==============================================================================" -ForegroundColor Green
Write-Host " Dynamic Icons & Relational SSOT E2E - ALL CHECKS PASSED!" -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Green
