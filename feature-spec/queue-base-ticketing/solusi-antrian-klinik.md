# Solusi Sistem Antrian Klinik: "Terima Dulu, Atur Belakangan"

## Ringkasan

Intuisi Anda sudah benar. Pasien harus **selalu bisa mendaftar dan selalu mendapat nomor antrian**. Ketersediaan dokter dan ruangan adalah urusan operasional klinik (admin), bukan urusan pasien.

Masalah di sistem sekarang bukan di ruangan atau di jumlah dokter. Masalahnya, **satu konsep "slot" dipakai untuk tiga hal sekaligus**: janji ke pasien, alokasi dokter dan ruangan, dan estimasi waktu. Akibatnya keterbatasan internal bocor ke UI pasien dalam bentuk sesi yang *disabled*.

Solusi inti:
di db cek aja 
1. Pasien memilih **layanan (Umum/Bidan) + hari + preferensi waktu**, bukan ruangan, bukan slot.
2. Sistem **selalu menerbitkan tiket** berisi nomor antrian dan estimasi jam. Tidak ada sesi yang di-disable. Kalau sesi tidak bisa dipakai, pasien **dialihkan otomatis** ke sesi terdekat.
3. **Ruangan tidak dihapus.** Ruangan disembunyikan dari pasien dan baru ditetapkan saat pasien dipanggil.
4. Kapasitas dihitung dari **jadwal jaga dokter yang sudah punya ruangan**. Bentrok ruangan dicegah di sisi admin, bukan dengan memblokir pasien.

---

## 1. Akar masalah

Di klinik fisik tanpa aplikasi, pasien datang membawa formulir lalu dilayani. Mereka tidak peduli ruangan mana atau dokter siapa. Pembagian ruangan dan dokter dilakukan staf di belakang layar.

Sistem digital sebaiknya meniru pembagian tanggung jawab itu:

| Lapisan | Siapa yang peduli | Boleh "penuh"? |
|---|---|---|
| Komitmen layanan (nomor antrian) | Pasien | **Tidak pernah** |
| Estimasi waktu dilayani | Pasien (sebagai informasi) | Berubah-ubah, bukan blokir |
| Dokter dan ruangan | Admin | Boleh, tapi jadi **peringatan admin**, bukan blokir pasien |

Kalau pasien melihat sesi yang disabled, mereka akan menganggap klinik penuh lalu datang langsung atau pergi ke klinik lain. Itu berarti Anda kehilangan pelanggan.

### Soal menghapus ruangan

Jangan dihapus. Ruangan adalah **batas kapasitas fisik yang nyata**: satu ruangan hanya bisa dipakai satu dokter pada satu waktu. Cukup:

- sembunyikan dari alur pasien,
- jadikan `room_id` **nullable** di tiket,
- isi saat pasien dipanggil.

Migrasinya kecil dan Anda tetap punya data ruangan untuk perhitungan kapasitas.

---

## 2. Alur pasien yang baru (wizard)

```
[1] Pilih layanan      →  Umum | Bidan
[2] Pilih hari         →  Hari ini | Besok | Tanggal lain
[3] Pilih waktu        →  Secepatnya (default) | Pagi | Siang | Malam
[4] Konfirmasi         →  Tiket: nomor antrian + estimasi jam
```

**Yang dihapus dari tampilan pasien:**

- total slot per sesi,
- sel sesi yang disabled,
- pilihan ruangan,
- pilihan dokter (opsional, bisa ditambahkan nanti sebagai "preferensi", bukan jaminan).

**Kalau sesi yang dipilih tidak bisa dipakai** (tidak ada dokter, atau sudah lewat jam tutup), jangan di-disable. Alihkan otomatis dengan pesan yang jelas:

> "Sesi Pagi hari ini sudah berakhir. Antrian Anda dijadwalkan di sesi Siang, estimasi dilayani sekitar 13.00."

Pasien cukup menekan **Konfirmasi**.

**Tiket yang ditampilkan:**

```
Antrian  U-P07          (Umum, sesi Pagi, nomor 7)
Estimasi dilayani  ±09.30
Mohon datang 15 menit sebelumnya
Nomor tetap, estimasi dapat bergeser
```

Boleh ada label kepadatan seperti "Lancar" atau "Ramai", tetapi hanya sebagai informasi.

