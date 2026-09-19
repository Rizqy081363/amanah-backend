# Changelog & Panduan Integrasi Frontend: Mekanisme Resend Code OTP & Verifikasi

> **Dokumen Resmi Integrasi Frontend (Frontend Delegation Changelog)**  
> **Target Pengguna:** Frontend Engineer (Next.js / React), Mobile App Engineer (Flutter / React Native), QA  
> **Modul:** `authentication` (`src/auth`)  
> **Fitur:** Resend OTP & Verification Engine (Verifikasi Email & Lupa Password)  
> **Status:** ✅ **PRODUCTION-READY & VERIFIED ON LIVE STACK**  
> **Tanggal Rilis:** 19 September 2026  

---

## 1. Ringkasan Fitur & Keputusan Arsitektur

Backend Amanah Healthcare kini menyediakan mekanisme pengiriman ulang (**Resend OTP**) yang tangguh, aman (*security-by-design*), dan teruji secara live untuk dua skenario utama:
1. **Verifikasi Email Akun Baru (`email-verification`)**
2. **Pemulihan Kata Sandi / Lupa Password (`forgot-password`)**

### Fitur Utama & Jaminan Keamanan:
- **Cooldown Terisolasi 60 Detik (Redis TTL):**  
  Setiap pengiriman OTP memicu cooldown 60 detik di Redis berdasarkan kombinasi `type` dan `email` (`cooldown:otp:${type}:${email}`). Jika pengguna menekan tombol sebelum cooldown habis, server mengembalikan **HTTP 429 Too Many Requests** lengkap dengan atribut `retryAfter` (sisa detik) agar frontend dapat menyinkronkan timer hitung mundur (*countdown*).
- **Burst Protection (Rate Limiting):**  
  Maksimal 5 permintaan resend per jendela 15 menit per email untuk mencegah penyalahgunaan kuota SMTP dan serangan SMS/Email bombing.
- **Anti-Enumeration Protection:**  
  Jika email yang diminta tidak terdaftar di sistem, endpoint tetap mengembalikan **HTTP 200 OK** dengan pesan generik (`"Jika email terdaftar, kode verifikasi baru telah dikirim..."`), sehingga penyerang tidak dapat mendeteksi keberadaan akun.
- **Dual-Delivery pada Lupa Password (Hybrid UX):**  
  Ketika pengguna meminta resend OTP lupa password, backend secara cerdas memicu **dua pengiriman sekaligus**:
  1. Kode OTP 6-digit untuk pengguna yang ingin mengetikkan kode langsung di antarmuka web/mobile.
  2. Tautan ajaib (*magic link*) kanonikal berstandar SSOT ke email pengguna untuk pengguna yang ingin reset dengan 1-klik via email.
- **Replay Protection & Single-Use OTP:**  
  Setiap kode OTP hanya dapat digunakan satu kali. Kode otomatis kedaluwarsa setelah masa berlaku habis atau setelah berhasil digunakan.
- **Session Revocation Otomatis:**  
  Saat reset password berhasil dieksekusi dengan OTP, semua sesi aktif pengguna di tabel database `"session"` otomatis dicabut demi keamanan.

---

## 2. Spesifikasi Endpoint REST API (Kanonikal)

Semua endpoint berikut berada di bawah prefix `/api/v1/auth`.

```
                  POST /api/v1/auth/otp/resend
                                │
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
type: "email-verification"                  type: "forgot-password"
          │                                           │
  Kirim OTP 6-Digit                           Kirim OTP 6-Digit
(Verifikasi Email Baru)                      + Refresh Magic Link
          │                                           │
          ▼                                           ▼
POST /api/v1/auth/email/verify-otp       POST /api/v1/auth/otp/reset-password
```

---

### 2.1 Kirim Ulang OTP (Unified Resend Endpoint)

* **Endpoint:** `POST /api/v1/auth/otp/resend`
* **Rate Limit:** 5 requests / 60 detik per IP (`@RateLimit`), ditambah Redis cooldown 60s per email/type.
* **Headers:** `Content-Type: application/json`
* **Request Body:**
  ```typescript
  interface AuthResendOtpDto {
    email: string; // Wajib, format email valid, auto lowercase
    type: 'email-verification' | 'forgot-password'; // Wajib, salah satu dari enum
  }
  ```
  *Contoh Payload:*
  ```json
  {
    "email": "pasien@amanah.id",
    "type": "email-verification"
  }
  ```

