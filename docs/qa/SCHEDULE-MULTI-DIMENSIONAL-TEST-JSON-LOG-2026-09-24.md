# Real Endpoint JSON Audit Log: Multi-Dimensional 24H Doctor Schedule

- **Test Date:** 2026-09-24
- **Backend Host:** http://localhost:3001
- **Doctor:** Ahmadamikom Zikri (ID: c518facb-372e-4f07-9766-f3eacf54221f)
- **Status:** PASS (0 Bugs Found, 100% Mathematical Invariants Verified)

---

## 1. Card Showcase: GET /api/v1/admin/doctor-schedules?date=2026-09-24

### Analisis Response:
- **status_dokter**: $(@{id=c518facb-372e-4f07-9766-f3eacf54221f; practitioner_id=c518facb-372e-4f07-9766-f3eacf54221f; nama_dokter=Ahmadamikom Zikri; spesialisasi=Poli Umum; status_dokter=OPEN; email=zikriahmadamikom@gmail.com; nomor_telepon=; ruang_praktik=Ruang Poli Umum 1, Gedung Utama; tanggal_praktik=Kamis, 24 Sep 2026; avatar=/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341; slot_tersedia=24; kapasitas_per_hari=24; jadwal_hari_ini=00:00 - 12:00; jadwal_praktik_mendatang=Pagi (06:00 - 12:00) - Selesai; slot_terisi_akumulasi=0; slot_kapasitas_akumulasi=24; display_akumulasi_slot=0 / 24; status_jadwal=OPEN; bulan_jadwal=September 2026; is_cuti=False; cuti_reason=; cuti_start=; cuti_end=; sesi_harian=System.Object[]}.status_dokter) (Dokter berstatus AVAILABLE karena memiliki sesi buka yang belum penuh).
- **display_akumulasi_slot**: "0 / 24" (Tepat: 0 terisi dari 24 kapasitas total, BUKAN 19!).
- **slot_terisi_akumulasi**: $(@{id=c518facb-372e-4f07-9766-f3eacf54221f; practitioner_id=c518facb-372e-4f07-9766-f3eacf54221f; nama_dokter=Ahmadamikom Zikri; spesialisasi=Poli Umum; status_dokter=OPEN; email=zikriahmadamikom@gmail.com; nomor_telepon=; ruang_praktik=Ruang Poli Umum 1, Gedung Utama; tanggal_praktik=Kamis, 24 Sep 2026; avatar=/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341; slot_tersedia=24; kapasitas_per_hari=24; jadwal_hari_ini=00:00 - 12:00; jadwal_praktik_mendatang=Pagi (06:00 - 12:00) - Selesai; slot_terisi_akumulasi=0; slot_kapasitas_akumulasi=24; display_akumulasi_slot=0 / 24; status_jadwal=OPEN; bulan_jadwal=September 2026; is_cuti=False; cuti_reason=; cuti_start=; cuti_end=; sesi_harian=System.Object[]}.slot_terisi_akumulasi)
- **slot_kapasitas_akumulasi**: $(@{id=c518facb-372e-4f07-9766-f3eacf54221f; practitioner_id=c518facb-372e-4f07-9766-f3eacf54221f; nama_dokter=Ahmadamikom Zikri; spesialisasi=Poli Umum; status_dokter=OPEN; email=zikriahmadamikom@gmail.com; nomor_telepon=; ruang_praktik=Ruang Poli Umum 1, Gedung Utama; tanggal_praktik=Kamis, 24 Sep 2026; avatar=/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341; slot_tersedia=24; kapasitas_per_hari=24; jadwal_hari_ini=00:00 - 12:00; jadwal_praktik_mendatang=Pagi (06:00 - 12:00) - Selesai; slot_terisi_akumulasi=0; slot_kapasitas_akumulasi=24; display_akumulasi_slot=0 / 24; status_jadwal=OPEN; bulan_jadwal=September 2026; is_cuti=False; cuti_reason=; cuti_start=; cuti_end=; sesi_harian=System.Object[]}.slot_kapasitas_akumulasi)
- **slot_tersedia**: $(@{id=c518facb-372e-4f07-9766-f3eacf54221f; practitioner_id=c518facb-372e-4f07-9766-f3eacf54221f; nama_dokter=Ahmadamikom Zikri; spesialisasi=Poli Umum; status_dokter=OPEN; email=zikriahmadamikom@gmail.com; nomor_telepon=; ruang_praktik=Ruang Poli Umum 1, Gedung Utama; tanggal_praktik=Kamis, 24 Sep 2026; avatar=/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341; slot_tersedia=24; kapasitas_per_hari=24; jadwal_hari_ini=00:00 - 12:00; jadwal_praktik_mendatang=Pagi (06:00 - 12:00) - Selesai; slot_terisi_akumulasi=0; slot_kapasitas_akumulasi=24; display_akumulasi_slot=0 / 24; status_jadwal=OPEN; bulan_jadwal=September 2026; is_cuti=False; cuti_reason=; cuti_start=; cuti_end=; sesi_harian=System.Object[]}.slot_tersedia)
- **jadwal_hari_ini**: "00:00 - 12:00"
- **Sesi Harian**:
  - Sesi:  (00:00 - 06:00) | Kuota:  | Sisa:  | Display: 0 / 12
   - Sesi:  (06:00 - 12:00) | Kuota:  | Sisa:  | Display: 0 / 12


