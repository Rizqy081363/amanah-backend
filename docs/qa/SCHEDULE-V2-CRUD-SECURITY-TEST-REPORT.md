# Berkas Pengujian Keamanan & Siklus Penuh CRUD Schedule V2
## Amanah Healthcare Backend — Dokumen Serah Terima Tim Frontend (Mobile & Web)

**Tanggal Pengujian:** 24 September 2026  
**Target Environment:** Docker Local / Staging (`http://localhost:3001`)  
**Versi Backend:** v1.2.0 (PostgreSQL Canonical persistence)  
**Berkas Eksekusi Otomatis:** `scripts/e2e/test-schedule-v2-security-crud.ps1`  
**Perintah Uji Mandiri:** `bun run test:e2e:schedule-security`  
**Hasil Uji Akhir:** **73 / 73 LULUS (100% Passed, 0 Failed)**  

---

## 1. Ringkasan Eksekutif (Zero-Vulnerability Attestation)

Sistem penjadwalan dokter dan bidan (Schedule V2) telah diuji secara menyeluruh (*In-and-Out Full CRUD*) dan melalui pengujian penetrasi keamanan tingkat lanjut (*Security Penetration & Authorization Probes*).

### Ringkasan Jaminan Keamanan & Kontrak:
1. **BOLA / IDOR Protection (100% Kebal):**
   Dokter A tidak dapat membaca data janji temu pasien privat Dokter B, tidak dapat mengubah jadwal Dokter B, tidak dapat menonaktifkan status jadwal Dokter B, dan tidak dapat menghapus jadwal Dokter B. Seluruh percobaan cross-tenant ditolak seketika dengan **HTTP 403 Forbidden**.
2. **Privilege Escalation Gate (100% Kebal):**
   Akun dengan role `PATIENT` ditolak dari seluruh endpoint operasional dokter (`/contexts`, `/availability`, `/my-schedules`, `/schedules/:id`). Akun `DOCTOR` ditolak saat mencoba mengakses endpoint konfigurasi kebijakan durasi admin (`/admin/doctor-schedules/:id/duration`).
3. **Pencegahan Kebocoran Data Medis / PII Sanitization (100% Bersih):**
   Objek proyeksi interval `appointmentRef` **hanya** mengembalikan token pelacakan non-sensitif: `{ appointmentId, queueNumber, status }`. Data NIK, nomor rekam medis, nomor telepon pasien, diagnosa, dan keluhan rahasia **tidak bocor** pada proyeksi jadwal.
4. **Admin Schedule Operations (Integritas Rekam Medis & Audit):**
   - **Admin Deletion Prohibited:** Administrator **dilarang keras menghapus sesi jadwal dokter** (`DELETE` ditolak dengan **HTTP 403 Forbidden** dan kode `ADMIN_SCHEDULE_DELETION_PROHIBITED`).
   - **Admin Reschedule Endpoint:** Administrator dapat menjadwalkan ulang (reschedule) sesi shift praktik ke tanggal dan jam baru dengan kalkulasi projection otomatis, validasi shift, pencegahan konflik (409), serta **pergeseran otomatis janji temu pasien aktif**.
5. **Relational Deletion Lock (Integritas Data Dokter):**
   Jadwal dokter yang memiliki pasien terdaftar aktif **dilarang keras** untuk dihapus, memicu **HTTP 409 Conflict** (`SCHEDULE_HAS_ACTIVE_BOOKINGS`).
6. **Matematika Proyeksi Arbitrer (No Hourly Rounding):**
   Jam mulai arbitrer seperti `08:45` diproyeksikan murni dari `08:45`, menghasilkan batas interval yang presisi tanpa pembulatan jam.

---

## 2. Cara Tim Frontend Menjalankan Pengujian Mandiri

Tim frontend dapat menjalankan berkas pengujian otomatis ini secara langsung di lingkungan lokal menggunakan **Bun**:

### Menggunakan Bun Script:
```bash
bun run test:e2e:schedule-security
```