#### Respon Sukses (HTTP 200 OK)
```json
{
  "success": true,
  "message": "Kode OTP baru berhasil dikirim ke email Anda.",
  "cooldownSeconds": 60
}
```
*Catatan:* Jika email sudah terverifikasi sebelumnya (`type === 'email-verification'`), server mengembalikan:
```json
{
  "success": true,
  "message": "Alamat email ini sudah diverifikasi.",
  "cooldownSeconds": 0
}
```

#### Respon Cooldown Aktif (HTTP 429 Too Many Requests)
Jika tombol resend ditekan saat cooldown masih aktif:
```json
{
  "message": "Mohon tunggu 58 detik sebelum meminta kode baru.",
  "code": "RESEND_COOLDOWN_ACTIVE",
  "retryAfter": 58
}
```

#### Respon Burst Limit Tercapai (HTTP 429 Too Many Requests)
Jika melebihi 5 kali pengiriman dalam 15 menit:
```json
{
  "message": "Batas permintaan kode OTP tercapai. Silakan coba lagi nanti.",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 840
}
```

---

### 2.2 Kirim Ulang Verifikasi Email (Convenience Alias)

* **Endpoint:** `POST /api/v1/auth/email/resend-verification`
* **Tujuan:** Alias khusus jika frontend hanya ingin mengirimkan email tanpa menyebut properti `type`.
* **Request Body:**
  ```json
  {
    "email": "pasien@amanah.id"
  }
  ```
* **Respon:** Sama persis dengan `POST /api/v1/auth/otp/resend` (`type: 'email-verification'`).

---

### 2.3 Verifikasi Email dengan OTP 6-Digit

* **Endpoint:** `POST /api/v1/auth/email/verify-otp`
* **Tujuan:** Memvalidasi 6-digit OTP yang dimasukkan pasien pada form aktivasi akun baru.
* **Request Body:**
  ```json
  {
    "email": "pasien@amanah.id",
    "otp": "486968"
  }
  ```
* **Respon Sukses (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Email berhasil diverifikasi."
  }
  ```
* **Respon Gagal / OTP Salah atau Expired (HTTP 422 Unprocessable Entity):**
  ```json
  {
    "type": "https://amanah.health/errors/validation_failed",
    "title": "Unprocessable Entity",
    "status": 422,
    "statusCode": 422,
    "errors": {
      "otp": "invalidOrExpiredOtp"
    }
  }
  ```

---

### 2.4 Reset Password Menggunakan OTP 6-Digit

* **Endpoint:** `POST /api/v1/auth/otp/reset-password`
* **Tujuan:** Mengatur ulang kata sandi pengguna langsung menggunakan kode OTP 6-digit tanpa harus membuka link email.
* **Request Body:**
  ```json
  {
    "email": "pasien@amanah.id",
    "otp": "486968",
    "password": "NewSecurePassword123!"
  }
  ```
  *Syarat Password:* Minimal 8 karakter (`@MinLength(8)`).
* **Respon Sukses (HTTP 204 No Content):**
  * Body: *kosong*
  * Efek di backend: Password di-hash ulang (bcrypt 10 salt rounds), tabel `auth_accounts` & `account` disinkronkan, semua sesi aktif di `"session"` dicabut.
* **Respon Gagal / OTP Tidak Valid (HTTP 422 Unprocessable Entity):**
  ```json
  {
    "errors": {
      "otp": "invalidOrExpiredOtp"
    }
  }
  ```

---

## 3. Opsi Integrasi Better Auth Client (Untuk SPA / Web Client)

Jika frontend Anda menggunakan SDK `@better-auth/client`:

### A. Kirim Ulang OTP via SDK
```typescript
import { authClient } from '@/lib/auth-client';

// 1. Kirim ulang untuk Verifikasi Email
await authClient.emailOtp.sendVerificationOtp({
  email: 'pasien@amanah.id',
  type: 'email-verification',
});

// 2. Kirim ulang untuk Lupa Password
await authClient.emailOtp.sendVerificationOtp({
  email: 'pasien@amanah.id',
  type: 'forget-password',
});
```

### B. Verifikasi OTP via SDK
```typescript
// Verifikasi Email
await authClient.emailOtp.verifyEmail({
  email: 'pasien@amanah.id',
  otp: '123456',
});