---

## 3. Model data

Tabel `room` tetap ada. Tambahkan atau ubah tabel berikut:

```sql
-- Jadwal jaga: siapa, kategori apa, di ruangan mana, jam berapa
CREATE TABLE doctor_shift (
  id          BIGSERIAL PRIMARY KEY,
  doctor_id   BIGINT NOT NULL,
  category    TEXT   NOT NULL CHECK (category IN ('umum','bidan')),
  room_id     BIGINT NULL,                 -- NULL = standby (tidak dihitung kapasitas)
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL
);

-- (PostgreSQL) cegah satu ruangan dipakai dua dokter di waktu yang sama
-- butuh: CREATE EXTENSION btree_gist;
ALTER TABLE doctor_shift ADD CONSTRAINT no_room_overlap
  EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (room_id IS NOT NULL);

-- Tiket antrian (pengganti "appointment slot")
CREATE TABLE queue_ticket (
  id               BIGSERIAL PRIMARY KEY,
  patient_id       BIGINT NOT NULL,
  category         TEXT   NOT NULL,        -- umum | bidan
  service_date     DATE   NOT NULL,
  session          TEXT   NOT NULL,        -- early_morning | pagi | siang | malam
  queue_no         INT    NOT NULL,
  source           TEXT   NOT NULL DEFAULT 'online',  -- online | walk_in
  priority         BOOLEAN NOT NULL DEFAULT FALSE,
  status           TEXT   NOT NULL DEFAULT 'waiting', -- waiting|called|in_service|done|no_show|cancelled
  projected_start  TIMESTAMPTZ,            -- estimasi (boleh berubah)
  projected_end    TIMESTAMPTZ,
  actual_start     TIMESTAMPTZ,            -- terisi saat mulai diperiksa
  actual_end       TIMESTAMPTZ,            -- terisi saat selesai
  doctor_id        BIGINT NULL,            -- diisi saat dipanggil
  room_id          BIGINT NULL,            -- diisi saat dipanggil
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_date, category, session, queue_no)
);

-- Counter nomor antrian (dikunci per baris saat dipakai)
CREATE TABLE queue_counter (
  service_date DATE, category TEXT, session TEXT,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (service_date, category, session)
);
```

Poin penting:

- Pasien **walk-in juga masuk `queue_ticket`** (`source = 'walk_in'`). Dengan begitu estimasi untuk pasien online tetap akurat.
- Angka **30 menit** dipertahankan sebagai **nilai default awal**, bukan aturan keras. `projected_*` adalah proyeksi, `actual_*` adalah kenyataan.
- Cara membuat nomor secara atomik:

```sql
-- di dalam transaksi
INSERT INTO queue_counter (service_date, category, session, last_no)
VALUES ($1, $2, $3, 1)
ON CONFLICT (service_date, category, session)
DO UPDATE SET last_no = queue_counter.last_no + 1
RETURNING last_no;
```

---

## 4. Algoritma nomor antrian dan estimasi

### 4.1 Konsep: kapasitas = jumlah "lane"

Satu **lane** adalah satu dokter yang punya ruangan dan sedang jaga. Kapasitas pada suatu waktu adalah jumlah lane per kategori, **bukan** jumlah dokter.

```
lane umum  = shift kategori 'umum'  yang room_id-nya terisi pada waktu itu
lane bidan = shift kategori 'bidan' yang room_id-nya terisi pada waktu itu
```

### 4.2 Pseudocode pembuatan tiket

```text
function buatTiket(pasien, kategori, tanggal, preferensi):
  for hari in [tanggal, tanggal+1, ..., tanggal+7]:
    daftarSesi = urutkanSesi(hari, preferensi)      # "secepatnya" = urut waktu
    for sesi in daftarSesi:
      lanes = lanePada(hari, kategori, sesi)
      if lanes kosong: continue                      # tidak ada dokter -> coba sesi berikutnya

      antrian = tiketAktif(hari, kategori, sesi)     # waiting + in_service, urut prioritas lalu nomor
      est     = estimasiMulai(lanes, antrian)

      if est < sesi.selesai:                         # masih muat sebelum sesi berakhir
        return simpan(pasien, hari, sesi, est)

      if est < sesi.selesai + toleransiOverflow:     # boleh lewat sedikit (diatur admin)
        return simpan(pasien, hari, sesi, est, tandai="overflow")

  return hubungiAdmin()                               # nyaris tidak pernah tercapai
```

