# Penutupan Klinik: Hari, Sesi, dan Rentang Jam dalam Satu Model

## Ringkasan

Pendapat saya: **jangan buat tiga fitur terpisah** (tutup hari, tutup sesi, tutup jam). Ketiganya adalah satu hal, yaitu **interval waktu yang klinik tidak melayani**. Yang berbeda hanya cara admin mengisinya.

| Yang admin isi | Sebenarnya |
|---|---|
| "Tanggal 10 tutup" | Interval 10 Okt 00.00 sampai 11 Okt 00.00 |
| "Sesi Siang tanggal 9 tutup" | Interval jam sesi Siang pada 9 Okt |
| "Tutup jam 13.00 sampai 14.00" | Interval 13.00 sampai 14.00 |
| "Tutup mulai jam 18.00" | Interval 18.00 sampai akhir hari |

Dengan satu model, aturan dan algoritmanya juga satu. Tidak ada kasus khusus yang bisa saling bertabrakan.

Empat keputusan desain yang membuat semuanya tidak ambigu:

1. **Jam buka efektif = jadwal dasar dikurangi penutupan.** Semua hitungan (estimasi, pendaftaran, pemanggilan) bertumpu pada dua fungsi murni: `isOpen(waktu)` dan `nextOpen(waktu)`.
2. **Penutupan tidak pernah menghapus tiket.** Tiket yang tidak muat **dipindahkan**, bukan dihilangkan.
3. **Layanan yang sedang berjalan tidak dipotong.** Penutupan hanya melarang layanan *baru* dimulai di dalam interval tutup.
4. **Pratinjau dan penerapan memakai fungsi yang sama**, sehingga admin melihat dampak persis seperti yang akan terjadi.

Catatan: **akhir sesi yang normal bukan penutupan.** Itu sudah dibahas di dokumen sebelumnya (tutup sesi otomatis dan tutup hari). Dokumen ini khusus untuk penutupan yang **diumumkan atau diputuskan admin**.

---

## 1. Satu model, tiga bentuk input

### 1.1 Aturan penyimpanan

- Disimpan sebagai **interval setengah-terbuka** `[mulai, selesai)`: waktu `mulai` termasuk, `selesai` tidak.
- Disimpan sebagai `timestamptz` yang diartikan dalam **zona waktu klinik** (misalnya `Asia/Jakarta`), bukan zona waktu perangkat admin.
- Bentuk input (hari, sesi, jam) hanya dicatat untuk keperluan tampilan. **Interval-nya yang berlaku.**
- Penutupan bentuk sesi **menyalin** jam sesi saat dibuat. Kalau template sesi diubah di kemudian hari, penutupan yang sudah dibuat tidak ikut berubah.

### 1.2 Cara admin mengisi (antarmuka)

| Bentuk | Input admin | Interval yang disimpan |
|---|---|---|
| Seharian | Tanggal mulai dan tanggal akhir (**termasuk**) | `[mulai 00.00, akhir+1 00.00)` |
| Sesi | Tanggal + pilih satu atau lebih sesi | Gabungan jam sesi terpilih pada tanggal itu |
| Rentang jam | Tanggal + jam mulai + jam selesai (format 24 jam) | `[tanggal jam mulai, tanggal jam selesai)` |
| Sampai akhir hari | Tanggal + jam mulai | `[jam mulai, 00.00 hari berikutnya)` |

Agar tidak ambigu, antarmuka wajib menampilkan **kalimat ringkasan** sebelum disimpan:

> Klinik tutup **Sabtu, 10 Oktober 2026, seharian (00.00 - 24.00)**. 3 tiket terdampak.

> Klinik tutup **Jumat, 9 Oktober 2026, 13.00 - 14.00**. 2 tiket bergeser, 0 dipindah.

Dengan format 24 jam, "jam 1 ke jam 2" tidak bisa tertukar antara 01.00 dan 13.00.

### 1.3 Skema

