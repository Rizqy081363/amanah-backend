# Web Admin — Spesifikasi Resmi & Panduan Integrasi Endpoint Reschedule Jadwal Dokter

**Versi Dokumen:** 2.2.0  
**Target Pembaca:** Tim Frontend Web Admin (Next.js / React)  
**Backend Service:** Amanah Healthcare Backend v1.2.0  
**Base URL:** `http://localhost:3001/api/v1` (Development) / Gateway Base URL (Production)  
**Hak Akses / RBAC:** Wajib `Authorization: Bearer <ADMIN_JWT_TOKEN>` dengan role `ADMIN`.

---

## 1. Penegasan Kolom Database: `notes` vs `reason` (Anti-Miskomunikasi)

Untuk meluruskan miskomunikasi antara Frontend dan Backend:

1. **Di Database PostgreSQL (Tabel `practitioner_schedule_sessions`):**
   * Kolom yang ada adalah **`notes`** berjenis `text`.
   * **TIDAK PERNAH ADA KOLOM BERNAMA `reason`** di tabel jadwal.
2. **Di Kontrak API Reschedule:**
   * Field resmi kanonik yang dikirim adalah **`notes`** (`string`, opsional).
   * Backend juga tetap menerima field **`reason`** sebagai alias backward-compatible jika frontend terlanjur mengirim `reason`. Keduanya disimpan ke kolom **`notes`** di database.
   * Field `notes` (maupun `reason`) bersifat **100% OPSIONAL**. Jika form di Web Admin tidak ingin menampilkan kolom input alasan/catatan sama sekali, **cukup jangan kirim field ini di JSON**, dan reschedule tetap berhasil 100%.

---

## 2. Definisi Endpoint Reschedule

* **Method:** `POST`
* **URL:** `/api/v1/admin/doctor-schedules/:id/sessions/:sessionId/reschedule`
* **Headers:**
  * `Authorization: Bearer <ADMIN_JWT_TOKEN>`
  * `Content-Type: application/json`

### 2.1 Parameter URL (Path Parameters):
| Parameter | Tipe | Wajib | Keterangan | Contoh |
|---|---|---|---|---|
| `:id` | `UUID` | **Ya** | ID praktisi dokter (`practitioner_id` dari objek dokter). | `3cb62e10-450b-43e5-aba9-49ec37079ebb` |
| `:sessionId` | `UUID` | **Ya** | ID sesi jadwal yang akan dipindahkan (`id` dari baris sesi jadwal). | `8489be4c-7c05-4c07-b352-7bf579b29cb1` |

---

## 3. Skema Request Body (`RescheduleAdminDoctorSessionDto`)

### Contoh Payload JSON:

```json
{
  "targetDate": "2026-10-15",
  "targetStartTime": "09:00",
  "targetRoomId": "e3067341-a185-484d-91d6-84848fcff1ef",
  "notes": "Dokter dialihkan ke sesi pagi",
  "rescheduleActiveAppointments": true
}
```

### Rincian Spesifikasi Field:

| Field Name | Tipe Data | Wajib / Opsional | Validasi Backend | Keterangan & Perilaku Sistem |
|---|---|---|---|---|
| **`targetDate`** | `string` | **WAJIB** | ISO Date `YYYY-MM-DD` | Tanggal baru tujuan pelaksanaan sesi. Bisa hari yang sama atau tanggal lain. |
| **`targetStartTime`** | `string` | **WAJIB** | Format 24-jam `HH:mm` (Regex `^([01]\d\|2[0-3]):([0-5]\d)$`) | Jam mulai baru pada tanggal target (misal: `"09:00"`). Jam selesai (`endTime`) otomatis dihitung backend sesuai durasi asli dokter. |
| **`targetRoomId`** | `string` (UUID) | *Opsional* | UUID v4 valid | Ruangan tujuan baru. Ambil dari `GET /api/v1/schedules/reference/rooms`. Jika dikosongkan, backend memakai ruangan sesi lama atau default ruangan dokter. |
| **`notes`** | `string` | *Opsional* | String teks | Catatan/keterangan pemindahan sesi yang disimpan ke kolom `notes` di database. *(Jika form UI tidak butuh input catatan, field ini tidak perlu dikirim).* |
| **`reason`** | `string` | *Opsional* | String teks | Alias untuk `notes` (kompatibilitas jika frontend masih mengirim `reason`). |
| **`rescheduleActiveAppointments`** | `boolean` | *Opsional* | Default: `true` | Jika `true`, seluruh antrean janji temu pasien aktif (`booked`, `waiting`, dll) otomatis ikut digeser ke tanggal dan jam baru secara atomik. |
| **`targetScheduleContextId`** | `string` | *Opsional* | `'early_morning'`, `'morning'`, `'afternoon'`, `'night'` | Shift konteks target. **Bisa dikosongkan** karena backend otomatis mendeteksi dari `targetStartTime`. |

---

## 4. Mekanisme Modal UI & Alur Interaksi Web Admin

Agar tim Frontend Web Admin memiliki panduan implementasi yang presisi:

```
[Halaman Detail Jadwal Dokter / Gantt Chart]
(GET /api/v1/admin/doctor-schedules/:id?date=YYYY-MM-DD)
                     │
                     ▼
Admin klik tombol "Reschedule" pada salah satu sesi
                     │
                     ▼
[Modal Reschedule Terbuka]
1. Tampilkan Info Sesi Asal:
   - Tanggal & jam asal (misal: Dini Hari, 02:00 - 02:30 WIB)
   - Ruangan asal (misal: Ruang Poli 1)
2. Form Input:
   - targetDate: Datepicker (format: YYYY-MM-DD)
   - targetStartTime: Timepicker 24-jam (format: HH:mm)
   - targetRoomId: Dropdown ruangan (fetch dari GET /schedules/reference/rooms)
   - notes: Textarea catatan/alasan (opsional, bisa ditiadakan jika tidak dibutuhkan)
   - rescheduleActiveAppointments: Checkbox (default: checked)
                     │
                     ▼
Admin klik tombol "Simpan Reschedule"
                     │
                     ▼
[Kirim Request POST ke /admin/doctor-schedules/:id/sessions/:sessionId/reschedule]
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
   [Status 200 OK]          [Status 409 Conflict / 422]
        │                         │
        ├── Tutup Modal           ├── Tetap buka modal
        ├── Tampilkan Toast       └── Tampilkan pesan error spesifik
        └── Re-fetch Detail           (bentrok dokter/ruangan/cuti)
```

---

## 5. Contoh Respons Sukses (`200 OK`)

```json
{
  "success": true,
  "message": "Jadwal dokter berhasil dijadwalkan ulang (rescheduled)",
  "data": {
    "sessionId": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
    "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
    "previousSchedule": {
      "date": "2026-09-24",
      "startTime": "02:00",
      "endTime": "02:30",
      "roomId": "e3067341-a185-484d-91d6-84848fcff1ef"
    },
    "rescheduledSchedule": {
      "id": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
      "scheduleDate": "2026-10-15",
      "startTime": "09:00",
      "endTime": "09:30",
      "timeRange": "09:00 - 09:30 WIB",
      "sessionLabel": "Pagi",
      "sessionShift": "morning",
      "capacity": 1,
      "availableSlots": 0,
      "status": "open",
      "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
      "notes": "[RESCHEDULED] Dokter dialihkan ke sesi pagi",
      "version": "2026-09-24T05:50:00.000Z"
    },
    "rescheduledAppointmentsCount": 1,
    "projection": {
      "scheduleId": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
      "date": "2026-10-15",
      "selectedStartTime": "09:00",
      "projectedEndTime": "09:30",
      "capacity": 1,
      "intervals": [
        {
          "intervalIndex": 1,
          "startTime": "09:00",
          "endTime": "09:30",
          "status": "OCCUPIED",
          "displayLabel": "Terisi",
          "isOccupied": true,
          "appointmentRef": {
            "appointmentId": "f7d73b06-444a-4a6c-9413-2df625aefd12",
            "queueNumber": "A-01",
            "status": "booked"
          },
          "closedReason": null
        }
      ]
    }
  }
}
```

---

## 6. Penanganan Error & Kode Konflik (`409 Conflict` & `422 Unprocessable`)

Web Admin harus menginspeksi nilai `code` pada response error:

| HTTP Status | Error Code | Pesan Bahasa Indonesia | Solusi untuk Pengguna Web Admin |
|---|---|---|---|
| `409 Conflict` | `PRACTITIONER_ALREADY_SCHEDULED` | "Dokter sudah memiliki jadwal lain yang bertabrakan pada rentang jam tersebut." | Minta admin memilih jam mulai lain. |
| `409 Conflict` | `ROOM_ALREADY_OCCUPIED` | "Ruangan tersebut sudah digunakan oleh praktisi lain pada jam ini." | Minta admin memilih ruangan lain atau jam lain. |
| `409 Conflict` | `DATE_CLOSED` | "Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target." | Minta admin memilih tanggal lain saat dokter tidak cuti. |
| `422 Unprocessable` | `START_OUTSIDE_BOUNDARY` | "Jam mulai target berada di luar batas waktu shift yang ditentukan." | Pastikan format jam valid 24-jam (`HH:mm`). |
| `422 Unprocessable` | `DURATION_LEAVES_NO_CAPACITY` | "Jam mulai target terlalu mepet dengan akhir shift." | Pilih jam mulai yang menyisakan waktu minimal 1 durasi sesi (misal 30 menit). |
| `403 Forbidden` | `FORBIDDEN` | "Akses ditolak: Hanya akun Administrator yang berhak me-reschedule jadwal." | Pastikan user login berstatus Admin. |
| `404 Not Found` | `NOT_FOUND` | "Dokter atau sesi jadwal tidak ditemukan." | Pastikan `:id` dan `:sessionId` di URL valid. |

---

## 7. Endpoint Pendukung Terkait Reschedule

1. **Master Dropdown Ruangan (Bebas Hardcode):**
   ```http
   GET /api/v1/schedules/reference/rooms
   ```
   Gunakan data ini untuk mengisi pilihan dropdown `targetRoomId`.
2. **Pengecekan Okupansi Sebelum Submit (Opsional):**
   ```http
   GET /api/v1/schedules/occupancy-overview?date={targetDate}&staffId={doctorId}&roomId={targetRoomId}
   ```
   Gunakan data ini untuk melihat slot jam mana yang kosong (`isAvailable: true`) sebelum admin mengisi `targetStartTime`.
