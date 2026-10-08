# Reschedule dan Penutupan: Jadwal Praktik, Ruangan, dan Batas yang Tidak Boleh Dilanggar

## Ringkasan

Beberapa hal di dokumen ini menyederhanakan dokumen sebelumnya, jadi saya tulis di awal:

1. **Reschedule tidak perlu fitur khusus.** Karena tiket tidak mengunci slot, tidak ada yang bisa "bentrok". Reschedule cukup berupa **batalkan tiket lama dan buat tiket baru** dalam satu transaksi.
2. **Reschedule hanya boleh sebelum pasien hadir atau dipanggil.** Kalau pasien sudah di klinik, ia dilayani. Yang boleh memindahkan hanyalah klinik.
3. **Jam praktik adalah milik klinik, bukan milik dokter.** Sesi berasal dari template klinik. Dokter tidak perlu membuat jadwal sendiri supaya antrian bisa berjalan.
4. **Ruangan menjadi sumber daya saat pelayanan (runtime), bukan saat booking.** Bottleneck ruangan hilang, dan tambahan dokter atau ruangan langsung menambah kapasitas tanpa mengubah kode.
5. **"Tutup" saya artikan tiga hal**: menutup tiket (batal atau kedaluwarsa), menutup sesi atau hari, dan penutupan mendadak (dokter berhalangan, klinik libur). Kalau yang Anda maksud lain, beri tahu saya.

---

## 1. Fondasi: jam praktik milik klinik

### Masalah sekarang

Kalau dokter tidak membuat jadwal sendiri, maka sesi tidak ada, dan antrian tidak bisa dibentuk. Ini menggantungkan sistem pada kebiasaan setiap dokter.

### Solusi: tiga lapis

| Lapis | Pemilik | Isi | Contoh |
|---|---|---|---|
| `session_template` | Klinik (admin) | Sesi tetap per hari dalam seminggu | Pagi 06.00-12.00, Siang 12.00-17.00 |
| `doctor_assignment` | Admin | Dokter bertugas di sesi mana secara berulang | Dr. A: Pagi, Senin-Sabtu |
| `shift_exception` | Admin | Pengecualian saja | Dr. A cuti 12-14 Okt |

Dokter baru cukup ditambahkan ke `doctor_assignment`. Selama tidak ada pengecualian, ia **otomatis dianggap bertugas**. Tidak ada aksi lain yang dibutuhkan darinya.

```sql
CREATE TABLE session_template (
  id         BIGSERIAL PRIMARY KEY,
  code       TEXT NOT NULL,        -- early_morning | pagi | siang | malam
  dow        INT  NOT NULL,        -- 0-6
  starts_at  TIME NOT NULL,
  ends_at    TIME NOT NULL
);

CREATE TABLE doctor_assignment (
  doctor_id           BIGINT NOT NULL,
  session_template_id BIGINT NOT NULL REFERENCES session_template(id),
  category            TEXT   NOT NULL CHECK (category IN ('umum','bidan')),
  preferred_room_id   BIGINT NULL,                -- opsional
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (doctor_id, session_template_id)
);

CREATE TABLE shift_exception (
  id                  BIGSERIAL PRIMARY KEY,
  doctor_id           BIGINT NOT NULL,
  service_date        DATE   NOT NULL,
  session_template_id BIGINT NULL,                -- NULL = sehari penuh
  type                TEXT   NOT NULL CHECK (type IN ('leave','extra')),
  note                TEXT
);
```

---

## 2. Ruangan: dari sumber daya booking menjadi sumber daya runtime

### Prinsip

Ruangan tidak "dipesan" oleh pasien atau oleh jadwal. Ruangan **dipakai saat pasien dipanggil**, dan hanya ada satu pasien per ruangan pada satu waktu (constraint `one_active_per_room` dari dokumen sebelumnya).

### Kapasitas