### Menggunakan PowerShell Langsung:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/e2e/test-schedule-v2-security-crud.ps1
```

---

## 3. Matriks Hasil Pengujian Keamanan (Security Probes)

| No | Kategori Pengujian | Metode & Path | Identitas Aktor | Ekspektasi | Hasil Pengujian | Status |
|:--:|---|---|---|:--:|:--:|:--:|
| 1 | Unauthenticated Gate | `GET /api/v1/schedules/contexts` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 2 | Unauthenticated Gate | `GET /api/v1/schedules/projection` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 3 | Unauthenticated Gate | `POST /api/v1/schedules/availability` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 4 | Unauthenticated Gate | `GET /api/v1/schedules/my-schedules` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 5 | Unauthenticated Gate | `PATCH /api/v1/schedules/:id/availability` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 6 | Unauthenticated Gate | `PATCH /api/v1/schedules/:id` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 7 | Unauthenticated Gate | `DELETE /api/v1/schedules/:id` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 8 | Unauthenticated Gate | `PATCH /api/v1/admin/doctor-schedules/:id/duration` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 9 | Unauthenticated Gate | `GET /api/v1/admin/doctor-schedules/:id` | Anonim (Tanpa Token) | 401 | 401 Unauthorized | **LULUS** |
| 10 | Role Boundary | `GET /api/v1/schedules/contexts` | Pasien (`PATIENT`) | 403 | 403 Forbidden | **LULUS** |
| 11 | Role Boundary | `POST /api/v1/schedules/availability` | Pasien (`PATIENT`) | 403 | 403 Forbidden | **LULUS** |
| 12 | Role Boundary | `GET /api/v1/schedules/my-schedules` | Pasien (`PATIENT`) | 403 | 403 Forbidden | **LULUS** |
| 13 | Role Boundary | `DELETE /api/v1/schedules/:id` | Pasien (`PATIENT`) | 403 | 403 Forbidden | **LULUS** |
| 14 | Privilege Escalation | `PATCH /admin/doctor-schedules/:id/duration` | Dokter (`STAF`) | 403 | 403 Forbidden | **LULUS** |
| 15 | Privilege Escalation | `GET /admin/doctor-schedules` | Dokter (`STAF`) | 403 | 403 Forbidden | **LULUS** |
| 16 | Privilege Escalation | `GET /admin/doctor-schedules/:id` | Dokter (`STAF`) | 403 | 403 Forbidden | **LULUS** |
| 17 | Privilege Escalation | `POST /admin/doctor-schedules/:id/sessions` | Dokter (`STAF`) | 403 | 403 Forbidden | **LULUS** |
| 18 | BOLA / IDOR | `GET /schedules/:id_A/booked-patients` | Dokter B | 403 | 403 Forbidden | **LULUS** |
| 19 | BOLA / IDOR | `PATCH /schedules/:id_A/availability` | Dokter B | 403 | 403 Forbidden | **LULUS** |
| 20 | BOLA / IDOR | `PATCH /schedules/:id_A` | Dokter B | 403 | 403 Forbidden | **LULUS** |
| 21 | BOLA / IDOR | `DELETE /schedules/:id_A` | Dokter B | 403 | 403 Forbidden | **LULUS** |
| 22 | BOLA / IDOR | `GET /contexts?staffId=:id_A` | Dokter B | 403 | 403 Forbidden | **LULUS** |
| 23 | BOLA / IDOR | `GET /projection?staffId=:id_A` | Dokter B | 403 | 403 Forbidden | **LULUS** |
| 24 | BOLA / IDOR | `POST /availability (staffId=:id_A)` | Dokter B | 403 | 403 Forbidden | **LULUS** |
| 25 | Input Validation | `GET /projection?contextId=invalid` | Dokter A | 422 | `SCHEDULE_CONTEXT_NOT_FOUND` | **LULUS** |
| 26 | Input Validation | `GET /projection?startTime=05:59` | Dokter A | 422 | `START_OUTSIDE_BOUNDARY` | **LULUS** |
| 27 | Input Validation | `GET /projection?startTime=12:00` | Dokter A | 422 | `START_OUTSIDE_BOUNDARY` | **LULUS** |
| 28 | Input Validation | `GET /projection?startTime=11:45` (30m slot) | Dokter A | 422 | `DURATION_LEAVES_NO_CAPACITY` | **LULUS** |
| 29 | Input Validation | `PATCH /duration (duration=2)` | Admin | 422 | 422 Unprocessable Entity | **LULUS** |
| 30 | Input Validation | `PATCH /duration (duration=300)` | Admin | 422 | 422 Unprocessable Entity | **LULUS** |
| 31 | PII Data Sanitization | `appointmentRef` pada interval terisi | Dokter A | No PII | Bebas dari NIK, HP, & Rekam Medis | **LULUS** |
| 32 | Collision Lock | Double schedule overlap pada dokter sama | Dokter A | 409 | `PRACTITIONER_ALREADY_SCHEDULED` | **LULUS** |
| 33 | Collision Lock | Double booking ruangan pada jam sama | Dokter B | 409 | `ROOM_ALREADY_OCCUPIED` | **LULUS** |
| 34 | Relational Safety | `DELETE /schedules/:id` saat ada pasien aktif | Dokter A | 409 | `SCHEDULE_HAS_ACTIVE_BOOKINGS` | **LULUS** |

---

## 4. Siklus Penuh CRUD (In-and-Out Execution Trace)

Berikut adalah jejak eksekusi CRUD riil beserta payload request/response untuk dijadikan acuan implementasi kode oleh tim Frontend.

### 4.1 CREATE Availability (Tanpa `endTime` Manual)

Dokter hanya mengirimkan tanggal, konteks shift, jam mulai, dan catatan opsional. Backend secara otomatis menghitung `endTime`, kapasitas interval, dan seluruh interval canonical.

#### HTTP Request:
```http
POST /api/v1/schedules/availability HTTP/1.1
Host: localhost:3001
Authorization: Bearer <TOKEN_DOKTER_A>
Content-Type: application/json

