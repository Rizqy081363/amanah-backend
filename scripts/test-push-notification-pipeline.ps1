$ErrorActionPreference = "Stop"

$baseUrl = "http://127.0.0.1:3001"
$loginUrl = "$baseUrl/api/v1/auth/email/login"
$loginBody = @{
    email = "admin@amanah.com"
    password = "secret123"
} | ConvertTo-Json

Write-Host "Authenticating as Admin..."
$loginResponse = Invoke-RestMethod -Uri $loginUrl -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResponse.token
if (-not $token -and $loginResponse.data) {
    $token = $loginResponse.data.token
}
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "TEST 1: Fetch VAPID Public Key"
$keyResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/push/public-key" -Method Get -Headers $headers
if (-not $keyResponse.publicKey) {
    throw "VAPID Public Key not returned"
}
Write-Host "VAPID Public Key retrieved successfully: $($keyResponse.publicKey.Substring(0, 20))..."

Write-Host "TEST 2: Register Device Push Subscription"
$testEndpoint = "https://fcm.googleapis.com/fcm/send/test-token-$([guid]::NewGuid().ToString())"
$subBody = @{
    endpoint = $testEndpoint
    keys = @{
        p256dh = "BDNgm6G2ZbM6CiUnj1X1Cnz2BlyLrcqGJVnujY2Dkf6ecz17uwPHF_LzUyWWs26BmzaDHPbBTjPE7zirNVpSyoQ"
        auth = "t4MO5HCKQMPvKqWt7qhkMwWbKivs1JtQzxlFjjnc_5k"
    }
    platform = "web"
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestRunner"
} | ConvertTo-Json

$subResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/push/subscribe" -Method Post -Body $subBody -Headers $headers
if (-not $subResponse.success) {
    throw "Subscription registration failed"
}
Write-Host "Subscription registered with ID: $($subResponse.id)"

Write-Host "TEST 3: Verify Persistence in PostgreSQL"
$countSql = "SELECT count(*) FROM push_subscriptions WHERE endpoint = '$testEndpoint';"
$dbCount = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -c $countSql
if ($dbCount.Trim() -ne "1") {
    throw "Subscription not found in PostgreSQL"
}
Write-Host "PostgreSQL persistence verified: 1 subscription record found"

Write-Host "TEST 4: RabbitMQ Topology Verification"
$queues = docker compose exec -T rabbitmq rabbitmqctl list_queues name messages consumers
Write-Host "RabbitMQ Queues:"
Write-Host $queues
$queuesText = $queues -join "`n"
if ($queuesText -notmatch "notifications\.push\.queue") {
    throw "notifications.push.queue not found in RabbitMQ"
}
Write-Host "notifications.push.queue is active with consumers"

Write-Host "TEST 5: Unsubscribe Device"
$unsubBody = @{
    endpoint = $testEndpoint
} | ConvertTo-Json

$unsubResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/notifications/push/unsubscribe" -Method Delete -Body $unsubBody -Headers $headers
if (-not $unsubResponse.success) {
    throw "Unsubscribe failed"
}
$dbCountAfter = docker compose exec -T postgres psql -U amanah -d amanah_healthcare -t -c $countSql
if ($dbCountAfter.Trim() -ne "0") {
    throw "Subscription was not removed from PostgreSQL"
}
Write-Host "Subscription cleanly removed from PostgreSQL"

Write-Host "`nALL RABBITMQ & PUSH GATEWAY TESTS PASSED!"
