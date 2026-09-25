# Web Admin — Spesifikasi Resmi & Kontrak Endpoint Pengecekan Kelayakan Reschedule Jadwal Dokter (Reschedule Eligibility Pre-Check)

**Versi Dokumen:** 1.0.0  
**Target Pembaca:** Tim Frontend Web Admin (Next.js / React)  
**Backend Service:** Amanah Healthcare Backend v1.2.0  
**Base URL:** `http://localhost:3001/api/v1` (Development) / Gateway Base URL (Production)  
**Hak Akses / RBAC:** Wajib `Authorization: Bearer <ADMIN_JWT_TOKEN>` dengan role `ADMIN`.

---

## 1. Latar Belakang & Masalah Bisnis

Frontend Web Admin tidak boleh mengizinkan pengguna (Admin) melakukan reschedule secara sembarangan:
1. **Sesi Tertutup / Cuti Tidak Boleh Di-reschedule:**
   Jika sebuah sesi berstatus **`Tutup`** (`closed`) atau **`Cuti`** (`leave`), sesi tersebut **TIDAK ELIGIBLE** untuk di-reschedule. Logika operasional klinik: sesi yang ditutup bukan untuk dipindahkan jamnya, melainkan harus dibuka kembali melalui menu **Edit Jadwal** jika memang ingin dioperasikan.
2. **Pre-Check Target Jam & Konflik Ruangan:**
   Sebelum Admin menekan tombol konfirmasi "Simpan Reschedule", Frontend harus dapat melakukan validasi instan (*dry-run pre-check*) apakah jam mulai baru pada tanggal baru tersebut valid (tidak berada di luar batas operasional shift, tidak bentrok dengan sesi dokter lain, tidak bentrok dengan pemakaian ruangan, dan dokter tidak sedang cuti pada tanggal target).
3. **Pemberian Feedback Visual & Panduan Aksi Nyata:**
   Jika sesi asal tidak eligible, tombol Reschedule harus di-*disable* di UI dan menampilkan *tooltip* atau pesan alasan penolakan yang jelas tanpa *hallucination* atau tebak-tebakan.

---

## 2. Penambahan Flag Kelayakan pada List & Detail Jadwal Dokter

Untuk efisiensi render di tabel / list jadwal dokter tanpa perlu melakukan *call* HTTP berulang-ulang, setiap item di array **`sesi_harian`** pada endpoint:
* `GET /api/v1/admin/doctor-schedules`
* `GET /api/v1/admin/doctor-schedules/:id`

sekarang **selalu menyertakan 2 properti kanonik**:
1. **`is_reschedule_eligible`** (`boolean`): Bernilai `true` jika sesi berstatus buka dan bukan cuti; bernilai `false` jika sesi berstatus tutup atau cuti.
2. **`reschedule_ineligibility_reason`** (`string | null`): Pesan bahasa Indonesia resmi dari backend yang menjelaskan mengapa sesi tidak bisa di-reschedule.

### Contoh Potongan Objek `sesi_harian[*]`:
```json
{
  "id": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
  "nama_sesi": "Sesi Pagi",
  "jam_mulai": "08:00",
  "jam_selesai": "11:30",
  "waktu": "08:00 - 11:30",
  "kuota_pasien": 7,
  "slot_tersedia": 0,
  "status_sesi": "Tutup",
  "ruang": "Ruang Poli 1",
  "is_reschedule_eligible": false,
  "reschedule_ineligibility_reason": "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
}
```

> **Aturan Frontend Web Admin:**
> - Jika `is_reschedule_eligible === false`, **nonaktifkan tombol Reschedule (disabled)** dan jadikan `reschedule_ineligibility_reason` sebagai isi tooltip tombol.
> - Arahkan Admin untuk menggunakan menu **Edit Jadwal** (`PATCH /api/v1/admin/doctor-schedules/:id/sessions/:sessionId`) untuk mengaktifkan status sesi kembali menjadi `Buka`.

---

## 3. Spesifikasi Endpoint Pengecekan Kelayakan (`GET .../reschedule-eligibility`)

Endpoint ini digunakan saat modal reschedule dibuka, atau saat admin mengganti nilai `targetDate`, `targetStartTime`, atau `targetRoomId` di form modal reschedule untuk melakukan evaluasi real-time.

* **Method:** `GET`
* **URL:** `/api/v1/admin/doctor-schedules/:id/sessions/:sessionId/reschedule-eligibility`
* **Headers:**
  * `Authorization: Bearer <ADMIN_JWT_TOKEN>`

### 3.1 Path Parameters
| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `:id` | `UUID` | **Ya** | ID praktisi dokter (`practitioner_id`). |
| `:sessionId` | `UUID` | **Ya** | ID sesi jadwal yang sedang dievaluasi. |

