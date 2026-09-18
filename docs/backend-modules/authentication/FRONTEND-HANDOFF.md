# Panduan Delegasi & Integrasi Frontend: Modul Authentication

> **Dokumen Resmi Integrasi Frontend (Authoritative Frontend Integration Manual)**  
> **Target Pengguna:** Frontend Engineer (Web SPA/Next.js/Vite), Mobile App Engineer (Flutter/Android), QA Automation  
> **Status:** **PRODUCTION-READY & FULLY PERSISTED** (Terverifikasi End-to-End di PostgreSQL)  
> **Basis Implementasi:** [`src/auth/auth.service.ts`](file:///D:/Amanah-backend/src/auth/auth.service.ts), [`src/auth/better-auth/auth.ts`](file:///D:/Amanah-backend/src/auth/better-auth/auth.ts), Migrasi `0003_auth_dual_engine_sync_triggers.sql`  

---

## 1. Prinsip Desain & Alur Tunggal Deterministik

Sebagai arsitektur backend Amanah Healthcare, backend bertanggung jawab menjamin **alur autentikasi yang deterministik, aman, dan data yang tersimpan secara permanen**. Frontend tidak perlu membuat keputusan arsitektural yang rumit atau memilih-milih engine.

### Aturan Integrasi Frontend:
1. **Pendaftaran & Masuk dengan Email & Sandi:**  
   Gunakan rute standar Kanonikal API (`/api/v1/auth/*`). Seluruh aksi (Registrasi, Login, Forgot Password, Reset Password, Update Profil) **telah diimplementasikan secara penuh dan menyimpan data ke database PostgreSQL**.
2. **Masuk / Pendaftaran dengan Google (Google Sign-In):**  
   Gunakan rute Google OAuth (`/api/auth/*`). Backend secara atomik menyinkronkan data profil Google dan peran (`patient`) ke tabel inti sistem via **Database Trigger PostgreSQL**.
3. **Satu Identitas Pengguna (Single Identity Guarantee):**  
   Pengguna yang mendaftar via Email/Sandi maupun Google OAuth akan mendapatkan UUID yang sama, entitas identitas klinis yang sama, dan role yang sama di PostgreSQL.

---

## 2. Alur 1: Email & Password (Mobile & Web)

### A. Registrasi Pengguna Baru (Register)
* **Endpoint:** `POST /api/v1/auth/email/register`
* **Status:** ✅ **IMPLEMENTED & PERSISTED**
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```json
  {
    "email": "pasien.baru@example.com",
    "password": "Password123!",
    "firstName": "Budi",
    "lastName": "Santoso"
  }
  ```
* **Respons Berhasil:** `HTTP 204 No Content`
* **Jaminan Backend:**
  1. Memvalidasi bahwa email belum terdaftar (jika sudah ada, return `HTTP 422 { errors: { email: "emailAlreadyExists" } }`).
  2. Meng-hash kata sandi menggunakan bcrypt (10 salt rounds).
  3. Menyimpan baris pengguna ke tabel `users` dengan status `active`.
  4. Menyimpan hash kredensial ke tabel `auth_accounts`.
  5. Menghubungkan peran bawaan `patient` ke tabel `user_roles`.
  6. Menyinkronkan akun ke tabel Better Auth (`"user"` dan `account`).
  7. **Akun langsung siap login seketika tanpa perlu restart/seed ulang.**

---

### B. Login Kredensial
* **Endpoint:** `POST /api/v1/auth/email/login`
* **Status:** ✅ **IMPLEMENTED & PERSISTED**
* **Request Body:**
  ```json
  {
    "email": "pasien.baru@example.com",
    "password": "Password123!"
  }
  ```
* **Respons Berhasil:** `HTTP 200 OK`
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenExpires": 1726794000000,
    "user": {
      "id": "3078ffd7-6ff0-41de-b1bd-cc194a5a40cb",
      "email": "pasien.baru@example.com",
      "systemRole": "PATIENT",
      "role": {
        "id": 3,
        "name": "PATIENT"
      },
      "staff": null,
      "patient": null
    }
  }
  ```

---

### C. Ambil Profil Sesi Aktif
* **Endpoint:** `GET /api/v1/auth/me`
* **Headers:** `Authorization: Bearer <token>`
* **Respons:** `HTTP 200 OK` berisi objek profil lengkap pengguna.

---

### D. Pembaruan Access Token (Silent Refresh)
* **Endpoint:** `POST /api/v1/auth/refresh`
* **Headers:** `Authorization: Bearer <refreshToken>`
* **Respons:** `HTTP 200 OK` `{ "token": "...", "refreshToken": "...", "tokenExpires": ... }`.

---

### E. Lupa Password & Reset Password
1. **Kirim Permintaan Reset:** `POST /api/v1/auth/forgot/password` dengan body `{ "email": "..." }`.  
   *Backend mengirimkan token JWT berdurasi 30 menit ke email pengguna via SMTP/Mailpit (bisa dipantau di `http://localhost:8025`).*