```sql
CREATE TABLE clinic_closure (
  id                    BIGSERIAL PRIMARY KEY,
  scope                 TEXT NOT NULL DEFAULT 'clinic'
                         CHECK (scope IN ('clinic','category','doctor','room')),
  category              TEXT NULL,      -- terisi bila scope = 'category'
  doctor_id             BIGINT NULL,    -- terisi bila scope = 'doctor'
  room_id               BIGINT NULL,    -- terisi bila scope = 'room'
  period                TSTZRANGE NOT NULL,                 -- [mulai, selesai)
  input_kind            TEXT NOT NULL CHECK (input_kind IN ('day','session','range')),
  last_call_buffer_min  INT  NOT NULL DEFAULT 0,            -- lihat bagian 3 (R11)
  reason                TEXT,
  created_by            BIGINT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at          TIMESTAMPTZ NULL,
  CHECK (NOT isempty(period) AND lower_inc(period) AND NOT upper_inc(period))
);

-- Contoh: tutup 8 sampai 10 Oktober (termasuk), zona waktu Jakarta
INSERT INTO clinic_closure (period, input_kind, reason)
VALUES (tstzrange('2026-10-08 00:00+07', '2026-10-11 00:00+07', '[)'), 'day', 'Libur');

-- Untuk membuka di luar jadwal biasa (misalnya buka di hari Minggu)
CREATE TABLE extra_opening (
  id        BIGSERIAL PRIMARY KEY,
  category  TEXT NULL,                    -- NULL = semua kategori
  period    TSTZRANGE NOT NULL
);
```

Catatan: ini **menggantikan** definisi `clinic_closure` di dokumen sebelumnya. Cakupan `session` dihapus karena sesi hanyalah satu bentuk interval.

---

## 2. Jam buka efektif

### 2.1 Rumus

```text
jam buka efektif (per kategori, per hari)
    = ( jadwal sesi dasar  ∪  buka tambahan )  −  gabungan penutupan yang berlaku
```

- **Jadwal sesi dasar** berasal dari `session_template`. Hari Minggu yang tidak punya sesi otomatis tertutup.
- **Penutupan yang berlaku** untuk suatu kategori adalah penutupan dengan `scope = 'clinic'` dan penutupan `scope = 'category'` untuk kategori itu.
- Penutupan `doctor` dan `room` tidak mengubah jam buka, tetapi **mengurangi jumlah lane** pada interval tersebut.
- Kalau jumlah lane suatu kategori menjadi **0** pada suatu waktu, kategori itu dianggap **tutup** pada waktu itu.
- Penutupan **selalu menang** atas buka tambahan. Kalau admin ingin membuka di waktu yang sudah ditutup, cara yang benar adalah membatalkan atau memendekkan penutupannya.

### 2.2 Dua fungsi dasar

```text
isOpen(kategori, waktu):
  return waktu berada di dalam salah satu segmen terbuka (bukaEfektif) AND lane(kategori, waktu) > 0

nextOpen(kategori, waktu):
  return awal segmen terbuka terdekat yang >= waktu
         (waktu itu sendiri bila isOpen(kategori, waktu))
```

### 2.3 Menghitung segmen terbuka

```text
function bukaEfektif(kategori, hari):
  dasar    = sesiTemplate(hari)                          # sesi bernama dengan intervalnya
  tambahan = extraOpening(kategori, hari)
  tutup    = gabung( closureBerlaku(kategori, hari) )    # union, abaikan yang cancelled_at terisi

  hasil = []
  for sesi in (dasar + tambahan):
    segmen = kurangi(sesi.interval, tutup)               # bisa memecah satu sesi jadi beberapa segmen
    segmen = [s for s in segmen if panjang(s) >= MIN_SEGMEN_MENIT]   # default 15 menit
    hasil.append({ sesi, segmen })
  return hasil
```

Contoh: sesi Siang `[12.00, 17.00)` dengan penutupan `[13.00, 14.00)` menghasilkan segmen `[12.00, 13.00)` dan `[14.00, 17.00)`.

Aturan `MIN_SEGMEN_MENIT`: kalau sisa waktu terbuka suatu segmen kurang dari 15 menit, segmen itu dianggap tutup. Contoh: sesi Siang ditutup `[12.00, 16.50)` meninggalkan 10 menit, sehingga sesi itu dianggap tutup total. Ini mencegah sesi "hidup" tetapi praktis tidak bisa dipakai.

---

## 3. Katalog aturan

Setiap aturan punya nomor agar bisa dirujuk dan diuji.

### 3.1 Pembuatan penutupan

