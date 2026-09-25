# Panduan Integrasi Frontend: Profile Avatar & Media Pipeline (Next.js Web Admin)

**Target:** Tim Pengembang Web Admin Next.js (Amanah Healthcare Clinical & Admin Portal)  
**Dokumen:** Panduan Teknis & Kontrak Integrasi Avatar Web  
**Versi API:** `v1.2.0-avatar-lifecycle`  
**Base URL Development:** `http://localhost:3001`  
**Framework Target:** Next.js (App Router / Pages Router) + TypeScript + Tailwind CSS

---

## 1. Apa Saja Ekspektasi di Sisi Web Admin Next.js?

Web Admin mengelola operasional klinis (Dashboard Direksi, Jadwal Dokter, Manajemen Staf Medis, Rekam Medis, dan Antrean). Ekspektasi arsitektur di sisi Next.js adalah sebagai berikut:

### 1.1. Konfigurasi Domain Gambar (`next/image`)
Next.js membatasi pemuatan gambar eksternal melalui mekanisme pengoptimalan bawaan. Tim Web **wajib mendaftarkan remote pattern** di `next.config.js` / `next.config.mjs` agar backend URL dan Google CDN dapat dimuat tanpa error `Invalid src prop`:
- Domain Backend: `localhost:3001` dan domain produksi `api.amanah.health`
- Domain Google OAuth: `lh3.googleusercontent.com`

### 1.2. *Zero Broken Images* di Seluruh Tabel & Komponen
Di tabel daftar staf (*Staff Management*), kartu dokter (*Doctor Card*), dan antrean pasien (*Queue Board*), sering kali dokter atau staf belum mengunggah foto.
Backend telah menjamin:
- **Tidak ada URL gambar yang *broken* (404/null).**
- Endpoint `/api/v1/users/:id/avatar` selalu mengembalikan status **HTTP 200 OK** yang valid: baik berupa biner WebP, pengalihan 307 ke Google OAuth, maupun biner SVG inisial.
- Tim web dapat langsung menggunakan inisial bawaan (`avatar.initials`) untuk merender elemen DOM secara instan tanpa menunggu *network roundtrip*.

### 1.3. *Cache-Busting & Invalidation* pada React Query / SWR
Ketika administrator atau dokter memperbarui foto profil mereka:
1. Backend mengembalikan parameter versi `avatarUrl: "...?v=1790076343134"`.
2. Sisi web harus meng-invalidate *query cache* pengguna aktif (`useQuery(['me'])` atau `revalidatePath('/admin/profile')`).
3. Komponen `<Image />` akan langsung memuat foto baru karena query parameter `?v=...` menolak stale cache browser.

### 1.4. Validasi Ukuran & Tipe Berkas di Sisi Klien (*Client-Side Pre-validation*)
Meskipun backend memiliki proteksi sniffing biner *magic-bytes*, sisi web diharapkan memberikan validasi awal:
- Maksimal ukuran berkas: **5 MB**.
- Tipe berkas yang diizinkan: `image/jpeg`, `image/png`, `image/webp`.

---

## 2. Konfigurasi `next.config.mjs`

