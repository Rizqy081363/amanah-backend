# Tiket Antrian: Apa yang Dilihat Pasien dan Apa yang Dilihat Internal

## Ringkasan

Reaksi Anda ("Hah, masa iya?") tepat. **Pasien tidak perlu melihat dokter, ruangan, jam selesai, maupun total slot saat membuat tiket.**

Tampilan sekarang (dokter + ruangan + jam mulai + jam selesai) memakai model **booking janji temu**, seperti memesan dokter spesialis di jam tertentu. Klinik Anda bekerja dengan model **antrian pelayanan**: pasien datang, diberi nomor, lalu dipanggil. Dua model ini butuh tampilan yang berbeda.

Pasien hanya perlu tahu empat hal:

1. Apakah saya sudah terdaftar?
2. Nomor berapa?
3. Kira-kira kapan giliran saya?
4. Ke mana saya pergi saat dipanggil?

Semua yang lain (dokter, ruangan, durasi, kapasitas) adalah urusan internal dan baru "muncul" ke pasien pada saat yang tepat, yaitu ketika ia dipanggil.

---

## 1. Dua model mental

| | Booking janji temu | Antrian pelayanan |
|---|---|---|
| Contoh | Dokter spesialis dengan jam pasti | Klinik umum, bidan, puskesmas |
| Pasien memilih | Dokter, jam, kadang ruangan | Layanan dan hari |
| Pasien dijanjikan | Slot waktu tertentu | Akan dilayani, urutannya sekian |
| Ruangan dan dokter ditentukan | Saat booking | **Saat dipanggil** |
| Kalau penuh | Slot habis, pasien tidak bisa daftar | Estimasi lebih lama atau dialihkan ke sesi berikutnya |

Klinik Anda masuk kolom kanan. Itu sebabnya pengalaman di dunia nyata (datang, bawa formulir, dilayani) terasa lebih sederhana daripada aplikasinya.

---

## 2. Yang dilihat pasien

### Setelah mendaftar

```
Antrian Anda
    U-P07

Umum · Kamis, 8 Oktober 2026 · Sesi Pagi
4 orang di depan Anda
Estimasi dilayani sekitar 09.15 - 09.35

Mohon hadir 15 menit sebelum estimasi.
Estimasi dapat berubah, nomor Anda tetap.

[ Ubah jadwal ]   [ Batalkan ]
```

### Saat dipanggil

```
Giliran Anda!
Silakan menuju  Umum 1
```

Nama dokter boleh ditampilkan di sini (opsional), karena baru diketahui saat dipanggil.

### Status yang dipahami pasien

| Status internal | Teks untuk pasien |
|---|---|
| waiting | Menunggu |
| called | Silakan menuju [ruangan] |
| in_service | Sedang dilayani |
| done | Selesai, terima kasih |
| cancelled | Dibatalkan |
| no_show / expired | Tidak hadir, [Daftar ulang] |

---

## 3. Yang dilihat internal (admin, petugas, dokter)

- Papan antrian per kategori: siapa menunggu, dipanggil, dilayani.
- Ruangan dan dokter yang bertugas, serta ruangan yang sedang terisi.
- Proyeksi waktu mulai dan selesai.
- Durasi rata-rata, rasio beban sesi, jumlah lane (dokter yang punya ruangan).
- Flag prioritas, sumber tiket (online / walk-in), riwayat tidak hadir.
- Peringatan: sesi melebihi kapasitas, pasien melewati durasi normal, dokter melebihi jumlah ruangan.

---

## 4. Tabel pemisahan lengkap

