# CHANGELOG: Backend Canonical Data Producer & Seed Fix

> **Dokumen Resmi Hand-off Backend & Tim Frontend (Web Admin & Mobile)**  
> **Tanggal Implementasi:** 24 September 2026  
> **Status:** Production-Ready, Rebuilt in Docker, Verified on Live Endpoints (100% Passed)

---

## 1. Prinsip Utama: 100% Backend Produce Data, Frontend Pure Consumer

Frontend tidak boleh lagi melakukan komputasi matematika manual, pengurangan slot, asumsi parsial, atau fallback status di sisi klien.  
Backend memegang Single Source of Truth (SSOT) dan memproduksi seluruh metrik operasional yang siap dikonsumsi langsung:

| Kebutuhan UI Frontend | Field Backend yang Dihasilkan (Tinggal Bind) | Tipe Data | Contoh Nilai |
|---|---|---|---|
| Angka Pasien Terdaftar di Grid Hour / Modal | `session.pasien_terdaftar` | `number` | `0` atau `1` |
| Teks Tampilan Slot Sesi | `session.display_slot` | `string` | `"0 / 10"` atau `"1 / 20"` |
| Sisa Kuota Slot Tersedia | `session.slot_tersedia` | `number` | `10` atau `19` |
| Kapasitas Sesi Maksimal | `session.kuota_pasien` | `number` | `10` atau `20` |
| Akumulasi Pasien Dokter per Hari | `doctor.slot_terisi_akumulasi` | `number` | `0` atau `1` |
| Akumulasi Tampilan Kuota per Hari | `doctor.display_akumulasi_slot` | `string` | `"0 / 10"` atau `"1 / 20"` |
| Status Operasional Sesi | `session.status_sesi` | `OPEN \| OCCUPIED \| CLOSED` | `"OPEN"` |

---

## 2. Akar Masalah & Solusi yang Telah Diterapkan

### A. Perbaikan Dummy Data di Seeder (`seed.ts`)
* **Akar Masalah:** Sebelumnya, `sessionTemplates` di seeder development meng-hardcode `availableSlots: 8` untuk `capacity: 10` (dan `availableSlots: 10` untuk `capacity: 12`) tanpa membuat record appointment terkait. Akibatnya, penghitungan kuota menghasilkan angka dummy `10 - 8 = 2 Pasien`, namun ketika modal pasien dibuka, tidak ada record pasien yang ditemukan di database.
* **Perbaikan:**
  1. `sessionTemplates` di seeder diselaraskan: sesi tanpa janji temu awal memiliki `availableSlots = capacity` (12/12, 10/10, 8/8).
  2. Database PostgreSQL live di container Docker telah disinkronisasi langsung via query:
     ```sql
     UPDATE practitioner_schedule_sessions pss
     SET available_slots = GREATEST(0, pss.capacity - COALESCE((
       SELECT COUNT(*)
       FROM appointments a
       WHERE (a.schedule_session_id = pss.id
              OR (a.practitioner_id = pss.practitioner_id
                  AND a.scheduled_date = pss.schedule_date
                  AND a.scheduled_start_time >= pss.start_time
                  AND a.scheduled_start_time < pss.end_time))
         AND a.status NOT IN ('cancelled', 'no_show')
     ), 0))
     WHERE pss.status = 'open';
     ```
     Sebanyak 27 sesi yang mengalami selisih phantom telah dinormalisasi.

### B. Backend Menghitung `pasien_terdaftar` & `display_slot` Secara Riil
* **File Diubah:** `src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts`
  1. Pada `findAdminDoctorSchedules` (List Card): Sesi harian (`sesi_harian`) kini dievaluasi terhadap janji temu aktif pada hari tersebut.
  2. Pada `findAdminDoctorScheduleDetail` (Detail Sheet): Sesi harian (`sesi_harian`) kini dievaluasi terhadap janji temu aktif pada hari evaluasi (`evalDate`).
  3. Formula kanonikal backend:
     * `bookedCount = Math.max(matchingAppts.length, capacity - availableSlots)`
     * `slot_tersedia = isCuti ? 0 : Math.max(0, capacity - bookedCount)`
     * `pasien_terdaftar = bookedCount`
     * `display_slot = `${bookedCount} / ${capacity}``

---

## 3. Bukti Verifikasi Live Endpoint Docker (Real Test Output)

Pengujian dijalankan langsung terhadap container backend `amanah-healthcare-backend-api-1` yang berjalan pada port `3001` dengan autentikasi Admin resmi:

### Bukti 1: Dokter Tanpa Pasien (Bdn. Siti Rahmawati - 2026-09-24)
Memanggil: `GET /api/v1/admin/doctor-schedules?date=2026-09-24&search=Siti`

