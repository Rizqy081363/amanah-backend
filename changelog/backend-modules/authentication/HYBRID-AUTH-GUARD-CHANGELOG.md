# Frontend Delegation Changelog & Architecture Guide: Dual-Engine `HybridAuthGuard` Support for `/api/v1/*`

> **Dokumen Resmi Delegasi & Sinkronisasi Backend ke Tim Frontend**  
> **Modul Terkait:** `auth`, `patients`, `data-pasien`, dan seluruh API bisnis `/api/v1/*`  
> **Target Audiens:** Frontend Engineer, Frontend Agent (`manage-stock`)  
> **Tanggal Rilis:** 19 September 2026  
> **Status:** Live, Fully Verified, & Production Ready  
> **Tingkat Urgensi:** 🟢 **Resolved (Google OAuth Flow Unlocked)**

---

## 1. Latar Belakang Masalah (Post-Mortem Masalah 401 Unauthorized)

### Gejala yang Terjadi:
Saat pengguna melakukan login menggunakan **Google OAuth** (yang dikelola oleh modul Better Auth), pengguna berhasil mendapatkan sesi (log server mencatat `GET /api/auth/get-session 200 OK`). Namun, ketika pengguna mengisi form registrasi pasien pertama kali dan menekan *"Simpan Data Pasien"*, request ke endpoint berikut **ditolak dengan HTTP 401 Unauthorized**:
1. `POST /api/v1/patients/registration` ➔ `401 UNAUTHENTICATED: Unauthorized`
2. `GET /api/v1/auth/me` ➔ `401 UNAUTHENTICATED: Unauthorized`

### Akar Masalah (Root Cause):
- Pengguna yang masuk via Google OAuth memiliki **token sesi Better Auth (opaque string)**, bukan string JWT HS256 yang ditandatangani oleh `auth.secret`.
- Sebelumnya, endpoint bisnis `/api/v1/*` di backend diproteksi secara kaku oleh `@UseGuards(AuthGuard('jwt'))` (Passport JWT).
- Ketika frontend mengirim token sesi Better Auth ke backend, Passport JWT mencoba memvalidasi token tersebut menggunakan `jsonwebtoken.verify()`. Karena bukan format JWT, Passport menolaknya dengan error `jwt malformed` (HTTP 401).

---

## 2. Solusi Backend: Implementasi `HybridAuthGuard` (Dual-Engine Guard)

