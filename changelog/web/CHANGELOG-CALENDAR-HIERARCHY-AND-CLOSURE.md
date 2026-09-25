# Web Admin — Spesifikasi Resmi & Kontrak Hierarki Kalender, Sesi, dan Penutupan Hari (Calendar Hierarchy & Day Closure)

**Versi Dokumen:** 1.0.0  
**Target Pembaca:** Tim Frontend Web Admin (Next.js / React) & Mobile Engineering  
**Backend Service:** Amanah Healthcare Backend v1.2.0  
**Base URL:** `http://localhost:3001/api/v1` (Development) / Gateway Base URL (Production)  
**Hak Akses / RBAC:** Wajib `Authorization: Bearer <ADMIN_JWT_TOKEN>` dengan role `ADMIN`.

---

## 1. Arsitektur & Paradigma Hierarki 3-Level

Sistem penjadwalan klinik Amanah Healthcare dibangun atas dasar **Hierarki 3-Level yang terstruktur dan deterministik**:

```
Level 1: KALENDER HARI (Calendar Day: schedule_date)
         └── Status Binary: BUKA vs TUTUP (Cuti otomatis tutup)
                 │
                 ▼
Level 2: SESI SHIFT PRAKTEK (Practitioner Schedule Sessions)
         └── Hingga 4 Shift per Hari:
             1. Dini Hari   (00:00 - 06:00 WIB)
             2. Pagi        (06:00 - 12:00 WIB)
             3. Siang       (12:00 - 17:00 WIB)
             4. Malam       (17:00 - 21:00 WIB)
                 │
                 ▼
Level 3: SLOT KONSULTASI PASIEN (Consultation Intervals)
         └── Interval serial per durasi dokter (misal 30 menit per pasien)
             Status kanonik per slot: OPEN (Buka), OCCUPIED (Terisi), CLOSED (Tutup)
```

### Penjelasan Status Binary di Level Kalender (Level 1):
* Di level kalender, **status HANYA ada 2 (Binary)**:
  1. **`Buka` (Open):** Seluruh atau sebagian sesi dokter pada tanggal tersebut aktif melayani pasien.
  2. **`Tutup` (Closed):** Pelayanan dokter pada tanggal tersebut ditutup secara operasional.
* **Perihal Cuti:** Status Cuti pada dasarnya adalah varian dari status `Tutup` dengan alasan cuti dokter (`leaveReason`). Ketika admin atau dokter mencatat cuti, hari tersebut secara fungsional berstatus `Tutup`.

---

## 2. Mekanisme Penutupan Hari (`Tutup`) & Pembatalan Pasien (Soft Cancellation)

Ketika Administrator klinik mengubah status hari menjadi **`Tutup`** pada tanggal tertentu:

### 2.1 Perilaku Sistem Cascading Backend:
1. **Penonaktifan Seluruh Sesi (`Cascade Close Sessions`):**
   * Seluruh sesi dokter pada tanggal tersebut di database PostgreSQL (`practitioner_schedule_sessions`) secara otomatis berganti status menjadi **`closed`**.
   * Jumlah slot yang tersedia (`available_slots`) otomatis di-set menjadi **`0`**.
2. **Soft Cancellation Janji Temu Pasien Aktif (`Soft Delete`):**
   * Seluruh janji temu pasien aktif (`booked`, `checked_in`, `waiting`) pada tanggal tersebut **TIDAK DIHAPUS DARI DATABASE** (bukan *hard delete*).
   * Status janji temu bertransisi menjadi **`cancelled`** (dibatalkan).
   * Kolom `cancelled_at` dicatat dengan timestamp saat penutupan.
   * Kolom `cancel_reason` diisi dengan alasan audit yang jelas:
     `[PENUTUPAN_JADWAL] <catatan_admin>`
     *(Contoh: `[PENUTUPAN_JADWAL] Poli tutup seluruhnya untuk pemeliharaan gedung klinis`)*.
   * **Integritas Medis Terjaga:** Riwayat pasien, nomor rekam medis, dan tiket antrean tetap aman di audit trail klinik. Pasien atau admin dapat merestore janji temu atau memilih jadwal lain tanpa kehilangan rekam jejak.
3. **Sinkronisasi Kalender & Mobile:**
   * Di respons kalender bulanan (`monthly_schedule`), tanggal tersebut berstatus **`Tutup`**.
   * Di aplikasi Mobile pasien, seluruh slot pada tanggal tersebut otomatis hilang/tidak dapat dibooking.

---

## 3. Mekanisme Pembukaan Kembali Hari (`Buka` / Restore)

Ketika Administrator klinik mengubah status hari kembali menjadi **`Buka`**:
1. **Re-aktivasi Sesi (`Restore Sessions`):**
   * Seluruh sesi dokter pada tanggal tersebut berganti status menjadi **`open`**.
   * Jumlah slot yang tersedia dikembalikan penuh sesuai kapasitas aslinya (`available_slots = capacity`).
