# Frontend Delegation Changelog: Systemic Self-Account Deletion (Account Purge)

> **Dokumen Resmi Delegasi Backend ke Tim Frontend**  
> **Modul:** `auth` / `account-settings`  
> **Target Audiens:** Frontend Engineer, UI/UX Designer, Frontend Agent  
> **Tingkat Urgensi:** 🟢 **Feature Ready (Live & Verified)**  
> **Tanggal:** 19 September 2026  
> **Status:** Released (Commit `bde7b9b`)

---

## 1. Ringkasan Eksekutif (Executive Summary)

Backend kini menyediakan fitur **Penghapusan Akun Mandiri Secara Sistemik (*Systemic Self-Account Deletion / GDPR Right to Erasure*)** melalui endpoint:

```http
DELETE /api/v1/auth/me
```

Berbeda dengan penonaktifan biasa (*soft-delete*), endpoint ini melakukan **pembersihan menyeluruh (*hard-purge*)** di seluruh level infrastruktur:
1. **Database PostgreSQL:** Menghapus seluruh entitas yang berelasi dengan pengguna di seluruh tabel (profil pengguna, akun kredensial, sesi Better Auth, akun Google OAuth, profil pasien, rekam medis, riwayat antrean, alamat, kontak darurat, dsb.) secara berurutan (*reverse-dependency order*) tanpa melanggar *foreign key constraints*.
2. **Redis Cache & Session Store:** Menghapus seluruh sesi aktif, cache profil, token verifikasi, cooldown OTP, dan batasan *rate limiting* yang terikat dengan ID pengguna maupun alamat email terkait.
3. **Fresh Slate Guarantee:** Pengguna dapat mendaftar kembali dengan email atau akun Google yang sama di masa mendatang seolah-olah merupakan pengguna yang baru pertama kali mendaftar (*fresh account*).

---

## 2. Autentikasi & Dukungan Dual-Engine

Endpoint ini dilindungi oleh [`HybridAuthGuard`](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts), sehingga mendukung kedua metode login secara transparan:
- **Login Email & Password:** Menggunakan Kanonikal Passport JWT Bearer token (`Authorization: Bearer <jwt_access_token>`).
- **Login Google OAuth:** Menggunakan Better Auth Session Token (`Authorization: Bearer <better_auth_session_token>` atau via cookie sesi `better-auth.session_token`).

---

## 3. Spesifikasi Kontrak API

### Request

```http
DELETE /api/v1/auth/me HTTP/1.1
Host: localhost:3001
Authorization: Bearer <access_token | session_token>
Accept: application/json
```

### Response Berhasil (HTTP 200 OK)

```json
{
  "success": true,
  "message": "Akun dan seluruh data pengguna terkait telah berhasil dihapus secara permanen dari sistem.",
  "purgedAt": "2026-09-19T16:49:55.692Z",
  "details": {
    "userId": "558ffd6a-fc0b-49d2-8b03-021e5606b708",
    "email": "pasien@amanah.health"
  }
}
```

### Error Responses

#### 1. `401 UNAUTHORIZED` (Token Tidak Ada atau Kedaluwarsa)
```json
{
  "type": "https://amanah.health/errors/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "statusCode": 401,
  "detail": "Sesi autentikasi tidak valid atau token tidak disertakan",
  "message": "Sesi autentikasi tidak valid atau token tidak disertakan",
  "instance": "/api/v1/auth/me",
  "code": "UNAUTHORIZED"
}
```
*Tindakan Frontend:* Langsung arahkan pengguna ke halaman login (`/auth/sign-in`).

#### 2. `500 INTERNAL_SERVER_ERROR` (Kegagalan Eksekusi Database)
```json
{
  "type": "https://amanah.health/errors/internal_server_error",
  "title": "Internal Server Error",
  "status": 500,
  "statusCode": 500,
  "detail": "Gagal membersihkan data akun secara sistemik.",
  "message": "Gagal membersihkan data akun secara sistemik."
}
```
*Tindakan Frontend:* Tampilkan alert/toast error "Gagal menghapus akun. Silakan hubungi layanan bantuan kami."

---

## 4. Panduan Integrasi Frontend (Best Practices)

Ketika pengguna mengonfirmasi penghapusan akun pada modal konfirmasi:

1. **Kirim Request `DELETE /api/v1/auth/me`** dengan Bearer token yang aktif.
2. **Pembersihan State Lokal Client:**
   - Hapus token dari `localStorage` atau `sessionStorage` (misal: `auth_token`, `refresh_token`).
   - Hapus cookie `better-auth.session_token` jika ada.
   - Bersihkan cache React Query / SWR / Redux store (`queryClient.clear()`).
3. **Umpan Balik Pengguna:** Tampilkan notifikasi toast sukses (misal: *"Akun Anda telah berhasil dihapus secara permanen."*).
4. **Navigasi:** Alihkan pengguna ke halaman beranda (`/`) atau halaman login (`/auth/sign-in`).

---

## 5. Cuplikan Kode Siap Pakai (TypeScript / Next.js)

### A. Service Layer (`delete-account-service.ts`)

```typescript
import axios from 'axios';

export interface DeleteAccountResponse {
  success: boolean;
  message: string;
  purgedAt: string;
  details?: {
    userId: string;
    email?: string;
  };
}

export async function deleteMyAccount(token: string): Promise<DeleteAccountResponse> {
  const response = await axios.delete<DeleteAccountResponse>(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/me`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      withCredentials: true,
    }
  );
  return response.data;
}
```

### B. React Component / Hook (`useDeleteAccount.ts`)

```typescript
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMyAccount } from './delete-account-service';

export function useDeleteAccount() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await deleteMyAccount(token);

      // 1. Bersihkan state & token lokal
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');

      // 2. Arahkan ke landing page dengan flag query param
      router.push('/auth/sign-in?deleted=true');
    } catch (err: any) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Gagal menghapus akun. Silakan coba lagi.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return { handleDelete, isLoading, error };
}
```

---

## 6. Bukti Verifikasi Live

Pengujian live end-to-end telah dijalankan dan diverifikasi melalui script otomatis [`scripts/e2e/test-account-deletion.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-account-deletion.ps1):

```text
=== 1. Registering test user: purge_test_user@amanah.health ===
Registration successful (HTTP 204)

=== 2. Logging in to acquire JWT token ===
Logged in successfully! User ID: 558ffd6a-fc0b-49d2-8b03-021e5606b708

=== 3. Completing Patient Onboarding Registration ===
Patient created with Medical Record: RM-202609-0005

=== 4. Setting test keys in Redis DB 1 ===
Redis keys matching user before purge: 2

=== 5. Calling DELETE /api/v1/auth/me ===
Delete response: HTTP 200 OK
{
  "success": true,
  "message": "Akun dan seluruh data pengguna terkait telah berhasil dihapus secara permanen dari sistem.",
  "purgedAt": "2026-09-19T16:49:55.692Z",
  "details": {
    "userId": "558ffd6a-fc0b-49d2-8b03-021e5606b708",
    "email": "purge_test_user@amanah.health"
  }
}

=== 6. Verifying Database Cleanliness ===
users: 0 | user: 0 | patient_profiles: 0 | auth_accounts: 0

=== 7. Verifying Redis Cleanliness in DB 1 ===
Residual Redis keys in DB 1: 0

=== 8. Re-registering user to prove completely fresh slate ===
Re-registration successful! No conflict or stale state!

ALL PURGE VERIFICATION CHECKS PASSED 100% SUCCESFULLY!
```