{
  "date": "2026-10-06",
  "scheduleContextId": "morning",
  "startTime": "08:45",
  "notes": "Praktek Pagi CRUD Live Test"
}
```

#### HTTP Response (`201 Created`):
```json
{
  "success": true,
  "data": {
    "schedule": {
      "id": "713ba22d-cfca-4f51-827c-3f24bf745de1",
      "staffId": "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
      "staffName": "dr. Ahmad Santoso",
      "profession": "Dokter Umum",
      "scheduleDate": "2026-10-06",
      "specificDate": "2026-10-06",
      "poliklinikId": null,
      "poliklinikName": "Poliklinik",
      "session": "PAGI",
      "sessionLabel": "Pagi",
      "sessionShift": "morning",
      "startTime": "08:45",
      "endTime": "11:45",
      "timeRange": "08:45 - 11:45 WIB",
      "roomId": null,
      "roomName": null,
      "capacity": 6,
      "availableSlots": 6,
      "bookedPatientCount": 0,
      "status": "Buka",
      "rawStatus": "open",
      "isAvailable": true,
      "notes": "Praktek Pagi CRUD Live Test",
      "version": "2026-09-23T17:10:48.000Z"
    },
    "projection": {
      "scheduleId": "713ba22d-cfca-4f51-827c-3f24bf745de1",
      "capacity": 6,
      "projectedEndTime": "11:45",
      "intervals": [
        {
          "intervalIndex": 0,
          "startTime": "08:45",
          "endTime": "09:15",
          "status": "OPEN",
          "displayLabel": "Buka",
          "isOccupied": false,
          "appointmentRef": null,
          "closedReason": null
        },
        {
          "intervalIndex": 1,
          "startTime": "09:15",
          "endTime": "09:45",
          "status": "OPEN",
          "displayLabel": "Buka",
          "isOccupied": false,
          "appointmentRef": null,
          "closedReason": null
        },
        {
          "intervalIndex": 2,
          "startTime": "09:45",
          "endTime": "10:15",
          "status": "OPEN",
          "displayLabel": "Buka",
          "isOccupied": false,
          "appointmentRef": null,
          "closedReason": null
        },
        {
          "intervalIndex": 3,
          "startTime": "10:15",
          "endTime": "10:45",
          "status": "OPEN",
          "displayLabel": "Buka",
          "isOccupied": false,
          "appointmentRef": null,
          "closedReason": null
        },
        {
          "intervalIndex": 4,
          "startTime": "10:45",
          "endTime": "11:15",
          "status": "OPEN",
          "displayLabel": "Buka",
          "isOccupied": false,
          "appointmentRef": null,
          "closedReason": null
        },
        {
          "intervalIndex": 5,
          "startTime": "11:15",
          "endTime": "11:45",
          "status": "OPEN",
          "displayLabel": "Buka",
          "isOccupied": false,
          "appointmentRef": null,
          "closedReason": null
        }
      ]
    }
  }
}
```

*Verifikasi Database PostgreSQL:*  
`SELECT start_time, end_time, capacity, status FROM practitioner_schedule_sessions WHERE id = '713ba22d-cfca-4f51-827c-3f24bf745de1';`  
$\to$ `08:45:00 | 11:45:00 | 6 | open` (Sesuai 100%).

---

### 4.2 READ My Schedules & Single Schedule Detail

#### HTTP Request:
```http
GET /api/v1/schedules/my-schedules?date=2026-10-06 HTTP/1.1
Authorization: Bearer <TOKEN_DOKTER_A>
```

#### HTTP Response (`200 OK`):
```json
[
  {
    "id": "713ba22d-cfca-4f51-827c-3f24bf745de1",
    "staffId": "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
    "staffName": "dr. Ahmad Santoso",
    "scheduleDate": "2026-10-06",
    "startTime": "08:45",
    "endTime": "11:45",
    "timeRange": "08:45 - 11:45 WIB",
    "capacity": 6,
    "availableSlots": 6,
    "bookedPatientCount": 0,
    "status": "Buka",
    "rawStatus": "open",
    "isAvailable": true,
    "notes": "Praktek Pagi CRUD Live Test"
  }
]
```

---

### 4.3 UPDATE: Toggle Availability (Buka / Tutup)

Ketika dokter mendadak menutup sesi penerimaan janji temu:

#### HTTP Request:
```http
PATCH /api/v1/schedules/713ba22d-cfca-4f51-827c-3f24bf745de1/availability HTTP/1.1
Authorization: Bearer <TOKEN_DOKTER_A>
Content-Type: application/json