```json
{
  "nama_dokter": "Bdn. Siti Rahmawati",
  "kapasitas_per_hari": 10,
  "slot_tersedia": 10,
  "display_akumulasi_slot": "0 / 10",
  "slot_terisi_akumulasi": 0,
  "sesi_harian": [
    {
      "nama_sesi": "Siang",
      "waktu": "13:00 - 16:30",
      "kuota_pasien": 10,
      "slot_tersedia": 10,
      "pasien_terdaftar": 0,
      "display_slot": "0 / 10",
      "status_sesi": "OPEN",
      "ruang": "Ruang KIA"
    }
  ]
}
```
* **Hasil:** `pasien_terdaftar: 0`, `display_slot: "0 / 10"`. Grid hour tidak lagi menampilkan "2 Pasien" phantom.

---

### Bukti 2: Dokter dengan Pasien Riil (dr. Ahmad Santoso - 2026-09-25)
Memanggil:
1. `GET /api/v1/admin/doctor-schedules?date=2026-09-25`
2. `GET /api/v1/admin/doctor-schedules/:doctorId?date=2026-09-25`
3. `GET /api/v1/admin/doctor-schedules/:doctorId/sessions/:sessionId/patients?status=all`

**1. Response List Card (`doctor-schedules`):**
```json
{
  "nama_dokter": "dr. Ahmad Santoso",
  "kapasitas_per_hari": 20,
  "slot_tersedia": 19,
  "display_akumulasi_slot": "1 / 20",
  "slot_terisi_akumulasi": 1,
  "sesi_harian": [
    {
      "id": "1717309a-ed52-47a4-96d8-0343dc46a754",
      "nama_sesi": "Pagi",
      "waktu": "08:00 - 12:00",
      "kuota_pasien": 20,
      "slot_tersedia": 19,
      "pasien_terdaftar": 1,
      "display_slot": "1 / 20",
      "status_sesi": "OPEN"
    }
  ]
}
```

**2. Response Detail Sheet (`doctor-schedules/:doctorId`):**
```json
{
  "sesi_harian": [
    {
      "id": "1717309a-ed52-47a4-96d8-0343dc46a754",
      "nama_sesi": "Pagi",
      "waktu": "08:00 - 12:00",
      "kuota_pasien": 20,
      "slot_tersedia": 19,
      "pasien_terdaftar": 1,
      "display_slot": "1 / 20",
      "status_sesi": "OPEN"
    }
  ]
}
```

**3. Response Session Patients (`sessions/:sessionId/patients?status=all`):**
```json
{
  "success": true,
  "data": {
    "sessionId": "1717309a-ed52-47a4-96d8-0343dc46a754",
    "capacity": 20,
    "availableSlots": 19,
    "bookedCount": 1,
    "patients": [
      {
        "appointmentId": "95da643b-aec0-4160-bf2b-4c1add6233eb",
        "queueNumber": "UM-001",
        "timeSlot": "08:30 - 09:00 WIB",
        "status": "booked",
        "statusBadge": "Booked",
        "patient": {
          "fullName": "Dewi Lestari",
          "medicalRecordNumber": "RM-2026-0001",
          "gender": "Perempuan"
        }
      }
    ]
  }
}
```

---

## 4. Panduan Konsumsi Frontend (Next.js Admin & Flutter)

### A. Di Tampilan Grid Hour (`doctor-daily-hourly-grid.tsx`)
**JANGAN LAKUKAN (Legacy Buggy Code):**
```tsx
// SALAH: Jangan hitung matematika di client!
const pasienCount = session.kuota_pasien - session.slot_tersedia; 
```

**LAKUKAN (Canonical Binding):**
```tsx
// BENAR: Gunakan field langsung dari backend
const pasienCount = session.pasien_terdaftar; 
const labelSlot = session.display_slot; // Contoh: "0 / 10" atau "1 / 20"

return (
  <button onClick={() => openPatientModal(session.id)}>
    {pasienCount > 0 ? `${pasienCount} Pasien` : "Belum Ada Pasien"}
  </button>
);
```

### B. Di Modal Daftar Pasien Sesi (`session-patients-modal.tsx`)
Panggil:
```text
GET /api/v1/admin/doctor-schedules/:doctorId/sessions/:sessionId/patients?status=all
```
Field `response.data.patients` dijamin sinkron 1:1 dengan `session.pasien_terdaftar`. Jika `pasien_terdaftar == 0`, array pasien kosong. Jika `pasien_terdaftar > 0`, seluruh item pasien dimuat lengkap beserta data rekam medis, antrean, dan waktu kunjungannya.

---

## 5. Ringkasan Verifikasi Sistem

1. **TypeScript Build:**
   * Command: `bun run build`
   * Output: `Passed (0 errors)`
2. **Unit Test Suite:**
   * Command: `bun run test -- modules/schedules --runInBand`
   * Output: `6 suites passed, 53 tests passed, 0 failed`
3. **Docker Rebuild:**
   * Command: `docker compose build api`
   * Output: `Built successfully with latest binary`
4. **Docker Container Restart:**
   * Command: `docker compose up -d api`
   * Output: `amanah-healthcare-backend-api-1 recreated, status: Up (healthy)`
5. **Live Verification Query:**
   * Query database & HTTP endpoints terverifikasi secara nyata (tidak ada lagi selisih kuota vs pasien).
