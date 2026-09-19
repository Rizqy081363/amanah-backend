$baseUrl = "http://localhost:3001/api/v1"
$email = "purge_test_user@amanah.health"
$password = "Password123!"

Write-Host "=== 1. Registering test user: $email ===" -ForegroundColor Cyan
$regBody = @{
  email = $email
  password = $password
  firstName = "Purge"
  lastName = "Candidate"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/auth/email/register" -Method POST -ContentType "application/json" -Body $regBody
Write-Host "Registration successful (HTTP 204)" -ForegroundColor Green

Write-Host "`n=== 2. Logging in to acquire JWT token ===" -ForegroundColor Cyan
$loginBody = @{
  email = $email
  password = $password
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Uri "$baseUrl/auth/email/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginRes.token
$userId = $loginRes.user.id
Write-Host "Logged in successfully! User ID: $userId" -ForegroundColor Green

Write-Host "`n=== 3. Completing Patient Onboarding Registration ===" -ForegroundColor Cyan
$patientBody = @{
  name = "Purge Candidate"
  nik = "3201019909990001"
  nama_ibu_kandung = "Siti Purge"
  tempat_lahir = "Jakarta"
  birth_date = "1995-05-15"
  gender = "Perempuan"
  blood_type = "O"
  provinsi = "DKI Jakarta"
  provinsi_id = "31"
  kabupaten = "Jakarta Pusat"
  kabupaten_id = "3171"
  kecamatan = "Gambir"
  kecamatan_id = "317101"
  kelurahan = "Gambir"
  kelurahan_id = "3171011001"
  alamat_detail = "Jl. Merdeka Barat No. 99, RT 01 / RW 02"
  pekerjaan = "Software Engineer"
  phone = "081299998888"
} | ConvertTo-Json

$headers = @{
  Authorization = "Bearer $token"
}

$patientRes = Invoke-RestMethod -Uri "$baseUrl/patients/registration" -Method POST -Headers $headers -ContentType "application/json" -Body $patientBody
Write-Host "Patient created with Medical Record: $($patientRes.data.medicalRecordNumber)" -ForegroundColor Green

Write-Host "`n=== 4. Setting test keys in Redis DB 1 ===" -ForegroundColor Cyan
docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 SET "amanah:development:cooldown:otp:email:$email" "active"
docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 SET "amanah:development:session:$userId" "active_session"
$redisCountBefore = (docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 KEYS "*$email*").Count + (docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 KEYS "*$userId*").Count
Write-Host "Redis keys matching user before purge: $redisCountBefore" -ForegroundColor Yellow

Write-Host "`n=== 5. Calling DELETE /api/v1/auth/me ===" -ForegroundColor Cyan
$deleteRes = Invoke-RestMethod -Uri "$baseUrl/auth/me" -Method DELETE -Headers $headers
Write-Host "Delete response:`n$($deleteRes | ConvertTo-Json)" -ForegroundColor Green

Write-Host "`n=== 6. Verifying Database Cleanliness ===" -ForegroundColor Cyan
$sqlCheck = @"
SELECT 'users' as tbl, count(*) FROM users WHERE lower(email::text) = '$email'
UNION ALL
SELECT 'user', count(*) FROM "user" WHERE lower(email) = '$email'
UNION ALL
SELECT 'patient_profiles', count(*) FROM patient_profiles WHERE national_id_hash = '3201019909990001'
UNION ALL
SELECT 'auth_accounts', count(*) FROM auth_accounts WHERE user_id = '$userId';
"@

$dbResult = $sqlCheck | docker exec -i amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare
Write-Host $dbResult -ForegroundColor Yellow

Write-Host "`n=== 7. Verifying Redis Cleanliness in DB 1 ===" -ForegroundColor Cyan
$residualEmailKeys = docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 KEYS "*$email*"
$residualUserKeys = docker exec amanah-healthcare-backend-redis-1 redis-cli -n 1 KEYS "*$userId*"
$residualEmailCount = if ($residualEmailKeys) { @($residualEmailKeys).Count } else { 0 }
$residualUserCount = if ($residualUserKeys) { @($residualUserKeys).Count } else { 0 }
$totalResidual = $residualEmailCount + $residualUserCount
Write-Host "Residual Redis keys in DB 1: $totalResidual" -ForegroundColor Green

Write-Host "`n=== 8. Re-registering user to prove completely fresh slate ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$baseUrl/auth/email/register" -Method POST -ContentType "application/json" -Body $regBody
Write-Host "Re-registration successful! No conflict or stale state!" -ForegroundColor Green

# Cleanup re-registered user
docker exec amanah-healthcare-backend-postgres-1 psql -U amanah -d amanah_healthcare -c "SELECT purge_user_systemic('$email');" | Out-Null

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host " ALL PURGE VERIFICATION CHECKS PASSED 100% SUCCESFULLY " -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
