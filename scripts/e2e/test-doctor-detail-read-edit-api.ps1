. "$PSScriptRoot\common.ps1"

Write-Host "`n==============================================================================" -ForegroundColor Cyan
Write-Host " E2E TEST: Doctor & Midwife Detail Profile (Read, Edit & Active Switcher) API" -ForegroundColor Cyan
Write-Host "==============================================================================" -ForegroundColor Cyan

Reset-TestCounters

try {
    # 1. Pastikan API siap
    Wait-E2EApiReady

    # 2. Login sebagai Administrator
    $adminSession = Login-Admin
    $headers = $adminSession.headers
    $apiBase = Get-E2EApiBaseUrl

    Assert-Test "Admin login berhasil" ($adminSession.token.Length -gt 0) "Token diperoleh"

    # 3. Ambil daftar jadwal dokter
    $listRes = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules" -Method Get -Headers $headers
    $doctors = $listRes.data.doctors
    Assert-Test "Daftar dokter berhasil diambil" ($doctors.Count -gt 0) "Total dokter: $($doctors.Count)"

    # Pilih dokter target
    $targetDoc = $doctors | Where-Object { $_.nama_dokter -like "*Santoso*" -or $_.nama_dokter -like "*Laras*" } | Select-Object -First 1
    if (-not $targetDoc) {
        $targetDoc = $doctors[0]
    }
    $practitionerId = $targetDoc.id
    Write-Host " [INFO] Target Praktisi ID: $practitionerId ($($targetDoc.nama_dokter))" -ForegroundColor Gray

    # 4. Uji GET :id/profile (Read Profile Lengkap)
    $profileRes = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules/$practitionerId/profile" -Method Get -Headers $headers
    Assert-Test "GET /admin/doctor-schedules/:id/profile mengembalikan data profil" ($null -ne $profileRes.id) "Staff ID: $($profileRes.id)"
    Assert-Test "Profil memuat nama lengkap staf" ($profileRes.fullName.Length -gt 0) "Nama: $($profileRes.fullName)"
    Assert-Test "Profil memuat staffType klinis ('doctor' atau 'midwife')" ($profileRes.staffType -in @('doctor', 'midwife')) "StaffType: $($profileRes.staffType)"

    # 5. Simpan status awal untuk restorasi
    $originalActive = $profileRes.isActive
    $originalName = $profileRes.fullName

    # 6. Uji PATCH :id/profile (Edit Onboarding Data & Deactivate Switcher)
    $testNik = "3201012345678901"
    $testLicense = "SIP.446/999/DISKES/2026"
    $testPhone = "081299887766"

    $patchPayload = @{
        nationalId = $testNik
        birthPlace = "Bogor"
        birthDate = "1992-08-17"
        gender = "female"
        phoneNumber = $testPhone
        licenseNumber = $testLicense
        isActive = $false
        address = @{
            provinceCode = "32"
            provinceName = "JAWA BARAT"
            regencyCode = "3201"
            regencyName = "KABUPATEN BOGOR"
            districtCode = "320101"
            districtName = "CIBINONG"
            villageCode = "3201012001"
            villageName = "CIRANJANG"
            line1 = "Jl. Harapan Raya No. 42"
            fullAddress = "Jl. Harapan Raya No. 42, Ciranjang, Cibinong, Kabupaten Bogor, Jawa Barat"
        }
    } | ConvertTo-Json -Depth 5

    $patchRes = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules/$practitionerId/profile" -Method Patch -Body $patchPayload -Headers $headers -ContentType "application/json"
    Assert-Test "PATCH /admin/doctor-schedules/:id/profile berhasil" ($null -ne $patchRes) "Pembaruan profil tersimpan"
    Assert-Test "Field NIK kependudukan tersimpan" ($patchRes.nationalId -eq $testNik) "NIK: $($patchRes.nationalId)"
    Assert-Test "Field SIP/STR tersimpan" ($patchRes.licenseNumber -eq $testLicense) "SIP: $($patchRes.licenseNumber)"
    Assert-Test "Field Domisili alamat tersimpan" ($patchRes.address.line1 -eq "Jl. Harapan Raya No. 42") "Line1: $($patchRes.address.line1)"
    Assert-Test "Status operasional isActive berubah menjadi false" ($patchRes.isActive -eq $false) "isActive: $($patchRes.isActive)"

    # 7. Verifikasi efek deaktifasi pada list jadwal dokter (harus menjadi PENDING)
    $listAfterDeactivate = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules" -Method Get -Headers $headers
    $docAfterDeactivate = $listAfterDeactivate.data.doctors | Where-Object { $_.id -eq $practitionerId }
    Assert-Test "Kartu jadwal dokter otomatis berstatus PENDING saat non-aktif" ($docAfterDeactivate.status_dokter -eq "PENDING") "Status: $($docAfterDeactivate.status_dokter)"
    Assert-Test "is_accepting_appointments tersinkronisasi menjadi false" ($docAfterDeactivate.is_accepting_appointments -eq $false) "isAccepting: $($docAfterDeactivate.is_accepting_appointments)"

    # 8. Uji Re-aktivasi dokter melalui Active Switcher (isActive = true)
    $reactivatePayload = @{
        isActive = $true
        licenseNumber = $testLicense
    } | ConvertTo-Json

    $reactivateRes = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules/$practitionerId/profile" -Method Patch -Body $reactivatePayload -Headers $headers -ContentType "application/json"
    Assert-Test "Re-aktivasi dokter berhasil (isActive = true)" ($reactivateRes.isActive -eq $true) "isActive: $($reactivateRes.isActive)"

    # 9. Verifikasi efek re-aktifasi pada list jadwal dokter (kembali aktif OPEN/CLOSED)
    $listAfterReactivate = Invoke-RestMethod -Uri "$apiBase/admin/doctor-schedules" -Method Get -Headers $headers
    $docAfterReactivate = $listAfterReactivate.data.doctors | Where-Object { $_.id -eq $practitionerId }
    Assert-Test "Kartu dokter tidak lagi berstatus PENDING setelah diaktifkan" ($docAfterReactivate.status_dokter -ne "PENDING") "Status: $($docAfterReactivate.status_dokter)"
    Assert-Test "is_accepting_appointments tersinkronisasi kembali menjadi true" ($docAfterReactivate.is_accepting_appointments -eq $true) "isAccepting: $($docAfterReactivate.is_accepting_appointments)"

} catch {
    Write-Host "`n [FATAL ERROR] $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host " Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    $global:E2EFailCount++
}

Print-TestSummary "E2E Test Doctor & Midwife Detail Profile API"
