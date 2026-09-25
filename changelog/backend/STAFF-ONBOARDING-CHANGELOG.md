# Changelog & Frontend Delegation: Staff Onboarding & Role Selection Paradigm

**Repository:** Amanah Healthcare Backend (`amanah-backend`)  
**Target:** Flutter Mobile Application Engineering Team  
**Date:** 2026-09-20  
**Status:** Production-Ready & Verified Live in Docker Container  

---

## 1. Executive Summary & Root Cause Investigation

### 1.1. Hasil Investigasi Akun `zikriahmadamikom@gmail.com`
Berdasarkan investigasi menyeluruh pada basis data PostgreSQL (`users`, `user`, `account`, `session`) dan log kontainer backend:
1. **Tidak Ada Data Masuk:** Akun `zikriahmadamikom@gmail.com` sama sekali tidak ditemukan pada tabel database manapun.
2. **Tidak Ada Request Mencapai Backend:** Log kontainer API (`amanah-healthcare-backend-api-1`) membuktikan tidak ada HTTP request masuk yang membawa payload atau header dengan email tersebut.

### 1.2. Mengapa Hal Ini Terjadi di Flutter?
Terdapat 2 (dua) penyebab utama di sisi klien mobile:
1. **Network Loopback di Android Emulator:**  
   Di Android Emulator, `http://localhost:3001` merujuk ke emulator itu sendiri (127.0.0.1 lokal Android), **bukan** ke mesin host tempat Docker berjalan. Android Emulator **wajib** menggunakan alamat:
   ```text
   http://10.0.2.2:3001/api/v1
   ```
   *(Untuk iOS Simulator gunakan `http://localhost:3001/api/v1`, untuk Physical Device gunakan IP LAN PC seperti `http://192.168.x.x:3001/api/v1`).*

2. **Konfigurasi `serverClientId` Google Sign-In:**  
   Jika menggunakan Google Sign-In di Flutter, plugin `google_sign_in` memerlukan konfigurasi `serverClientId` (OAuth 2.0 Web Client ID) agar menghasilkan `idToken` yang valid untuk dikirim ke backend.

---

## 2. Paradigma Role: Internal Staff & Onboarding Flow

Amanah Healthcare adalah aplikasi internal operasional klinis untuk:
* **Dokter** (`doctor`)
* **Bidan** (`midwife`)
* **Staf / Pekerja Administrasi** (`worker` / `staff`)

### Masalah Paradigma Sebelumnya
Google OAuth maupun form registrasi biasa hanya memverifikasi identitas pengguna (nama dan email). Google tidak mengetahui apakah pengguna adalah Dokter, Bidan, atau Staf Administrasi. Sebelumnya, semua pendaftar baru secara bawaan (default) hanya mendapat peran `patient` tanpa profil staf (`staff_profiles`), sehingga router/guard di Flutter bingung dan gagal mengarahkan (redirect) ke homepage.

### Solusi yang Diterapkan di Backend
Backend kini telah mengimplementasikan **Staff Onboarding & Role Selection Architecture**:
1. Setiap endpoint autentikasi (`/api/v1/auth/email/login`, `/api/v1/auth/me`, `/api/v1/auth/refresh`) sekarang mengembalikan flag:
   ```json
   "needsOnboarding": true
   ```
   Flag ini bernilai `true` apabila pengguna bukan `ADMIN` dan belum memiliki profil staf (`staff === null`).
2. Disediakan endpoint baru:
   ```http
   POST /api/v1/auth/onboarding/staff
   ```
   Untuk memilih peran klinis dan melengkapi profil staf pertama kali.
3. Setelah onboarding selesai:
   * `systemRole` berubah menjadi `"STAF"`.
   * `role.code` menjadi `"staff_doctor"`, `"staff_midwife"`, atau `"staff_worker"`.
   * `needsOnboarding` berubah menjadi `false`.
   * Data `staff` terhidrasi lengkap dengan `practitionerId`, `poliklinikId`, `fullName`, dan `profession`.

---

## 3. Spesifikasi Kontrak API Baru

### 3.1. Endpoint Onboarding Staf
* **Method:** `POST`
* **URL Path:** `/api/v1/auth/onboarding/staff`
* **Authentication Guard:** `HybridAuthGuard` (Mendukung `Authorization: Bearer <JWT_TOKEN>` atau Better Auth Session Cookie/Header)
* **Headers:**
  ```http
  Content-Type: application/json
  Authorization: Bearer <access_token>
  ```

#### Request Payload (`AuthStaffOnboardingDto`)
```json
{
  "role": "doctor",
  "fullName": "dr. Zikri Ahmad, Sp.A",
  "phoneNumber": "+6281234567890",
  "staffCode": "STF-DOK-099",
  "profession": "Dokter Spesialis Anak",
  "poliklinikId": "b18b4e7c-b6fa-4993-8025-a13437e2311f",
  "licenseNumber": "SIP.446/123/DISKES/2026"
}
```

| Field | Tipe | Wajib? | Keterangan & Contoh |
| :--- | :--- | :---: | :--- |
| `role` | `string` | **Ya** | Pilihan: `'doctor'`, `'midwife'`, `'worker'`, `'staff'` |
| `fullName` | `string` | **Ya** | Nama lengkap staf beserta gelar (cth: `"dr. Zikri Ahmad, Sp.A"`) |
| `phoneNumber` | `string` | Tidak | Nomor telepon/WhatsApp staf |
| `staffCode` | `string` | Tidak | NIP / ID Pegawai klinik (dibuat otomatis jika kosong) |
| `profession` | `string` | Tidak | Jabatan/profesi spesifik (cth: `"Dokter Umum"`, `"Bidan Pelaksana"`) |
| `poliklinikId` | `string (UUID)` | Tidak | ID Unit layanan utama |
| `licenseNumber` | `string` | Tidak | Nomor SIP/STR (khusus untuk dokter atau bidan) |