```text
lane(t) = min( jumlah dokter bertugas pada waktu t untuk kategori itu,
               jumlah ruangan kategori itu )
```

Contoh dari cerita Anda: 3 dokter umum bertugas 06.00-12.00, ruangan umum ada 2.

| Kondisi | Lane | Keterangan |
|---|---|---|
| 3 dokter, 2 ruangan umum | 2 | Dokter ke-3 standby, jadi cadangan atau bergiliran |
| Tambah 1 ruangan umum | **3** | Naik otomatis, tanpa ubah kode |
| Tambah dokter ke-4 tanpa ruangan baru | 3 | Kapasitas tidak naik. Admin mendapat saran: "Dokter umum (4) melebihi ruangan (3)." |

Inilah jawaban untuk kekhawatiran **scalable**: kapasitas ditentukan oleh data (jumlah dokter dan ruangan), bukan oleh logika yang di-hardcode.

### Bagaimana dokter mendapat ruangan

Dua mode, bisa hidup berdampingan:

| Mode | Cara kerja | Cocok bila |
|---|---|---|
| **Pool** (default) | Dokter menekan "Panggil berikutnya" dari ruangan yang sedang kosong di kategorinya | Ruangan dipakai bergantian atau jumlah dokter bisa berubah |
| **Ruangan favorit** | `preferred_room_id` diisi. Dokter diarahkan ke ruangan itu lebih dulu, dan bila terpakai, ke ruangan kosong lain di kategorinya | Kebiasaan satu dokter satu ruangan |

Kalau semua ruangan di kategori itu sedang terisi, dokter menunggu. Itu bukan error, itu kondisi nyata klinik. Sistem hanya menampilkan "Tidak ada ruangan kosong" ke dokter dan admin.

### Soal "kayaknya di realita tidak gantian ruangan"

Kalau benar di klinik Anda satu dokter selalu satu ruangan, pakai mode ruangan favorit. Hasilnya sama persis dengan kenyataan, dan sistem tetap tidak rusak saat suatu hari ada dokter yang berbagi ruangan.

---

## 3. Batas yang tidak boleh dilanggar

Anda benar: sistem harus punya batas yang tegas. Bedanya, batas tegas hanya dipasang di tempat yang memang **fisik atau logis tidak bisa dilanggar**. Sisanya lentur.

### Aturan keras (sistem menolak atau mengarahkan)

| Aturan | Penerapan |
|---|---|
| Klinik tutup (libur, di luar semua sesi, penutupan resmi) | Tiket tidak dibuat untuk waktu itu. Diarahkan ke hari buka berikutnya. |
| Satu tiket aktif per pasien per kategori per hari | Cek saat daftar |
| Satu ruangan hanya melayani satu pasien pada satu waktu | `one_active_per_room` |
| Reschedule tidak boleh setelah pasien hadir atau dipanggil | Cek status dan `checked_in_at` |
| Nomor antrian tidak berubah dan tidak dipakai ulang | Counter atomik |

### Aturan lentur (sistem menyesuaikan, tidak menolak pasien)

- Kapasitas sesi: estimasi memanjang atau dialihkan ke sesi berikutnya.
- Dokter mana yang melayani.
- Ruangan mana yang dipakai.
- Jumlah dokter yang bertugas.

---

## 4. Reschedule

### 4.1 Kapan dipakai dan kapan tidak

| Kondisi pasien | Boleh reschedule? |
|---|---|
| Belum berangkat, status `waiting`, belum hadir | **Ya** |
| Sudah menekan "Saya sudah di klinik" | **Tidak**. Boleh dibatalkan oleh admin saja. |
| Sudah dipanggil atau sedang dilayani | **Tidak** |
| Sudah di klinik tetapi klinik tidak bisa melayani hari itu | Klinik yang memindahkan (bagian 6) |

Kalau fitur "Saya sudah di klinik" belum ada, aturannya cukup: **reschedule hanya saat status `waiting`**, dan pasien yang sudah di klinik diminta menghubungi admin.