### 3.2 Query Parameters (Dry-Run Target Validation)
| Parameter | Tipe | Wajib | Keterangan | Contoh |
|---|---|---|---|---|
| `targetDate` | `string` | Opsional | Tanggal target yang ingin diuji (format `YYYY-MM-DD`). | `2026-10-15` |
| `targetStartTime` | `string` | Opsional | Jam mulai target yang ingin diuji (format 24-jam `HH:mm`). | `09:00` |
| `targetRoomId` | `UUID` | Opsional | UUID ruangan target baru. Jika tidak diisi, backend menggunakan ruangan sesi lama atau default ruangan dokter. | `e3067341-a185-484d-91d6-84848fcff1ef` |

---

## 4. Skema Kontrak Respons JSON

### Kasus A: Sesi Asal Memenuhi Syarat (Open Session) & Target Valid (`200 OK`)
```json
{
  "sessionId": "fd5b6262-2452-450a-8b6b-0a38a6468754",
  "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
  "practitionerName": "dr. Ahmad Santoso",
  "isEligible": true,
  "sourceSession": {
    "id": "fd5b6262-2452-450a-8b6b-0a38a6468754",
    "scheduleDate": "2026-10-05",
    "startTime": "08:00",
    "endTime": "08:30",
    "timeRange": "08:00 - 08:30 WIB",
    "status": "open",
    "statusLabel": "Buka",
    "sessionLabel": "Sesi Pagi",
    "sessionShift": "morning",
    "roomName": "Ruang Poli 1",
    "activeAppointmentsCount": 2,
    "isSourceEligible": true,
    "rejectionReason": null
  },
  "targetValidation": {
    "evaluated": true,
    "targetDate": "2026-10-15",
    "targetStartTime": "09:00",
    "projectedEndTime": "09:30",
    "targetRoomId": "e3067341-a185-484d-91d6-84848fcff1ef",
    "targetRoomName": "Ruang Poli 1",
    "isTargetEligible": true,
    "conflictCode": null,
    "conflictMessage": null,
    "conflictMetadata": null
  },
  "actionableGuidance": "Sesi dan target waktu memenuhi syarat untuk di-reschedule. Silakan lanjutkan konfirmasi."
}
```

### Kasus B: Sesi Asal Tertutup / Tidak Eligible (`200 OK`)
Jika sesi asal berstatus `closed`:
```json
{
  "sessionId": "fd5b6262-2452-450a-8b6b-0a38a6468754",
  "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
  "practitionerName": "dr. Ahmad Santoso",
  "isEligible": false,
  "sourceSession": {
    "id": "fd5b6262-2452-450a-8b6b-0a38a6468754",
    "scheduleDate": "2026-10-05",
    "startTime": "08:00",
    "endTime": "08:30",
    "timeRange": "08:00 - 08:30 WIB",
    "status": "closed",
    "statusLabel": "Tutup",
    "sessionLabel": "Sesi Pagi",
    "sessionShift": "morning",
    "roomName": "Ruang Poli 1",
    "activeAppointmentsCount": 0,
    "isSourceEligible": false,
    "rejectionReason": "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
  },
  "targetValidation": {
    "evaluated": false,
    "targetDate": null,
    "targetStartTime": null,
    "projectedEndTime": null,
    "targetRoomId": null,
    "targetRoomName": null,
    "isTargetEligible": true,
    "conflictCode": null,
    "conflictMessage": null,
    "conflictMetadata": null
  },
  "actionableGuidance": "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
}
```

### Kasus C: Sesi Asal Buka, Namun Target Waktu Bentrok (`200 OK`)
Jika target waktu bentrok dengan jadwal dokter yang sudah ada pada tanggal tersebut:
```json
{
  "sessionId": "fd5b6262-2452-450a-8b6b-0a38a6468754",
  "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
  "practitionerName": "dr. Ahmad Santoso",
  "isEligible": false,
  "sourceSession": {
    "id": "fd5b6262-2452-450a-8b6b-0a38a6468754",
    "scheduleDate": "2026-10-05",
    "startTime": "08:00",
    "endTime": "08:30",
    "timeRange": "08:00 - 08:30 WIB",
    "status": "open",
    "statusLabel": "Buka",
    "sessionLabel": "Sesi Pagi",
    "sessionShift": "morning",
    "roomName": "Ruang Poli 1",
    "activeAppointmentsCount": 1,
    "isSourceEligible": true,
    "rejectionReason": null
  },
  "targetValidation": {
    "evaluated": true,
    "targetDate": "2026-10-15",
    "targetStartTime": "08:00",
    "projectedEndTime": "08:30",
    "targetRoomId": "e3067341-a185-484d-91d6-84848fcff1ef",
    "targetRoomName": "Ruang Poli 1",
    "isTargetEligible": false,
    "conflictCode": "PRACTITIONER_ALREADY_SCHEDULED",
    "conflictMessage": "Dokter sudah memiliki jadwal praktek lain pada jam 08:00 - 08:30 WIB.",
    "conflictMetadata": {
      "conflictingSessionId": "2b27ca67-4ce3-4712-9047-81560336270a",
      "scheduleDate": "2026-10-15",
      "startTime": "08:00",
      "endTime": "08:30",
      "timeRange": "08:00 - 08:30 WIB"
    }
  },
  "actionableGuidance": "Dokter sudah memiliki jadwal praktek lain pada jam 08:00 - 08:30 WIB."
}
```

