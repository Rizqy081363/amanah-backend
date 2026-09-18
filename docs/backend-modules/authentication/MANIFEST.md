# Manifest Modul: Authentication

> **Module Identifier:** `amanah.core.auth`  
> **Source Directory:** [`src/auth/`](file:///D:/Amanah-backend/src/auth/)  
> **Documentation Directory:** [`docs/backend-modules/authentication/`](file:///D:/Amanah-backend/docs/backend-modules/authentication/)  
> **Verification Status:** **100% Fully Implemented, Persisted & Verified in PostgreSQL**  
> **Delegation Readiness:** **READY FOR APPLY (PRODUCTION-GRADE)**  

---

## 1. Identitas Modul & Routing Hierarchy

Modul autentikasi bertanggung jawab terhadap otentikasi identitas pengguna (dokter, perawat, bidan, staf administrasi, pasien), manajemen sesi, penerbitan token JWT, registrasi akun terenkripsi, sinkronisasi Google OAuth, resolusi hak akses (RBAC), serta pemulihan kredensial (forgot password).

### Base URL & Routing Architecture

```text
Backend Host: http://localhost:3001 (Default Local / Docker)
Global Prefix: /api
├── Kanonikal REST API: /api/v1/auth/*  (Email & Password, Profil, Token Refresh)
└── Google & Session:   /api/auth/*     (Google OAuth, Web Session, Admin RBAC)
```

> [!NOTE]
> **Sinkronisasi Otomatis Database PostgreSQL:**  
> Seluruh pengguna yang mendaftar melalui API Kanonikal (`/api/v1/auth/email/register`) maupun Google OAuth (`/api/auth/sign-in/social`) secara atomik disinkronkan ke dalam tabel `users`, `auth_accounts`, `"user"`, dan `user_roles` melalui **Database Trigger PostgreSQL** (`0003_auth_dual_engine_sync_triggers.sql`). Tidak ada perbedaan UUID ataupun fragmentasi data klinis.

---

## 2. Inventaris Lengkap Endpoint

| No | Method | URI Pattern | Kategori | Status Implementasi | Guard / Auth | Scope / Role | Keterangan Singkat |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| **01** | `POST` | `/api/v1/auth/email/register` | Kredensial | ✅ **IMPLEMENTED** | Public | All | Mendaftarkan akun pasien baru, hash bcrypt, dan simpan permanen ke DB |
| **02** | `POST` | `/api/v1/auth/email/login` | Kredensial | ✅ **IMPLEMENTED** | Public | All | Otentikasi email + password, menerbitkan access & refresh token |
| **03** | `GET` | `/api/v1/auth/me` | Profil | ✅ **IMPLEMENTED** | `AuthGuard('jwt')` | Authenticated | Mengambil profil user aktif beserta relasi staff / patient |
| **04** | `PATCH`| `/api/v1/auth/me` | Profil | ✅ **IMPLEMENTED** | `AuthGuard('jwt')` | Authenticated | Memperbarui nama dan/atau mengganti password akun |
| **05** | `DELETE`|`/api/v1/auth/me` | Profil | ✅ **IMPLEMENTED** | `AuthGuard('jwt')` | Authenticated | Soft-delete akun (status menjadi inactive / banned) |
| **06** | `POST` | `/api/v1/auth/refresh` | Token | ✅ **IMPLEMENTED** | `AuthGuard('jwt-refresh')` | Authenticated | Menukarkan valid refresh token dengan token pair baru |
| **07** | `POST` | `/api/v1/auth/forgot/password` | Recovery | ✅ **IMPLEMENTED** | Public | All | Mengirim tautan reset kata sandi ke email pengguna via SMTP Mailpit |
| **08** | `POST` | `/api/v1/auth/reset/password` | Recovery | ✅ **IMPLEMENTED** | Public | All | Memverifikasi JWT hash token & meng-update hash sandi baru di DB |
| **09** | `POST` | `/api/v1/auth/email/confirm` | Verifikasi | ✅ **IMPLEMENTED** | Public | All | Memverifikasi kepemilikan email menggunakan token verifikasi |
| **10** | `POST` | `/api/v1/auth/email/confirm/new` | Verifikasi | ✅ **IMPLEMENTED** | Public | All | Mengonfirmasi alamat email pengganti |
| **11** | `POST` | `/api/v1/auth/logout` | Sesi | ✅ **IMPLEMENTED** | `AuthGuard('jwt')` | Authenticated | Endpoint logout (client membersihkan token dari local storage) |
| **12** | `GET/POST`| `/api/auth/sign-in/social` | Google | ✅ **IMPLEMENTED** | Public | All | Inisiasi Google OAuth 2.0 (Web redirect atau Mobile ID Token) |
| **13** | `POST` | `/api/auth/sign-in/email` | Better Auth | ✅ **IMPLEMENTED** | Public | All | Otentikasi email Better Auth dengan session cookie / bearer |
| **14** | `POST` | `/api/auth/sign-out` | Better Auth | ✅ **IMPLEMENTED** | Session | Authenticated | Menghapus baris sesi aktif dari tabel database `"session"` |
| **15** | `GET` | `/api/auth/get-session` | Better Auth | ✅ **IMPLEMENTED** | Session | Authenticated | Mengembalikan session metadata dan user profile |
| **16** | `POST` | `/api/auth/admin/list-users` | Backoffice | ✅ **IMPLEMENTED** | Admin Session | `admin` | Mengambil daftar pengguna backoffice & pagination |
| **17** | `POST` | `/api/auth/admin/set-role` | Backoffice | ✅ **IMPLEMENTED** | Admin Session | `admin` | Mengubah peran (role) pengguna |
| **18** | `POST` | `/api/auth/admin/ban-user` | Backoffice | ✅ **IMPLEMENTED** | Admin Session | `admin` | Memblokir akun pengguna tertentu |
| **19** | `POST` | `/api/auth/admin/impersonate-user` | Backoffice | ✅ **IMPLEMENTED** | Admin Session | `admin` | Membuat sesi impersonasi sementara untuk audit staf |

---

## 3. Resolusi Kesenjangan & Jaminan Integritas Data

1. **Registrasi Akun:**
   - Telah diperbaiki secara matang. Pemanggilan `POST /api/v1/auth/email/register` memvalidasi ketiadaan duplikat email, meng-hash password via bcrypt, memasukkan data ke tabel `users` dan `auth_accounts`, menetapkan peran `patient`, serta menyinkronkan ke `"user"` dan `account`.
2. **Kesesuaian Google OAuth & Credentials:**
   - Trigger database PostgreSQL `fn_sync_better_auth_user_to_core_users` dan `fn_sync_better_auth_account_to_auth_accounts` menjamin konsistensi data secara transaksional tanpa celah race condition.
3. **Frontend Integration Simplicity:**
   - Frontend tidak dibebani pilihan arsitektural ganda. Form login/register standar menggunakan rute `/api/v1/auth/*`, sedangkan tombol Google Sign-in mengarah ke `/api/auth/sign-in/social`.

---

## 4. Status Delegasi

Modul autentikasi berstatus **READY FOR APPLY (PRODUCTION-GRADE)**. Seluruh endpoint telah terbukti berfungsi end-to-end pada database PostgreSQL kontainer Docker.
