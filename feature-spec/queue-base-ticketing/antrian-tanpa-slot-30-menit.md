# Antrian Tanpa Slot 30 Menit: Menangani Durasi Layanan yang Tidak Pasti

## Ringkasan

Sistem terasa rapuh karena **nomor antrian dan waktu dicampur jadi satu**. Kalau nomor antrian bergantung pada "jam berapa pasien sebelumnya selesai", setiap ketidakpastian durasi langsung mengganggu seluruh antrian.

Solusinya adalah memisahkan tiga hal yang selama ini menyatu:

| Hal | Dari mana asalnya | Bisa salah? |
|---|---|---|
| **Urutan** (nomor antrian) | Dibuat saat daftar, tidak tergantung durasi | Tidak |
| **Status** (menunggu / dipanggil / dilayani / selesai) | Dicatat petugas lewat aksi eksplisit | Tidak, itu fakta |
| **Estimasi waktu** (ETA) | Dihitung dari data durasi aktual | **Ya, dan itu wajar** |

Dengan pemisahan ini, ketidakpastian hanya mempengaruhi **estimasi**. Estimasi yang meleset 10 menit tidak merugikan siapa pun. Urutan yang salah baru merugikan, dan urutan tidak bergantung pada durasi.

Jawaban singkat untuk pertanyaan Anda: **jangan pakai 30 menit sebagai kunci. Pakai durasi aktual dari database Anda untuk memperkirakan, dan pakai status untuk mengetahui siapa yang sudah selesai.**

---

## 1. Pasien A sudah terlayani atau belum: pakai status

Anda khawatir karena untuk tahu pasien A sudah selesai, sistem bergantung pada `end_time`. Padahal `end_time` seharusnya **hasil** dari sebuah kejadian, bukan penentu kejadian.

```
waiting → called → in_service → done
                ↘ no_show
waiting → cancelled
```

- Pasien A "sudah terlayani" artinya `status = 'done'`.
- `actual_end` terisi **pada saat** petugas menekan "Selesai". Itu catatan, bukan prediksi.
- `actual_start` terisi saat petugas menekan "Mulai periksa".
- Pasien berikutnya dipanggil lewat tombol "Panggil berikutnya", **tidak menunggu jam tertentu**.

Dengan begitu tidak ada ketidakpastian dalam urutan pelayanan. Yang tidak pasti hanya pertanyaan "kira-kira kapan giliran saya".

---

## 2. Aturan urutan panggil (deterministik)

```text
urutan panggil = ORDER BY priority DESC, queue_no ASC
                 WHERE status = 'waiting'
                 AND service_date = hari ini AND category = kategori ruangan
```

- Nomor antrian dibuat saat pendaftaran dan **tidak pernah berubah**.
- Durasi pasien lain tidak mempengaruhi nomor Anda.
- Pasien darurat bisa diberi `priority = true` oleh admin.
- Pasien yang tidak hadir saat dipanggil diperlakukan sebagai no-show (lihat dokumen sebelumnya).

---

## 3. Memperkirakan durasi dari data aktual

Data Anda sudah punya waktu mulai dan selesai pelayanan. Itu cukup untuk memperkirakan durasi tanpa kunci 30 menit.

### 3.1 Query statistik

Sesuaikan nama tabel dan kolom dengan skema Anda.

```sql
WITH d AS (
  SELECT category,
         EXTRACT(EPOCH FROM (actual_end - actual_start)) / 60 AS menit
  FROM queue_ticket
  WHERE status = 'done'
    AND actual_start IS NOT NULL
    AND actual_end   IS NOT NULL
    AND actual_end > actual_start
    AND service_date >= current_date - 30          -- jendela 30 hari terakhir
)
SELECT category,
       count(*)                                         AS n,
       avg(menit)                                       AS rata2,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY menit) AS p50,
       percentile_cont(0.8) WITHIN GROUP (ORDER BY menit) AS p80,
       stddev(menit)                                    AS sd
FROM d
WHERE menit BETWEEN 2 AND 120                        -- buang data rusak/ekstrem
GROUP BY category;
```

