# CHANGELOG: Multi-Dimensional 24H Doctor Schedule Projection & Canonical Slot Engine

**Tanggal:** 24 September 2026  
**Target Consumer:** Web Admin (Next.js/React) & Mobile Apps (Flutter)  
**Status:** Canonical Backend Production Standard (Verified on Live Docker & PostgreSQL)

---

## 1. Executive Summary & Root Cause Analysis

### Masalah Utama Pada Implementasi Lama
Sebelum refactor ini, tim Frontend menemukan anomali fatal pada tampilan jadwal dan slot dokter:
1. **Bug "19 Slot Tersedia":** Di dashboard muncul angka "19 slot tersedia" atau "1 slot tersedia", padahal dokter hanya membuka sesi dengan kapasitas tidak lebih dari slot tersebut.
2. **Formula Terbalik (`occupied = total - available`):** Sistem lama menghitung slot terisi dengan mengurangkan kuota terhadap slot buka. Akibatnya, slot yang sebenarnya **belum dijadwalkan oleh dokter (unscheduled)** dihitung seolah-olah sudah terisi penuh oleh pasien!
3. **Pencampuran Status (God Enum Antipattern):** Status waktu (`EXPIRED`), ketersediaan sesi dokter (`OPEN/CLOSED`), kehadiran pasien (`BOOKED`), cuti dokter (`CUTI`), dan perubahan jadwal (`RESCHEDULED`) dipaksa masuk ke dalam satu enum datar.
4. **Shift Tidak Penuh 24 Jam:** Pembagian shift lama tidak simetris (sore hanya sampai 17:00 dan malam hanya sampai 21:00), meninggalkan celah jam yang tidak terproyeksikan secara sistematis.

### Solusi Canonical: Multi-Dimensional State & Pure Slot Factory
Backend Amanah Healthcare kini memisahkan secara tegas antara:
* **Fakta Tersimpan di Database (SSOT Persisted Facts):** Sesi praktik dokter, reservasi aktif pasien, cuti dokter, riwayat penutupan manual (rapat/darurat), dan riwayat perubahan jadwal (reschedule events).
* **Proyeksi Dinamis di Runtime (Pure Schedule Slot Factory):** Grid waktu 24 jam dihitung murni dengan formula matematika tanpa di-hardcode ke tabel database dan tanpa array statis di frontend.

---

## 2. Arsitektur Proyeksi 24 Jam & Pure Slot Factory

Satu hari penuh (24 jam) dibagi ke dalam 4 shift simetris masing-masing berdurasi tepat 6 jam (360 menit):

| Shift Code | Label Shift | Rentang Waktu (WIB) | Rumus Slot (Interval 30m) | Total Slot Teoritis |
| :--- | :--- | :--- | :--- | :--- |
| `early_morning` | **Dini Hari** | `00:00 - 06:00` | `(06:00 - 00:00) / 30m` | **12 Slot** |
| `morning` | **Pagi** | `06:00 - 12:00` | `(12:00 - 06:00) / 30m` | **12 Slot** |
| `afternoon` | **Siang** | `12:00 - 18:00` | `(18:00 - 12:00) / 30m` | **12 Slot** |
| `night` | **Malam** | `18:00 - 24:00` | `(24:00 - 18:00) / 30m` | **12 Slot** |
| **Total 1 Hari** | **4 Shift** | **00:00 - 24:00** | **1440m / 30m** | **48 Slot Teoritis** |

> **Catatan Penting untuk Frontend:**  
> Frontend **DILARANG KERAS** membuat array waktu statis `['06:00', '06:30', ...]`. Backend menyuplai seluruh 48 slot siap konsumsi lengkap dengan metadata jam mulai, jam selesai, format label, dan seluruh dimensi state.

---

## 3. Matriks 4 Dimensi State Slot

Setiap slot waktu di dalam `timeline_intervals` maupun `shifts[].slots` kini memiliki 4 dimensi ortogonal:

```
┌─────────────────────────────────────────────────────────────┐
│                   SLOT STATE PROJECTION                     │
├─────────────────┬──────────────────┬────────────────────────┤
│ Temporal State  │ PAST             │ Waktu telah terlewati  │
│                 │ CURRENT          │ Sedang berlangsung     │
│                 │ FUTURE           │ Waktu mendatang        │
├─────────────────┼──────────────────┼────────────────────────┤
│ Availability    │ UNSCHEDULED      │ Dokter belum buka sesi │
│ State           │ AVAILABLE        │ Sesi buka, siap booking│
│                 │ OCCUPIED         │ Terisi pasien aktif    │
│                 │ CLOSED           │ Ditutup (cuti/rapat)   │
├─────────────────┼──────────────────┼────────────────────────┤
│ Closure State   │ LEAVE            │ Cuti dokter resmi      │
│                 │ OTHER            │ Rapat, darurat, dll.   │
├─────────────────┼──────────────────┼────────────────────────┤
│ Reschedule      │ isRescheduled    │ true / false           │
│ Lifecycle       │ Source / Target  │ Riwayat pemindahan jam │
└─────────────────┴──────────────────┴────────────────────────┘
```

### Penjelasan Dimensi State:

1. **Temporal State (`PAST | CURRENT | FUTURE`):**
   * Dihitung secara real-time dari jam server (WIB / `Asia/Jakarta`).
   * Tidak pernah disimpan statis di DB, sehingga selalu akurat mengikuti pergerakan waktu.
2. **Availability State (`UNSCHEDULED | AVAILABLE | OCCUPIED | CLOSED`):**
   * `UNSCHEDULED`: Dokter belum mendaftarkan sesi kerja pada jam tersebut. Slot tetap muncul di timeline agar kalender konsisten, namun berstatus non-aktif.
   * `AVAILABLE`: Dokter membuka sesi kerja dan belum ada pasien yang reservasi.
   * `OCCUPIED`: Terdapat pasien aktif (`booked`, `waiting`, `in_service`, `completed`) di slot tersebut.
   * `CLOSED`: Slot ditutup baik oleh cuti dokter maupun penutupan administratif.
3. **Closure Metadata (`closure: { category, reasonCode, reasonText }`):**
   * `category: 'LEAVE'`: Berasal dari tabel cuti resmi dokter (`practitioner_leave_periods`).
   * `category: 'OTHER'`: Berasal dari penutupan ad-hoc (`practitioner_schedule_closures`), contoh `reasonCode: 'MEETING'`, `reasonText: 'Rapat Koordinasi Komite Medik'`.
4. **Reschedule Lifecycle (`reschedule: { isRescheduled: boolean, ... }`):**
   * Reschedule **BUKAN** status ketersediaan, melainkan riwayat kejadian (audit history) yang disimpan di tabel `schedule_reschedule_events`.
   * Memungkinkan slot menampilkan badge *"Dijadwalkan Ulang"* tanpa merusak fakta apakah slot tersebut saat ini `AVAILABLE` atau `OCCUPIED`.
5. **Effective Status & Selection Flag (`effectiveStatus` & `isSelectable`):**
   * Untuk kemudahan render UI di Web dan Flutter:
     * `effectiveStatus`: `EXPIRED` (jika waktu lewat), `CLOSED`, `OCCUPIED`, `AVAILABLE`, atau `UNSCHEDULED`.
     * `isSelectable`: `true` hanya jika `availabilityState === 'AVAILABLE' && temporalState !== 'PAST'`.

---

## 4. Invarian Matematika Slot (Analogi Roti)

Seperti analogi: *"Jika Anda punya 5 roti dan 1 dimakan, maka sisa 4 roti, bukan 19."*

### Rumus Konsistensi Per Shift:
$$\text{Total Slot (12)} = \text{Unscheduled} + \text{Available} + \text{Occupied} + \text{Closed}$$

Contoh nyata dari hasil pengetesan sistem dokter Ahmadamikom Zikri:
* **Shift Dini Hari:** Total 12 = Unscheduled 0 + Available 12 + Occupied 0 + Closed 0
* **Shift Pagi:** Total 12 = Unscheduled 0 + Available 11 + Occupied 0 + Closed 1 (1 slot rapat)
* **Shift Siang:** Total 12 = Unscheduled 12 + Available 0 + Occupied 0 + Closed 0 (Dokter tidak praktik)
* **Shift Malam:** Total 12 = Unscheduled 12 + Available 0 + Occupied 0 + Closed 0 (Dokter tidak praktik)

### Tampilan Akumulasi & Sesi Harian:
* Format card: `display_akumulasi_slot: "0 / 24"` (0 pasien terisi dari 24 kapasitas total buka).
* Format per sesi: `display_slot: "0 / 12"` (0 pasien terisi dari 12 kuota sesi).