### 4.2 Implementasi: batalkan dan buat baru

```text
function ubahJadwal(tiketLama, pilihanBaru):
  if tiketLama.status != 'waiting' or tiketLama.checked_in_at is not null:
    tolak("Tiket sudah dalam proses pelayanan")

  if jumlahDiDepan(tiketLama) <= 2:
    peringatan("Giliran Anda sebentar lagi. Mengubah jadwal akan membuat nomor Anda hilang.")

  BEGIN TRANSACTION
    tiketLama.status   = 'moved'                         # dulu, supaya aturan "satu tiket aktif" lolos
    tiketBaru          = daftar(pasien, kategori, pilihanBaru)   # algoritma biasa
    tiketLama.moved_to = tiketBaru.id
  COMMIT

  hitungUlangEstimasi(sesiLama)
  hitungUlangEstimasi(sesiBaru)
```

Poin penting:

- **Tidak ada pengecekan tabrakan.** Tiket baru dibuat dengan algoritma yang sama, dan kalau sesi tujuan penuh, ia otomatis dialihkan.
- Pasien melihat nomor baru dan estimasi baru **sebelum** mengonfirmasi.
- Nomor lama dilepas dan tidak dipakai ulang.

### 4.3 Apa yang tidak perlu dibangun di awal

Karena Anda menyebut fitur ini jarang dipakai, jangan membuat:

- kalender reschedule khusus,
- kuota atau biaya reschedule,
- tampilan slot kosong per jam.

Cukup tombol **Ubah jadwal** yang membuka wizard pendaftaran dengan pilihan lama sebagai isian awal. Itu sudah mencakup hampir seluruh kebutuhan.

---

## 5. Pembatalan dan tiket yang kedaluwarsa

| Kejadian | Status | Tindakan sistem |
|---|---|---|
| Pasien membatalkan (sebelum hadir) | `cancelled` | Hitung ulang estimasi tiket lain |
| Dipanggil, tidak muncul (dipanggil 2 kali atau 10-15 menit) | `no_show` | Lewati, admin dapat menyisipkan kembali sebelum sesi berakhir |
| Sesi berakhir, pasien belum hadir | `expired` | Notifikasi dengan tombol "Daftar ulang" satu ketukan |
| Dipindahkan (reschedule atau penutupan klinik) | `moved` | Menunjuk ke tiket baru lewat `moved_to` |

Status lengkap:

```
waiting ──► called ──► in_service ──► done
   │           └──► no_show
   ├──► cancelled
   ├──► expired
   └──► moved
```

---

## 6. Penutupan

### 6.1 Batas pendaftaran sesi: alihkan, jangan disable

Untuk sesi hari ini, tiket diterima selama estimasi mulai masih sebelum akhir sesi ditambah toleransi. Di luar itu, tiket otomatis dialihkan ke sesi atau hari buka berikutnya dengan pesan jelas:

> "Sesi Pagi sudah berakhir. Antrian Anda dijadwalkan di sesi Siang, estimasi sekitar 13.00."

### 6.2 Menutup sesi (otomatis atau oleh admin)

Prinsip: **sesi ditutup untuk pendaftaran baru, bukan untuk pasien yang sudah hadir.**

```text
function tutupSesi(sesi):                     # dipicu admin, atau otomatis pada sesi.selesai + toleransi
  sesi.menerimaTiketBaru = false

  for t in tiket(sesi) where status = 'waiting':
    if t.checked_in_at is not null:
      biarkan                                  # tetap dilayani sampai habis
    else:
      t.status = 'expired'
      notifikasi(t.pasien, "Sesi telah berakhir. Daftar ulang?")   # satu ketukan
```

Untuk admin, tampilkan konfirmasi:

> Tutup sesi Pagi: 3 tiket masih menunggu.
> [ Layani semua ] [ Pindahkan ke sesi berikutnya ] [ Kedaluwarsakan yang belum hadir ]

