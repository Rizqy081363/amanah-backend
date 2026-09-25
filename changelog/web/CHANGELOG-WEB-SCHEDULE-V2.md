# Next.js Web Admin — Schedule V2 API Contract & Integration Specification

**Document Version:** 2.1.0  
**Target Audience:** Next.js Web Frontend & Admin Engineering Team  
**Backend Service:** Amanah Healthcare Backend v1.2.0  
**Base URL:** `http://localhost:3001/api/v1` (Development) / Gateway Base URL (Production)  
**Security & RBAC:** Strictly requires `Authorization: Bearer <JWT_TOKEN>` with role `ADMIN`.

---

## 1. Architectural Scope & Core Rules

### 1.1 Backend as the Single Source of Truth (SSOT)
- **Zero Client Arithmetic:** The Web Admin frontend must **never** compute session interval slices, derive end times (`endTime = startTime + duration`), or calculate daily capacities locally. All formulas, boundary validations, and capacity determinations belong exclusively to PostgreSQL and the backend projection engine.
- **Dynamic Policy:** Consultation durations (default: `30` mins) and shift boundaries reside in the database and are configured per practitioner by Administrators.

### 1.2 Canonical Status Semantics (Elimination of `Penuh`)
Healthcare clinical outpatient scheduling operates on **discrete 1-on-1 practitioner-patient consultation slots**, not bulk commercial airline passenger seating.
- **`OPEN` (Display Label: `Buka`):** The consultation slot is active and ready for patient booking.
- **`OCCUPIED` (Display Label: `Terisi`):** The consultation slot contains an active, scheduled patient appointment.
- **`CLOSED` (Display Label: `Tutup`):** The consultation slot is unavailable, out of hours, or the doctor is registered on leave (`closedReason: "LEAVE"`).
- **Quota Overview:** When all slots in a session are taken, the session overview card displays `0/N slot tersedia`. However, each individual slot on the timeline is authoritatively `OCCUPIED` (`Terisi`). The ambiguous status string `"Penuh"` is completely deprecated.

### 1.3 Deletion Prohibition Rule for Administrators
- **Admin CANNOT delete doctor schedules:** Sesi jadwal dokter yang telah tercatat dalam sistem **tidak dapat dihapus** oleh administrator (`DELETE` endpoint menolak permintaan dengan status `403 Forbidden` dan kode `ADMIN_SCHEDULE_DELETION_PROHIBITED`).
- **Rationale:** Menjaga integritas jejak audit klinis, riwayat pelayanan pasien, dan mencegah hilangnya histori rekam medis.
- **Prescribed Alternatives:** Jika jadwal batal atau dokter berhalangan hadir, Admin harus:
  1. Mengubah status sesi menjadi `Tutup` atau `Cuti` via `PATCH /admin/doctor-schedules/:id/sessions/:sessionId` atau `PATCH /admin/doctor-schedules/:id/day-status`.
  2. Melakukan penjadwalan ulang ke tanggal/jam lain via `POST /admin/doctor-schedules/:id/sessions/:sessionId/reschedule`.

### 1.4 Format Waktu Standar 24-Jam (`HH:mm`)
Seluruh pertukaran data waktu antara backend dan klien (Web Admin & Mobile) **wajib dan mutlak menggunakan format 24-jam standar ISO** dengan padding nol dua digit (`HH:mm`), dari `00:00` hingga `23:59`.
- **Tidak ada format 12 jam (AM/PM):** Backend tidak menerima ataupun mengembalikan format waktu 12 jam.
- **Validasi Input DTO:** String waktu divalidasi ketat dengan ekspresi reguler `^([01]\d|2[0-3]):([0-5]\d)$`. Nilai seperti `1:00`, `9:30 AM`, atau `24:00` ditolak dengan status HTTP `422 Unprocessable Entity` / `400 Bad Request`.
- **Representasi di Semua Shift:**
  - **Dini Hari (`early_morning`):** Rentang `00:00 - 06:00` WIB (contoh: `00:00`, `01:30`, `03:00`, `05:30`).
  - **Pagi (`morning`):** Rentang `06:00 - 12:00` WIB (contoh: `08:45`, `09:15`, `11:45`).
  - **Siang (`afternoon`):** Rentang `12:00 - 17:00` WIB (contoh: `12:30`, `13:00`, `14:30`, `16:00`).
  - **Malam (`night`):** Rentang `17:00 - 21:00` WIB (dan shift malam lanjutan hingga `23:00` / `23:59` WIB) (contoh: `17:00`, `19:30`, `21:00`, `23:00`).
- **Gantt Timeline & Serialisasi Interval:** Nilai `startTime` dan `endTime` pada array `timeline_intervals` selalu terformat `HH:mm` (contoh: `"startTime": "13:00"`, `"endTime": "13:30"`).

### 1.5 Paradigma Slot & Penghitungan Kapasitas Shift (Backend SSOT)

