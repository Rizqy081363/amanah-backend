# Frontend Integration Changelog & Delegation Guide: Post-Authentication Patient Registration Modal Barrier

> **Modul:** `data-pasien` / `patient-onboarding`  
> **Target Audiens:** Frontend Engineer / Frontend Agent  
> **Tanggal Rilis Backend:** 19 September 2026  
> **Status API:** Live & Fully Verified (Production Ready)  
> **Kompatibilitas:** Next.js Server Actions & RSC (`app/dashboard/layout.tsx`)

---

## 1. Ringkasan Perubahan Backend

Backend Amanah Healthcare kini telah menyediakan endpoint resmi dan kontrak autentikasi terpusat untuk memvalidasi dan memblokir pengguna dengan peran pasien (`patient`) yang belum melengkapi data rekam medis demografi pertama kali login:

1. **Endpoint Registrasi Pasien Mandiri:**  
   `POST /api/v1/patients/registration` (HTTP 201 Created)  
   Menerima 17 atribut demografi & domisili, membuat rekam medis resmi dengan auto-generate nomor rekam medis (`RM-YYYYMM-XXXX`), dan memetakan alamat domisili ke relasi spasial.
2. **Sinkronisasi Sesi Autentikasi (`GET /api/v1/auth/me`):**  
   - Ketika pasien **belum melengkapi** data: `user.patient` mengembalikan nilai `null`.
   - Ketika pasien **sudah melengkapi** data: `user.patient` mengembalikan objek profil pasien lengkap (`id`, `medicalRecordNumber`, `nik`, `fullName`, `gender`, dll).
3. **Validasi & Proteksi Keamanan:**  
   - **409 Conflict (`PATIENT_ALREADY_REGISTERED`):** Mencegah registrasi berulang jika akun sudah memiliki rekam medis.
   - **409 Conflict (`DUPLICATE_NIK`):** Mencegah penggunaan NIK KTP yang sama oleh dua akun pasien yang berbeda.
   - **422 Unprocessable Entity (`VALIDATION_FAILED`):** Validasi ketat format NIK (16 digit angka), nama ibu kandung, tanggal lahir (`YYYY-MM-DD`), dan pilihan enumerasi.

---

## 2. Spesifikasi Kontrak API

### A. Endpoint Registrasi Pasien
- **Method / URL:** `POST /api/v1/patients/registration`
- **Headers:**
  ```http
  Authorization: Bearer <access_token>
  Content-Type: application/json
  ```
- **Request Body (17 Atribut Sesuai Zod Schema Frontend):**
  ```json
  {
    "name": "Budi Santoso",
    "nik": "3201012304950001",
    "nama_ibu_kandung": "Siti Aminah",
    "tempat_lahir": "Bandung",
    "birth_date": "1995-04-23",
    "gender": "Laki-laki",
    "blood_type": "O",
    "provinsi": "Jawa Barat",
    "provinsi_id": "32",
    "kabupaten": "Kota Bandung",
    "kabupaten_id": "3273",
    "kecamatan": "Coblong",
    "kecamatan_id": "327301",
    "kelurahan": "Dago",
    "kelurahan_id": "3273011001",
    "alamat_detail": "Jl. Dago Asri No. 12, RT 01 / RW 02",
    "pekerjaan": "Karyawan Swasta",
    "phone": "081234567890"
  }
  ```
- **Response Sukses (HTTP 201 Created):**
  ```json
  {
    "id": "5ebb1256-a416-457b-8241-af0b89f78753",
    "userId": "a376b0aa-6ff3-48d4-a970-ade3d1923a59",
    "medicalRecordNumber": "RM-202609-0001",
    "nik": "3201012304950001",
    "fullName": "Budi Santoso",
    "gender": "Laki-laki",
    "birthPlace": "Bandung",
    "birthDate": "1995-04-23",
    "bloodType": "O",
    "namaIbuKandung": "Siti Aminah",
    "pekerjaan": "Karyawan Swasta",
    "phoneNumber": "081234567890",
    "address": "Jl. Dago Asri No. 12, RT 01 / RW 02, Kel. Dago, Kec. Coblong, Kota Bandung, Prov. Jawa Barat",
    "emergencyContactName": null,
    "emergencyContactPhone": null,
    "allergies": [],
    "medicalHistory": null,
    "avatarUrl": null,
    "createdAt": "2026-09-19T15:17:09.654Z",
    "updatedAt": "2026-09-19T15:17:09.654Z"
  }
  ```

### B. Response Penanganan Error (RFC 7807 Problem Details)
- **409 Conflict — Akun Sudah Terdaftar:**
  ```json
  {
    "type": "https://amanah.health/errors/patient_already_registered",
    "title": "Conflict",
    "status": 409,
    "statusCode": 409,
    "detail": "Akun Anda sudah memiliki profil pasien terdaftar.",
    "message": "Akun Anda sudah memiliki profil pasien terdaftar.",
    "instance": "/api/v1/patients/registration",
    "code": "PATIENT_ALREADY_REGISTERED"
  }
  ```
- **409 Conflict — NIK Duplikat:**
  ```json
  {
    "type": "https://amanah.health/errors/duplicate_nik",
    "title": "Conflict",
    "status": 409,
    "statusCode": 409,
    "detail": "NIK ini sudah terdaftar pada rekam medis pasien lain.",
    "message": "NIK ini sudah terdaftar pada rekam medis pasien lain.",
    "instance": "/api/v1/patients/registration",
    "code": "DUPLICATE_NIK"
  }
  ```
