$baseUrl = "http://localhost:3001"

# 1. Warm display queue cache
Write-Host "1. Warming display queue cache..."
$display1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/queue/display" -Method Get
Write-Host "   Initial display queue date: $($display1.date)"
$keysBefore = docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 keys "amanah:development:queue:display:*"
Write-Host "   Redis keys after GET: $keysBefore"

# 2. Login as admin
$loginRes = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body '{"email":"admin@amanah.com","password":"secret123"}' -ContentType "application/json"
$token = $loginRes.token
$headers = @{ "Authorization" = "Bearer $token" }

# 3. Get first appointment
$apts = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments" -Method Get -Headers $headers
$targetId = $apts[0].id
Write-Host "2. Mutating appointment $targetId via PATCH /check-in..."

# 4. Trigger mutation
$upd = Invoke-RestMethod -Uri "$baseUrl/api/v1/appointments/$targetId/check-in" -Method Patch -Headers $headers
Write-Host "   New appointment status: $($upd.status)"

# 5. Check Redis keys
$keysAfter = docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 keys "amanah:development:queue:display:*"
Write-Host "3. Redis keys after mutation: $keysAfter"

if ([string]::IsNullOrWhiteSpace($keysAfter)) {
    Write-Host " [PASS] Cache was proactively invalidated by writer!" -ForegroundColor Green
} else {
    Write-Host " [FAIL] Cache key remained in Redis after mutation!" -ForegroundColor Red
    exit 1
}