{
  "isAvailable": false
}
```

#### HTTP Response (`200 OK`):
```json
{
  "id": "713ba22d-cfca-4f51-827c-3f24bf745de1",
  "status": "Tutup",
  "rawStatus": "closed",
  "isAvailable": false
}
```

*Verifikasi Database PostgreSQL:*  
`SELECT status FROM practitioner_schedule_sessions WHERE id = '713ba22d-cfca-4f51-827c-3f24bf745de1';`  
$\to$ `closed`.

---

### 4.4 UPDATE: Parameter Perubahan Kuota & Catatan

#### HTTP Request:
```http
PATCH /api/v1/schedules/713ba22d-cfca-4f51-827c-3f24bf745de1 HTTP/1.1
Authorization: Bearer <TOKEN_DOKTER_A>
Content-Type: application/json

{
  "notes": "Praktek Pagi Diperbarui",
  "capacity": 10
}
```

#### HTTP Response (`200 OK`):
```json
{
  "id": "713ba22d-cfca-4f51-827c-3f24bf745de1",
  "capacity": 10,
  "notes": "Praktek Pagi Diperbarui"
}
```

---

### 4.5 ADMIN READ: Visualisasi Gantt / Timeline Sheet

Admin memanggil detail dokter untuk merender visualisasi Gantt chart timeline interval:

#### HTTP Request:
```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca?date=2026-10-06 HTTP/1.1
Authorization: Bearer <TOKEN_ADMIN>
```

#### HTTP Response (`200 OK`):
Menyertakan field `timeline_intervals` yang siap di-loop oleh komponen frontend web:
```json
{
  "success": true,
  "data": {
    "id": "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
    "nama_dokter": "dr. Ahmad Santoso",
    "status_dokter": "Buka",
    "timeline_intervals": [
      {
        "intervalIndex": 0,
        "startTime": "08:45",
        "endTime": "09:15",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null
      }
    ]
  }
}
```

---

### 4.6 DELETE: Pengamanan Relasional & Penghapusan Bersih

#### Uji Kasus A: Penghapusan Gagal karena Ada Pasien Aktif (HTTP 409)
```http
DELETE /api/v1/schedules/713ba22d-cfca-4f51-827c-3f24bf745de1 HTTP/1.1
Authorization: Bearer <TOKEN_DOKTER_A>
```
Response:
```json
{
  "type": "https://amanah.health/errors/conflict",
  "title": "Conflict",
  "status": 409,
  "code": "SCHEDULE_HAS_ACTIVE_BOOKINGS",
  "message": "Jadwal tidak dapat dihapus karena sudah memiliki 1 pasien terdaftar. Batalkan atau jadwalkan ulang janji temu pasien terlebih dahulu."
}
```

#### Uji Kasus B: Penghapusan Berhasil setelah Pasien Dibatalkan (HTTP 204)
```http
DELETE /api/v1/schedules/713ba22d-cfca-4f51-827c-3f24bf745de1 HTTP/1.1
Authorization: Bearer <TOKEN_DOKTER_A>
```
Response:  
**`204 No Content`**

*Verifikasi Database PostgreSQL:*  
`SELECT COUNT(*) FROM practitioner_schedule_sessions WHERE id = '713ba22d-cfca-4f51-827c-3f24bf745de1';`  
$\to$ `0` (Baris data bersih permanen).

### 4.5 Operasi Khusus Admin: Larangan Hapus & Reschedule Sesi

#### Uji Kasus A: Larangan Penghapusan Jadwal oleh Admin (HTTP 403 Forbidden)
```http
DELETE /api/v1/admin/doctor-schedules/doc-uuid/sessions/session-uuid HTTP/1.1
Authorization: Bearer <TOKEN_ADMIN>
```
Response:  
**`403 Forbidden`**
```json
{
  "statusCode": 403,
  "code": "ADMIN_SCHEDULE_DELETION_PROHIBITED",
  "message": "Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data dan riwayat rekam medis klinis. Silakan nonaktifkan sesi (status Tutup/Cuti) atau lakukan Reschedule."
}
```

#### Uji Kasus B: Reschedule Sesi & Pergeseran Otomatis Janji Temu Pasien (HTTP 200 OK)
```http
POST /api/v1/admin/doctor-schedules/doc-uuid/sessions/session-uuid/reschedule HTTP/1.1
Authorization: Bearer <TOKEN_ADMIN>
Content-Type: application/json