Frontend Web Admin **dilarang keras melakukan hardcoding pembagian slot atau perhitungan matematika interval waktu**. Seluruh pembagian slot dan kuota dihitung secara deterministik oleh backend.

#### A. Contoh Matematis Shift Pagi (`06:00 - 12:00`):
1. **Total Waktu Shift:** Dari jam `06:00` sampai `12:00` = 6 jam = **360 menit**.
2. **Durasi Konsultasi Dokter:** Default **30 menit** (diambil dinamis dari database `practitioners.consultation_duration_minutes`).
3. **Total Slot Tersedia:**
   $$\text{Total Kapasitas Shift} = \frac{360\text{ menit}}{30\text{ menit}} = \mathbf{12\text{ slot konsultasi}}$$
   Grid 12 slot serial yang disediakan oleh backend:
   * Slot 1: `06:00 - 06:30`
   * Slot 2: `06:30 - 07:00`
   * Slot 3: `07:00 - 07:30`
   * Slot 4: `07:30 - 08:00`
   * Slot 5: `08:00 - 08:30`
   * Slot 6: `08:30 - 09:00`
   * Slot 7: `09:00 - 09:30`
   * Slot 8: `09:30 - 10:00`
   * Slot 9: `10:00 - 10:30`
   * Slot 10: `10:30 - 11:00`
   * Slot 11: `11:00 - 11:30`
   * Slot 12: `11:30 - 12:00`

#### B. Sesi Tunggal & Pengurangan Sisa Slot Menuju Batas Akhir Shift:
Jika dokter baru membuka jadwal mulai jam **`09:00`**:
* **Sesi Tunggal yang Terbentuk:** `09:00 - 09:30` (Kapasitas = **1**). Dokter **TIDAK** memblokir waktu dari 09:00 sampai 12:00.
* **Sisa Slot Menuju Batas Shift (`remainingShiftSlots`):**
  Waktu dari jam selesai sesi (`09:30`) menuju batas akhir shift Pagi (`12:00`) adalah 150 menit:
  $$\text{remainingShiftSlots} = \frac{150\text{ menit}}{30\text{ menit}} = \mathbf{5\text{ slot tersisa}}$$
* **Prinsip Semakin Maju Semakin Berkurang:**
  * Jika dokter baru mulai jam `10:00` $\to$ Selesai `10:30` $\to$ Sisa menuju jam 12:00 adalah 90 menit = **3 slot tersisa**.
  * Jika dokter baru mulai jam `11:30` $\to$ Selesai `12:00` $\to$ Sisa menuju jam 12:00 adalah 0 menit = **0 slot tersisa** (shift penuh).

#### C. Pemetaan Endpoint Resmi (Endpoint Mana Dipakai untuk Apa?):

| Kebutuhan Frontend Web Admin | Endpoint Backend Resmi | Keterangan Data yang Diberikan |
|---|---|---|
| **1. Ambil batas jam shift & durasi konsultasi dokter** | `GET /api/v1/schedules/contexts?date=YYYY-MM-DD[&staffId=UUID]` | Memberikan 4 shift (`00:00-06:00`, `06:00-12:00`, dst.) & durasi konsultasi dokter dari DB (`30 menit`). |
| **2. Tampilkan grid utuh 12 slot (mana yang kosong, mana yang terisi)** | `GET /api/v1/schedules/occupancy-overview?date=YYYY-MM-DD&staffId=UUID[&roomId=UUID]` | Memberikan array lengkap 12 slot per shift dengan flag `isAvailable: true/false`, status `AVAILABLE`, `OCCUPIED_BY_SELF`, atau `OCCUPIED_BY_OTHER`. |
| **3. Live preview kalkulasi jam selesai & sisa slot saat jam dipilih** | `GET /api/v1/schedules/projection?date=...&scheduleContextId=morning&startTime=09:00&staffId=UUID` | Menghitung instan: input `09:00` $\to$ `projectedEndTime: "09:30"`, `capacity: 1`, `remainingShiftSlots: 5`. |
| **4. Tambah sesi praktik baru** | `POST /api/v1/schedules/availability` | Input hanya butuh `date`, `scheduleContextId`, `startTime`, dan `roomId`. Jam selesai dihitung otomatis oleh backend. |
| **5. Reschedule sesi ke jam/hari lain** | `POST /api/v1/admin/doctor-schedules/:id/sessions/:sessionId/reschedule` | Memindahkan sesi ke tanggal/jam baru dan otomatis menggeser antrean pasien aktif secara atomik. |
| **6. Ambil master dropdown ruangan (bebas hardcode)** | `GET /api/v1/schedules/reference/rooms` | Daftar seluruh ruangan klinik aktif beserta status keterisiannya. |
| **7. Ambil master dropdown poliklinik (bebas hardcode)** | `GET /api/v1/schedules/reference/polikliniks` | Daftar unit poliklinik aktif untuk pilihan form. |

