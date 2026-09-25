# Laporan Verifikasi Kompatibilitas Autentikasi Lintas Platform (Web & Flutter Mobile)

> **Modul:** `authentication`  
> **Status:** ✅ **Fully Compatible**  
> **Tanggal Evaluasi:** 2026-09-20  
> **Audience:** Tim Frontend Flutter, Tim Backend NestJS, Tim QA, Tech Lead  
> **Dasar Analisis:**  
> - Frontend Authentication Module Requirement Report (`v1.0.0`)  
> - Panduan Integrasi Google OAuth: Flutter Mobile ke Better Auth Backend (`v1.0.0`)  
> - Repositori Backend: [`src/auth/better-auth/auth.ts`](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts), [`src/auth/better-auth/better-auth.controller.ts`](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/better-auth.controller.ts), [`src/common/auth/hybrid-auth.guard.ts`](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts), [`src/database/schema/better-auth.schema.ts`](file:///D:/Amanah-healthcare-backend/src/database/schema/better-auth.schema.ts)

---

## Output 1 — Ringkasan Kompatibilitas Autentikasi (Executive Summary)

* **Implementasi Autentikasi Eksisting:**  
  Backend mengoperasikan Better Auth v1.7.5 (`/api/auth/*`) dengan plugin `bearer`, `admin` (RBAC), dan `emailOTP`, didukung oleh basis data PostgreSQL (tabel `user`, `session`, `account`, `verification`) serta trigger sinkronisasi otomatis ke entitas aplikasi `users` dan `user_roles`. Backend juga menyediakan API kanonikal NestJS (`/api/v1/auth/*`) yang divalidasi oleh `HybridAuthGuard` (mendukung otentikasi dual-engine: Passport JWT dan Better Auth Bearer token/session cookie).
* **Penggunaan Web Eksisting:**  
  Aplikasi web backoffice/admin menggunakan Better Auth melalui session cookie (`HttpOnly; SameSite=Lax`) dan Google OAuth browser redirect flow (`GET /api/auth/sign-in/social?provider=google&callbackURL=...`).
* **Kebutuhan Autentikasi Mobile (Flutter):**  
  Aplikasi mobile memerlukan autentikasi email & kata sandi, Google Sign-In native (pertukaran `idToken`), pemulihan kata sandi berbasis OTP email, persistensi sesi melalui HTTP header `Authorization: Bearer <session_token>`, pengecekan sesi saat peluncuran aplikasi (`GET /api/auth/get-session`), dan terminasi sesi (`POST /api/auth/sign-out`).
* **Cakupan Khusus Staf (Staff-Only Scope):**  
  Aplikasi Flutter diperuntukkan secara eksklusif bagi staf medis internal klinik (`doctor`, `staff`), bukan untuk pasien umum. Akun publik yang mendaftar secara mandiri memiliki peran default `patient` dan ditolak oleh aplikasi mobile.
* **Status Kompatibilitas Keseluruhan:**  
  **✅ Fully Compatible**
* **Kebutuhan Perubahan Backend:**  
  **Tidak ada perubahan backend yang diperlukan (None required).** Seluruh endpoint, plugin, verifikasi token Google, skema database, dan mekanisme bearer transport yang dibutuhkan oleh Flutter telah tersedia, teruji, dan aktif di repositori.

---

## Output 2 — Inventaris Implementasi Better Auth Eksisting

| Komponen | Implementasi di Repositori | File Sumber | Keterangan Teknis |
| :--- | :--- | :--- | :--- |
| **Inisialisasi & Config** | `betterAuth({ appName, baseURL, basePath, database: pool, ... })` | [`src/auth/better-auth/auth.ts` L84-L238](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L84-L238) | Menggunakan pool PostgreSQL langsung (`pg.Pool`). |
| **Social Provider (Google)** | `socialProviders.google` | [`src/auth/better-auth/auth.ts` L100-L109](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L100-L109) | `clientId` (`GOOGLE_CLIENT_ID`), `clientSecret` (`GOOGLE_CLIENT_SECRET`), `accessType: 'offline'`. Natively mendukung verifikasi Google `idToken` via JWKS Google. |
| **Email & Password** | `emailAndPassword` | [`src/auth/better-auth/auth.ts` L110-L137](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L110-L137) | Enkripsi bcrypt, verifikasi email aktif, reset password link via SMTP Mailpit. |
| **Plugin Bearer Token** | `bearer()` | [`src/auth/better-auth/auth.ts` L198](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L198) | Mengaktifkan header `Authorization: Bearer <session_token>` untuk klien non-browser / Flutter mobile. |
| **Plugin Admin & RBAC** | `adminPlugin({ ac, roles, defaultRole: 'patient', adminRoles: ['admin'] })` | [`src/auth/better-auth/auth.ts` L189-L197](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L189-L197) | 5 peran: `admin`, `staffDoctor`, `staffMidwife`, `staffWorker`, `patient`. |
| **Plugin Email OTP** | `emailOTP({ expiresIn: 300, sendVerificationOTP, ... })` | [`src/auth/better-auth/auth.ts` L199-L236](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L199-L236) | OTP 6-digit numerik, masa berlaku 5 menit, pengiriman HTML via SMTP Mailpit. |
| **Routing / Controller** | `BetterAuthController` | [`src/auth/better-auth/better-auth.controller.ts` L15-L63](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/better-auth.controller.ts#L15-L63) | Path `auth` (`VERSION_NEUTRAL`), mengekspos semua rute Better Auth pada `/api/auth/*` via `toNodeHandler(auth)`. |
| **Guard & Middleware** | `BetterAuthGuard`, `BetterAuthRbacGuard`, `HybridAuthGuard` | [`src/common/auth/hybrid-auth.guard.ts`](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts), [`src/auth/better-auth/guards/`](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/guards/) | `HybridAuthGuard` memvalidasi sesi Better Auth via `fromNodeHeaders(req.headers)` dan me-resolve profil staf/dokter ke `request.user`. |
| **Basis Data Schema** | Tabel `user`, `session`, `account`, `verification` | [`src/database/schema/better-auth.schema.ts`](file:///D:/Amanah-healthcare-backend/src/database/schema/better-auth.schema.ts) | Tabel standar Better Auth terintegrasi relasi dengan skema PostgreSQL Amanah. |

---

## Output 3 — Inventaris Alur Autentikasi Web Eksisting

| Alur (Flow) | Pemicu (Trigger) | Endpoint & Aksi Backend | Transport & Kredensial | Respons & Sesi | State Sisi Klien |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sign In (Kredensial)** | Form login web admin | `POST /api/auth/sign-in/email` | JSON `{ email, password }` | HTTP 200 OK + `Set-Cookie: better-auth.session_token` + Body `{ token, user }` | Menyimpan sesi cookie di browser; menyimpan data user di Pinia/Zustand store. |
| **Sign Up** | Registrasi backoffice / pasien | `POST /api/auth/sign-up/email` | JSON `{ email, password, name }` | HTTP 200 OK + `Set-Cookie` + Body `{ token, user }` (role default: `patient`) | User diarahkan ke halaman verifikasi email atau dasbor pasien. |
| **OAuth (Google)** | Tombol "Masuk dengan Google" | `GET /api/auth/sign-in/social?provider=google&callbackURL=...` | Browser Redirect ke Google Consent Screen | Google me-redirect kembali ke callback backend; backend menerbitkan session cookie dan me-redirect ke dashboard web. | Cookie tersimpan otomatis oleh browser. |
| **Forgot Password** | Permintaan lupa sandi | `POST /api/auth/forget-password` atau `POST /api/auth/email-otp/request-password-reset` | JSON `{ email }` | HTTP 200 OK `{ success: true }`. Email instruksi/OTP dikirim via SMTP Mailpit. | Notifikasi "Cek kotak masuk email Anda". |
| **Reset Password** | Form sandi baru | `POST /api/auth/reset-password` (token) atau `POST /api/auth/email-otp/reset-password` (OTP) | JSON `{ token, newPassword }` atau `{ email, otp, password }` | HTTP 200 OK `{ success: true }`. Sesi lama di-revoke. | Notifikasi berhasil; redirect ke `/login`. |
| **Logout** | Tombol logout | `POST /api/auth/sign-out` | Cookie sesi atau `Authorization: Bearer` | HTTP 200 OK `{ success: true }`. Baris sesi di tabel `session` dihapus permanen. | Menghapus cookie & reset state store. |
| **Session Restoration** | Page refresh / init | `GET /api/auth/get-session` | Cookie sesi otomatis | HTTP 200 OK `{ session, user }` (atau `null` jika expired) | Memuat ulang profil pengguna ke store. |
| **Protected Requests** | Permintaan API klinis | `/api/v1/schedules/*`, `/api/v1/patients/*` | Header `Authorization: Bearer <token>` atau Session Cookie | `HybridAuthGuard` memvalidasi sesi dan memeriksa `@Roles('STAF', 'ADMIN')`. | Menerima data JSON profil klinis. |

---

## Output 4 — Matriks Verifikasi Kebutuhan Mobile (Flutter)

| # | Kebutuhan Mobile (Manifest) | Kemampuan Backend Eksisting | Penggunaan Web | Klasifikasi Kompatibilitas | Bukti Repositori | Catatan Integrasi |
| :---: | :--- | :--- | :--- | :---: | :--- | :--- |
| **1** | **Sign In (Email & Kata Sandi)** | `POST /api/auth/sign-in/email` | Aktif di Web Admin | **✅ Fully Compatible** | [`src/auth/better-auth/auth.ts` L110-L137](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L110-L137) | Menerima `{ email, password }`, mengembalikan `{ token, user }`. |
| **2** | **Sign In via Nomor HP** | Tidak diaktifkan di Better Auth (Hanya Email) | Tidak Digunakan | **⚠️ Out of Scope (Staf)** | [`src/auth/better-auth/auth.ts` L110](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L110) | Sesuai laporan frontend §27.3, staf klinik wajib menggunakan email resmi (`dokter@amanah.health`). Login HP tidak diperlukan untuk staf. |
| **3** | **Sign Up (Pendaftaran Akun)** | `POST /api/auth/sign-up/email` | Aktif | **✅ Fully Compatible** | [`src/auth/better-auth/auth.ts` L110](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L110) | Pendaftaran mandiri menghasilkan peran `patient`. Akun staf/dokter disediakan oleh admin klinik via backoffice. |
| **4** | **Get Active Session** | `GET /api/auth/get-session` | Aktif di Web Admin | **✅ Fully Compatible** | [`src/auth/better-auth/better-auth.controller.ts` L54-L62](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/better-auth.controller.ts#L54-L62) | Menerima header `Authorization: Bearer <token>`, mengembalikan `{ session, user }`. |
| **5** | **Sign Out / Logout** | `POST /api/auth/sign-out` | Aktif di Web Admin | **✅ Fully Compatible** | [`src/auth/better-auth/better-auth.controller.ts` L54-L62](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/better-auth.controller.ts#L54-L62) | Menghapus record dari tabel database `session` secara permanen. |
| **6** | **Lupa Kata Sandi (Request OTP)** | `POST /api/auth/email-otp/request-password-reset` | Tersedia via plugin `emailOTP` | **✅ Fully Compatible** | [`src/auth/better-auth/auth.ts` L199-L236](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L199-L236) | Mengirim OTP 6-digit ke email via SMTP Mailpit dengan masa berlaku 5 menit. |
| **7** | **Verifikasi OTP (Tantangan Sandi)** | `POST /api/auth/email-otp/check-verification-otp` | Tersedia via plugin `emailOTP` | **✅ Fully Compatible** | `node_modules/better-auth/dist/plugins/email-otp/routes.mjs` L221 | Memvalidasi kecocokan OTP tanpa membatalkan token secara prematur. |
| **8** | **Reset Password (dengan OTP)** | `POST /api/auth/email-otp/reset-password` | Tersedia via plugin `emailOTP` | **✅ Fully Compatible** | `node_modules/better-auth/dist/plugins/email-otp/routes.mjs` L568 | Menerima `{ email, otp, password }`, mereset password secara atomik dan me-revoke sesi aktif. |
| **9** | **Google OAuth (`idToken` Exchange)** | `POST /api/auth/sign-in/social` dengan `{ provider: "google", idToken: { token } }` | Web menggunakan redirect | **✅ Fully Compatible** | `node_modules/better-auth/dist/api/routes/sign-in.mjs` L153, `google.mjs` L109 | Better Auth memverifikasi `idToken` langsung ke JWKS Google mencocokkan Web Client ID (`audience: options.clientId`). |
| **10** | **Transport Bearer Token** | Header `Authorization: Bearer <session_token>` | Web memakai cookie, backend menerima keduanya | **✅ Fully Compatible** | [`src/auth/better-auth/auth.ts` L198](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L198) (`bearer()`), [`src/common/auth/hybrid-auth.guard.ts` L42](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts#L42) | Plugin `bearer()` mengurai header Bearer pada seluruh rute Better Auth dan guard NestJS. |
| **11** | **Persistensi & Restorasi Sesi** | Session Token disimpan di Flutter Secure Storage | Tersimpan di LocalStorage/Cookie | **✅ Fully Compatible** | [`src/database/schema/better-auth.schema.ts` L28-L54](file:///D:/Amanah-healthcare-backend/src/database/schema/better-auth.schema.ts#L28-L54) | Masa berlaku sesi: 7 hari (`session.expiresIn = 60 * 60 * 24 * 7`). |
| **12** | **Otorisasi Staf & RBAC** | Peran `staffDoctor`, `staffMidwife`, `staffWorker`, `admin` | Aktif di Web Admin | **✅ Fully Compatible** | [`src/auth/better-auth/permissions.ts` L22-L80](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/permissions.ts#L22-L80), [`src/common/auth/hybrid-auth.guard.ts` L79-L91](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts#L79-L91) | `HybridAuthGuard` memetakan user staf ke `systemRole: 'STAF'`. Akun pasien diblokir dari endpoint staf. |
| **13** | **Aturan Kompleksitas Sandi** | Bcrypt hashing (cost 10), min 8 karakter | Aktif di Web | **✅ Fully Compatible** | [`src/auth/better-auth/auth.ts` L125-L136](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L125-L136) | Form validasi Flutter (8 char, huruf besar/kecil, angka, simbol) sepenuhnya kompatibel. |
| **14** | **Penghapusan Akun (Purge Data)** | `DELETE /api/v1/auth/me` | Tersedia di API v1 | **✅ Fully Compatible** | [`src/auth/auth.controller.ts` L350-L370](file:///D:/Amanah-healthcare-backend/src/auth/auth.controller.ts#L350-L370), [`src/auth/auth.service.ts` L774-L817](file:///D:/Amanah-healthcare-backend/src/auth/auth.service.ts#L774-L817) | Menghapus permanen seluruh data user di PostgreSQL (`purge_user_systemic`) dan membersihkan cache Redis. |

---

## Output 5 — Matriks Kompatibilitas Lintas Platform (Cross-Platform Matrix)

| Area Fungsional | Implementasi Web Eksisting | Kebutuhan Flutter Mobile | Dapat Digunakan Langsung? (Reusable As-Is?) | Kesenjangan (Gap) | Bukti Repositori |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Sign In** | `POST /api/auth/sign-in/email` via browser fetch | `POST /api/auth/sign-in/email` via HTTP client | **YA** | Tidak ada. Mobile cukup mengirim body JSON dan membaca field `token`. | [`src/auth/better-auth/auth.ts` L110](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L110) |
| **Sign Up** | `POST /api/auth/sign-up/email` | `POST /api/auth/sign-up/email` | **YA** | Tidak ada. Catatan: Pendaftaran staf klinis dilakukan oleh admin klinik. | [`src/auth/better-auth/auth.ts` L110](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L110) |
| **OAuth (Google)** | Browser Redirect (`GET /api/auth/sign-in/social`) | Native SDK exchange (`POST /api/auth/sign-in/social` dengan `idToken`) | **YA** | Tidak ada. Better Auth v1.7.5 sudah memiliki handler verifikasi `idToken` bawaan. | `node_modules/better-auth/dist/api/routes/sign-in.mjs` L153 |
| **Forgot Password** | Kirim tautan reset via email | Kirim kode OTP 6-digit ke email | **YA** | Tidak ada. Endpoint `POST /api/auth/email-otp/request-password-reset` sudah aktif. | [`src/auth/better-auth/auth.ts` L199](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L199) |
| **Reset Password** | Reset via hash token URL | Reset via kode OTP 6-digit | **YA** | Tidak ada. Endpoint `POST /api/auth/email-otp/reset-password` sudah aktif. | `node_modules/better-auth/dist/plugins/email-otp/routes.mjs` L568 |
| **Sign Out** | `POST /api/auth/sign-out` | `POST /api/auth/sign-out` | **YA** | Tidak ada. Menghapus sesi di database dan Flutter membersihkan SecureStorage. | [`src/auth/better-auth/better-auth.controller.ts` L54-L62](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/better-auth.controller.ts#L54-L62) |
| **Session Transport** | Cookie HTTP-Only | Header `Authorization: Bearer <token>` | **YA** | Tidak ada. Plugin `bearer()` sudah aktif di Better Auth configuration. | [`src/auth/better-auth/auth.ts` L198](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L198) |
| **Session Lifetime** | 7 hari di tabel `session` | Disimpan di secure hardware enclave | **YA** | Tidak ada. Konfigurasi `session.expiresIn = 60 * 60 * 24 * 7`. | [`src/auth/better-auth/auth.ts` L160-L164](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L160-L164) |
| **Protected Requests** | `HybridAuthGuard` / `BetterAuthGuard` | `HybridAuthGuard` via Bearer token | **YA** | Tidak ada. `HybridAuthGuard` mendukung kedua jenis token. | [`src/common/auth/hybrid-auth.guard.ts` L40-L146](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts#L40-L146) |
| **Staff RBAC** | Peran `admin`, `staffDoctor`, `staffMidwife`, `staffWorker` | Peran `doctor`, `staff` | **YA** | Tidak ada. Pemetaan 1-ke-1 langsung pada field `user.role`. | [`src/auth/better-auth/permissions.ts` L74-L80](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/permissions.ts#L74-L80) |
| **Error Handling** | RFC 7807 (API v1) & Better Auth JSON | Konsumsi format JSON standar | **YA** | Tidak ada. Klien menangani HTTP status 401, 403, 422, dan 429. | [`src/common/filters/problem-details.filter.ts`](file:///D:/Amanah-healthcare-backend/src/common/filters/problem-details.filter.ts) |

---

## Output 6 — Verifikasi Otorisasi Staf (Staff Authorization Verification)

* **Model Identitas Pengguna Eksisting:**  
  Entitas `user` (Better Auth) dan `users` (Amanah Core) terhubung melalui ID UUID yang sinkron via PostgreSQL trigger `trg_sync_better_auth_user`.
* **Daftar Peran (Roles) Eksisting di Repositori:**  
  1. `admin`: Administrator Klinik & Sistem (Izin penuh)  
  2. `staffDoctor`: Dokter Spesialis / Dokter Umum (`src/auth/better-auth/permissions.ts` L34-L44)  
  3. `staffMidwife`: Bidan & Tenaga Medis Kebidanan (`src/auth/better-auth/permissions.ts` L46-L56)  
  4. `staffWorker`: Tenaga Administrasi Klinik (`src/auth/better-auth/permissions.ts` L58-L64)  
  5. `patient`: Pasien Klinik (`src/auth/better-auth/permissions.ts` L66-L72)
* **Pembeda Staf vs Pasien (Staff Distinction):**  
  Pada [`src/common/auth/hybrid-auth.guard.ts` L80-L90](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts#L80-L90):
  - Pengguna dengan peran `staff_doctor`, `staff_midwife`, `staff_worker`, atau memiliki profil di `staff_profiles` secara otomatis di-resolve sebagai `systemRole: 'STAF'`.
  - Pengguna dengan peran `admin` di-resolve sebagai `systemRole: 'ADMIN'`.
  - Pengguna lainnya di-resolve sebagai `systemRole: 'PATIENT'`.
* **Penegakan Guard (Guard Enforcement):**  
  Seluruh controller layanan staf klinis (misal: Jadwal Dokter `/api/v1/schedules/*`) diproteksi dengan decorator `@Roles('STAF', 'ADMIN')` yang dieksekusi oleh `RolesGuard`. Jika akun dengan peran `PATIENT` memanggil endpoint tersebut, server mengembalikan **HTTP 403 Forbidden**.
* **Kebutuhan Staf Mobile:**  
  Aplikasi mobile hanya mengizinkan login pengguna staf (`doctor` dan `staff`).  
  - Ketika `user.role === 'staffDoctor'`, Flutter menetapkan peran `AmanahUserRole.doctor`.  
  - Ketika `user.role === 'staffMidwife'` atau `'staffWorker'`, Flutter menetapkan peran `AmanahUserRole.staff`.  
  - Ketika `user.role === 'patient'`, Flutter menolak login dengan pesan: *"Akun Anda terdaftar sebagai pasien. Aplikasi ini khusus staf medis Amanah Healthcare."* dan memanggil `POST /api/auth/sign-out`.
* **Kesenjangan (Gap):**  
  **Tidak ada kesenjangan.** Struktur peran dan guard backend telah sepenuhnya membedakan staf dan pasien.

---

## Output 7 — Kompatibilitas Transport & Sesi (Session and Transport Compatibility)

1. **Apa yang dikirimkan oleh klien web saat ini?**  
   Klien web mengirimkan HTTP-only cookie (`better-auth.session_token`) pada setiap request AJAX/Fetch.
2. **Apa yang diterima oleh backend saat ini?**  
   Backend menerima **kedua mekanisme**:  
   - Cookie HTTP: `Cookie: better-auth.session_token=...`  
   - Header Authorization: `Authorization: Bearer <session_token>`  
   *(Dukungan header Bearer disediakan oleh plugin `bearer()` pada [`src/auth/better-auth/auth.ts` L198](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L198) dan diekstraksi via `fromNodeHeaders(request.headers)` di `HybridAuthGuard`)*.
3. **Di mana sesi disimpan di backend?**  
   Sesi disimpan secara stateful di tabel database PostgreSQL `session` ([`src/database/schema/better-auth.schema.ts` L28-L54](file:///D:/Amanah-healthcare-backend/src/database/schema/better-auth.schema.ts#L28-L54)), mencakup kolom `token`, `userId`, `expiresAt`, `ipAddress`, dan `userAgent`.
4. **Bagaimana sesi diidentifikasi?**  
   Sesi diidentifikasi melalui string `token` unik berindeks btree pada tabel `session`.
5. **Bagaimana backend memvalidasi sesi?**  
   Melalui fungsi `betterAuth.api.getSession({ headers: fromNodeHeaders(request.headers) })`. Fungsi ini mencari token di database, memeriksa apakah `expiresAt > NOW()`, dan memverifikasi apakah akun pengguna tidak diblokir (`banned === false`).
6. **Apakah Flutter dapat mereproduksi perilaku request yang diperlukan?**  
   **YA.** Flutter dapat menyimpan nilai `token` (yang diterima pada saat login) ke dalam `flutter_secure_storage` dan menyertakannya pada header setiap request HTTP:
   ```http
   Authorization: Bearer <session_token>
   ```
7. **Apakah Flutter memerlukan transport berbeda yang belum didukung?**  
   **TIDAK.** Dukungan Bearer token sudah aktif dan siap dikonsumsi langsung.

---

## Output 8 — Kompatibilitas OAuth (Google Sign-In)

* **Provider Terkonfigurasi:** Google OAuth 2.0 ([`src/auth/better-auth/auth.ts` L100-L109](file:///D:/Amanah-healthcare-backend/src/auth/better-auth/auth.ts#L100-L109)).
* **Alur Web Eksisting:**  
  Web menggunakan Browser Redirect via `GET /api/auth/sign-in/social?provider=google&callbackURL=...`.
* **Kebutuhan Alur Mobile (Flutter):**  
  Mobile tidak menggunakan browser redirect, melainkan alur native:
  1. Pengguna menekan tombol "Masuk dengan Google" di Flutter.
  2. Flutter memanggil plugin native `google_sign_in` dengan konfigurasi:
     ```dart
     final GoogleSignIn googleSignIn = GoogleSignIn(
       serverClientId: '<WEB_CLIENT_ID>', // Menggunakan Web Client ID dari backend
       scopes: ['email', 'profile'],
     );
     ```
  3. Google Play Services / iOS Authentication Services menampilkan dialog akun Google native dan mengembalikan kredensial `idToken`.
  4. Flutter mengirimkan `idToken` tersebut ke backend via HTTP POST:
     ```http
     POST /api/auth/sign-in/social
     Content-Type: application/json

     {
       "provider": "google",
       "idToken": {
         "token": "<google_id_token>"
       }
     }
     ```
* **Verifikasi Kompatibilitas Backend:**  
  Better Auth v1.7.5 (`node_modules/better-auth/dist/api/routes/sign-in.mjs` baris 153) secara native mengenali field `body.idToken`. Fungsi verifikator `verifyProviderIdToken` mengambil public keys resmi dari Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`) dan memvalidasi `audience: options.clientId` (yaitu `GOOGLE_CLIENT_ID`).  
  Setelah token terverifikasi valid:
  - Better Auth mengekstrak email, nama, dan foto profil.
  - Akun ditautkan di tabel `account` dan `user`.
  - Record sesi baru dibuat di tabel `session`.
  - Backend mengembalikan data sesi dan token ke Flutter (`HTTP 200 OK`).
* **Kesenjangan (Gap):**  
  **Tidak ada kesenjangan.** Endpoint dan konfigurasi yang ada sudah 100% siap menerima `idToken` dari Flutter.

---

## Output 9 — Kompatibilitas Logout & Pasca-Logout (Logout and Post-Logout)

* **Operasi Logout Backend:**  
  Endpoint: `POST /api/auth/sign-out`  
  Header: `Authorization: Bearer <session_token>`
* **Invalidasi Sesi Backend:**  
  Better Auth menghapus baris sesi terkait dari tabel database `session` secara permanen. Setelah request selesai, token tersebut tidak dapat digunakan kembali untuk memanggil API apapun.
* **Pembersihan Sisi Klien (Client Cleanup):**  
  Setelah memanggil `POST /api/auth/sign-out` (atau jika menerima respons 401 dari server), Flutter wajib:
  1. Menghapus `session_token` dari `flutter_secure_storage`.
  2. Mereset state `_authenticatedUser` menjadi `null`.
  3. Memutuskan sesi Google via `googleSignIn.signOut()`.
  4. Mengembalikan antarmuka pengguna ke layar awal autentikasi (`AuthSheetMode.signIn`).
* **Kesenjangan (Gap):**  
  **Tidak ada kesenjangan.**

---

## Output 10 — Penggunaan Ulang Kontrak API (API / Auth Contract Reuse)

Seluruh endpoint autentikasi Better Auth diekspos pada prefix `/api/auth/*` (VERSION_NEUTRAL). Berikut adalah kontrak endpoint yang dikonsumsi oleh Flutter:

### 1. Sign In dengan Email & Password
* **Method & URL:** `POST /api/auth/sign-in/email`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health",
    "password": "Password123!"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "token": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "user": {
      "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "email": "dokter@amanah.health",
      "name": "dr. Rayhan Pratama, Sp.A",
      "role": "staffDoctor",
      "emailVerified": true,
      "createdAt": "2026-09-18T10:00:00.000Z",
      "updatedAt": "2026-09-18T10:00:00.000Z"
    }
  }
  ```
* **Response Error (401 Unauthorized):**
  ```json
  {
    "error": {
      "status": 401,
      "message": "Invalid email or password"
    }
  }
  ```

### 2. Sign In dengan Google OAuth (`idToken`)
* **Method & URL:** `POST /api/auth/sign-in/social`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "provider": "google",
    "idToken": {
      "token": "eyJhbGciOiJSUzI1NiIsImtpZCI6..."
    }
  }
  ```
* **Response (200 OK):** Struktur sama persis dengan Sign In Email (mengembalikan `token` dan `user`).
* **Response Error (401 Unauthorized):**
  ```json
  {
    "code": "INVALID_TOKEN",
    "message": "Invalid id token"
  }
  ```

### 3. Cek / Pulihkan Sesi Aktif (Get Session)
* **Method & URL:** `GET /api/auth/get-session`
* **Headers:** `Authorization: Bearer <session_token>`
* **Response (200 OK - Sesi Valid):**
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
      "email": "dokter@amanah.health",
      "name": "dr. Rayhan Pratama, Sp.A",
      "role": "staffDoctor"
    }
  }
  ```
* **Response (200 OK - Sesi Tidak Ada / Expired):** Body bernilai `null`.

### 4. Permintaan Reset Password (Kirim OTP)
* **Method & URL:** `POST /api/auth/email-otp/request-password-reset`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

### 5. Verifikasi OTP (Validasi Kode 6-Digit)
* **Method & URL:** `POST /api/auth/email-otp/check-verification-otp`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health",
    "type": "forget-password",
    "otp": "123456"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

### 6. Reset Password Baru dengan OTP
* **Method & URL:** `POST /api/auth/email-otp/reset-password`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "email": "dokter@amanah.health",
    "otp": "123456",
    "password": "NewSecurePassword123!"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

### 7. Sign Out / Logout
* **Method & URL:** `POST /api/auth/sign-out`
* **Headers:** `Authorization: Bearer <session_token>`
* **Response (200 OK):**
  ```json
  {
    "success": true
  }
  ```

---

## Output 11 — Kompatibilitas Basis Data (Database Compatibility)

* **Hasil Evaluasi:** **No Change Required (Tidak Ada Perubahan Basis Data yang Diperlukan).**
* **Alasan & Bukti:**
  1. Tabel `user`, `session`, `account`, dan `verification` sudah ada dan termigrasi di PostgreSQL ([`src/database/schema/better-auth.schema.ts`](file:///D:/Amanah-healthcare-backend/src/database/schema/better-auth.schema.ts)).
  2. Sesi Better Auth disimpan dengan UUID dan token string unik dengan masa kedaluwarsa 7 hari.
  3. Relasi staf klinik (`staff_profiles`, `practitioners`, `user_roles`) sudah terhubung dengan entitas pengguna `users` dan disinkronkan secara otomatis oleh database trigger `trg_sync_better_auth_user`.
  4. Tidak ada kolom tambahan yang diperlukan untuk mendukung autentikasi Flutter staf.

---

## Kesimpulan & Rekomendasi

1. **Gunakan Ulang (Reuse As-Is):** Tim Mobile Flutter dapat langsung mengintegrasikan modul autentikasi dengan Better Auth backend menggunakan kontrak yang telah ditentukan tanpa memerlukan modifikasi kode backend.
2. **Kredensial Google OAuth:** Tim Mobile harus memastikan parameter `serverClientId` pada plugin Flutter `google_sign_in` diisi dengan nilai **Web Application Client ID** yang sama dengan `GOOGLE_CLIENT_ID` di backend server.
3. **Dokumen Integrasi:** Panduan integrasi teknis lengkap dan contoh implementasi Flutter telah disusun pada dokumen pendamping: [`docs/backend/authentication-mobile-integration-contract.md`](file:///D:/Amanah-healthcare-backend/docs/backend/authentication-mobile-integration-contract.md).