- **422 Unprocessable Entity — Validasi Gagal:**
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
        "name": "nik",
        "reason": "NIK harus berupa 16 digit angka",
        "code": "INVALID_VALUE"
      }
    ]
  }
  ```

---

## 3. Panduan Langkah Integrasi di Frontend (`manage-stock`)

### Langkah 1: Tambahkan Path API di `src/server/api/paths.ts`
Pastikan path endpoint registrasi pasien tersedia:
```typescript
export const paths = {
  // ...
  patients: {
    base: () => '/api/v1/patients',
    registration: () => '/api/v1/patients/registration',
    me: () => '/api/v1/patients/me',
    byId: (id: string) => `/api/v1/patients/${id}`,
    byNik: (nik: string) => `/api/v1/patients/by-nik/${nik}`
  }
};
```

### Langkah 2: Perbarui `src/features/data-pasien/api/patient-registration-service.ts`
Ganti implementasi mock in-memory dan pembacaan cookie sementara dengan pengecekan database terpusat via `loadCurrentUser()` dan pemanggilan HTTP API:

```typescript
import 'server-only';

import { loadCurrentUser } from '@/server/loaders/auth.loader';
import { httpClient } from '@/server/http/http-client';
import { paths } from '@/server/api/paths';
import { AppError } from '@/core/errors/app-error';
import { getAccessTokenCookie } from '@/server/auth/token-store';
import type { PatientRegistrationFormValues } from '../schemas/patient-registration-schema';

type CurrentRegistrationContext = {
  isComplete: boolean;
  initialName: string;
};

type CompletePatientRegistrationInput = {
  userId: string;
  values: PatientRegistrationFormValues;
};

type CompletePatientRegistrationResult =
  | {
      success: true;
      patientRecordId: string;
    }
  | {
      success: false;
      message: string;
    };

/**
 * Memeriksa status kelengkapan data rekam medis pasien langsung dari profil database kanonikal.
 * Jika currentUser.patient bernilai objek, pasien sudah terdaftar. Jika null, barrier aktif.
 */
export async function getCurrentPatientRegistrationContext(
  _userId: string
): Promise<CurrentRegistrationContext> {
  const currentUser = await loadCurrentUser();

  return {
    isComplete: Boolean(currentUser?.patient),
    initialName: currentUser?.name ?? currentUser?.patient?.fullName ?? ''
  };
}

/**
 * Menyimpan data registrasi pasien mandiri 17-field ke PostgreSQL backend.
 */
export async function completePatientRegistration({
  userId: _userId,
  values
}: CompletePatientRegistrationInput): Promise<CompletePatientRegistrationResult> {
  const token = await getAccessTokenCookie();
  if (!token) {
    return {
      success: false,
      message: 'Sesi login tidak valid atau telah berakhir. Silakan masuk kembali.'
    };
  }

  try {
    const response = await httpClient.request<any>(
      paths.patients.registration(),
      // schema: can use z.any() or patientEntitySchema
      undefined as any,
      {
        method: 'POST',
        tokenOverride: token,
        body: values,
        cache: 'no-store'
      }
    );

    return {
      success: true,
      patientRecordId: response.id || response.medicalRecordNumber
    };
  } catch (error: any) {
    if (error instanceof AppError) {
      if (error.code === 'DUPLICATE_NIK') {
        return {
          success: false,
          message: 'NIK ini sudah terdaftar pada rekam medis pasien lain di sistem klinik.'
        };
      }
      if (error.code === 'PATIENT_ALREADY_REGISTERED') {
        return {
          success: false,
          message: 'Akun Anda sudah memiliki profil pasien terdaftar.'
        };
      }
      return {
        success: false,
        message: error.message || 'Gagal menyimpan data pendaftaran pasien.'
      };
    }

    return {
      success: false,
      message: error?.message || 'Terjadi kesalahan jaringan saat menyimpan data pasien.'
    };
  }
}
```

### Langkah 3: Revalidasi Status di Client Modal
Setelah submit berhasil pada form `PatientRegistrationModal`:
1. Panggil `router.refresh()` agar Server Component layout me-reload `loadCurrentUser()`.
2. Sesi otomatis mendeteksi `currentUser.patient !== null`, sehingga modal barrier langsung ditutup secara permanen tanpa memerlukan reload penuh atau cookie manual.

---

## 4. Matriks Pengujian & Verifikasi yang Telah Dilakukan

| Skenario | Endpoint & Aksi | Output & Status Code | Hasil Verifikasi |
|---|---|---|---|
| 1. Pasien belum terdaftar | `GET /api/v1/auth/me` | 200 OK, `patient: null`, `systemRole: "PATIENT"` | **PASSED** (Barrier aktif) |
| 2. Submit form registrasi | `POST /api/v1/patients/registration` | 201 Created, `RM-202609-0001` auto-generated | **PASSED** (Data tersimpan di Postgres) |
| 3. Pasien sudah terdaftar | `GET /api/v1/auth/me` | 200 OK, `patient: { ... }` terpopulasi | **PASSED** (Barrier otomatis terangkat) |
| 4. Submit ganda akun sama | `POST /api/v1/patients/registration` | 409 Conflict (`PATIENT_ALREADY_REGISTERED`) | **PASSED** (Mencegah rekam medis ganda) |
| 5. Submit NIK sama akun lain | `POST /api/v1/patients/registration` | 409 Conflict (`DUPLICATE_NIK`) | **PASSED** (Integritas NIK terjaga) |
| 6. Validasi format form salah | `POST /api/v1/patients/registration` | 422 Unprocessable Entity (`VALIDATION_FAILED`) | **PASSED** (Validasi 17 atribut aktif) |
