# Panduan Alur Penggunaan & Mental Model: Janji Temu & Notifikasi Antrean (Pasien & Dokter)

Dokumen ini adalah **panduan alur interaksi resmi (Usage Flow & UX Guide)** untuk tim Frontend (Mobile Flutter & Web Admin/Dokter Next.js). Tujuannya agar tim frontend memahami dengan gamblang:
- Apa yang dilihat dan dialami oleh **Pasien** di aplikasi mobile.
- Apa yang dilihat dan dilakukan oleh **Dokter / Perawat** di web portal poliklinik.
- Bagaimana backend merespons, memancarkan data real-time, dan mengendalikan siklus antrean tanpa perlu kalkulasi manual di sisi klien.

---

## 1. Filosofi & Mental Model Dasar

```
               [ PASIEN (Mobile App) ]                     [ DOKTER / STAF (Web Portal) ]
                          │                                               │
   1. Buat Janji Temu     ▼                                               │
      (Pilih Poli/Sesi) ───────▶ [ BACKEND (Database & Real-Time Engine) ]
                          │                       ▲                       │
                          │   Tiket Diterbitkan   │                       │
                          │◀──────────────────────┴───────────────────────┤
                          │                                               │ 2. Buka Antrean Hari Ini
                          │                                               │    (Lihat sesi praktek)
                          │                                               ▼
                          │                            Dokter Tekan Tombol:
                          │                            [ PANGGIL PASIEN ]
                          │                                   │
                          │◀─── [ WebSocket: notification:new ]
                          │     (Suara Bell + Pop-up Urgen)   │
                          ▼                                   ▼
   3. Layar Berdering &   Pasien Masuk Ruangan?
      Status: DIPANGGIL   ├───▶ YA: Dokter Tekan [ KONFIRMASI HADIR ] ────▶ Konsultasi Dimulai
                          │
                          └───▶ TIDAK: Dokter Tekan [ TIDAK MENYAHUT ]
                                      │
                                      ├─── Panggilan 1 & 2: Antrean DIMUNDURKAN (Requeue)
                                      └─── Panggilan 3: Status TIDAK HADIR (No-Show Terminal)
```

**Prinsip Kunci untuk Frontend:**
1. **Frontend adalah Presenter:** Frontend hanya menampilkan label, angka percobaan, dan status yang dikirimkan backend.
2. **Backend adalah Orkestrator:** Keputusan apakah antrean dimundurkan (*requeue*) atau dibatalkan permanen (*no-show*) sepenuhnya diputuskan oleh backend saat dokter menekan tombol aksi.

---

## 2. Alur Pengalaman Pasien (Flutter Mobile App)

### A. Layar 1: Pendaftaran Janji Temu (Booking Screen)
* **Apa yang dilihat Pasien:**
  * Pilihan Poliklinik (misal: *Poli Umum*, *Poli KIA*).
  * Pilihan Layanan Medis (misal: *Pemeriksaan Umum*, *Konsultasi Dokter*).
  * Pilihan Dokter & Tanggal Kunjungan.
  * Pilihan Sesi Kunjungan: `PAGI` (08:00 - 12:00), `SIANG` (13:00 - 17:00), `MALAM` (18:30 - 21:00).
  * Kolom Keluhan Utama (opsional).
* **Aksi Pasien:** Menekan tombol `[ Konfirmasi Janji Temu ]`.
* **API yang Ditembak:** `POST /api/v1/appointments`
* **Hasil di Layar:**
  Aplikasi menampilkan tiket antrean dengan status awal: **`Menunggu Kunjungan`** beserta nomor tiket (misal: `P-002`).

---

### B. Layar 2: Tiket Antrean Hari-H (Active Queue Screen)
Pada hari kunjungan, pasien membuka aplikasi saat berada di klinik atau dalam perjalanan.
* **Apa yang dilihat Pasien:**
  * **Kartu Tiket Besar:**
    * Nomor Antrean: **`P-002`**
    * Poliklinik: **Poli Umum**
    * Dokter: **dr. Zikri Ahmad, Sp.A**
    * Sesi: **PAGI**
    * Badge Status: 🟡 **Menunggu Giliran**
    * Pesan Bantuan: *"Silakan menunggu di ruang tunggu poliklinik. Kami akan memberitahu Anda saat dokter memanggil nomor antrean Anda."*
