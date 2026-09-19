# Frontend Integration Changelog & Delegation Guide: Patient Profile CRUD & Exposure

> **Modul:** `data-pasien` / `patient-profile` / `patient-crud`  
> **Target Audiens:** Frontend Engineer / Frontend Agent  
> **Tanggal Rilis Backend:** 20 September 2026  
> **Status API:** Live & Fully Verified (Production Ready)  
> **Kompatibilitas:** Next.js Server Actions, RSC, React Query, & SWR

---

## 1. Ringkasan Eksekutif (Executive Summary)

Setelah pengguna menyelesaikan proses registrasi awal melalui modal barrier (`POST /api/v1/patients/registration`), pengguna kini memiliki akses penuh untuk **melihat seluruh data rekam medis mereka** dan **memperbarui (edit) data profil mereka kapan saja** dari halaman profil pengguna (*User Profile Settings*).

Backend telah mengimplementasikan dan memverifikasi siklus CRUD lengkap dengan kapabilitas:
1. **Ekspos Lengkap Seluruh Atribut Pasien (`GET /api/v1/patients/me` & `GET /api/v1/auth/me`):**
   - Menampilkan seluruh 17 atribut demografi yang diisi saat registrasi awal.
   - Menyediakan data alamat lengkap baik dalam format teks terpadu (`address`) maupun komponen terstruktur (`alamatDetail`, `provinsi`, `provinsiId`, `kabupaten`, `kabupatenId`, `kecamatan`, `kecamatanId`, `kelurahan`, `kelurahanId`).
   - Menyediakan data kontak darurat terpadu (`emergencyContactName`, `emergencyContactPhone`, `emergencyContactRelationship`).
   - Menampilkan Nomor Rekam Medis resmi (`medicalRecordNumber`), NIK, tempat/tanggal lahir, jenis kelamin, golongan darah, nama ibu kandung, pekerjaan, dan nomor telepon.
2. **Pembaruan Mandiri Profil Pasien (`PATCH /api/v1/patients/me`):**
   - Pasien login dapat memperbarui data demografi, alamat domisili, kontak darurat, dan pekerjaan tanpa perlu menyertakan UUID pasien di URL.
   - Mendukung input dalam format **camelCase** maupun **snake_case** (kompatibel penuh dengan form registrasi awal).
   - Sinkronisasi otomatis ke tabel relasi `patient_addresses` dan `patient_emergency_contacts`.
3. **Proteksi & Otorisasi Keamanan Ketat (HIPAA & Regulasi Rekam Medis):**
   - Pasien dengan peran `PATIENT` **hanya diizinkan** mengakses dan mengubah rekam medis milik akunnya sendiri (`GET /:id` dan `PATCH /:id` dipagari ownership check, mengembalikan `403 Forbidden` jika mencoba mengakses data pasien lain).

---

## 2. Spesifikasi Endpoint CRUD Profil Pasien

### A. Mendapatkan Profil Lengkap Pasien Login (`GET /api/v1/patients/me`)
- **Method / URL:** `GET /api/v1/patients/me`
- **Headers:**
  ```http
  Authorization: Bearer <access_token>
  ```
- **Response Sukses (HTTP 200 OK):**
  ```json
  {
    "id": "564aa704-3fbb-4cc7-a6ef-70fb155f2fa9",
    "userId": "a376b0aa-6ff3-48d4-a970-ade3d1923a59",
    "medicalRecordNumber": "RM-202609-0006",
    "nik": "3201789838515153",
    "fullName": "Ahmad Dahlan",
    "gender": "Laki-laki",
    "birthPlace": "Bandung",
    "birthDate": "1992-08-17",
    "bloodType": "O",
    "namaIbuKandung": "Maryam",
    "pekerjaan": "Software Engineer",
    "phoneNumber": "081234567890",
    "address": "Jl. Dipati Ukur No. 45 RT 03 RW 02, Kel. Dago, Kec. Coblong, Kota Bandung, Prov. Jawa Barat",
    "alamatDetail": "Jl. Dipati Ukur No. 45 RT 03 RW 02",
    "provinsi": "Jawa Barat",
    "provinsiId": "32",
    "kabupaten": "Kota Bandung",
    "kabupatenId": "3273",
    "kecamatan": "Coblong",
    "kecamatanId": "327301",
    "kelurahan": "Dago",
    "kelurahanId": "3273011001",
    "addressDetail": {
      "id": "31b1c3bb-ff11-4ca0-98fe-dcf176211822",
      "type": "domicile",
      "provinceCode": "32",
      "provinceName": "Jawa Barat",
      "regencyCode": "3273",
      "regencyName": "Kota Bandung",
      "districtCode": "327301",
      "districtName": "Coblong",
      "villageCode": "3273011001",
      "villageName": "Dago",
      "line1": "Jl. Dipati Ukur No. 45 RT 03 RW 02",
      "fullAddress": "Jl. Dipati Ukur No. 45 RT 03 RW 02, Kel. Dago, Kec. Coblong, Kota Bandung, Prov. Jawa Barat",
      "isPrimary": true
    },
    "emergencyContactName": "Fatimah Azzahra",
    "emergencyContactPhone": "081987654321",
    "emergencyContactRelationship": "Istri",
    "emergencyContactDetail": {
      "id": "e81d77a2-11a5-423f-b631-fef123456789",
      "name": "Fatimah Azzahra",
      "phone": "081987654321",
      "relationship": "Istri",
      "notes": null
    },
    "allergies": [],
    "medicalHistory": null,
    "avatarUrl": null,
    "status": "active",
    "createdAt": "2026-09-19T17:21:55.123Z",
    "updatedAt": "2026-09-19T17:21:55.123Z"
  }
  ```