2. **Kalender Bulanan:**
   * Di respons kalender bulanan (`monthly_schedule`), tanggal tersebut kembali berstatus **`Buka`**.
3. **Mobile Sinkronisasi:**
   * Pasien di aplikasi mobile dapat kembali melihat slot dan melakukan pendaftaran konsultasi.

---

## 4. Definisi Endpoint Perubahan Status Hari (`PATCH .../days/:date`)

* **Method:** `PATCH`
* **URL:** `/api/v1/admin/doctor-schedules/:id/days/:date`
* **Headers:**
  * `Authorization: Bearer <ADMIN_JWT_TOKEN>`
  * `Content-Type: application/json`

### 4.1 Path Parameters:
| Parameter | Tipe | Wajib | Keterangan | Contoh |
|---|---|---|---|---|
| `:id` | `UUID` | **Ya** | ID praktisi dokter (`practitioner_id`). | `3cb62e10-450b-43e5-aba9-49ec37079ebb` |
| `:date` | `string` | **Ya** | Tanggal kalender target (format `YYYY-MM-DD`). | `2026-10-24` |

### 4.2 Request Body Schema:
```json
{
  "status": "Tutup",
  "notes": "Poli tutup seluruhnya untuk pemeliharaan gedung klinis"
}
```

| Field | Tipe | Wajib / Opsional | Pilihan Nilai | Keterangan |
|---|---|---|---|---|
| **`status`** | `string` | **WAJIB** | `"Tutup"`, `"Buka"`, `"Cuti"` | Status operasional hari pada tanggal kalender tersebut. |
| **`notes`** | `string` | *Opsional* | String bebas | Alasan/catatan penutupan hari yang akan disimpan ke riwayat pembatalan janji temu pasien. |

---

## 5. Contoh Respons JSON

### 5.1 Respons Penutupan Hari (`Status = "Tutup"`) (`200 OK`):
```json
{
  "success": true,
  "message": "Jadwal hari berhasil ditutup dan seluruh sesi dinonaktifkan (pasien aktif dibatalkan secara soft delete)",
  "data": {
    "date": "2026-10-24",
    "status": "Tutup",
    "notes": "Poli tutup seluruhnya untuk pemeliharaan gedung klinis",
    "affectedSessionsCount": 2,
    "cancelledAppointmentsCount": 1
  }
}
```

### 5.2 Respons Pembukaan Kembali Hari (`Status = "Buka"`) (`200 OK`):
```json
{
  "success": true,
  "message": "Jadwal hari berhasil dibuka kembali dan seluruh sesi diaktifkan",
  "data": {
    "date": "2026-10-24",
    "status": "Buka",
    "notes": "Operasional normal kembali",
    "affectedSessionsCount": 2,
    "cancelledAppointmentsCount": 0
  }
}
```

---

## 6. Dampak pada Data Detail Dokter (`GET .../admin/doctor-schedules/:id?date=YYYY-MM-DD`)

Ketika tanggal hari tersebut diinspeksi oleh Admin Web:

1. **Pada Objek `monthly_schedule`:**
   ```json
   {
     "day": 24,
     "date": "2026-10-24",
     "status": "Tutup",
     "notes": "Poli tutup seluruhnya untuk pemeliharaan gedung klinis"
   }
   ```
2. **Pada Array `sesi_harian`:**
   Seluruh sesi pada hari yang ditutup otomatis memiliki:
   * `"status_sesi": "Tutup"`
   * `"slot_tersedia": 0`
   * `"is_reschedule_eligible": false`
   * `"reschedule_ineligibility_reason": "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."`
3. **Pada Objek `status_dokter`:**
   Status dokter pada hari tersebut adalah **`"Tutup"`**.

---

## 7. Diagram Interaksi UI Web Admin (Level Kalender)

```
[Komponen Kalender Web Admin]
(Admin klik tanggal tertentu, misal: 24 Oktober 2026)
                 │
                 ▼
Tampilkan Dropdown Status Hari:
Pilihan: [ Buka | Tutup ]
                 │
                 ▼
Admin memilih status "Tutup" dan mengisi catatan:
"Poli tutup untuk sterilisasi ruangan"
                 │
                 ▼
Tampilkan Dialog Konfirmasi:
"Apakah Anda yakin ingin menutup seluruh jadwal pada 24 Oktober 2026?
Peringatan: Seluruh sesi akan dinonaktifkan dan antrean pasien aktif
akan dibatalkan secara otomatis (soft delete)."
                 │
                 ▼
Admin Klik "Konfirmasi Tutup"
                 │
                 ▼
[Kirim PATCH /api/v1/admin/doctor-schedules/:id/days/2026-10-24]
Body: { "status": "Tutup", "notes": "Poli tutup untuk sterilisasi ruangan" }
                 │
                 ▼
[Status 200 OK]
- Munculkan Toast Sukses: "Jadwal 24 Okt 2026 berhasil ditutup (N sesi dinonaktifkan)"
- Warna tanggal di kalender berganti menjadi Merah/Abu-abu ("Tutup")
- Seluruh sesi di panel bawah berganti status menjadi "Tutup"
- Tombol Reschedule pada sesi otomatis disabled (terkunci)
```