* **Mekanisme di Balik Layar:**
  Aplikasi Flutter tersambung ke WebSocket `/socket.io` menggunakan Bearer Token pasien. **Tidak ada polling berulang.** Pasien cukup membiarkan layar terbuka atau aplikasi berjalan di latar belakang.

---

### C. Layar 3: Saat Dokter Memanggil (Incoming Call Alert)
Ketika dokter di ruang periksa menekan tombol panggil:
* **Event yang Masuk:** Socket.IO event `notification:new` dengan properti:
  * `category: "appointment"`
  * `isUrgent: true`
  * `badgeIcon: "bell"`
  * `title: "Panggilan Antrean Pasien"`
  * `body: "Nomor antrean P-002 dipanggil ke Poli Umum. Panggilan ke-1 dari 3. Silakan segera menuju ruang periksa."`
* **Apa yang terjadi di Layar Pasien:**
  1. Suara notifikasi/dering berbunyi (karena `isUrgent: true`).
  2. Dialog Pop-up atau Heads-up Banner muncul:
     > 🔔 **PANGGILAN DOKTER**  
     > **Nomor Antrean P-002** dipanggil ke **Poli Umum**  
     > *(Panggilan ke-1 dari 3)*  
     > Silakan segera memasuki ruang periksa dokter sekarang.  
     > `[ Saya Menuju Ruangan ]`
  3. Badge status pada kartu antrean berubah menjadi: 🔵 **Dipanggil (Panggilan 1 dari 3)**.

---

### D. Layar 4: Jika Pasien Terlewat / Tidak Menyahut (Requeue Screen)
Jika dokter menunggu beberapa menit dan pasien belum masuk ruangan, dokter menekan tombol lewati.
* **Event yang Masuk:** `notification:new` (Requeue event).
* **Apa yang dilihat Pasien:**
  * Kartu antrean berubah menjadi warna jingga/kuning:
  * Badge Status: 🟠 **Antrean Dimundurkan**
  * Teks Notifikasi:
    > ⚠️ **Panggilan Terlewat**  
    > Anda tidak merespons panggilan ke-1. Nomor antrean Anda telah **dimundurkan 3 posisi**.  
    > **Sisa kesempatan panggilan: 2 kali lagi.**  
    > Mohon tetap berada di dekat ruang periksa agar tidak terlewat kembali.
* **Mekanisme:** Frontend tidak perlu menghitung urutan antrean. Status tiket otomatis kembali menjadi `waiting` di database backend.

---

### E. Layar 5: Jika Terlewat 3 Kali (Terminal No-Show Screen)
Jika pada panggilan ke-3 pasien tetap tidak hadir:
* **Event yang Masuk:** `notification:new` dengan status terminal `no_show`.
* **Apa yang dilihat Pasien:**
  * Modal Peringatan Merah:
    > ❌ **Janji Temu Dibatalkan (Tidak Hadir)**  
    > Batas maksimal 3 kali panggilan telah terlampaui. Janji temu Anda untuk sesi ini dinyatakan **Tidak Hadir (No-Show)** dan antrean telah dibatalkan secara otomatis.  
    > `[ Daftar Janji Temu Baru ]` `[ Tutup ]`
  * Kartu antrean aktif hilang dari dashboard utama dan berpindah ke **Riwayat Kunjungan**.

---

### F. Layar 6: Halaman Riwayat Kunjungan Pasien (`GET /appointments/history/me`)
Halaman arsip kunjungan masa lalu pasien.
* **Tab Navigasi:** `[ Semua ]` | `[ Selesai ]` | `[ Tidak Hadir ]` | `[ Dibatalkan ]`
* **Elemen Setiap Kartu Riwayat:**
  * Tanggal Periksa: `28 September 2026`
  * Poli & Dokter: `Poli Umum — dr. Zikri Ahmad, Sp.A`
  * Status Badge:
    * 🟢 **Selesai Diperiksa** (Status: `completed`)
    * 🔴 **Tidak Hadir (No-Show)** (Status: `no_show`)
    * ⚪ **Dibatalkan** (Status: `cancelled`)
  * Indikator Panggilan: `Dipanggil: 3x` (dari field `callAttemptsCount: 3`).