---

### 3.2. Response Sukses (`200 OK`)
Mengembalikan objek profil pengguna lengkap yang telah diperbarui:
```json
{
  "id": "fecfcb53-3b5a-429a-a285-42e9111ce43b",
  "name": "dr. Zikri Ahmad, Sp.A",
  "email": "zikriahmadamikom@gmail.com",
  "phone": "+6281234567890",
  "emailVerified": true,
  "status": "active",
  "systemRole": "STAF",
  "role": {
    "id": "7c3f9104-517b-40fa-869f-4318357064d5",
    "code": "staff_doctor",
    "name": "STAF"
  },
  "staff": {
    "id": "21a4613a-77e6-4f7d-a741-c5a1a8b3a100",
    "userId": "fecfcb53-3b5a-429a-a285-42e9111ce43b",
    "practitionerId": "c8ea1b11-26c7-47a4-9669-803476114fdb",
    "poliklinikId": "b18b4e7c-b6fa-4993-8025-a13437e2311f",
    "fullName": "dr. Zikri Ahmad, Sp.A",
    "profession": "Dokter Spesialis Anak",
    "idCardNumber": "STF-DOK-099",
    "photoUrl": null,
    "phoneNumber": "+6281234567890",
    "isActive": true
  },
  "patient": null,
  "needsOnboarding": false
}
```

---

## 4. Panduan Implementasi di Flutter Mobile

### 4.1. Pembaruan Model Klien (`UserModel` / `AuthResponse`)
Tambahkan properti `needsOnboarding` pada model respons pengguna di Flutter:
```dart
class UserModel {
  final String id;
  final String email;
  final String name;
  final String systemRole;
  final bool needsOnboarding;
  final StaffProfileModel? staff;

  UserModel({
    required this.id,
    required this.email,
    required this.name,
    required this.systemRole,
    required this.needsOnboarding,
    this.staff,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] ?? '',
      email: json['email'] ?? '',
      name: json['name'] ?? '',
      systemRole: json['systemRole'] ?? 'PATIENT',
      needsOnboarding: json['needsOnboarding'] ?? false,
      staff: json['staff'] != null ? StaffProfileModel.fromJson(json['staff']) : null,
    );
  }
}
```

---

### 4.2. Routing & Auth Flow di Flutter
Setelah pengguna berhasil melakukan autentikasi (baik lewat Google OAuth maupun Email/Password):
```dart
// Contoh pada AuthNotifier / Bloc / Controller
void handleAuthSuccess(UserModel user) {
  if (user.needsOnboarding) {
    // Arahkan ke layar pemilihan peran & profil staf
    Navigator.pushReplacementNamed(context, '/onboarding/role-selection');
  } else {
    // Pengguna sudah memiliki profil staf lengkap -> masuk ke beranda
    Navigator.pushReplacementNamed(context, '/home');
  }
}
```

---

### 4.3. Implementasi Layar Pemilihan Peran (`RoleSelectionScreen`)
Pada layar onboarding di Flutter:
1. Sediakan pilihan kartu peran:
   * **Dokter** (`role: 'doctor'`)
   * **Bidan** (`role: 'midwife'`)
   * **Staf / Pegawai** (`role: 'worker'`)
2. Formulir data dasar:
   * Nama Lengkap dengan Gelar (dapat mengambil default dari akun Google)
   * Nomor WhatsApp
   * Nomor SIP / STR (jika memilih Dokter atau Bidan)
3. Saat tombol "Simpan & Lanjutkan" ditekan:
   ```dart
   final response = await http.post(
     Uri.parse('$baseUrl/auth/onboarding/staff'),
     headers: {
       'Content-Type': 'application/json',
       'Authorization': 'Bearer $token',
     },
     body: jsonEncode({
       'role': selectedRole, // 'doctor' | 'midwife' | 'worker'
       'fullName': nameController.text.trim(),
       'phoneNumber': phoneController.text.trim(),
       'profession': professionController.text.trim(),
       'licenseNumber': licenseController.text.trim(),
     }),
   );

   if (response.statusCode == 200) {
     final updatedUser = UserModel.fromJson(jsonDecode(response.body));
     // Simpan ke state lokal / secure storage
     authProvider.setUser(updatedUser);
     // Masuk ke beranda klinik
     Navigator.pushReplacementNamed(context, '/home');
   }
   ```

---

## 5. Ringkasan Status Verifikasi Backend

| Komponen | Status | Hasil Verifikasi |
| :--- | :---: | :--- |
| **Pengecekan Akun zikriahmadamikom@gmail.com** | Selesai | DB kosong & tidak ada request masuk ke port 3001 (isu konfigurasi host/emulator). |
| **DTO Validasi `auth-staff-onboarding.dto.ts`** | Selesai | Validasi Enum (`doctor`, `midwife`, `worker`, `staff`) & `@IsNotEmpty` aktif. |
| **Database Transaction di `AuthService`** | Selesai | Sinkronisasi Better Auth `user`, Core `users`, `user_roles`, `staff_profiles`, dan `practitioners`. |
| **Endpoint `POST /api/v1/auth/onboarding/staff`** | Selesai | Terdaftar di controller dengan `HybridAuthGuard`. |
| **Build & Docker Container** | Selesai | Rebuild via `bun` (`oven/bun:1.2.19-alpine`), kontainer `healthy`. |
| **Pengujian Live HTTP (`test_live_onboarding.js`)** | Selesai | Status 200 OK: role berubah ke `staff_doctor`, profil terisi, `needsOnboarding: false`. |