| Data | Pasien | Internal | Alasan |
|---|---|---|---|
| Nomor antrian | Ya | Ya | Inti tiket |
| Layanan, tanggal, sesi | Ya | Ya | Pasien memilihnya sendiri |
| Jumlah orang di depan | Ya | Ya | Sinyal paling stabil dan mudah dipahami |
| Estimasi mulai (rentang) | Ya | Ya | Informasi, bukan janji |
| Status | Ya (bahasa sederhana) | Ya (lengkap) | |
| Ruangan | **Hanya saat dipanggil** | Selalu | Baru ditentukan saat dipanggil |
| Dokter | **Opsional, hanya saat dipanggil** | Selalu | Baru ditentukan saat dipanggil |
| Jam selesai (`projected_end`) | **Tidak** | Ya | Proyeksi internal, pasien tidak perlu |
| Total slot / kapasitas sesi | **Tidak** | Ya | Membuat pasien merasa "penuh" |
| Sesi disabled | **Tidak ada** | Tidak ada | Diganti label Lancar/Ramai dan pengalihan otomatis |
| Rasio beban, lane, durasi rata-rata | **Tidak** | Ya | Alat pengambilan keputusan admin |
| Priority, source, no-show history | **Tidak** | Ya | Urusan operasional |
| Actual start / end | **Tidak** | Ya | Catatan untuk statistik |

---

## 5. Alur end-to-end dari dua sisi

| Tahap | Pasien melihat dan melakukan | Sistem melakukan di belakang |
|---|---|---|
| 1. Daftar | Pilih layanan, hari, waktu (atau "Secepatnya"), lalu Konfirmasi | Cek aturan keras, buat nomor atomik, hitung estimasi dan sesi. `room_id` dan `doctor_id` masih kosong. |
| 2. Menunggu | Nomor, jumlah di depan, rentang estimasi | Hitung ulang estimasi tiap ada kejadian, redam goyangan tampilan |
| 3. Hadir (opsional) | Tekan "Saya sudah di klinik" | Isi `checked_in_at` |
| 4. Dipanggil | "Silakan menuju Umum 1" | Petugas atau dokter menekan "Panggil berikutnya" dari ruangan. Sistem mengisi `room_id`, `doctor_id`, status `called`, dan mengirim notifikasi. |
| 5. Dilayani | "Sedang dilayani" | `actual_start` terisi |
| 6. Selesai | "Terima kasih" | `actual_end` terisi, masuk ke statistik durasi |

---

## 6. Pisahkan di server, bukan hanya menyembunyikan di UI

Menyembunyikan field di tampilan saja tidak cukup. Siapa pun bisa melihat respons API-nya. Buat dua bentuk data yang berbeda:

```ts
// Yang BOLEH keluar ke pasien
interface PatientTicketView {
  ticketCode: string;               // "U-P07"
  serviceLabel: string;             // "Umum"
  serviceDate: string;
  sessionLabel: string;             // "Pagi"
  status: 'menunggu' | 'dipanggil' | 'dilayani' | 'selesai' | 'dibatalkan' | 'tidak_hadir';
  aheadCount: number;
  etaFrom?: string;                 // dibulatkan 5/10 menit
  etaTo?: string;
  callTo?: { roomName: string; doctorName?: string };  // hanya saat 'dipanggil'
  canReschedule: boolean;
  canCancel: boolean;
}

// Hanya untuk internal
interface AdminTicketView {
  ticketId: number;
  queueNo: number;
  priority: boolean;
  source: 'online' | 'walk_in';
  status: string;
  doctorId?: number;
  roomId?: number;
  projectedStart?: string;
  projectedEnd?: string;
  actualStart?: string;
  actualEnd?: string;
  checkedInAt?: string;
}
```

Aturan:

- Endpoint pasien **hanya** mengembalikan `PatientTicketView` dan hanya untuk tiket miliknya.
- Kalau Anda memakai policy database (misalnya RLS), berikan pasien akses ke **view khusus** yang hanya memuat kolom aman, bukan ke tabel `queue_ticket`.
- `callTo` hanya diisi saat status `called`. Sebelum itu nilainya kosong.

---

## 7. Algoritma

### 7.1 Membuat tiket (ringkas)

Detail estimasi ada di dokumen sebelumnya. Dari sisi pasien, hasil akhirnya satu objek sederhana.