### 3.2 Aturan pemakaian

- Pakai **rata-rata** untuk menjumlahkan beban antrian (rata-rata bisa dijumlahkan, median tidak).
- Pakai **p50 dan p80** untuk mengecek apakah rata-rata Anda wajar dan untuk bahan analisis.
- Buang durasi di luar 2-120 menit (kemungkinan petugas lupa menekan tombol atau salah tekan). Sesuaikan batasnya dengan kondisi klinik Anda.
- Hitung ulang rutin (misalnya tiap malam atau tiap jam), tidak perlu realtime.

### 3.3 Cold start: pakai 30 menit sebagai "prior", bukan kunci

Kalau data masih sedikit, gabungkan data aktual dengan nilai awal 30 menit:

```text
durasi = (n × rata2_aktual + k × 30) / (n + k)        # k = 10 (bobot nilai awal)
```

- `n = 0` menghasilkan 30 menit (perilaku sekarang).
- `n = 10` menghasilkan setengah dari data aktual, setengah dari nilai awal.
- `n = 100` menghasilkan hampir seluruhnya data aktual.

Sistem otomatis makin akurat tanpa perlu Anda mengubah apa pun.

### 3.4 Segmentasi (mulai sederhana)

| Level | Kapan dipakai |
|---|---|
| Per kategori (umum / bidan) | **Mulai dari sini** |
| Per jenis layanan (konsultasi, ANC, KB, imunisasi, dst.) | Kalau jenis layanan sudah diketahui saat daftar dan data cukup (n ≥ 20) |
| Per dokter | Tunda. Dokter baru ditetapkan saat dipanggil, jadi sulit dipakai saat membuat estimasi. |

Aturan fallback: kalau data segmen kurang dari 20, pakai level di atasnya.

---

## 4. Menghitung ETA

Algoritmanya sama seperti sebelumnya (simulasi beberapa lane), tetapi memakai durasi aktual dan menangani pasien yang sedang dilayani dengan lebih jujur.

```text
function estimasiMulai(lanes, antrian):
  heap = MinHeap( max(sekarang, lane.shift.mulai) for lane in lanes )

  for t in antrian:                       # urut panggil: in_service dulu, lalu waiting
    bebas = heap.pop()
    dur   = durasi(t.kategori)            # dari bagian 3
    if t.status == 'in_service':
      elapsed = sekarang - t.actual_start
      sisa    = max(dur - elapsed, SISA_MINIMUM)   # SISA_MINIMUM = 5 menit
      selesai = sekarang + sisa
    else:
      selesai = bebas + dur
    heap.push(selesai)

  return heap.peek()                      # waktu paling awal sebuah lane kosong
```

Perhatikan kasus **pasien yang melewati rata-rata**. Kalau pasien sudah 40 menit padahal rata-rata 20, jangan hitung sisa waktu negatif atau nol. Asumsikan masih butuh minimal beberapa menit (`SISA_MINIMUM`), lalu tandai ke admin: "Ruangan Umum 1 melebihi durasi normal."

### Kapan dihitung ulang

Hitung ulang ETA semua tiket `waiting` pada kejadian berikut:

- pasien dipanggil, selesai, no_show, atau cancelled,
- jadwal jaga berubah,
- ada pasien baru (online maupun walk-in),
- pasien yang sedang dilayani melewati rata-rata (sesekali, misalnya tiap 5 menit).

---

## 5. Menampilkan ketidakpastian dengan jujur

Jangan tampilkan ETA seolah pasti, misalnya "09.27". Itu justru akan terasa salah setiap kali meleset.

### 5.1 Tampilkan jumlah orang di depan

Ini sinyal paling stabil dan paling mudah dipahami:

> **4 orang di depan Anda** (2 sedang dilayani, 2 menunggu)