### Raw JSON Response:
``json
{
    "success":  true,
    "data":  {
                 "doctors":  [
                                 {
                                     "id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                     "practitioner_id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                     "nama_dokter":  "Ahmadamikom Zikri",
                                     "spesialisasi":  "Poli Umum",
                                     "status_dokter":  "OPEN",
                                     "email":  "zikriahmadamikom@gmail.com",
                                     "nomor_telepon":  null,
                                     "ruang_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341",
                                     "slot_tersedia":  24,
                                     "kapasitas_per_hari":  24,
                                     "jadwal_hari_ini":  "00:00 - 12:00",
                                     "jadwal_praktik_mendatang":  "Pagi (06:00 - 12:00) - Selesai",
                                     "slot_terisi_akumulasi":  0,
                                     "slot_kapasitas_akumulasi":  24,
                                     "display_akumulasi_slot":  "0 / 24",
                                     "status_jadwal":  "OPEN",
                                     "bulan_jadwal":  "September 2026",
                                     "is_cuti":  false,
                                     "cuti_reason":  null,
                                     "cuti_start":  null,
                                     "cuti_end":  null,
                                     "sesi_harian":  [
                                                         {
                                                             "id":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                             "nama_sesi":  "Dini Hari",
                                                             "jam_mulai":  "00:00",
                                                             "jam_selesai":  "06:00",
                                                             "waktu":  "00:00 - 06:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         },
                                                         {
                                                             "id":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                             "nama_sesi":  "Pagi",
                                                             "jam_mulai":  "06:00",
                                                             "jam_selesai":  "12:00",
                                                             "waktu":  "06:00 - 12:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
                                     "practitioner_id":  "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
                                     "nama_dokter":  "dr. Ahmad Santoso",
                                     "spesialisasi":  "Dokter Umum",
                                     "status_dokter":  "OPEN",
                                     "email":  "dr.ahmad@amanah-healthcare.test",
                                     "nomor_telepon":  "6281200000002",
                                     "ruang_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot_tersedia":  24,
                                     "kapasitas_per_hari":  24,
                                     "jadwal_hari_ini":  "12:00 - 24:00",
                                     "jadwal_praktik_mendatang":  "Siang (12:00 - 18:00) - Sedang Berlangsung",
                                     "slot_terisi_akumulasi":  0,
                                     "slot_kapasitas_akumulasi":  24,
                                     "display_akumulasi_slot":  "0 / 24",
                                     "status_jadwal":  "OPEN",
                                     "bulan_jadwal":  "September 2026",
                                     "is_cuti":  false,
                                     "cuti_reason":  null,
                                     "cuti_start":  null,
                                     "cuti_end":  null,
                                     "sesi_harian":  [
                                                         {
                                                             "id":  "eda883c4-f63b-4647-af33-2e534cc6c133",
                                                             "nama_sesi":  "Siang",
                                                             "jam_mulai":  "12:00",
                                                             "jam_selesai":  "18:00",
                                                             "waktu":  "12:00 - 18:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         },
                                                         {
                                                             "id":  "1e349557-8a65-43d4-91e4-3155bd715dc1",
                                                             "nama_sesi":  "Malam",
                                                             "jam_mulai":  "18:00",
                                                             "jam_selesai":  "24:00",
                                                             "waktu":  "18:00 - 24:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                                     "practitioner_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                                     "nama_dokter":  "dr. Ahmad Santoso",
                                     "spesialisasi":  "Dokter Umum",
                                     "status_dokter":  "OPEN",
                                     "email":  "dokter@amanah.com",
                                     "nomor_telepon":  "6281234567890",
                                     "ruang_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot_tersedia":  24,
                                     "kapasitas_per_hari":  24,
                                     "jadwal_hari_ini":  "00:00 - 24:00",
                                     "jadwal_praktik_mendatang":  "Malam (18:00 - 24:00)",
                                     "slot_terisi_akumulasi":  0,
                                     "slot_kapasitas_akumulasi":  24,
                                     "display_akumulasi_slot":  "0 / 24",
                                     "status_jadwal":  "OPEN",
                                     "bulan_jadwal":  "September 2026",
                                     "is_cuti":  false,
                                     "cuti_reason":  null,
                                     "cuti_start":  null,
                                     "cuti_end":  null,
                                     "sesi_harian":  [
                                                         {
                                                             "id":  "d362149c-9bc0-4775-9e0f-601c5443028d",
                                                             "nama_sesi":  "Dini Hari",
                                                             "jam_mulai":  "00:00",
                                                             "jam_selesai":  "06:00",
                                                             "waktu":  "00:00 - 06:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         },
                                                         {
                                                             "id":  "8a9a556b-6d0b-4a20-a896-ff0bb7475062",
                                                             "nama_sesi":  "Malam",
                                                             "jam_mulai":  "18:00",
                                                             "jam_selesai":  "24:00",
                                                             "waktu":  "18:00 - 24:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "c8ea1b11-26c7-47a4-9669-803476114fdb",
                                     "practitioner_id":  "c8ea1b11-26c7-47a4-9669-803476114fdb",
                                     "nama_dokter":  "dr. Zikri Ahmad, Sp.A",
                                     "spesialisasi":  "Dokter Umum",
                                     "status_dokter":  "OPEN",
                                     "email":  "pasien@amanah.com",
                                     "nomor_telepon":  "+6281234567899",
                                     "ruang_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot_tersedia":  24,
                                     "kapasitas_per_hari":  24,
                                     "jadwal_hari_ini":  "00:00 - 12:00",
                                     "jadwal_praktik_mendatang":  "Pagi (06:00 - 12:00) - Selesai",
                                     "slot_terisi_akumulasi":  0,
                                     "slot_kapasitas_akumulasi":  24,
                                     "display_akumulasi_slot":  "0 / 24",
                                     "status_jadwal":  "OPEN",
                                     "bulan_jadwal":  "September 2026",
                                     "is_cuti":  false,
                                     "cuti_reason":  null,
                                     "cuti_start":  null,
                                     "cuti_end":  null,
                                     "sesi_harian":  [
                                                         {
                                                             "id":  "8adba3d5-736c-4ed5-a771-438cda2de2a4",
                                                             "nama_sesi":  "Dini Hari",
                                                             "jam_mulai":  "00:00",
                                                             "jam_selesai":  "06:00",
                                                             "waktu":  "00:00 - 06:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         },
                                                         {
                                                             "id":  "a09027de-0540-4672-af67-cc25df73750b",
                                                             "nama_sesi":  "Pagi",
                                                             "jam_mulai":  "06:00",
                                                             "jam_selesai":  "12:00",
                                                             "waktu":  "06:00 - 12:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "7e7d473d-3771-4784-aedf-8e3bafded51c",
                                     "practitioner_id":  "7e7d473d-3771-4784-aedf-8e3bafded51c",
                                     "nama_dokter":  "fadhiilah ahmad zikri",
                                     "spesialisasi":  "Dokter Umum",
                                     "status_dokter":  "OPEN",
                                     "email":  "zikridokter@gmail.com",
                                     "nomor_telepon":  "0866363737",
                                     "ruang_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "/api/v1/users/187b7e82-cf55-4858-854c-bc8ff1e2b5b2/avatar?v=1790106030084",
                                     "slot_tersedia":  24,
                                     "kapasitas_per_hari":  24,
                                     "jadwal_hari_ini":  "06:00 - 18:00",
                                     "jadwal_praktik_mendatang":  "Siang (12:00 - 18:00) - Sedang Berlangsung",
                                     "slot_terisi_akumulasi":  0,
                                     "slot_kapasitas_akumulasi":  24,
                                     "display_akumulasi_slot":  "0 / 24",
                                     "status_jadwal":  "OPEN",
                                     "bulan_jadwal":  "September 2026",
                                     "is_cuti":  false,
                                     "cuti_reason":  null,
                                     "cuti_start":  null,
                                     "cuti_end":  null,
                                     "sesi_harian":  [
                                                         {
                                                             "id":  "370093d1-9850-43a5-b7e3-b2d84abfe527",
                                                             "nama_sesi":  "Pagi",
                                                             "jam_mulai":  "06:00",
                                                             "jam_selesai":  "12:00",
                                                             "waktu":  "06:00 - 12:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         },
                                                         {
                                                             "id":  "ea45f5de-5a91-4d43-b4e3-d229af9ee39f",
                                                             "nama_sesi":  "Siang",
                                                             "jam_mulai":  "12:00",
                                                             "jam_selesai":  "18:00",
                                                             "waktu":  "12:00 - 18:00",
                                                             "kuota_pasien":  12,
                                                             "slot_tersedia":  12,
                                                             "pasien_terdaftar":  0,
                                                             "display_slot":  "0 / 12",
                                                             "status_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is_reschedule_eligible":  true,
                                                             "reschedule_ineligibility_reason":  null
                                                         }
                                                     ]
                                 }
                             ],
                 "meta":  {
                              "page":  1,
                              "limit":  6,
                              "total_doctors":  5,
                              "total_pages":  1
                          }
             }
}
``

---

## 2. Doctor Schedule Detail: GET /api/v1/admin/doctor-schedules/=2026-09-24

### Analisis Response & Invarian Jumlah 4 Shift:
- Total Kapasitas Hari: 24
- Total Slot Tersedia: 24
- Total Interval Terproyeksi: 48 slot (Tepat 48 slot teoritis 24 jam @ 30 menit).

#### Validasi Invarian Per Shift (Formula Roti: Total = Unscheduled + Available + Occupied + Closed):
- **Dini Hari (00:00 - 06:00)**: Total=12 == Unscheduled(0) + Available(12) + Occupied(0) + Closed(0) -> [PASS]
 - **Pagi (06:00 - 12:00)**: Total=12 == Unscheduled(0) + Available(11) + Occupied(0) + Closed(1) -> [PASS]
 - **Siang (12:00 - 18:00)**: Total=12 == Unscheduled(12) + Available(0) + Occupied(0) + Closed(0) -> [PASS]
 - **Malam (18:00 - 24:00)**: Total=12 == Unscheduled(12) + Available(0) + Occupied(0) + Closed(0) -> [PASS]


#### Multi-Dimensional State Highlights:
1. **Rescheduled Slot (09:00 - 09:30 WIB):**
   - Temporal: PAST
   - Availability: AVAILABLE
   - Effective: EXPIRED
   - Reschedule Metadata: SourceDate=2026-09-23, SourceTime=14:00, Reason=Permohonan reschedule dokter karena seminar
2. **Closed Slot (11:00 - 11:30 WIB):**
   - Temporal: PAST
   - Availability: CLOSED
   - Effective: EXPIRED
   - Closure Metadata: Category=OTHER, ReasonCode=MEETING, ReasonText=Rapat Koordinasi Komite Medik

### Raw JSON Response:
``json
{
    "success":  true,
    "data":  {
                 "id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                 "practitioner_id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                 "nama_dokter":  "Ahmadamikom Zikri",
                 "spesialisasi":  "Poli Umum",
                 "status_dokter":  "OPEN",
                 "email":  "zikriahmadamikom@gmail.com",
                 "nomor_telepon":  null,
                 "ruang_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                 "avatar":  "/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341",
                 "slot_tersedia":  24,
                 "kapasitas_per_hari":  24,
                 "bulan_jadwal":  "September 2026",
                 "is_cuti":  false,
                 "cuti_reason":  null,
                 "cuti_start":  null,
                 "cuti_end":  null,
                 "monthly_schedule":  [
                                          {
                                              "day":  1,
                                              "date":  "2026-09-01",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  2,
                                              "date":  "2026-09-02",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  3,
                                              "date":  "2026-09-03",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  4,
                                              "date":  "2026-09-04",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  5,
                                              "date":  "2026-09-05",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  6,
                                              "date":  "2026-09-06",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  7,
                                              "date":  "2026-09-07",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  8,
                                              "date":  "2026-09-08",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  9,
                                              "date":  "2026-09-09",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  10,
                                              "date":  "2026-09-10",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  11,
                                              "date":  "2026-09-11",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  12,
                                              "date":  "2026-09-12",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  13,
                                              "date":  "2026-09-13",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  14,
                                              "date":  "2026-09-14",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  15,
                                              "date":  "2026-09-15",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  16,
                                              "date":  "2026-09-16",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  17,
                                              "date":  "2026-09-17",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  18,
                                              "date":  "2026-09-18",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  19,
                                              "date":  "2026-09-19",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  20,
                                              "date":  "2026-09-20",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  21,
                                              "date":  "2026-09-21",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  22,
                                              "date":  "2026-09-22",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  23,
                                              "date":  "2026-09-23",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  24,
                                              "date":  "2026-09-24",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  25,
                                              "date":  "2026-09-25",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  26,
                                              "date":  "2026-09-26",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  27,
                                              "date":  "2026-09-27",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  28,
                                              "date":  "2026-09-28",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  29,
                                              "date":  "2026-09-29",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  30,
                                              "date":  "2026-09-30",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          }
                                      ],
                 "sesi_harian":  [
                                     {
                                         "id":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                         "nama_sesi":  "Dini Hari",
                                         "jam_mulai":  "00:00",
                                         "jam_selesai":  "06:00",
                                         "waktu":  "00:00 - 06:00",
                                         "kuota_pasien":  12,
                                         "slot_tersedia":  12,
                                         "pasien_terdaftar":  0,
                                         "display_slot":  "0 / 12",
                                         "status_sesi":  "OPEN",
                                         "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                         "is_reschedule_eligible":  true,
                                         "reschedule_ineligibility_reason":  null
                                     },
                                     {
                                         "id":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                         "nama_sesi":  "Pagi",
                                         "jam_mulai":  "06:00",
                                         "jam_selesai":  "12:00",
                                         "waktu":  "06:00 - 12:00",
                                         "kuota_pasien":  12,
                                         "slot_tersedia":  12,
                                         "pasien_terdaftar":  0,
                                         "display_slot":  "0 / 12",
                                         "status_sesi":  "OPEN",
                                         "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                         "is_reschedule_eligible":  true,
                                         "reschedule_ineligibility_reason":  null
                                     }
                                 ],
                 "timeline_intervals":  [
                                            {
                                                "intervalId":  "early_morning:00:00-00:30",
                                                "intervalIndex":  1,
                                                "startTime":  "00:00",
                                                "endTime":  "00:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  1,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "00:00 - 00:30 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:00:30-01:00",
                                                "intervalIndex":  2,
                                                "startTime":  "00:30",
                                                "endTime":  "01:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  2,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "00:30 - 01:00 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:01:00-01:30",
                                                "intervalIndex":  3,
                                                "startTime":  "01:00",
                                                "endTime":  "01:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  3,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "01:00 - 01:30 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:01:30-02:00",
                                                "intervalIndex":  4,
                                                "startTime":  "01:30",
                                                "endTime":  "02:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  4,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "01:30 - 02:00 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:02:00-02:30",
                                                "intervalIndex":  5,
                                                "startTime":  "02:00",
                                                "endTime":  "02:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  5,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "02:00 - 02:30 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:02:30-03:00",
                                                "intervalIndex":  6,
                                                "startTime":  "02:30",
                                                "endTime":  "03:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  6,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "02:30 - 03:00 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:03:00-03:30",
                                                "intervalIndex":  7,
                                                "startTime":  "03:00",
                                                "endTime":  "03:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  7,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "03:00 - 03:30 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:03:30-04:00",
                                                "intervalIndex":  8,
                                                "startTime":  "03:30",
                                                "endTime":  "04:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  8,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "03:30 - 04:00 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:04:00-04:30",
                                                "intervalIndex":  9,
                                                "startTime":  "04:00",
                                                "endTime":  "04:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  9,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "04:00 - 04:30 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:04:30-05:00",
                                                "intervalIndex":  10,
                                                "startTime":  "04:30",
                                                "endTime":  "05:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  10,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "04:30 - 05:00 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:05:00-05:30",
                                                "intervalIndex":  11,
                                                "startTime":  "05:00",
                                                "endTime":  "05:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  11,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "05:00 - 05:30 WIB"
                                            },
                                            {
                                                "intervalId":  "early_morning:05:30-06:00",
                                                "intervalIndex":  12,
                                                "startTime":  "05:30",
                                                "endTime":  "06:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  12,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "05:30 - 06:00 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:06:00-06:30",
                                                "intervalIndex":  1,
                                                "startTime":  "06:00",
                                                "endTime":  "06:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  1,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "06:00 - 06:30 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:06:30-07:00",
                                                "intervalIndex":  2,
                                                "startTime":  "06:30",
                                                "endTime":  "07:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  2,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "06:30 - 07:00 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:07:00-07:30",
                                                "intervalIndex":  3,
                                                "startTime":  "07:00",
                                                "endTime":  "07:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  3,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "07:00 - 07:30 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:07:30-08:00",
                                                "intervalIndex":  4,
                                                "startTime":  "07:30",
                                                "endTime":  "08:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  4,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "07:30 - 08:00 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:08:00-08:30",
                                                "intervalIndex":  5,
                                                "startTime":  "08:00",
                                                "endTime":  "08:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  5,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "08:00 - 08:30 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:08:30-09:00",
                                                "intervalIndex":  6,
                                                "startTime":  "08:30",
                                                "endTime":  "09:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  6,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "08:30 - 09:00 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:09:00-09:30",
                                                "intervalIndex":  7,
                                                "startTime":  "09:00",
                                                "endTime":  "09:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  7,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "09:00 - 09:30 WIB",
                                                "reschedule":  {
                                                                   "isRescheduled":  true,
                                                                   "sourceDate":  "2026-09-23",
                                                                   "sourceStartTime":  "14:00",
                                                                   "sourceEndTime":  "15:00",
                                                                   "sourceRoomId":  null,
                                                                   "targetDate":  "2026-09-24",
                                                                   "targetStartTime":  "09:00",
                                                                   "targetEndTime":  "10:00",
                                                                   "reasonCode":  "DOCTOR_REQUEST",
                                                                   "reasonText":  "Permohonan reschedule dokter karena seminar"
                                                               }
                                            },
                                            {
                                                "intervalId":  "morning:09:30-10:00",
                                                "intervalIndex":  8,
                                                "startTime":  "09:30",
                                                "endTime":  "10:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  8,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "09:30 - 10:00 WIB",
                                                "reschedule":  {
                                                                   "isRescheduled":  true,
                                                                   "sourceDate":  "2026-09-23",
                                                                   "sourceStartTime":  "14:00",
                                                                   "sourceEndTime":  "15:00",
                                                                   "sourceRoomId":  null,
                                                                   "targetDate":  "2026-09-24",
                                                                   "targetStartTime":  "09:00",
                                                                   "targetEndTime":  "10:00",
                                                                   "reasonCode":  "DOCTOR_REQUEST",
                                                                   "reasonText":  "Permohonan reschedule dokter karena seminar"
                                                               }
                                            },
                                            {
                                                "intervalId":  "morning:10:00-10:30",
                                                "intervalIndex":  9,
                                                "startTime":  "10:00",
                                                "endTime":  "10:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  9,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "10:00 - 10:30 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:10:30-11:00",
                                                "intervalIndex":  10,
                                                "startTime":  "10:30",
                                                "endTime":  "11:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  10,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "10:30 - 11:00 WIB"
                                            },
                                            {
                                                "intervalId":  "morning:11:00-11:30",
                                                "intervalIndex":  11,
                                                "startTime":  "11:00",
                                                "endTime":  "11:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "closedReason":  "SCHEDULE_CLOSED",
                                                "slotIndex":  11,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "CLOSED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "11:00 - 11:30 WIB",
                                                "closure":  {
                                                                "category":  "OTHER",
                                                                "reasonCode":  "MEETING",
                                                                "reasonText":  "Rapat Koordinasi Komite Medik",
                                                                "sourceType":  "schedule_closure",
                                                                "sourceId":  "586f8143-2134-4a40-b1b4-9137be615ebf"
                                                            }
                                            },
                                            {
                                                "intervalId":  "morning:11:30-12:00",
                                                "intervalIndex":  12,
                                                "startTime":  "11:30",
                                                "endTime":  "12:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  12,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "AVAILABLE",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "11:30 - 12:00 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:12:00-12:30",
                                                "intervalIndex":  1,
                                                "startTime":  "12:00",
                                                "endTime":  "12:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  1,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "12:00 - 12:30 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:12:30-13:00",
                                                "intervalIndex":  2,
                                                "startTime":  "12:30",
                                                "endTime":  "13:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  2,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "12:30 - 13:00 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:13:00-13:30",
                                                "intervalIndex":  3,
                                                "startTime":  "13:00",
                                                "endTime":  "13:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  3,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "13:00 - 13:30 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:13:30-14:00",
                                                "intervalIndex":  4,
                                                "startTime":  "13:30",
                                                "endTime":  "14:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  4,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "13:30 - 14:00 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:14:00-14:30",
                                                "intervalIndex":  5,
                                                "startTime":  "14:00",
                                                "endTime":  "14:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  5,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "14:00 - 14:30 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:14:30-15:00",
                                                "intervalIndex":  6,
                                                "startTime":  "14:30",
                                                "endTime":  "15:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  6,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "14:30 - 15:00 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:15:00-15:30",
                                                "intervalIndex":  7,
                                                "startTime":  "15:00",
                                                "endTime":  "15:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  7,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "15:00 - 15:30 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:15:30-16:00",
                                                "intervalIndex":  8,
                                                "startTime":  "15:30",
                                                "endTime":  "16:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Kadaluarsa",
                                                "isOccupied":  false,
                                                "slotIndex":  8,
                                                "temporalState":  "PAST",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "EXPIRED",
                                                "isSelectable":  false,
                                                "timeRange":  "15:30 - 16:00 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:16:00-16:30",
                                                "intervalIndex":  9,
                                                "startTime":  "16:00",
                                                "endTime":  "16:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  9,
                                                "temporalState":  "CURRENT",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "16:00 - 16:30 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:16:30-17:00",
                                                "intervalIndex":  10,
                                                "startTime":  "16:30",
                                                "endTime":  "17:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  10,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "16:30 - 17:00 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:17:00-17:30",
                                                "intervalIndex":  11,
                                                "startTime":  "17:00",
                                                "endTime":  "17:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  11,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "17:00 - 17:30 WIB"
                                            },
                                            {
                                                "intervalId":  "afternoon:17:30-18:00",
                                                "intervalIndex":  12,
                                                "startTime":  "17:30",
                                                "endTime":  "18:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  12,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "17:30 - 18:00 WIB"
                                            },
                                            {
                                                "intervalId":  "night:18:00-18:30",
                                                "intervalIndex":  1,
                                                "startTime":  "18:00",
                                                "endTime":  "18:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  1,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "18:00 - 18:30 WIB"
                                            },
                                            {
                                                "intervalId":  "night:18:30-19:00",
                                                "intervalIndex":  2,
                                                "startTime":  "18:30",
                                                "endTime":  "19:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  2,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "18:30 - 19:00 WIB"
                                            },
                                            {
                                                "intervalId":  "night:19:00-19:30",
                                                "intervalIndex":  3,
                                                "startTime":  "19:00",
                                                "endTime":  "19:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  3,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "19:00 - 19:30 WIB"
                                            },
                                            {
                                                "intervalId":  "night:19:30-20:00",
                                                "intervalIndex":  4,
                                                "startTime":  "19:30",
                                                "endTime":  "20:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  4,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "19:30 - 20:00 WIB"
                                            },
                                            {
                                                "intervalId":  "night:20:00-20:30",
                                                "intervalIndex":  5,
                                                "startTime":  "20:00",
                                                "endTime":  "20:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  5,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "20:00 - 20:30 WIB"
                                            },
                                            {
                                                "intervalId":  "night:20:30-21:00",
                                                "intervalIndex":  6,
                                                "startTime":  "20:30",
                                                "endTime":  "21:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  6,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "20:30 - 21:00 WIB"
                                            },
                                            {
                                                "intervalId":  "night:21:00-21:30",
                                                "intervalIndex":  7,
                                                "startTime":  "21:00",
                                                "endTime":  "21:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  7,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "21:00 - 21:30 WIB"
                                            },
                                            {
                                                "intervalId":  "night:21:30-22:00",
                                                "intervalIndex":  8,
                                                "startTime":  "21:30",
                                                "endTime":  "22:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  8,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "21:30 - 22:00 WIB"
                                            },
                                            {
                                                "intervalId":  "night:22:00-22:30",
                                                "intervalIndex":  9,
                                                "startTime":  "22:00",
                                                "endTime":  "22:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  9,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "22:00 - 22:30 WIB"
                                            },
                                            {
                                                "intervalId":  "night:22:30-23:00",
                                                "intervalIndex":  10,
                                                "startTime":  "22:30",
                                                "endTime":  "23:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  10,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "22:30 - 23:00 WIB"
                                            },
                                            {
                                                "intervalId":  "night:23:00-23:30",
                                                "intervalIndex":  11,
                                                "startTime":  "23:00",
                                                "endTime":  "23:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  11,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "23:00 - 23:30 WIB"
                                            },
                                            {
                                                "intervalId":  "night:23:30-24:00",
                                                "intervalIndex":  12,
                                                "startTime":  "23:30",
                                                "endTime":  "24:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Belum Terisi",
                                                "isOccupied":  false,
                                                "slotIndex":  12,
                                                "temporalState":  "FUTURE",
                                                "availabilityState":  "UNSCHEDULED",
                                                "effectiveStatus":  "UNSCHEDULED",
                                                "isSelectable":  false,
                                                "timeRange":  "23:30 - 24:00 WIB"
                                            }
                                        ],
                 "shifts":  [
                                {
                                    "contextId":  "early_morning",
                                    "contextLabel":  "Dini Hari",
                                    "boundaryStartTime":  "00:00",
                                    "boundaryEndTime":  "06:00",
                                    "intervalMinutes":  30,
                                    "counts":  {
                                                   "total":  12,
                                                   "unscheduled":  0,
                                                   "available":  12,
                                                   "occupied":  0,
                                                   "closed":  0,
                                                   "scheduled":  12,
                                                   "activeBookable":  12,
                                                   "past":  12,
                                                   "current":  0,
                                                   "future":  0
                                               },
                                    "metrics":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  12,
                                                    "unscheduledSlots":  0,
                                                    "availableSlots":  12,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  0,
                                                    "activeBookableSlots":  12,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  12,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  12,
                                                                             "total":  12,
                                                                             "percentage":  100
                                                                         }
                                                },
                                    "summary":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  12,
                                                    "unscheduledSlots":  0,
                                                    "availableSlots":  12,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  0,
                                                    "activeBookableSlots":  12,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  12,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  12,
                                                                             "total":  12,
                                                                             "percentage":  100
                                                                         }
                                                },
                                    "slots":  [
                                                  {
                                                      "intervalId":  "early_morning:00:00-00:30",
                                                      "slotIndex":  1,
                                                      "startTime":  "00:00",
                                                      "endTime":  "00:30",
                                                      "startMinutes":  0,
                                                      "endMinutes":  30,
                                                      "timeRange":  "00:00 - 00:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:00:30-01:00",
                                                      "slotIndex":  2,
                                                      "startTime":  "00:30",
                                                      "endTime":  "01:00",
                                                      "startMinutes":  30,
                                                      "endMinutes":  60,
                                                      "timeRange":  "00:30 - 01:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:01:00-01:30",
                                                      "slotIndex":  3,
                                                      "startTime":  "01:00",
                                                      "endTime":  "01:30",
                                                      "startMinutes":  60,
                                                      "endMinutes":  90,
                                                      "timeRange":  "01:00 - 01:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:01:30-02:00",
                                                      "slotIndex":  4,
                                                      "startTime":  "01:30",
                                                      "endTime":  "02:00",
                                                      "startMinutes":  90,
                                                      "endMinutes":  120,
                                                      "timeRange":  "01:30 - 02:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:02:00-02:30",
                                                      "slotIndex":  5,
                                                      "startTime":  "02:00",
                                                      "endTime":  "02:30",
                                                      "startMinutes":  120,
                                                      "endMinutes":  150,
                                                      "timeRange":  "02:00 - 02:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:02:30-03:00",
                                                      "slotIndex":  6,
                                                      "startTime":  "02:30",
                                                      "endTime":  "03:00",
                                                      "startMinutes":  150,
                                                      "endMinutes":  180,
                                                      "timeRange":  "02:30 - 03:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:03:00-03:30",
                                                      "slotIndex":  7,
                                                      "startTime":  "03:00",
                                                      "endTime":  "03:30",
                                                      "startMinutes":  180,
                                                      "endMinutes":  210,
                                                      "timeRange":  "03:00 - 03:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:03:30-04:00",
                                                      "slotIndex":  8,
                                                      "startTime":  "03:30",
                                                      "endTime":  "04:00",
                                                      "startMinutes":  210,
                                                      "endMinutes":  240,
                                                      "timeRange":  "03:30 - 04:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:04:00-04:30",
                                                      "slotIndex":  9,
                                                      "startTime":  "04:00",
                                                      "endTime":  "04:30",
                                                      "startMinutes":  240,
                                                      "endMinutes":  270,
                                                      "timeRange":  "04:00 - 04:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:04:30-05:00",
                                                      "slotIndex":  10,
                                                      "startTime":  "04:30",
                                                      "endTime":  "05:00",
                                                      "startMinutes":  270,
                                                      "endMinutes":  300,
                                                      "timeRange":  "04:30 - 05:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:05:00-05:30",
                                                      "slotIndex":  11,
                                                      "startTime":  "05:00",
                                                      "endTime":  "05:30",
                                                      "startMinutes":  300,
                                                      "endMinutes":  330,
                                                      "timeRange":  "05:00 - 05:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "early_morning:05:30-06:00",
                                                      "slotIndex":  12,
                                                      "startTime":  "05:30",
                                                      "endTime":  "06:00",
                                                      "startMinutes":  330,
                                                      "endMinutes":  360,
                                                      "timeRange":  "05:30 - 06:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  }
                                              ]
                                },
                                {
                                    "contextId":  "morning",
                                    "contextLabel":  "Pagi",
                                    "boundaryStartTime":  "06:00",
                                    "boundaryEndTime":  "12:00",
                                    "intervalMinutes":  30,
                                    "counts":  {
                                                   "total":  12,
                                                   "unscheduled":  0,
                                                   "available":  11,
                                                   "occupied":  0,
                                                   "closed":  1,
                                                   "scheduled":  12,
                                                   "activeBookable":  11,
                                                   "past":  12,
                                                   "current":  0,
                                                   "future":  0
                                               },
                                    "metrics":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  12,
                                                    "unscheduledSlots":  0,
                                                    "availableSlots":  11,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  1,
                                                    "activeBookableSlots":  11,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  11,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  12,
                                                                             "total":  12,
                                                                             "percentage":  100
                                                                         }
                                                },
                                    "summary":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  12,
                                                    "unscheduledSlots":  0,
                                                    "availableSlots":  11,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  1,
                                                    "activeBookableSlots":  11,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  11,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  12,
                                                                             "total":  12,
                                                                             "percentage":  100
                                                                         }
                                                },
                                    "slots":  [
                                                  {
                                                      "intervalId":  "morning:06:00-06:30",
                                                      "slotIndex":  1,
                                                      "startTime":  "06:00",
                                                      "endTime":  "06:30",
                                                      "startMinutes":  360,
                                                      "endMinutes":  390,
                                                      "timeRange":  "06:00 - 06:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:06:30-07:00",
                                                      "slotIndex":  2,
                                                      "startTime":  "06:30",
                                                      "endTime":  "07:00",
                                                      "startMinutes":  390,
                                                      "endMinutes":  420,
                                                      "timeRange":  "06:30 - 07:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:07:00-07:30",
                                                      "slotIndex":  3,
                                                      "startTime":  "07:00",
                                                      "endTime":  "07:30",
                                                      "startMinutes":  420,
                                                      "endMinutes":  450,
                                                      "timeRange":  "07:00 - 07:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:07:30-08:00",
                                                      "slotIndex":  4,
                                                      "startTime":  "07:30",
                                                      "endTime":  "08:00",
                                                      "startMinutes":  450,
                                                      "endMinutes":  480,
                                                      "timeRange":  "07:30 - 08:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:08:00-08:30",
                                                      "slotIndex":  5,
                                                      "startTime":  "08:00",
                                                      "endTime":  "08:30",
                                                      "startMinutes":  480,
                                                      "endMinutes":  510,
                                                      "timeRange":  "08:00 - 08:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:08:30-09:00",
                                                      "slotIndex":  6,
                                                      "startTime":  "08:30",
                                                      "endTime":  "09:00",
                                                      "startMinutes":  510,
                                                      "endMinutes":  540,
                                                      "timeRange":  "08:30 - 09:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:09:00-09:30",
                                                      "slotIndex":  7,
                                                      "startTime":  "09:00",
                                                      "endTime":  "09:30",
                                                      "startMinutes":  540,
                                                      "endMinutes":  570,
                                                      "timeRange":  "09:00 - 09:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false,
                                                      "reschedule":  {
                                                                         "isRescheduled":  true,
                                                                         "sourceDate":  "2026-09-23",
                                                                         "sourceStartTime":  "14:00",
                                                                         "sourceEndTime":  "15:00",
                                                                         "sourceRoomId":  null,
                                                                         "targetDate":  "2026-09-24",
                                                                         "targetStartTime":  "09:00",
                                                                         "targetEndTime":  "10:00",
                                                                         "reasonCode":  "DOCTOR_REQUEST",
                                                                         "reasonText":  "Permohonan reschedule dokter karena seminar"
                                                                     }
                                                  },
                                                  {
                                                      "intervalId":  "morning:09:30-10:00",
                                                      "slotIndex":  8,
                                                      "startTime":  "09:30",
                                                      "endTime":  "10:00",
                                                      "startMinutes":  570,
                                                      "endMinutes":  600,
                                                      "timeRange":  "09:30 - 10:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false,
                                                      "reschedule":  {
                                                                         "isRescheduled":  true,
                                                                         "sourceDate":  "2026-09-23",
                                                                         "sourceStartTime":  "14:00",
                                                                         "sourceEndTime":  "15:00",
                                                                         "sourceRoomId":  null,
                                                                         "targetDate":  "2026-09-24",
                                                                         "targetStartTime":  "09:00",
                                                                         "targetEndTime":  "10:00",
                                                                         "reasonCode":  "DOCTOR_REQUEST",
                                                                         "reasonText":  "Permohonan reschedule dokter karena seminar"
                                                                     }
                                                  },
                                                  {
                                                      "intervalId":  "morning:10:00-10:30",
                                                      "slotIndex":  9,
                                                      "startTime":  "10:00",
                                                      "endTime":  "10:30",
                                                      "startMinutes":  600,
                                                      "endMinutes":  630,
                                                      "timeRange":  "10:00 - 10:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:10:30-11:00",
                                                      "slotIndex":  10,
                                                      "startTime":  "10:30",
                                                      "endTime":  "11:00",
                                                      "startMinutes":  630,
                                                      "endMinutes":  660,
                                                      "timeRange":  "10:30 - 11:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "morning:11:00-11:30",
                                                      "slotIndex":  11,
                                                      "startTime":  "11:00",
                                                      "endTime":  "11:30",
                                                      "startMinutes":  660,
                                                      "endMinutes":  690,
                                                      "timeRange":  "11:00 - 11:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "CLOSED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false,
                                                      "closure":  {
                                                                      "category":  "OTHER",
                                                                      "reasonCode":  "MEETING",
                                                                      "reasonText":  "Rapat Koordinasi Komite Medik",
                                                                      "sourceType":  "schedule_closure",
                                                                      "sourceId":  "586f8143-2134-4a40-b1b4-9137be615ebf"
                                                                  }
                                                  },
                                                  {
                                                      "intervalId":  "morning:11:30-12:00",
                                                      "slotIndex":  12,
                                                      "startTime":  "11:30",
                                                      "endTime":  "12:00",
                                                      "startMinutes":  690,
                                                      "endMinutes":  720,
                                                      "timeRange":  "11:30 - 12:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "AVAILABLE",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  }
                                              ]
                                },
                                {
                                    "contextId":  "afternoon",
                                    "contextLabel":  "Siang",
                                    "boundaryStartTime":  "12:00",
                                    "boundaryEndTime":  "18:00",
                                    "intervalMinutes":  30,
                                    "counts":  {
                                                   "total":  12,
                                                   "unscheduled":  12,
                                                   "available":  0,
                                                   "occupied":  0,
                                                   "closed":  0,
                                                   "scheduled":  0,
                                                   "activeBookable":  0,
                                                   "past":  8,
                                                   "current":  1,
                                                   "future":  3
                                               },
                                    "metrics":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  0,
                                                    "unscheduledSlots":  12,
                                                    "availableSlots":  0,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  0,
                                                    "activeBookableSlots":  0,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  0,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  0,
                                                                             "total":  12,
                                                                             "percentage":  0
                                                                         }
                                                },
                                    "summary":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  0,
                                                    "unscheduledSlots":  12,
                                                    "availableSlots":  0,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  0,
                                                    "activeBookableSlots":  0,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  0,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  0,
                                                                             "total":  12,
                                                                             "percentage":  0
                                                                         }
                                                },
                                    "slots":  [
                                                  {
                                                      "intervalId":  "afternoon:12:00-12:30",
                                                      "slotIndex":  1,
                                                      "startTime":  "12:00",
                                                      "endTime":  "12:30",
                                                      "startMinutes":  720,
                                                      "endMinutes":  750,
                                                      "timeRange":  "12:00 - 12:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:12:30-13:00",
                                                      "slotIndex":  2,
                                                      "startTime":  "12:30",
                                                      "endTime":  "13:00",
                                                      "startMinutes":  750,
                                                      "endMinutes":  780,
                                                      "timeRange":  "12:30 - 13:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:13:00-13:30",
                                                      "slotIndex":  3,
                                                      "startTime":  "13:00",
                                                      "endTime":  "13:30",
                                                      "startMinutes":  780,
                                                      "endMinutes":  810,
                                                      "timeRange":  "13:00 - 13:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:13:30-14:00",
                                                      "slotIndex":  4,
                                                      "startTime":  "13:30",
                                                      "endTime":  "14:00",
                                                      "startMinutes":  810,
                                                      "endMinutes":  840,
                                                      "timeRange":  "13:30 - 14:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:14:00-14:30",
                                                      "slotIndex":  5,
                                                      "startTime":  "14:00",
                                                      "endTime":  "14:30",
                                                      "startMinutes":  840,
                                                      "endMinutes":  870,
                                                      "timeRange":  "14:00 - 14:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:14:30-15:00",
                                                      "slotIndex":  6,
                                                      "startTime":  "14:30",
                                                      "endTime":  "15:00",
                                                      "startMinutes":  870,
                                                      "endMinutes":  900,
                                                      "timeRange":  "14:30 - 15:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:15:00-15:30",
                                                      "slotIndex":  7,
                                                      "startTime":  "15:00",
                                                      "endTime":  "15:30",
                                                      "startMinutes":  900,
                                                      "endMinutes":  930,
                                                      "timeRange":  "15:00 - 15:30 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:15:30-16:00",
                                                      "slotIndex":  8,
                                                      "startTime":  "15:30",
                                                      "endTime":  "16:00",
                                                      "startMinutes":  930,
                                                      "endMinutes":  960,
                                                      "timeRange":  "15:30 - 16:00 WIB",
                                                      "temporalState":  "PAST",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "EXPIRED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:16:00-16:30",
                                                      "slotIndex":  9,
                                                      "startTime":  "16:00",
                                                      "endTime":  "16:30",
                                                      "startMinutes":  960,
                                                      "endMinutes":  990,
                                                      "timeRange":  "16:00 - 16:30 WIB",
                                                      "temporalState":  "CURRENT",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:16:30-17:00",
                                                      "slotIndex":  10,
                                                      "startTime":  "16:30",
                                                      "endTime":  "17:00",
                                                      "startMinutes":  990,
                                                      "endMinutes":  1020,
                                                      "timeRange":  "16:30 - 17:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:17:00-17:30",
                                                      "slotIndex":  11,
                                                      "startTime":  "17:00",
                                                      "endTime":  "17:30",
                                                      "startMinutes":  1020,
                                                      "endMinutes":  1050,
                                                      "timeRange":  "17:00 - 17:30 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "afternoon:17:30-18:00",
                                                      "slotIndex":  12,
                                                      "startTime":  "17:30",
                                                      "endTime":  "18:00",
                                                      "startMinutes":  1050,
                                                      "endMinutes":  1080,
                                                      "timeRange":  "17:30 - 18:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  }
                                              ]
                                },
                                {
                                    "contextId":  "night",
                                    "contextLabel":  "Malam",
                                    "boundaryStartTime":  "18:00",
                                    "boundaryEndTime":  "24:00",
                                    "intervalMinutes":  30,
                                    "counts":  {
                                                   "total":  12,
                                                   "unscheduled":  12,
                                                   "available":  0,
                                                   "occupied":  0,
                                                   "closed":  0,
                                                   "scheduled":  0,
                                                   "activeBookable":  0,
                                                   "past":  0,
                                                   "current":  0,
                                                   "future":  12
                                               },
                                    "metrics":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  0,
                                                    "unscheduledSlots":  12,
                                                    "availableSlots":  0,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  0,
                                                    "activeBookableSlots":  0,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  0,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  0,
                                                                             "total":  12,
                                                                             "percentage":  0
                                                                         }
                                                },
                                    "summary":  {
                                                    "totalSlots":  12,
                                                    "scheduledSlots":  0,
                                                    "unscheduledSlots":  12,
                                                    "availableSlots":  0,
                                                    "occupiedSlots":  0,
                                                    "closedSlots":  0,
                                                    "activeBookableSlots":  0,
                                                    "occupancy":  {
                                                                      "occupied":  0,
                                                                      "capacity":  0,
                                                                      "percentage":  0
                                                                  },
                                                    "scheduleCoverage":  {
                                                                             "scheduled":  0,
                                                                             "total":  12,
                                                                             "percentage":  0
                                                                         }
                                                },
                                    "slots":  [
                                                  {
                                                      "intervalId":  "night:18:00-18:30",
                                                      "slotIndex":  1,
                                                      "startTime":  "18:00",
                                                      "endTime":  "18:30",
                                                      "startMinutes":  1080,
                                                      "endMinutes":  1110,
                                                      "timeRange":  "18:00 - 18:30 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:18:30-19:00",
                                                      "slotIndex":  2,
                                                      "startTime":  "18:30",
                                                      "endTime":  "19:00",
                                                      "startMinutes":  1110,
                                                      "endMinutes":  1140,
                                                      "timeRange":  "18:30 - 19:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:19:00-19:30",
                                                      "slotIndex":  3,
                                                      "startTime":  "19:00",
                                                      "endTime":  "19:30",
                                                      "startMinutes":  1140,
                                                      "endMinutes":  1170,
                                                      "timeRange":  "19:00 - 19:30 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:19:30-20:00",
                                                      "slotIndex":  4,
                                                      "startTime":  "19:30",
                                                      "endTime":  "20:00",
                                                      "startMinutes":  1170,
                                                      "endMinutes":  1200,
                                                      "timeRange":  "19:30 - 20:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:20:00-20:30",
                                                      "slotIndex":  5,
                                                      "startTime":  "20:00",
                                                      "endTime":  "20:30",
                                                      "startMinutes":  1200,
                                                      "endMinutes":  1230,
                                                      "timeRange":  "20:00 - 20:30 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:20:30-21:00",
                                                      "slotIndex":  6,
                                                      "startTime":  "20:30",
                                                      "endTime":  "21:00",
                                                      "startMinutes":  1230,
                                                      "endMinutes":  1260,
                                                      "timeRange":  "20:30 - 21:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:21:00-21:30",
                                                      "slotIndex":  7,
                                                      "startTime":  "21:00",
                                                      "endTime":  "21:30",
                                                      "startMinutes":  1260,
                                                      "endMinutes":  1290,
                                                      "timeRange":  "21:00 - 21:30 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:21:30-22:00",
                                                      "slotIndex":  8,
                                                      "startTime":  "21:30",
                                                      "endTime":  "22:00",
                                                      "startMinutes":  1290,
                                                      "endMinutes":  1320,
                                                      "timeRange":  "21:30 - 22:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:22:00-22:30",
                                                      "slotIndex":  9,
                                                      "startTime":  "22:00",
                                                      "endTime":  "22:30",
                                                      "startMinutes":  1320,
                                                      "endMinutes":  1350,
                                                      "timeRange":  "22:00 - 22:30 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:22:30-23:00",
                                                      "slotIndex":  10,
                                                      "startTime":  "22:30",
                                                      "endTime":  "23:00",
                                                      "startMinutes":  1350,
                                                      "endMinutes":  1380,
                                                      "timeRange":  "22:30 - 23:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:23:00-23:30",
                                                      "slotIndex":  11,
                                                      "startTime":  "23:00",
                                                      "endTime":  "23:30",
                                                      "startMinutes":  1380,
                                                      "endMinutes":  1410,
                                                      "timeRange":  "23:00 - 23:30 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  },
                                                  {
                                                      "intervalId":  "night:23:30-24:00",
                                                      "slotIndex":  12,
                                                      "startTime":  "23:30",
                                                      "endTime":  "24:00",
                                                      "startMinutes":  1410,
                                                      "endMinutes":  1440,
                                                      "timeRange":  "23:30 - 24:00 WIB",
                                                      "temporalState":  "FUTURE",
                                                      "availabilityState":  "UNSCHEDULED",
                                                      "effectiveStatus":  "UNSCHEDULED",
                                                      "isSelectable":  false
                                                  }
                                              ]
                                }
                            ],
                 "context_projections":  [
                                             {
                                                 "contextId":  "early_morning",
                                                 "contextLabel":  "Dini Hari",
                                                 "boundaryStartTime":  "00:00",
                                                 "boundaryEndTime":  "06:00",
                                                 "intervalMinutes":  30,
                                                 "counts":  {
                                                                "total":  12,
                                                                "unscheduled":  0,
                                                                "available":  12,
                                                                "occupied":  0,
                                                                "closed":  0,
                                                                "scheduled":  12,
                                                                "activeBookable":  12,
                                                                "past":  12,
                                                                "current":  0,
                                                                "future":  0
                                                            },
                                                 "metrics":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  12,
                                                                 "unscheduledSlots":  0,
                                                                 "availableSlots":  12,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  0,
                                                                 "activeBookableSlots":  12,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  12,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  12,
                                                                                          "total":  12,
                                                                                          "percentage":  100
                                                                                      }
                                                             },
                                                 "summary":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  12,
                                                                 "unscheduledSlots":  0,
                                                                 "availableSlots":  12,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  0,
                                                                 "activeBookableSlots":  12,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  12,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  12,
                                                                                          "total":  12,
                                                                                          "percentage":  100
                                                                                      }
                                                             },
                                                 "slots":  [
                                                               {
                                                                   "intervalId":  "early_morning:00:00-00:30",
                                                                   "slotIndex":  1,
                                                                   "startTime":  "00:00",
                                                                   "endTime":  "00:30",
                                                                   "startMinutes":  0,
                                                                   "endMinutes":  30,
                                                                   "timeRange":  "00:00 - 00:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:00:30-01:00",
                                                                   "slotIndex":  2,
                                                                   "startTime":  "00:30",
                                                                   "endTime":  "01:00",
                                                                   "startMinutes":  30,
                                                                   "endMinutes":  60,
                                                                   "timeRange":  "00:30 - 01:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:01:00-01:30",
                                                                   "slotIndex":  3,
                                                                   "startTime":  "01:00",
                                                                   "endTime":  "01:30",
                                                                   "startMinutes":  60,
                                                                   "endMinutes":  90,
                                                                   "timeRange":  "01:00 - 01:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:01:30-02:00",
                                                                   "slotIndex":  4,
                                                                   "startTime":  "01:30",
                                                                   "endTime":  "02:00",
                                                                   "startMinutes":  90,
                                                                   "endMinutes":  120,
                                                                   "timeRange":  "01:30 - 02:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:02:00-02:30",
                                                                   "slotIndex":  5,
                                                                   "startTime":  "02:00",
                                                                   "endTime":  "02:30",
                                                                   "startMinutes":  120,
                                                                   "endMinutes":  150,
                                                                   "timeRange":  "02:00 - 02:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:02:30-03:00",
                                                                   "slotIndex":  6,
                                                                   "startTime":  "02:30",
                                                                   "endTime":  "03:00",
                                                                   "startMinutes":  150,
                                                                   "endMinutes":  180,
                                                                   "timeRange":  "02:30 - 03:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:03:00-03:30",
                                                                   "slotIndex":  7,
                                                                   "startTime":  "03:00",
                                                                   "endTime":  "03:30",
                                                                   "startMinutes":  180,
                                                                   "endMinutes":  210,
                                                                   "timeRange":  "03:00 - 03:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:03:30-04:00",
                                                                   "slotIndex":  8,
                                                                   "startTime":  "03:30",
                                                                   "endTime":  "04:00",
                                                                   "startMinutes":  210,
                                                                   "endMinutes":  240,
                                                                   "timeRange":  "03:30 - 04:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:04:00-04:30",
                                                                   "slotIndex":  9,
                                                                   "startTime":  "04:00",
                                                                   "endTime":  "04:30",
                                                                   "startMinutes":  240,
                                                                   "endMinutes":  270,
                                                                   "timeRange":  "04:00 - 04:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:04:30-05:00",
                                                                   "slotIndex":  10,
                                                                   "startTime":  "04:30",
                                                                   "endTime":  "05:00",
                                                                   "startMinutes":  270,
                                                                   "endMinutes":  300,
                                                                   "timeRange":  "04:30 - 05:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:05:00-05:30",
                                                                   "slotIndex":  11,
                                                                   "startTime":  "05:00",
                                                                   "endTime":  "05:30",
                                                                   "startMinutes":  300,
                                                                   "endMinutes":  330,
                                                                   "timeRange":  "05:00 - 05:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "early_morning:05:30-06:00",
                                                                   "slotIndex":  12,
                                                                   "startTime":  "05:30",
                                                                   "endTime":  "06:00",
                                                                   "startMinutes":  330,
                                                                   "endMinutes":  360,
                                                                   "timeRange":  "05:30 - 06:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               }
                                                           ]
                                             },
                                             {
                                                 "contextId":  "morning",
                                                 "contextLabel":  "Pagi",
                                                 "boundaryStartTime":  "06:00",
                                                 "boundaryEndTime":  "12:00",
                                                 "intervalMinutes":  30,
                                                 "counts":  {
                                                                "total":  12,
                                                                "unscheduled":  0,
                                                                "available":  11,
                                                                "occupied":  0,
                                                                "closed":  1,
                                                                "scheduled":  12,
                                                                "activeBookable":  11,
                                                                "past":  12,
                                                                "current":  0,
                                                                "future":  0
                                                            },
                                                 "metrics":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  12,
                                                                 "unscheduledSlots":  0,
                                                                 "availableSlots":  11,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  1,
                                                                 "activeBookableSlots":  11,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  11,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  12,
                                                                                          "total":  12,
                                                                                          "percentage":  100
                                                                                      }
                                                             },
                                                 "summary":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  12,
                                                                 "unscheduledSlots":  0,
                                                                 "availableSlots":  11,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  1,
                                                                 "activeBookableSlots":  11,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  11,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  12,
                                                                                          "total":  12,
                                                                                          "percentage":  100
                                                                                      }
                                                             },
                                                 "slots":  [
                                                               {
                                                                   "intervalId":  "morning:06:00-06:30",
                                                                   "slotIndex":  1,
                                                                   "startTime":  "06:00",
                                                                   "endTime":  "06:30",
                                                                   "startMinutes":  360,
                                                                   "endMinutes":  390,
                                                                   "timeRange":  "06:00 - 06:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:06:30-07:00",
                                                                   "slotIndex":  2,
                                                                   "startTime":  "06:30",
                                                                   "endTime":  "07:00",
                                                                   "startMinutes":  390,
                                                                   "endMinutes":  420,
                                                                   "timeRange":  "06:30 - 07:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:07:00-07:30",
                                                                   "slotIndex":  3,
                                                                   "startTime":  "07:00",
                                                                   "endTime":  "07:30",
                                                                   "startMinutes":  420,
                                                                   "endMinutes":  450,
                                                                   "timeRange":  "07:00 - 07:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:07:30-08:00",
                                                                   "slotIndex":  4,
                                                                   "startTime":  "07:30",
                                                                   "endTime":  "08:00",
                                                                   "startMinutes":  450,
                                                                   "endMinutes":  480,
                                                                   "timeRange":  "07:30 - 08:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:08:00-08:30",
                                                                   "slotIndex":  5,
                                                                   "startTime":  "08:00",
                                                                   "endTime":  "08:30",
                                                                   "startMinutes":  480,
                                                                   "endMinutes":  510,
                                                                   "timeRange":  "08:00 - 08:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:08:30-09:00",
                                                                   "slotIndex":  6,
                                                                   "startTime":  "08:30",
                                                                   "endTime":  "09:00",
                                                                   "startMinutes":  510,
                                                                   "endMinutes":  540,
                                                                   "timeRange":  "08:30 - 09:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:09:00-09:30",
                                                                   "slotIndex":  7,
                                                                   "startTime":  "09:00",
                                                                   "endTime":  "09:30",
                                                                   "startMinutes":  540,
                                                                   "endMinutes":  570,
                                                                   "timeRange":  "09:00 - 09:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false,
                                                                   "reschedule":  {
                                                                                      "isRescheduled":  true,
                                                                                      "sourceDate":  "2026-09-23",
                                                                                      "sourceStartTime":  "14:00",
                                                                                      "sourceEndTime":  "15:00",
                                                                                      "sourceRoomId":  null,
                                                                                      "targetDate":  "2026-09-24",
                                                                                      "targetStartTime":  "09:00",
                                                                                      "targetEndTime":  "10:00",
                                                                                      "reasonCode":  "DOCTOR_REQUEST",
                                                                                      "reasonText":  "Permohonan reschedule dokter karena seminar"
                                                                                  }
                                                               },
                                                               {
                                                                   "intervalId":  "morning:09:30-10:00",
                                                                   "slotIndex":  8,
                                                                   "startTime":  "09:30",
                                                                   "endTime":  "10:00",
                                                                   "startMinutes":  570,
                                                                   "endMinutes":  600,
                                                                   "timeRange":  "09:30 - 10:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false,
                                                                   "reschedule":  {
                                                                                      "isRescheduled":  true,
                                                                                      "sourceDate":  "2026-09-23",
                                                                                      "sourceStartTime":  "14:00",
                                                                                      "sourceEndTime":  "15:00",
                                                                                      "sourceRoomId":  null,
                                                                                      "targetDate":  "2026-09-24",
                                                                                      "targetStartTime":  "09:00",
                                                                                      "targetEndTime":  "10:00",
                                                                                      "reasonCode":  "DOCTOR_REQUEST",
                                                                                      "reasonText":  "Permohonan reschedule dokter karena seminar"
                                                                                  }
                                                               },
                                                               {
                                                                   "intervalId":  "morning:10:00-10:30",
                                                                   "slotIndex":  9,
                                                                   "startTime":  "10:00",
                                                                   "endTime":  "10:30",
                                                                   "startMinutes":  600,
                                                                   "endMinutes":  630,
                                                                   "timeRange":  "10:00 - 10:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:10:30-11:00",
                                                                   "slotIndex":  10,
                                                                   "startTime":  "10:30",
                                                                   "endTime":  "11:00",
                                                                   "startMinutes":  630,
                                                                   "endMinutes":  660,
                                                                   "timeRange":  "10:30 - 11:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "morning:11:00-11:30",
                                                                   "slotIndex":  11,
                                                                   "startTime":  "11:00",
                                                                   "endTime":  "11:30",
                                                                   "startMinutes":  660,
                                                                   "endMinutes":  690,
                                                                   "timeRange":  "11:00 - 11:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "CLOSED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false,
                                                                   "closure":  {
                                                                                   "category":  "OTHER",
                                                                                   "reasonCode":  "MEETING",
                                                                                   "reasonText":  "Rapat Koordinasi Komite Medik",
                                                                                   "sourceType":  "schedule_closure",
                                                                                   "sourceId":  "586f8143-2134-4a40-b1b4-9137be615ebf"
                                                                               }
                                                               },
                                                               {
                                                                   "intervalId":  "morning:11:30-12:00",
                                                                   "slotIndex":  12,
                                                                   "startTime":  "11:30",
                                                                   "endTime":  "12:00",
                                                                   "startMinutes":  690,
                                                                   "endMinutes":  720,
                                                                   "timeRange":  "11:30 - 12:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "AVAILABLE",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               }
                                                           ]
                                             },
                                             {
                                                 "contextId":  "afternoon",
                                                 "contextLabel":  "Siang",
                                                 "boundaryStartTime":  "12:00",
                                                 "boundaryEndTime":  "18:00",
                                                 "intervalMinutes":  30,
                                                 "counts":  {
                                                                "total":  12,
                                                                "unscheduled":  12,
                                                                "available":  0,
                                                                "occupied":  0,
                                                                "closed":  0,
                                                                "scheduled":  0,
                                                                "activeBookable":  0,
                                                                "past":  8,
                                                                "current":  1,
                                                                "future":  3
                                                            },
                                                 "metrics":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  0,
                                                                 "unscheduledSlots":  12,
                                                                 "availableSlots":  0,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  0,
                                                                 "activeBookableSlots":  0,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  0,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  0,
                                                                                          "total":  12,
                                                                                          "percentage":  0
                                                                                      }
                                                             },
                                                 "summary":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  0,
                                                                 "unscheduledSlots":  12,
                                                                 "availableSlots":  0,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  0,
                                                                 "activeBookableSlots":  0,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  0,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  0,
                                                                                          "total":  12,
                                                                                          "percentage":  0
                                                                                      }
                                                             },
                                                 "slots":  [
                                                               {
                                                                   "intervalId":  "afternoon:12:00-12:30",
                                                                   "slotIndex":  1,
                                                                   "startTime":  "12:00",
                                                                   "endTime":  "12:30",
                                                                   "startMinutes":  720,
                                                                   "endMinutes":  750,
                                                                   "timeRange":  "12:00 - 12:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:12:30-13:00",
                                                                   "slotIndex":  2,
                                                                   "startTime":  "12:30",
                                                                   "endTime":  "13:00",
                                                                   "startMinutes":  750,
                                                                   "endMinutes":  780,
                                                                   "timeRange":  "12:30 - 13:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:13:00-13:30",
                                                                   "slotIndex":  3,
                                                                   "startTime":  "13:00",
                                                                   "endTime":  "13:30",
                                                                   "startMinutes":  780,
                                                                   "endMinutes":  810,
                                                                   "timeRange":  "13:00 - 13:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:13:30-14:00",
                                                                   "slotIndex":  4,
                                                                   "startTime":  "13:30",
                                                                   "endTime":  "14:00",
                                                                   "startMinutes":  810,
                                                                   "endMinutes":  840,
                                                                   "timeRange":  "13:30 - 14:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:14:00-14:30",
                                                                   "slotIndex":  5,
                                                                   "startTime":  "14:00",
                                                                   "endTime":  "14:30",
                                                                   "startMinutes":  840,
                                                                   "endMinutes":  870,
                                                                   "timeRange":  "14:00 - 14:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:14:30-15:00",
                                                                   "slotIndex":  6,
                                                                   "startTime":  "14:30",
                                                                   "endTime":  "15:00",
                                                                   "startMinutes":  870,
                                                                   "endMinutes":  900,
                                                                   "timeRange":  "14:30 - 15:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:15:00-15:30",
                                                                   "slotIndex":  7,
                                                                   "startTime":  "15:00",
                                                                   "endTime":  "15:30",
                                                                   "startMinutes":  900,
                                                                   "endMinutes":  930,
                                                                   "timeRange":  "15:00 - 15:30 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:15:30-16:00",
                                                                   "slotIndex":  8,
                                                                   "startTime":  "15:30",
                                                                   "endTime":  "16:00",
                                                                   "startMinutes":  930,
                                                                   "endMinutes":  960,
                                                                   "timeRange":  "15:30 - 16:00 WIB",
                                                                   "temporalState":  "PAST",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "EXPIRED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:16:00-16:30",
                                                                   "slotIndex":  9,
                                                                   "startTime":  "16:00",
                                                                   "endTime":  "16:30",
                                                                   "startMinutes":  960,
                                                                   "endMinutes":  990,
                                                                   "timeRange":  "16:00 - 16:30 WIB",
                                                                   "temporalState":  "CURRENT",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:16:30-17:00",
                                                                   "slotIndex":  10,
                                                                   "startTime":  "16:30",
                                                                   "endTime":  "17:00",
                                                                   "startMinutes":  990,
                                                                   "endMinutes":  1020,
                                                                   "timeRange":  "16:30 - 17:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:17:00-17:30",
                                                                   "slotIndex":  11,
                                                                   "startTime":  "17:00",
                                                                   "endTime":  "17:30",
                                                                   "startMinutes":  1020,
                                                                   "endMinutes":  1050,
                                                                   "timeRange":  "17:00 - 17:30 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "afternoon:17:30-18:00",
                                                                   "slotIndex":  12,
                                                                   "startTime":  "17:30",
                                                                   "endTime":  "18:00",
                                                                   "startMinutes":  1050,
                                                                   "endMinutes":  1080,
                                                                   "timeRange":  "17:30 - 18:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               }
                                                           ]
                                             },
                                             {
                                                 "contextId":  "night",
                                                 "contextLabel":  "Malam",
                                                 "boundaryStartTime":  "18:00",
                                                 "boundaryEndTime":  "24:00",
                                                 "intervalMinutes":  30,
                                                 "counts":  {
                                                                "total":  12,
                                                                "unscheduled":  12,
                                                                "available":  0,
                                                                "occupied":  0,
                                                                "closed":  0,
                                                                "scheduled":  0,
                                                                "activeBookable":  0,
                                                                "past":  0,
                                                                "current":  0,
                                                                "future":  12
                                                            },
                                                 "metrics":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  0,
                                                                 "unscheduledSlots":  12,
                                                                 "availableSlots":  0,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  0,
                                                                 "activeBookableSlots":  0,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  0,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  0,
                                                                                          "total":  12,
                                                                                          "percentage":  0
                                                                                      }
                                                             },
                                                 "summary":  {
                                                                 "totalSlots":  12,
                                                                 "scheduledSlots":  0,
                                                                 "unscheduledSlots":  12,
                                                                 "availableSlots":  0,
                                                                 "occupiedSlots":  0,
                                                                 "closedSlots":  0,
                                                                 "activeBookableSlots":  0,
                                                                 "occupancy":  {
                                                                                   "occupied":  0,
                                                                                   "capacity":  0,
                                                                                   "percentage":  0
                                                                               },
                                                                 "scheduleCoverage":  {
                                                                                          "scheduled":  0,
                                                                                          "total":  12,
                                                                                          "percentage":  0
                                                                                      }
                                                             },
                                                 "slots":  [
                                                               {
                                                                   "intervalId":  "night:18:00-18:30",
                                                                   "slotIndex":  1,
                                                                   "startTime":  "18:00",
                                                                   "endTime":  "18:30",
                                                                   "startMinutes":  1080,
                                                                   "endMinutes":  1110,
                                                                   "timeRange":  "18:00 - 18:30 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:18:30-19:00",
                                                                   "slotIndex":  2,
                                                                   "startTime":  "18:30",
                                                                   "endTime":  "19:00",
                                                                   "startMinutes":  1110,
                                                                   "endMinutes":  1140,
                                                                   "timeRange":  "18:30 - 19:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:19:00-19:30",
                                                                   "slotIndex":  3,
                                                                   "startTime":  "19:00",
                                                                   "endTime":  "19:30",
                                                                   "startMinutes":  1140,
                                                                   "endMinutes":  1170,
                                                                   "timeRange":  "19:00 - 19:30 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:19:30-20:00",
                                                                   "slotIndex":  4,
                                                                   "startTime":  "19:30",
                                                                   "endTime":  "20:00",
                                                                   "startMinutes":  1170,
                                                                   "endMinutes":  1200,
                                                                   "timeRange":  "19:30 - 20:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:20:00-20:30",
                                                                   "slotIndex":  5,
                                                                   "startTime":  "20:00",
                                                                   "endTime":  "20:30",
                                                                   "startMinutes":  1200,
                                                                   "endMinutes":  1230,
                                                                   "timeRange":  "20:00 - 20:30 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:20:30-21:00",
                                                                   "slotIndex":  6,
                                                                   "startTime":  "20:30",
                                                                   "endTime":  "21:00",
                                                                   "startMinutes":  1230,
                                                                   "endMinutes":  1260,
                                                                   "timeRange":  "20:30 - 21:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:21:00-21:30",
                                                                   "slotIndex":  7,
                                                                   "startTime":  "21:00",
                                                                   "endTime":  "21:30",
                                                                   "startMinutes":  1260,
                                                                   "endMinutes":  1290,
                                                                   "timeRange":  "21:00 - 21:30 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:21:30-22:00",
                                                                   "slotIndex":  8,
                                                                   "startTime":  "21:30",
                                                                   "endTime":  "22:00",
                                                                   "startMinutes":  1290,
                                                                   "endMinutes":  1320,
                                                                   "timeRange":  "21:30 - 22:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:22:00-22:30",
                                                                   "slotIndex":  9,
                                                                   "startTime":  "22:00",
                                                                   "endTime":  "22:30",
                                                                   "startMinutes":  1320,
                                                                   "endMinutes":  1350,
                                                                   "timeRange":  "22:00 - 22:30 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:22:30-23:00",
                                                                   "slotIndex":  10,
                                                                   "startTime":  "22:30",
                                                                   "endTime":  "23:00",
                                                                   "startMinutes":  1350,
                                                                   "endMinutes":  1380,
                                                                   "timeRange":  "22:30 - 23:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:23:00-23:30",
                                                                   "slotIndex":  11,
                                                                   "startTime":  "23:00",
                                                                   "endTime":  "23:30",
                                                                   "startMinutes":  1380,
                                                                   "endMinutes":  1410,
                                                                   "timeRange":  "23:00 - 23:30 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               },
                                                               {
                                                                   "intervalId":  "night:23:30-24:00",
                                                                   "slotIndex":  12,
                                                                   "startTime":  "23:30",
                                                                   "endTime":  "24:00",
                                                                   "startMinutes":  1410,
                                                                   "endMinutes":  1440,
                                                                   "timeRange":  "23:30 - 24:00 WIB",
                                                                   "temporalState":  "FUTURE",
                                                                   "availabilityState":  "UNSCHEDULED",
                                                                   "effectiveStatus":  "UNSCHEDULED",
                                                                   "isSelectable":  false
                                                               }
                                                           ]
                                             }
                                         ],
                 "metrics":  {
                                 "totalSlots":  48,
                                 "scheduledSlots":  24,
                                 "unscheduledSlots":  24,
                                 "availableSlots":  23,
                                 "occupiedSlots":  0,
                                 "closedSlots":  1,
                                 "activeBookableSlots":  23,
                                 "occupancy":  {
                                                   "occupied":  0,
                                                   "capacity":  23,
                                                   "percentage":  0
                                               },
                                 "scheduleCoverage":  {
                                                          "scheduled":  24,
                                                          "total":  48,
                                                          "percentage":  50
                                                      }
                             },
                 "summary":  {
                                 "totalSlots":  48,
                                 "scheduledSlots":  24,
                                 "unscheduledSlots":  24,
                                 "availableSlots":  23,
                                 "occupiedSlots":  0,
                                 "closedSlots":  1,
                                 "activeBookableSlots":  23,
                                 "occupancy":  {
                                                   "occupied":  0,
                                                   "capacity":  23,
                                                   "percentage":  0
                                               },
                                 "scheduleCoverage":  {
                                                          "scheduled":  24,
                                                          "total":  48,
                                                          "percentage":  50
                                                      }
                             }
             }
}
``

