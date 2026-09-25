# Kontrak Integrasi Autentikasi Mobile (Flutter ke Better Auth Backend)

> **Modul:** `authentication`  
> **Versi Kontrak:** `1.0.0`  
> **Target Klien:** Flutter Mobile Application (Staff & Dokter Amanah Healthcare)  
> **Backend Base URL:**  
> - Lingkungan Lokal: `http://10.0.2.2:3001` (Android Emulator) atau `http://localhost:3001` (iOS Simulator / Desktop)  
> - Lingkungan Staging/Produksi: Mengikuti variabel lingkungan `BACKEND_DOMAIN` (misal: `https://api.amanah.health`)  
> **Prefix Routing:** `/api/auth/*` (Better Auth Engine) & `/api/v1/*` (Protected Clinical APIs)

---

## 1. Prinsip Utama & Arsitektur

Backend Amanah Healthcare menggunakan **Better Auth v1.7.5** yang mendukung klien browser maupun klien native secara terpadu.

1. **Tanpa Perubahan Backend:** Backend saat ini sudah sepenuhnya mendukung seluruh kebutuhan mobile staf. Tim mobile tidak perlu meminta endpoint khusus mobile atau perubahan arsitektur.
2. **Bearer Token Transport:** Klien Flutter tidak perlu mengelola cookie browser. Klien menggunakan header standar:
   ```http
   Authorization: Bearer <session_token>
   ```
3. **Penyimpanan Sesi:** Token sesi disimpan secara persisten di penyimpanan terenkripsi perangkat (`flutter_secure_storage`).
4. **Cakupan Khusus Staf:** Aplikasi Flutter ditujukan khusus untuk staf medis (`doctor`, `staff`). Akun dengan peran `patient` ditolak saat proses autentikasi.

---

## 2. Titik Masuk Autentikasi (Authentication Entry Points)

### 2.1. Masuk dengan Email & Kata Sandi (Sign In)

* **HTTP Method:** `POST`
* **URL:** `/api/auth/sign-in/email`
* **Headers:**
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health",
    "password": "Password123!"
  }
  ```
* **Response Sukses (HTTP 200 OK):**
  ```json
  {
    "token": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "user": {
      "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "name": "dr. Rayhan Pratama, Sp.A",
      "email": "dokter@amanah.health",
      "role": "staffDoctor",
      "emailVerified": true,
      "createdAt": "2026-09-18T10:00:00.000Z",
      "updatedAt": "2026-09-18T10:00:00.000Z"
    }
  }
  ```
* **Aksi Sisi Klien (Flutter):**
  1. Simpan nilai `token` ke `flutter_secure_storage` dengan kunci `'amanah_auth_token'`.
  2. Periksa `user.role`:
     - Jika `'staffDoctor'` $\rightarrow$ set `AmanahUserRole.doctor`.
     - Jika `'staffMidwife'` atau `'staffWorker'` $\rightarrow$ set `AmanahUserRole.staff`.
     - Jika `'patient'` $\rightarrow$ Tolak akses, panggil `POST /api/auth/sign-out`, dan tampilkan pesan: *"Akun Anda terdaftar sebagai pasien. Aplikasi ini khusus staf medis klinik."*
  3. Buka layar utama `AmanahHomeShell`.
* **Response Gagal (HTTP 401 Unauthorized):**
  ```json
  {
    "error": {
      "status": 401,
      "message": "Invalid email or password"
    }
  }
  ```

---

### 2.2. Masuk dengan Google Sign-In Native (Google OAuth Exchange)

* **HTTP Method:** `POST`
* **URL:** `/api/auth/sign-in/social`
* **Headers:**
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
* **Alur di Flutter:**
  1. Konfigurasi plugin `google_sign_in`:
     ```dart
     final GoogleSignIn googleSignIn = GoogleSignIn(
       serverClientId: '<WEB_APPLICATION_CLIENT_ID>', // Wajib: Web Client ID dari backend
       scopes: ['email', 'profile'],
     );
     ```
  2. Dapatkan objek autentikasi Google:
     ```dart
     final GoogleSignInAccount? account = await googleSignIn.signIn();
     final GoogleSignInAuthentication auth = await account!.authentication;
     final String? idToken = auth.idToken;
     ```
  3. Kirim `idToken` ke backend:
* **Request Body ke Backend:**
  ```json
  {
    "provider": "google",
    "idToken": {
      "token": "<google_id_token>"
    }
  }
  ```
* **Response Sukses (HTTP 200 OK):**
  Mengembalikan struktur yang sama persis dengan Sign In Email (`token` dan `user`).
* **Response Gagal (HTTP 401 Unauthorized):**
  ```json
  {
    "code": "INVALID_TOKEN",
    "message": "Invalid id token"
  }
  ```

---

### 2.3. Pemulihan Kata Sandi Berbasis OTP (Password Recovery)

Proses pemulihan kata sandi dilakukan dalam 3 tahap tanpa tautan URL:

#### Tahap 1: Minta Kode OTP (Request OTP)
* **HTTP Method:** `POST`
* **URL:** `/api/auth/email-otp/request-password-reset`
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health"
  }
  ```
* **Response (HTTP 200 OK):**
  ```json
  {
    "success": true
  }
  ```
  *(Kode OTP 6-digit dikirimkan ke kotak masuk email pengguna dan berlaku selama 5 menit).*

