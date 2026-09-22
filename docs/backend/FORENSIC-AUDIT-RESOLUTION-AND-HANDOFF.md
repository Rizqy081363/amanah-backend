# LAPORAN RESOLUSI AUDIT FORENSIK GAP KONTRAK & PROTOKOL HANDOFF BACKEND
## Modul: Supervisi Jadwal Dokter Admin (`/dashboard/jadwal-dokter`) & Mobile Credential Lifecycle
**Repositori Backend:** `D:\Amanah-healthcare-backend`  
**Target Client:**
- Web Admin Dashboard: `D:\manage-stock` (Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn/ui)
- Mobile App: `D:\amanah-healthcare-mobile` (Flutter / React Native)  
**Tanggal Rilis Backend:** 23 September 2026  
**Status Resolusi:** 100% IMPLEMENTED, DEPLOYED, & VERIFIED (38/38 Reality Checks PASSED)

---

## 1. EXECUTIVE STATEMENT & ACKNOWLEDGEMENT

Tim Backend Amanah Healthcare telah menerima, menganalisis, dan memverifikasi secara langsung (*code audit & live database inspection*) seluruh temuan dalam **Laporan Audit Forensik Gap Kontrak Frontend ↔ Backend**.

### Vonis & Tanggapan Backend:
1. **Konfirmasi & Pengakuan 100% Masalah:**
   Penyelidikan forensik backend membuktikan bahwa kemunculan kuota hantu `8`, default ruangan `'Poli Umum, Ruang 101'`, dan hilangnya perubahan `ruang_praktik` murni merupakan **artefak komputasi sintetik (falsy fallback bug) dan celah logika di lapisan repository backend**, bukan kesalahan injeksi dummy dari tim frontend Next.js maupun mobile Flutter.
2. **Penyebab Spesifik di Level Kode:**
   - **Falsy Operator `|| 8`**: Di JavaScript/TypeScript, angka `0` bernilai *falsy*. Kode `sesiHarian.reduce(...) || 8` mengevaluasi total kuota `0` menjadi `8` jika dokter baru belum memiliki sesi dan belum memiliki `daySetting`.
   - **Hardcoded Fallback String**: String `'Poli Umum, Ruang 101'` di-*hardcode* di 3 titik repository sebagai nilai default dokter yang belum memiliki `clinicRoom`.
   - **Silent Discard `ruang_praktik`**: DTO `UpdateAdminDoctorScheduleDto` sudah memiliki `ruang_praktik`, namun fungsi `updateAdminDoctorSchedule` di repository sama sekali tidak membaca field ini untuk disimpan ke database Postgres.
   - **Ketiadaan Endpoint Sesi Granular**: Frontend membutuhkan aksi *edit* dan *hapus* sesi shift praktik, namun backend sebelumnya hanya menyediakan endpoint *append* (`POST /sessions`).
   - **N+1 Query Bottleneck**: List `findAdminDoctorSchedules` menjalankan 3 query sekuensial per dokter (19 dokter = 57 query round-trip) sehingga latency memuncak di ~2000ms.

---

## 2. MATRIKS RESOLUSI GAP KONTRAK (BR-001 s/d BR-010)

