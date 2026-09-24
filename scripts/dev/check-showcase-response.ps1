$baseUrl = 'http://localhost:3001'
$login = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/email/login" -Method Post -Body (@{ email = 'admin@amanah.com'; password = 'secret123' } | ConvertTo-Json) -ContentType 'application/json'
$headers = @{ "Authorization" = "Bearer $($login.token)" }
$url = "$baseUrl/api/v1/admin/doctor-schedules?date=2026-09-24&limit=10"
$res = Invoke-RestMethod -Uri $url -Method Get -Headers $headers
$res.data.doctors | Select-Object id, nama_dokter, status_dokter, slot_tersedia, kapasitas_per_hari, jadwal_hari_ini, jadwal_praktik_mendatang, slot_terisi_akumulasi, slot_kapasitas_akumulasi, display_akumulasi_slot, is_cuti, cuti_reason | ConvertTo-Json -Depth 5