Pekerjaan otomatis hanya sebagai jaring pengaman setelah toleransi terlewati.

### 6.3 Menutup hari

Pada jam tutup klinik:

- Pasien yang sedang dilayani tetap diselesaikan.
- Tiket `waiting` yang belum hadir menjadi `expired`.
- Tiket `in_service` yang terlalu lama (misalnya lebih dari 2 jam) ditutup otomatis dan diberi tanda `auto_closed` agar tidak merusak statistik.
- Counter nomor tidak perlu direset karena kuncinya sudah per tanggal.

### 6.4 Penutupan mendadak: di sinilah "reschedule massal" yang sebenarnya

Kebutuhan reschedule yang nyata justru berasal dari **klinik**, bukan dari pasien: dokter sakit, klinik libur mendadak, ruangan rusak.

```sql
CREATE TABLE clinic_closure (
  id                  BIGSERIAL PRIMARY KEY,
  scope               TEXT NOT NULL CHECK (scope IN ('clinic','category','session','doctor','room')),
  category            TEXT NULL,
  session_template_id BIGINT NULL,
  doctor_id           BIGINT NULL,
  room_id             BIGINT NULL,
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,
  reason              TEXT
);
```

```text
function tutupLayanan(lingkup, mulai, selesai, alasan):
  simpan clinic_closure(lingkup, mulai, selesai, alasan)

  if lingkup in ['doctor', 'room']:
    # Kapasitas berkurang, tiket tidak perlu dipindah dulu
    hitungUlangEstimasi(semua sesi terdampak)
    while rasioBeban(sesi) > batas:
      pindahkan tiket dengan queue_no terbesar            # yang paling baru mendaftar
  else:   # klinik / kategori / sesi tutup total
    terdampak = tiketAktif(lingkup, mulai, selesai)
                ORDER BY priority DESC, session_order, queue_no   # urutan relatif dijaga

    for t in terdampak:
      baru = daftar(t.pasien, t.kategori,
                    preferensi = 'secepatnya', mulaiPencarian = selesai,
                    carried_over = true)
      t.status = 'moved'; t.moved_to = baru.id
      notifikasi(t.pasien, "Jadwal dipindah ke " + baru.sesi,
                 [Terima] [Batalkan])
```

Prinsip keadilan: tiket yang dipindahkan karena **kesalahan klinik** diberi tanda `carried_over = true`, dan diurutkan sebelum pendaftar baru di sesi tujuan:

```text
ORDER BY priority DESC, carried_over DESC, session_order ASC, queue_no ASC
```

Pasien yang sudah hadir di klinik saat penutupan mendadak ditangani langsung oleh admin (layani, rujuk, atau pindahkan secara manual).

---

## 7. Tambahan skema

```sql
ALTER TABLE queue_ticket
  ADD COLUMN checked_in_at   TIMESTAMPTZ NULL,
  ADD COLUMN carried_over    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN moved_to        BIGINT  NULL REFERENCES queue_ticket(id),
  ADD COLUMN expired_at      TIMESTAMPTZ NULL,
  ADD COLUMN auto_closed     BOOLEAN NOT NULL DEFAULT FALSE;

-- Dari dokumen sebelumnya: ruangan hanya terisi satu pasien aktif
CREATE UNIQUE INDEX one_active_per_room
  ON queue_ticket (room_id)
  WHERE status IN ('called', 'in_service');

-- Satu tiket aktif per pasien per kategori per hari
CREATE UNIQUE INDEX one_active_per_patient
  ON queue_ticket (patient_id, category, service_date)
  WHERE status IN ('waiting', 'called', 'in_service');
```

Catatan: `doctor_shift` dengan constraint tumpang tindih ruangan dari dokumen pertama **tidak lagi wajib**, karena tabrakan ruangan dijaga saat pelayanan. Anda masih boleh memakainya kalau ingin jadwal ruangan yang tetap.