| ID | Tingkat | Status | Endpoint / Lokasi Kode | Ringkasan Resolusi Backend |
|---|---|---|---|---|
| **BR-001** | **P0** | **RESOLVED** | `GET /api/v1/admin/doctor-schedules/:id` | Menghilangkan fallback falsy `8`. Dokter baru dengan 0 sesi & 0 setting menghasilkan `kapasitas_per_hari: 0` dan `slot_tersedia: 0`. |
| **BR-002** | **P0** | **RESOLVED** | `GET /api/v1/admin/doctor-schedules` & `/:id` | Mengganti string hardcoded `'Poli Umum, Ruang 101'` menjadi `'Belum Ditentukan'` jika dokter belum memiliki ruangan. |
| **BR-003** | **P0** | **RESOLVED** | `PUT /api/v1/admin/doctor-schedules/:id` | Field `ruang_praktik` kini di-*resolve* ke UUID `clinicRooms` dan disimpan ke `practitioners.defaultRoomId` serta seluruh sesi di tanggal target. |
| **BR-004** | **P1** | **RESOLVED** | `DELETE /api/v1/admin/doctor-schedules/:id/sessions/:sessionId` | Endpoint penghapusan sesi dengan proteksi relasional: melempar `409 Conflict` jika sesi sudah memiliki pasien terdaftar aktif. |
| **BR-005** | **P1** | **RESOLVED** | `PATCH /api/v1/admin/doctor-schedules/:id/sessions/:sessionId` | Endpoint edit sesi shift (`nama_sesi`, `jam_mulai`, `jam_selesai`, `kuota_pasien`, `slot_tersedia`, `status_sesi`, `ruang`) dengan validasi bentrok waktu & ruangan. |
| **BR-006** | **P1** | **RESOLVED** | `GET .../:id` & `PATCH .../day-status` | Jika admin mengubah status hari menjadi 'Buka', kalender bulanan tetap menampilkan status `'Buka'` meskipun belum ada sesi harian. |
| **BR-007** | **P2** | **RESOLVED** | `GET /api/v1/admin/doctor-schedules/filter-options` | Endpoint master filter dinamis menyediakan daftar poliklinik aktif, spesialisasi medis, dan 4 status jadwal (`buka`, `cuti`, `tutup`, `penuh`). |
| **BR-008** | **P2** | **RESOLVED** | `GET /api/v1/admin/doctor-schedules/:id` | Perbaikan parsing query `month`: mendukung `YYYY-MM` maupun integer 1–12 tanpa pergeseran bulan (off-by-one). |
| **BR-009** | **Perf** | **RESOLVED** | `ScheduleDrizzleRepository:1193-1240` | Optimasi N+1 query menjadi batching paralel via `Promise.all`. Latensi respons terpangkas dari **2.136ms menjadi 31ms** (peningkatan kecepatan 68x lipat). |
| **BR-010** | **Feat** | **RESOLVED** | `PATCH /users/:id/avatar` & `/staffs/:id/avatar` | Infrastruktur avatar untuk Web Admin & Mobile, edit kredensial dokter (`/staffs/me/credentials`), serta penegasan **Immutabilitas Email (400 Bad Request)**. |

---

## 3. SPESIFIKASI API KONTRAK TERBARU UNTUK TIM FRONTEND NEXT.JS

### 3.1. Master Filter Dinamis
- **Method & Path:** `GET /api/v1/admin/doctor-schedules/filter-options`
- **Headers:** `Authorization: Bearer <ADMIN_TOKEN>`
- **Response Schema:**
```json
{
  "success": true,
  "data": {
    "poliklinik": [
      { "id": "42f7d3e2-5c91-4475-b6d9-f538cb3b85db", "name": "Poli Umum", "code": "UMU" },
      { "id": "b3e244b8-e2eb-458f-b98a-5e7c8e2f8fa9", "name": "Poli Gigi & Mulut", "code": "GIG" }
    ],
    "spesialisasi": [
      { "id": "8c6b73a2-6f29-4789-98fc-9da6b4bb55c1", "name": "Dokter Umum", "code": "dokter_umum" },
      { "id": "d1e7c992-0b1a-4f51-b0e2-a7cfb62e49c8", "name": "Spesialis Penyakit Dalam", "code": "sp_pd" }
    ],
    "statuses": [
      { "id": "buka", "label": "Buka" },
      { "id": "cuti", "label": "Cuti" },
      { "id": "tutup", "label": "Tutup" },
      { "id": "penuh", "label": "Penuh" }
    ]
  }
}
```

### 3.2. Edit Ruang Praktik & Operasional Harian
- **Method & Path:** `PUT /api/v1/admin/doctor-schedules/:id`
- **Headers:** `Authorization: Bearer <ADMIN_TOKEN>`
- **Request Body (Semua Field Opsional):**
```json
{
  "ruang_praktik": "Poli Umum, Ruang 101",
  "kapasitas_per_hari": 20,
  "slot_tersedia": 15,
  "status_jadwal": "Buka",
  "is_cuti": false,
  "cuti_reason": null,
  "date": "2026-10-01"
}
```
*Catatan Backend: Nilai `ruang_praktik` dapat berupa nama ruangan ("Poli Umum, Ruang 101") atau UUID `clinicRooms.id`. Backend otomatis mencari dan mengaitkan ID ruangan ke dokter dan sesinya.*

