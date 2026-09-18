# Agent Delegation Changelog & API Contract

> **PENTING UNTUK FRONTEND AGENT:**
> File ini adalah kontrak komunikasi dan acuan sinkronisasi resmi antara Backend Agent dan Frontend Agent.
> Sebelum memulai sesi atau mengimplementasikan halaman baru, baca seluruh dokumen ini.
> Jangan membuat asumsi kontrak API tanpa mencocokkannya dengan entri di file ini.

---

## [2026-09-19] feat: emailOTP Plugin, Verifikasi Manual Wajib, Google OAuth Direct, & Auth Lifecycle Hardening

**Agent:** backend  
**Status:** pending  
**Affected Endpoints:**
- `POST /api/auth/sign-up/email`
- `POST /api/auth/email-otp/send-verification-otp`
- `POST /api/auth/email-otp/verify-email`
- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-in/social`
- `GET /api/auth/get-session`

---

### 1. Ringkasan Perubahan Arsitektur Backend
1. **Penerapan Plugin `emailOTP` Resmi dari Better Auth**:
   - `requireEmailVerification: true` dan `autoSignIn: false` diaktifkan pada pendaftaran manual.
   - User yang mendaftar manual (`emailAndPassword`) **Wajib verifikasi kode OTP 6-digit** yang dikirimkan via SMTP/Mailpit sebelum akun diizinkan login.
   - Masa berlaku OTP: **5 Menit** (300 detik).
2. **Aturan Standar Industri Verifikasi Akun**:
   - **Google OAuth**: Otomatis `emailVerified: true` dari klaim Google. **TIDAK** mengirimkan OTP tambahan. Langsung masuk ke sesi aktif.
   - **Manual (Email & Password)**: Akun dibuat dengan `emailVerified: false` dan status `pending_verification`. Harus input kode OTP 6-digit untuk menjadi `active` dan `emailVerified: true`.
3. **Pencegahan Error Google Sign-In**:
   - Menambahkan variabel `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` pada container `api` di `docker-compose.yaml`.
   - Menambahkan `trustedOrigins` lokal (`http://localhost:3000`, `http://127.0.0.1:3000`, `http://localhost:3001`, `http://127.0.0.1:3001`) untuk mencegah penolakan CSRF/CORS akibat perbedaan `localhost` vs `127.0.0.1`.
4. **Trigger Database Atomik**:
   - Sinkronisasi PostgreSQL trigger otomatis meng-update `status = 'active'` pada tabel `users` saat email diverifikasi melalui Better Auth.

---

### 2. Panduan Integrasi Frontend (Better Auth Client)

#### A. Inisialisasi Client
```ts
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  plugins: [emailOTPClient()],
});
```

#### B. Alur Registrasi Manual & Verifikasi OTP
```ts
// 1. Submit Form Registrasi
const { data, error } = await authClient.signUp.email({
  email: form.email,
  password: form.password,
  name: form.name,
});

if (error) {
  // Tampilkan pesan error validasi / email sudah terdaftar
  return toast.error(error.message);
}

// 2. Karena autoSignIn = false dan requireEmailVerification = true:
// Backend otomatis mengirimkan 6-digit OTP ke email user via SMTP/Mailpit.
// Frontend WAJIB langsung me-redirect user ke halaman input OTP:
router.push(`/verify-otp?email=${encodeURIComponent(form.email)}`);

// 3. Di Halaman /verify-otp (User mengetikkan 6 digit kode):
const { data: verifyData, error: verifyError } = await authClient.emailOtp.verifyEmail({
  email: emailFromQuery,
  otp: otpCode, // Contoh: "776324"
});

if (verifyError) {
  return toast.error("Kode OTP salah atau telah kedaluwarsa.");
}

// Berhasil diverifikasi -> Akun aktif & sesi login terbentuk -> Redirect ke Dashboard
router.push("/dashboard");
```