Pasien tidak pernah mendapat penolakan. Paling buruk, ia dialihkan ke sesi atau hari berikutnya.

### 4.3 Estimasi mulai (simulasi multi-lane)

```text
function estimasiMulai(lanes, antrian):
  heap = MinHeap( max(sekarang, lane.shift.mulai) for lane in lanes )

  for t in antrian:
    bebas = heap.pop()
    if t.status == 'in_service':
      selesai = max(sekarang, t.actual_start + durasiRataRata(t.kategori))
    else:
      selesai = bebas + durasiRataRata(t.kategori)
    heap.push(selesai)

  return heap.peek()      # waktu paling awal sebuah lane kosong
```

### 4.4 Durasi rata-rata: jangan pakai 30 menit mati

```text
durasiRataRata(kategori) =
    rata-rata (actual_end - actual_start) 30 hari terakhir
    fallback ke 30 menit bila data belum cukup
```

Kemungkinan besar konsultasi aktual lebih pendek dari 30 menit. Kalau begitu, kapasitas nyata klinik lebih besar daripada yang dihitung sistem lama. Artinya sesi yang tampak "penuh" bisa jadi sebenarnya masih longgar. Cek dulu data `actual_start` dan `actual_end` Anda.

### 4.5 Hitung ulang estimasi saat ada kejadian

Hitung ulang `projected_start` semua tiket yang masih menunggu ketika:

- pasien dipanggil, selesai, atau no-show,
- jadwal jaga berubah (dokter berhalangan, ruangan pindah),
- ada pasien walk-in atau pasien prioritas.

Prinsipnya: **nomor antrian tidak pernah berubah, estimasi boleh bergeser.**

### 4.6 Contoh kapasitas (4 ruangan, sesi 06.00-12.00)

| Kategori | Lane | Slot 30 menit per lane | Kapasitas sesi |
|---|---|---|---|
| Umum (Umum 1, Umum 2) | 2 | 12 | 24 pasien |
| Bidan (Bidan 1, Bidan 2) | 2 | 12 | 24 pasien |
| **Total** | 4 | | **48 pasien** |

Kalau durasi aktual rata-rata 15 menit, kapasitasnya kira-kira dua kali lipat. Angka ini hanya contoh. Pada praktiknya algoritma menghitungnya sendiri dari data.

---

## 5. Kasus "5 dokter, ruangan terbatas"

Skenario: 5 dokter, semuanya jaga 06.00-12.00 setiap hari, tetapi ruangannya hanya satu (atau empat).

**Kenyataan fisiknya:** dokter yang bisa praktik bersamaan paling banyak sejumlah ruangan. Kapasitas nyata adalah:

```
kapasitas = min(dokter yang hadir, ruangan yang tersedia)
```

Dengan 4 ruangan, maksimal 2 dokter umum dan 2 dokter bidan praktik bersamaan. Dari 5 dokter, minimal 1 selalu tidak memegang ruangan pada satu waktu. Karena itu "semua dokter buka di semua sesi" **sebaiknya bukan default**. Gantilah dengan **jadwal jaga (roster)** yang sudah memuat ruangan.

| Opsi | Cara | Cocok bila |
|---|---|---|
| A. Bergilir dalam sehari | Dokter A di Umum 1 jam 06-09, dokter B di Umum 1 jam 09-12 | Ruangan sedikit, dokter banyak |
| B. Bergilir per hari | Dokter dibagi per hari kerja | Jam praktik tiap dokter tidak harus penuh |
| C. Standby | Dokter tanpa ruangan (`room_id = NULL`), tidak dihitung kapasitas, siap menggantikan | Butuh cadangan bila ada yang berhalangan |

Validasi bentrok dilakukan **saat admin membuat jadwal jaga** (constraint database di atas), dengan pesan seperti:

> "Dr. A dan Dr. B bentrok di Umum 1 pada 06.00-12.00. Pilih ruangan lain atau ubah jam."

Pasien tidak pernah melihat atau merasakan bentrok ini.

---

## 6. Sisi admin

Di sinilah ketersediaan ruangan dikelola.

