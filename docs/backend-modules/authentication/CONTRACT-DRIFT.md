# Authentication Contract Drift Analysis (Post-Remediation)

> **Document Type:** Normative Audit Artifact  
> **Target Subsystem:** Authentication, Authorization & Identity Lifecycle  
> **Repository Scope:** Upstream NestJS Backend (`D:\Amanah-backend`) vs Frontend Client (`D:\kolaborasihealthcare`)  
> **Last Synchronized:** September 19, 2026 (Updated with Live Backend Overhaul & DB Triggers)  

---

## 1. Status Pembaruan Kontrak & Resolusi Defek Backend

Menindaklanjuti audit awal, Tim Backend telah merombak dan menyelesaikan implementasi seluruh alur lifecycle autentikasi secara permanen di [`src/auth/auth.service.ts`](file:///D:/Amanah-backend/src/auth/auth.service.ts) serta memasang PostgreSQL Database Trigger (`0003_auth_dual_engine_sync_triggers.sql`).

Berikut adalah status resolusi kontrak terbaru setelah verifikasi runtime langsung:

---

## 2. Matriks Pembaruan & Resolusi Kontrak

| ID | Feature | Status Sebelumnya | Status Terkini (Pasca-Perbaikan) | Bukti Kode & Database | Catatan Operasional |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DFT-01** | User Self-Registration (`POST /email/register`) | ❌ **STUB / NO-OP** | ✅ **RESOLVED & PERSISTED** | [`src/auth/auth.service.ts#L175-L242`](file:///D:/Amanah-backend/src/auth/auth.service.ts#L175-L242) | Memvalidasi duplikasi email (422 `emailAlreadyExists`), bcrypt hash (10 salt), INSERT `users` + `auth_accounts`, role `patient`, sync `"user"` & `account`. Terverifikasi live. |
| **DFT-02** | Password Reset Execution (`POST /reset/password`) | ❌ **STUB / NO-OP** | ✅ **RESOLVED & PERSISTED** | [`src/auth/auth.service.ts#L335-L384`](file:///D:/Amanah-backend/src/auth/auth.service.ts#L335-L384) | Memverifikasi JWT hash token kriptografis (`auth.forgotSecret`), hash sandi baru, dan update kolom `passwordHash` di `auth_accounts` dan `account`. |
| **DFT-03** | Profile Self-Update (`PATCH /me`) | ❌ **STUB / NO-OP** (Return null) | ✅ **RESOLVED & PERSISTED** | [`src/auth/auth.service.ts#L386-L525`](file:///D:/Amanah-backend/src/auth/auth.service.ts#L386-L525) | Validasi old password dengan `bcrypt.compare`, memperbarui nama profil di tabel `users` dan `"user"`. |
| **DFT-04** | Email Confirmation (`POST /email/confirm`) | ❌ **STUB / NO-OP** | ✅ **RESOLVED** | [`src/auth/auth.service.ts#L244-L265`](file:///D:/Amanah-backend/src/auth/auth.service.ts#L244-L265) | Memverifikasi JWT hash, set `email_verified = true` di database. |
| **DFT-05** | New Email Confirmation (`POST /confirm/new`) | ❌ **STUB / NO-OP** | ✅ **RESOLVED** | [`src/auth/auth.service.ts#L267-L300`](file:///D:/Amanah-backend/src/auth/auth.service.ts#L267-L300) | Memverifikasi token email baru, update `email` di `users`. |
| **DFT-06** | Soft Delete Akun (`DELETE /me`) | ❌ **STUB / NO-OP** | ✅ **RESOLVED & PERSISTED** | [`src/auth/auth.service.ts#L586-L607`](file:///D:/Amanah-backend/src/auth/auth.service.ts#L586-L607) | Mengubah status menjadi `'inactive'` di tabel `users` dan menandai `banned = true` di tabel `"user"`. |
| **DFT-07** | Server-Side Logout / Blacklist | ⚠️ **Client-Side Discard** | ⚠️ **Client-Side Discard (By-Design)** | [`src/auth/auth.service.ts#L609`](file:///D:/Amanah-backend/src/auth/auth.service.ts#L609) | Standar arsitektur stateless JWT. Client membersihkan cookie/token saat logout. |
| **DFT-08** | Better Auth OpenAPI Exposure | ℹ️ Hidden | ℹ️ Hidden (`@ApiExcludeController`) | [`better-auth.controller.ts#L7`](file:///D:/Amanah-backend/src/auth/better-auth/better-auth.controller.ts#L7) | Didokumentasikan secara lengkap dalam `FRONTEND-HANDOFF.md` dan `ENDPOINTS.md`. |
| **DFT-09** | Google OAuth Data Sync | ⚠️ Desinkronisasi Potensial | ✅ **RESOLVED VIA DB TRIGGERS** | Migrasi `0003_auth_dual_engine_sync_triggers.sql` | Trigger `trg_sync_better_auth_user` otomatis membuat entitas `users` & hak akses `patient` di `user_roles`. 1 User = 1 UUID. |
| **DFT-10** | Database Multi-Schema Sync | ⚠️ Sinkronisasi Seeder Saja | ✅ **RESOLVED DI SEMUA LEVEL** | Dual Insert di Service & Trigger PostgreSQL | Sinkronisasi data berlangsung atomik baik saat registrasi via API REST maupun Google OAuth. |

---

## 3. Kesimpulan & Panduan Frontend

Dengan diselesaikannya pembaruan ini oleh tim backend:
1. **Semua Endpoint Lifecycle Kini Siap Pakai**: Frontend dapat mengaktifkan form pendaftaran mandiri pasien (`POST /api/v1/auth/email/register`) dengan aman.
2. **Kredensial Pengujian Nyata**:
   - `anasabiyyu123@gmail.com` / `Password123!`
   - `maganghealthcare666@gmail.com` / `Password123!`
   - Kedua akun telah teruji langsung dan aktif di database PostgreSQL backend.
3. **Alur Integrasi Tunggal**:
   - Web & Mobile Email/Password ➔ `/api/v1/auth/*`
   - Web Google OAuth ➔ Redirect ke `/api/auth/sign-in/social?provider=google&callbackURL=...`
   - Mobile Google OAuth ➔ Kirim `idToken` ke `POST /api/auth/sign-in/social`.