---

## 8. Kasus tepi

| Kasus | Penanganan |
|---|---|
| Pasien reschedule ke sesi yang penuh | Tiket baru otomatis dialihkan, pasien melihat hasilnya sebelum konfirmasi |
| Pasien reschedule berkali-kali | Tidak dibatasi di awal. Tambahkan batas lunak (misalnya 3 kali per hari) hanya bila terbukti disalahgunakan. |
| Pasien walk-in saat sesi hampir tutup | Diterima admin selama masih dalam jam tutup klinik, dibuat sebagai tiket `walk_in` dan langsung `checked_in_at` |
| Dokter terlambat atau tidak datang | Estimasi dihitung ulang dari lane yang benar-benar aktif. Bila dokter tidak datang, admin menandai `shift_exception`. |
| Semua ruangan satu kategori terisi | Dokter melihat "Tidak ada ruangan kosong". Estimasi memperhitungkan jumlah ruangan sebagai batas lane. |
| Pasien daftar di sesi yang sudah ditutup | Dialihkan otomatis ke sesi berikutnya |
| Dua petugas memanggil pasien yang sama | `FOR UPDATE SKIP LOCKED` pada pemilihan tiket |
| Hari libur nasional | `clinic_closure` atau `session_template` tidak ada, sehingga tiket jatuh ke hari buka berikutnya |

---

## 9. Urutan implementasi yang disarankan

Karena fitur reschedule jarang dipakai, bangun dari yang paling berpengaruh ke pasien:

1. **`session_template` dan `doctor_assignment`.** Sesi tidak lagi tergantung dokter yang membuat jadwal.
2. **Ruangan sebagai runtime** (`one_active_per_room`) dan tombol "Panggil berikutnya".
3. **Pembatalan** dan status `no_show` / `expired`.
4. **Tutup sesi dan tutup hari** (otomatis, dengan jaring pengaman).
5. **Reschedule** sebagai batalkan dan daftar ulang.
6. **`clinic_closure`** dan pemindahan massal (cukup manual dulu bila jarang terjadi).

---

## 10. Keputusan yang perlu Anda ambil

| Pertanyaan | Saran awal |
|---|---|
| Perlu fitur "Saya sudah di klinik" (check-in)? | Ya, sederhana saja: tombol di tiket atau tombol "Hadir" di admin. Fitur ini menentukan siapa yang masih bisa reschedule dan siapa yang tetap dilayani saat sesi ditutup. |
| Berapa toleransi setelah sesi berakhir? | Mulai 30 menit, atur dari data nyata. |
| Pasien belum hadir saat sesi berakhir: `expired` atau dibawa ke sesi berikutnya? | `expired` dengan tombol daftar ulang, admin bisa mengubah per kasus. |
| Mode ruangan: pool atau ruangan favorit? | Mulai dengan ruangan favorit bila realitanya satu dokter satu ruangan. Pool otomatis jadi cadangan. |
| Apakah dokter perlu menekan "Mulai praktik"? | Opsional. Berguna agar lane aktual (dokter yang benar-benar hadir) dipakai untuk estimasi, bukan hanya lane terjadwal. |
| Notifikasi pemindahan ke pasien lewat apa? | Pilih satu kanal dulu dan sertakan tombol Terima / Batalkan. |

---

## Penutup

Kerumitan reschedule dan ruangan berasal dari satu hal: **menganggap tiket sebagai pemegang slot, dokter, dan ruangan sejak awal.** Begitu tiket hanya berisi urutan dan estimasi, serta ruangan baru dipakai saat pasien dipanggil, tabrakan tidak lagi bisa terjadi di tahap pendaftaran. Yang tersisa hanya beberapa batas keras yang memang logis: klinik tutup, satu ruangan satu pasien, dan pasien yang sudah hadir tidak di-reschedule.
