# ==============================================================================
# E2E TEST: PAYROLL MINIMUM THRESHOLD AND ROUNDING INCREMENT VERIFICATION
# ==============================================================================
# Verifikasi aturan bisnis:
# 1. Staf bekerja < 30 menit (misal 1 menit): validatedDurationHours = 0, Upah Rp 0, TIDAK ada payroll entry base_scheduled.
# 2. Staf bekerja >= 30 menit (misal 45 menit): dibulatkan kelipatan 15 menit (0.75 jam), Upah dihitung proporsional.
# 3. Format deskripsi bersih tanpa duplikasi ("jam jam").
# 4. Admin dapat mengubah konfigurasi minBillableShiftMinutes & roundingIncrementMinutes via Web API.
# ==============================================================================

$ErrorActionPreference = "Stop"
$BaseUrl = "http://127.0.0.1:3001/api/v1"

function Assert-Condition($condition, $message) {
    if (-not $condition) {
        Write-Host " [FAIL] $message" -ForegroundColor Red
        throw "Assertion failed: $message"
    } else {
        Write-Host " [PASS] $message" -ForegroundColor Green
    }
}

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: PAYROLL MINIMUM BILLABLE THRESHOLD & DYNAMIC ROUNDING" -ForegroundColor Cyan
Write-Host "==============================================================================`n" -ForegroundColor Cyan

# 1. Dapatkan Token Admin & Staf
Set-Location backend
$adminToken = (bun run db:jwt --email admin@amanah.com --raw).Trim()
$workerToken = (bun run db:jwt --email staff.operasional@amanah.clinic --raw).Trim()

$adminHeaders = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
$workerHeaders = @{ Authorization = "Bearer $workerToken"; "Content-Type" = "application/json" }

# 2. Ambil Profil Budi Santoso (Worker)
$workerId = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -c "SELECT id FROM staff_profiles WHERE user_id = (SELECT id FROM users WHERE email = 'staff.operasional@amanah.clinic');").Trim()
Assert-Condition ($workerId -ne "") "Worker profile resolved: $workerId"

# 3. Pastikan konfigurasi timing aktif adalah minBillable=30, rounding=15
$timingPayload = @{ minBillableShiftMinutes = 30; roundingIncrementMinutes = 15 } | ConvertTo-Json
$timingRes = Invoke-RestMethod -Uri "$BaseUrl/work-policies/attendance-timing" -Method Put -Headers $adminHeaders -Body $timingPayload
Assert-Condition ($timingRes.minBillableShiftMinutes -eq 30) "Active minBillableShiftMinutes set to 30 min"
Assert-Condition ($timingRes.roundingIncrementMinutes -eq 15) "Active roundingIncrementMinutes set to 15 min"

# 4. Bersihkan data presensi & payroll Budi Santoso hari ini
$today = (Get-Date).ToString("yyyy-MM-dd")
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM staff_attendance_records WHERE staff_profile_id = '$workerId' AND attendance_date = '$today';" | Out-Null
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM payroll_entries WHERE staff_profile_id = '$workerId' AND source_type = 'attendance';" | Out-Null
Write-Host " >> Baseline database dibersihkan untuk staf target." -ForegroundColor Gray

# ------------------------------------------------------------------------------
# TEST CASE 1: Kerja 1 Menit (< 30 menit ambang batas)
# ------------------------------------------------------------------------------
Write-Host "`n--- [TEST CASE 1] Presensi Kerja 1 Menit (< Ambang Batas 30 Menit) ---" -ForegroundColor Yellow

# Simulasi Check-in manual via admin
$checkInRes = Invoke-RestMethod -Uri "$BaseUrl/attendance/manual" -Method Post -Headers $adminHeaders -Body (@{
    staffIdOrCode = $workerId
    notes = "Check-in presensi 1 menit"
} | ConvertTo-Json)
$attId = $checkInRes.id
Assert-Condition ($attId -ne $null) "Worker berhasil check-in (ID: $attId)"

# Atur check_in_at ke 1 menit yang lalu secara presisi
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '1 minute' WHERE id = '$attId';" | Out-Null

# Dapatkan QR token checkout
$rotResCo1 = Invoke-RestMethod -Uri "$BaseUrl/attendance/qr/rotate" -Method Post -Headers $adminHeaders -Body "{}"
$qrToken1 = $rotResCo1.qrCodeIdentifier

# Lakukan Checkout
$checkOutRes = Invoke-RestMethod -Uri "$BaseUrl/attendance/checkout" -Method Post -Headers $workerHeaders -Body (@{
    qrToken = $qrToken1
    notes = "Urusan darurat mendadak 1 menit dinas"
} | ConvertTo-Json)

Assert-Condition ([double]$checkOutRes.validatedDurationHours -eq 0.0) "validatedDurationHours = 0.00 (dibawah ambang minimum 30 menit)"