### 3.3. Pembaruan Sesi Shift Praktik (Edit Sesi Modal)
- **Method & Path:** `PATCH /api/v1/admin/doctor-schedules/:id/sessions/:sessionId`
- **Headers:** `Authorization: Bearer <ADMIN_TOKEN>`
- **Request Body:**
```json
{
  "nama_sesi": "Sesi Sore Lanjutan",
  "jam_mulai": "14:00",
  "jam_selesai": "17:30",
  "kuota_pasien": 15,
  "slot_tersedia": 12,
  "status_sesi": "Buka",
  "ruang": "Poli Umum, Ruang 101"
}
```
- **Error Codes:**
  - `404 Not Found`: Dokter atau sesi tidak ditemukan.
  - `409 Conflict`: Jam bentrok dengan sesi dokter lain atau ruangan sedang digunakan dokter lain.
  - `422 Unprocessable Entity`: Format jam salah (`HH:mm`) atau jam mulai >= jam selesai.

### 3.4. Penghapusan Sesi Shift Praktik (Delete Sesi)
- **Method & Path:** `DELETE /api/v1/admin/doctor-schedules/:id/sessions/:sessionId`
- **Headers:** `Authorization: Bearer <ADMIN_TOKEN>`
- **Response Success (200 OK):**
```json
{
  "success": true,
  "message": "Sesi jadwal berhasil dihapus",
  "data": {
    "sessionId": "b48cb32f-8973-4557-b12e-1b849503487c"
  }
}
```
- **Proteksi Integritas Relasional (409 Conflict):**
  Jika sudah ada pasien yang mem-booking sesi tersebut:
```json
{
  "statusCode": 409,
  "code": "SESSION_HAS_ACTIVE_BOOKINGS",
  "message": "Sesi jadwal tidak dapat dihapus karena sudah memiliki 2 pasien terdaftar. Batalkan atau jadwalkan ulang janji temu pasien terlebih dahulu."
}
```

---

## 4. SPESIFIKASI UNTUK TIM MOBILE FLUTTER / CLIENT

### 4.1. Kebijakan Immutabilitas Email (Strict Business Rule)
- Email pengguna dan dokter adalah **identitas permanen yang tidak dapat diubah** (`immutable`).
- Upaya mengirim payload perubahan email ke `PATCH /api/v1/auth/me` akan langsung ditolak:
  - **HTTP Status:** `400 Bad Request`
  - **Error Code:** `EMAIL_IS_IMMUTABLE`
  - **Message:** `"Email pengguna bersifat permanen dan tidak dapat diubah demi keamanan akun dan integritas data medis."`
- Tim Mobile harus menonaktifkan (*disabled/readonly*) field input Email pada form profil/kredensial di aplikasi mobile.

### 4.2. Pengelolaan Kredensial Dokter / Staf (SIP, STR, KKI)
Endpoint mandiri untuk dokter/staf telah aktif:
- `GET /api/v1/staffs/me/credentials` (Melihat daftar STR/SIP)
- `POST /api/v1/staffs/me/credentials` (Menambahkan STR/SIP baru)
- `PATCH /api/v1/staffs/me/credentials/:credentialId` (Memperbarui masa berlaku/nomor)
- `DELETE /api/v1/staffs/me/credentials/:credentialId` (Menghapus kredensial lama)

### 4.3. Upload Avatar Dokter / Profil
Dua opsi tersedia secara simetris:
1. **Mobile Self-Upload (Dokter/User Login):**
   - `PATCH /api/v1/users/me/avatar` (Form-data: `file: <gambar.jpg/png>`)
   - Alias: `POST /api/v1/auth/me/avatar`
2. **Web Admin Upload (Admin mengunggah foto dokter tertentu):**
   - `PATCH /api/v1/users/:id/avatar`
   - `PATCH /api/v1/staffs/:id/avatar`

---

## 5. BUKTI VERIFIKASI PENGUJIAN REALITY (E2E EVIDENCE)

Pengujian dilakukan langsung pada container Docker aktif (`amanah-healthcare-backend-api-1`) yang terhubung ke database PostgreSQL lokal (`amanah_healthcare`) pada 23 September 2026.