* **Jika Tidak Ada Riwayat (`data: []`):**
  Tampilkan ilustrasi kosong: *"Belum Ada Riwayat Kunjungan"*.

---

## 3. Alur Pengalaman Dokter & Perawat (Next.js Web Portal)

### A. Layar 1: Meja Antrean Poliklinik Hari Ini (`GET /appointments/queue/daily`)
Dokter login ke komputer ruang periksa poli.
* **Apa yang dilihat Dokter:**
  * Header Sesi: **Poli Umum — Sesi PAGI (Senin, 28 Sep 2026)**
  * Kotak Statistik:
    * `Menunggu: 8 Pasien` | `Sedang Diperiksa: 1 Pasien` | `Selesai: 4 Pasien`
  * Tabel Antrean Pasien:
    | No. Tiket | Nama Pasien | Jam Datang | Percobaan Panggil | Status | Aksi |
    |---|---|---|---|---|---|
    | **P-001** | Budi Santoso | 08:05 | 0 / 3 | 🟡 Menunggu | `[ Panggil Pasien ]` |
    | **P-002** | Aisyah Febian | 08:12 | 0 / 3 | 🟡 Menunggu | `[ Panggil Pasien ]` |

---

### B. Aksi 1: Dokter Memanggil Pasien
Dokter siap memeriksa pasien berikutnya (misal `P-001`). Dokter mengklik tombol:
> `[ 📢 Panggil Pasien ]`
* **API yang Ditembak:** `POST /api/v1/appointments/:id/call` (Body: `{ "notes": "Panggilan 1" }`)
* **Respons Backend:**
  ```json
  { "attemptNumber": 1, "maxAttempts": 3, "status": "called" }
  ```
* **Perubahan Tampilan di Layar Dokter:**
  * Baris pasien `P-001` berubah menjadi warna biru (highlight).
  * Status berubah menjadi: **`Dipanggil (1/3)`**.
  * Kolom Aksi berubah menjadi 2 tombol pilihan:
    1. 🟢 `[ Pasien Hadir / Masuk Ruangan ]`
    2. 🟠 `[ Pasien Tidak Menyahut (Lewati) ]`

---

### C. Skenario Sukses: Pasien Mengetuk Pintu & Masuk Ruangan
Pasien masuk ke ruang konsultasi. Dokter menekan tombol:
> `[ 🟢 Pasien Hadir / Masuk Ruangan ]`
* **API yang Ditembak:** `POST /api/v1/appointments/:id/respond`
* **Respons Backend:**
  ```json
  { "status": "in_consultation", "respondedAt": "2026-09-28T08:15:30.000Z" }
  ```
* **Perubahan Tampilan di Layar Dokter:**
  * Status pasien menjadi 🔵 **Sedang Diperiksa**.
  * Layar dokter membuka form rekam medis / catatan diagnosis / peresepan.
  * Pasien lain di ruang tunggu melihat di TV antrean bahwa nomor `P-001` sedang berada di dalam ruangan.

---

### D. Skenario Pasien Tidak Ada di Ruang Tunggu (Requeue 1 & 2)
Jika perawat memanggil 3 kali di pengeras suara ruang tunggu namun pasien tidak muncul:
Dokter/Perawat menekan tombol:
> `[ 🟠 Pasien Tidak Menyahut (Lewati) ]`
* **API yang Ditembak:** `POST /api/v1/appointments/:id/no-show`
* **Respons Backend (Percobaan 1 atau 2):**
  ```json
  { "requeued": true, "remainingAttempts": 2, "status": "waiting" }
  ```
* **Perubahan Tampilan di Layar Dokter:**
  * Muncul notifikasi toast di pojok layar:
    > *"Pasien P-001 tidak menyahut. Tiket otomatis dimundurkan 3 posisi antrean ke belakang. Sisa panggilan: 2 kali."*
  * Posisi `P-001` otomatis bergeser ke bawah di tabel antrean.
  * Baris teratas kini ditempati oleh `P-002`. Dokter dapat langsung menekan `[ Panggil Pasien ]` untuk pasien berikutnya tanpa jeda.