---

## 8. Investigasi & Solusi: Masalah "Kadang Sinkron, Kadang Tidak" Saat Membuka Hari & Kontrak Binary Status

### 8.1 Akar Masalah di Backend (Root Cause Analysis):
Dalam pengujian sebelumnya, ketika admin membuka kembali tanggal yang tadinya ditutup (`status: "Buka"`), kalender kadang menampilkan status tidak sinkron:
1. **Penyebab Utama:** Saat hari ditutup, `available_slots` di-set menjadi `0` dan status menjadi `closed`. Ketika admin membuka kembali hari via `PATCH /admin/doctor-schedules/:id` atau edit sesi tanpa mengirimkan nilai `slot_tersedia` eksplisit, kolom `status` berubah menjadi `'open'`, tetapi kolom `available_slots` tetap bernilai `0`.
2. **Evaluasi Status Sesi:** Fungsi pemetaan status (`toAdminSessionStatus`) mengevaluasi urutan logika:
   ```typescript
   if (availableSlots === 0) return 'Terisi';
   ```
   Akibatnya, sesi yang baru saja diaktifkan kembali otomatis berstatus **`"Terisi"`** (bukan `"Buka"`), seolah-olah sesi tersebut sudah penuh dengan pasien! Hal ini menyebabkan tampilan web admin menjadi tidak sinkron dan tampak seperti bug sinkronisasi.

### 8.2 Perbaikan Arsitektur Backend (Telah Diperbaiki & Terverifikasi):
1. **Restorasi Otomatis Kuota Slot (`availableSlots = capacity`):**
   Pada seluruh mutasi status sesi menuju `'open'` / `'Buka'` (`updateAdminDoctorSchedule`, `updateAdminDoctorSession`, `update`, `toggleAvailability`), backend kini **secara otomatis mengembalikan `available_slots` ke nilai penuh kapasitas aslinya (`capacity`)** jika sebelumnya bernilai 0.
2. **Konsistensi Data Kalender:**
   Kini ketika hari dibuka kembali:
   - Sesi kembali berstatus **`"Buka"`**.
   - Slot tersedia kembali terisi penuh sesuai kapasitas.
   - Status tanggal di kalender bulanan (`monthly_schedule`) langsung berubah menjadi **`"Buka"`**.

### 8.3 Kontrak Binary Status di Web Admin (Pemberantasan Dropdown "Terisi"):
1. **Status "Terisi" Adalah Hak Prerogatif Sistem, Bukan Pilihan Pengguna:**
   - Dokter atau Admin **TIDAK BOLEH** memilih status `"Terisi"` pada dropdown form edit jadwal.
   - Status `"Terisi"` hanya dievaluasi dan dimunculkan oleh sistem ketika slot kapasitas konsultasi telah habis terisi booking pasien (`availableSlots === 0`).
2. **Form Edit Sesi Web Admin Wajib Binary (`Buka` vs `Tutup`):**
   - Pilihan status saat mengedit sesi jadwal hanya ada 2 (Binary):
     - `Buka` (Aktif melayani pendaftaran konsultasi).
     - `Tutup` (Tidak melayani konsultasi / ditutup).
   - Terapkan komponen Switch / Toggle di modal edit jadwal web admin:
     - `Switch ON` $\to$ `status: "open"` (`"Buka"`)
     - `Switch OFF` $\to$ `status: "closed"` (`"Tutup"`)

### 8.4 Protokol Cache Invalidation & Re-fetching untuk Web Admin (Next.js):
Untuk mencegah tampilan web admin tampak tidak sinkron akibat caching di sisi klien (SWR / TanStack React Query):
1. **Wajib Revalidasi Setelah Mutasi:**
   Setelah mengeksekusi request `PATCH /api/v1/admin/doctor-schedules/:id/days/:date` atau `PATCH /api/v1/admin/doctor-schedules/:id`, frontend Web Admin **WAJIB** segera meng-invalidate query cache berikut:
   - `GET /api/v1/admin/doctor-schedules/:id?date=YYYY-MM-DD` (Detail dokter & sesi harian)
   - `GET /api/v1/admin/doctor-schedules/monthly?month=MM&year=YYYY` (Kalender bulanan)
   - `GET /api/v1/admin/doctor-schedules` (Tabel daftar dokter)
2. **Dilarang Optimistic State Manipulation Tanpa Respons Backend:**
   Jangan mengubah state lokal kalender secara manual dengan asumsi sendiri. Selalu tunggu respons backend atau picu re-fetch agar data yang tampil di kalender, sesi, dan kartu dokter 100% konsisten dan deterministik.