# Verifikasi tidak ada payroll entry yang dibuat untuk shift 1 menit ini
$payrollCheck = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -c "SELECT COUNT(*) FROM payroll_entries WHERE source_id = '$attId';") | Out-String
$entryCount = [int]($payrollCheck.Trim())
Assert-Condition ($entryCount -eq 0) "Zero-billable shift: Tepat 0 payroll entry dibuat di database (TIDAK ADA Rp 1.500)"

# ------------------------------------------------------------------------------
# TEST CASE 2: Kerja 45 Menit (>= 30 menit ambang batas, kelipatan 15 menit)
# ------------------------------------------------------------------------------
Write-Host "`n--- [TEST CASE 2] Presensi Kerja 45 Menit (Dibulatkan ke 0.75 Jam) ---" -ForegroundColor Yellow

# Bersihkan lagi
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "DELETE FROM staff_attendance_records WHERE staff_profile_id = '$workerId' AND attendance_date = '$today';" | Out-Null

$checkInRes2 = Invoke-RestMethod -Uri "$BaseUrl/attendance/manual" -Method Post -Headers $adminHeaders -Body (@{
    staffIdOrCode = $workerId
    notes = "Check-in presensi 48 menit"
} | ConvertTo-Json)
$attId2 = $checkInRes2.id

# Set check_in_at ke 48 menit yang lalu (48 menit dibulatkan ke interval 15 menit = 45 menit = 0.75 jam)
docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -c "UPDATE staff_attendance_records SET check_in_at = NOW() - INTERVAL '48 minutes' WHERE id = '$attId2';" | Out-Null

# Dapatkan QR token checkout kedua
$rotResCo2 = Invoke-RestMethod -Uri "$BaseUrl/attendance/qr/rotate" -Method Post -Headers $adminHeaders -Body "{}"
$qrToken2 = $rotResCo2.qrCodeIdentifier

$checkOutRes2 = Invoke-RestMethod -Uri "$BaseUrl/attendance/checkout" -Method Post -Headers $workerHeaders -Body (@{
    qrToken = $qrToken2
    notes = "Pulang setelah 48 menit tugas"
} | ConvertTo-Json)

Assert-Condition ([double]$checkOutRes2.validatedDurationHours -eq 0.75) "validatedDurationHours = 0.75 jam (48 min dibulatkan ke interval 15 min = 45 min)"

# Verifikasi payroll entry berhasil dibuat dengan nilai proporsional
$rateWorker = 75000.0 # Tarif worker = Rp 75.000 / jam
$expectedAmount = 0.75 * $rateWorker # = Rp 56.250

$entryRow = (docker exec -i backend-postgres-1 psql -U amanah -d amanah_healthcare -t -A -F "|" -c "SELECT quantity_hours, amount, description FROM payroll_entries WHERE source_id = '$attId2';") | Out-String
$parts = $entryRow.Trim().Split("|")
$savedHours = [double]$parts[0]
$savedAmount = [double]$parts[1]
$savedDesc = $parts[2]

Assert-Condition ($savedHours -eq 0.75) "Payroll quantity_hours = 0.75"
Assert-Condition ($savedAmount -eq $expectedAmount) "Payroll amount = Rp 56.250 (0.75 x Rp 75.000)"
Assert-Condition ($savedDesc -notmatch "jam jam") "Deskripsi bersih tanpa duplikasi 'jam jam': '$savedDesc'"
Assert-Condition ($savedDesc -match "0\.8 jam @ Rp75\.000/jam" -or $savedDesc -match "0\.75 jam @ Rp75\.000/jam") "Format deskripsi valid: '$savedDesc'"

# ------------------------------------------------------------------------------
# TEST CASE 3: Admin Web Dashboard API Eksternal
# ------------------------------------------------------------------------------
Write-Host "`n--- [TEST CASE 3] Pengujian Admin Endpoint Web Policies ---" -ForegroundColor Yellow

# Uji GET /work-policies/current
$currentPolicy = Invoke-RestMethod -Uri "$BaseUrl/work-policies/current" -Headers $adminHeaders
Assert-Condition ($currentPolicy.timing.minBillableShiftMinutes -eq 30) "GET /work-policies/current mengembalikan minBillableShiftMinutes = 30"
Assert-Condition ($currentPolicy.timing.roundingIncrementMinutes -eq 15) "GET /work-policies/current mengembalikan roundingIncrementMinutes = 15"

# Uji PUT /work-policies/attendance-timing dengan validasi
$invalidUpdate = $false
try {
    # Nilai di luar jangkauan (min < 0)
    Invoke-RestMethod -Uri "$BaseUrl/work-policies/attendance-timing" -Method Put -Headers $adminHeaders -Body (@{
        minBillableShiftMinutes = -5
        roundingIncrementMinutes = 15
    } | ConvertTo-Json)
} catch {
    $invalidUpdate = $true
}
Assert-Condition ($invalidUpdate -eq $true) "Zod / Class-validator menolak nilai negatif untuk minBillableShiftMinutes"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " ALL PAYROLL MINIMUM THRESHOLD & ROUNDING VERIFICATIONS PASSED!" -ForegroundColor Green
Write-Host "==============================================================================`n" -ForegroundColor Cyan