2. **Kirim Kata Sandi Baru:** `POST /api/v1/auth/reset/password`
   ```json
   {
     "hash": "<token_dari_email>",
     "password": "PasswordBaru123!"
   }
   ```
   *Backend memverifikasi tanda tangan kriptografis token, meng-hash kata sandi baru, dan memperbarui database secara atomik.*

---

## 3. Alur 2: Google Sign-In (Web & Mobile)

Untuk mengaktifkan autentikasi Google, frontend cukup menggunakan alur standar berikut tanpa logika tambahan:

### A. Web Application (Next.js / React / Vue) — *Redirect Flow*
Frontend cukup mengarahkan pengguna ke URL Google OAuth backend:

```typescript
// Tombol "Masuk dengan Google" di Web:
const handleGoogleSignIn = () => {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const callbackUrl = encodeURIComponent('http://localhost:3000/dashboard');
  
  window.location.href = `${backendUrl}/api/auth/sign-in/social?provider=google&callbackURL=${callbackUrl}`;
};
```

**Yang Terjadi di Backend & Database:**
1. Pengguna login di akun Google dan menyetujui izin profil/email.
2. Google redirect kembali ke backend: `/api/auth/callback/google`.
3. Backend memvalidasi token Google, menyimpan data pengguna di tabel `"user"`, dan membuat sesi di `"session"`.
4. **Database Trigger PostgreSQL (`fn_sync_better_auth_user_to_core_users`)** secara otomatis membuatkan entitas di tabel `users` dan menghubungkan peran `Patient` di `user_roles`.
5. Pengguna di-redirect kembali ke `/dashboard` di frontend Anda dengan **HttpOnly Session Cookie**.

---

### B. Mobile Application (Flutter / React Native) — *Native ID Token Flow*
Aplikasi mobile menggunakan Google Sign-In SDK native perangkat untuk mendapatkan `idToken`, lalu mengirimkannya ke backend:

```dart
// Flutter Example:
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

Future<void> signInWithGoogle() async {
  final GoogleSignInAccount? googleUser = await GoogleSignIn().signIn();
  if (googleUser == null) return; // Dibatalkan oleh user

  final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
  final String? idToken = googleAuth.idToken;

  final response = await http.post(
    Uri.parse('http://10.0.2.2:3001/api/auth/sign-in/social'),
    headers: {'Content-Type': 'application/json'},
    body: jsonEncode({
      'provider': 'google',
      'idToken': {'token': idToken},
    }),
  );

  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    final String sessionToken = data['token'];
    // Simpan sessionToken ke FlutterSecureStorage
  }
}
```

---

## 4. Modul HTTP Client Siap Pakai (Axios dengan Auto-Refresh)

Berikut adalah modul HTTP client production-grade yang siap disalin ke proyek frontend Anda. Modul ini secara otomatis menyisipkan Bearer token, menangani error `401 Unauthorized`, melakukan silent refresh di latar belakang, dan mengulangi request yang tertunda:

```typescript
// src/services/apiClient.ts
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 15000,
});

let memoryAccessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  memoryAccessToken = token;
};

export const getRefreshToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('amanah_refresh_token');
  }
  return null;
};

export const setRefreshToken = (token: string | null) => {
  if (typeof window !== 'undefined') {
    if (token) localStorage.setItem('amanah_refresh_token', token);
    else localStorage.removeItem('amanah_refresh_token');
  }
};

// Injeksi Token & Distributed Tracing
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (memoryAccessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${memoryAccessToken}`;
  }

  if (!config.headers['x-correlation-id'] && typeof crypto !== 'undefined') {
    config.headers['x-correlation-id'] = crypto.randomUUID();
  }

  return config;
});

// Penanganan HTTP 401 & Silent Refresh Terotomasi
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((promise) => {
    if (error) promise.reject(error);
    else promise.resolve(token!);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/email/login') &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const currentRefreshToken = getRefreshToken();
      if (!currentRefreshToken) {
        setAccessToken(null);
        setRefreshToken(null);
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<{
          token: string;
          refreshToken: string;
          tokenExpires: number;
        }>(
          `${BASE_URL}/api/v1/auth/refresh`,
          {},
          {
            headers: {
              Authorization: `Bearer ${currentRefreshToken}`,
            },
          },
        );

        setAccessToken(data.token);
        setRefreshToken(data.refreshToken);

        processQueue(null, data.token);

        originalRequest.headers.Authorization = `Bearer ${data.token}`;
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        setAccessToken(null);
        setRefreshToken(null);
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
```

---

## 5. Helper Pemetaan Galat Validasi Form (RFC 7807)

Ketika backend menolak input (HTTP 422), backend mengembalikan envelope RFC 7807 `invalidParams`. Fungsi berikut langsung memetakan galat ke form state Anda:

```typescript
// src/utils/formErrorUtils.ts
export const AUTH_FIELD_ERROR_MAP: Record<string, string> = {
  notFound: 'Alamat email tidak terdaftar.',
  incorrectPassword: 'Kata sandi salah.',
  emailAlreadyExists: 'Alamat email ini telah terdaftar. Silakan masuk.',
  emailNotExists: 'Email tidak ditemukan di sistem.',
  invalidHash: 'Tautan atau token reset kata sandi tidak valid atau telah kedaluwarsa.',
  missingOldPassword: 'Kata sandi lama wajib diisi.',
  incorrectOldPassword: 'Kata sandi lama yang Anda masukkan tidak sesuai.',
};

export function getFriendlyErrorMessage(field: string, reason: string): string {
  if (AUTH_FIELD_ERROR_MAP[reason]) {
    return AUTH_FIELD_ERROR_MAP[reason];
  }
  return `Input ${field} tidak valid (${reason}).`;
}
```

---

## 6. Akun Pengujian Siap Pakai di Lingkungan Lokal

Database lokal telah terisi (seeded) dengan akun-akun siap pakai untuk verifikasi integrasi:

| Role Klinis | Email | Kata Sandi | Deskripsi Akses |
| :--- | :--- | :--- | :--- |
| **Pasien (Baru Didaftarkan)** | `anasabiyyu123@gmail.com` | `Password123!` | Pasien umum terverifikasi di PostgreSQL |
| **Pasien (Baru Didaftarkan)** | `maganghealthcare666@gmail.com` | `Password123!` | Pasien umum terverifikasi di PostgreSQL |
| **Dokter Spesialis Anak** | `dr.ahmad@amanah-healthcare.test` | `Password123!` | Akses antrean poli, jadwal praktik, rekam medis |
| **Bidan** | `bidan.siti@amanah-healthcare.test` | `Password123!` | Akses layanan kebidanan, pemeriksaan ibu dan anak |
| **Staf Pendaftaran / Kasir** | `frontdesk.dimas@amanah-healthcare.test`| `Password123!` | Akses pendaftaran pasien, presensi, absensi |
| **Administrator Sistem** | `admin@amanah.com` | `Password123!` | Akses backoffice, manajemen peran dan pengguna |