---

## 5. Kamus Data Field Respons

| Field | Tipe | Deskripsi & Kegunaan untuk Frontend |
|---|---|---|
| `sessionId` | `string` (UUID) | ID sesi yang sedang diinspeksi. |
| `practitionerId` | `string` (UUID) | ID dokter pemilik sesi. |
| `practitionerName` | `string` | Nama lengkap dokter beserta gelar. |
| **`isEligible`** | `boolean` | **Flag Keputusan Utama:** Bernilai `true` HANYA jika sesi asal eligible DAN target waktu tidak bentrok. Jika `false`, tombol "Simpan Reschedule" WAJIB di-*disable*. |
| **`sourceSession.isSourceEligible`** | `boolean` | Status kelayakan sesi asal. `false` jika sesi asal `closed` atau `leave`. |
| **`sourceSession.rejectionReason`** | `string \| null` | Alasan jika sesi asal tidak eligible (misal sesi tutup atau dokter cuti). |
| `sourceSession.activeAppointmentsCount` | `number` | Jumlah antrean pasien aktif yang akan otomatis ikut bergeser jika sesi di-reschedule. |
| **`targetValidation.evaluated`** | `boolean` | `true` jika query parameter `targetDate` dan `targetStartTime` disertakan. |
| **`targetValidation.projectedEndTime`** | `string \| null` | Jam selesai hasil kalkulasi backend sesuai durasi asli sesi dokter (format `HH:mm`). |
| **`targetValidation.isTargetEligible`** | `boolean` | `false` jika target waktu bentrok (jadwal dokter bertabrakan, ruangan bentrok, atau dokter cuti). |
| `targetValidation.conflictCode` | `string \| null` | Kode error bentrok (`PRACTITIONER_ALREADY_SCHEDULED`, `ROOM_ALREADY_OCCUPIED`, `DATE_CLOSED`, `START_OUTSIDE_BOUNDARY`). |
| `targetValidation.conflictMessage` | `string \| null` | Pesan error bahasa Indonesia resmi untuk ditampilkan di alert form. |
| **`actionableGuidance`** | `string` | Rekomendasi tindakan satu kalimat siap pakai yang bisa langsung dirender sebagai teks panduan pengguna di UI modal. |

---

## 6. Backend Security Guard: Penolakan Keras (`422 Unprocessable Entity`)

Jika Frontend nekat mengirim request submit reschedule (`POST .../reschedule`) pada sesi yang berstatus `closed` atau `leave`, backend **menolak secara mutlak** dengan respons HTTP `422 Unprocessable Entity`:

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{
  "statusCode": 422,
  "code": "SESSION_NOT_ELIGIBLE_FOR_RESCHEDULE",
  "message": "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.",
  "metadata": {
    "sessionId": "fd5b6262-2452-450a-8b6b-0a38a6468754",
    "status": "closed"
  }
}
```

---

## 7. Diagram Alur Logika Reschedule Web Admin (Anti-Miskomunikasi)

```
[Admin Klik Tombol Reschedule pada Sesi]
                 │
                 ▼
Periksa flag `is_reschedule_eligible` pada item sesi
                 │
       ┌─────────┴─────────┐
       ▼                   ▼
    [false]             [true]
       │                   │
Tampilkan Tooltip:         Buka Modal Reschedule
"Sesi berstatus Tutup.     (Panggil GET .../reschedule-eligibility)
Gunakan Edit Jadwal"               │
(Tombol Disabled)                  ▼
                           Admin input targetDate & targetStartTime
                                   │
                                   ▼
                           Re-fetch GET .../reschedule-eligibility
                           ?targetDate=...&targetStartTime=...
                                   │
                         ┌─────────┴─────────┐
                         ▼                   ▼
                  [isEligible: false]  [isEligible: true]
                         │                   │
                  - Tampilkan Pesan    - Tampilkan projectedEndTime
                    Konflik Merah      - Aktifkan tombol "Simpan"
                  - Disable tombol           │
                                             ▼
                                       Admin Klik "Simpan"
                                             │
                                             ▼
                                       POST .../reschedule
                                             │
                                             ▼
                                       [200 OK] Sukses!
```