### 5.2 Tampilkan rentang, dibulatkan

Hitung sebaran sederhana:

```text
spread = 0,84 × sd × sqrt(jumlah_di_depan_per_lane)
rentang = ETA ± spread          # kira-kira p20 sampai p80
tampilkan = dibulatkan ke 5 atau 10 menit
```

Contoh tampilan:

> Estimasi dilayani sekitar **09.15 - 09.35**

### 5.3 Redam goyangan (hysteresis)

ETA yang berubah-ubah tiap menit membuat pasien tidak percaya.

- Perbarui tampilan hanya bila ETA bergeser **≥ 10 menit** dari yang ditampilkan.
- Kalau bergeser mundur **≥ 15 menit**, kirim notifikasi: "Antrian bergeser, estimasi baru sekitar 10.00."
- Tampilkan keterangan "diperbarui pukul 09.12".

---

## 6. Sumber kerapuhan dan penangkalnya

| Sumber masalah | Penangkal |
|---|---|
| Petugas lupa menekan "Selesai" | Saat "Panggil berikutnya" di ruangan yang sama, tutup otomatis pasien sebelumnya (`actual_end = now`, beri tanda `auto_closed`). Tandai ke admin bila `in_service` melebihi 2× rata-rata. |
| Data waktu rusak (durasi 0 menit, 6 jam, end < start) | Saring 2-120 menit. Jangan masukkan data `auto_closed` ke statistik, atau beri bobot kecil. |
| Data awal sedikit | Gabung dengan nilai awal 30 menit (bagian 3.3). |
| Durasi sangat bervariasi antar jenis layanan | Segmentasi bertahap (bagian 3.4). |
| Jam sibuk dan sepi berbeda | Mulai tanpa segmentasi waktu. Tambahkan per sesi bila data menunjukkan perbedaan nyata. |
| Jam perangkat petugas tidak akurat | Semua timestamp memakai **waktu server**, bukan waktu perangkat. |
| Admin tidak memperbarui status | Tampilkan "diperbarui pukul ..." supaya pasien tahu seberapa segar estimasinya. |
| Pasien terlambat atau tidak hadir | Mekanisme no_show, lalu ETA dihitung ulang otomatis. |

Prinsip umumnya: **sistem tidak perlu memprediksi dengan tepat, tetapi harus bisa mengoreksi dirinya sendiri** setiap kali ada kejadian nyata.

---

## 7. Mengendalikan beban tanpa slot 30 menit

Tanpa slot kaku, Anda masih perlu tahu kapan sesi terlalu penuh. Gunakan **rasio beban**, bukan hitungan slot.

```text
beban     = Σ durasi(t) untuk semua tiket aktif di sesi itu
kapasitas = jumlah_lane × sisa_menit_sesi
rasio     = beban / kapasitas
```

| Rasio | Arti | Tindakan |
|---|---|---|
| < 0,9 | Lancar | Terima seperti biasa |
| 0,9 - 1,1 | Ramai | Terima, tampilkan label "Ramai" |
| > 1,1 | Melebihi kapasitas | **Alihkan otomatis** ke sesi atau hari berikutnya (bukan di-disable). Batas toleransi diatur admin. |

Ini menjawab kekhawatiran awal Anda: pasien tidak pernah melihat sesi yang mati. Mereka hanya diberi tahu, "Antrian Anda dijadwalkan di sesi Siang."

---

## 8. Nasib angka 30 menit

Jangan hapus, tetapi turunkan statusnya.

| Sebelumnya | Sekarang |
|---|---|
| Aturan yang mengunci slot | **Nilai awal (prior)** untuk estimasi |
| `end_time = start_time + 30 menit` sebagai syarat | `projected_end` sebagai proyeksi yang boleh berubah |
| Satu slot untuk satu pasien | Tidak ada slot. Yang ada tiket, lane, dan estimasi. |

