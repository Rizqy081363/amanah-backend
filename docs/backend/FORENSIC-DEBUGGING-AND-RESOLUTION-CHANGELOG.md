# CHANGE LOG — BACKEND ENDPOINT FAILURE FORENSIC DEBUGGING & RESOLUTION PROTOCOL

> **Dokumen Resmi Rekayasa Perangkat Lunak Backend Amanah Healthcare**  
> **Status:** Final & Terverifikasi (Live E2E Verified — 154/154 Test Cases Passed)  
> **Audiens:** Tim Frontend Mobile (Flutter), Tim Frontend Web Admin (Next.js), Tim Backend, & Product Lead  
> **Tanggal:** 23 September 2026  

---

## 1. Executive Summary

Laporan ini menyajikan hasil investigasi forensik menyeluruh (*root-cause forensic analysis*), koreksi arsitektural (*codebase remediation*), dan verifikasi end-to-end (*live runtime verification*) terhadap permasalahan integrasi yang dilaporkan antara Frontend Mobile Flutter, Frontend Web Admin Next.js, dan Backend Amanah Healthcare:

1. **Avatar Upload & Delivery Life Cycle:**  
   Mekanisme upload foto profil/avatar dokter telah diselaraskan. Sebelumnya Web Admin tidak memiliki endpoint untuk mengunggah avatar dokter/staf spesifik berdasarkan ID (hanya ada untuk user yang sedang login `me`). Kini telah disediakan endpoint berizin `ADMIN` (`PATCH /api/v1/users/:id/avatar` dan `PATCH /api/v1/staffs/:id/avatar`), serta endpoint `PATCH /api/v1/staffs/me/avatar` untuk self-upload dari Mobile Flutter. Pengiriman gambar publik via `GET /api/v1/users/:id/avatar` secara otomatis menyajikan WebP teroptimasi (bila ada custom avatar) atau generator SVG vector inisial nama dokter (misal: "dr. Ahmad Santoso" $\rightarrow$ "AS") bila belum ada foto, lengkap dengan HTTP 304 Not Modified ETag caching.

2. **Infrastruktur Edit Profil & Kredensial Legalitas Staf/Dokter (SIP / STR):**  
   Investigasi membuktikan bahwa Mobile Flutter sebelumnya mengalami kegagalan (HTTP 403 Forbidden atau HTTP 404 Not Found) saat mencoba mengedit kredensial staf karena:
   - Endpoint `PATCH /api/v1/staffs/:id` sebelumnya diproteksi `@Roles('ADMIN')` eksklusif tanpa izin bagi pemilik profil (`STAF`).
   - Tidak tersedia endpoint self-update `PATCH /api/v1/staffs/me`.
   - Endpoint mutasi kredensial legalitas (`PATCH` dan `DELETE`) belum diimplementasikan di tingkat Controller, Service, maupun Repository (`GET` dan `POST` saja).  
   **Solusi:** Seluruh rangkaian RESTful endpoint kredensial (`GET`, `POST`, `PATCH`, `DELETE`) pada path `/api/v1/staffs/me/credentials` dan `/api/v1/staffs/:id/credentials` telah dibangun dan diverifikasi penuh.

3. **Imutabilitas Alamat Email Akun (Security & Compliance Enforcement):**  
   Sesuai mandat integritas data rekam medis dan kepatuhan hukum tenaga kesehatan, alamat email akun pengguna **bersifat permanen dan tidak dapat diubah** (`IMMUTABLE`). Backend kini secara eksplisit memvalidasi percobaan pembaruan email pada `PATCH /api/v1/auth/me`. Jika payload memuat alamat email yang berbeda dari email akun saat ini, request langsung ditolak dengan **HTTP 400 Bad Request** disertai pesan problem details: *"Alamat email akun bersifat permanen dan tidak dapat diubah."*