- **Papan antrian live** per kategori: siapa menunggu, siapa sedang dilayani, di ruangan mana.
- **Tombol "Panggil berikutnya"**: sistem menyarankan ruangan kosong yang sesuai kategori. Saat dipanggil, `room_id` dan `doctor_id` diisi, lalu status berubah menjadi `in_service` saat pemeriksaan dimulai dan `done` saat selesai. Dari sini `actual_start` dan `actual_end` terisi, dan data itu dipakai menghitung durasi rata-rata.
- **Input walk-in**: admin membuat tiket yang sama dengan `source = 'walk_in'`.
- **Peringatan beban**: kalau estimasi tunggu melebihi batas (misalnya 90 menit), tampilkan "Antrian sesi Siang melebihi kapasitas, pertimbangkan menambah dokter atau membuka ruangan".
- **Override**: tandai prioritas (misalnya kasus darurat kebidanan), pindahkan ruangan, tandai no-show.

---

## 7. Kasus tepi

| Kasus | Penanganan |
|---|---|
| Pasien tidak hadir saat dipanggil | Panggil 2 kali (atau tunggu 10-15 menit), lalu `no_show`. Admin bisa menyisipkan kembali sebelum sesi berakhir. |
| Dokter mendadak berhalangan | Ubah `doctor_shift`, estimasi semua tiket dihitung ulang otomatis. Kirim notifikasi kalau bergeser jauh. |
| Hari libur atau tidak ada shift | Tiket dialihkan otomatis ke hari buka berikutnya dengan pesan jelas. |
| Antrian melebihi kapasitas sesi | Terima dengan batas toleransi overflow. Setelah itu alihkan ke sesi atau hari berikutnya. Jangan di-disable. |
| Pasien mendaftar ganda | Satu tiket aktif per pasien per kategori per hari. |
| Kasus darurat | Flag `priority = true` menaikkan posisi tiket, estimasi tiket lain bergeser. |
| Dua pasien mendaftar bersamaan | `queue_counter` dengan upsert atomik dan `UNIQUE (service_date, category, session, queue_no)`. |

---

## 8. Rencana bertahap

**Fase 1: berhenti kehilangan pasien** (kecil dan cepat)

- Hapus tampilan total slot dan sel disabled di wizard.
- Jadikan `room_id` nullable di booking dan sembunyikan dari pasien.
- Tiket sementara bisa menggunakan penentuan nomor sederhana (urut per hari per kategori).

**Fase 2: antrian dan estimasi**

- Tambah `queue_ticket` dan `queue_counter`.
- Implementasi `buatTiket` dan `estimasiMulai`.
- Tombol "Panggil berikutnya" yang mengisi ruangan dan dokter.

**Fase 3: kapasitas yang rapi**

- `doctor_shift` dengan constraint ruangan.
- Durasi rata-rata dinamis dari data aktual.
- Peringatan beban dan dasbor sederhana (rata-rata tunggu, no-show, utilisasi ruangan).

---

## 9. Keputusan yang perlu Anda ambil

| Pertanyaan | Saran awal |
|---|---|
| Apakah pasien boleh memilih dokter? | Tidak dulu. Tambahkan sebagai "preferensi" bila ada permintaan. |
| Berapa toleransi overflow per sesi? | Mulai 20-30% di atas kapasitas, sesuaikan setelah ada data. |
| Berapa durasi konsultasi aktual? | Hitung dari data `actual_start` dan `actual_end` yang sudah ada. |
| Apakah satu dokter bisa melayani umum dan bidan? | Tentukan di roster. Database Anda baru punya dua kategori, jadi cukup satu kategori per shift. |
| Berapa batas menunggu sebelum no-show? | 10-15 menit setelah dipanggil dua kali. |
| Berapa sebenarnya ruangan Anda? | Pastikan jumlah dan kategori tiap ruangan, karena ini menentukan kapasitas nyata. |

---

## Penutup

Anda tidak perlu memilih antara "hapus ruangan" atau "ruangan membatasi pasien". Jalan tengahnya: **ruangan tetap ada sebagai batas kapasitas, tetapi dikelola admin dan baru ditetapkan saat pasien dipanggil.** Pasien cukup melihat satu hal: "Saya sudah terdaftar, ini nomor dan estimasi saya."