| No | Aturan | Kondisi dan tindakan |
|---|---|---|
| R1 | Format interval | `selesai > mulai`. Interval setengah-terbuka, zona waktu klinik. Selain itu **ditolak**. |
| R2 | Tiga input, satu bentuk simpan | Hari, sesi, dan rentang jam dinormalkan menjadi interval sebelum disimpan. |
| R3 | Tidak boleh di masa lalu | `mulai >= sekarang`. Untuk menutup saat ini juga, pakai "Tutup sekarang" (`mulai = sekarang`). |
| R4 | Cakupan bawaan | Seluruh klinik. Kategori, dokter, atau ruangan hanya bila dipilih eksplisit. |
| R5 | Tumpang tindih digabung | Penutupan yang beririsan atau bersambung dihitung sebagai satu gabungan. Penutupan yang sama dibuat dua kali tidak menimbulkan efek ganda. |
| R6 | Penutupan menang | Penutupan mengalahkan buka tambahan dan jadwal dasar. |
| R7 | Segmen terlalu pendek | Segmen terbuka kurang dari 15 menit dianggap tutup. |
| R8 | Durasi panjang | Penutupan lebih dari 14 hari memerlukan konfirmasi tambahan. `selesai` selalu wajib diisi (tidak ada "tutup tanpa batas"). Kalau belum tahu kapan buka, isi perkiraan lalu perpanjang. |

### 3.2 Dampak ke layanan yang sedang berjalan

| No | Aturan | Kondisi dan tindakan |
|---|---|---|
| R9 | Layanan berjalan tidak dipotong | Tiket `called` dan `in_service` dilanjutkan sampai selesai, walau melewati awal penutupan. |
| R10 | Tidak ada pemanggilan baru saat tutup | `panggilBerikutnya` ditolak dengan pesan "Klinik sedang tutup (13.00 - 14.00)". Tidak ada tombol paksa. Cara membuka lebih awal adalah memendekkan atau membatalkan penutupan. |
| R11 | Batas panggilan terakhir | Layanan baru boleh dimulai selama `mulai layanan < awal penutupan - last_call_buffer_min`. Bawaan 0 menit. Untuk klinik yang tidak boleh ada layanan menjelang tutup, isi 15 atau 30. |

### 3.3 Dampak ke tiket

| No | Aturan | Kondisi dan tindakan |
|---|---|---|
| R12 | Tiket terdampak | Tiket `waiting` pada sesi yang waktunya beririsan dengan penutupan **dan** kategorinya tercakup. Ditentukan lewat simulasi ulang, bukan hanya karena irisan. |
| R13 | Tiket yang masih muat | Hanya estimasi yang bergeser. Nomor dan sesi tidak berubah. |
| R14 | Tiket yang tidak muat | Dipindahkan ke sesi buka terdekat dengan `carried_over = true` dan nomor baru. |
| R15 | Pasien yang sudah hadir | Tiket `waiting` dengan `checked_in_at` terisi dan **tidak muat** tidak dipindah otomatis. Masuk daftar "Perlu keputusan admin". |
| R16 | Urutan dipertahankan | Pemindahan diproses berurutan `priority DESC, carried_over DESC, session_order, queue_no`. Nomor di sesi tujuan dibuat berurutan, jadi urutan relatif pasien tidak berubah. |
| R17 | Tidak ada status menggantung | Tiket yang dipindah langsung berlaku. Pasien diberi tahu dan boleh membatalkan, tetapi **tidak perlu menyetujui** agar tiketnya sah. |
| R18 | Tidak ada penghapusan | Tiket lama berstatus `moved` dan menunjuk ke tiket baru lewat `moved_to`. Tiket tidak pernah dihapus. |

### 3.4 Pendaftaran baru

| No | Aturan | Kondisi dan tindakan |
|---|---|---|
| R19 | Dialihkan, bukan ditolak | Pendaftaran ke tanggal, sesi, atau jam yang tutup otomatis jatuh ke sesi buka terdekat, dengan pesan jelas. Kalau tidak ada sesi buka dalam 14 hari ke depan, arahkan ke admin. |

### 3.5 Perubahan dan audit

| No | Aturan | Kondisi dan tindakan |
|---|---|---|
| R20 | Pratinjau wajib | Kalau ada tiket terdampak, admin melihat pratinjau lebih dulu. Hasil penerapan memakai fungsi yang sama dengan pratinjau. |
| R21 | Pembatalan atau pemendekan | Hanya mempengaruhi pendaftaran baru dan estimasi. **Tiket yang sudah dipindah tidak otomatis kembali** (menghindari bolak-balik). Admin boleh memindahkan balik secara manual. |
| R22 | Perpanjangan | Diterapkan ulang, tetapi hanya mempengaruhi tiket yang baru terdampak oleh perpanjangannya. |
| R23 | Audit | Setiap penutupan, pembatalan, dan pemindahan tiket dicatat: siapa, kapan, alasan, tiket mana. |