#### C. Fitur Kirim Ulang OTP (Resend OTP)
```ts
await authClient.emailOtp.sendVerificationOtp({
  email: emailFromQuery,
  type: "email-verification",
});
toast.success("Kode OTP baru telah dikirim ke email Anda.");
```

#### D. Alur Login Google OAuth
```ts
// Satu klik tombol tanpa form OTP tambahan:
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/dashboard",
});
```
> **Catatan Google OAuth:**
> Pastikan di Google Cloud Console, Authorized Redirect URI adalah:
> `http://localhost:3001/api/auth/callback/google`

---

### 3. Masalah Routing & Proteksi Halaman yang Harus Dibenahi di Frontend

#### A. Route Guard (Middleware / Layout Guard)
Mencegah user mengakses URL auth setelah login dan URL privat sebelum login:

1. **Jika User SUDAH Login (`session` aktif)**:
   - Mengakses `/login`, `/register`, `/verify-otp`, `/forgot-password` **DILARANG**.
   - Frontend harus **otomatis me-redirect** user ke `/dashboard` (atau halaman utama). URL tidak boleh menampilkan form login lagi.
2. **Jika User BELUM Login (`session` null)**:
   - Mengakses `/dashboard`, `/appointments`, `/medical-records`, `/profile`, dll **DILARANG**.
   - Frontend harus me-redirect ke `/login?callbackUrl=...`.
3. **Jika User Login tapi Status `emailVerified: false`**:
   - Redirect ke `/verify-otp?email=...`.

#### B. Sidebar Navigasi Bersyarat (*Conditional Sidebar*)
Sidebar navigasi tidak boleh menampilkan menu yang sama untuk semua orang. Tampilkan menu berdasarkan peran (`session.user.role`):

- **Guest / Publik**:
  - Beranda (`/`)
  - Jadwal Dokter (`/schedules`)
  - Fasilitas & Layanan (`/services`)
  - Tombol Masuk / Daftar
- **Role: `patient` (Pasien)**:
  - Dashboard Pasien
  - Buat Janji Temu / Booking (`/appointments`)
  - Rekam Medis Saya (`/medical-records`)
  - Tiket Antrean Aktif (`/queue`)
  - Profil & Notifikasi
  - Tombol Keluar (Logout)
- **Role: `staffDoctor` / `staffMidwife` (Dokter / Bidan)**:
  - Dashboard Praktik
  - Antrean Poli Hari Ini
  - Pemeriksaan & Input Rekam Medis Pasien
  - Presensi Masuk/Pulang (Scan QR)
  - Jadwal Jaga Saya
  - Tombol Keluar (Logout)
- **Role: `admin` (Administrator Klinik)**:
  - Dashboard Statistik Klinik
  - Manajemen Pengguna & Tenaga Medis
  - Pengaturan Jadwal Poli & Ruangan
  - Laporan & Audit Log Aktivitas
  - Tombol Keluar (Logout)

---

### 4. Action Items untuk Frontend Agent

- [ ] Install plugin client `better-auth/client/plugins` dan tambahkan `emailOTPClient()` pada instance `authClient`.
- [ ] Buat halaman `/verify-otp` dengan form input 6-digit kode OTP dan tombol "Kirim Ulang Kode".
- [ ] Ubah form register: setelah `authClient.signUp.email` sukses, langsung arahkan navigasi ke `/verify-otp?email=...`.
- [ ] Pasang Next.js / React Router Navigation Guard di Middleware:
  - Cegah user yang sudah memiliki sesi mengakses halaman login/register.
  - Cegah user yang belum login mengakses rute privat.
- [ ] Render menu Sidebar secara kondisional sesuai `session.user.role`.
- [ ] Pastikan tombol "Login dengan Google" memanggil `authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' })`.
- [ ] Cek status email yang dikirim pada lingkungan lokal developer di Mailpit Web UI: `http://localhost:8025`.