---

## 5. Spesifikasi API Endpoint untuk Frontend Consumer

### A. Endpoint Detail Jadwal Dokter: `GET /api/v1/admin/doctor-schedules/:id?date=YYYY-MM-DD`

Struktur JSON response yang dikembalikan backend:
```json
{
  "success": true,
  "data": {
    "doctor": {
      "id": "c518facb-372e-4f07-9766-f3eacf54221f",
      "name": "Ahmadamikom Zikri",
      "specialization": "Spesialis Penyakit Dalam"
    },
    "date": "2026-09-24",
    "totalCapacity": 24,
    "availableSlots": 23,
    "summary": {
      "totalSlots": 48,
      "scheduledSlots": 24,
      "unscheduledSlots": 24,
      "availableSlots": 23,
      "occupiedSlots": 0,
      "closedSlots": 1,
      "activeBookableSlots": 23,
      "occupancy": {
        "occupied": 0,
        "capacity": 23,
        "percentage": 0
      },
      "scheduleCoverage": {
        "scheduled": 24,
        "total": 48,
        "percentage": 50
      }
    },
    "shifts": [
      {
        "shift": "early_morning",
        "label": "Dini Hari",
        "timeRange": "00:00 - 06:00 WIB",
        "counts": {
          "total": 12,
          "unscheduled": 0,
          "available": 12,
          "occupied": 0,
          "closed": 0,
          "past": 12
        },
        "summary": {
          "totalSlots": 12,
          "scheduledSlots": 12,
          "unscheduledSlots": 0,
          "availableSlots": 12,
          "occupiedSlots": 0,
          "closedSlots": 0,
          "activeBookableSlots": 12,
          "occupancy": {
            "occupied": 0,
            "capacity": 12,
            "percentage": 0
          },
          "scheduleCoverage": {
            "scheduled": 12,
            "total": 12,
            "percentage": 100
          }
        }
      },
      {
        "shift": "morning",
        "label": "Pagi",
        "timeRange": "06:00 - 12:00 WIB",
        "counts": {
          "total": 12,
          "unscheduled": 0,
          "available": 11,
          "occupied": 0,
          "closed": 1,
          "past": 12
        },
        "summary": {
          "totalSlots": 12,
          "scheduledSlots": 12,
          "unscheduledSlots": 0,
          "availableSlots": 11,
          "occupiedSlots": 0,
          "closedSlots": 1,
          "activeBookableSlots": 11,
          "occupancy": {
            "occupied": 0,
            "capacity": 11,
            "percentage": 0
          },
          "scheduleCoverage": {
            "scheduled": 12,
            "total": 12,
            "percentage": 100
          }
        }
      }
    ],
    "timeline_intervals": [
      {
        "slotIndex": 1,
        "startTime": "09:00",
        "endTime": "09:30",
        "timeRange": "09:00 - 09:30 WIB",
        "temporalState": "PAST",
        "availabilityState": "AVAILABLE",
        "effectiveStatus": "EXPIRED",
        "isSelectable": false,
        "closure": null,
        "appointment": null,
        "reschedule": {
          "isRescheduled": true,
          "sourceDate": "2026-09-23",
          "sourceStartTime": "14:00",
          "sourceEndTime": "14:30",
          "reasonCode": "PATIENT_REQUEST",
          "reasonText": "Permintaan pasien pindah ke shift pagi"
        }
      },
      {
        "slotIndex": 5,
        "startTime": "11:00",
        "endTime": "11:30",
        "timeRange": "11:00 - 11:30 WIB",
        "temporalState": "PAST",
        "availabilityState": "CLOSED",
        "effectiveStatus": "EXPIRED",
        "isSelectable": false,
        "closure": {
          "category": "OTHER",
          "reasonCode": "MEETING",
          "reasonText": "Rapat Koordinasi Komite Medik"
        },
        "appointment": null,
        "reschedule": null
      }
    ]
  }
}
```

### B. Endpoint Anti-Collision Grid: `GET /api/v1/schedules/occupancy-overview`