---

## 4. Tabel keputusan untuk tiket

Penilaian dilakukan **setelah simulasi ulang** dengan jam buka efektif yang baru.

| Status tiket | Hasil simulasi | Sudah hadir? | Tindakan |
|---|---|---|---|
| `waiting` | Sesi tidak beririsan dengan penutupan | Apa saja | Tidak berubah |
| `waiting` | Muat, estimasi sama | Apa saja | Tidak berubah |
| `waiting` | Muat, estimasi berubah | Apa saja | **Estimasi bergeser** (nomor tetap) |
| `waiting` | Tidak muat atau sesi tutup total | Belum | **Dipindah** otomatis |
| `waiting` | Tidak muat atau sesi tutup total | **Sudah** | **Perlu keputusan admin** |
| `called` | Apa saja | Apa saja | Lanjut (R9) |
| `in_service` | Apa saja | Apa saja | Lanjut sampai selesai (R9) |
| `done`, `cancelled`, `expired`, `no_show`, `moved` | | | Tidak disentuh |

Perhatikan: pasien yang sudah hadir **tidak otomatis bermasalah**. Kalau estimasinya masih muat sebelum penutupan, ia tetap dilayani seperti biasa.

### Kapan tiket dianggap "muat"

```text
batasMulaiTerakhir(segmen) = min( segmen.selesai + TOLERANSI_OVERFLOW,
                                  awalPenutupanBerikutnya(segmen.selesai) - last_call_buffer )
```

- Kalau segmen berakhir karena **akhir sesi biasa**, tiket boleh mulai sampai batas toleransi (lentur).
- Kalau segmen berakhir karena **awal penutupan**, `awalPenutupanBerikutnya` sama dengan akhir segmen, sehingga batasnya tegas (keras).
- Tiket muat bila `mulai <= batasMulaiTerakhir`.

Satu rumus ini menjawab pertanyaan "bolehkah pasien mulai dilayani 5 menit sebelum tutup?". Jawabannya ditentukan oleh `last_call_buffer`, bukan oleh perasaan petugas.

---

## 5. Algoritma menerapkan penutupan

### 5.1 Simulasi estimasi dengan penutupan

Hanya satu hal yang berubah dari algoritma estimasi sebelumnya: **waktu mulai selalu dikunci ke jam buka**.

```text
function simulasi(lanes, antrian, kategori, sesi):
  heap = MinHeap( nextOpen(kategori, max(sekarang, lane.mulai)) for lane in lanes )
  hasil = {}

  for t in antrian:                                    # urutan panggil
    bebas = heap.pop()
    mulai = nextOpen(kategori, bebas)                  # lompati jam tutup bila perlu
    segmen = segmenYangMemuat(mulai)
    muat = segmen != null and mulai <= batasMulaiTerakhir(segmen)

    hasil[t] = { mulai, muat }
    heap.push(mulai + durasi(kategori))                # boleh melewati awal penutupan (R9)

  return hasil
```

Setelah satu tiket tidak muat, tiket di belakangnya juga tidak muat, karena waktu mulai tidak pernah mundur.

### 5.2 Pratinjau dan penerapan

```text
function terapkanPenutupan(closure, commit):
  hasil = { tetap: [], bergeser: [], dipindah: [], perluKeputusan: [] }

  for (hari, kategori, sesi) in sesiTerdampak(closure):         # irisan dengan closure.period
    antrian = tiketMenunggu(hari, kategori, sesi)
              ORDER BY priority DESC, carried_over DESC, queue_no
    sim = simulasi(lanes, antrian, kategori, sesi)              # sudah memakai jam buka yang baru

    for t in antrian:
      if sim[t].muat:
        if sim[t].mulai != t.projected_start: hasil.bergeser.append(t)
        else:                                  hasil.tetap.append(t)
      elif t.checked_in_at is not null:
        hasil.perluKeputusan.append(t)
      else:
        hasil.dipindah.append(t)

  if not commit:
    return hasil                                                # pratinjau, tidak ada yang berubah

  BEGIN TRANSACTION
    simpan(closure)
    for t in hasil.dipindah (urut R16):
      baru = daftar(t.pasien, t.kategori,
                    preferensi = 'secepatnya',
                    mulaiPencarian = akhir(t.sesi),
                    carried_over = true)
      t.status = 'moved'; t.moved_to = baru.id
      antrikanNotifikasi(t.pasien, baru)
    perbaruiEstimasi(hasil.bergeser)
    catatAudit(closure, hasil)
  COMMIT

  return hasil
```

