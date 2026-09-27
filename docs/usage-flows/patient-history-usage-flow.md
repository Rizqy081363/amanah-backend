# Panduan Alur Penggunaan & Mental Model: Riwayat Janji Temu Pasien (Patient Appointment History)

Dokumen ini adalah **panduan resmi khusus fitur Riwayat Pasien (*Patient Appointment History*)** untuk tim Frontend (Flutter Mobile & Next.js Web Admin). Dokumen ini dibuat untuk mengeliminasi kebingungan tim frontend mengenai:
- Mengapa antrean aktif tidak muncul di riwayat (Konsep *Terminal Status*).
- Apa perbedaan antara halaman riwayat milik pasien (`/history/me`) dan riwayat yang dilihat oleh dokter (`/history/patient/:patientId`).
- Apa makna field agregasi seperti `callAttemptsCount`.
- Bagaimana merender filter, tab, status badge, dan *empty state* tanpa melakukan kalkulasi sendiri di klien.

---

## 1. Mental Model: Apa itu "Riwayat" di Backend?

Sering kali developer frontend bingung:  
> *"Saya baru saja booking janji temu untuk besok, tapi kok tidak muncul di halaman riwayat pasien?"*

### Jawabannya:
Backend memisahkan secara ketat antara **Antrean Aktif** dan **Arsip Riwayat**:

```
                       SIKLUS HIDUP JANJI TEMU (LIFECYCLE)
                       
      [ BOOKED ] ──▶ [ WAITING ] ──▶ [ CALLED ] ──▶ [ IN_CONSULTATION ]
          │                │            │                     │
          │                │            │                     │
          ▼                ▼            ▼                     ▼
     ─────────────────────────────────────────────────────────────
     HALAMAN TIKET AKTIF (Active Queue)  ──▶ GET /appointments/me
     ─────────────────────────────────────────────────────────────
                                                              │
                    Siklus Berakhir (Terminal Outcome)        │
                    ┌─────────────────────────────────────────┘
                    ▼
     ┌────────────────────────────────────────────────────────────┐
     │                    STATUS TERMINAL:                        │
     │  1. completed  : Pasien selesai diperiksa dokter           │
     │  2. no_show    : Pasien terlewat 3x panggilan              │
     │  3. cancelled  : Pasien/Klinik membatalkan janji temu      │
     └────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
     ─────────────────────────────────────────────────────────────
     HALAMAN RIWAYAT PASIEN (History)   ──▶ GET /appointments/history/me
     ─────────────────────────────────────────────────────────────
```

* **Halaman Tiket Aktif (`/appointments/me`):** Khusus untuk janji temu yang **masih berjalan hari ini atau rencana masa depan** (`booked`, `waiting`, `called`, `in_consultation`).
* **Halaman Riwayat Pasien (`/appointments/history/me`):** Khusus untuk janji temu yang **sudah mencapai titik akhir (*terminal status*)** dan tidak akan berubah lagi statusnya (`completed`, `no_show`, `cancelled`).

---

## 2. Alur Pasien di Aplikasi Mobile (Flutter)

### A. Tampilan Layar Riwayat Kunjungan Pasien
Pasien membuka menu navigasi bawah: **[ Riwayat Kunjungan ]**.