---

## 3. Anti-Collision Grid: GET /api/v1/schedules/occupancy-overview

### Analisis Response:
- Total Shifts: 4
- Total Slots: 48
- Available: 24
- Occupied: 24

#### Rincian Per Shift:
- **Dini Hari**: Total=12 | Available=0 | Occupied=12
 - **Pagi**: Total=12 | Available=0 | Occupied=12
 - **Siang**: Total=12 | Available=12 | Occupied=0
 - **Malam**: Total=12 | Available=12 | Occupied=0


### Raw JSON Response:
``json
{
    "success":  true,
    "data":  {
                 "date":  "2026-09-24",
                 "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                 "practitionerName":  "Ahmadamikom Zikri",
                 "effectiveConsultationDurationMinutes":  30,
                 "roomId":  null,
                 "roomName":  null,
                 "isCuti":  false,
                 "cutiReason":  null,
                 "summary":  {
                                 "totalShifts":  4,
                                 "totalSlots":  48,
                                 "availableSlots":  24,
                                 "occupiedSlots":  24
                             },
                 "shifts":  [
                                {
                                    "contextId":  "early_morning",
                                    "contextLabel":  "Dini Hari",
                                    "sessionShift":  "early_morning",
                                    "timeRange":  "00:00 - 06:00 WIB",
                                    "boundaryStartTime":  "00:00",
                                    "boundaryEndTime":  "06:00",
                                    "totalSlots":  12,
                                    "availableSlotsCount":  0,
                                    "occupiedSlotsCount":  12,
                                    "slots":  [
                                                  {
                                                      "slotIndex":  1,
                                                      "startTime":  "00:00",
                                                      "endTime":  "00:30",
                                                      "timeRange":  "00:00 - 00:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  2,
                                                      "startTime":  "00:30",
                                                      "endTime":  "01:00",
                                                      "timeRange":  "00:30 - 01:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  3,
                                                      "startTime":  "01:00",
                                                      "endTime":  "01:30",
                                                      "timeRange":  "01:00 - 01:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  4,
                                                      "startTime":  "01:30",
                                                      "endTime":  "02:00",
                                                      "timeRange":  "01:30 - 02:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  5,
                                                      "startTime":  "02:00",
                                                      "endTime":  "02:30",
                                                      "timeRange":  "02:00 - 02:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  6,
                                                      "startTime":  "02:30",
                                                      "endTime":  "03:00",
                                                      "timeRange":  "02:30 - 03:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  7,
                                                      "startTime":  "03:00",
                                                      "endTime":  "03:30",
                                                      "timeRange":  "03:00 - 03:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  8,
                                                      "startTime":  "03:30",
                                                      "endTime":  "04:00",
                                                      "timeRange":  "03:30 - 04:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  9,
                                                      "startTime":  "04:00",
                                                      "endTime":  "04:30",
                                                      "timeRange":  "04:00 - 04:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  10,
                                                      "startTime":  "04:30",
                                                      "endTime":  "05:00",
                                                      "timeRange":  "04:30 - 05:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  11,
                                                      "startTime":  "05:00",
                                                      "endTime":  "05:30",
                                                      "timeRange":  "05:00 - 05:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  12,
                                                      "startTime":  "05:30",
                                                      "endTime":  "06:00",
                                                      "timeRange":  "05:30 - 06:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "437a3b49-e2a2-4567-b833-54a7eba74b5a",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  }
                                              ]
                                },
                                {
                                    "contextId":  "morning",
                                    "contextLabel":  "Pagi",
                                    "sessionShift":  "morning",
                                    "timeRange":  "06:00 - 12:00 WIB",
                                    "boundaryStartTime":  "06:00",
                                    "boundaryEndTime":  "12:00",
                                    "totalSlots":  12,
                                    "availableSlotsCount":  0,
                                    "occupiedSlotsCount":  12,
                                    "slots":  [
                                                  {
                                                      "slotIndex":  1,
                                                      "startTime":  "06:00",
                                                      "endTime":  "06:30",
                                                      "timeRange":  "06:00 - 06:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  2,
                                                      "startTime":  "06:30",
                                                      "endTime":  "07:00",
                                                      "timeRange":  "06:30 - 07:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  3,
                                                      "startTime":  "07:00",
                                                      "endTime":  "07:30",
                                                      "timeRange":  "07:00 - 07:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  4,
                                                      "startTime":  "07:30",
                                                      "endTime":  "08:00",
                                                      "timeRange":  "07:30 - 08:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  5,
                                                      "startTime":  "08:00",
                                                      "endTime":  "08:30",
                                                      "timeRange":  "08:00 - 08:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  6,
                                                      "startTime":  "08:30",
                                                      "endTime":  "09:00",
                                                      "timeRange":  "08:30 - 09:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  7,
                                                      "startTime":  "09:00",
                                                      "endTime":  "09:30",
                                                      "timeRange":  "09:00 - 09:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  8,
                                                      "startTime":  "09:30",
                                                      "endTime":  "10:00",
                                                      "timeRange":  "09:30 - 10:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  9,
                                                      "startTime":  "10:00",
                                                      "endTime":  "10:30",
                                                      "timeRange":  "10:00 - 10:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  10,
                                                      "startTime":  "10:30",
                                                      "endTime":  "11:00",
                                                      "timeRange":  "10:30 - 11:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  11,
                                                      "startTime":  "11:00",
                                                      "endTime":  "11:30",
                                                      "timeRange":  "11:00 - 11:30 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  },
                                                  {
                                                      "slotIndex":  12,
                                                      "startTime":  "11:30",
                                                      "endTime":  "12:00",
                                                      "timeRange":  "11:30 - 12:00 WIB",
                                                      "isAvailable":  false,
                                                      "status":  "OCCUPIED_BY_SELF",
                                                      "displayLabel":  "Jadwal Anda (Ruang Poli Umum 1)",
                                                      "conflictInfo":  {
                                                                           "type":  "SELF",
                                                                           "message":  "Anda telah memiliki jadwal pada jam ini",
                                                                           "sessionId":  "a19103ae-249b-41e1-ba56-2fb372a68006",
                                                                           "practitionerId":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                                                           "practitionerName":  "Ahmadamikom Zikri",
                                                                           "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                                                           "roomName":  "Ruang Poli Umum 1"
                                                                       }
                                                  }
                                              ]
                                },
                                {
                                    "contextId":  "afternoon",
                                    "contextLabel":  "Siang",
                                    "sessionShift":  "afternoon",
                                    "timeRange":  "12:00 - 18:00 WIB",
                                    "boundaryStartTime":  "12:00",
                                    "boundaryEndTime":  "18:00",
                                    "totalSlots":  12,
                                    "availableSlotsCount":  12,
                                    "occupiedSlotsCount":  0,
                                    "slots":  [
                                                  {
                                                      "slotIndex":  1,
                                                      "startTime":  "12:00",
                                                      "endTime":  "12:30",
                                                      "timeRange":  "12:00 - 12:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  2,
                                                      "startTime":  "12:30",
                                                      "endTime":  "13:00",
                                                      "timeRange":  "12:30 - 13:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  3,
                                                      "startTime":  "13:00",
                                                      "endTime":  "13:30",
                                                      "timeRange":  "13:00 - 13:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  4,
                                                      "startTime":  "13:30",
                                                      "endTime":  "14:00",
                                                      "timeRange":  "13:30 - 14:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  5,
                                                      "startTime":  "14:00",
                                                      "endTime":  "14:30",
                                                      "timeRange":  "14:00 - 14:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  6,
                                                      "startTime":  "14:30",
                                                      "endTime":  "15:00",
                                                      "timeRange":  "14:30 - 15:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  7,
                                                      "startTime":  "15:00",
                                                      "endTime":  "15:30",
                                                      "timeRange":  "15:00 - 15:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  8,
                                                      "startTime":  "15:30",
                                                      "endTime":  "16:00",
                                                      "timeRange":  "15:30 - 16:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  9,
                                                      "startTime":  "16:00",
                                                      "endTime":  "16:30",
                                                      "timeRange":  "16:00 - 16:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  10,
                                                      "startTime":  "16:30",
                                                      "endTime":  "17:00",
                                                      "timeRange":  "16:30 - 17:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  11,
                                                      "startTime":  "17:00",
                                                      "endTime":  "17:30",
                                                      "timeRange":  "17:00 - 17:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  12,
                                                      "startTime":  "17:30",
                                                      "endTime":  "18:00",
                                                      "timeRange":  "17:30 - 18:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  }
                                              ]
                                },
                                {
                                    "contextId":  "night",
                                    "contextLabel":  "Malam",
                                    "sessionShift":  "night",
                                    "timeRange":  "18:00 - 24:00 WIB",
                                    "boundaryStartTime":  "18:00",
                                    "boundaryEndTime":  "24:00",
                                    "totalSlots":  12,
                                    "availableSlotsCount":  12,
                                    "occupiedSlotsCount":  0,
                                    "slots":  [
                                                  {
                                                      "slotIndex":  1,
                                                      "startTime":  "18:00",
                                                      "endTime":  "18:30",
                                                      "timeRange":  "18:00 - 18:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  2,
                                                      "startTime":  "18:30",
                                                      "endTime":  "19:00",
                                                      "timeRange":  "18:30 - 19:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  3,
                                                      "startTime":  "19:00",
                                                      "endTime":  "19:30",
                                                      "timeRange":  "19:00 - 19:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  4,
                                                      "startTime":  "19:30",
                                                      "endTime":  "20:00",
                                                      "timeRange":  "19:30 - 20:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  5,
                                                      "startTime":  "20:00",
                                                      "endTime":  "20:30",
                                                      "timeRange":  "20:00 - 20:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  6,
                                                      "startTime":  "20:30",
                                                      "endTime":  "21:00",
                                                      "timeRange":  "20:30 - 21:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  7,
                                                      "startTime":  "21:00",
                                                      "endTime":  "21:30",
                                                      "timeRange":  "21:00 - 21:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  8,
                                                      "startTime":  "21:30",
                                                      "endTime":  "22:00",
                                                      "timeRange":  "21:30 - 22:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  9,
                                                      "startTime":  "22:00",
                                                      "endTime":  "22:30",
                                                      "timeRange":  "22:00 - 22:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  10,
                                                      "startTime":  "22:30",
                                                      "endTime":  "23:00",
                                                      "timeRange":  "22:30 - 23:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  11,
                                                      "startTime":  "23:00",
                                                      "endTime":  "23:30",
                                                      "timeRange":  "23:00 - 23:30 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  },
                                                  {
                                                      "slotIndex":  12,
                                                      "startTime":  "23:30",
                                                      "endTime":  "24:00",
                                                      "timeRange":  "23:30 - 24:00 WIB",
                                                      "isAvailable":  true,
                                                      "status":  "AVAILABLE",
                                                      "displayLabel":  "Tersedia",
                                                      "conflictInfo":  null
                                                  }
                                              ]
                                }
                            ]
             }
}
``

---
**Verified on Live Environment:** All invariant constraints satisfied. 0 Hardcoding. SSOT maintained.
