# Spesifikasi Detail Endpoint: Modul Authentication

> **Modul:** `authentication`  
> **Target Audience:** Frontend Developer, Mobile App Developer, QA Engineer  
> **Source Files:** [`src/auth/auth.controller.ts`](file:///D:/Amanah-backend/src/auth/auth.controller.ts), [`src/auth/auth.service.ts`](file:///D:/Amanah-backend/src/auth/auth.service.ts), [`src/auth/better-auth/*`](file:///D:/Amanah-backend/src/auth/better-auth/)  

---

## DAFTAR ISI ENDPOINT

* [**Engine A: Kanonikal JWT API (`/api/v1/auth/*`)**](#bagian-1-engine-a-kanonikal-jwt-api)
  1. [`POST /api/v1/auth/email/login` (Login Kredensial)](#1-post-apiv1authemaillogin) — **IMPLEMENTED**
  2. [`GET /api/v1/auth/me` (Profil Pengguna Aktif)](#2-get-apiv1authme) — **IMPLEMENTED**
  3. [`POST /api/v1/auth/refresh` (Pembaruan Access Token)](#3-post-apiv1authrefresh) — **IMPLEMENTED**
  4. [`POST /api/v1/auth/forgot/password` (Permintaan Reset Sandi)](#4-post-apiv1authforgotpassword) — **IMPLEMENTED**
  5. [`POST /api/v1/auth/logout` (Logout JWT)](#5-post-apiv1authlogout) — **NO-OP / CLIENT ONLY**
  6. [`POST /api/v1/auth/email/register` (Registrasi Akun Baru)](#6-post-apiv1authemailregister) — **STUB**
  7. [`POST /api/v1/auth/email/confirm` (Konfirmasi Email)](#7-post-apiv1authemailconfirm) — **STUB**
  8. [`POST /api/v1/auth/email/confirm/new` (Konfirmasi Email Baru)](#8-post-apiv1authemailconfirmnew) — **STUB**
  9. [`POST /api/v1/auth/reset/password` (Reset Sandi dengan Token)](#9-post-apiv1authresetpassword) — **STUB**
  10. [`PATCH /api/v1/auth/me` (Pembaruan Profil Diri)](#10-patch-apiv1authme) — **STUB**
  11. [`DELETE /api/v1/auth/me` (Penonaktifan Akun Sendiri)](#11-delete-apiv1authme) — **STUB**
* [**Engine B: Better Auth Engine (`/api/auth/*`)**](#bagian-2-engine-b-better-auth-engine)
  12. [`POST /api/auth/sign-in/email` (Sign-in Email Better Auth)](#12-post-apiauthsign-inemail) — **IMPLEMENTED**
  13. [`POST /api/auth/sign-out` (Sign-out Sesi Better Auth)](#13-post-apiauthsign-out) — **IMPLEMENTED**
  14. [`GET /api/auth/get-session` (Cek Sesi Aktif Better Auth)](#14-get-apiauthget-session) — **IMPLEMENTED**
  15. [`POST /api/auth/forget-password` (Forgot Password Better Auth)](#15-post-apiauthforget-password) — **IMPLEMENTED**
  16. [`POST /api/auth/reset-password` (Reset Password Better Auth)](#16-post-apiauthreset-password) — **IMPLEMENTED**
  17. [`POST /api/auth/admin/list-users` (Backoffice List Users)](#17-post-apiauthadminlist-users) — **IMPLEMENTED**
  18. [`POST /api/auth/admin/set-role` (Backoffice Set Role)](#18-post-apiauthadminset-role) — **IMPLEMENTED**
  19. [`POST /api/auth/admin/ban-user` (Backoffice Ban User)](#19-post-apiauthadminban-user) — **IMPLEMENTED**
  20. [`POST /api/auth/admin/impersonate-user` (Backoffice Impersonasi)](#20-post-apiauthadminimpersonate-user) — **IMPLEMENTED**

---

# BAGIAN 1: ENGINE A (KANONIKAL JWT API)

## 1. `POST /api/v1/auth/email/login`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Otentikasi kredensial pengguna (email & kata sandi) dan menerbitkan JWT access token serta refresh token.
* **Autentikasi:** Public (Tidak memerlukan token).
* **Source Evidence:**
  * Controller: [`src/auth/auth.controller.ts` L50-L66](file:///D:/Amanah-backend/src/auth/auth.controller.ts#L50-L66)
  * Service: [`src/auth/auth.service.ts` L24-L147](file:///D:/Amanah-backend/src/auth/auth.service.ts#L24-L147)
  * DTO: [`src/auth/dto/auth-email-login.dto.ts`](file:///D:/Amanah-backend/src/auth/dto/auth-email-login.dto.ts)

### Request
* **Headers:**
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
* **Body Schema (`AuthEmailLoginDto`):**
  * `email` (`string`, wajib, format email valid, di-transform otomatis menjadi lowercase).
  * `password` (`string`, wajib, tidak boleh kosong).
* **Contoh Request Body:**
  ```json
  {
    "email": "dr.ahmad@amanah-healthcare.local",
    "password": "Password123!"
  }
  ```

### Responses
* **HTTP 200 OK — Login Berhasil**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenExpires": 1726794000000,
    "user": {
      "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "email": "dr.ahmad@amanah-healthcare.local",
      "systemRole": "STAF",
      "role": {
        "id": 2,
        "name": "STAF"
      },
      "staff": {
        "id": "993f4a36-7c16-43e9-9133-14b2d56a2977",
        "practitionerId": "35efae0a-85b8-4d5c-9c76-f8180e0c9041",
        "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
        "poliklinikId": "b18b4e7c-b6fa-4993-8025-a13437e2311f",
        "fullName": "dr. Ahmad Fauzi, Sp.A",
        "profession": "Dokter Spesialis Anak",
        "idCardNumber": "STF-DOK-001",
        "photoUrl": "https://images.unsplash.com/photo-1622253692010-333f2da6031d",
        "phoneNumber": "+6281234567891",
        "isActive": true
      },
      "patient": null
    }
  }
  ```
* **HTTP 422 Unprocessable Entity — Email Tidak Ditemukan**
  ```json
  {
    "type": "https://amanah.health/errors/validation_failed",
    "title": "Unprocessable Entity",
    "status": 422,
    "statusCode": 422,
    "detail": "Form validation failed for one or more fields.",
    "code": "VALIDATION_FAILED",
    "invalidParams": [
      {
        "name": "email",
        "reason": "notFound",
        "code": "INVALID_VALUE"
      }
    ],
    "traceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "timestamp": "2026-09-19T00:52:00.000Z"
  }
  ```
* **HTTP 422 Unprocessable Entity — Kata Sandi Salah**
  ```json
  {
    "type": "https://amanah.health/errors/validation_failed",
    "title": "Unprocessable Entity",
    "status": 422,
    "statusCode": 422,
    "detail": "Form validation failed for one or more fields.",
    "code": "VALIDATION_FAILED",
    "invalidParams": [
      {
        "name": "password",
        "reason": "incorrectPassword",
        "code": "INVALID_VALUE"
      }
    ],
    "traceId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "timestamp": "2026-09-19T00:52:01.000Z"
  }
  ```

---

## 2. `GET /api/v1/auth/me`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Mengambil data profil lengkap pengguna yang saat ini sedang login beserta relasi profil klinis (staff atau patient).
* **Autentikasi:** Wajib Bearer Token (`AuthGuard('jwt')`).
* **Source Evidence:**
  * Controller: [`src/auth/auth.controller.ts` L165-L184](file:///D:/Amanah-backend/src/auth/auth.controller.ts#L165-L184)
  * Service: [`src/auth/auth.service.ts` L149-L163](file:///D:/Amanah-backend/src/auth/auth.service.ts#L149-L163)
  * Strategy: [`src/auth/strategies/jwt.strategy.ts` L26-L111](file:///D:/Amanah-backend/src/auth/strategies/jwt.strategy.ts#L26-L111)

### Request
* **Headers:**
  ```http
  Authorization: Bearer <access_token>
  Accept: application/json
  ```

### Responses
* **HTTP 200 OK — Sukses**
  ```json
  {
    "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
    "email": "dr.ahmad@amanah-healthcare.local",
    "systemRole": "STAF",
    "role": {
      "id": 2,
      "name": "STAF"
    },
    "staff": {
      "id": "993f4a36-7c16-43e9-9133-14b2d56a2977",
      "practitionerId": "35efae0a-85b8-4d5c-9c76-f8180e0c9041",
      "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "poliklinikId": "b18b4e7c-b6fa-4993-8025-a13437e2311f",
      "fullName": "dr. Ahmad Fauzi, Sp.A",
      "profession": "Dokter Spesialis Anak",
      "idCardNumber": "STF-DOK-001",
      "photoUrl": "https://images.unsplash.com/photo-1622253692010-333f2da6031d",
      "phoneNumber": "+6281234567891",
      "isActive": true
    },
    "patient": null
  }
  ```
* **HTTP 401 Unauthorized — Token Tidak Disertakan / Kedaluwarsa**
  ```json
  {
    "type": "https://amanah.health/errors/unauthenticated",
    "title": "Unauthorized",
    "status": 401,
    "statusCode": 401,
    "detail": "Unauthorized",
    "code": "UNAUTHENTICATED",
    "traceId": "23df0133-7221-4ee6-857c-87d9ba6349c2",
    "timestamp": "2026-09-19T00:52:05.000Z"
  }
  ```

---

## 3. `POST /api/v1/auth/refresh`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Menghasilkan pasangan token baru (access token & refresh token baru) menggunakan refresh token yang masih valid.
* **Autentikasi:** Wajib Bearer Refresh Token (`AuthGuard('jwt-refresh')`).
* **Source Evidence:**
  * Controller: [`src/auth/auth.controller.ts` L190-L212](file:///D:/Amanah-backend/src/auth/auth.controller.ts#L190-L212)
  * Service: [`src/auth/auth.service.ts` L214-L288](file:///D:/Amanah-backend/src/auth/auth.service.ts#L214-L288)
  * Strategy: [`src/auth/strategies/jwt-refresh.strategy.ts`](file:///D:/Amanah-backend/src/auth/strategies/jwt-refresh.strategy.ts)

### Request
* **Headers:**
  ```http
  Authorization: Bearer <refresh_token>
  Accept: application/json
  ```
  *(Catatan: Token yang dikirim pada Authorization header harus merupakan `refreshToken`, bukan access token).*

### Responses
* **HTTP 200 OK — Token Baru Diterbitkan**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenExpires": 1726880400000
  }
  ```
* **HTTP 401 Unauthorized — Refresh Token Tidak Valid**
  ```json
  {
    "type": "https://amanah.health/errors/unauthenticated",
    "title": "Unauthorized",
    "status": 401,
    "statusCode": 401,
    "detail": "Unauthorized",
    "code": "UNAUTHENTICATED",
    "traceId": "e1138b1d-7201-4ec4-94ab-734125b287cd",
    "timestamp": "2026-09-19T00:52:10.000Z"
  }
  ```

---

## 4. `POST /api/v1/auth/forgot/password`
* **Status:** ✅ **IMPLEMENTED & VERIFIED** (Terhubung ke Mailpit / SMTP)
* **Tujuan:** Mengirim tautan reset kata sandi ke kotak masuk email pengguna. Token berlaku selama 30 menit.
* **Autentikasi:** Public.
* **Source Evidence:**
  * Controller: [`src/auth/auth.controller.ts` L122-L139](file:///D:/Amanah-backend/src/auth/auth.controller.ts#L122-L139)
  * Service: [`src/auth/auth.service.ts` L171-L206](file:///D:/Amanah-backend/src/auth/auth.service.ts#L171-L206)
  * Mailer: [`src/mail/mail.service.ts`](file:///D:/Amanah-backend/src/mail/mail.service.ts)

### Request
* **Headers:**
  ```http
  Content-Type: application/json
  ```
* **Body Schema (`AuthForgotPasswordDto`):**
  * `email` (`string`, wajib, format email valid).
* **Contoh Request Body:**
  ```json
  {
    "email": "dr.ahmad@amanah-healthcare.local"
  }
  ```

### Responses
* **HTTP 204 No Content — Email Berhasil Dikirim**
  * Response body kosong (`null`).
  * Email dengan JWT hash reset sandi (masa berlaku 30 menit) terkirim ke server Mailpit lokal (`http://localhost:8025`).
* **HTTP 422 Unprocessable Entity — Email Tidak Ditemukan**
  ```json
  {
    "type": "https://amanah.health/errors/validation_failed",
    "title": "Unprocessable Entity",
    "status": 422,
    "statusCode": 422,
    "detail": "Form validation failed for one or more fields.",
    "code": "VALIDATION_FAILED",
    "invalidParams": [
      {
        "name": "email",
        "reason": "emailNotExists",
        "code": "INVALID_VALUE"
      }
    ],
    "traceId": "7a35624e-b5c9-4b68-b80c-fcad6bc8e612",
    "timestamp": "2026-09-19T00:52:15.000Z"
  }
  ```

---

## 5. `POST /api/v1/auth/logout`
* **Status:** ⚠️ **NO-OP / CLIENT-SIDE ONLY**
* **Tujuan:** Logout pengguna.
* **Autentikasi:** Wajib Bearer Token (`AuthGuard('jwt')`).
* **Source Evidence:**
  * Controller: [`src/auth/auth.controller.ts` L215-L234](file:///D:/Amanah-backend/src/auth/auth.controller.ts#L215-L234)
  * Service: [`src/auth/auth.service.ts` L292](file:///D:/Amanah-backend/src/auth/auth.service.ts#L292): `async logout(_data: any): Promise<void> {}`

### Request & Responses
* **Headers:** `Authorization: Bearer <access_token>`
* **Responses:** HTTP `204 No Content`.
* **PERINGATAN TEKNIS:** Server tidak mencatat token ke Redis blocklist. Client (frontend) bertanggung jawab menghapus token dari memori/penyimpanan perangkat secara lokal.

---

## 6. `POST /api/v1/auth/email/register`
* **Status:** ✅ **IMPLEMENTED & PERSISTED IN POSTGRESQL**
* **Tujuan:** Pendaftaran akun pasien baru secara permanen dengan hashing bcrypt dan sinkronisasi dual-engine otomatis.
* **Autentikasi:** Public.
* **Source Evidence:**
  * Controller: [`src/auth/auth.controller.ts` L68-L82](file:///D:/Amanah-backend/src/auth/auth.controller.ts#L68-L82)
  * Service: [`src/auth/auth.service.ts`](file:///D:/Amanah-backend/src/auth/auth.service.ts)
  * DTO: [`src/auth/dto/auth-register-login.dto.ts`](file:///D:/Amanah-backend/src/auth/dto/auth-register-login.dto.ts)

### Request
* **Headers:** `Content-Type: application/json`
* **Body Schema:**
  ```json
  {
    "email": "pasien.baru@example.com",
    "password": "Password123!",
    "firstName": "Budi",
    "lastName": "Santoso"
  }
  ```

### Responses
* **HTTP 204 No Content:** Akun berhasil didaftarkan dan langsung tersimpan di tabel `users`, `auth_accounts`, `user_roles`, `"user"`, dan `account`.
* **HTTP 422 Unprocessable Entity:** Email sudah terdaftar sebelumnya (`errors: { email: "emailAlreadyExists" }`).

---

## 7. `POST /api/v1/auth/reset/password`
* **Status:** ✅ **IMPLEMENTED & PERSISTED**
* **Tujuan:** Menetapkan kata sandi baru menggunakan JWT reset hash token yang dikirim via email.
* **Request:**
  ```json
  {
    "hash": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "password": "NewSecurePassword123!"
  }
  ```
* **Responses:** HTTP `204 No Content`.

---

## 8. `PATCH /api/v1/auth/me`
* **Status:** ✅ **IMPLEMENTED & PERSISTED**
* **Tujuan:** Memperbarui profil nama atau mengganti kata sandi akun sendiri.
* **Autentikasi:** Wajib Bearer Token (`AuthGuard('jwt')`).
* **Request (Opsional firstName, lastName, oldPassword, password):**
  ```json
  {
    "firstName": "Budi",
    "lastName": "Pratama",
    "oldPassword": "Password123!",
    "password": "NewPassword123!"
  }
  ```
* **Responses:** HTTP `200 OK` mengembalikan profil terbaru pengguna.

---

## 9. `DELETE /api/v1/auth/me`
* **Status:** ✅ **IMPLEMENTED & PERSISTED**
* **Tujuan:** Soft-delete penonaktifan akun sendiri.
* **Autentikasi:** Wajib Bearer Token (`AuthGuard('jwt')`).
* **Efek Database:** Mengubah kolom `status` di tabel `users` menjadi `'inactive'`, dan memberi flag `banned = true` pada tabel `"user"`.
* **Responses:** HTTP `204 No Content`.

---

## 10. `POST /api/v1/auth/email/confirm` & `confirm/new`
* **Status:** ✅ **IMPLEMENTED & PERSISTED**
* **Tujuan:** Konfirmasi verifikasi alamat email menggunakan hash token.
* **Responses:** HTTP `204 No Content`.

---

## 11. `GET/POST /api/auth/sign-in/social` (Google OAuth 2.0)
* **Status:** ✅ **IMPLEMENTED & PERSISTED**
* **Tujuan:** Autentikasi Google Sign-In untuk Web (Redirect) atau Mobile (ID Token).
* **Web:** Redirect browser ke `http://localhost:3001/api/auth/sign-in/social?provider=google&callbackURL=http://localhost:3000/dashboard`
* **Mobile (Flutter/Android):**
  ```json
  {
    "provider": "google",
    "idToken": {
      "token": "<google_id_token>"
    }
  }
  ```
* **Jaminan Sinkronisasi:** Trigger PostgreSQL otomatis memetakan user Google ke entitas `users` dan `user_roles`.

---

# BAGIAN 2: ENGINE B (BETTER AUTH ENGINE)

## 12. `POST /api/auth/sign-in/email`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Otentikasi kredensial email & kata sandi melalui Better Auth.
* **Autentikasi:** Public.
* **Source Evidence:** [`src/auth/better-auth/auth.ts` L103-L130](file:///D:/Amanah-backend/src/auth/better-auth/auth.ts#L103-L130)

### Request
* **Headers:**
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
* **Body:**
  ```json
  {
    "email": "dr.ahmad@amanah-healthcare.local",
    "password": "Password123!"
  }
  ```

### Responses
* **HTTP 200 OK — Login Berhasil**
  * Response Header: `Set-Cookie: better-auth.session_token=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
  * Response Body:
  ```json
  {
    "token": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "user": {
      "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
      "email": "dr.ahmad@amanah-healthcare.local",
      "name": "dr. Ahmad Fauzi, Sp.A",
      "role": "staffDoctor",
      "emailVerified": true,
      "createdAt": "2026-09-18T10:00:00.000Z",
      "updatedAt": "2026-09-18T10:00:00.000Z"
    }
  }
  ```
* **HTTP 401 Unauthorized — Kredensial Salah**
  ```json
  {
    "error": {
      "status": 401,
      "message": "Invalid email or password"
    }
  }
  ```

---

## 13. `POST /api/auth/sign-out`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Mengakhiri sesi pengguna dan menghapus record sesi dari tabel database `"session"`.
* **Autentikasi:** Memerlukan session cookie atau header `Authorization: Bearer <session_token>`.
* **Responses:** HTTP `200 OK`:
  ```json
  {
    "success": true
  }
  ```

---

## 14. `GET /api/auth/get-session`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Mengembalikan data sesi dan profil pengguna aktif.
* **Autentikasi:** Memerlukan session cookie atau header `Authorization: Bearer <session_token>`.
* **Responses:**
  * **HTTP 200 OK (Sesi Valid):**
    ```json
    {
      "session": {
        "id": "7b8f9e61-2a13-4c5b-912a-4638a7c2b64d",
        "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
        "token": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "expiresAt": "2026-09-26T00:52:00.000Z"
      },
      "user": {
        "id": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
        "email": "dr.ahmad@amanah-healthcare.local",
        "name": "dr. Ahmad Fauzi, Sp.A",
        "role": "staffDoctor"
      }
    }
    ```
  * **HTTP 200 OK dengan body `null`** (Jika sesi tidak ditemukan / telah expired).

---

## 15. `POST /api/auth/forget-password`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Meminta pengiriman email pemulihan kata sandi Better Auth via SMTP/Mailpit.
* **Request Body:**
  ```json
  {
    "email": "dr.ahmad@amanah-healthcare.local"
  }
  ```
* **Responses:** HTTP `200 OK` `{ "status": true }`.

---

## 16. `POST /api/auth/reset-password`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Menetapkan kata sandi baru menggunakan token reset yang dikirim ke email.
* **Request Body:**
  ```json
  {
    "token": "v1.token.hash...",
    "newPassword": "NewSecurePassword123!"
  }
  ```
* **Responses:** HTTP `200 OK` `{ "status": true }`.

---

## 17. `POST /api/auth/admin/list-users`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Mengambil daftar seluruh pengguna terdaftar untuk dashboard backoffice administrator.
* **Autentikasi:** Session pengguna dengan peran `admin`.
* **Request Body (Opsional Pagination & Filter):**
  ```json
  {
    "limit": 10,
    "offset": 0,
    "sortBy": "createdAt",
    "sortDirection": "desc"
  }
  ```
* **Responses:** HTTP `200 OK` berisi array daftar user dan total count.

---

## 18. `POST /api/auth/admin/set-role`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Mengubah peran (role) pengguna ke salah satu: `admin`, `staffDoctor`, `staffMidwife`, `staffWorker`, `patient`.
* **Autentikasi:** Session `admin`.
* **Request Body:**
  ```json
  {
    "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
    "role": "staffDoctor"
  }
  ```
* **Responses:** HTTP `200 OK` `{ "success": true }`.

---

## 19. `POST /api/auth/admin/ban-user`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Menonaktifkan/memblokir akun pengguna.
* **Autentikasi:** Session `admin`.
* **Request Body:**
  ```json
  {
    "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1",
    "banReason": "Pelanggaran etika klinis",
    "banExpiresIn": 864000
  }
  ```
* **Responses:** HTTP `200 OK` `{ "success": true }`.

---

## 20. `POST /api/auth/admin/impersonate-user`
* **Status:** ✅ **IMPLEMENTED & VERIFIED**
* **Tujuan:** Membuat sesi penyamaran (impersonasi) berdurasi 15 menit untuk audit troubleshooting staf medis.
* **Autentikasi:** Session `admin`.
* **Request Body:**
  ```json
  {
    "userId": "e81d77a2-f947-4952-b88d-e6b8408f65a1"
  }
  ```
* **Responses:** HTTP `200 OK` dengan session token baru berdurasi 15 menit.