```text
function daftar(pasien, kategori, tanggal, preferensi):
  validasiAturanKeras(pasien, kategori, tanggal)    # klinik tutup, tiket ganda, dst.

  BEGIN TRANSACTION
    sesi   = pilihSesi(tanggal, kategori, preferensi)   # termasuk pengalihan otomatis
    no     = nomorBerikutnya(tanggal, kategori, sesi)   # upsert atomik
    est    = estimasiMulai(lanes(sesi), antrianAktif(sesi))
    tiket  = simpan(pasien, kategori, sesi, no, est, room=NULL, doctor=NULL)
  COMMIT

  return keTampilanPasien(tiket)
```

### 7.2 Memanggil pasien: di sinilah ruangan dan dokter ditetapkan

```text
function panggilBerikutnya(ruangan):
  dokter = dokterBertugas(ruangan)              # dokter yang sedang di ruangan itu

  BEGIN TRANSACTION
    tiket = SELECT * FROM queue_ticket
            WHERE status = 'waiting'
              AND service_date = hari_ini
              AND category = ruangan.kategori
              AND session_order <= sesiAktif.urutan
            ORDER BY priority DESC, session_order ASC, queue_no ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1

    UPDATE tiket
       SET status = 'called', room_id = ruangan.id, doctor_id = dokter.id, called_at = now()
  COMMIT                                         # gagal bila ruangan masih terisi (lihat 7.3)

  kirimNotifikasi(tiket.pasien, "Silakan menuju " + ruangan.nama)
  hitungUlangEstimasi(ruangan.kategori)
```

### 7.3 Tabrakan ruangan dijaga saat pelayanan

Satu ruangan hanya boleh melayani satu pasien pada satu waktu. Cukup satu constraint:

```sql
CREATE UNIQUE INDEX one_active_per_room
  ON queue_ticket (room_id)
  WHERE status IN ('called', 'in_service');
```

Dengan begini, "bentrok ruangan" tidak perlu dicek saat pasien mendaftar. Ruangan hanya dianggap terpakai **ketika ada pasien di dalamnya**.

---

## 8. Kalau suatu saat pasien perlu dokter tertentu

- **Preferensi**: pasien boleh memilih "dokter yang diutamakan" sebagai catatan. Sistem tidak menjanjikannya, dan estimasi tetap dihitung dari seluruh lane kategori itu.
- **Spesialis dengan jam pasti**: buat alur terpisah bergaya booking janji temu. Jangan campur dengan alur antrian umum dan bidan.

Untuk klinik umum dan bidan Anda saat ini, keduanya tidak perlu dibuat di awal.

---

## 9. Migrasi dari tampilan sekarang

| Data di tampilan lama | Perlakuan baru |
|---|---|
| Dokter | Internal. Diisi saat dipanggil. |
| Ruangan | Internal. Diisi saat dipanggil. Pasien baru melihatnya saat dipanggil. |
| Jam mulai | Menjadi `projected_start`, ditampilkan sebagai rentang estimasi. |
| Jam selesai | Menjadi `projected_end`, **disembunyikan dari pasien**. |
| Total slot per sesi | Dihapus dari tampilan pasien. Untuk admin diganti rasio beban. |
| Sel sesi yang disabled | Diganti label Lancar/Ramai dan pengalihan otomatis. |

---

## 10. Keputusan yang perlu Anda ambil

| Pertanyaan | Saran awal |
|---|---|
| Tampilkan nama dokter saat dipanggil? | Opsional. Nama ruangan sudah cukup. |
| Tampilkan estimasi jam atau cukup "jumlah di depan"? | Tampilkan keduanya. Jumlah di depan adalah sinyal utama, estimasi sebagai pelengkap. |
| Perlu fitur "Saya sudah di klinik"? | Disarankan, karena berguna untuk aturan reschedule dan penutupan sesi (lihat dokumen berikutnya). |
| Notifikasi lewat apa? | Pilih satu dulu (misalnya WhatsApp atau push) untuk "sebentar lagi giliran Anda" dan "silakan menuju ruangan". |

---

## Penutup

Pasien cukup merasakan tiga hal: **sudah terdaftar, tahu nomornya, dan tahu ke mana saat dipanggil.** Dokter, ruangan, kapasitas, dan durasi tetap dikelola penuh oleh sistem dan admin, tetapi tidak dibebankan ke pasien.
