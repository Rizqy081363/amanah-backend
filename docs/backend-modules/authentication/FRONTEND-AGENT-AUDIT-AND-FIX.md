# Laporan Investigasi Mendalam & Panduan Perbaikan Otentikasi Google OAuth

> **Tanggal:** 19 September 2026  
> **Target Audiens:** Frontend Agent & Lead Developer  
> **Subjek:** Mengapa Akun Google (`zikrifadhiilahahmad@gmail.com`) Masuk ke Dashboard tetapi Tidak Ada di PostgreSQL (`users`), Serta Solusi Pastinya.

---

## 1. Bukti Konkret & Akar Masalah (Root Cause)

### A. Temuan Utama: Split-Brain & Database Terpisah di Frontend
Ketika pengguna mengklik **"Lanjutkan dengan Google"** di aplikasi Next.js (`D:\manage-stock`), pengguna berhasil login dan diarahkan ke `/dashboard`. Namun di database PostgreSQL backend (`amanah_healthcare`), tabel `users` kosong:
```sql
amanah_healthcare=# select * from users where email = 'zikrifadhiilahahmad@gmail.com';
(0 rows)
```

**Penyebabnya bukan karena backend gagal menyimpan, melainkan request Google OAuth TIDAK PERNAH sampai ke backend NestJS (port 3001).**

### B. Bukti Forensik: SQLite `auth.db` di Folder Frontend
Di dalam project frontend `D:\manage-stock`:
1. File `src/lib/auth.ts` menginstansiasi Better Auth server sendiri menggunakan database **SQLite lokal**:
   ```typescript
   // D:\manage-stock\src\lib\auth.ts
   import { DatabaseSync } from 'node:sqlite';
   const dbPath = path.resolve(process.cwd(), 'auth.db');
   const db = new DatabaseSync(dbPath);
   export const auth = betterAuth({
     database: db, // <--- SQLite lokal auth.db!
     ...
   });
   ```
2. File `src/app/api/auth/[...all]/route.ts` mencegat seluruh request `/api/auth/*` pada port 3000 dan menjalankannya di SQLite tersebut.
3. Konfigurasi `D:\manage-stock\.env.local` mengarahkan Better Auth client ke dirinya sendiri (port 3000):
   ```env
   BETTER_AUTH_URL=http://localhost:3000
   NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
   ```
4. **Hasil pengecekan database SQLite `D:\manage-stock\auth.db`:**
   ```json
   [
     {
       "id": "4Xh7kXqXfHW3oveWK35smfY0nK2LsSTa",
       "name": "Fadhiilahahmad Zikri",
       "email": "zikrifadhiilahahmad@gmail.com"
     }
   ]
   ```
   Data pengguna `zikrifadhiilahahmad@gmail.com` ternyata disimpan di **SQLite `auth.db` frontend**, bukan di PostgreSQL backend. Sesi login dibentuk oleh Next.js sendiri sehingga `/dashboard` menganggap user sudah login, padahal backend tidak mengetahui adanya akun tersebut.

### C. Mengapa Akun Biasa (Email/Password) Bisa Masuk ke PostgreSQL?
Pada form login biasa di `D:\manage-stock\src\features\auth\components\auth-flow-view.tsx`:
```typescript
// 1. Primary Authentication: Backend NestJS Kanonikal API
const res = await loginAction(null, {
  email: values.email,
  password: values.password
});
```
Fungsi `loginAction` memanggil API backend kanonikal (`http://localhost:3001/api/v1/auth/email/login`), sehingga akun email/password masuk ke PostgreSQL. Sementara tombol Google Auth memanggil `authClient.signIn.social({ provider: 'google' })` yang mengarah ke port 3000 (SQLite). Ini menyebabkan fragmentasi autentikasi.

---

## 2. Status Arsitektur Backend NestJS (Port 3001)