#### Tahap 2: Validasi Kode OTP (Verify OTP Challenge)
* **HTTP Method:** `POST`
* **URL:** `/api/auth/email-otp/check-verification-otp`
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health",
    "type": "forget-password",
    "otp": "123456"
  }
  ```
* **Response Sukses (HTTP 200 OK):**
  ```json
  {
    "success": true
  }
  ```
* **Response Gagal (HTTP 400 Bad Request):**
  ```json
  {
    "code": "INVALID_OTP",
    "message": "Invalid OTP"
  }
  ```

#### Tahap 3: Tetapkan Kata Sandi Baru (Set New Password)
* **HTTP Method:** `POST`
* **URL:** `/api/auth/email-otp/reset-password`
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health",
    "otp": "123456",
    "password": "NewSecurePassword123!"
  }
  ```
* **Response Sukses (HTTP 200 OK):**
  ```json
  {
    "success": true
  }
  ```
  *(Backend secara otomatis mereset kata sandi dan membatalkan seluruh sesi login lama).*

---

### 2.4. Restorasi Sesi Saat Aplikasi Dimuat (Session Restoration)

Saat aplikasi pertama kali dibuka (Splash Screen), periksa token sesi yang tersimpan:

* **HTTP Method:** `GET`
* **URL:** `/api/auth/get-session`
* **Headers:**
  ```http
  Authorization: Bearer <session_token>
  Accept: application/json
  ```
* **Response Sesi Aktif (HTTP 200 OK):**
  ```json
  {
    "session": {
      "id": "7b8f9e61-2a13-4c5b-912a-4638a7c2b64d",
      "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "token": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "expiresAt": "2026-09-27T10:00:00.000Z"
    },
    "user": {
      "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "name": "dr. Rayhan Pratama, Sp.A",
      "email": "dokter@amanah.health",
      "role": "staffDoctor"
    }
  }
  ```
  $\rightarrow$ Klien memulihkan state `AmanahAuthUser` dan langsung membuka `AmanahHomeShell`.
* **Response Sesi Kedaluwarsa / Tidak Ada (HTTP 200 OK dengan body `null`):**
  $\rightarrow$ Klien menghapus token lama dari storage dan membuka lembar login `AuthBottomSheetScreen`.

---

### 2.5. Keluar Akun (Sign Out / Logout)

* **HTTP Method:** `POST`
* **URL:** `/api/auth/sign-out`
* **Headers:**
  ```http
  Authorization: Bearer <session_token>
  Content-Type: application/json
  ```
* **Response Sukses (HTTP 200 OK):**
  ```json
  {
    "success": true
  }
  ```
* **Aksi Wajib Sisi Klien (Flutter Cleanup):**
  1. Hapus `'amanah_auth_token'` dari `flutter_secure_storage`.
  2. Set `_authenticatedUser = null`.
  3. Panggil `googleSignIn.signOut()`.
  4. Reset navigasi ke modal login `AuthSheetMode.signIn`.

---

## 3. Panggilan API Terproteksi (Authenticated Requests)

Untuk seluruh endpoint data klinis (misal: `/api/v1/schedules/*`, `/api/v1/patients/*`, `/api/v1/auth/me`):

* **Header Wajib:**
  ```http
  Authorization: Bearer <session_token>
  ```
* **Mekanisme di Backend:**  
  `HybridAuthGuard` mengekstrak header ini, mencari sesi di Better Auth, dan memuat entitas staf (`staffProfiles`, `practitioners`) ke dalam `request.user`.
* **Penanganan Error HTTP 401 Unauthorized:**  
  Jika interceptor HTTP Flutter menerima status 401, sesi dianggap kedaluwarsa:
  1. Hapus token lokal.
  2. Buka form login kembali.

---

## 4. Otorisasi & Pemetaan Peran (Role Mapping)

| Nilai `user.role` dari Better Auth | Pemetaan di Flutter (`AmanahUserRole`) | Akses Aplikasi Mobile |
| :--- | :--- | :---: |
| `'staffDoctor'` | `AmanahUserRole.doctor` | ✅ **Diizinkan** (Akses fitur dokter, jadwal, rekam medis) |
| `'staffMidwife'` | `AmanahUserRole.staff` | ✅ **Diizinkan** (Akses fitur staf medis kebidanan) |
| `'staffWorker'` | `AmanahUserRole.staff` | ✅ **Diizinkan** (Akses fitur penunjang/administrasi) |
| `'admin'` | `AmanahUserRole.staff` | ✅ **Diizinkan** (Akses penuh administrasi) |
| `'patient'` | *Tidak Diizinkan* | ❌ **Ditolak** (Tampilkan pesan error dan logout) |

---

## 5. Ringkasan Checklist untuk Tim Mobile (Flutter)

- [ ] Simpan `token` sesi ke `flutter_secure_storage` setelah login berhasil.
- [ ] Sisipkan header `Authorization: Bearer <token>` pada setiap request HTTP.
- [ ] Set parameter `serverClientId` pada `GoogleSignIn` dengan **Web Client ID** dari Google Cloud Console.
- [ ] Kirim `idToken` Google ke `POST /api/auth/sign-in/social` dengan payload `{ "provider": "google", "idToken": { "token": "<token>" } }`.
- [ ] Tangani alur lupa sandi menggunakan rangkaian endpoint OTP (`request-password-reset`, `check-verification-otp`, `reset-password`).
- [ ] Panggil `GET /api/auth/get-session` saat splash screen untuk mengecek restorasi sesi.
- [ ] Panggil `POST /api/auth/sign-out` saat pengguna logout dan bersihkan local storage serta sesi Google.