Backend telah menerapkan **`HybridAuthGuard`** di [`src/common/auth/hybrid-auth.guard.ts`](file:///D:/Amanah-healthcare-backend/src/common/auth/hybrid-auth.guard.ts) dan memasangnya pada:
- [`src/modules/patients/presentation/patients.controller.ts`](file:///D:/Amanah-healthcare-backend/src/modules/patients/presentation/patients.controller.ts)
- [`src/auth/auth.controller.ts`](file:///D:/Amanah-healthcare-backend/src/auth/auth.controller.ts) (`GET me`, `POST logout`, `PATCH me`, `DELETE me`)

### Cara Kerja `HybridAuthGuard`:
1. **Engine 1 (Passport JWT):**
   - Pertama, memeriksa apakah request membawa header `Authorization: Bearer <canonical_jwt>`.
   - Jika valid (login via email/password), request langsung diizinkan.
2. **Engine 2 (Better Auth Session Fallback):**
   - Jika token bukan JWT (atau login via Google OAuth), guard otomatis melakukan *fallback* ke `betterAuth.api.getSession()`.
   - Guard membaca token sesi Better Auth baik dari:
     - Header `Authorization: Bearer <better_auth_session_token>` (via plugin `bearer()`), ATAU
     - Cookie `better-auth.session_token`.
   - Mengambil data profil relasi lengkap dari PostgreSQL (`userRoles_userId`, `staffProfiles`, `patientProfiles`).
   - Menyuntikkan objek identik ke `request.user` sehingga `@Roles()` dan `@CurrentUser()` di controller berfungsi secara seragam.

---

## 3. Implikasi & Panduan untuk Frontend (`manage-stock`)

### A. Kabar Baik untuk Frontend:
**Kode fallback token yang sudah ditulis frontend di `src/features/data-pasien/api/patient-registration-service.ts` SUDAH TEPAT dan KINI BERFUNGSI 100%.**  
Sebelumnya kode tersebut gagal semata-mata karena backend belum memiliki `HybridAuthGuard`. Dengan perbaikan ini, frontend tidak memerlukan library konversi atau pertukaran token tambahan.

### B. Pola Pengiriman Token dari Frontend:
Pastikan pemanggilan HTTP client di server actions mengikuti pola berikut:

```typescript
import { getAccessTokenCookie } from '@/server/auth/token-store';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// 1. Ambil token JWT (jika login manual email/password)
let token = await getAccessTokenCookie();

// 2. Jika tidak ada, ambil token sesi Better Auth (jika login Google OAuth)
if (!token) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.session?.token) {
      token = session.session.token;
    }
  } catch {
    // Sesi tidak ada
  }
}

// 3. Kirimkan ke endpoint backend via header Authorization
const response = await httpClient.request(paths.patients.registration(), schema, {
  method: 'POST',
  body: payload,
  tokenOverride: token, // Mengirim "Authorization: Bearer <token>"
  cache: 'no-store'
});
```

Backend `HybridAuthGuard` akan secara cerdas mengenali jenis token tersebut dan memvalidasinya ke mesin yang tepat.

---

## 4. Spesifikasi Kontrak Endpoint Terkait

### 1. `POST /api/v1/patients/registration`
- **Method:** `POST`
- **Auth Guard:** `HybridAuthGuard`, `RolesGuard` (`@Roles('PATIENT', 'ADMIN')`)
- **Headers:** `Authorization: Bearer <jwt_or_better_auth_token>`
- **Request Body (17 Atribut):**
  ```json
  {
    "name": "Fadhiilahahmad Zikri",
    "nik": "3201012304950099",
    "nama_ibu_kandung": "Siti Rahayu",
    "tempat_lahir": "Sleman",
    "birth_date": "1998-01-08",
    "gender": "Laki-laki",
    "blood_type": "B",
    "provinsi": "Daerah Istimewa Yogyakarta",
    "provinsi_id": "34",
    "kabupaten": "Kabupaten Sleman",
    "kabupaten_id": "3404",
    "kecamatan": "Depok",
    "kecamatan_id": "340407",
    "kelurahan": "Condongcatur",
    "kelurahan_id": "3404072002",
    "alamat_detail": "Jalan Bakung no 47, RT 02, RW 14 Dero",
    "pekerjaan": "Software Engineer"
  }
  ```
- **Response Sukses (HTTP 201 Created):**
  ```json
  {
    "id": "118eccfa-2987-4c5b-9cc7-bb87371f6348",
    "userId": "0ffba558-2616-42bf-831b-188e8ddcbb8b",
    "medicalRecordNumber": "RM-202609-0004",
    "nik": "3201012304950099",
    "fullName": "Fadhiilahahmad Zikri",
    "gender": "Laki-laki",
    "birthPlace": "Sleman",
    "birthDate": "1998-01-08",
    "bloodType": "B",
    "namaIbuKandung": "Siti Rahayu",
    "pekerjaan": "Software Engineer",
    "phoneNumber": "",
    "address": "Jalan Bakung no 47, RT 02, RW 14 Dero, Kel. Condongcatur, Kec. Depok, Kabupaten Sleman, Prov. Daerah Istimewa Yogyakarta",
    "createdAt": "2026-09-19T16:21:37.281Z",
    "updatedAt": "2026-09-19T16:21:37.281Z"
  }
  ```

### 2. `GET /api/v1/auth/me`
- **Method:** `GET`
- **Auth Guard:** `HybridAuthGuard`
- **Headers:** `Authorization: Bearer <jwt_or_better_auth_token>`
- **Response (HTTP 200 OK):**
  ```json
  {
    "id": "0ffba558-2616-42bf-831b-188e8ddcbb8b",
    "email": "zikrifadhiilahahmad@gmail.com",
    "systemRole": "PATIENT",
    "role": {
      "id": "b3c597a4-12a7-4d84-897a-87e9b29c335f",
      "code": "patient",
      "name": "PATIENT"
    },
    "patient": {
      "id": "118eccfa-2987-4c5b-9cc7-bb87371f6348",
      "userId": "0ffba558-2616-42bf-831b-188e8ddcbb8b",
      "medicalRecordNumber": "RM-202609-0004",
      "nik": "3201012304950099",
      "fullName": "Fadhiilahahmad Zikri",
      "gender": "male",
      "birthPlace": "Sleman",
      "birthDate": "1998-01-08",
      "bloodType": "B",
      "phoneNumber": "",
      "status": "active"
    },
    "staff": null
  }
  ```

---

## 5. Penanganan Error Spesifik (Error Taxonomy RFC 7807)

Frontend **WAJIB** menangani respon error berikut dan menampilkan pesan yang jelas pada toast:

| Kode HTTP | `code` RFC 7807 | Arti & Kondisi | Rekomendasi Pesan Toast untuk User |
|:---:|:---|:---|:---|
| **401** | `UNAUTHORIZED` | Token tidak valid atau sesi Better Auth/JWT kedaluwarsa | `"Sesi masuk Anda telah berakhir. Silakan masuk kembali."` (Arahkan ke `/auth/sign-in`) |
| **409** | `PATIENT_ALREADY_REGISTERED` | Akun user ini sudah memiliki profil pasien di database | `"Akun Anda sudah memiliki profil pasien terdaftar."` (Langsung tutup modal & refresh) |
| **409** | `DUPLICATE_NIK` | NIK 16-digit sudah dipakai oleh pasien lain di klinik | `"NIK ini sudah terdaftar pada rekam medis pasien lain. Periksa kembali NIK KTP Anda."` |
| **422** | `VALIDATION_FAILED` | Salah satu dari 17 field tidak memenuhi kriteria | Tampilkan pesan spesifik dari array `invalidParams` (misal `"NIK harus berupa 16 digit angka"`). |

---

## 6. Hasil Verifikasi Live Backend (Production Evidence)

1. **Uji Langsung Pengguna Google OAuth:**
   - Token Better Auth: `6ioq4P7qCyUBkOzfwhJCxXGiAavcNhTP` (milik akun Google: `zikrifadhiilahahmad@gmail.com`).
   - Eksekusi `POST /api/v1/patients/registration` ➔ **HTTP 201 Created**, No RM: `RM-202609-0004`.
   - Eksekusi `GET /api/v1/auth/me` ➔ **HTTP 200 OK**, `patient` terpopulasi lengkap.
2. **Uji Regresi Pengguna Email/Password:**
   - Token Passport JWT milik `testuser@gmail.com`.
   - Eksekusi `GET /api/v1/auth/me` ➔ **HTTP 200 OK**, validasi HS256 berjalan normal.
3. **Uji Seluruh Test Suites:**
   - `npm run test` ➔ **13 Test Suites Passed, 92 Tests Passed (100%)**.