Backend NestJS adalah **otoritas tunggal data dan autentikasi klinis**. Backend sudah memiliki:
1. **Endpoint Better Auth:** Siap di `http://localhost:3001/api/auth/*`.
2. **Database PostgreSQL:** Terkoneksi ke `amanah_healthcare` (PostgreSQL 17).
3. **Database Trigger Atomik:** Trigger `trg_sync_better_auth_user` pada PostgreSQL sudah diuji dan terbukti berhasil secara otomatis menyalin setiap data user baru dari tabel `"user"` ke tabel `users` dan memberikan peran `patient` di `user_roles`.
4. **CORS & Credentials:** Sudah dikonfigurasi `credentials: true` di `src/main.ts` agar cookie sesi Better Auth dapat diakses oleh frontend `http://localhost:3000`.
5. **Dukungan GET & POST untuk Social Login:** `BetterAuthController` kini mendukung `POST /api/auth/sign-in/social` (untuk `authClient`) dan `GET /api/auth/sign-in/social` (untuk browser direct redirect).

---

## 3. Langkah Perbaikan Wajib untuk Frontend Agent

Frontend Agent harus mengubah arsitektur autentikasi Next.js agar **menghubungi backend NestJS (port 3001)** dan **bukan menjalankan database SQLite internal**:

### Langkah 1: Hapus Server Auth Internal & SQLite di Frontend
1. Hapus route handler lokal: `D:\manage-stock\src\app\api\auth\[...all]\route.ts`.
2. Hapus atau jangan gunakan `D:\manage-stock\src\lib\auth.ts` yang membuat `auth.db`.
3. Hapus file `D:\manage-stock\auth.db`.

### Langkah 2: Perbaiki Konfigurasi Environment Frontend (`.env.local`)
Ubah nilai URL Better Auth ke backend NestJS (port 3001):
```env
# D:\manage-stock\.env.local
BETTER_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Langkah 3: Konfigurasi `authClient` (`src/lib/auth-client.ts`)
Pastikan `authClient` menggunakan `baseURL` backend dan menyertakan `credentials: 'include'`:
```typescript
// D:\manage-stock\src\lib\auth-client.ts
import { createAuthClient } from 'better-auth/react';
import { adminClient, emailOTPClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'http://localhost:3001',
  basePath: '/api/auth',
  plugins: [
    adminClient(),
    emailOTPClient(),
  ],
  fetchOptions: {
    credentials: 'include',
  },
});
```

### Langkah 4: Alur Google Sign-In di Komponen Frontend
Pada tombol Google Sign-In (`auth-flow-view.tsx` atau `google-auth-button.tsx`), panggil `authClient.signIn.social`:
```typescript
async function handleGoogleAuth() {
  try {
    await authClient.signIn.social({
      provider: 'google',
      callbackURL: 'http://localhost:3000/dashboard',
    });
  } catch (err) {
    console.error('Gagal inisiasi Google Login:', err);
  }
}
```
*Catatan:* Jika menggunakan redirect browser murni, frontend juga dapat langsung mengarahkan:
```typescript
window.location.href = 'http://localhost:3001/api/auth/sign-in/social?provider=google&callbackURL=http://localhost:3000/dashboard';
```

### Langkah 5: Pastikan Google Cloud Console Authorized Redirect URI
Pastikan pada Google Cloud Console (OAuth 2.0 Client ID) telah didaftarkan URI berikut:
* **Authorized JavaScript origins:**
  - `http://localhost:3000`
  - `http://localhost:3001`
* **Authorized redirect URIs:**
  - `http://localhost:3001/api/auth/callback/google`

---

## 4. Hasil yang Dijamin Setelah Perbaikan
Ketika alur di atas berjalan:
1. Klik tombol Google di frontend -> Browser membuka halaman login Google.
2. Google redirect kembali ke Backend: `http://localhost:3001/api/auth/callback/google`.
3. Backend Better Auth menyimpan data user Google ke tabel `"user"` PostgreSQL dan membuat sesi di `"session"`.
4. Trigger PostgreSQL `trg_sync_better_auth_user` langsung membuat data entitas di tabel `users` dan `user_roles`.
5. Browser di-redirect kembali ke `http://localhost:3000/dashboard` dengan session cookie resmi dari backend.
6. Kueri `SELECT * FROM users WHERE email = '...';` pada PostgreSQL dipastikan berisi data lengkap.