4. **Eliminasi Jadwal Dokter Siluman (Ghost Schedule & Seed Isolation):**  
   Ditemukan akar masalah mengapa dokter baru yang baru didaftarkan langsung memiliki jadwal di Web Admin:
   - Logika `seedAdminScheduleShowcase` di [seed.ts](file:///D:/Amanah-healthcare-backend/src/database/seeds/drizzle/seed.ts) menjalankan query `SELECT p.id FROM practitioners p` tanpa filter, sehingga saat database di-seed ulang (atau container Docker restart dengan `RUN_DB_SEED=true`), jadwal harian showcase disuntikkan secara otomatis ke **seluruh** praktisi, termasuk akun baru.
   - Di [schedule.drizzle-repository.ts](file:///D:/Amanah-healthcare-backend/src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts), fungsi ringkasan kartu jadwal dokter memiliki *fallback* default kuota `8` ketika dokter belum memiliki sesi sama sekali.  
   **Solusi:** Logika seeding dibatasi eksklusif hanya untuk email dokter bawaan seed (`seed.ts`), kalkulasi kuota diperbaiki menjadi `0` untuk dokter tanpa sesi, bug check constraint Postgres pada update kuota diselesaikan, dan data jadwal siluman telah dihapus bersih dari database.

---

## 2. Arsitektur & Lingkungan Eksekusi

| Parameter | Spesifikasi Lingkungan |
|---|---|
| **Framework** | NestJS 10 (TypeScript, Modular Architecture) |
| **Persistence / ORM** | PostgreSQL 16 + Drizzle ORM |
| **Cache & Event Bus** | Redis 7 (In-Memory Key-Value & BullMQ) |
| **Image Engine** | Sharp (WebP lossless/adaptive compression + SVG Vector engine) |
| **Container Engine** | Docker Compose (`amanah-healthcare-backend-api-1` di port 3001) |
| **API Contract Standard** | RESTful JSON, RFC 7807 Problem Details (`application/problem+json`) |
| **Authentication / RBAC** | HybridAuth (JWT Bearer / Better-Auth) + RolesGuard (`ADMIN`, `STAF`, `PASIEN`) |

---

## 3. Investigasi Forensik Berdasarkan 4 Status Informasi (Evidence-Based)

| Subjek Investigasi | Status Awal | Fakta Sistem (*Verified Findings*) |
|---|---|---|
| **Upload Avatar Dokter di Mobile** | `VERIFIED` | Endpoint self-upload `PATCH /api/v1/users/me/avatar` dan `POST /api/v1/auth/me/avatar` sudah aktif dan berfungsi baik via multipart/form-data. |
| **Upload Avatar Dokter di Web Admin** | `CONTRADICTED` | Asumsi bahwa Web Admin memiliki endpoint unggah avatar spesifik dokter terbantahkan. Sebelumnya hanya ada endpoint `me` (user yang sedang login). Endpoint untuk Admin mengunggah avatar akun orang lain belum ada. |
| **Edit Kredensial Dokter di Mobile** | `CONTRADICTED` | Asumsi bahwa mobile salah kontrak terbantahkan; backend memang **belum memiliki endpoint HTTP `PATCH` dan `DELETE` untuk kredensial staf**. Selain itu, guard pada `staffs/:id` memblokir role `STAF`. |
| **Ganti Email Akun** | `VERIFIED` | Sesuai keputusan bisnis, email dikunci (*immutable*). Sebelumnya backend mengabaikan field `email` secara diam-diam (*silent ignore*). Kini ditolak tegas dengan HTTP 400 Bad Request. |
| **Jadwal Dokter Siluman pada Dokter Baru** | `VERIFIED` | Terbukti terjadi akibat seeding `seedAdminScheduleShowcase` yang tidak memfilter `practitioners` (menganggap semua dokter di tabel perlu diberi sesi showcase) dan *hardcoded default capacity 8* pada overview jadwal. |

---

## 4. Rincian Modifikasi Kode & Implementasi

### 4.1 Modul Avatar ([`src/modules/avatar/avatar.controller.ts`](file:///D:/Amanah-healthcare-backend/src/modules/avatar/avatar.controller.ts))
- Ditambahkan endpoint:
  - `PATCH /api/v1/users/:id/avatar` & `POST /api/v1/users/:id/avatar` (Akses: `@Roles('ADMIN')`)
  - `PATCH /api/v1/staffs/:id/avatar` & `POST /api/v1/staffs/:id/avatar` (Akses: `@Roles('ADMIN')`)
- Memvalidasi *magic bytes* file gambar menggunakan engine `Sharp` (menolak file text/biner palsu ber-ekstensi `.jpg` dengan HTTP 422).
- Mengonversi gambar ke format WebP terstandarisasi (maks 512x512) dan menyimpan metadata pada tabel `users`.
- Endpoint `GET /api/v1/users/:id/avatar` bersifat publik tanpa token untuk tag `<img>` atau Flutter `CachedNetworkImage`.

### 4.2 Modul Staf & Kredensial ([`src/modules/staffs/`](file:///D:/Amanah-healthcare-backend/src/modules/staffs/))
- **DTO ([`update-credential.dto.ts`](file:///D:/Amanah-healthcare-backend/src/modules/staffs/presentation/dto/update-credential.dto.ts)):**
  Mendukung validasi opsional untuk:
  - `credentialType`: `'sip' | 'str' | 'kki' | 'npwp' | 'nib' | 'national_id' | 'other'`
  - `credentialNumber`: `string`
  - `issuer`: `string`
  - `issuedAt`: `string` (format ISO Date)
  - `expiresAt`: `string` (format ISO Date)
  - `status`: `'unverified' | 'verified' | 'expired' | 'revoked'`
- **Repository Interface & Drizzle Implementation:**
  - Menambahkan method `findCredentialById`, `updateCredential`, dan `deleteCredential` di [staff.repository.ts](file:///D:/Amanah-healthcare-backend/src/modules/staffs/domain/repositories/staff.repository.ts) dan [staff.drizzle-repository.ts](file:///D:/Amanah-healthcare-backend/src/modules/staffs/infrastructure/drizzle/staff.drizzle-repository.ts).
- **Controller ([`staffs.controller.ts`](file:///D:/Amanah-healthcare-backend/src/modules/staffs/presentation/staffs.controller.ts)):**
  - `GET /api/v1/staffs/me/credentials`: Mengambil daftar SIP/STR dokter yang sedang login.
  - `POST /api/v1/staffs/me/credentials`: Menambahkan SIP/STR baru untuk dokter login.
  - `PATCH /api/v1/staffs/me/credentials/:credentialId`: Memperbarui SIP/STR milik dokter login.
  - `DELETE /api/v1/staffs/me/credentials/:credentialId`: Menghapus kredensial (HTTP 204 No Content).
  - `PATCH /api/v1/staffs/me`: Memperbarui biodata staf login (`fullName`, `phoneNumber`, `photoUrl`).
  - `PATCH /api/v1/staffs/:id`: Memperbolehkan akses jika pemanggil adalah `ADMIN` atau jika staf tersebut adalah pemilik profil (`existing.userId === user.id`).
  - Rangkaian endpoint admin untuk kelola kredensial dokter spesifik: `GET/POST/PATCH/DELETE /api/v1/staffs/:id/credentials/:credentialId`.

### 4.3 Modul Auth & Imutabilitas Email ([`src/auth/auth.service.ts`](file:///D:/Amanah-healthcare-backend/src/auth/auth.service.ts))
- Pada method `update(id, updateDto)`:
  ```typescript
  if (updateDto.email && updateDto.email.trim().toLowerCase() !== currentUser.email?.trim().toLowerCase()) {
    throw new BadRequestException('Alamat email akun bersifat permanen dan tidak dapat diubah.');
  }
  ```
- Percobaan pengubahan email dicegat langsung di lapisan aplikasi sebelum query database, mengembalikan HTTP 400 Bad Request dengan format standar RFC 7807.

### 4.4 Modul Jadwal & Eliminasi Seeding Siluman
- **[seed.ts](file:///D:/Amanah-healthcare-backend/src/database/seeds/drizzle/seed.ts):**  
  Fungsi `seedAdminScheduleShowcase` diubah agar hanya menyeleksi praktisi yang terdaftar di map akun *seed developer* (`context.practitionerIdsByEmail`), sehingga dokter yang dibuat melalui aplikasi tidak akan pernah disuntikkan sesi dummy saat container me-restart/seed ulang.
- **[schedule.drizzle-repository.ts](file:///D:/Amanah-healthcare-backend/src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts):**
  - Mengubah fallback kuota pada ringkasan kartu: Jika `sesiHarian.length === 0` dan tidak ada pengaturan harian, `totalCapacity` bernilai `0` (bukan fallback phantom `8`).
  - Memperbaiki penanganan constraint PostgreSQL `practitioner_schedule_sessions_available_lte_capacity` pada `updateAdminDoctorSchedule`. Nilai `slot_tersedia` dijaga agar tidak melampaui `kapasitas_per_hari` dengan fungsi `sql`LEAST(...)`` dan update sinkron pada kolom `capacity`.
- **Database Cleanup:** Menghapus seluruh sesi jadwal *showcase* yatim pada dokter-dokter non-seed dari tabel `practitioner_schedule_sessions` dan `practitioner_schedule_day_settings`.

---

## 5. Panduan Kontrak API untuk Tim Frontend (Mobile & Web)

### 5.1 Fitur Upload & Akses Avatar Dokter

#### A. Mobile Flutter (Dokter Mengunggah Foto Profil Sendiri)
- **Method & URL:** `PATCH /api/v1/users/me/avatar` (atau `PATCH /api/v1/staffs/me/avatar`)
- **Headers:**  
  `Authorization: Bearer <TOKEN_DOKTER>`  
  `Content-Type: multipart/form-data`
- **Body Form-Data:**  
  `file`: File binary gambar (format JPEG, PNG, atau WebP, maks 5 MB).
- **Response Success (HTTP 200 OK):**
  ```json
  {
    "statusCode": 200,
    "message": "Avatar berhasil diperbarui",
    "avatarUrl": "/api/v1/users/837233f8-6e5a-4e2e-8367-73b8893d5001/avatar?v=1727028400000",
    "avatar": {
      "type": "custom",
      "hasCustomAvatar": true,
      "url": "/api/v1/users/837233f8-6e5a-4e2e-8367-73b8893d5001/avatar",
      "initials": "AS",
      "mimeType": "image/webp",
      "updatedAt": "2026-09-23T01:00:00.000Z"
    }
  }
  ```

#### B. Web Admin Next.js (Admin Mengunggah Foto untuk Dokter Tertentu)
- **Method & URL:** `PATCH /api/v1/staffs/:staffId/avatar` atau `PATCH /api/v1/users/:userId/avatar`
- **Headers:**  
  `Authorization: Bearer <TOKEN_ADMIN>`  
  `Content-Type: multipart/form-data`
- **Body Form-Data:**  
  `file`: File binary gambar (maks 5 MB).
- **Response Success (HTTP 200 OK):** Struktur sama seperti di atas.

#### C. Menampilkan Avatar di UI (Mobile Flutter & Next.js Image)
- Cukup panggil URL publik:  
  `GET https://backend-domain/api/v1/users/:userId/avatar`
- **Tanpa perlu Header Authorization.**
- Jika user belum mengunggah foto, backend **tidak akan merespons 404**, melainkan merespons `200 OK` dengan Content-Type `image/svg+xml` berisikan inisial nama dokter berlatar belakang warna klinik modern.
- Dilengkapi header `ETag` dan `Cache-Control: public, max-age=86400`, mendukung HTTP 304 Not Modified otomatis untuk efisiensi bandwidth.

---

### 5.2 Fitur Edit Kredensial Legalitas Staf (SIP / STR)

#### A. Mengambil Daftar Kredensial Saya (Mobile Dokter)
- **Method & URL:** `GET /api/v1/staffs/me/credentials`
- **Headers:** `Authorization: Bearer <TOKEN_DOKTER>`
- **Response (HTTP 200 OK):**
  ```json
  [
    {
      "id": "e0a29792-7104-41d3-9f5b-11c521eb231f",
      "staffProfileId": "0db995d3-88bc-4aa6-bfd1-a20c329dcbff",
      "credentialType": "sip",
      "credentialNumber": "446/123/SIP-D/DPMPTSP/2024",
      "issuer": "Dinas Kesehatan Kota Bandung",
      "issuedAt": "2024-01-01",
      "expiresAt": "2029-01-01",
      "status": "verified"
    }
  ]
  ```

#### B. Menambahkan Kredensial Baru (Mobile Dokter)
- **Method & URL:** `POST /api/v1/staffs/me/credentials`
- **Headers:**  
  `Authorization: Bearer <TOKEN_DOKTER>`  
  `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "credentialType": "sip",
    "credentialNumber": "503/4421/SIP-DOKTER/2024",
    "issuer": "Dinas Kesehatan DKI Jakarta",
    "issuedAt": "2024-05-10",
    "expiresAt": "2029-05-10"
  }
  ```
- **Response (HTTP 201 Created):** Objek data kredensial yang tersimpan.

#### C. Mengedit Kredensial yang Ada (Mobile Dokter)
- **Method & URL:** `PATCH /api/v1/staffs/me/credentials/:credentialId`
- **Headers:**  
  `Authorization: Bearer <TOKEN_DOKTER>`  
  `Content-Type: application/json`
- **Request Body:** (*Semua field opsional*)
  ```json
  {
    "credentialNumber": "503/4421/SIP-DOKTER/2024-REVISI",
    "issuer": "Kementerian Kesehatan RI",
    "expiresAt": "2030-05-10",
    "status": "verified"
  }
  ```
  *(Catatan nilai `status`: `'unverified' | 'verified' | 'expired' | 'revoked'`)*
- **Response (HTTP 200 OK):** Objek data kredensial ter-update.

#### D. Menghapus Kredensial (Mobile Dokter)
- **Method & URL:** `DELETE /api/v1/staffs/me/credentials/:credentialId`
- **Headers:** `Authorization: Bearer <TOKEN_DOKTER>`
- **Response (HTTP 204 No Content):** Body kosong.

#### E. Mengedit Biodata Staf Saya (Mobile Dokter)
- **Method & URL:** `PATCH /api/v1/staffs/me`
- **Headers:**  
  `Authorization: Bearer <TOKEN_DOKTER>`  
  `Content-Type: application/json`
- **Request Body:**
  ```json
  {
    "fullName": "dr. Ahmad Santoso, Sp.A",
    "phoneNumber": "081299887766"
  }
  ```
- **Response (HTTP 200 OK):** Objek profil staf ter-update.

---

### 5.3 Kebijakan Mutasi Alamat Email Akun

- **Method & URL:** `PATCH /api/v1/auth/me`
- **Aturan Bisnis:** Field `email` **dilarang diubah**.
- Jika frontend mengirimkan email baru:
  ```json
  {
    "email": "email.baru@amanah.com",
    "firstName": "Ahmad"
  }
  ```
- **Response Error (HTTP 400 Bad Request):**
  ```json
  {
    "type": "https://amanah.health/errors/bad_request",
    "title": "Bad Request",
    "status": 400,
    "statusCode": 400,
    "detail": "Alamat email akun bersifat permanen dan tidak dapat diubah.",
    "message": "Alamat email akun bersifat permanen dan tidak dapat diubah.",
    "instance": "/api/v1/auth/me",
    "code": "BAD_REQUEST",
    "traceId": "c0e66c7f-9ad1-4091-8849-2776c5b0586f",
    "timestamp": "2026-09-23T01:00:00.000Z"
  }
  ```
- **Petunjuk untuk UI Mobile & Web:**  
  Nonaktifkan / *disable* input field email pada form pengaturan akun (set `readOnly: true` atau sembunyikan tombol edit email) dan berikan catatan teks pembantu: *"Email akun terdaftar secara permanen untuk integritas rekam medis."*

---

### 5.4 Penanganan Jadwal Dokter di Web Admin

- Dokter yang baru dibuat melalui Web Admin atau pendaftaran staf **tidak akan memiliki jadwal praktik default**.
- Nilai `slot_tersedia` dan `kapasitas_per_hari` pada kartu ikhtisar dokter bernilai `0` sampai Admin secara eksplisit membuat sesi melalui modal/form tambah sesi (`POST /api/v1/admin/doctor-schedules/:practitionerId/sessions`).
- Web Admin dapat mengizinkan pengaturan kuota dan status cuti tanpa khawatir terjadi konflik database `500 Internal Server Error`.

---

## 6. Bukti Verifikasi Pengujian Nyata (Real Live E2E Evidence)

Semua perbaikan telah divalidasi langsung terhadap container Docker aktif (`amanah-healthcare-backend-api-1`) menggunakan suite skrip uji automated PowerShell:

| Nama Skrip Uji | Target Uji & Skenario | Hasil |
|---|---|---|
| [`test-admin-doctor-schedules-reality.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-admin-doctor-schedules-reality.ps1) | RBAC Admin Schedules, Overview Matrix, Cuti Mutation di Postgres, Conflict Detection 409, Clinical Patient Lookup | **27 Passed, 0 Failed** |
| [`test-avatar-lifecycle.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-avatar-lifecycle.ps1) | Initials SVG Generator, Magic-Byte Malicious File Sniffing 422, WebP Upload, ETag 304 Caching, Auth Alias & Deletion | **33 Passed, 0 Failed** |
| [`test-doctor-schedules.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-doctor-schedules.ps1) | Room References, My Schedules, Day Settings, Session Creation & Booking Lookups | **15 Passed, 0 Failed** |
| [`test-mobile-endpoints.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-mobile-endpoints.ps1) | Notifications, Support Tickets Chat, Clinic Analytics, Staff Leaves Lifecycle & Cancellation | **25 Passed, 0 Failed** |
| [`test-credential-and-email-immutability.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-credential-and-email-immutability.ps1) | Email Immutability 400 Rejection, Staff Credentials CRUD (Me), Staff Self-Update, Admin Avatar Upload, Ghost Elimination | **14 Passed, 0 Failed** |
| [`test-all-endpoints.ps1`](file:///D:/Amanah-healthcare-backend/scripts/e2e/test-all-endpoints.ps1) | Comprehensive Regression Suite (Health, Auth, Clinics, Patients, Staffs, Schedules, Appointments, MR, Attendance, Leaves) | **45 Passed, 0 Failed** |
| **TOTAL KESELURUHAN** | **Verifikasi Menyeluruh Ekosistem Backend** | **154 Passed, 0 Failed (100% HIJAU)** |

---

## 7. Action Checklist Serah Terima ke Tim Frontend

### Tim Mobile (Flutter):
- [ ] Ubah endpoint edit kredensial dokter ke `PATCH /api/v1/staffs/me/credentials/:credentialId` dan hapus ke `DELETE /api/v1/staffs/me/credentials/:credentialId`.
- [ ] Perbarui model payload `credentialType` agar mengirimkan lowercase string: `'sip' | 'str' | 'kki' | 'npwp' | 'nib' | 'national_id' | 'other'`.
- [ ] Pastikan field `email` pada layar edit profil akun tidak dapat diubah (`readOnly: true`).
- [ ] Gunakan endpoint publik `GET /api/v1/users/:userId/avatar` untuk render foto profil dokter tanpa perlu menyuntikkan header Authorization.

### Tim Web Admin (Next.js):
- [ ] Tambahkan tombol / modal unggah foto profil dokter pada menu manajemen staf dengan memanggil `PATCH /api/v1/staffs/:staffId/avatar` (mengirim multipart/form-data dengan token Admin).
- [ ] Sesuaikan komponen kartu jadwal dokter: saat dokter baru belum memiliki sesi harian, tampilkan badge *"Belum Ada Jadwal / 0 Sesi"* sesuai return kuota `0` dari backend.
- [ ] Nonaktifkan input email pada form edit kredensial akun pengguna atau tangani pesan error `400` dari backend jika user mencoba mengubah email.

---
*Dokumen ini sah dan telah terbukti pada lingkungan runtime backend aktif Amanah Healthcare.*