// Reset Password
await authClient.emailOtp.resetPassword({
  email: 'pasien@amanah.id',
  otp: '123456',
  password: 'NewSecurePassword123!',
});
```

---

## 4. Panduan Implementasi Frontend (Copy-Paste Ready)

### 4.1 Custom React Hook: `useOtpCountdown.ts`

Hook ini mengelola status countdown secara otomatis di local storage/session storage, mengunci tombol selama cooldown berlangsung, serta menangani error 429 dari server:

```typescript
// src/hooks/useOtpCountdown.ts
import { useState, useEffect, useCallback } from 'react';

interface UseOtpCountdownOptions {
  storageKey?: string;
  defaultSeconds?: number;
}

export function useOtpCountdown({
  storageKey = 'amanah_otp_cooldown',
  defaultSeconds = 60,
}: UseOtpCountdownOptions = {}) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // Inisialisasi dari sessionStorage agar refresh browser tidak menghilangkan sisa cooldown
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const expiry = sessionStorage.getItem(storageKey);
    if (expiry) {
      const remaining = Math.ceil((parseInt(expiry, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setSecondsLeft(remaining);
      } else {
        sessionStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  // Interval timer tick per detik
  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(storageKey);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft, storageKey]);

  // Mulai hitung mundur (misal 60 detik atau nilai dari API retryAfter)
  const startCooldown = useCallback(
    (seconds: number = defaultSeconds) => {
      setSecondsLeft(seconds);
      if (typeof window !== 'undefined') {
        const expiryTimestamp = Date.now() + seconds * 1000;
        sessionStorage.setItem(storageKey, expiryTimestamp.toString());
      }
    },
    [defaultSeconds, storageKey],
  );

  return {
    secondsLeft,
    isCooldownActive: secondsLeft > 0,
    startCooldown,
  };
}
```

---

### 4.2 Komponen Tombol Resend OTP: `ResendOtpButton.tsx`

```tsx
// src/components/auth/ResendOtpButton.tsx
'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { useOtpCountdown } from '@/hooks/useOtpCountdown';

interface ResendOtpButtonProps {
  email: string;
  type: 'email-verification' | 'forgot-password';
  onSuccess?: (message: string) => void;
  onError?: (errorMessage: string) => void;
  className?: string;
}

export function ResendOtpButton({
  email,
  type,
  onSuccess,
  onError,
  className,
}: ResendOtpButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { secondsLeft, isCooldownActive, startCooldown } = useOtpCountdown({
    storageKey: `otp_cooldown_${type}_${email}`,
    defaultSeconds: 60,
  });

  const handleResend = async () => {
    if (isCooldownActive || isLoading || !email) return;

    setIsLoading(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await axios.post<{
        success: boolean;
        message: string;
        cooldownSeconds: number;
      }>(`${baseUrl}/api/v1/auth/otp/resend`, {
        email,
        type,
      });

      const cooldown = response.data.cooldownSeconds ?? 60;
      if (cooldown > 0) {
        startCooldown(cooldown);
      }
      onSuccess?.(response.data.message || 'Kode verifikasi baru berhasil dikirim.');
    } catch (err: any) {
      if (err.response?.status === 429) {
        const retryAfter = err.response?.data?.retryAfter || 60;
        startCooldown(retryAfter);
        onError?.(err.response?.data?.message || `Mohon tunggu ${retryAfter} detik.`);
      } else {
        onError?.(err.response?.data?.message || 'Gagal mengirim ulang kode OTP. Silakan coba lagi.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleResend}
      disabled={isCooldownActive || isLoading || !email}
      className={className}
    >
      {isLoading
        ? 'Mengirim...'
        : isCooldownActive
        ? `Kirim Ulang Kode (${secondsLeft}s)`
        : 'Kirim Ulang Kode OTP'}
    </Button>
  );
}
```

---

### 4.3 Contoh Integrasi Form Reset Password dengan OTP

Berikut contoh form pemulihan kata sandi yang mendukung input OTP 6-digit dan tombol kirim ulang kode:

```tsx
// src/features/auth/components/reset-password-otp-form.tsx
'use client';

import React, { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResendOtpButton } from '@/components/auth/ResendOtpButton';

export function ResetPasswordOtpForm({ email }: { email: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      setError('Kode OTP harus 6 digit angka.');
      return;
    }

    if (password.length < 8) {
      setError('Kata sandi baru minimal 8 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsSubmitting(true);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await axios.post(`${baseUrl}/api/v1/auth/otp/reset-password`, {
        email,
        otp,
        password,
      });

      setSuccessInfo('Kata sandi berhasil diperbarui! Mengalihkan ke halaman masuk...');
      setTimeout(() => {
        router.push('/auth/sign-in');
      }, 1500);
    } catch (err: any) {
      if (err.response?.status === 422) {
        setError('Kode OTP salah atau telah kedaluwarsa. Silakan minta kode baru.');
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat mereset kata sandi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto">
      {successInfo && (
        <div className="p-3 text-sm bg-green-50 text-green-700 rounded border border-green-200">
          {successInfo}
        </div>
      )}
      {error && (
        <div className="p-3 text-sm bg-red-50 text-red-700 rounded border border-red-200">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Kode OTP 6-Digit</label>
        <Input
          type="text"
          maxLength={6}
          placeholder="Contoh: 486968"
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          disabled={isSubmitting}
          required
        />
        <div className="flex justify-end mt-1">
          <ResendOtpButton
            email={email}
            type="forgot-password"
            onSuccess={(msg) => setSuccessInfo(msg)}
            onError={(err) => setError(err)}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Kata Sandi Baru</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minimal 8 karakter"
          disabled={isSubmitting}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Konfirmasi Kata Sandi</label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Ulangi kata sandi baru"
          disabled={isSubmitting}
          required
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Menyimpan...' : 'Simpan Kata Sandi'}
      </Button>
    </form>
  );
}
```

---

## 5. Bukti Pengujian Nyata (Live Environment Verification)

Seluruh alur dan endpoint telah diuji secara menyeluruh pada container backend yang aktif (`http://localhost:3001`), database PostgreSQL (`5433`), Redis (`6379`), dan Mailpit (`http://localhost:8025`):

| Skenario Pengujian | Input Test | Hasil Pengamatan | Status |
| :--- | :--- | :--- | :---: |
| **Resend OTP Email Verification** | `POST /api/v1/auth/otp/resend`<br>`{"email": "testuser@gmail.com", "type": "email-verification"}` | Status `200 OK`, `cooldownSeconds: 60`, kode OTP 6-digit terkirim ke Mailpit | **PASSED** |
| **Proteksi Cooldown 60s** | Request instan kedua pada email yang sama | Status `429 Too Many Requests`, `code: "RESEND_COOLDOWN_ACTIVE"`, `retryAfter: 58` | **PASSED** |
| **Resend OTP Forgot Password** | `POST /api/v1/auth/otp/resend`<br>`{"email": "testuser@gmail.com", "type": "forgot-password"}` | Status `200 OK`, dua email terkirim ke Mailpit: (1) 6-digit OTP ("Kode Reset Password") & (2) Canonical Magic Link | **PASSED** |
| **Reset Password via OTP 6-Digit** | `POST /api/v1/auth/otp/reset-password`<br>`{"otp": "486968", "password": "NewSecurePassword123!"}` | Status `204 No Content`, password ter-update di PostgreSQL, login dengan password baru sukses `200 OK` | **PASSED** |
| **Replay Protection (Single-Use)** | Kirim ulang OTP `486968` yang sudah dipakai | Status `422 Unprocessable Entity` (`invalidOrExpiredOtp`) | **PASSED** |
| **Verifikasi Email via OTP** | `POST /api/v1/auth/email/verify-otp`<br>`{"email": "testuser@gmail.com", "otp": "..."}` | Status `200 OK`, kolom `email_verified` di PostgreSQL menjadi `true` | **PASSED** |
| **Resend pada Email yang Sudah Terverifikasi** | `POST /api/v1/auth/otp/resend` pada user terverifikasi | Status `200 OK`, `"message": "Alamat email ini sudah diverifikasi."`, `cooldownSeconds: 0` | **PASSED** |

---

*Dokumen ini merupakan panduan resmi integrasi Frontend untuk rilis fitur OTP Resend & Verifikasi Amanah Healthcare.*
