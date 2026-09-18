# Amanah Healthcare — Authentication Module Contract & Delegation

> **Module Name:** `authentication`  
> **Status:** **Production-Ready & Fully Persisted in PostgreSQL** (Evidence-Based)  
> **Target Audience:** Frontend Engineers, Mobile App Engineers (Flutter/Android), QA Engineers, Tech Lead  
> **Repository Base:** `D:\Amanah-backend`  
> **Generated & Verified Date:** 2026-09-19  

---

## 1. Executive Summary

Dokumen ini merupakan bundel spesifikasi kontrak resmi dan panduan delegasi teknis untuk modul **Authentication** pada backend Amanah Healthcare. Seluruh alur autentikasi telah diselaraskan dengan kebutuhan praktis frontend: **deterministik, aman, dan data tersimpan permanen di PostgreSQL**.

### Arsitektur Autentikasi Terintegrasi

Amanah Healthcare backend menyediakan alur autentikasi yang jelas bagi frontend:

1. **Email & Password Authentication:**  
   Melalui rute Kanonikal REST API (`/api/v1/auth/*`). Mendukung registrasi akun baru, login kredensial, pengambilan profil, update profil, reset password, dan rotasi token JWT secara stateless.
2. **Google Sign-In (OAuth 2.0):**  
   Melalui rute `/api/auth/*`. Mendukung Web Redirect flow maupun Mobile ID-Token flow.
3. **Sinkronisasi Atomik di PostgreSQL:**  
   Melalui database trigger `fn_sync_better_auth_user_to_core_users`, seluruh akun yang mendaftar lewat Google maupun Email/Password secara transaksional memiliki data lengkap di tabel `users`, `auth_accounts`, `"user"`, dan `user_roles`. Tidak ada lagi risiko desinkronisasi atau akun yang tidak tersimpan.

---

## 2. Struktur Bundel Dokumentasi

Bundel dokumentasi modul autentikasi terbagi ke dalam 11 dokumen terstruktur:

1. [**`README.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/README.md) (Dokumen ini)  
   Ringkasan eksekutif, arsitektur terintegrasi, dan navigasi dokumen.
2. [**`MANIFEST.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/MANIFEST.md)  
   Inventaris lengkap 19 endpoint, status kesiapan implementasi (`IMPLEMENTED`), guard, dan peran.
3. [**`CONTRACT.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/CONTRACT.md)  
   Protokol global komunikasi HTTP, base URL, format header, envelope response RFC 7807, rate limiter, dan aturan idempotency.
4. [**`ENDPOINTS.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/ENDPOINTS.md)  
   Spesifikasi teknis mendalam per endpoint: headers, request schema, validasi DTO, kode HTTP, dan contoh payload response aktual.
5. [**`ERRORS.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/ERRORS.md)  
   Katalog kode galat (RFC 7807 Problem Details vs Better Auth JSON error), mapping field validasi, dan kamus Bahasa Indonesia.
6. [**`AUTH-FLOWS.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/AUTH-FLOWS.md)  
   Diagram alir dan sequence diagram interaktif (Mermaid) untuk registrasi, login kredensial, Google OAuth, token refresh, dan password recovery.
7. [**`RBAC.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/RBAC.md)  
   Matriks Role-Based Access Control, perbedaan model role NestJS vs Better Auth, hirarki hak akses, dan guard evaluation rules.
8. [**`DATA-CONTRACT.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/DATA-CONTRACT.md)  
   Definisi tipe data TypeScript, skema DTO, dan JSON representasi untuk entitas User, Session, Tokens, dan Error envelopes.
9. [**`SIDE-EFFECTS.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/SIDE-EFFECTS.md)  
   Dampak operasi auth pada database PostgreSQL (trigger & tables), pengiriman email via SMTP/Mailpit, penyimpanan session di Redis/DB, dan audit log.
10. [**`FRONTEND-HANDOFF.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/FRONTEND-HANDOFF.md)  
    **Panduan Delegasi Frontend Resmi**: Alur tunggal siap pakai, kode Axios interceptor dengan auto-refresh, alur Google Sign-In (Web & Flutter), dan helper form error.
11. [**`VERIFICATION.md`**](file:///D:/Amanah-backend/docs/backend-modules/authentication/VERIFICATION.md)  
    Buku besar bukti verifikasi (Evidence Ledger) yang menghubungkan setiap klaim dokumen ke nomor baris kode sumber dan log uji live di database.

---

## 3. Matriks Status Endpoint Singkat

| Engine / Jalur | Method | Endpoint Path | Status Implementasi | Auth Guard | Keterangan |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **Email Auth** | `POST` | `/api/v1/auth/email/register` | ✅ **IMPLEMENTED** | Public | Registrasi akun baru (disimpan ke DB) |
| **Email Auth** | `POST` | `/api/v1/auth/email/login` | ✅ **IMPLEMENTED** | Public | Login email + kata sandi |
| **Profil User**| `GET` | `/api/v1/auth/me` | ✅ **IMPLEMENTED** | `AuthGuard('jwt')` | Mengambil profil user & peran klinis |
| **Profil User**| `PATCH`| `/api/v1/auth/me` | ✅ **IMPLEMENTED** | `AuthGuard('jwt')` | Memperbarui nama dan/atau sandi |
| **Profil User**| `DELETE`|`/api/v1/auth/me` | ✅ **IMPLEMENTED** | `AuthGuard('jwt')` | Menonaktifkan akun sendiri (Soft delete) |
| **Token Auth** | `POST` | `/api/v1/auth/refresh` | ✅ **IMPLEMENTED** | `AuthGuard('jwt-refresh')` | Pembaruan access token |
| **Sandi** | `POST` | `/api/v1/auth/forgot/password` | ✅ **IMPLEMENTED** | Public | Kirim email pemulihan via Mailpit |
| **Sandi** | `POST` | `/api/v1/auth/reset/password` | ✅ **IMPLEMENTED** | Public | Reset sandi dengan token hash |
| **Email** | `POST` | `/api/v1/auth/email/confirm` | ✅ **IMPLEMENTED** | Public | Konfirmasi alamat email |
| **Google** | `GET/POST`| `/api/auth/sign-in/social` | ✅ **IMPLEMENTED** | Public | Inisiasi login Google (Web/Mobile) |
| **Session** | `GET` | `/api/auth/get-session` | ✅ **IMPLEMENTED** | Session | Cek sesi aktif |
| **Session** | `POST` | `/api/auth/sign-out` | ✅ **IMPLEMENTED** | Session | Logout & hapus sesi server |
| **Backoffice** | `POST` | `/api/auth/admin/*` | ✅ **IMPLEMENTED** | Admin | Manajemen user & role admin |