```
┌──────────────────────────────────────────────────────────┐
│                   Riwayat Kunjungan                      │
│                                                          │
│  [ Semua (12) ]  [ Selesai (9) ]  [ Tidak Hadir (2) ] ...│ ◀── Tab Status
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🏥 POLI UMUM                   28 Sep 2026, 08:30  │  │
│  │ dr. Zikri Ahmad, Sp.A                              │  │
│  │ Keluhan: Demam tinggi dan flu batuk                │  │
│  │                                                    │  │
│  │ [ 🟢 Selesai Diperiksa ]        [ 1x Panggilan ]   │  │ ◀── callAttemptsCount
│  │ Kode Booking: BK-20260928-001                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🏥 POLI KIA                    21 Sep 2026, 14:00  │  │
│  │ dr. Sarah Amanda, Sp.OG                            │  │
│  │ Keluhan: Kontrol kehamilan rutin                   │  │
│  │                                                    │  │
│  │ [ 🔴 Tidak Hadir (No-Show) ]    [ 3x Panggilan ]   │  │
│  │ Catatan: Tidak hadir setelah 3x panggilan loket    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### B. Cara Frontend Mobile Memanggil API
Pasien yang sedang login **TIDAK PERLU** mengirim `patientId`. Backend otomatis mendeteksinya dari token JWT.

* **Panggil Endpoint:**
  ```http
  GET /api/v1/appointments/history/me?page=1&limit=20
  Authorization: Bearer <jwt_pasien>
  ```

* **Ketika Pasien Memilih Tab Filter (Misal Tab "Tidak Hadir"):**
  **JANGAN** filter array di Dart menggunakan `.where()`. Tembak API dengan query parameter `status`:
  ```http
  GET /api/v1/appointments/history/me?status=no_show&page=1&limit=20
  ```

* **Format Data JSON yang Diterima Frontend:**
  ```json
  {
    "data": [
      {
        "id": "96ed76ea-c1af-4920-9352-edee1a416033",
        "bookingCode": "BK-VAL-NOSHOW-02",
        "status": "no_show",
        "scheduledDate": "2026-09-28",
        "scheduledStartTime": "08:00:00",
        "scheduledEndTime": "08:30:00",
        "poliklinikName": "Poli Umum",
        "doctorName": "dr. Zikri Ahmad, Sp.A",
        "complaint": "Demam dan flu",
        "callAttemptsCount": 3,
        "completedAt": null,
        "cancelledAt": "2026-09-27T07:01:00.000Z",
        "cancelReason": "Pasien tidak hadir setelah 3x panggilan",
        "updatedAt": "2026-09-27T07:01:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
  ```

---

## 3. Alur Dokter / Staf di Web Portal (Next.js)

### A. Konteks Penggunaan
Dokter atau perawat sedang membuka detail profil pasien di poliklinik atau sebelum memulai konsultasi. Dokter ingin mengecek rekam jejak kedisiplinan dan riwayat kunjungan pasien tersebut.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Profil Pasien: Aisyah Febian (RM-2026-0004)                                │
│ [ Data Pribadi ]  [ Rekam Medis ]  [ Riwayat Kunjungan (History) ] ◀── Tab │
├────────────────────────────────────────────────────────────────────────────┤
│ Filter Status: [ Semua Status ▼ ]    Rentang: [ 01/09/2026 - 30/09/2026 ]  │
│                                                                            │
│ Tanggal     | Poli       | Dokter        | Panggilan | Status    | Aksi    │
│ 28/09/2026  | Poli Umum  | dr. Zikri     | 1x Panggil| 🟢 Selesai| [Detail]│
│ 21/09/2026  | Poli KIA   | dr. Sarah     | 3x Panggil| 🔴 No-Show| [Detail]│
│ 15/08/2026  | Poli Umum  | dr. Fadhiilah | 0x        | ⚪ Batal  | [Detail]│
└────────────────────────────────────────────────────────────────────────────┘
```

### B. Cara Frontend Web Memanggil API
Dokter/Staf memerlukan `patientId` (UUID profil pasien) yang sedang dibuka:

* **Panggil Endpoint:**
  ```http
  GET /api/v1/appointments/history/patient/eaf35fb2-19ee-4595-ae9b-55e411fb8834?page=1&limit=20
  Authorization: Bearer <jwt_dokter_atau_staf>
  ```

* **Keamanan Otorisasi (RBAC):**
  Endpoint ini diproteksi oleh `@Roles('ADMIN', 'STAF')`. Jika ada user pasien iseng menembak endpoint ini untuk melihat pasien lain, backend otomatis melempar **`HTTP 403 Forbidden`**.

---

## 4. Penjelasan Field Respons (Makna & Penanganannya di UI)

Agar developer frontend tidak menebak-nebak, berikut panduan fungsi tiap kolom:

| Field JSON | Tipe Data | Nullable? | Makna & Penggunaan di UI Frontend |
|---|---|---|---|
| `id` | `string` (UUID) | Tidak | ID unik janji temu. Digunakan sebagai key list atau navigasi ke detail. |
| `bookingCode` | `string` | Tidak | Nomor referensi pendaftaran (contoh: `BK-20260928-001`). Tampilkan sebagai kode booking. |
| `status` | `string` | Tidak | Nilai kanonik: `'completed'`, `'no_show'`, atau `'cancelled'`. Gunakan untuk menentukan warna badge. |
| `scheduledDate` | `string` (`YYYY-MM-DD`) | Tidak | Tanggal janji temu dijadwalkan. Format ke tampilan lokal: *"28 September 2026"*. |
| `scheduledStartTime` | `string` (`HH:mm:ss`) | Tidak | Jam mulai praktek (contoh: `08:00:00`). |
| `scheduledEndTime` | `string` (`HH:mm:ss`) | Ya | Jam selesai estimasi praktek. Bisa bernilai `null`. |
| `poliklinikName` | `string` | Tidak | Nama poli tujuan (contoh: *"Poli Umum"*). Sudah di-join otomatis oleh backend. |
| `doctorName` | `string` | Ya | Nama dokter yang menangani. Jika janji temu tanpa dokter spesifik, bisa `null`. |
| `complaint` | `string` | Ya | Keluhan yang diinputkan saat pendaftaran. |
| `callAttemptsCount` | `number` (integer) | Tidak | **Total berapa kali pasien dipanggil pada kunjungan ini**. Langsung render teks: `"${item.callAttemptsCount}x Panggilan"`. |
| `completedAt` | `string` (ISO Timestamp) | Ya | Waktu dokter menyelesaikan pemeriksaan. Hanya terisi jika status = `completed`. |
| `cancelledAt` | `string` (ISO Timestamp) | Ya | Waktu janji temu dibatalkan / dinyatakan no-show. |
| `cancelReason` | `string` | Ya | Keterangan pembatalan atau alasan no-show (contoh: *"Pasien tidak hadir setelah 3x panggilan"*). Tampilkan jika ada. |

---

## 5. Kamus Diksi UI & Warna Rekomendasi (Frontend Copywriting)

### Status Badge Kunjungan
1. **Status: `completed`**
   - **Label UI:** `Selesai Diperiksa` atau `Selesai`
   - **Warna:** Hijau (`#10B981` / `Colors.green`)
   - **Icon:** Centang (`check_circle`)
2. **Status: `no_show`**
   - **Label UI:** `Tidak Hadir (No-Show)`
   - **Warna:** Merah (`#EF4444` / `Colors.red`)
   - **Icon:** Silang / Peringatan (`cancel` / `error_outline`)
3. **Status: `cancelled`**
   - **Label UI:** `Dibatalkan`
   - **Warna:** Abu-abu (`#6B7280` / `Colors.grey`)
   - **Icon:** Batal (`do_not_disturb_on`)

### Badge Percobaan Panggilan (`callAttemptsCount`)
- Jika `callAttemptsCount == 0`: Sembunyikan badge atau tampilkan *"0x Panggilan"*.
- Jika `callAttemptsCount >= 1`: Tampilkan badge kecil: `"${count}x Panggilan"`. Jika `count == 3` dan status `no_show`, beri warna merah agar terlihat jelas bahwa batas panggilan telah habis.

### Tampilan Saat Data Kosong (Empty State)
Jika backend mengembalikan `data: []` dan `total: 0`:
- **Jangan lempar error toast!**
- Tampilkan komponen Empty State:
  - **Ilustrasi:** Ikon Kalender Kosong / Jam pasir.
  - **Judul:** *"Belum Ada Riwayat Kunjungan"*
  - **Deskripsi:** *"Riwayat pemeriksaan dokter yang telah selesai atau dibatalkan akan tersimpan rapi di sini."*
  - **Tombol CTA (khusus di aplikasi pasien):** `[ Buat Janji Temu Baru ]`

---

## 6. Jebakan yang Sering Terjadi di Frontend (Anti-Patterns)

1. ❌ **Menghitung sendiri jumlah panggilan:**
   Frontend **dilarang** melakukan request terpisah ke tabel call attempts lalu menghitung panjang array `attempts.length`. Backend sudah menghitungkan dan menyertakan field `callAttemptsCount` pada tiap item riwayat.
2. ❌ **Menyaring status di memori klien:**
   Frontend **dilarang** menembak tanpa query lalu melakukan `list.filter((x) => x.status === 'completed')`. Ini akan merusak paginasi halaman (misal: halaman 1 jadi hanya tampil 2 item padahal limit 20). Selalu kirim query param `?status=completed`.
3. ❌ **Mencari appointment yang sedang berjalan di halaman ini:**
   Jika pasien baru saja check-in dan sedang menunggu panggilan dokter, antrean tersebut ada di endpoint `GET /api/v1/appointments/me`, **bukan** di `/history/me`. Jangan laporkan *"Bug: janji temu saya hilang"* jika antrean tersebut belum selesai diperiksa atau belum no-show.
4. ❌ **Mengirim String Status Huruf Besar:**
   Nilai status di PostgreSQL backend adalah huruf kecil murni: `completed`, `cancelled`, `no_show`. Mengirim `COMPLETED` atau `SELESAI` akan menghasilkan error `400 Bad Request`.