---

### B. Memperbarui Profil Pasien Mandiri (`PATCH /api/v1/patients/me`)
- **Method / URL:** `PATCH /api/v1/patients/me`
- **Headers:**
  ```http
  Authorization: Bearer <access_token>
  Content-Type: application/json
  ```
- **Request Body (Mendukung camelCase maupun snake_case):**
  Semua field bersifat opsional. Hanya field yang dikirim yang akan diperbarui di database.
  ```json
  {
    "fullName": "Ahmad Dahlan M.T.",
    "pekerjaan": "Principal Software Architect",
    "phoneNumber": "081234567890",
    "alamatDetail": "Jl. Ir. H. Juanda No. 99 RT 01 RW 01",
    "provinsi": "Jawa Barat",
    "provinsiId": "32",
    "kabupaten": "Kota Bandung",
    "kabupatenId": "3273",
    "kecamatan": "Coblong",
    "kecamatanId": "327301",
    "kelurahan": "Lebakgede",
    "kelurahanId": "3273011002",
    "emergencyContactName": "Fatimah Azzahra",
    "emergencyContactPhone": "081987654321",
    "emergencyContactRelationship": "Istri",
    "medicalHistory": "Alergi obat golongan penisilin"
  }
  ```
- **Response Sukses (HTTP 200 OK):**
  Mengembalikan objek `PatientEntity` lengkap yang telah diperbarui.

---

### C. Sinkronisasi Sesi Autentikasi (`GET /api/v1/auth/me`)
Endpoint `GET /api/v1/auth/me` kini juga menyertakan data pasien yang telah diperkaya pada atribut `user.patient`:
```json
{
  "id": "a376b0aa-6ff3-48d4-a970-ade3d1923a59",
  "name": "Ahmad Dahlan",
  "email": "ahmad@example.com",
  "systemRole": "PATIENT",
  "patient": {
    "id": "564aa704-3fbb-4cc7-a6ef-70fb155f2fa9",
    "userId": "a376b0aa-6ff3-48d4-a970-ade3d1923a59",
    "medicalRecordNumber": "RM-202609-0006",
    "nik": "3201789838515153",
    "fullName": "Ahmad Dahlan M.T.",
    "gender": "Laki-laki",
    "birthPlace": "Bandung",
    "birthDate": "1992-08-17",
    "bloodType": "O",
    "namaIbuKandung": "Maryam",
    "pekerjaan": "Principal Software Architect",
    "phoneNumber": "081234567890",
    "address": "Jl. Ir. H. Juanda No. 99 RT 01 RW 01, Kel. Lebakgede, Kec. Coblong, Kota Bandung, Prov. Jawa Barat",
    "alamatDetail": "Jl. Ir. H. Juanda No. 99 RT 01 RW 01",
    "provinsi": "Jawa Barat",
    "provinsiId": "32",
    "kabupaten": "Kota Bandung",
    "kabupatenId": "3273",
    "kecamatan": "Coblong",
    "kecamatanId": "327301",
    "kelurahan": "Lebakgede",
    "kelurahanId": "3273011002",
    "emergencyContactName": "Fatimah Azzahra",
    "emergencyContactPhone": "081987654321",
    "emergencyContactRelationship": "Istri",
    "status": "active"
  }
}
```

---

## 3. TypeScript Interfaces untuk Frontend

Frontend dapat menyalin antarmuka TypeScript berikut untuk komponen profil pasien:

```typescript
export interface PatientAddressDetail {
  id?: string;
  type: string;
  provinceCode?: string | null;
  provinceName?: string | null;
  regencyCode?: string | null;
  regencyName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  villageCode?: string | null;
  villageName?: string | null;
  line1: string;
  fullAddress: string;
  isPrimary: boolean;
}

export interface PatientEmergencyContactDetail {
  id?: string;
  name?: string | null;
  phone: string;
  relationship?: string | null;
  notes?: string | null;
}

export interface PatientProfile {
  id: string;
  userId: string;
  medicalRecordNumber: string;
  nik: string;
  fullName: string;
  gender: 'Laki-laki' | 'Perempuan';
  birthPlace: string;
  birthDate: string;
  bloodType: 'A' | 'B' | 'AB' | 'O' | 'Belum Tahu';
  namaIbuKandung?: string | null;
  pekerjaan?: string | null;
  phoneNumber: string;
  address: string;
  alamatDetail?: string | null;
  provinsi?: string | null;
  provinsiId?: string | null;
  kabupaten?: string | null;
  kabupatenId?: string | null;
  kecamatan?: string | null;
  kecamatanId?: string | null;
  kelurahan?: string | null;
  kelurahanId?: string | null;
  addressDetail?: PatientAddressDetail | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactDetail?: PatientEmergencyContactDetail | null;
  allergies?: any[];
  medicalHistory?: string | null;
  avatarUrl?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface UpdatePatientProfilePayload {
  fullName?: string;
  name?: string;
  nik?: string;
  namaIbuKandung?: string;
  nama_ibu_kandung?: string;
  birthPlace?: string;
  tempat_lahir?: string;
  birthDate?: string;
  birth_date?: string;
  gender?: 'Laki-laki' | 'Perempuan';
  bloodType?: 'A' | 'B' | 'AB' | 'O' | 'Belum Tahu';
  blood_type?: 'A' | 'B' | 'AB' | 'O' | 'Belum Tahu';
  phoneNumber?: string;
  phone?: string;
  pekerjaan?: string;
  address?: string;
  alamatDetail?: string;
  alamat_detail?: string;
  provinsi?: string;
  provinsiId?: string;
  provinsi_id?: string;
  kabupaten?: string;
  kabupatenId?: string;
  kabupaten_id?: string;
  kecamatan?: string;
  kecamatanId?: string;
  kecamatan_id?: string;
  kelurahan?: string;
  kelurahanId?: string;
  kelurahan_id?: string;
  emergencyContactName?: string;
  nama_kontak_darurat?: string;
  emergencyContactPhone?: string;
  nomor_kontak_darurat?: string;
  emergencyContactRelationship?: string;
  hubungan_kontak_darurat?: string;
  medicalHistory?: string;
  avatarUrl?: string;
}
```

---

## 4. Panduan Integrasi Frontend (Contoh Implementasi)

### A. React Query Hook (Membaca Profil Pasien)
```typescript
import { useQuery } from '@tanstack/react-query';
import type { PatientProfile } from '@/types/patient';

export function usePatientProfile() {
  return useQuery<PatientProfile>({
    queryKey: ['patient-profile', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/v1/patients/me', {
        headers: {
          'Content-Type': 'application/json',
          // Jika menggunakan cookie sesi Better Auth / JWT Bearer
        },
      });
      if (!res.ok) {
        throw new Error('Gagal mengambil data profil pasien');
      }
      return res.json();
    },
  });
}
```

### B. React Query Mutation (Mengubah Profil Pasien)
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PatientProfile, UpdatePatientProfilePayload } from '@/types/patient';

export function useUpdatePatientProfile() {
  const queryClient = useQueryClient();

  return useMutation<PatientProfile, Error, UpdatePatientProfilePayload>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/v1/patients/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || errorData.message || 'Gagal memperbarui profil');
      }

      return res.json();
    },
    onSuccess: (updatedProfile) => {
      // Invalidate cache agar UI langsung ter-update otomatis
      queryClient.setQueryData(['patient-profile', 'me'], updatedProfile);
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}
```

---

## 5. Ringkasan Status Verifikasi Backend

- [x] `GET /api/v1/patients/me` mengembalikan seluruh 17 atribut demografi + alamat terstruktur + kontak darurat.
- [x] `PATCH /api/v1/patients/me` berhasil memperbarui data demografi, alamat di `patient_addresses`, dan kontak darurat di `patient_emergency_contacts`.
- [x] `GET /api/v1/auth/me` berhasil mengembalikan objek `user.patient` yang telah diperkaya.
- [x] Proteksi otorisasi HIPAA (`GET /:id` & `PATCH /:id`) mencegah pasien mengakses data milik pasien lain.
- [x] Seluruh 14 test suites dan 97 unit/integration tests lulus (`npm test`).