Digunakan oleh modal form tambah/edit jadwal dokter untuk mencegah bentrok ruang atau bentrok dokter:
* Parameter: `date=YYYY-MM-DD&staffId=UUID&roomId=UUID`
* Response memberikan status per slot:
  * `OCCUPIED_BY_SELF`: Dokter sudah memiliki jadwal di jam tersebut.
  * `OCCUPIED_BY_OTHER`: Ruangan tersebut sudah dipakai oleh dokter lain di jam tersebut.
  * `CLOSED_LEAVE`: Dokter sedang cuti.
  * `AVAILABLE`: Ruangan dan dokter bebas untuk dijadwalkan.

---

## 6. Panduan Implementasi Interface Frontend (Web Admin & Mobile Flutter)

Bagian ini adalah spesifikasi tampilan pasti (*Exact UI Rendering Contract*) yang harus di-render oleh Frontend Engineer pada setiap screen:

---

### Screen 1: Card Showcase Dokter (Dashboard `/dashboard/jadwal-dokter`)

Data diambil dari `GET /api/v1/admin/doctor-schedules?date=YYYY-MM-DD`

| Elemen UI | Field Dari Backend | Cara Tampil di Interface |
| :--- | :--- | :--- |
| **Badge Status Dokter** | `status_dokter` | * `OPEN` -> Badge Hijau ("Tersedia")<br>* `OCCUPIED` -> Badge Oranye ("Penuh")<br>* `CLOSED` -> Badge Merah ("Tutup") |
| **Jam Praktik** | `jadwal_hari_ini` | Tampilkan string langsung, e.g. `"00:00 - 12:00"` atau `"-"` jika tidak praktik |
| **Badge Akumulasi Slot** | `display_akumulasi_slot` | **Langsung render string ini** (e.g. `"0 / 24"`). Dilarang menghitung pengurangan manual di frontend. |
| **Slot Sisa / Kuota** | `slot_tersedia` & `slot_kapasitas_akumulasi` | Tampilkan rekap numerik jika diperlukan label sekunder ("Tersedia 24 dari 24"). |
| **Sub-List Sesi Harian** | `sesi_harian[]` | Render daftar kartu/baris untuk setiap sesi yang dibuka dokter: |
| — *Nama Sesi* | `nama_sesi` | E.g. `"Dini Hari"`, `"Pagi"` |
| — *Jam Sesi* | `jam_mulai` - `jam_selesai` | E.g. `"00:00 - 06:00"`, `"06:00 - 12:00"` |
| — *Display Sesi* | `display_slot` | E.g. `"0 / 12"` (0 pasien terisi dari kuota 12). |

---

### Screen 2: Modal Detail Jadwal Dokter & Timeline 24 Jam (`/admin/doctor-schedules/:id`)

Data diambil dari `GET /api/v1/admin/doctor-schedules/:id?date=YYYY-MM-DD`

#### 1. Header Rekapitulasi Shift (4 Cards / Accordion dari `shifts[]`):
Tampilkan 4 blok ringkasan shift:
* **Dini Hari (`00:00 - 06:00`):** Badge `Total: 12`, `Tersedia: 12`, `Terisi: 0`, `Ditutup: 0`
* **Pagi (`06:00 - 12:00`):** Badge `Total: 12`, `Tersedia: 11`, `Terisi: 0`, `Ditutup: 1`
* **Siang (`12:00 - 18:00`):** Badge `Total: 12`, `Belum Terjadwal: 12`, `Tersedia: 0`
* **Malam (`18:00 - 24:00`):** Badge `Total: 12`, `Belum Terjadwal: 12`, `Tersedia: 0`

#### 2. Grid Slot Timeline (48 Interval dari `timeline_intervals[]`):
Setiap tombol slot berukuran 30 menit (e.g. `09:00 - 09:30 WIB`) wajib dirender berdasarkan kondisi berikut:
1. **Slot Tersedia (`availabilityState === 'AVAILABLE'`):**
   * Tampilan: Background putih, border hijau aktif.
   * Interaktivitas: Dapat diklik untuk booking pasien baru (jika `isSelectable === true`).
2. **Slot Terisi Pasien (`availabilityState === 'OCCUPIED'`):**
   * Tampilan: Background biru muda, border biru.
   * Konten/Tooltip: Tampilkan Nomor Antrean (`appointment.queueNumber`), Nama Pasien (`appointment.patientName`), dan Kode Booking (`appointment.bookingCode`).