Pratinjau untuk admin:

```
Penutupan: Sabtu, 10 Okt 2026, seharian
 Tetap               : 0 tiket
 Estimasi bergeser   : 0 tiket
 Dipindah            : 3 tiket  -> Senin, 12 Okt, sesi Pagi (U-P01, U-P02, U-P03)
 Perlu keputusan     : 0 tiket

[ Batal ]   [ Terapkan ]
```

### 5.3 Pembersihan berkala (jaring pengaman)

Pendaftaran dan penutupan bisa terjadi hampir bersamaan. Untuk menjamin tidak ada tiket tersisa di jam tutup, jalankan pekerjaan `sapuBersih` setelah setiap perubahan penutupan dan secara berkala (misalnya tiap beberapa menit):

```text
function sapuBersih():
  for t in tiketMenunggu(hari ini dan ke depan):
    if waktuMulaiTiket(t) tidak muat menurut simulasi saat ini:
      lakukan tindakan sesuai tabel keputusan (bagian 4)
```

Pekerjaan ini **idempoten**: dijalankan berulang kali hasilnya sama.

### 5.4 Pasien yang mendaftar

Tidak ada kode khusus. Algoritma `daftar` memakai `bukaEfektif`, sehingga sesi yang tutup otomatis dilewati dan pasien dialihkan (R19). Contoh pesan:

> "Sabtu, 10 Oktober klinik tutup. Antrian Anda dijadwalkan Senin, 12 Oktober, sesi Pagi."

Di kalender pasien, tanggal tutup boleh diberi label "Tutup", dan penutupan sebagian diberi catatan, misalnya "Tutup 13.00 - 14.00". Tanggal itu tetap bisa dipilih. Pasien akan dialihkan, bukan ditolak.

### 5.5 Notifikasi ke pasien yang dipindah

> "Klinik tutup pada Sabtu, 10 Oktober. Antrian Anda dipindahkan ke **Senin, 12 Oktober, sesi Pagi, nomor U-P01**, estimasi sekitar 07.15. [Lihat tiket] [Batalkan]"

---

## 6. Contoh skenario dan hasil yang diharapkan

Anggap klinik buka Senin sampai Sabtu. Sesi Pagi 06.00-12.00, Siang 12.00-17.00, Malam 17.00-21.00. Hari Minggu tidak punya sesi. Toleransi overflow 30 menit, `last_call_buffer` 0.

| # | Aksi admin | Kondisi | Hasil yang diharapkan |
|---|---|---|---|
| S1 | Tutup seharian Sabtu 10 Okt | 3 tiket `waiting` di sesi Pagi, belum hadir | 3 tiket dipindah ke Senin 12 Okt sesi Pagi (Minggu tidak ada sesi), `carried_over = true`, urutan relatif sama, pasien dinotifikasi |
| S2 | Tutup sesi Siang Jumat 9 Okt | Ada tiket di Pagi dan Siang | Tiket Pagi tidak berubah. Tiket Siang dipindah ke sesi Malam hari yang sama |
| S3 | Tutup 13.00-14.00 Jumat 9 Okt | Pasien dilayani mulai 12.50. Tiket menunggu dengan estimasi 13.20 | Pasien 12.50 tetap diselesaikan (R9). Tiket 13.20 bergeser menjadi 14.00 atau setelahnya, nomor tetap |
| S4 | Tutup sekarang (15.00) sampai akhir hari | 1 pasien `in_service`, 1 `called`, 2 `waiting` belum hadir, 1 `waiting` sudah hadir | `in_service` dan `called` dilanjutkan. 2 tiket belum hadir dipindah ke hari berikutnya. Tiket yang sudah hadir masuk "Perlu keputusan admin" |
| S5 | Tutup mulai 18.00 sampai akhir hari | Sesi Malam 17.00-21.00 | Segmen terbuka `[17.00, 18.00)` (60 menit, lebih dari 15). Tiket yang estimasi mulainya setelah 18.00 dipindah. Yang sebelum 18.00 tetap |
| S6 | Tutup 12.00-16.50 | Sesi Siang tersisa 10 menit | Sesi Siang dianggap tutup total (R7). Semua tiket Siang dipindah |
| S7 | Batalkan penutupan S1 | Tiket sudah dipindah ke Senin | Tiket yang sudah dipindah **tetap** di Senin (R21). Pendaftaran baru untuk Sabtu diterima lagi |
| S8 | Tutup 8-10 Okt lalu tutup 10-11 Okt | Dua penutupan bersambung | Dihitung sebagai satu gabungan 8-11 Okt (R5). Tiket tidak dipindah dua kali |
| S9 | Tutup dokter A saja, Rabu 07.00-12.00 | 2 dokter umum, 2 ruangan umum | Lane umum turun dari 2 menjadi 1. Jam buka tidak berubah. Estimasi memanjang, dan bila rasio beban melewati batas, tiket paling akhir dialihkan |