---

### E. Skenario Batas Akhir (Terminal No-Show pada Panggilan ke-3)
Jika pasien tersebut sudah dipanggil ulang hingga percobaan ke-3 (`attemptNumber: 3`) dan tetap tidak kunjung datang:
Dokter menekan tombol:
> `[ 🔴 Pasien Tidak Menyahut (Batas Akhir) ]`
* **API yang Ditembak:** `POST /api/v1/appointments/:id/no-show`
* **Respons Backend:**
  ```json
  { "noShow": true, "status": "no_show" }
  ```
* **Perubahan Tampilan di Layar Dokter:**
  * Modal konfirmasi tampil:
    > *"Panggilan ke-3 tidak terjawab. Janji temu P-001 telah ditandai permanen sebagai Tidak Hadir (No-Show) dan dikeluarkan dari antrean hari ini."*
  * Baris pasien tersebut hilang dari tabel antrean aktif hari ini dan tersimpan permanen di arsip rekam jejak.

---

## 4. Kamus Diksi & Copywriting UI Resmi (Glosarium Frontend)

Agar aplikasi terlihat profesional dan konsisten antara Web dan Mobile, gunakan standar teks berikut:

| Konteks UI | Kode Status / Variabel Backend | Rekomendasi Teks Bahasa Indonesia (UI Copy) |
|---|---|---|
| Badge Tiket Belum Giliran | `status: "waiting"` / `ticketStatus: "waiting"` | **Menunggu Giliran** |
| Badge Sedang Dipanggil | `status: "called"` | **Dipanggil ke Ruang Periksa** |
| Keterangan Percobaan | `attemptNumber: 1, maxAttempts: 3` | **Panggilan ke-1 dari 3** |
| Badge Antrean Mundur | `requeued: true` | **Antrean Dimundurkan** |
| Badge Sedang Konsultasi | `status: "in_consultation"` | **Sedang Diperiksa** |
| Badge Selesai Berobat | `status: "completed"` | **Selesai** |
| Badge Tidak Hadir | `status: "no_show"` | **Tidak Hadir (No-Show)** |
| Badge Batal | `status: "cancelled"` | **Dibatalkan** |
| Tombol Panggil Pertama | `POST /call` | `Panggil Pasien` |
| Tombol Panggil Ulang | `POST /call` (setelah requeue) | `Panggil Ulang` |
| Tombol Pasien Datang | `POST /respond` | `Pasien Masuk Ruangan` |
| Tombol Lewati / Absen | `POST /no-show` | `Lewati / Tidak Menyahut` |
| Header Riwayat | `GET /appointments/history/me` | **Riwayat Kunjungan Medis** |
| Badge Jumlah Panggilan di Riwayat | `callAttemptsCount: 2` | **2x Panggilan** |

---

## 5. Ringkasan Tanya Jawab Teknis untuk Developer Frontend

* **T: Apakah saat pasien terlewat (requeue), frontend harus menghitung nomor urut antrean yang baru?**  
  *J:* **TIDAK.** Cukup refetch `GET /appointments/queue/daily` atau dengarkan event socket. Backend telah memposisikan ulang tiket di database.

* **T: Apakah pasien yang sedang login bisa melihat panggilan pasien lain?**  
  *J:* **TIDAK.** Gateway WebSocket backend mengisolasi ruangan per user (`room: user:<userId>`). Pasien hanya akan menerima event panggilan untuk tiket miliknya sendiri. Layar monitor ruang tunggu bersama menggunakan endpoint display publik `GET /api/v1/appointments/queue/display`.

* **T: Di mana dokter bisa melihat riwayat ketidakhadiran pasien di masa lalu?**  
  *J:* Dokter dapat membuka menu profil pasien yang menembak endpoint `GET /api/v1/appointments/history/patient/:patientId`. Di sana dokter bisa melihat apakah pasien ini memiliki catatan sering `no_show` atau selalu hadir tepat waktu.