3. **Slot Ditutup / Cuti / Rapat (`availabilityState === 'CLOSED'`):**
   * Tampilan: Background merah muda / kuning pastel, border merah dengan icon gembok `🔒`.
   * Label/Tooltip: Tampilkan alasan penutupan dari `closure.reasonText` (contoh: *"Rapat Koordinasi Komite Medik"* atau *"Cuti Dokter"*).
4. **Slot Belum Dijadwalkan (`availabilityState === 'UNSCHEDULED'`):**
   * Tampilan: Border abu-abu putus-putus (*dashed*), teks redup (*"Belum Dibuka"*). Slot tidak dapat dibooking pasien.
5. **Badge Reschedule (`reschedule.isRescheduled === true`):**
   * Tampilan: Pasang chip / icon pinjaman berwarna orange 🔄 *"Dijadwalkan Ulang"*.
   * Tooltip: *"Dipindahkan dari: [sourceDate] [sourceStartTime] - Alasan: [reasonText]"*.
6. **Slot Kadaluarsa / Waktu Lewat (`effectiveStatus === 'EXPIRED'`):**
   * Tampilan: Diberi overlay redup / disabled (`isSelectable: false`), mencegah input booking pada jam yang telah terlewati oleh jam server.

---

### Screen 3: Modal Buat / Edit Jadwal Dokter (Anti-Collision Grid `/schedules/occupancy-overview`)

Data diambil dari `GET /api/v1/schedules/occupancy-overview?staffId=...&roomId=...&date=...`

Digunakan saat admin atau staf membuka modal untuk mendaftarkan jadwal sesi baru dokter di suatu ruangan poli:
* **`AVAILABLE` (Hijau):** Ruangan dan dokter bebas, slot bisa dicentang untuk membuat sesi baru.
* **`OCCUPIED_BY_SELF` (Oranye):** Dokter ini telah memiliki jadwal di jam tersebut (*"Jadwal Anda"*), tombol di-disable untuk mencegah jadwal bertumpuk bagi dokter yang sama.
* **`OCCUPIED_BY_OTHER` (Merah):** Ruangan tersebut sedang digunakan oleh dokter lain (*"Terisi: dr. Lain - Ruang 101"*), tombol di-disable untuk mencegah bentrok ruangan.
* **`CLOSED_LEAVE` (Abu-abu / Merah Tua):** Dokter sedang tercatat cuti pada tanggal tersebut (*"Cuti"*), tombol di-disable.

---

### Panduan Khusus Aplikasi Mobile (Flutter)
1. **Model DTO:** Petakan `temporalState`, `availabilityState`, dan `effectiveStatus` ke Dart Enum.
2. **Interaktivitas:** Cukup gunakan `isSelectable ? onTapCallback : null` pada widget `InkWell` atau `ElevatedButton`.
3. **Tampilan Sederhana:** Dokter di aplikasi mobile cukup melihat 2 hal utama:
   - Kalender harian dengan 4 shift (Accordion `shifts[]`).
   - Slot praktik mereka yang aktif (`AVAILABLE` vs `OCCUPIED` dengan nama pasien).
   - Notifikasi badge reschedule jika ada sesi yang dipindahkan oleh admin.

---

## 7. Bukti Verifikasi Pengujian (Verification Evidence)

Pengujian dilakukan secara langsung terhadap container Docker aktif (`amanah-healthcare-backend-api-1` dan PostgreSQL):

1. **Kompilasi & Typecheck:**
   * `bun run build`: Berhasil tanpa error (0 errors).
2. **Linter & Code Format:**
   * `bun x @biomejs/biome check --write`: Semua format kode dan import lulus standar Biome.
3. **Unit Test Suite:**
   * `npm test -- src/modules/schedules`: **8 Test Suites Passed, 73 Tests Passed (100%)**.
4. **Live Container Endpoint Test (`test-multi-dimensional-schedule-projection.ps1`):**
   * Auth Admin: Berhasil.
   * Ambil data dokter Ahmadamikom Zikri: Berhasil (`display_akumulasi_slot: "0 / 24"`, 2 sesi x 12 slot).
   * Validasi Invarian Jumlah 4 Shift: **PASS** (`12 == 12` untuk seluruh 4 shift).
   * Validasi Multi-Dimensi: Berhasil mendeteksi event reschedule pada slot `09:00` dan penutupan rapat komite medik pada slot `11:00`.
   * Validasi Anti-Collision: **PASS** (Shift Dini Hari & Pagi terisi jadwal dokter, Shift Siang & Malam terbuka bebas).