---

## 2. API Endpoint Catalog for Web Admin

| Method | Endpoint | Description | Expected Status |
|---|---|---|---|
| `GET` | `/admin/doctor-schedules` | Mendapatkan daftar supervisi jadwal dokter (filter poli, status, bulan, search) | `200 OK` |
| `GET` | `/admin/doctor-schedules/filter-options` | Master dropdown referensi filter (Poliklinik, Spesialisasi, Status) | `200 OK` |
| `GET` | `/admin/doctor-schedules/:id` | Detail dokter, kalender bulanan, dan **serialized Gantt timeline (`timeline_intervals`)** | `200 OK` |
| `GET` | `/schedules/reference/rooms` | **Master daftar ruangan klinik aktif & status okupansi dinamis (bebas hardcode)** | `200 OK` |
| `GET` | `/schedules/reference/polikliniks` | Master daftar unit poliklinik aktif untuk opsi dropdown form | `200 OK` |
| `GET` | `/schedules/occupancy-overview` | **Grid okupansi 4 shift dokter & deteksi bentrok ruangan sebelum reschedule** | `200 OK` |
| `PATCH` | `/admin/doctor-schedules/:id/sessions/:sessionId` | Update operasional sesi: status (`Buka`/`Tutup`), ruangan, kuota, catatan | `200 OK` |
| `POST` | `/admin/doctor-schedules/:id/sessions/:sessionId/reschedule` | **Reschedule sesi jadwal ke tanggal/jam baru (auto-shift janji temu pasien)** | `200 OK` |
| `PATCH` | `/admin/doctor-schedules/:id/duration` | Konfigurasi kebijakan durasi konsultasi per dokter (15, 20, 30, 45, 60 menit) | `200 OK` |
| `PATCH` | `/admin/doctor-schedules/:id/days/:date` | Penyesuaian status satu hari kalender tertentu (`Buka`, `Cuti`, `Tutup`) | `200 OK` |
| `PATCH` | `/admin/doctor-schedules/:id/day-status` | Penyesuaian status hari kalender via request body | `200 OK` |
| `DELETE` | `/admin/doctor-schedules/:id/sessions/:sessionId` | **Dilarang untuk Admin** (menolak dengan `403 Forbidden`) | `403 Forbidden` |

---

## 3. Serialized Gantt Timeline Contract (`GET /admin/doctor-schedules/:id`)

Endpoint ini dikonsumsi oleh **Admin Doctor Detail Sheet/Drawer**. Respons menyertakan array `timeline_intervals` yang ter-serialisasi untuk dirender sebagai **Gantt Chart / Milestone Timeline**.