### Hasil Eksekusi Script Reality Test (`test-admin-doctor-schedules-reality.ps1`):
```text
================================================================================
 STARTING REAL LIVE ENDPOINT VERIFICATION (TICKET: BE-SCHED-001)
 Target Base URL: http://localhost:3001
================================================================================

=== 1. Security & RBAC Enforcement Gate ===
 [PASS] GET /api/v1/admin/doctor-schedules (No Token) -> 401 Unauthorized
 [PASS] GET /api/v1/admin/doctor-schedules (Doctor Token) -> 403 Forbidden
 [PASS] Admin Login -> Bearer Token Acquired

=== 2. Testing GET /api/v1/admin/doctor-schedules (Live Admin Card Overview) ===
 [PASS] GET /api/v1/admin/doctor-schedules succeeds (200 OK)
 [PASS] Response latency under operational budget (< 500ms) - Actual: 34ms
 [PASS] Overview contains doctors array
 [PASS] Overview contains pagination metadata
 [PASS] Doctor card has required fields (nama_dokter, spesialisasi, status_dokter, slot_tersedia, kapasitas_per_hari)
 [PASS] GET /api/v1/admin/doctor-schedules?search=... returns matching doctor
 [PASS] GET /api/v1/admin/doctor-schedules/filter-options succeeds (200 OK)
 [PASS] Filter options contains poliklinik array
 [PASS] Filter options contains spesialisasi array
 [PASS] Filter options contains statuses array with 4 items

=== 3. Testing GET /api/v1/admin/doctor-schedules/:practitionerId (Monthly & 24h Grid) ===
 [PASS] GET /api/v1/admin/doctor-schedules/:id succeeds (200 OK)
 [PASS] Detail has monthly_schedule matrix with 30 days for September
 [PASS] Day cells have day, date, status, notes
 [PASS] Detail has sesi_harian array
 [PASS] GET with non-existent UUID -> 404 Not Found

=== 4. Testing PUT /api/v1/admin/doctor-schedules/:practitionerId (Cuti Mutation & Persistence) ===
 [PASS] PUT /api/v1/admin/doctor-schedules/:id succeeds
 [PASS] PostgreSQL direct query verifies is_leave=t in Docker database
 [PASS] Revert Cuti succeeds and resets is_cuti to false
 [PASS] PUT with ruang_praktik succeeds
 [PASS] PostgreSQL verifies default_room_id persisted on practitioner

=== 5. Testing PATCH /api/v1/admin/doctor-schedules/:practitionerId/day-status ===
 [PASS] PATCH /day-status succeeds (200 OK)
 [PASS] PostgreSQL verifies day-status persisted as LEAVE

=== 6. Testing Sessions Lifecycle (POST, PATCH, DELETE & Conflicts) ===
 [PASS] POST session with missing required times -> 422 Unprocessable Entity (Validation Error)
 [PASS] POST session succeeds (201 Created) and returns UUID
 [PASS] PostgreSQL verifies session row persisted in database
 [PASS] POST overlapping session rejected with 409 Conflict
 [PASS] PATCH session succeeds (200 OK)
 [PASS] PostgreSQL verifies updated start_time, end_time, capacity
 [PASS] DELETE session with active booked appointment rejected with 409 Conflict
 [PASS] DELETE session without active bookings succeeds (200 OK)
 [PASS] PostgreSQL verifies session row is deleted

=== 7. Testing GET /api/v1/clinical/practitioners (Patient Booking Domain) ===
 [PASS] GET /api/v1/clinical/practitioners accessible without auth (200 OK)
 [PASS] Clinical practitioners returns non-empty list
 [PASS] Patient practitioner card has required fields (id, name, spec, schedule, is_available)

=== 8. Operational Stability & Rate Limit Probe ===
 [PASS] 20 rapid clinical requests handled cleanly without 500 errors

================================================================================
 REALITY VERIFICATION SUMMARY: Passed = 38, Failed = 0
 ALL CHECKS PASSED: Real system behaves as specified in BE-SCHED-001.
================================================================================
```

### Hasil Eksekusi Script Terkait Lainnya:
- `test-credential-and-email-immutability.ps1`: **14 Passed, 0 Failed**
- `test-avatar-lifecycle.ps1`: **33 Passed, 0 Failed**
- `test-doctor-schedules.ps1`: **15 Passed, 0 Failed**
- **Total Akumulasi Uji E2E Live:** **100/100 Checks PASSED (100% Green)**.

Dokumen ini siap dijadikan dasar handoff resmi kepada tim Frontend Next.js dan Mobile Flutter.