{
  "targetDate": "2026-10-15",
  "targetStartTime": "09:00",
  "reason": "Dokter berhalangan hadir darurat, dialihkan ke 15 Oktober",
  "rescheduleActiveAppointments": true
}
```
Response:  
**`200 OK`**
- `data.rescheduledSchedule.scheduleDate`: `"2026-10-15"`
- `data.rescheduledSchedule.startTime`: `"09:00"`
- `data.rescheduledSchedule.endTime`: `"12:00"` (dihitung otomatis oleh backend SSOT)
- `data.rescheduledAppointmentsCount`: `1`
- *Verifikasi Database PostgreSQL:* Baris sesi dipindahkan ke `2026-10-15|09:00:00|12:00:00`, dan janji temu pasien otomatis tergeser ke `2026-10-15|09:00:00`.

#### Uji Kasus C: Pencegahan Reschedule Bertabrakan / Collision (HTTP 409 Conflict)
Mencoba me-reschedule sesi ke tanggal/jam yang telah memiliki sesi aktif dokter lain/sama ditolak dengan **HTTP 409 Conflict** (`PRACTITIONER_ALREADY_SCHEDULED`).

---

## 5. Kamus Kode Galat & Panduan Pesan UI Frontend

Frontend disarankan menampilkan notifikasi toast / dialog informatif dengan memetakan properti `code` dari respon JSON backend:

| Error Code | HTTP Status | Judul Notifikasi UI | Pesan Rekomendasi untuk Pengguna |
|---|:---:|---|---|
| `START_OUTSIDE_BOUNDARY` | 422 | Waktu di Luar Shift | Jam mulai yang Anda pilih berada di luar rentang jam shift praktek ini. |
| `DURATION_LEAVES_NO_CAPACITY` | 422 | Batas Waktu Tidak Cukup | Waktu mulai terlalu dekat dengan akhir shift sehingga tidak ada kuota konsultasi yang dapat dibuat. |
| `SCHEDULE_CONTEXT_NOT_FOUND` | 422 | Shift Tidak Dikenal | Konteks shift jadwal tidak ditemukan dalam sistem. |
| `PRACTITIONER_ALREADY_SCHEDULED` | 409 | Jadwal Bertabrakan | Dokter sudah memiliki jadwal praktek lain yang aktif pada rentang jam ini. |
| `ROOM_ALREADY_OCCUPIED` | 409 | Ruangan Sedang Terpakai | Ruang praktek yang dipilih sedang digunakan oleh dokter lain pada jam tersebut. |
| `DATE_CLOSED` | 409 | Hari Cuti | Tidak dapat membuka atau me-reschedule jadwal karena dokter tercatat sedang cuti pada tanggal ini. |
| `SCHEDULE_HAS_ACTIVE_BOOKINGS` | 409 | Tidak Dapat Dihapus | Jadwal ini sudah memiliki pasien terdaftar. Silakan batalkan atau jadwalkan ulang pasien terlebih dahulu. |
| `ADMIN_SCHEDULE_DELETION_PROHIBITED` | 403 | Penghapusan Dilarang | Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data rekam medis. Silakan nonaktifkan sesi (Tutup/Cuti) atau lakukan Reschedule. |
| `SCHEDULE_MODIFIED_CONCURRENTLY`| 409 | Data Telah Berubah | Jadwal telah diubah oleh perangkat lain atau admin. Halaman diperbarui otomatis. |

---

## 6. Pernyataan Kesiapan Tim Frontend

Dokumen dan skrip pengujian ini menyatakan bahwa:
- Seluruh endpoint Schedule V2 telah diuji secara menyeluruh.
- Database PostgreSQL berada dalam kondisi stabil dan tervalidasi.
- Tidak ditemukan celah keamanan BOLA, IDOR, eskalasi peran, atau kebocoran data medis.
- Tim frontend (Flutter Mobile & Next.js Web) dapat melanjutkan integrasi antarmuka dengan mengacu pada kontrak ini.