---

## 7. Aturan yang harus selalu benar (invarian) dan cara mengujinya

| Invarian | Cara uji |
|---|---|
| `isOpen` dan `nextOpen` adalah fungsi murni dari (template, buka tambahan, penutupan, zona waktu) | Uji unit dengan tabel input dan output, tanpa database |
| Penerapan penutupan yang sama dua kali menghasilkan keadaan yang sama (idempoten) | Jalankan dua kali, bandingkan hasil |
| Pratinjau sama dengan hasil penerapan | Bandingkan `hasil` pratinjau dengan perubahan nyata dalam satu transaksi uji |
| Setelah `sapuBersih`, tidak ada tiket `waiting` yang waktu mulainya jatuh di jam tutup | Uji properti pada data acak |
| Jumlah tiket kekal: setiap tiket yang terdampak berakhir sebagai tetap, bergeser, `moved`, atau perlu keputusan | Hitung sebelum dan sesudah |
| Tidak ada panggilan baru dalam interval tutup | Uji `panggilBerikutnya` pada waktu tutup, harus ditolak |
| Tiket tidak pernah dihapus karena penutupan | Cek jumlah baris sebelum dan sesudah |
| Penutupan 8-10 Okt `[8 00.00, 11 00.00)` tidak menutup 11 Okt pukul 00.00 | Uji batas interval (setengah-terbuka) |

Sembilan skenario S1 sampai S9 di atas sebaiknya langsung dijadikan **kasus uji otomatis**.

---

## 8. Urutan implementasi

1. **Model dan fungsi dasar**: `clinic_closure`, `bukaEfektif`, `isOpen`, `nextOpen`, beserta uji unitnya.
2. **Integrasi ke pendaftaran**: `daftar` dan simulasi estimasi memakai `bukaEfektif` (pasien mulai dialihkan otomatis).
3. **Larangan panggil saat tutup** (R10).
4. **Antarmuka admin**: tiga bentuk input, kalimat ringkasan, pratinjau.
5. **Penerapan dan pemindahan tiket** plus notifikasi.
6. **`sapuBersih`** dan audit.
7. Penutupan dokter dan ruangan (pengurangan lane), bila kebutuhannya muncul.

Tahap 1 sampai 3 sudah cukup untuk penutupan harian (tanggal tutup) karena itulah kasus yang paling sering.

---

## 9. Keputusan yang perlu Anda ambil

| Pertanyaan | Saran awal |
|---|---|
| Toleransi overflow akhir sesi (normal) | 30 menit, sesuaikan dari data |
| `last_call_buffer` untuk penutupan | 0 untuk istirahat. 15-30 menit untuk tutup mendadak atau tutup sore |
| `MIN_SEGMEN_MENIT` | 15 menit |
| Penutupan lebih dari berapa hari perlu konfirmasi tambahan | 14 hari |
| Penutupan khusus kategori, dokter, atau ruangan dibuat sekarang atau nanti? | Mulai dari cakupan seluruh klinik. Dokter dan ruangan nanti saja |
| Libur nasional dimasukkan manual atau otomatis? | Manual dulu. Admin membuat penutupan seharian di awal tahun |
| Tiket pasien yang sudah hadir saat penutupan mendadak | Admin memutuskan: layani lewat jam, rujuk, atau pindahkan |
| Kanal notifikasi pemindahan | Satu kanal dulu (misalnya WhatsApp), dengan tombol Lihat tiket dan Batalkan |

---

## Penutup

Tutup per hari, per sesi, dan per jam bukan tiga masalah. Itu satu masalah: **mana saja waktu yang klinik tidak melayani.** Setelah semuanya menjadi interval, sisanya mekanis: kurangi dari jadwal dasar, simulasi ulang antrian, pindahkan yang tidak muat, dan jangan pernah memotong pasien yang sedang dilayani. Aturan R1 sampai R23 memastikan setiap kondisi punya satu jawaban, sehingga sistem tidak bergantung pada tebakan petugas.