### 3.1 Request
```http
GET /api/v1/admin/doctor-schedules/3cb62e10-450b-43e5-aba9-49ec37079ebb?date=2026-09-24 HTTP/1.1
Host: localhost:3001
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

#### Query Parameters:
| Parameter | Type | Required | Description | Example |
|---|---|---|---|---|
| `date` | `string` | No | Tanggal target inspeksi timeline (format: YYYY-MM-DD). Default: hari ini. | `2026-09-24` |
| `month` | `string` | No | Bulan kalender (format: YYYY-MM). Default: bulan dari parameter `date`. | `2026-09` |

### 3.2 Response Body Contract (`200 OK`)
```json
{
  "success": true,
  "data": {
    "id": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
    "practitioner_id": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
    "nama_dokter": "dr. Siti Rahma",
    "spesialisasi": "Poli Gigi",
    "status_dokter": "Buka",
    "email": "dr.siti@amanah.com",
    "nomor_telepon": "081234567890",
    "ruang_praktik": "Ruang Gigi 1",
    "avatar": "/api/v1/avatar/doctor-siti.webp",
    "slot_tersedia": 5,
    "kapasitas_per_hari": 6,
    "bulan_jadwal": "September 2026",
    "is_cuti": false,
    "cuti_reason": null,
    "cuti_start": null,
    "cuti_end": null,
    "monthly_schedule": [
      {
        "day": 24,
        "date": "2026-09-24",
        "status": "Buka",
        "notes": null
      }
    ],
    "sesi_harian": [
      {
        "id": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
        "nama_sesi": "Sesi Pagi",
        "jam_mulai": "08:45",
        "jam_selesai": "11:45",
        "waktu": "08:45 - 11:45",
        "kuota_pasien": 6,
        "slot_tersedia": 5,
        "status_sesi": "Buka",
        "ruang": "Ruang Gigi 1"
      }
    ],
    "timeline_intervals": [
      {
        "intervalIndex": 1,
        "startTime": "08:45",
        "endTime": "09:15",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 2,
        "startTime": "09:15",
        "endTime": "09:45",
        "status": "OCCUPIED",
        "displayLabel": "Terisi",
        "isOccupied": true,
        "appointmentRef": {
          "appointmentId": "f7d73b06-444a-4a6c-9413-2df625aefd12",
          "queueNumber": "A-01",
          "status": "booked"
        },
        "closedReason": null
      },
      {
        "intervalIndex": 3,
        "startTime": "09:45",
        "endTime": "10:15",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 4,
        "startTime": "10:15",
        "endTime": "10:45",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 5,
        "startTime": "10:45",
        "endTime": "11:15",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 6,
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
```

### 3.3 Gantt / Milestone Timeline Field Contract (`timeline_intervals[*]`)

| Field Name | Type | Value Range / Example | Description |
|---|---|---|---|
| `intervalIndex` | `number` | `1, 2, 3, ...` | Urutan slot konsultasi (1-indexed) |
| `startTime` | `string` | `"08:45"` (HH:mm) | Waktu awal milestone konsultasi |
| `endTime` | `string` | `"09:15"` (HH:mm) | Waktu akhir milestone konsultasi |
| `status` | `string` | `"OPEN"`, `"OCCUPIED"`, `"CLOSED"` | Status kanonik slot |
| `displayLabel` | `string` | `"Buka"`, `"Terisi"`, `"Tutup"` | Label bahasa Indonesia resmi |
| `isOccupied` | `boolean` | `true` / `false` | True jika ada janji temu pasien aktif |
| `appointmentRef` | `object \| null` | `{ appointmentId, queueNumber, status }` | Ringkasan janji temu aman (bebas bocoran PII) |
| `closedReason` | `string \| null` | `"LEAVE"`, `"SCHEDULE_CLOSED"`, `null` | Alasan penutupan slot jika status `CLOSED` |

### 3.4 Petunjuk Visualisasi Sumbu Gantt untuk Web Frontend:
- **Sumbu X (Axis Waktu / Milestone Ticks):** Petakan nilai `startTime` setiap elemen dan nilai `endTime` elemen terakhir secara kontinu (misal: `08:45`, `09:15`, `09:45`, `10:15`, `10:45`, `11:15`, `11:45`).
- **Sumbu Y (Axis Jalur Sesi / Ruang):** Petakan baris lintasan berdasarkan `sesi_harian[*].nama_sesi` dan `ruang_praktik`.
- **Indikator Warna Slot:**
  - `OPEN` / `Buka`: Hijau (Emerald).
  - `OCCUPIED` / `Terisi`: Biru Langit (Sky Blue) dengan menampilkan `appointmentRef.queueNumber`.
  - `CLOSED` / `Tutup`: Abu-abu (Slate) dengan tooltip alasan cuti/tutup.

---

## 4. Reschedule API Contract (`POST .../reschedule`)

Endpoint resmi bagi Admin untuk menjadwalkan ulang (reschedule) sesi shift praktik dokter/staf/bidan ke tanggal atau jam baru, dengan sinkronisasi database dan pergeseran otomatis janji temu pasien.

### 4.1 Endpoint Definition
- **Method:** `POST`
- **Path:** `/api/v1/admin/doctor-schedules/:id/sessions/:sessionId/reschedule`
- **Headers:**
  - `Authorization: Bearer <ADMIN_JWT_TOKEN>`
  - `Content-Type: application/json`

> **Preserved Duration Rule:**
> Backend secara otomatis mempertahankan durasi sesi asli ketika dipindahkan ke jam mulai baru (`endTime = targetStartTime + originalDuration`). Contoh: Jika sesi asli berdurasi 30 menit (`08:00 - 08:30`) di-reschedule ke jam `09:00`, maka waktu selesainya otomatis menjadi `09:30`. Janji temu pasien aktif di dalam sesi tersebut juga ikut bergeser secara atomik ke tanggal dan jam baru.

### 4.2 URL Parameters
| Parameter | Type | Required | Description | Example |
|---|---|---|---|---|
| `id` | `string` (UUID) | Yes | ID unik praktisi medis / staf dokter | `3cb62e10-450b-43e5-aba9-49ec37079ebb` |
| `sessionId` | `string` (UUID) | Yes | ID sesi shift jadwal yang akan dipindahkan | `8489be4c-7c05-4c07-b352-7bf579b29cb1` |

### 4.3 Request Body Schema (`RescheduleAdminDoctorSessionDto`)
```json
{
  "targetDate": "2026-10-15",
  "targetStartTime": "09:00",
  "targetScheduleContextId": "morning",
  "targetRoomId": "e3067341-a185-484d-91d6-84848fcff1ef",
  "reason": "Dokter berhalangan hadir darurat, sesi dialihkan ke tanggal 15 Oktober",
  "rescheduleActiveAppointments": true
}
```

#### Field Specifications:
| Field | Type | Required | Validation Constraints | Description |
|---|---|---|---|---|
| `targetDate` | `string` | **Yes** | ISO Date `YYYY-MM-DD` | Tanggal baru pelaksanaan shift praktik |
| `targetStartTime` | `string` | **Yes** | Regex `^([01]\d\|2[0-3]):([0-5]\d)$` | Jam mulai baru pada tanggal target (HH:mm) |
| `targetScheduleContextId` | `string` | No | `'early_morning'`, `'morning'`, `'afternoon'`, `'night'` | Shift konteks target. Jika omitted, backend mendeteksi otomatis dari `targetStartTime`. |
| `targetRoomId` | `string` | No | UUID v4 | Ruangan baru jika shift dipindahkan ruangan |
| `reason` | `string` | No | String | Alasan pemindahan untuk audit trail dan catatan sesi |
| `rescheduleActiveAppointments` | `boolean` | No | Default: `true` | Jika `true`, janji temu pasien aktif otomatis bergeser tanggal dan jamnya |

### 4.4 Success Response Body (`200 OK`)
```json
{
  "success": true,
  "message": "Jadwal dokter berhasil dijadwalkan ulang (rescheduled)",
  "data": {
    "sessionId": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
    "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
    "previousSchedule": {
      "date": "2026-09-24",
      "startTime": "08:45",
      "endTime": "11:45",
      "roomId": "e3067341-a185-484d-91d6-84848fcff1ef"
    },
    "rescheduledSchedule": {
      "id": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
      "scheduleDate": "2026-10-15",
      "startTime": "09:00",
      "endTime": "12:00",
      "timeRange": "09:00 - 12:00 WIB",
      "sessionLabel": "Pagi",
      "sessionShift": "morning",
      "capacity": 6,
      "availableSlots": 5,
      "status": "open",
      "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
      "notes": "[RESCHEDULED] Dokter berhalangan hadir darurat, sesi dialihkan ke tanggal 15 Oktober",
      "version": "2026-09-24T02:15:30.000Z"
    },
    "rescheduledAppointmentsCount": 1,
    "projection": {
      "scheduleId": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
      "date": "2026-10-15",
      "selectedStartTime": "09:00",
      "projectedEndTime": "12:00",
      "capacity": 6,
      "intervals": [ ... ]
    }
  }
}
```

### 4.5 Error Responses & Error Codes

| HTTP Status | Error Code | Indonesian Message / Description |
|---|---|---|
| `401 Unauthorized` | `UNAUTHORIZED` | Token autentikasi tidak disertakan atau kadaluwarsa |
| `403 Forbidden` | `FORBIDDEN` | Akun pemanggil bukan role `ADMIN` |
| `404 Not Found` | `NOT_FOUND` | Dokter (`:id`) atau sesi jadwal (`:sessionId`) tidak ditemukan |
| `409 Conflict` | `PRACTITIONER_ALREADY_SCHEDULED` | Dokter sudah memiliki jadwal praktek lain yang bertabrakan pada rentang jam tersebut di tanggal target |
| `409 Conflict` | `ROOM_ALREADY_OCCUPIED` | Ruangan target sudah digunakan oleh dokter lain pada rentang jam tersebut |
| `409 Conflict` | `DATE_CLOSED` | Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target |
| `422 Unprocessable` | `START_OUTSIDE_BOUNDARY` | `targetStartTime` berada di luar batas waktu shift target (misal: 05:30 untuk shift pagi) |
| `422 Unprocessable` | `DURATION_LEAVES_NO_CAPACITY` | Jam mulai target terlalu dekat dengan akhir batas shift sehingga tidak menghasilkan kuota konsultasi |

### 4.6 Mekanisme Reschedule Modal & Kontrak Interaksi UI Web Admin

Untuk memastikan sinkronisasi data yang sempurna dan mencegah kebingungan pengguna, Web Admin frontend diwajibkan mengikuti mekanisme interaksi modal berikut:

#### 1. Titik Pemicu (Trigger Action):
* Admin berada pada halaman atau Sheet Detail Dokter (`GET /api/v1/admin/doctor-schedules/:id?date=YYYY-MM-DD`).
* Di layar terdapat daftar `sesi_harian` dan timeline Gantt chart `timeline_intervals`.
* Setiap item sesi memiliki properti `id` (yang merupakan `:sessionId`), `nama_sesi`, `jam_mulai`, `jam_selesai`, `waktu`, `kuota_pasien`, `slot_tersedia`, dan `ruang`.
* Admin menekan tombol **"Reschedule"** pada salah satu baris sesi tertentu (misal sesi Dini Hari jam `02:00 - 02:30`).

#### 2. Tampilan & Form Input Modal Reschedule:
Modal / Dialog Sheet terbuka dengan menampilkan informasi sesi sumber:
> **Sesi Asal:** dr. Ahmad Santoso — Sesi Dini Hari (`02:00 - 02:30 WIB`), Ruang Poli 1.

Formulir di dalam modal menyediakan input:
1. **Tanggal Target Baru (`targetDate`):** Datepicker dengan nilai awal tanggal hari ini atau tanggal sesi asal. Wajib format `YYYY-MM-DD`.
2. **Jam Mulai Target Baru (`targetStartTime`):** Timepicker 24-jam format `HH:mm` (misal: `13:00`). Backend otomatis menghitung jam selesai sesuai durasi asli sesi dokter (misal `13:00 - 13:30`).
3. **Pilihan Ruangan Target (`targetRoomId`):** Dropdown pilihan ruangan yang diambil secara dinamis dari `GET /api/v1/schedules/reference/rooms`. *Tidak boleh di-hardcode di kode frontend.*
4. **Alasan Pemindahan (`reason`):** Textarea opsional untuk audit trail klinik (misal: *"Dokter dialihkan ke sesi siang"*).
5. **Checkbox Otomatis Geser Pasien (`rescheduleActiveAppointments`):** Checkbox dengan status default `true` (mencentang ini menjamin seluruh antrean janji temu pasien aktif otomatis ikut digeser ke tanggal dan jam baru tanpa kehilangan data booking).

#### 3. Rekomendasi Pre-Check Anti-Collision Sebelum Submit (Opsional tapi Direkomendasikan):
Saat admin memilih `targetDate` dan `targetRoomId`, frontend dapat memanggil:
```http
GET /api/v1/schedules/occupancy-overview?date={targetDate}&staffId={doctorId}&roomId={targetRoomId}
```
Hasilnya menampilkan grid 4 shift (`early_morning`, `morning`, `afternoon`, `night`). Frontend dapat menonaktifkan jam-jam yang sudah berstatus `isAvailable: false` (misal jam yang sudah diisi dokter lain di ruangan tersebut) sehingga admin langsung memilih jam yang berstatus `AVAILABLE` (`isAvailable: true`).

#### 4. Eksekusi Request Submit:
```http
POST /api/v1/admin/doctor-schedules/{doctorId}/sessions/{sessionId}/reschedule
Content-Type: application/json
Authorization: Bearer <ADMIN_JWT_TOKEN>

{
  "targetDate": "2026-09-24",
  "targetStartTime": "13:00",
  "targetRoomId": "e3067341-a185-484d-91d6-84848fcff1ef",
  "reason": "Dialihkan dari sesi dini hari ke sesi siang",
  "rescheduleActiveAppointments": true
}
```

#### 5. Penanganan Response:
* **Jika Berhasil (`200 OK`):**
  1. Tutup modal reschedule.
  2. Tampilkan notifikasi toast: *"Jadwal dokter berhasil di-reschedule ke 24 Sep 2026, 13:00 WIB"*.
  3. Re-fetch data detail dokter (`GET /api/v1/admin/doctor-schedules/:id?date=YYYY-MM-DD`). Sesi yang di-reschedule otomatis berpindah dari shift Dini Hari ke shift Siang pada kartu sesi dan timeline Gantt chart.
* **Jika Gagal Bentrok (`409 Conflict`):**
  1. Jangan tutup modal.
  2. Baca properti `code` dan `message` dari response error.
  3. Jika `code == "PRACTITIONER_ALREADY_SCHEDULED"`: Tampilkan pesan *"Dokter sudah memiliki jadwal lain pada jam tersebut. Silakan pilih jam lain."*
  4. Jika `code == "ROOM_ALREADY_OCCUPIED"`: Tampilkan pesan *"Ruangan tersebut sudah digunakan oleh dokter lain pada jam tersebut. Silakan pilih ruangan atau jam lain."*
  5. Jika `code == "DATE_CLOSED"`: Tampilkan pesan *"Dokter tercatat sedang cuti pada tanggal target."*

---

## 5. Master Referensi Ruangan & Poliklinik (Zero Hardcoding)

Frontend Web Admin **dilarang keras melakukan hardcoding data master ruangan atau poliklinik**. Backend menyediakan endpoint master referensi yang aktif dan selalu sinkron dengan PostgreSQL.

### 5.1 Master Ruangan Klinik (`GET /api/v1/schedules/reference/rooms`)
Mengambil seluruh ruangan periksa klinik aktif. Dapat digunakan untuk dropdown pemilihan ruangan pada form tambah jadwal, edit sesi, dan reschedule.

```http
GET /api/v1/schedules/reference/rooms HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

#### Query Parameters Opsional (Untuk Deteksi Okupansi Realtime):
| Parameter | Type | Required | Description |
|---|---|---|---|
| `date` | `string` | Tidak | Tanggal pengecekan ketersediaan ruangan (format: `YYYY-MM-DD`). |
| `startTime` | `string` | Tidak | Jam mulai (format: `HH:mm`). |
| `endTime` | `string` | Tidak | Jam selesai (format: `HH:mm`). |

#### Response (`200 OK`):
```json
[
  {
    "id": "e3067341-a185-484d-91d6-84848fcff1ef",
    "code": "R-POLI-01",
    "name": "Ruang Poli 1",
    "location": "Lantai 1, Sayap Barat",
    "floor": 1,
    "isOccupied": false,
    "occupiedBy": null
  },
  {
    "id": "4a713919-0128-4448-936e-5ec80f55cf01",
    "code": "R-GIGI-01",
    "name": "Ruang Gigi 1",
    "location": "Lantai 2",
    "floor": 2,
    "isOccupied": true,
    "occupiedBy": "dr. Siti Rahma (08:00 - 08:30 WIB)"
  }
]
```

### 5.2 Master Unit Poliklinik (`GET /api/v1/schedules/reference/polikliniks`)
Mengambil seluruh unit poliklinik aktif untuk dropdown filter atau registrasi poli.

```http
GET /api/v1/schedules/reference/polikliniks HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

#### Response (`200 OK`):
```json
[
  {
    "id": "239a5ec2-23c2-4fa8-b2ef-15608c02a76f",
    "code": "POLI-GIGI",
    "name": "Poliklinik Gigi & Mulut",
    "location": "Gedung A, Lantai 2"
  },
  {
    "id": "1b953412-4411-477a-b102-39871144a101",
    "code": "POLI-UMUM",
    "name": "Poliklinik Umum",
    "location": "Gedung A, Lantai 1"
  }
]
```

---

## 6. Anti-Collision Slot Overview for Web Admin (`GET /schedules/occupancy-overview`)

Web Admin dapat menginspeksi keterisian slot di seluruh 4 shift untuk dokter tertentu pada tanggal tertentu, termasuk mendeteksi apakah ruangan yang dipilih sedang digunakan oleh dokter lain.

```http
GET /api/v1/schedules/occupancy-overview?date=2026-09-24&staffId=3cb62e10-450b-43e5-aba9-49ec37079ebb&roomId=e3067341-a185-484d-91d6-84848fcff1ef HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

#### Query Parameters:
| Parameter | Type | Required | Description |
|---|---|---|---|
| `date` | `string` | **Ya** | Tanggal target (format `YYYY-MM-DD`). |
| `staffId` | `string` | **Ya** (untuk Admin) | UUID dokter yang sedang diinspeksi. |
| `roomId` | `string` | Tidak | UUID ruangan. Jika diisi, backend menandai slot yang dipakai dokter lain di ruangan ini sebagai `OCCUPIED_BY_OTHER`. |

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "date": "2026-09-24",
    "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
    "practitionerName": "dr. Ahmad Santoso",
    "effectiveConsultationDurationMinutes": 30,
    "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
    "roomName": "Ruang Poli 1",
    "isCuti": false,
    "cutiReason": null,
    "summary": {
      "totalShifts": 4,
      "totalSlots": 42,
      "availableSlots": 40,
      "occupiedSlots": 2
    },
    "shifts": [
      {
        "contextId": "early_morning",
        "contextLabel": "Dini Hari",
        "sessionShift": "early_morning",
        "timeRange": "00:00 - 06:00 WIB",
        "boundaryStartTime": "00:00",
        "boundaryEndTime": "06:00",
        "totalSlots": 12,
        "availableSlotsCount": 11,
        "occupiedSlotsCount": 1,
        "slots": [
          {
            "slotIndex": 1,
            "startTime": "00:00",
            "endTime": "00:30",
            "timeRange": "00:00 - 00:30 WIB",
            "isAvailable": true,
            "status": "AVAILABLE",
            "displayLabel": "Tersedia",
            "conflictInfo": null
          },
          {
            "slotIndex": 5,
            "startTime": "02:00",
            "endTime": "02:30",
            "timeRange": "02:00 - 02:30 WIB",
            "isAvailable": false,
            "status": "OCCUPIED_BY_SELF",
            "displayLabel": "Jadwal Anda (Ruang Poli 1)",
            "conflictInfo": {
              "type": "SELF",
              "message": "Anda sudah memiliki jadwal di jam ini",
              "sessionId": "46596e5c-6f0f-4aa3-a60e-909564b89830",
              "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
              "practitionerName": "dr. Ahmad Santoso",
              "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
              "roomName": "Ruang Poli 1"
            }
          }
        ]
      },
      {
        "contextId": "morning",
        "contextLabel": "Pagi",
        "sessionShift": "morning",
        "timeRange": "06:00 - 12:00 WIB",
        "boundaryStartTime": "06:00",
        "boundaryEndTime": "12:00",
        "totalSlots": 12,
        "availableSlotsCount": 11,
        "occupiedSlotsCount": 1,
        "slots": [
          {
            "slotIndex": 5,
            "startTime": "08:00",
            "endTime": "08:30",
            "timeRange": "08:00 - 08:30 WIB",
            "isAvailable": false,
            "status": "OCCUPIED_BY_OTHER",
            "displayLabel": "Terisi (Bdn. Siti Rahmawati - Ruang Poli 1)",
            "conflictInfo": {
              "type": "OTHER",
              "message": "Ruangan telah digunakan oleh Bdn. Siti Rahmawati",
              "sessionId": "ec2209dd-e7a9-483f-bef2-cfc04201cf27",
              "practitionerId": "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
              "practitionerName": "Bdn. Siti Rahmawati",
              "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
              "roomName": "Ruang Poli 1"
            }
          }
        ]
      }
    ]
  }
}
```

---

## 7. Deletion Prohibition Contract (`DELETE .../sessions/:sessionId`)

Admin klinik dilarang menghapus sesi jadwal dokter secara permanen.

### 7.1 Request
```http
DELETE /api/v1/admin/doctor-schedules/:id/sessions/:sessionId HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
```

### 7.2 Response (`403 Forbidden`)
```json
{
  "statusCode": 403,
  "code": "ADMIN_SCHEDULE_DELETION_PROHIBITED",
  "message": "Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data dan riwayat rekam medis klinis. Silakan nonaktifkan sesi (status Tutup/Cuti) atau lakukan Reschedule."
}
```

---

## 8. Doctor Consultation Duration Configuration (`PATCH .../duration`)

Admin dapat menyesuaikan durasi konsultasi per pasien untuk dokter tertentu (misal: dokter spesialis butuh 45 menit, dokter umum 20 menit).

### 8.1 Request
```http
PATCH /api/v1/admin/doctor-schedules/3cb62e10-450b-43e5-aba9-49ec37079ebb/duration HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json

{
  "consultationDurationMinutes": 20,
  "startPrecisionMinutes": 1
}
```

### 8.2 Validation Rules
- `consultationDurationMinutes`: Integer, range `5` sampai `240` menit (wajib).
- `startPrecisionMinutes`: Integer, range `1` sampai `60` menit (opsional, default: 1).

### 8.3 Response (`200 OK`)
Mengembalikan konteks shift terkini untuk dokter tersebut dengan `effectiveConsultationDurationMinutes: 20`.

---

## 9. Operational Workflow for Next.js Web Admin

Web Admin frontend diwajibkan mengikuti alur interaksi berikut:

```
[Dashboard Supervisi Dokter]
         │
         ▼
 Klik Dokter / Tombol Detail
         │
         ▼
 [GET /admin/doctor-schedules/:id?date=YYYY-MM-DD]
         │
         ├── Render Kalender Bulanan (monthly_schedule)
         ├── Render Kartu Info Dokter & Poliklinik
         └── Render Gantt Milestone Timeline (timeline_intervals)
                   │
    ┌──────────────┴─────────────────────────┐
    ▼                                        ▼
[Aksi: Ubah Status Sesi]            [Aksi: Reschedule Sesi]
    │                                        │
    ▼                                        ▼
Modal Ubah Status                   Modal Reschedule Jadwal
(Pilih: Buka / Tutup)               1. Fetch Ruangan: GET /schedules/reference/rooms
    │                               2. Pilih: Tanggal Baru, Jam Baru, Ruang Baru
    ▼                               3. Cek Okupansi (Opsional): GET /schedules/occupancy-overview
[PATCH .../sessions/:sessionId]     4. Centang: "Alihkan pasien aktif"
    │                                        │
    │                                        ▼
    │                               [POST .../sessions/:sessionId/reschedule]
    │                                        │
    └─────────────────┬──────────────────────┘
                      ▼
    Refresh Data Detail & Gantt Timeline
    (Toast: "Jadwal berhasil diperbarui")
```

---

## 10. Verification & Test Evidence

Seluruh endpoint, validasi, dan proteksi integritas di atas telah terverifikasi secara langsung terhadap live containerized backend service:
- **Test Suite:** `scripts/e2e/test-schedule-v2-security-crud.ps1`
- **Execution Command:** `bun run test:e2e:schedule-security`
- **Result:** **87 / 87 CHECKS PASSED (100% Success)**
  - Gating unauthenticated (401 across all endpoints)
  - Privilege escalation & role isolation (Patient dilarang akses jadwal admin/dokter)
  - BOLA/IDOR protection (Dokter B dilarang memanipulasi data Dokter A)
  - Sanitasi PII pasien pada `appointmentRef`
  - Lifecycle CRUD in-and-out PostgreSQL
  - **Admin Deletion Prohibited:** Terverifikasi menolak DELETE dengan status 403 (`ADMIN_SCHEDULE_DELETION_PROHIBITED`)
  - **Admin Reschedule Sesi:** Terverifikasi memindahkan sesi, menggeser janji temu aktif, dan mencegah collision overlap dengan status 409
  - **Anti-Collision Occupancy Grid:** Terverifikasi mengembalikan 4 shift ter-serialisasi dengan slot `AVAILABLE`, `OCCUPIED_BY_SELF`, dan `OCCUPIED_BY_OTHER`