Kalau 30 menit saat ini ditegakkan oleh constraint atau trigger database (misalnya untuk mencegah tumpang tindih), ganti dengan konfigurasi `default_duration_min` dan hapus constraint tumpang tindih berbasis waktu. Pengecekan tumpang tindih cukup dilakukan di tingkat **jadwal jaga dan ruangan**, bukan di tingkat pasien.

---

## 9. Contoh perhitungan

Kondisi:

- 2 lane umum, rata-rata durasi 20 menit, simpangan baku 8 menit.
- Sekarang pukul 09.00.
- Lane 1: pasien #3 mulai 08.50, sisa 10 menit, bebas **09.10**.
- Lane 2: pasien #4 mulai 08.45, sisa 5 menit, bebas **09.05**.
- Menunggu: #5, #6, dan Anda (#7).

Simulasi:

| Langkah | Lane yang bebas lebih dulu | Selesai |
|---|---|---|
| #5 mulai | Lane 2 (09.05) | 09.25 |
| #6 mulai | Lane 1 (09.10) | 09.30 |
| **Anda (#7) mulai** | Lane 2 (09.25) | |

- ETA tengah = **09.25**.
- Sebaran = 0,84 × 8 × √2 ≈ 9,5 menit.
- Rentang = **09.15 - 09.35**.

Tampilan ke pasien:

> **4 orang di depan Anda** (2 sedang dilayani, 2 menunggu)
> Estimasi dilayani sekitar **09.15 - 09.35**

Kalau pasien #5 ternyata selesai 15 menit lebih lama, ETA dihitung ulang dan bergeser. Nomor Anda tetap #7.

---

## 10. Rencana implementasi

**Langkah 0: pastikan data bisa dipercaya** (paling penting, mulai dari sini)

- Pastikan tombol "Mulai periksa" dan "Selesai" benar-benar dipakai petugas.
- Tambahkan auto-close saat "Panggil berikutnya".
- Jalankan query bagian 3.1 dan lihat distribusi durasi Anda.

**Langkah 1: pisahkan urutan dari waktu**

- Nomor antrian dibuat atomik saat daftar.
- Urutan panggil memakai `priority, queue_no`.
- Hapus ketergantungan penentuan nomor pada `end_time`.

**Langkah 2: ETA dari data aktual**

- Tabel atau view statistik durasi.
- Fungsi `estimasiMulai` dengan penanganan pasien yang melewati rata-rata.
- Hitung ulang saat kejadian.

**Langkah 3: tampilan jujur dan pengendali beban**

- Tampilkan jumlah di depan dan rentang estimasi.
- Rasio beban untuk label "Lancar/Ramai" dan pengalihan otomatis.
- Peringatan ke admin bila durasi atau antrian menyimpang.

---

## 11. Keputusan yang perlu Anda ambil

| Pertanyaan | Saran awal |
|---|---|
| Berapa lama jendela data statistik? | 30 hari. Perpendek bila praktik klinik berubah cepat. |
| Bobot nilai awal `k`? | 10. Naikkan bila data Anda sangat berisik. |
| Berapa batas durasi valid? | 2-120 menit. Sesuaikan setelah melihat distribusi nyata. |
| Berapa batas waktu `in_service` dianggap janggal? | 2× rata-rata. |
| Seberapa sering ETA ditampilkan ulang? | Hanya bila bergeser ≥ 10 menit. |
| Apakah jenis layanan diketahui saat daftar? | Kalau ya, segmentasi per jenis layanan dari awal. Kalau tidak, cukup per kategori. |

---

## Penutup

Ketidakpastian durasi tidak bisa dihilangkan, tetapi bisa **dikurung** supaya hanya mempengaruhi satu hal: estimasi. Urutan dijaga oleh nomor antrian, kenyataan dicatat oleh status dan timestamp aktual, dan estimasi hanyalah perkiraan terbaik yang diperbarui terus. Dengan begitu, sistem Anda tidak lagi rapuh terhadap pasien yang lebih cepat atau lebih lama dari 30 menit.