Buka berkas `next.config.mjs` (atau `next.config.js`) pada proyek Web Next.js Anda dan pastikan konfigurasi `images` mencakup domain berikut:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/api/v1/users/**/avatar**',
      },
      {
        protocol: 'https',
        hostname: 'api.amanah.health',
        pathname: '/api/v1/users/**/avatar**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
```

> **Catatan Penting:** Pengaturan `dangerouslyAllowSVG: true` diperlukan karena backend menyajikan fallback avatar dalam format SVG inisial nama.

---

## 3. TypeScript Interfaces & Tipe Data

Buat berkas tipe data di `@/types/avatar.ts`:

```typescript
// types/avatar.ts

export type AvatarType = 'custom' | 'oauth' | 'initials';

export interface UserAvatar {
  url: string;
  initials: string;
  type: AvatarType;
  hasCustomAvatar: boolean;
  directUrl?: string | null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  imageUrl?: string | null;
  avatar: UserAvatar;
  systemRole: 'ADMIN' | 'STAF' | 'PATIENT';
  needsOnboarding: boolean;
  staff?: {
    id: string;
    fullName: string;
    profession?: string | null;
    photoUrl?: string | null;
    isActive: boolean;
  } | null;
}
```

---

## 4. Komponen Universal: `ClinicAvatar` (React / Tailwind)

Gunakan komponen ini di seluruh portal admin untuk konsistensi visual:

```tsx
// components/common/ClinicAvatar.tsx
'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { UserAvatar } from '@/types/avatar';

interface ClinicAvatarProps {
  avatar?: UserAvatar | null;
  name?: string;
  size?: number; // Ukuran dalam pixel (misal: 32, 40, 48, 64)
  className?: string;
  showStatusIndicator?: boolean;
  isActive?: boolean;
}

export const ClinicAvatar: React.FC<ClinicAvatarProps> = ({
  avatar,
  name = 'User',
  size = 40,
  className = '',
  showStatusIndicator = false,
  isActive = true,
}) => {
  const [imageError, setImageError] = useState(false);
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Inisial fallback
  const initials = avatar?.initials || name.slice(0, 2).toUpperCase();

  // Jika tipe eksplisit inisial atau gambar gagal dimuat -> Render Tailwind Initials Badge
  if (!avatar || avatar.type === 'initials' || imageError) {
    return (
      <div className="relative inline-block select-none">
        <div
          className={`flex items-center justify-center rounded-full bg-sky-600 text-white font-bold shadow-sm transition-transform hover:scale-105 ${className}`}
          style={{
            width: size,
            height: size,
            fontSize: Math.max(12, Math.floor(size * 0.4)),
          }}
          title={name}
        >
          {initials}
        </div>
        {showStatusIndicator && (
          <span
            className={`absolute bottom-0 right-0 block rounded-full ring-2 ring-white ${
              isActive ? 'bg-emerald-500' : 'bg-slate-400'
            }`}
            style={{ width: size * 0.28, height: size * 0.28 }}
          />
        )}
      </div>
    );
  }

  // Resolusi URL gambar
  const rawUrl = avatar.directUrl || avatar.url;
  const fullUrl = rawUrl.startsWith('http')
    ? rawUrl
    : `${backendBaseUrl}${rawUrl}`;

  return (
    <div
      className={`relative inline-block rounded-full overflow-hidden border border-slate-200 bg-slate-100 shadow-sm ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={fullUrl}
        alt={`Foto profil ${name}`}
        fill
        sizes={`${size}px`}
        className="object-cover"
        onError={() => setImageError(true)}
        unoptimized // Menghindari proxy berulang untuk WebP yang sudah teroptimasi
      />
      {showStatusIndicator && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full ring-2 ring-white ${
            isActive ? 'bg-emerald-500' : 'bg-slate-400'
          }`}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  );
};
```

---

## 5. Komponen Form: Upload & Hapus Foto Profil Admin

Komponen interaktif untuk halaman pengaturan profil (`/admin/settings/profile`):

```tsx
// components/profile/ProfileAvatarUploader.tsx
'use client';

import React, { useRef, useState } from 'react';
import { ClinicAvatar } from '../common/ClinicAvatar';
import { UserAvatar } from '@/types/avatar';

interface ProfileAvatarUploaderProps {
  currentAvatar: UserAvatar;
  userName: string;
  token: string;
  onAvatarUpdated: (newAvatar: UserAvatar) => void;
}

export const ProfileAvatarUploader: React.FC<ProfileAvatarUploaderProps> = ({
  currentAvatar,
  userName,
  token,
  onAvatarUpdated,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validasi Ukuran (Maks 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file maksimal 5 MB.');
      return;
    }

    // 2. Validasi Format
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrorMessage('Format berkas harus berupa JPEG, PNG, atau WebP.');
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/users/me/avatar`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Gagal mengunggah foto profil');
      }

      const data = await res.json();
      onAvatarUpdated(data.avatar);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteAvatar = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus foto profil dan kembali ke inisial nama?')) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/users/me/avatar`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) throw new Error('Gagal menghapus avatar');

      onAvatarUpdated({
        url: `/api/v1/users/me/avatar`,
        initials: currentAvatar.initials,
        type: 'initials',
        hasCustomAvatar: false,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus avatar.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex items-center space-x-6 p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
      <ClinicAvatar
        avatar={currentAvatar}
        name={userName}
        size={80}
        className="ring-4 ring-sky-50"
      />

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-slate-800">Foto Profil Akun</h4>
        <p className="text-xs text-slate-500">
          Format didukung: JPEG, PNG, WebP. Maksimal 5 MB.
        </p>

        {errorMessage && (
          <p className="text-xs font-medium text-rose-600">{errorMessage}</p>
        )}

        <div className="flex items-center space-x-3 pt-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition"
          >
            {isUploading ? 'Memproses...' : 'Unggah Foto Baru'}
          </button>

          {currentAvatar.hasCustomAvatar && (
            <button
              type="button"
              disabled={isUploading}
              onClick={handleDeleteAvatar}
              className="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 disabled:opacity-50 transition"
            >
              Hapus Foto
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
```

---

## 6. Ringkasan Checklist Integrasi Web Admin

- [ ] Menambahkan domain backend dan `lh3.googleusercontent.com` pada `images.remotePatterns` di `next.config.mjs`.
- [ ] Mengaktifkan `dangerouslyAllowSVG: true` di `next.config.mjs` untuk mendukung fallback SVG.
- [ ] Menggunakan komponen `ClinicAvatar` pada tabel staf, kartu dokter, dan header navigasi.
- [ ] Menyediakan tombol hapus foto (`DELETE /api/v1/users/me/avatar`) jika `hasCustomAvatar === true`.
- [ ] Melakukan revalidasi cache data setelah proses upload atau penghapusan avatar berhasil.
