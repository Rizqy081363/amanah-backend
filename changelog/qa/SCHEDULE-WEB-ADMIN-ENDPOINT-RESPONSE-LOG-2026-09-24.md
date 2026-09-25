# Schedule Web Admin Endpoint E2E Response Log

**Generated at:** 2026-09-24 11:06:22 +07:00

**Base URL:** http://localhost:3001

**Practitioner under test:** 77bbb45a-18df-4311-b2a4-a4b6f22870ca

**Contract:** persistent status is only 'open | closed'; API effective status is only 'OPEN | OCCUPIED | CLOSED'; mutation status is only 'OPEN | CLOSED'.

## 01\. Admin Filter Options

```http
GET /api/v1/admin/doctor-schedules/filter-options
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "poliklinik":  \[
                                    {
                                        "id":  "c4fdf447-ff4a-4298-81a9-24fdd55839c5",
                                        "name":  "Front Desk",
                                        "code":  "front\_desk"
                                    },
                                    {
                                        "id":  "dfb1dd2c-9635-441d-86c2-d117a4ee123d",
                                        "name":  "IT Support",
                                        "code":  "it\_support"
                                    },
                                    {
                                        "id":  "c7df1666-5bb1-4c89-b0f7-9d62a6b96c75",
                                        "name":  "Poli KIA",
                                        "code":  "poli\_kia"
                                    },
                                    {
                                        "id":  "53fa8088-46c8-4611-9dea-99a54f4a45ab",
                                        "name":  "Poli Umum",
                                        "code":  "poli\_umum"
                                    }
                                ],
                 "spesialisasi":  \[
                                      {
                                          "id":  "2a39817d-5709-4acd-af18-124f1e18c716",
                                          "name":  "Dokter Umum",
                                          "code":  "general\_practitioner"
                                      },
                                      {
                                          "id":  "cfeeec0a-0f60-4226-b68b-4e0857837ca0",
                                          "name":  "Kesehatan Ibu dan Anak",
                                          "code":  "maternal\_child\_health"
                                      }
                                  ],
                 "statuses":  \[
                                  {
                                      "id":  "OPEN",
                                      "label":  "Buka"
                                  },
                                  {
                                      "id":  "OCCUPIED",
                                      "label":  "Terisi"
                                  },
                                  {
                                      "id":  "CLOSED",
                                      "label":  "Tutup"
                                  }
                              ]
             }
}
```

## 02\. Admin Doctor Schedule Cards - 2026-09-24

```http
GET /api/v1/admin/doctor-schedules?date=2026-09-24\&page=1\&limit=6
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "doctors":  \[
                                 {
                                     "id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                     "practitioner\_id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                     "nama\_dokter":  "Ahmadamikom Zikri",
                                     "spesialisasi":  "Poli Umum",
                                     "status\_dokter":  "CLOSED",
                                     "email":  "zikriahmadamikom@gmail.com",
                                     "nomor\_telepon":  null,
                                     "ruang\_praktik":  "Ruang KIA 1, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341",
                                     "slot\_tersedia":  0,
                                     "kapasitas\_per\_hari":  0,
                                     "jadwal\_hari\_ini":  "-",
                                     "jadwal\_praktik\_mendatang":  "Praktik Ditutup",
                                     "slot\_terisi\_akumulasi":  0,
                                     "slot\_kapasitas\_akumulasi":  0,
                                     "display\_akumulasi\_slot":  "-",
                                     "status\_jadwal":  "CLOSED",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "c2fa71a1-2679-4c23-a3e5-39c7631bcdfb",
                                                             "nama\_sesi":  "Dini Hari",
                                                             "jam\_mulai":  "00:00",
                                                             "jam\_selesai":  "00:30",
                                                             "waktu":  "00:00 - 00:30",
                                                             "kuota\_pasien":  1,
                                                             "slot\_tersedia":  0,
                                                             "status\_sesi":  "CLOSED",
                                                             "ruang":  "Ruang KIA 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  false,
                                                             "reschedule\_ineligibility\_reason":  "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
                                                         },
                                                         {
                                                             "id":  "4948efcd-ef50-486d-b9eb-2120d378f569",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "06:00",
                                                             "jam\_selesai":  "06:30",
                                                             "waktu":  "06:00 - 06:30",
                                                             "kuota\_pasien":  1,
                                                             "slot\_tersedia":  0,
                                                             "status\_sesi":  "CLOSED",
                                                             "ruang":  "Ruang KIA 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  false,
                                                             "reschedule\_ineligibility\_reason":  "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "b6306708-d7fe-4af7-818c-b042310573eb",
                                     "practitioner\_id":  "b6306708-d7fe-4af7-818c-b042310573eb",
                                     "nama\_dokter":  "Bdn. Laras Wulandari",
                                     "spesialisasi":  "Kesehatan Ibu dan Anak",
                                     "status\_dokter":  "OPEN",
                                     "email":  "bidan.laras@amanah-healthcare.test",
                                     "nomor\_telepon":  "6281200000006",
                                     "ruang\_praktik":  "Ruang KIA 2, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  10,
                                     "kapasitas\_per\_hari":  12,
                                     "jadwal\_hari\_ini":  "08:00 - 11:30",
                                     "jadwal\_praktik\_mendatang":  "Pagi (08:00 - 11:30) - Sedang Berlangsung",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  12,
                                     "display\_akumulasi\_slot":  "2 / 12",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "5d8c6a6e-a81f-4ed4-816a-27dea12e024e",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "08:00",
                                                             "jam\_selesai":  "11:30",
                                                             "waktu":  "08:00 - 11:30",
                                                             "kuota\_pasien":  12,
                                                             "slot\_tersedia":  10,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang KIA 2, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "2e5b90fd-1ffb-4cdf-aa0c-f13a834a0816",
                                     "practitioner\_id":  "2e5b90fd-1ffb-4cdf-aa0c-f13a834a0816",
                                     "nama\_dokter":  "Bdn. Siti Rahmawati",
                                     "spesialisasi":  "Kesehatan Ibu dan Anak",
                                     "status\_dokter":  "OPEN",
                                     "email":  "bidan.siti@amanah-healthcare.test",
                                     "nomor\_telepon":  "6281200000005",
                                     "ruang\_praktik":  "Ruang KIA 2, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  8,
                                     "kapasitas\_per\_hari":  10,
                                     "jadwal\_hari\_ini":  "13:00 - 16:30",
                                     "jadwal\_praktik\_mendatang":  "Siang (13:00 - 16:30)",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  10,
                                     "display\_akumulasi\_slot":  "2 / 10",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "92f46d65-efd5-446c-a611-fad925aa248b",
                                                             "nama\_sesi":  "Siang",
                                                             "jam\_mulai":  "13:00",
                                                             "jam\_selesai":  "16:30",
                                                             "waktu":  "13:00 - 16:30",
                                                             "kuota\_pasien":  10,
                                                             "slot\_tersedia":  8,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang KIA 2, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "cfc88fab-46f8-4e71-bf72-00858ea0c885",
                                     "practitioner\_id":  "cfc88fab-46f8-4e71-bf72-00858ea0c885",
                                     "nama\_dokter":  "Bdn. Siti Rahmawati",
                                     "spesialisasi":  "Kesehatan Ibu dan Anak",
                                     "status\_dokter":  "OPEN",
                                     "email":  "bidan@amanah.com",
                                     "nomor\_telepon":  "6281298765432",
                                     "ruang\_praktik":  "Ruang KIA 2, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  8,
                                     "kapasitas\_per\_hari":  8,
                                     "jadwal\_hari\_ini":  "18:00 - 20:30",
                                     "jadwal\_praktik\_mendatang":  "Malam (18:00 - 20:30)",
                                     "slot\_terisi\_akumulasi":  0,
                                     "slot\_kapasitas\_akumulasi":  8,
                                     "display\_akumulasi\_slot":  "0 / 8",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "ed034fc5-26a6-49df-b54e-ff895a07de3d",
                                                             "nama\_sesi":  "Malam",
                                                             "jam\_mulai":  "18:00",
                                                             "jam\_selesai":  "20:30",
                                                             "waktu":  "18:00 - 20:30",
                                                             "kuota\_pasien":  8,
                                                             "slot\_tersedia":  8,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang KIA 2, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
                                     "practitioner\_id":  "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
                                     "nama\_dokter":  "dr. Ahmad Santoso",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "OPEN",
                                     "email":  "dr.ahmad@amanah-healthcare.test",
                                     "nomor\_telepon":  "6281200000002",
                                     "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  10,
                                     "kapasitas\_per\_hari":  12,
                                     "jadwal\_hari\_ini":  "08:00 - 11:30",
                                     "jadwal\_praktik\_mendatang":  "Pagi (08:00 - 11:30) - Sedang Berlangsung",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  12,
                                     "display\_akumulasi\_slot":  "2 / 12",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "6f8383c2-79fc-4bde-938f-67c722d14b43",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "08:00",
                                                             "jam\_selesai":  "11:30",
                                                             "waktu":  "08:00 - 11:30",
                                                             "kuota\_pasien":  12,
                                                             "slot\_tersedia":  10,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                                     "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                                     "nama\_dokter":  "dr. Ahmad Santoso",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "OPEN",
                                     "email":  "dokter@amanah.com",
                                     "nomor\_telepon":  "6281234567890",
                                     "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  18,
                                     "kapasitas\_per\_hari":  20,
                                     "jadwal\_hari\_ini":  "08:00 - 12:00",
                                     "jadwal\_praktik\_mendatang":  "Pagi (08:00 - 12:00) - Sedang Berlangsung",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  20,
                                     "display\_akumulasi\_slot":  "2 / 20",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "d3b9740e-69ce-46de-83ae-679915377a27",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "08:00",
                                                             "jam\_selesai":  "12:00",
                                                             "waktu":  "08:00 - 12:00",
                                                             "kuota\_pasien":  20,
                                                             "slot\_tersedia":  18,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 }
                             ],
                 "meta":  {
                              "page":  1,
                              "limit":  6,
                              "total\_doctors":  11,
                              "total\_pages":  2
                          }
             }
}
```

## 03\. Admin Doctor Schedule Cards Filtered by OPEN

```http
GET /api/v1/admin/doctor-schedules?date=2026-09-24\&status=OPEN\&page=1\&limit=6
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "doctors":  \[
                                 {
                                     "id":  "b6306708-d7fe-4af7-818c-b042310573eb",
                                     "practitioner\_id":  "b6306708-d7fe-4af7-818c-b042310573eb",
                                     "nama\_dokter":  "Bdn. Laras Wulandari",
                                     "spesialisasi":  "Kesehatan Ibu dan Anak",
                                     "status\_dokter":  "OPEN",
                                     "email":  "bidan.laras@amanah-healthcare.test",
                                     "nomor\_telepon":  "6281200000006",
                                     "ruang\_praktik":  "Ruang KIA 2, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  10,
                                     "kapasitas\_per\_hari":  12,
                                     "jadwal\_hari\_ini":  "08:00 - 11:30",
                                     "jadwal\_praktik\_mendatang":  "Pagi (08:00 - 11:30) - Sedang Berlangsung",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  12,
                                     "display\_akumulasi\_slot":  "2 / 12",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "5d8c6a6e-a81f-4ed4-816a-27dea12e024e",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "08:00",
                                                             "jam\_selesai":  "11:30",
                                                             "waktu":  "08:00 - 11:30",
                                                             "kuota\_pasien":  12,
                                                             "slot\_tersedia":  10,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang KIA 2, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "2e5b90fd-1ffb-4cdf-aa0c-f13a834a0816",
                                     "practitioner\_id":  "2e5b90fd-1ffb-4cdf-aa0c-f13a834a0816",
                                     "nama\_dokter":  "Bdn. Siti Rahmawati",
                                     "spesialisasi":  "Kesehatan Ibu dan Anak",
                                     "status\_dokter":  "OPEN",
                                     "email":  "bidan.siti@amanah-healthcare.test",
                                     "nomor\_telepon":  "6281200000005",
                                     "ruang\_praktik":  "Ruang KIA 2, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  8,
                                     "kapasitas\_per\_hari":  10,
                                     "jadwal\_hari\_ini":  "13:00 - 16:30",
                                     "jadwal\_praktik\_mendatang":  "Siang (13:00 - 16:30)",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  10,
                                     "display\_akumulasi\_slot":  "2 / 10",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "92f46d65-efd5-446c-a611-fad925aa248b",
                                                             "nama\_sesi":  "Siang",
                                                             "jam\_mulai":  "13:00",
                                                             "jam\_selesai":  "16:30",
                                                             "waktu":  "13:00 - 16:30",
                                                             "kuota\_pasien":  10,
                                                             "slot\_tersedia":  8,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang KIA 2, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "cfc88fab-46f8-4e71-bf72-00858ea0c885",
                                     "practitioner\_id":  "cfc88fab-46f8-4e71-bf72-00858ea0c885",
                                     "nama\_dokter":  "Bdn. Siti Rahmawati",
                                     "spesialisasi":  "Kesehatan Ibu dan Anak",
                                     "status\_dokter":  "OPEN",
                                     "email":  "bidan@amanah.com",
                                     "nomor\_telepon":  "6281298765432",
                                     "ruang\_praktik":  "Ruang KIA 2, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  8,
                                     "kapasitas\_per\_hari":  8,
                                     "jadwal\_hari\_ini":  "18:00 - 20:30",
                                     "jadwal\_praktik\_mendatang":  "Malam (18:00 - 20:30)",
                                     "slot\_terisi\_akumulasi":  0,
                                     "slot\_kapasitas\_akumulasi":  8,
                                     "display\_akumulasi\_slot":  "0 / 8",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "ed034fc5-26a6-49df-b54e-ff895a07de3d",
                                                             "nama\_sesi":  "Malam",
                                                             "jam\_mulai":  "18:00",
                                                             "jam\_selesai":  "20:30",
                                                             "waktu":  "18:00 - 20:30",
                                                             "kuota\_pasien":  8,
                                                             "slot\_tersedia":  8,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang KIA 2, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
                                     "practitioner\_id":  "e0d4d8c5-412d-4915-8b4c-b06b9d84ac65",
                                     "nama\_dokter":  "dr. Ahmad Santoso",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "OPEN",
                                     "email":  "dr.ahmad@amanah-healthcare.test",
                                     "nomor\_telepon":  "6281200000002",
                                     "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  10,
                                     "kapasitas\_per\_hari":  12,
                                     "jadwal\_hari\_ini":  "08:00 - 11:30",
                                     "jadwal\_praktik\_mendatang":  "Pagi (08:00 - 11:30) - Sedang Berlangsung",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  12,
                                     "display\_akumulasi\_slot":  "2 / 12",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "6f8383c2-79fc-4bde-938f-67c722d14b43",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "08:00",
                                                             "jam\_selesai":  "11:30",
                                                             "waktu":  "08:00 - 11:30",
                                                             "kuota\_pasien":  12,
                                                             "slot\_tersedia":  10,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                                     "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                                     "nama\_dokter":  "dr. Ahmad Santoso",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "OPEN",
                                     "email":  "dokter@amanah.com",
                                     "nomor\_telepon":  "6281234567890",
                                     "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  18,
                                     "kapasitas\_per\_hari":  20,
                                     "jadwal\_hari\_ini":  "08:00 - 12:00",
                                     "jadwal\_praktik\_mendatang":  "Pagi (08:00 - 12:00) - Sedang Berlangsung",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  20,
                                     "display\_akumulasi\_slot":  "2 / 20",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "d3b9740e-69ce-46de-83ae-679915377a27",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "08:00",
                                                             "jam\_selesai":  "12:00",
                                                             "waktu":  "08:00 - 12:00",
                                                             "kuota\_pasien":  20,
                                                             "slot\_tersedia":  18,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "ea70f2d2-6471-49da-8797-49b315388687",
                                     "practitioner\_id":  "ea70f2d2-6471-49da-8797-49b315388687",
                                     "nama\_dokter":  "dr. Maya Putri",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "OPEN",
                                     "email":  "dr.maya@amanah-healthcare.test",
                                     "nomor\_telepon":  "6281200000003",
                                     "ruang\_praktik":  "Ruang Poli Umum 2, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  10,
                                     "kapasitas\_per\_hari":  12,
                                     "jadwal\_hari\_ini":  "08:00 - 11:30",
                                     "jadwal\_praktik\_mendatang":  "Pagi (08:00 - 11:30) - Sedang Berlangsung",
                                     "slot\_terisi\_akumulasi":  2,
                                     "slot\_kapasitas\_akumulasi":  12,
                                     "display\_akumulasi\_slot":  "2 / 12",
                                     "status\_jadwal":  "OPEN",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "18dd8e74-c4a6-418f-b137-9c29f03ac3a3",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "08:00",
                                                             "jam\_selesai":  "11:30",
                                                             "waktu":  "08:00 - 11:30",
                                                             "kuota\_pasien":  12,
                                                             "slot\_tersedia":  10,
                                                             "status\_sesi":  "OPEN",
                                                             "ruang":  "Ruang Poli Umum 2, Gedung Utama",
                                                             "is\_reschedule\_eligible":  true,
                                                             "reschedule\_ineligibility\_reason":  null
                                                         }
                                                     ]
                                 }
                             ],
                 "meta":  {
                              "page":  1,
                              "limit":  6,
                              "total\_doctors":  7,
                              "total\_pages":  2
                          }
             }
}
```

## 04\. Admin Doctor Schedule Cards Filtered by OCCUPIED

```http
GET /api/v1/admin/doctor-schedules?date=2026-09-24\&status=OCCUPIED\&page=1\&limit=6
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "doctors":  \[

                             ],
                 "meta":  {
                              "page":  1,
                              "limit":  6,
                              "total\_doctors":  0,
                              "total\_pages":  1
                          }
             }
}
```

## 05\. Admin Doctor Schedule Cards Filtered by CLOSED

```http
GET /api/v1/admin/doctor-schedules?date=2026-09-24\&status=CLOSED\&page=1\&limit=6
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "doctors":  \[
                                 {
                                     "id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                     "practitioner\_id":  "c518facb-372e-4f07-9766-f3eacf54221f",
                                     "nama\_dokter":  "Ahmadamikom Zikri",
                                     "spesialisasi":  "Poli Umum",
                                     "status\_dokter":  "CLOSED",
                                     "email":  "zikriahmadamikom@gmail.com",
                                     "nomor\_telepon":  null,
                                     "ruang\_praktik":  "Ruang KIA 1, Gedung Utama",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "/api/v1/users/3cb62e10-450b-43e5-aba9-49ec37079ebb/avatar?v=1790174908341",
                                     "slot\_tersedia":  0,
                                     "kapasitas\_per\_hari":  0,
                                     "jadwal\_hari\_ini":  "-",
                                     "jadwal\_praktik\_mendatang":  "Praktik Ditutup",
                                     "slot\_terisi\_akumulasi":  0,
                                     "slot\_kapasitas\_akumulasi":  0,
                                     "display\_akumulasi\_slot":  "-",
                                     "status\_jadwal":  "CLOSED",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[
                                                         {
                                                             "id":  "c2fa71a1-2679-4c23-a3e5-39c7631bcdfb",
                                                             "nama\_sesi":  "Dini Hari",
                                                             "jam\_mulai":  "00:00",
                                                             "jam\_selesai":  "00:30",
                                                             "waktu":  "00:00 - 00:30",
                                                             "kuota\_pasien":  1,
                                                             "slot\_tersedia":  0,
                                                             "status\_sesi":  "CLOSED",
                                                             "ruang":  "Ruang KIA 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  false,
                                                             "reschedule\_ineligibility\_reason":  "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
                                                         },
                                                         {
                                                             "id":  "4948efcd-ef50-486d-b9eb-2120d378f569",
                                                             "nama\_sesi":  "Pagi",
                                                             "jam\_mulai":  "06:00",
                                                             "jam\_selesai":  "06:30",
                                                             "waktu":  "06:00 - 06:30",
                                                             "kuota\_pasien":  1,
                                                             "slot\_tersedia":  0,
                                                             "status\_sesi":  "CLOSED",
                                                             "ruang":  "Ruang KIA 1, Gedung Utama",
                                                             "is\_reschedule\_eligible":  false,
                                                             "reschedule\_ineligibility\_reason":  "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
                                                         }
                                                     ]
                                 },
                                 {
                                     "id":  "c8ea1b11-26c7-47a4-9669-803476114fdb",
                                     "practitioner\_id":  "c8ea1b11-26c7-47a4-9669-803476114fdb",
                                     "nama\_dokter":  "dr. Zikri Ahmad, Sp.A",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "CLOSED",
                                     "email":  "pasien@amanah.com",
                                     "nomor\_telepon":  "+6281234567899",
                                     "ruang\_praktik":  "Belum Ditentukan",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  0,
                                     "kapasitas\_per\_hari":  0,
                                     "jadwal\_hari\_ini":  "-",
                                     "jadwal\_praktik\_mendatang":  "Tidak Ada Jadwal",
                                     "slot\_terisi\_akumulasi":  0,
                                     "slot\_kapasitas\_akumulasi":  0,
                                     "display\_akumulasi\_slot":  "-",
                                     "status\_jadwal":  "CLOSED",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[

                                                     ]
                                 },
                                 {
                                     "id":  "7e7d473d-3771-4784-aedf-8e3bafded51c",
                                     "practitioner\_id":  "7e7d473d-3771-4784-aedf-8e3bafded51c",
                                     "nama\_dokter":  "fadhiilah ahmad zikri",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "CLOSED",
                                     "email":  "zikridokter@gmail.com",
                                     "nomor\_telepon":  "0866363737",
                                     "ruang\_praktik":  "Belum Ditentukan",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "/api/v1/users/187b7e82-cf55-4858-854c-bc8ff1e2b5b2/avatar?v=1790106030084",
                                     "slot\_tersedia":  0,
                                     "kapasitas\_per\_hari":  0,
                                     "jadwal\_hari\_ini":  "-",
                                     "jadwal\_praktik\_mendatang":  "Tidak Ada Jadwal",
                                     "slot\_terisi\_akumulasi":  0,
                                     "slot\_kapasitas\_akumulasi":  0,
                                     "display\_akumulasi\_slot":  "-",
                                     "status\_jadwal":  "CLOSED",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[

                                                     ]
                                 },
                                 {
                                     "id":  "f996d696-30c8-4fcf-ba77-babfd7c36dca",
                                     "practitioner\_id":  "f996d696-30c8-4fcf-ba77-babfd7c36dca",
                                     "nama\_dokter":  "mobile test",
                                     "spesialisasi":  "Dokter Umum",
                                     "status\_dokter":  "CLOSED",
                                     "email":  "mobiletest1@gmail.com",
                                     "nomor\_telepon":  "08737874838392",
                                     "ruang\_praktik":  "Belum Ditentukan",
                                     "tanggal\_praktik":  "Kamis, 24 Sep 2026",
                                     "avatar":  "",
                                     "slot\_tersedia":  0,
                                     "kapasitas\_per\_hari":  0,
                                     "jadwal\_hari\_ini":  "-",
                                     "jadwal\_praktik\_mendatang":  "Tidak Ada Jadwal",
                                     "slot\_terisi\_akumulasi":  0,
                                     "slot\_kapasitas\_akumulasi":  0,
                                     "display\_akumulasi\_slot":  "-",
                                     "status\_jadwal":  "CLOSED",
                                     "bulan\_jadwal":  "September 2026",
                                     "is\_cuti":  false,
                                     "cuti\_reason":  null,
                                     "cuti\_start":  null,
                                     "cuti\_end":  null,
                                     "sesi\_harian":  \[

                                                     ]
                                 }
                             ],
                 "meta":  {
                              "page":  1,
                              "limit":  6,
                              "total\_doctors":  4,
                              "total\_pages":  1
                          }
             }
}
```

## 06\. Admin Doctor Schedule Detail - Calendar, Sessions, Timeline

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca?date=2026-09-24\&month=2026-09
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "nama\_dokter":  "dr. Ahmad Santoso",
                 "spesialisasi":  "Dokter Umum",
                 "status\_dokter":  "OPEN",
                 "email":  "dokter@amanah.com",
                 "nomor\_telepon":  "6281234567890",
                 "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                 "avatar":  "",
                 "slot\_tersedia":  18,
                 "kapasitas\_per\_hari":  20,
                 "bulan\_jadwal":  "September 2026",
                 "is\_cuti":  false,
                 "cuti\_reason":  null,
                 "cuti\_start":  null,
                 "cuti\_end":  null,
                 "monthly\_schedule":  \[
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
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  21,
                                              "date":  "2026-09-21",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  22,
                                              "date":  "2026-09-22",
                                              "status":  "OPEN",
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
                 "sesi\_harian":  \[
                                     {
                                         "id":  "d3b9740e-69ce-46de-83ae-679915377a27",
                                         "nama\_sesi":  "Pagi",
                                         "jam\_mulai":  "08:00",
                                         "jam\_selesai":  "12:00",
                                         "waktu":  "08:00 - 12:00",
                                         "kuota\_pasien":  20,
                                         "slot\_tersedia":  18,
                                         "status\_sesi":  "OPEN",
                                         "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                         "is\_reschedule\_eligible":  true,
                                         "reschedule\_ineligibility\_reason":  null
                                     }
                                 ],
                 "timeline\_intervals":  \[
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:08:00-08:30",
                                                "intervalIndex":  1,
                                                "startTime":  "08:00",
                                                "endTime":  "08:30",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:08:30-09:00",
                                                "intervalIndex":  2,
                                                "startTime":  "08:30",
                                                "endTime":  "09:00",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:09:00-09:30",
                                                "intervalIndex":  3,
                                                "startTime":  "09:00",
                                                "endTime":  "09:30",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:09:30-10:00",
                                                "intervalIndex":  4,
                                                "startTime":  "09:30",
                                                "endTime":  "10:00",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:10:00-10:30",
                                                "intervalIndex":  5,
                                                "startTime":  "10:00",
                                                "endTime":  "10:30",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:10:30-11:00",
                                                "intervalIndex":  6,
                                                "startTime":  "10:30",
                                                "endTime":  "11:00",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:11:00-11:30",
                                                "intervalIndex":  7,
                                                "startTime":  "11:00",
                                                "endTime":  "11:30",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "d3b9740e-69ce-46de-83ae-679915377a27:11:30-12:00",
                                                "intervalIndex":  8,
                                                "startTime":  "11:30",
                                                "endTime":  "12:00",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            }
                                        ]
             }
}
```

## 07\. Admin Update Effective Consultation Duration

```http
PATCH /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/duration
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Request body:

```json
{
    "startPrecisionMinutes":  1,
    "consultationDurationMinutes":  30
}
```

Response body:

```json
{
    "value":  \[
                  {
                      "contextId":  "early\_morning",
                      "contextLabel":  "Dini Hari",
                      "sessionShift":  "early\_morning",
                      "date":  "2026-09-24",
                      "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                      "boundaryStartTime":  "00:00",
                      "boundaryEndTime":  "06:00",
                      "allowedStartPrecisionMinutes":  1,
                      "timezone":  "Asia/Jakarta",
                      "effectiveConsultationDurationMinutes":  30,
                      "durationSource":  "PRACTITIONER\_CONFIG",
                      "durationScope":  "practitioner-specific",
                      "durationEditableByCurrentUser":  true
                  },
                  {
                      "contextId":  "morning",
                      "contextLabel":  "Pagi",
                      "sessionShift":  "morning",
                      "date":  "2026-09-24",
                      "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                      "boundaryStartTime":  "06:00",
                      "boundaryEndTime":  "12:00",
                      "allowedStartPrecisionMinutes":  1,
                      "timezone":  "Asia/Jakarta",
                      "effectiveConsultationDurationMinutes":  30,
                      "durationSource":  "PRACTITIONER\_CONFIG",
                      "durationScope":  "practitioner-specific",
                      "durationEditableByCurrentUser":  true
                  },
                  {
                      "contextId":  "afternoon",
                      "contextLabel":  "Siang",
                      "sessionShift":  "afternoon",
                      "date":  "2026-09-24",
                      "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                      "boundaryStartTime":  "12:00",
                      "boundaryEndTime":  "17:00",
                      "allowedStartPrecisionMinutes":  1,
                      "timezone":  "Asia/Jakarta",
                      "effectiveConsultationDurationMinutes":  30,
                      "durationSource":  "PRACTITIONER\_CONFIG",
                      "durationScope":  "practitioner-specific",
                      "durationEditableByCurrentUser":  true
                  },
                  {
                      "contextId":  "night",
                      "contextLabel":  "Malam",
                      "sessionShift":  "night",
                      "date":  "2026-09-24",
                      "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                      "boundaryStartTime":  "17:00",
                      "boundaryEndTime":  "21:00",
                      "allowedStartPrecisionMinutes":  1,
                      "timezone":  "Asia/Jakarta",
                      "effectiveConsultationDurationMinutes":  30,
                      "durationSource":  "PRACTITIONER\_CONFIG",
                      "durationScope":  "practitioner-specific",
                      "durationEditableByCurrentUser":  true
                  }
              ],
    "Count":  4
}
```

## 08\. Admin Create Doctor Session

```http
POST /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 201
```

Request body:

```json
{
    "jam\_mulai":  "08:00",
    "schedule\_date":  "2026-12-10",
    "kuota\_pasien":  4,
    "nama\_sesi":  "Sesi Pagi Evidence",
    "slot\_tersedia":  4,
    "jam\_selesai":  "10:00",
    "status\_sesi":  "OPEN"
}
```

Response body:

```json
{
    "success":  true,
    "message":  "Sesi jadwal berhasil ditambahkan",
    "data":  {
                 "id":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                 "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "daySettingId":  null,
                 "serviceId":  null,
                 "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                 "scheduleDate":  "2026-12-10",
                 "sessionLabel":  "Sesi Pagi Evidence",
                 "sessionShift":  "morning",
                 "startTime":  "08:00:00",
                 "endTime":  "10:00:00",
                 "capacity":  4,
                 "availableSlots":  4,
                 "status":  "open",
                 "notes":  null,
                 "createdAt":  "2026-09-24 11:06:22.368501+07",
                 "updatedAt":  "2026-09-24 11:06:22.368501+07"
             }
}
```

## 09\. Admin Update Doctor Session

```http
PATCH /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Request body:

```json
{
    "kuota\_pasien":  4,
    "slot\_tersedia":  2,
    "nama\_sesi":  "Sesi Pagi Evidence Updated",
    "status\_sesi":  "OPEN"
}
```

Response body:

```json
{
    "success":  true,
    "message":  "Sesi jadwal berhasil diperbarui",
    "data":  {
                 "id":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                 "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "daySettingId":  null,
                 "serviceId":  null,
                 "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                 "scheduleDate":  "2026-12-10",
                 "sessionLabel":  "Sesi Pagi Evidence Updated",
                 "sessionShift":  "morning",
                 "startTime":  "08:00:00",
                 "endTime":  "10:00:00",
                 "capacity":  4,
                 "availableSlots":  2,
                 "status":  "open",
                 "notes":  null,
                 "createdAt":  "2026-09-24 11:06:22.368501+07",
                 "updatedAt":  "2026-09-24 11:06:22.38942+07"
             }
}
```

## 10\. Admin Detail After Session + Patients Seed

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca?date=2026-12-10\&month=2026-12
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "nama\_dokter":  "dr. Ahmad Santoso",
                 "spesialisasi":  "Dokter Umum",
                 "status\_dokter":  "OPEN",
                 "email":  "dokter@amanah.com",
                 "nomor\_telepon":  "6281234567890",
                 "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                 "avatar":  "",
                 "slot\_tersedia":  2,
                 "kapasitas\_per\_hari":  4,
                 "bulan\_jadwal":  "Desember 2026",
                 "is\_cuti":  false,
                 "cuti\_reason":  null,
                 "cuti\_start":  null,
                 "cuti\_end":  null,
                 "monthly\_schedule":  \[
                                          {
                                              "day":  1,
                                              "date":  "2026-12-01",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  2,
                                              "date":  "2026-12-02",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  3,
                                              "date":  "2026-12-03",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  4,
                                              "date":  "2026-12-04",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  5,
                                              "date":  "2026-12-05",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  6,
                                              "date":  "2026-12-06",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  7,
                                              "date":  "2026-12-07",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  8,
                                              "date":  "2026-12-08",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  9,
                                              "date":  "2026-12-09",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  10,
                                              "date":  "2026-12-10",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  11,
                                              "date":  "2026-12-11",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  12,
                                              "date":  "2026-12-12",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  13,
                                              "date":  "2026-12-13",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  14,
                                              "date":  "2026-12-14",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  15,
                                              "date":  "2026-12-15",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  16,
                                              "date":  "2026-12-16",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  17,
                                              "date":  "2026-12-17",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  18,
                                              "date":  "2026-12-18",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  19,
                                              "date":  "2026-12-19",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  20,
                                              "date":  "2026-12-20",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  21,
                                              "date":  "2026-12-21",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  22,
                                              "date":  "2026-12-22",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  23,
                                              "date":  "2026-12-23",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  24,
                                              "date":  "2026-12-24",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  25,
                                              "date":  "2026-12-25",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  26,
                                              "date":  "2026-12-26",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  27,
                                              "date":  "2026-12-27",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  28,
                                              "date":  "2026-12-28",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  29,
                                              "date":  "2026-12-29",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  30,
                                              "date":  "2026-12-30",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  31,
                                              "date":  "2026-12-31",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          }
                                      ],
                 "sesi\_harian":  \[
                                     {
                                         "id":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                                         "nama\_sesi":  "Sesi Pagi Evidence Updated",
                                         "jam\_mulai":  "08:00",
                                         "jam\_selesai":  "10:00",
                                         "waktu":  "08:00 - 10:00",
                                         "kuota\_pasien":  4,
                                         "slot\_tersedia":  2,
                                         "status\_sesi":  "OPEN",
                                         "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                         "is\_reschedule\_eligible":  true,
                                         "reschedule\_ineligibility\_reason":  null
                                     }
                                 ],
                 "timeline\_intervals":  \[
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:08:00-08:30",
                                                "intervalIndex":  1,
                                                "startTime":  "08:00",
                                                "endTime":  "08:30",
                                                "status":  "OCCUPIED",
                                                "displayLabel":  "Terisi",
                                                "isOccupied":  true,
                                                "appointmentRef":  {
                                                                       "appointmentId":  "a2aa7360-759c-4a20-aff1-ab39095b6ed4",
                                                                       "queueNumber":  null,
                                                                       "status":  "waiting"
                                                                   }
                                            },
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:08:30-09:00",
                                                "intervalIndex":  2,
                                                "startTime":  "08:30",
                                                "endTime":  "09:00",
                                                "status":  "OCCUPIED",
                                                "displayLabel":  "Terisi",
                                                "isOccupied":  true,
                                                "appointmentRef":  {
                                                                       "appointmentId":  "f4b144df-1de0-4a23-9d6b-f9118732ca36",
                                                                       "queueNumber":  null,
                                                                       "status":  "booked"
                                                                   }
                                            },
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:09:00-09:30",
                                                "intervalIndex":  3,
                                                "startTime":  "09:00",
                                                "endTime":  "09:30",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:09:30-10:00",
                                                "intervalIndex":  4,
                                                "startTime":  "09:30",
                                                "endTime":  "10:00",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            }
                                        ]
             }
}
```

## 11\. Admin Session Patients - All Statuses

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e/patients?status=all
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "sessionId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                 "sessionLabel":  "Sesi Pagi Evidence Updated",
                 "shift":  "Sesi Pagi Evidence Updated",
                 "scheduleDate":  "2026-12-10",
                 "startTime":  "08:00",
                 "endTime":  "10:00",
                 "capacity":  4,
                 "availableSlots":  2,
                 "bookedCount":  2,
                 "clinicRoom":  {
                                    "id":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                    "name":  "Ruang Poli Umum 1",
                                    "floor":  null
                                },
                 "patients":  \[
                                  {
                                      "appointmentId":  "a2aa7360-759c-4a20-aff1-ab39095b6ed4",
                                      "queueTicketId":  null,
                                      "queueNumber":  "P-7f1",
                                      "timeSlot":  "08:00 - 08:30 WIB",
                                      "status":  "waiting",
                                      "statusBadge":  "Menunggu",
                                      "chiefComplaint":  "Evidence log waiting patient",
                                      "clinicRoomName":  "Ruang Poli Umum 1",
                                      "isCancellable":  true,
                                      "patient":  {
                                                      "id":  "eaf35fb2-19ee-4595-ae9b-55e411fb8834",
                                                      "fullName":  "Aisyah Febian",
                                                      "medicalRecordNumber":  "RM-2026-0004",
                                                      "nik":  "3201000000000004",
                                                      "gender":  "Perempuan",
                                                      "birthDate":  "1995-04-07",
                                                      "age":  "31 Thn",
                                                      "phoneNumber":  "081500000004",
                                                      "email":  "patient.0004@amanah-healthcare.test",
                                                      "address":  "Dk. Wardi no 9, Bandung",
                                                      "guardianName":  null,
                                                      "avatarUrl":  null
                                                  },
                                      "bookingMetadata":  {
                                                              "bookedAt":  "2026-09-24 11:06:22.607113+07",
                                                              "checkedInAt":  null,
                                                              "startedAt":  null,
                                                              "completedAt":  null,
                                                              "cancelledAt":  null,
                                                              "cancelReason":  null
                                                          }
                                  },
                                  {
                                      "appointmentId":  "f4b144df-1de0-4a23-9d6b-f9118732ca36",
                                      "queueTicketId":  null,
                                      "queueNumber":  "P-5cc",
                                      "timeSlot":  "08:30 - 09:00 WIB",
                                      "status":  "booked",
                                      "statusBadge":  "Booked",
                                      "chiefComplaint":  "Evidence log booked patient",
                                      "clinicRoomName":  "Ruang Poli Umum 1",
                                      "isCancellable":  true,
                                      "patient":  {
                                                      "id":  "eaf35fb2-19ee-4595-ae9b-55e411fb8834",
                                                      "fullName":  "Aisyah Febian",
                                                      "medicalRecordNumber":  "RM-2026-0004",
                                                      "nik":  "3201000000000004",
                                                      "gender":  "Perempuan",
                                                      "birthDate":  "1995-04-07",
                                                      "age":  "31 Thn",
                                                      "phoneNumber":  "081500000004",
                                                      "email":  "patient.0004@amanah-healthcare.test",
                                                      "address":  "Dk. Wardi no 9, Bandung",
                                                      "guardianName":  null,
                                                      "avatarUrl":  null
                                                  },
                                      "bookingMetadata":  {
                                                              "bookedAt":  "2026-09-24 11:06:22.607113+07",
                                                              "checkedInAt":  null,
                                                              "startedAt":  null,
                                                              "completedAt":  null,
                                                              "cancelledAt":  null,
                                                              "cancelReason":  null
                                                          }
                                  }
                              ]
             }
}
```

## 12\. Admin Session Patients - Waiting Filter

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e/patients?status=waiting
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "sessionId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                 "sessionLabel":  "Sesi Pagi Evidence Updated",
                 "shift":  "Sesi Pagi Evidence Updated",
                 "scheduleDate":  "2026-12-10",
                 "startTime":  "08:00",
                 "endTime":  "10:00",
                 "capacity":  4,
                 "availableSlots":  2,
                 "bookedCount":  2,
                 "clinicRoom":  {
                                    "id":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                    "name":  "Ruang Poli Umum 1",
                                    "floor":  null
                                },
                 "patients":  \[
                                  {
                                      "appointmentId":  "a2aa7360-759c-4a20-aff1-ab39095b6ed4",
                                      "queueTicketId":  null,
                                      "queueNumber":  "P-7f1",
                                      "timeSlot":  "08:00 - 08:30 WIB",
                                      "status":  "waiting",
                                      "statusBadge":  "Menunggu",
                                      "chiefComplaint":  "Evidence log waiting patient",
                                      "clinicRoomName":  "Ruang Poli Umum 1",
                                      "isCancellable":  true,
                                      "patient":  {
                                                      "id":  "eaf35fb2-19ee-4595-ae9b-55e411fb8834",
                                                      "fullName":  "Aisyah Febian",
                                                      "medicalRecordNumber":  "RM-2026-0004",
                                                      "nik":  "3201000000000004",
                                                      "gender":  "Perempuan",
                                                      "birthDate":  "1995-04-07",
                                                      "age":  "31 Thn",
                                                      "phoneNumber":  "081500000004",
                                                      "email":  "patient.0004@amanah-healthcare.test",
                                                      "address":  "Dk. Wardi no 9, Bandung",
                                                      "guardianName":  null,
                                                      "avatarUrl":  null
                                                  },
                                      "bookingMetadata":  {
                                                              "bookedAt":  "2026-09-24 11:06:22.607113+07",
                                                              "checkedInAt":  null,
                                                              "startedAt":  null,
                                                              "completedAt":  null,
                                                              "cancelledAt":  null,
                                                              "cancelReason":  null
                                                          }
                                  },
                                  {
                                      "appointmentId":  "f4b144df-1de0-4a23-9d6b-f9118732ca36",
                                      "queueTicketId":  null,
                                      "queueNumber":  "P-5cc",
                                      "timeSlot":  "08:30 - 09:00 WIB",
                                      "status":  "booked",
                                      "statusBadge":  "Booked",
                                      "chiefComplaint":  "Evidence log booked patient",
                                      "clinicRoomName":  "Ruang Poli Umum 1",
                                      "isCancellable":  true,
                                      "patient":  {
                                                      "id":  "eaf35fb2-19ee-4595-ae9b-55e411fb8834",
                                                      "fullName":  "Aisyah Febian",
                                                      "medicalRecordNumber":  "RM-2026-0004",
                                                      "nik":  "3201000000000004",
                                                      "gender":  "Perempuan",
                                                      "birthDate":  "1995-04-07",
                                                      "age":  "31 Thn",
                                                      "phoneNumber":  "081500000004",
                                                      "email":  "patient.0004@amanah-healthcare.test",
                                                      "address":  "Dk. Wardi no 9, Bandung",
                                                      "guardianName":  null,
                                                      "avatarUrl":  null
                                                  },
                                      "bookingMetadata":  {
                                                              "bookedAt":  "2026-09-24 11:06:22.607113+07",
                                                              "checkedInAt":  null,
                                                              "startedAt":  null,
                                                              "completedAt":  null,
                                                              "cancelledAt":  null,
                                                              "cancelReason":  null
                                                          }
                                  }
                              ]
             }
}
```

## 13\. Admin Doctor Accumulated Patients by Date

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/patients?date=2026-12-10\&status=all
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "doctorId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "doctorName":  "dr. Ahmad Santoso",
                 "date":  "2026-12-10",
                 "accumulatedCapacity":  4,
                 "accumulatedBookedCount":  2,
                 "accumulatedAvailableSlots":  2,
                 "sessions":  \[
                                  {
                                      "sessionId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                                      "sessionLabel":  "Sesi Pagi Evidence Updated",
                                      "shift":  "Sesi Pagi Evidence Updated",
                                      "startTime":  "08:00",
                                      "endTime":  "10:00",
                                      "capacity":  4,
                                      "availableSlots":  2,
                                      "bookedCount":  2,
                                      "patients":  \[
                                                       {
                                                           "appointmentId":  "a2aa7360-759c-4a20-aff1-ab39095b6ed4",
                                                           "queueTicketId":  null,
                                                           "queueNumber":  "P-7f1",
                                                           "timeSlot":  "08:00 - 08:30 WIB",
                                                           "status":  "waiting",
                                                           "statusBadge":  "Menunggu",
                                                           "chiefComplaint":  "Evidence log waiting patient",
                                                           "clinicRoomName":  "Ruang Poli Umum 1",
                                                           "isCancellable":  true,
                                                           "patient":  {
                                                                           "id":  "eaf35fb2-19ee-4595-ae9b-55e411fb8834",
                                                                           "fullName":  "Aisyah Febian",
                                                                           "medicalRecordNumber":  "RM-2026-0004",
                                                                           "nik":  "3201000000000004",
                                                                           "gender":  "Perempuan",
                                                                           "birthDate":  "1995-04-07",
                                                                           "age":  "31 Thn",
                                                                           "phoneNumber":  "081500000004",
                                                                           "email":  "patient.0004@amanah-healthcare.test",
                                                                           "address":  "Dk. Wardi no 9, Bandung",
                                                                           "guardianName":  null,
                                                                           "avatarUrl":  null
                                                                       },
                                                           "bookingMetadata":  {
                                                                                   "bookedAt":  "2026-09-24 11:06:22.607113+07",
                                                                                   "checkedInAt":  null,
                                                                                   "startedAt":  null,
                                                                                   "completedAt":  null,
                                                                                   "cancelledAt":  null,
                                                                                   "cancelReason":  null
                                                                               }
                                                       },
                                                       {
                                                           "appointmentId":  "f4b144df-1de0-4a23-9d6b-f9118732ca36",
                                                           "queueTicketId":  null,
                                                           "queueNumber":  "P-5cc",
                                                           "timeSlot":  "08:30 - 09:00 WIB",
                                                           "status":  "booked",
                                                           "statusBadge":  "Booked",
                                                           "chiefComplaint":  "Evidence log booked patient",
                                                           "clinicRoomName":  "Ruang Poli Umum 1",
                                                           "isCancellable":  true,
                                                           "patient":  {
                                                                           "id":  "eaf35fb2-19ee-4595-ae9b-55e411fb8834",
                                                                           "fullName":  "Aisyah Febian",
                                                                           "medicalRecordNumber":  "RM-2026-0004",
                                                                           "nik":  "3201000000000004",
                                                                           "gender":  "Perempuan",
                                                                           "birthDate":  "1995-04-07",
                                                                           "age":  "31 Thn",
                                                                           "phoneNumber":  "081500000004",
                                                                           "email":  "patient.0004@amanah-healthcare.test",
                                                                           "address":  "Dk. Wardi no 9, Bandung",
                                                                           "guardianName":  null,
                                                                           "avatarUrl":  null
                                                                       },
                                                           "bookingMetadata":  {
                                                                                   "bookedAt":  "2026-09-24 11:06:22.607113+07",
                                                                                   "checkedInAt":  null,
                                                                                   "startedAt":  null,
                                                                                   "completedAt":  null,
                                                                                   "cancelledAt":  null,
                                                                                   "cancelReason":  null
                                                                               }
                                                       }
                                                   ]
                                  }
                              ]
             }
}
```

## 14\. Contract Rejection - Legacy Admin Filter Status Buka

```http
GET /api/v1/admin/doctor-schedules?date=2026-12-10\&status=Buka
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 400
```

Response body:

```json
{
    "type":  "https://amanah.health/errors/invalid\_schedule\_status\_filter",
    "title":  "Bad Request",
    "status":  400,
    "statusCode":  400,
    "detail":  "Status filter must use canonical values: OPEN, OCCUPIED, CLOSED.",
    "message":  "Status filter must use canonical values: OPEN, OCCUPIED, CLOSED.",
    "instance":  "/api/v1/admin/doctor-schedules?date=2026-12-10\\u0026status=Buka",
    "code":  "INVALID\_SCHEDULE\_STATUS\_FILTER",
    "traceId":  "ccd0270e-d5f3-424c-a69c-fe9ab9767bb3",
    "timestamp":  "2026-09-24T04:06:22.977Z"
}
```

## 15\. Contract Rejection - Legacy Admin Session Status Tutup

```http
PATCH /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 422
```

Request body:

```json
{
    "status\_sesi":  "Tutup"
}
```

Response body:

```json
{
    "type":  "https://amanah.health/errors/validation\_failed",
    "title":  "Unprocessable Entity",
    "status":  422,
    "statusCode":  422,
    "detail":  "Form validation failed for one or more fields.",
    "message":  "Form validation failed for one or more fields.",
    "instance":  "/api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e",
    "code":  "VALIDATION\_FAILED",
    "traceId":  "a9e0c146-3472-460b-8440-01f92eb510f5",
    "timestamp":  "2026-09-24T04:06:23.001Z",
    "invalidParams":  \[
                          {
                              "name":  "status\_sesi",
                              "reason":  "status\_sesi must be one of the following values: OPEN, CLOSED",
                              "code":  "INVALID\_VALUE"
                          }
                      ]
}
```

## 16\. Admin Reschedule Eligibility - Valid Target

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e/reschedule-eligibility?targetDate=2026-12-11\&targetStartTime=09:00
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "sessionId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                 "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "practitionerName":  "dr. Ahmad Santoso",
                 "isEligible":  true,
                 "sourceSession":  {
                                       "id":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                                       "scheduleDate":  "2026-12-10",
                                       "startTime":  "08:00",
                                       "endTime":  "10:00",
                                       "timeRange":  "08:00 - 10:00 WIB",
                                       "status":  "open",
                                       "statusLabel":  "OPEN",
                                       "sessionLabel":  "Sesi Pagi Evidence Updated",
                                       "sessionShift":  "morning",
                                       "roomName":  "Ruang Poli Umum 1, Gedung Utama",
                                       "activeAppointmentsCount":  2,
                                       "isSourceEligible":  true,
                                       "rejectionReason":  null
                                   },
                 "targetValidation":  {
                                          "evaluated":  true,
                                          "targetDate":  "2026-12-11",
                                          "targetStartTime":  "09:00",
                                          "projectedEndTime":  "11:00",
                                          "targetRoomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                          "targetRoomName":  "Ruang Poli Umum 1, Gedung Utama",
                                          "isTargetEligible":  true,
                                          "conflictCode":  null,
                                          "conflictMessage":  null,
                                          "conflictMetadata":  null
                                      },
                 "actionableGuidance":  "Sesi dan target waktu memenuhi syarat untuk di-reschedule. Silakan lanjutkan konfirmasi."
             }
}
```

## 17\. Admin Reschedule Session

```http
POST /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e/reschedule
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Request body:

```json
{
    "reason":  "Evidence log reschedule",
    "targetDate":  "2026-12-11",
    "rescheduleActiveAppointments":  true,
    "targetStartTime":  "09:00"
}
```

Response body:

```json
{
    "success":  true,
    "message":  "Jadwal dokter berhasil dijadwalkan ulang (rescheduled)",
    "data":  {
                 "sessionId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                 "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "previousSchedule":  {
                                          "date":  "2026-12-10",
                                          "startTime":  "08:00",
                                          "endTime":  "10:00",
                                          "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a"
                                      },
                 "rescheduledSchedule":  {
                                             "id":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                                             "scheduleDate":  "2026-12-11",
                                             "startTime":  "09:00",
                                             "endTime":  "11:00",
                                             "timeRange":  "09:00 - 11:00 WIB",
                                             "sessionLabel":  "Pagi",
                                             "sessionShift":  "morning",
                                             "capacity":  4,
                                             "availableSlots":  2,
                                             "status":  "open",
                                             "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                                             "notes":  "\[RESCHEDULED] Evidence log reschedule",
                                             "version":  "1790222783079"
                                         },
                 "rescheduledAppointmentsCount":  2,
                 "projection":  {
                                    "scheduleId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                                    "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                                    "date":  "2026-12-11",
                                    "scheduleContextId":  "morning",
                                    "contextLabel":  "Pagi",
                                    "selectedStartTime":  "09:00",
                                    "boundaryStartTime":  "06:00",
                                    "boundaryEndTime":  "11:00",
                                    "shiftBoundary":  {
                                                          "startTime":  "06:00",
                                                          "endTime":  "11:00"
                                                      },
                                    "projectedEndTime":  "11:00",
                                    "effectiveConsultationDurationMinutes":  30,
                                    "durationSource":  "PRACTITIONER\_CONFIG",
                                    "durationScope":  "practitioner-specific",
                                    "durationEditableByCurrentUser":  true,
                                    "allowedStartPrecisionMinutes":  1,
                                    "timezone":  "Asia/Jakarta",
                                    "capacity":  4,
                                    "remainingShiftSlots":  2,
                                    "intervals":  \[
                                                      {
                                                          "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:09:00-09:30",
                                                          "intervalIndex":  1,
                                                          "startTime":  "09:00",
                                                          "endTime":  "09:30",
                                                          "status":  "OCCUPIED",
                                                          "displayLabel":  "Terisi",
                                                          "isOccupied":  true,
                                                          "appointmentRef":  {
                                                                                 "appointmentId":  "a2aa7360-759c-4a20-aff1-ab39095b6ed4",
                                                                                 "queueNumber":  null,
                                                                                 "status":  "waiting"
                                                                             }
                                                      },
                                                      {
                                                          "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:09:30-10:00",
                                                          "intervalIndex":  2,
                                                          "startTime":  "09:30",
                                                          "endTime":  "10:00",
                                                          "status":  "OCCUPIED",
                                                          "displayLabel":  "Terisi",
                                                          "isOccupied":  true,
                                                          "appointmentRef":  {
                                                                                 "appointmentId":  "f4b144df-1de0-4a23-9d6b-f9118732ca36",
                                                                                 "queueNumber":  null,
                                                                                 "status":  "booked"
                                                                             }
                                                      },
                                                      {
                                                          "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:10:00-10:30",
                                                          "intervalIndex":  3,
                                                          "startTime":  "10:00",
                                                          "endTime":  "10:30",
                                                          "status":  "OPEN",
                                                          "displayLabel":  "Buka",
                                                          "isOccupied":  false
                                                      },
                                                      {
                                                          "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:10:30-11:00",
                                                          "intervalIndex":  4,
                                                          "startTime":  "10:30",
                                                          "endTime":  "11:00",
                                                          "status":  "OPEN",
                                                          "displayLabel":  "Buka",
                                                          "isOccupied":  false
                                                      }
                                                  ],
                                    "version":  "1790222783079",
                                    "updatedAt":  "2026-09-24 11:06:23.079221+07"
                                }
             }
}
```

## 18\. Admin Detail After Reschedule

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca?date=2026-12-11\&month=2026-12
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "nama\_dokter":  "dr. Ahmad Santoso",
                 "spesialisasi":  "Dokter Umum",
                 "status\_dokter":  "OPEN",
                 "email":  "dokter@amanah.com",
                 "nomor\_telepon":  "6281234567890",
                 "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                 "avatar":  "",
                 "slot\_tersedia":  2,
                 "kapasitas\_per\_hari":  4,
                 "bulan\_jadwal":  "Desember 2026",
                 "is\_cuti":  false,
                 "cuti\_reason":  null,
                 "cuti\_start":  null,
                 "cuti\_end":  null,
                 "monthly\_schedule":  \[
                                          {
                                              "day":  1,
                                              "date":  "2026-12-01",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  2,
                                              "date":  "2026-12-02",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  3,
                                              "date":  "2026-12-03",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  4,
                                              "date":  "2026-12-04",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  5,
                                              "date":  "2026-12-05",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  6,
                                              "date":  "2026-12-06",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  7,
                                              "date":  "2026-12-07",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  8,
                                              "date":  "2026-12-08",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  9,
                                              "date":  "2026-12-09",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  10,
                                              "date":  "2026-12-10",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  11,
                                              "date":  "2026-12-11",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  12,
                                              "date":  "2026-12-12",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  13,
                                              "date":  "2026-12-13",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  14,
                                              "date":  "2026-12-14",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  15,
                                              "date":  "2026-12-15",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  16,
                                              "date":  "2026-12-16",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  17,
                                              "date":  "2026-12-17",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  18,
                                              "date":  "2026-12-18",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  19,
                                              "date":  "2026-12-19",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  20,
                                              "date":  "2026-12-20",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  21,
                                              "date":  "2026-12-21",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  22,
                                              "date":  "2026-12-22",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  23,
                                              "date":  "2026-12-23",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  24,
                                              "date":  "2026-12-24",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  25,
                                              "date":  "2026-12-25",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  26,
                                              "date":  "2026-12-26",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  27,
                                              "date":  "2026-12-27",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  28,
                                              "date":  "2026-12-28",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  29,
                                              "date":  "2026-12-29",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  30,
                                              "date":  "2026-12-30",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  31,
                                              "date":  "2026-12-31",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          }
                                      ],
                 "sesi\_harian":  \[
                                     {
                                         "id":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e",
                                         "nama\_sesi":  "Pagi",
                                         "jam\_mulai":  "09:00",
                                         "jam\_selesai":  "11:00",
                                         "waktu":  "09:00 - 11:00",
                                         "kuota\_pasien":  4,
                                         "slot\_tersedia":  2,
                                         "status\_sesi":  "OPEN",
                                         "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                         "is\_reschedule\_eligible":  true,
                                         "reschedule\_ineligibility\_reason":  null
                                     }
                                 ],
                 "timeline\_intervals":  \[
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:09:00-09:30",
                                                "intervalIndex":  1,
                                                "startTime":  "09:00",
                                                "endTime":  "09:30",
                                                "status":  "OCCUPIED",
                                                "displayLabel":  "Terisi",
                                                "isOccupied":  true,
                                                "appointmentRef":  {
                                                                       "appointmentId":  "a2aa7360-759c-4a20-aff1-ab39095b6ed4",
                                                                       "queueNumber":  null,
                                                                       "status":  "waiting"
                                                                   }
                                            },
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:09:30-10:00",
                                                "intervalIndex":  2,
                                                "startTime":  "09:30",
                                                "endTime":  "10:00",
                                                "status":  "OCCUPIED",
                                                "displayLabel":  "Terisi",
                                                "isOccupied":  true,
                                                "appointmentRef":  {
                                                                       "appointmentId":  "f4b144df-1de0-4a23-9d6b-f9118732ca36",
                                                                       "queueNumber":  null,
                                                                       "status":  "booked"
                                                                   }
                                            },
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:10:00-10:30",
                                                "intervalIndex":  3,
                                                "startTime":  "10:00",
                                                "endTime":  "10:30",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            },
                                            {
                                                "intervalId":  "98e5fc69-10d8-4de1-857f-d8fc6286e21e:10:30-11:00",
                                                "intervalIndex":  4,
                                                "startTime":  "10:30",
                                                "endTime":  "11:00",
                                                "status":  "OPEN",
                                                "displayLabel":  "Buka",
                                                "isOccupied":  false
                                            }
                                        ]
             }
}
```

## 19\. Admin Delete Session Guard

```http
DELETE /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 403
```

Response body:

```json
{
    "type":  "https://amanah.health/errors/admin\_schedule\_deletion\_prohibited",
    "title":  "Forbidden",
    "status":  403,
    "statusCode":  403,
    "detail":  "Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data dan riwayat rekam medis klinis. Silakan nonaktifkan sesi dengan status CLOSED atau lakukan Reschedule.",
    "message":  "Admin tidak diizinkan menghapus sesi jadwal dokter demi integritas data dan riwayat rekam medis klinis. Silakan nonaktifkan sesi dengan status CLOSED atau lakukan Reschedule.",
    "instance":  "/api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/98e5fc69-10d8-4de1-857f-d8fc6286e21e",
    "code":  "ADMIN\_SCHEDULE\_DELETION\_PROHIBITED",
    "traceId":  "42c43221-70d2-45b7-be1a-325fb5f94cd7",
    "timestamp":  "2026-09-24T04:06:23.145Z"
}
```

## 20\. Admin Create Session for Calendar Closure

```http
POST /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 201
```

Request body:

```json
{
    "jam\_mulai":  "08:00",
    "schedule\_date":  "2026-12-12",
    "kuota\_pasien":  2,
    "nama\_sesi":  "Sesi Pagi Closure Evidence",
    "slot\_tersedia":  2,
    "jam\_selesai":  "09:00",
    "status\_sesi":  "OPEN"
}
```

Response body:

```json
{
    "success":  true,
    "message":  "Sesi jadwal berhasil ditambahkan",
    "data":  {
                 "id":  "6ec628f0-2da1-4d09-90a3-35fd273fa954",
                 "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "daySettingId":  null,
                 "serviceId":  null,
                 "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                 "scheduleDate":  "2026-12-12",
                 "sessionLabel":  "Sesi Pagi Closure Evidence",
                 "sessionShift":  "morning",
                 "startTime":  "08:00:00",
                 "endTime":  "09:00:00",
                 "capacity":  2,
                 "availableSlots":  2,
                 "status":  "open",
                 "notes":  null,
                 "createdAt":  "2026-09-24 11:06:23.166833+07",
                 "updatedAt":  "2026-09-24 11:06:23.166833+07"
             }
}
```

## 21\. Admin Create Second Session for Calendar Closure

```http
POST /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 201
```

Request body:

```json
{
    "jam\_mulai":  "13:00",
    "schedule\_date":  "2026-12-12",
    "kuota\_pasien":  2,
    "nama\_sesi":  "Sesi Siang Closure Evidence",
    "slot\_tersedia":  2,
    "jam\_selesai":  "14:00",
    "status\_sesi":  "OPEN"
}
```

Response body:

```json
{
    "success":  true,
    "message":  "Sesi jadwal berhasil ditambahkan",
    "data":  {
                 "id":  "316ca228-0afa-4123-9e8b-112218b2c3d2",
                 "practitionerId":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "daySettingId":  null,
                 "serviceId":  null,
                 "roomId":  "b77d141b-2fa5-4481-9f47-a5a040faf57a",
                 "scheduleDate":  "2026-12-12",
                 "sessionLabel":  "Sesi Siang Closure Evidence",
                 "sessionShift":  "afternoon",
                 "startTime":  "13:00:00",
                 "endTime":  "14:00:00",
                 "capacity":  2,
                 "availableSlots":  2,
                 "status":  "open",
                 "notes":  null,
                 "createdAt":  "2026-09-24 11:06:23.194043+07",
                 "updatedAt":  "2026-09-24 11:06:23.194043+07"
             }
}
```

## 22\. Admin Close Calendar Day

```http
PATCH /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/days/2026-12-12
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Request body:

```json
{
    "status":  "CLOSED",
    "notes":  "Evidence log calendar closure"
}
```

Response body:

```json
{
    "success":  true,
    "message":  "Jadwal hari berhasil ditutup dan seluruh sesi dinonaktifkan (pasien aktif dibatalkan secara soft delete)",
    "data":  {
                 "date":  "2026-12-12",
                 "status":  "CLOSED",
                 "notes":  "Evidence log calendar closure",
                 "affectedSessionsCount":  2,
                 "cancelledAppointmentsCount":  1
             }
}
```

## 23\. Admin Detail After Calendar Day Closed

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca?date=2026-12-12\&month=2026-12
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "nama\_dokter":  "dr. Ahmad Santoso",
                 "spesialisasi":  "Dokter Umum",
                 "status\_dokter":  "CLOSED",
                 "email":  "dokter@amanah.com",
                 "nomor\_telepon":  "6281234567890",
                 "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                 "avatar":  "",
                 "slot\_tersedia":  0,
                 "kapasitas\_per\_hari":  0,
                 "bulan\_jadwal":  "Desember 2026",
                 "is\_cuti":  false,
                 "cuti\_reason":  null,
                 "cuti\_start":  null,
                 "cuti\_end":  null,
                 "monthly\_schedule":  \[
                                          {
                                              "day":  1,
                                              "date":  "2026-12-01",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  2,
                                              "date":  "2026-12-02",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  3,
                                              "date":  "2026-12-03",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  4,
                                              "date":  "2026-12-04",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  5,
                                              "date":  "2026-12-05",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  6,
                                              "date":  "2026-12-06",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  7,
                                              "date":  "2026-12-07",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  8,
                                              "date":  "2026-12-08",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  9,
                                              "date":  "2026-12-09",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  10,
                                              "date":  "2026-12-10",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  11,
                                              "date":  "2026-12-11",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  12,
                                              "date":  "2026-12-12",
                                              "status":  "CLOSED",
                                              "notes":  "Evidence log calendar closure"
                                          },
                                          {
                                              "day":  13,
                                              "date":  "2026-12-13",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  14,
                                              "date":  "2026-12-14",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  15,
                                              "date":  "2026-12-15",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  16,
                                              "date":  "2026-12-16",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  17,
                                              "date":  "2026-12-17",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  18,
                                              "date":  "2026-12-18",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  19,
                                              "date":  "2026-12-19",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  20,
                                              "date":  "2026-12-20",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  21,
                                              "date":  "2026-12-21",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  22,
                                              "date":  "2026-12-22",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  23,
                                              "date":  "2026-12-23",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  24,
                                              "date":  "2026-12-24",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  25,
                                              "date":  "2026-12-25",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  26,
                                              "date":  "2026-12-26",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  27,
                                              "date":  "2026-12-27",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  28,
                                              "date":  "2026-12-28",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  29,
                                              "date":  "2026-12-29",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  30,
                                              "date":  "2026-12-30",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  31,
                                              "date":  "2026-12-31",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          }
                                      ],
                 "sesi\_harian":  \[
                                     {
                                         "id":  "6ec628f0-2da1-4d09-90a3-35fd273fa954",
                                         "nama\_sesi":  "Sesi Pagi Closure Evidence",
                                         "jam\_mulai":  "08:00",
                                         "jam\_selesai":  "09:00",
                                         "waktu":  "08:00 - 09:00",
                                         "kuota\_pasien":  2,
                                         "slot\_tersedia":  0,
                                         "status\_sesi":  "CLOSED",
                                         "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                         "is\_reschedule\_eligible":  false,
                                         "reschedule\_ineligibility\_reason":  "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
                                     },
                                     {
                                         "id":  "316ca228-0afa-4123-9e8b-112218b2c3d2",
                                         "nama\_sesi":  "Sesi Siang Closure Evidence",
                                         "jam\_mulai":  "13:00",
                                         "jam\_selesai":  "14:00",
                                         "waktu":  "13:00 - 14:00",
                                         "kuota\_pasien":  2,
                                         "slot\_tersedia":  0,
                                         "status\_sesi":  "CLOSED",
                                         "ruang":  "Ruang Poli Umum 1, Gedung Utama",
                                         "is\_reschedule\_eligible":  false,
                                         "reschedule\_ineligibility\_reason":  "Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi."
                                     }
                                 ],
                 "timeline\_intervals":  \[
                                            {
                                                "intervalId":  "6ec628f0-2da1-4d09-90a3-35fd273fa954:08:00-08:30",
                                                "intervalIndex":  1,
                                                "startTime":  "08:00",
                                                "endTime":  "08:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Tutup",
                                                "isOccupied":  false,
                                                "closedReason":  "SCHEDULE\_CLOSED"
                                            },
                                            {
                                                "intervalId":  "6ec628f0-2da1-4d09-90a3-35fd273fa954:08:30-09:00",
                                                "intervalIndex":  2,
                                                "startTime":  "08:30",
                                                "endTime":  "09:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Tutup",
                                                "isOccupied":  false,
                                                "closedReason":  "SCHEDULE\_CLOSED"
                                            },
                                            {
                                                "intervalId":  "316ca228-0afa-4123-9e8b-112218b2c3d2:13:00-13:30",
                                                "intervalIndex":  1,
                                                "startTime":  "13:00",
                                                "endTime":  "13:30",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Tutup",
                                                "isOccupied":  false,
                                                "closedReason":  "SCHEDULE\_CLOSED"
                                            },
                                            {
                                                "intervalId":  "316ca228-0afa-4123-9e8b-112218b2c3d2:13:30-14:00",
                                                "intervalIndex":  2,
                                                "startTime":  "13:30",
                                                "endTime":  "14:00",
                                                "status":  "CLOSED",
                                                "displayLabel":  "Tutup",
                                                "isOccupied":  false,
                                                "closedReason":  "SCHEDULE\_CLOSED"
                                            }
                                        ]
             }
}
```

## 24\. Admin Reopen Calendar Day

```http
PATCH /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/days/2026-12-12
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Request body:

```json
{
    "status":  "OPEN",
    "notes":  "Evidence log calendar restore"
}
```

Response body:

```json
{
    "success":  true,
    "message":  "Jadwal hari berhasil dibuka kembali dan seluruh sesi diaktifkan",
    "data":  {
                 "date":  "2026-12-12",
                 "status":  "OPEN",
                 "notes":  "Evidence log calendar restore",
                 "affectedSessionsCount":  2,
                 "cancelledAppointmentsCount":  0
             }
}
```

## 25\. Admin Set Cuti Metadata via Doctor Schedule Update

```http
PATCH /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Request body:

```json
{
    "date":  "2026-12-13",
    "cuti\_start":  "2026-12-13",
    "cuti\_end":  "2026-12-13",
    "cuti\_reason":  "Evidence log cuti metadata",
    "is\_cuti":  true
}
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "nama\_dokter":  "dr. Ahmad Santoso",
                 "spesialisasi":  "Dokter Umum",
                 "status\_dokter":  "CLOSED",
                 "email":  "dokter@amanah.com",
                 "nomor\_telepon":  "6281234567890",
                 "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                 "avatar":  "",
                 "slot\_tersedia":  0,
                 "kapasitas\_per\_hari":  0,
                 "bulan\_jadwal":  "Desember 2026",
                 "is\_cuti":  true,
                 "cuti\_reason":  "Evidence log cuti metadata",
                 "cuti\_start":  "2026-12-13",
                 "cuti\_end":  "2026-12-13",
                 "monthly\_schedule":  \[
                                          {
                                              "day":  1,
                                              "date":  "2026-12-01",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  2,
                                              "date":  "2026-12-02",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  3,
                                              "date":  "2026-12-03",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  4,
                                              "date":  "2026-12-04",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  5,
                                              "date":  "2026-12-05",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  6,
                                              "date":  "2026-12-06",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  7,
                                              "date":  "2026-12-07",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  8,
                                              "date":  "2026-12-08",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  9,
                                              "date":  "2026-12-09",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  10,
                                              "date":  "2026-12-10",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  11,
                                              "date":  "2026-12-11",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  12,
                                              "date":  "2026-12-12",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  13,
                                              "date":  "2026-12-13",
                                              "status":  "CLOSED",
                                              "notes":  "Evidence log cuti metadata"
                                          },
                                          {
                                              "day":  14,
                                              "date":  "2026-12-14",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  15,
                                              "date":  "2026-12-15",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  16,
                                              "date":  "2026-12-16",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  17,
                                              "date":  "2026-12-17",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  18,
                                              "date":  "2026-12-18",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  19,
                                              "date":  "2026-12-19",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  20,
                                              "date":  "2026-12-20",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  21,
                                              "date":  "2026-12-21",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  22,
                                              "date":  "2026-12-22",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  23,
                                              "date":  "2026-12-23",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  24,
                                              "date":  "2026-12-24",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  25,
                                              "date":  "2026-12-25",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  26,
                                              "date":  "2026-12-26",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  27,
                                              "date":  "2026-12-27",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  28,
                                              "date":  "2026-12-28",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  29,
                                              "date":  "2026-12-29",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  30,
                                              "date":  "2026-12-30",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  31,
                                              "date":  "2026-12-31",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          }
                                      ],
                 "sesi\_harian":  \[

                                 ],
                 "timeline\_intervals":  \[

                                        ]
             }
}
```

## 26\. Admin Detail After Cuti Metadata

```http
GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca?date=2026-12-13\&month=2026-12
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "success":  true,
    "data":  {
                 "id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "practitioner\_id":  "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
                 "nama\_dokter":  "dr. Ahmad Santoso",
                 "spesialisasi":  "Dokter Umum",
                 "status\_dokter":  "CLOSED",
                 "email":  "dokter@amanah.com",
                 "nomor\_telepon":  "6281234567890",
                 "ruang\_praktik":  "Ruang Poli Umum 1, Gedung Utama",
                 "avatar":  "",
                 "slot\_tersedia":  0,
                 "kapasitas\_per\_hari":  0,
                 "bulan\_jadwal":  "Desember 2026",
                 "is\_cuti":  true,
                 "cuti\_reason":  "Evidence log cuti metadata",
                 "cuti\_start":  "2026-12-13",
                 "cuti\_end":  "2026-12-13",
                 "monthly\_schedule":  \[
                                          {
                                              "day":  1,
                                              "date":  "2026-12-01",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  2,
                                              "date":  "2026-12-02",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  3,
                                              "date":  "2026-12-03",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  4,
                                              "date":  "2026-12-04",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  5,
                                              "date":  "2026-12-05",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  6,
                                              "date":  "2026-12-06",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  7,
                                              "date":  "2026-12-07",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  8,
                                              "date":  "2026-12-08",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  9,
                                              "date":  "2026-12-09",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  10,
                                              "date":  "2026-12-10",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  11,
                                              "date":  "2026-12-11",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  12,
                                              "date":  "2026-12-12",
                                              "status":  "OPEN",
                                              "notes":  null
                                          },
                                          {
                                              "day":  13,
                                              "date":  "2026-12-13",
                                              "status":  "CLOSED",
                                              "notes":  "Evidence log cuti metadata"
                                          },
                                          {
                                              "day":  14,
                                              "date":  "2026-12-14",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  15,
                                              "date":  "2026-12-15",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  16,
                                              "date":  "2026-12-16",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  17,
                                              "date":  "2026-12-17",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  18,
                                              "date":  "2026-12-18",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  19,
                                              "date":  "2026-12-19",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  20,
                                              "date":  "2026-12-20",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  21,
                                              "date":  "2026-12-21",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  22,
                                              "date":  "2026-12-22",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  23,
                                              "date":  "2026-12-23",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  24,
                                              "date":  "2026-12-24",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  25,
                                              "date":  "2026-12-25",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  26,
                                              "date":  "2026-12-26",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  27,
                                              "date":  "2026-12-27",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  28,
                                              "date":  "2026-12-28",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  29,
                                              "date":  "2026-12-29",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  30,
                                              "date":  "2026-12-30",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          },
                                          {
                                              "day":  31,
                                              "date":  "2026-12-31",
                                              "status":  "CLOSED",
                                              "notes":  null
                                          }
                                      ],
                 "sesi\_harian":  \[

                                 ],
                 "timeline\_intervals":  \[

                                        ]
             }
}
```

## 27\. Shared Schedule Reference Options for Web/Mobile

```http
GET /api/v1/schedules/reference/options
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 200
```

Response body:

```json
{
    "shifts":  \[
                   {
                       "id":  "PAGI",
                       "label":  "Pagi",
                       "shift":  "morning",
                       "startTime":  "07:00",
                       "endTime":  "12:00"
                   },
                   {
                       "id":  "SIANG",
                       "label":  "Siang",
                       "shift":  "afternoon",
                       "startTime":  "12:00",
                       "endTime":  "17:00"
                   },
                   {
                       "id":  "MALAM",
                       "label":  "Malam",
                       "shift":  "night",
                       "startTime":  "17:00",
                       "endTime":  "21:00"
                   }
               ],
    "statuses":  \[
                     {
                         "id":  "OPEN",
                         "label":  "Buka"
                     },
                     {
                         "id":  "CLOSED",
                         "label":  "Tutup"
                     }
                 ],
    "timeSlotIntervals":  \[
                              30
                          ],
    "effectiveConsultationDurationMinutes":  30,
    "durationSource":  "PRACTITIONER\_CONFIG",
    "durationScope":  "practitioner-specific",
    "canonicalIntervalStatuses":  \[
                                      {
                                          "id":  "OPEN",
                                          "label":  "Buka"
                                      },
                                      {
                                          "id":  "OCCUPIED",
                                          "label":  "Terisi"
                                      },
                                      {
                                          "id":  "CLOSED",
                                          "label":  "Tutup"
                                      }
                                  ]
}
```

## 28\. Contract Rejection - Legacy Mobile Day Status Tutup

```http
PATCH /api/v1/schedules/days/2026-12-12
Authorization: Bearer <admin-or-doctor-token>
HTTP Status: 400
```

Request body:

```json
{
    "status":  "Tutup",
    "notes":  "Legacy mobile status must be rejected"
}
```

Response body:

```json
{
    "type":  "https://amanah.health/errors/invalid\_schedule\_status",
    "title":  "Bad Request",
    "status":  400,
    "statusCode":  400,
    "detail":  "status must use canonical values only: OPEN or CLOSED.",
    "message":  "status must use canonical values only: OPEN or CLOSED.",
    "instance":  "/api/v1/schedules/days/2026-12-12",
    "code":  "INVALID\_SCHEDULE\_STATUS",
    "traceId":  "331df843-6761-4725-87fc-6e2c1f6e12b8",
    "timestamp":  "2026-09-24T04:06:23.539Z"
}
```

## Verification Summary

```text
Export completed successfully.
All setup-dependent endpoints returned expected successful responses.
Legacy status payloads were logged as rejected responses.
```

intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.intinya understanding saja apa yang berimpact. Langsung edit saja, nggak usah nge-planning, nggak usah nge-report ke saya. Baca sekali utuh semuanya pakai RG, pakai RG, tools RG, oke? Baca sekaligus semuanya, edit, oke? Pastikan tidak ada yang violation.# Codebase Investigation Reinforcement — Search First, Read the Flow, Then Modify



Before changing any frontend behavior, you MUST investigate the codebase.



Do not guess.



Do not assume a field does not exist because you did not immediately see it in one component.



Do not assume the backend does not provide a value before searching the DTO, API client, mapper, state layer, and response handling.



Use `rg` — ripgrep — aggressively to trace the actual implementation.



The operating principle is:



> \*\*Search broadly, narrow progressively, then read the complete data flow.\*\*



\---



\# 1. Start With Broad Discovery



If the feature is related to schedules, start with broad domain terminology.



Example:



```bash

rg -n -i "schedule|scheduling|availability|slot|appointment|duration|status" .

```



Flags:



```text

\-n   show line numbers

\-i   case-insensitive search

```



Do not immediately search only for the exact UI label you see.



A field called:



```text

durationMinutes

```



may never contain the visible text:



```text

30 minutes

```



Search by concepts.



\---



\# 2. Search Exact Symbols When You Know Them



If you discover a field such as:



```text

effectiveDurationMinutes

```



search every usage:



```bash

rg -n "effectiveDurationMinutes" .

```



If you discover an enum:



```text

ScheduleStatus

```



search:



```bash

rg -n "ScheduleStatus" .

```



If you discover an endpoint:



```text

/practitioners

```



search:



```bash

rg -n "/practitioners" .

```



The goal is to understand:



```text

where it is defined

where it is transformed

where it is stored

where it is consumed

where it is submitted

```



\---



\# 3. Search Definitions and Usages Separately



For TypeScript:



```bash

rg -n "type Schedule"

rg -n "interface Schedule"

rg -n "enum Schedule"

rg -n "ScheduleStatus"

```



For Dart:



```bash

rg -n "class Schedule"

rg -n "enum ScheduleStatus"

rg -n "typedef .\*Schedule"

```



For functions:



```bash

rg -n "function .\*schedule"

rg -n "const .\*schedule.\*="

rg -n "Future<.\*>.\*schedule"

```



Do not stop after finding one definition.



A duplicated type may exist elsewhere.



\---



\# 4. Search the Backend Value, Not Only the UI Label



If the UI displays:



```text

Buka

Terisi

Tutup

```



search both localized labels and possible canonical values:



```bash

rg -n -i "buka|terisi|tutup" .

```



Then:



```bash

rg -n "OPEN|OCCUPIED|CLOSED" .

```



This helps detect whether the frontend is:



```text

rendering backend values correctly

hardcoding translated values

inventing its own status enum

mapping incorrectly

```



\---



\# 5. Search Hardcoded Numbers



If there is a suspicious business number such as `30` minutes, do not only search:



```bash

rg -n "30" .

```



That is too noisy.



Search contextual variants:



```bash

rg -n "Duration\\(minutes:\\s\*30\\)" .

```



Flutter:



```bash

rg -n "minutes:\\s\*30" .

rg -n "Duration.\*30" .

```



TypeScript:



```bash

rg -n "30\\s\*\\\*\\s\*60" .

rg -n "duration.\*30|30.\*duration" .

rg -n "minutes.\*30|30.\*minutes" .

```



Also search constants:



```bash

rg -n -i "slot\_duration|slotDuration|durationMinutes|consultationDuration" .

```



Do not conclude that a value is hardcoded until you inspect its context.



\---



\# 6. Search Suspicious Fallbacks



Search for nullish/default behavior:



```bash

rg -n "\\?\\?" .

```



Then narrow it:



```bash

rg -n "duration\\s\*\\?\\?"

rg -n "status\\s\*\\?\\?"

rg -n "capacity\\s\*\\?\\?"

rg -n "slots\\s\*\\?\\?"

```



Search logical fallbacks:



```bash

rg -n "\\|\\|" .

```



Then inspect things such as:



```text

duration || 30

status || "OPEN"

slots || \[]

```



In Dart, inspect:



```bash

rg -n "\\?\\?" lib

```



These are common places where frontend agents silently manufacture backend data.



\---



\# 7. Search Conditional Domain Logic



Search for business decisions hidden inside components:



```bash

rg -n "if .\*status"

rg -n "switch .\*status"

rg -n "case \['\\"]OPEN"

rg -n "case \['\\"]CLOSED"

rg -n "case \['\\"]OCCUPIED"

```



TypeScript:



```bash

rg -n "switch\\s\*\\(.\*status"

```



Flutter:



```bash

rg -n "switch\\s\*\\(.\*status"

```



Do not automatically delete conditional logic.



First classify it:



```text

presentation mapping

domain computation

authorization

validation

fallback

compatibility migration

```



A badge color switch is presentation logic.



A switch that decides whether a patient can book is domain logic and deserves deeper inspection.



\---



\# 8. Search API Calls



Next.js / TypeScript:



```bash

rg -n "fetch\\("

rg -n "axios\\."

rg -n "\\.get\\("

rg -n "\\.post\\("

rg -n "\\.patch\\("

rg -n "\\.delete\\("

```



If the project has a custom client:



```bash

rg -n "apiClient|httpClient|request|client\\."

```



Flutter:



```bash

rg -n "Dio\\("

rg -n "dio\\."

rg -n "http\\."

rg -n "get\\("

rg -n "post\\("

rg -n "patch\\("

```



Then locate the schedule endpoint specifically.



Example:



```bash

rg -n -i "schedule" src lib

```



Read the actual request and response path.



\---



\# 9. Search DTOs and Models



TypeScript:



```bash

rg -n "Dto|DTO|Response|Request|Payload|Schema" src

```



Then narrow:



```bash

rg -n -i "schedule.\*dto|schedule.\*response|schedule.\*request" src

```



Flutter:



```bash

rg -n -i "schedule.\*model|schedule.\*dto|schedule.\*response" lib

```



Inspect serialization.



For Dart:



```bash

rg -n "fromJson|toJson" lib

```



For TypeScript:



```bash

rg -n "z\\.object|parse\\(|safeParse\\(" src

```



Do not assume a field is missing until you inspect the DTO.



\---



\# 10. Trace the Data Flow



Once you find the endpoint, trace both directions.



Read path:



```text

API

→ response DTO

→ mapper / repository

→ query / provider / store

→ selector

→ component

→ rendered UI

```



Write path:



```text

form

→ local form state

→ request mapper

→ mutation / repository

→ API client

→ backend

```



You must understand both.



A bug can exist on either side.



\---



\# 11. Read the Whole File, Not Only the Matching Line



`rg` finds locations.



It does not replace reading.



When you find:



```text

src/features/schedule/hooks/useSchedule.ts:74

```



do not reason from line 74 alone.



Read the surrounding function.



Understand:



```text

imports

type definitions

upstream dependencies

function inputs

transformations

return value

callers

```



A suspicious line may be perfectly valid in context.



\---



\# 12. Read Upstream Before Downstream



When investigating a UI value, do not begin by editing the component.



Read upward.



Example:



```text

ScheduleBadge.tsx

↑

ScheduleCard.tsx

↑

useSchedule()

↑

scheduleRepository

↑

apiClient

↑

GET /schedule

```



The closer you get to the source, the more authoritative the information becomes.



\---



\# 13. Read Callers and Callees



If you find:



```text

calculateSlots()

```



search it:



```bash

rg -n "calculateSlots" .

```



Determine:



```text

where defined

who calls it

whether backend already sends slots

whether Flutter has another implementation

whether Next.js has another implementation

```



Do not refactor a function without knowing its callers.



\---



\# 14. Search for Duplicate Implementations



If one scheduling calculation exists, search for equivalent names:



```bash

rg -n -i "generate.\*slot|calculate.\*slot|build.\*slot|create.\*slot" .

```



Also:



```bash

rg -n -i "capacity|remaining|occupied|availability" .

```



The objective is to detect:



```text

same business rule implemented in multiple files

same business rule implemented in both clients

same enum duplicated manually

```



\---



\# 15. Search by Folder When the Global Search Is Too Noisy



Frontend:



```bash

rg -n -i "schedule" src/

```



Flutter:



```bash

rg -n -i "schedule" lib/

```



API layer only:



```bash

rg -n -i "schedule" src/api src/services src/repositories

```



State layer:



```bash

rg -n -i "schedule" src/hooks src/stores src/state

```



UI only:



```bash

rg -n -i "schedule" src/components src/features

```



Progressively narrow the search.



\---



\# 16. Search File Names



Use:



```bash

rg --files | rg -i "schedule|appointment|availability|slot"

```



This is often faster than blindly browsing folders.



For DTO/model files:



```bash

rg --files | rg -i "dto|model|schema|response|request"

```



For API infrastructure:



```bash

rg --files | rg -i "api|client|service|repository"

```



\---



\# 17. Exclude Noise



Avoid searching generated/build directories.



Example:



```bash

rg -n "ScheduleStatus" . \\

&#x20; -g '!node\_modules/\*\*' \\

&#x20; -g '!.next/\*\*' \\

&#x20; -g '!build/\*\*' \\

&#x20; -g '!dist/\*\*'

```



Flutter:



```bash

rg -n "ScheduleStatus" lib test

```



Do not waste time reading generated noise unless generated API types are intentionally part of the architecture.



\---



\# 18. Use Context Output When Useful



Show lines around a match:



```bash

rg -n -C 5 "effectiveDuration" .

```



Before:



```bash

rg -n -B 5 "effectiveDuration" .

```



After:



```bash

rg -n -A 8 "effectiveDuration" .

```



Useful when rapidly understanding a nearby mapping.



Still read the actual file afterward if the logic is important.



\---



\# 19. Search JSON Keys Exactly



If the API response contains:



```json

{

&#x20; "effectiveDurationMinutes": 30

}

```



search:



```bash

rg -n '"effectiveDurationMinutes"|effectiveDurationMinutes' .

```



This may reveal:



```text

DTO

mock

mapper

fixture

test

component

```



It is especially useful for tracing API fields end-to-end.



\---



\# 20. Search Tests



Tests often reveal intended behavior more clearly than components.



Search:



```bash

rg -n -i "schedule|availability|slot|duration" test tests \_\_tests\_\_

```



Flutter:



```bash

rg -n -i "schedule|availability|slot" test/

```



Inspect tests before deciding what behavior is accidental.



\---



\# 21. Search Mocks and Fixtures



A value may appear to come from the API while actually coming from mock data.



Search:



```bash

rg -n -i "mock|fixture|dummy|fake|sample" src lib

```



Then:



```bash

rg -n -i "mock.\*schedule|schedule.\*mock" .

```



Do not confuse development fixtures with canonical backend responses.



\---



\# 22. Search Environment-Dependent Behavior



Search:



```bash

rg -n "process\\.env" src

```



Flutter:



```bash

rg -n "dotenv|String\\.fromEnvironment|--dart-define" lib

```



A fallback endpoint or mock mode may be controlled by environment configuration.



Do not assume behavior is hardcoded until you inspect environment-dependent branches.



\---



\# 23. Search State Management Properly



TanStack Query:



```bash

rg -n "useQuery|useMutation|queryKey|invalidateQueries" src

```



Zustand:



```bash

rg -n "create\\(|createStore|zustand" src

```



Redux:



```bash

rg -n "createSlice|configureStore|useSelector|useDispatch" src

```



Riverpod:



```bash

rg -n "Provider|NotifierProvider|FutureProvider|AsyncNotifier" lib

```



Bloc:



```bash

rg -n "Bloc|Cubit|BlocProvider|BlocBuilder" lib

```



Determine where server state actually lives before adding another state container.



\---



\# 24. Read Architecture Before Writing a New Abstraction



Before creating:



```text

scheduleService

scheduleUtils

scheduleMapper

scheduleStore

scheduleProvider

```



search whether an equivalent abstraction already exists.



Example:



```bash

rg --files | rg -i "schedule"

```



Then:



```bash

rg -n -i "repository|service|mapper|provider|store" <relevant-folder>

```



Do not duplicate architecture merely because you did not search.



\---



\# 25. Required Investigation Sequence



For any frontend data issue, use this order:



```text

1\. Search the visible field/label.

2\. Find the component.

3\. Find where the component receives the value.

4\. Find the hook/provider/store supplying it.

5\. Find the repository/service/API client.

6\. Find the DTO/model/schema.

7\. Find the endpoint.

8\. Inspect whether the backend already provides the required field.

9\. Search all usages of that field.

10\. Search for duplicated calculations.

11\. Search for hardcoded fallbacks.

12\. Search tests and mocks.

13\. Only then propose a change.

```



Do not skip directly from:



```text

UI looks wrong

```



to:



```text

write new calculation

```



\---



\# 26. Example: Investigating Schedule Duration



Do not begin with:



```text

"I need 30-minute slots."

```



Begin with:



```bash

rg -n -i "duration|consultationDuration|durationMinutes|slotDuration" src lib

```



Then search:



```bash

rg -n "30" <relevant-schedule-folders>

```



Then identify:



```text

Does API response contain duration?

Does DTO contain duration?

Does repository transform duration?

Does state store duration?

Does UI ignore duration?

Is 30 only a fallback?

Is 30 duplicated in Flutter and Next.js?

```



Only after this investigation can you decide whether frontend logic is wrong or backend contract is incomplete.



\---



\# 27. Example: Investigating Status



Start:



```bash

rg -n -i "status|open|closed|occupied|full|leave|cuti|buka|tutup|terisi" .

```



Then find enum definitions:



```bash

rg -n "enum .\*Status|type .\*Status|ScheduleStatus|AvailabilityStatus" .

```



Then trace serialization:



```bash

rg -n "fromJson|toJson|parse|safeParse" .

```



Then trace UI mapping.



Do not create a new enum until you know what already exists.



\---



\# 28. Example: Investigating Capacity



Search:



```bash

rg -n -i "capacity|remaining|availableCount|occupiedCount|slotCount" .

```



Then search calculations:



```bash

rg -n "floor|ceil|round|length.\*-|-.+length" <schedule-folders>

```



If the backend already returns:



```text

capacity

remaining

occupied

```



remove unnecessary client-side recomputation.



Do not keep a second algorithm for convenience.



\---



\# 29. Reading Rule: Distinguish Source, Transformation, and Presentation



Every value should be classified.



Example:



```text

effectiveDurationMinutes

```



Ask:



```text

SOURCE:

Where does it originate?



TRANSFORMATION:

Is it mapped or normalized?



STATE:

Where is it retained?



PRESENTATION:

How is it displayed?



MUTATION:

Is it ever submitted back?

```



This makes data provenance explicit.



\---



\# 30. Reading Rule: Determine Whether Logic Is Domain or Presentation



Before moving or deleting any calculation, classify it.



Presentation logic:



```text

format timestamp

translate enum label

choose badge icon

sort UI rows

format currency

```



Domain logic:



```text

determine appointment eligibility

calculate authoritative capacity

derive canonical status

calculate final price

determine permission

validate schedule overlap

```



Do not move domain logic into another frontend helper and call it a refactor.



Question whether it belongs in frontend at all.



\---



\# 31. Reading Rule: Follow Imports



When reading a file, inspect imported modules.



If you see:



```ts

import { getSchedule } from "@/services/schedule";

```



search:



```bash

rg -n "getSchedule" src

```



Then read the service.



If the service imports:



```text

apiClient

```



follow that too.



Continue until you reach the actual transport boundary.



\---



\# 32. Reading Rule: Follow Types



If a component receives:



```ts

schedule: Schedule

```



search:



```bash

rg -n "interface Schedule|type Schedule|class Schedule" src

```



Understand the model before modifying its usage.



The type may expose fields the component currently ignores.



\---



\# 33. Reading Rule: Follow Mutation Results



After a mutation, inspect:



```text

what response is returned

what cache is invalidated

what local state is changed

whether the result is manually reconstructed

```



Search:



```bash

rg -n "invalidateQueries|setQueryData|setState|copyWith" <schedule-folders>

```



A frontend may be corrupting canonical server state after a perfectly valid API response.



\---



\# 34. Never Stop at the First Match



One match proves existence, not ownership.



If:



```bash

rg -n "OPEN" .

```



returns ten locations, inspect the important ones.



There may be:



```text

backend enum copy

UI label map

test fixture

hardcoded filter

obsolete component

```



Do not treat all matches as equivalent.



\---



\# 35. Produce Evidence Before a Refactor



Before changing code, summarize findings in this format:



```text

CONFIRMED SOURCE:

...



API ENDPOINT:

...



RESPONSE FIELD:

...



DTO:

...



STATE OWNER:

...



UI CONSUMERS:

...



DUPLICATED LOGIC:

...



HARDCODED FALLBACK:

...



BACKEND FIELD ALREADY EXISTS:

YES / NO



FRONTEND CHANGE REQUIRED:

...



BACKEND CHANGE REQUIRED:

...



UNKNOWN:

...

```



Every important conclusion should be traceable to actual code.



\---



\# Critical AI Reinforcement



You are not allowed to say:



```text

"The API probably does not provide this."

```



before searching.



You are not allowed to say:



```text

"We can calculate it on the frontend."

```



before verifying whether the backend already calculates it.



You are not allowed to say:



```text

"There is no enum."

```



before searching models, DTOs, generated types, and API schemas.



You are not allowed to create:



```text

new constants

new enums

new calculations

new fallback values

new state

new API wrappers

```



before checking whether an equivalent abstraction already exists.



Use `rg`.



Trace the data.



Read the surrounding code.



Follow the abstraction chain.



Then make the smallest correct architectural change.



The governing rule is:



> \*\*`rg` finds evidence. Reading establishes context. Only evidence plus context justifies a refactor.\*\*



And:



> \*\*Never write frontend domain logic merely because you have not yet searched deeply enough to find the backend contract.\*\*# Frontend Reinforcement — Stop Guessing, Trace the Contract



You are a frontend engineer.



Your job is not to compensate for uncertainty by inventing local logic.



Your job is to discover the existing contract, trace the data flow, and respect the architecture that already exists.



The most important rule is:



> \*\*When you are uncertain, investigate. Do not speculate through code.\*\*



Do not respond to uncertainty by adding:



\* ternaries;

\* fallback values;

\* guessed enum mappings;

\* duplicated constants;

\* derived statuses;

\* local transformations;

\* "temporary" compatibility branches;

\* multiple alternative interpretations.



Uncertainty is not permission to write more code.



Uncertainty is a signal to search deeper.



\---



\# 1. Never Convert UI Labels Into Backend Domain Values by Guessing



This is forbidden:



```ts

status\_sesi: statusSesi === 'Tutup' ? 'CLOSED' : 'OPEN'

```



This code makes several unsupported assumptions:



```text

"Tutup" always means CLOSED

anything other than "Tutup" means OPEN

OPEN and CLOSED are the only backend values

the UI label is the source of truth

the frontend is responsible for translating domain state

```



None of those assumptions are acceptable without evidence.



The correct question is:



```text

What value did the backend originally provide?

```



If the backend response already contains:



```json

{

&#x20; "status\_sesi": "CLOSED"

}

```



then preserve:



```text

CLOSED

```



internally.



The UI may render:



```text

Tutup

```



but when submitting data back, send:



```text

CLOSED

```



not a value reconstructed from the rendered Indonesian label.



\---



\# 2. UI Labels Are Never Canonical State



This:



```text

Tutup

Buka

Terisi

Cuti

Penuh

```



is presentation vocabulary.



This:



```text

CLOSED

OPEN

OCCUPIED

...

```



may be domain vocabulary.



Do not confuse them.



Correct flow:



```text

backend canonical value

&#x20;       ↓

frontend state

&#x20;       ↓

presentation mapping

&#x20;       ↓

Indonesian label

```



Never:



```text

Indonesian label

&#x20;       ↓

frontend guesses meaning

&#x20;       ↓

frontend reconstructs backend enum

```



\---



\# 3. Preserve Canonical Values From the API



If the backend provides:



```ts

status: "CLOSED"

```



the frontend should retain:



```ts

"CLOSED"

```



inside:



```text

DTO

state

form value

mutation payload

```



Only the renderer should translate it:



```text

CLOSED → Tutup

```



The translation is one-way presentation logic.



Do not destroy the canonical value and later try to recreate it.



\---



\# 4. Never Collapse Unknown States Into a Binary Guess



This is especially dangerous:



```ts

status === "Tutup" ? "CLOSED" : "OPEN"

```



because every unknown state becomes:



```text

OPEN

```



That means:



```text

Terisi

Cuti

Penuh

Unknown

Invalid value

API regression

```



could all silently become:



```text

OPEN

```



This hides bugs and corrupts domain semantics.



Never use a default branch that silently creates a valid business state.



\---



\# 5. Do Not Write Defensive Code Against Imaginary Problems



Do not produce code such as:



```ts

const status =

&#x20; value === "Tutup"

&#x20;   ? "CLOSED"

&#x20;   : value === "Buka"

&#x20;     ? "OPEN"

&#x20;     : value === "Terisi"

&#x20;       ? "OCCUPIED"

&#x20;       : "OPEN";

```



This is not robustness.



This is speculation encoded as software.



The code becomes extremely difficult to trace because nobody knows:



```text

which branch represents backend truth?

which branch is compatibility logic?

which branch is temporary?

which branch was invented by the frontend?

```



Do not solve imagined possibilities.



Solve the actual contract.



\---



\# 6. One Known Path Is Better Than Five Hypothetical Paths



Do not constantly ask:



```text

What if backend sends A?

What if backend sends B?

What if old API sends C?

Maybe this field is Indonesian?

Maybe it is English?

Maybe it is null?

Maybe another endpoint behaves differently?

```



and then implement every hypothetical possibility.



Instead:



```text

1\. inspect the endpoint;

2\. inspect the DTO;

3\. inspect actual response handling;

4\. inspect existing types;

5\. identify the real contract;

6\. implement that contract.

```



Code should represent evidence, not anxiety.



\---



\# 7. Do Not Create Alternative Paths Without Evidence



Avoid patterns such as:



```ts

const status =

&#x20; api.status ??

&#x20; api.status\_sesi ??

&#x20; api.sessionStatus ??

&#x20; localStatus ??

&#x20; "OPEN";

```



unless the codebase explicitly supports multiple documented API versions.



A frontend should not become a parser for every field name imaginable.



If the backend contract says:



```text

status\_sesi

```



then consume:



```text

status\_sesi

```



If the contract changes, migrate it properly.



Do not accumulate aliases forever.



\---



\# 8. Never Guess Field Semantics From Their Display Value



If a component displays:



```text

Tutup

```



do not conclude:



```text

backend value must be CLOSED

```



Trace the value backward:



```text

component

↑

view model

↑

state

↑

mapper

↑

DTO

↑

API response

```



Find out what the actual source is.



The UI is the least authoritative layer for domain semantics.



\---



\# 9. Search Before Transforming



Before creating any transformation, use `rg`.



Example:



```bash

rg -n "statusSesi|status\_sesi" .

```



Then:



```bash

rg -n "CLOSED|OPEN|OCCUPIED|Tutup|Buka|Terisi" .

```



Then inspect:



```text

enum definitions

DTO definitions

mappers

API services

query hooks

forms

mutation payloads

```



Do not write a mapper until you know whether a mapper already exists.



\---



\# 10. Trace the Original Value



For every suspicious value, answer:



```text

Where did this originate?

```



For example:



```text

statusSesi

```



Trace:



```text

UI field

→ form state

→ initial form value

→ mapper

→ API response

```



If its original value was:



```text

CLOSED

```



then the frontend should not transform it into:



```text

Tutup

```



inside domain state.



Instead:



```text

state: CLOSED

display: Tutup

```



\---



\# 11. Presentation Mapping Must Be Isolated



If localization is needed, use a dedicated presentation mapping.



Conceptually:



```ts

const SESSION\_STATUS\_LABEL = {

&#x20; OPEN: "Buka",

&#x20; CLOSED: "Tutup",

&#x20; OCCUPIED: "Terisi",

};

```



Then:



```ts

label = SESSION\_STATUS\_LABEL\[status];

```



But the state remains:



```ts

status = "CLOSED";

```



Do not mutate the domain value into the localized label.



\---



\# 12. Form Controls Must Retain Canonical Values



Correct:



```tsx

<SelectItem value="OPEN">

&#x20; Buka

</SelectItem>



<SelectItem value="CLOSED">

&#x20; Tutup

</SelectItem>

```



Then the form stores:



```text

OPEN

CLOSED

```



and the payload sends:



```text

OPEN

CLOSED

```



Forbidden:



```tsx

<SelectItem value="Buka">

&#x20; Buka

</SelectItem>

```



followed later by:



```ts

status === "Buka" ? "OPEN" : "CLOSED"

```



That design destroys canonical state and then tries to reconstruct it.



\---



\# 13. Do Not Use Ternaries as Domain Translators



Be suspicious of patterns such as:



```ts

x === "A" ? "B" : "C"

```



when:



```text

A

B

C

```



are domain values.



A ternary is acceptable for presentation.



For example:



```ts

isLoading ? <Spinner /> : <Content />

```



But this:



```ts

status === "Tutup" ? "CLOSED" : "OPEN"

```



is not presentation logic.



It is domain reconstruction.



Do not do it.



\---



\# 14. Do Not Use Booleans to Destroy Rich Domain State



Avoid:



```ts

const isClosed = status === "Tutup";

```



followed by:



```ts

status: isClosed ? "CLOSED" : "OPEN"

```



If the backend has multiple valid statuses, collapsing them into a boolean destroys information.



Keep the actual enum.



\---



\# 15. Do Not Invent Defaults for Required Domain Values



Forbidden:



```ts

const status = api.status ?? "OPEN";

```



If status is required by the contract and missing, that is a contract failure.



Do not silently create:



```text

OPEN

```



because it happens to be convenient.



This can turn an invalid schedule into a bookable one.



\---



\# 16. Missing Data Should Stay Missing Until Investigated



If a required field is absent:



```text

status = undefined

```



do not immediately create:



```text

status = OPEN

```



First determine:



```text

Was the wrong endpoint called?

Is the field transformed elsewhere?

Is the DTO outdated?

Is the mapper dropping it?

Is the backend response different?

Is the frontend type wrong?

```



Find the source.



\---



\# 17. Respect DTO Boundaries



If the API returns:



```ts

ScheduleResponseDto

```



do not ignore it and construct:



```ts

{

&#x20; id,

&#x20; status,

&#x20; duration,

&#x20; ...

}

```



manually throughout components.



Trace how the DTO should enter the frontend architecture.



Prefer:



```text

response DTO

→ mapper

→ application model

→ state

→ UI

```



not:



```text

response

→ arbitrary destructuring

→ random reconstruction

→ component-specific objects

```



\---



\# 18. Respect Existing Mappers



Before creating:



```text

mapScheduleStatus()

normalizeSchedule()

convertStatus()

transformSession()

```



search:



```bash

rg -n "map.\*Schedule|normalize.\*Schedule|convert.\*Status|transform.\*Session" .

```



There may already be an abstraction responsible for it.



Do not create competing transformation layers.



\---



\# 19. Respect State Management



Do not use component-local state to "fix" server data.



Forbidden architectural pattern:



```text

API says CLOSED

↓

query stores CLOSED

↓

component converts to Tutup

↓

local state stores Tutup

↓

submit converts Tutup back to CLOSED

```



This is unnecessary state destruction and reconstruction.



Correct:



```text

API says CLOSED

↓

query stores CLOSED

↓

form stores CLOSED

↓

UI renders Tutup

↓

submit sends CLOSED

```



One canonical value survives the whole lifecycle.



\---



\# 20. Respect the Abstraction Chain



The expected flow is:



```text

backend

→ API contract

→ DTO

→ API client

→ repository/service

→ state/query

→ presentation

```



Do not skip layers arbitrarily.



Do not let a component invent corrections to domain data because a lower layer was not inspected.



\---



\# 21. Frontend Must Not Become a Compatibility Dumpster



Do not accumulate code like:



```ts

if (status === "Tutup") ...

if (status === "CLOSED") ...

if (status === "closed") ...

if (status === "Close") ...

if (status === 0) ...

```



unless there is a documented migration requiring support for all of them.



If the backend contract is inconsistent, fix or formally normalize it in one deliberate boundary.



Do not scatter compatibility hacks across the UI.



\---



\# 22. One Normalization Boundary Maximum



If legacy backend normalization is genuinely required, perform it once.



For example:



```text

API transport boundary

→ legacy normalization

→ canonical frontend value

```



Then every downstream layer uses the canonical value.



Never normalize repeatedly in:



```text

service

hook

store

form

component

submit handler

```



That makes tracing nearly impossible.



\---



\# 23. Do Not Normalize Without Proving Legacy Variants Exist



Before writing:



```ts

normalizeStatus(value)

```



prove there are multiple real input formats.



Search:



```bash

rg -n "status\_sesi" .

rg -n "\\"OPEN\\"|\\"CLOSED\\"|\\"Tutup\\"|\\"Buka\\"" .

```



Inspect fixtures, tests, responses, and schemas.



If only one format exists, do not invent a normalization layer.



\---



\# 24. Prefer Explicit Failure Over Silent Guessing



If the frontend receives an unknown enum:



```text

UNKNOWN\_STATUS

```



do not map it to:



```text

OPEN

```



Surface it during development.



Conceptually:



```text

Unknown schedule status received: UNKNOWN\_STATUS

```



Contract drift should be obvious.



Silent guessing turns errors into corrupted behavior.



\---



\# 25. Stop Writing Code When the Contract Is Unclear



If you cannot answer:



```text

What exact status values does backend return?

```



do not write a status converter.



If you cannot answer:



```text

Which DTO owns this field?

```



do not create another interface.



If you cannot answer:



```text

Where does this form get its initial value?

```



do not patch its submit handler.



Investigate first.



\---



\# 26. The Correct Thinking Process



Do not think:



```text

"The UI says Tutup.

Backend probably wants CLOSED.

I'll convert it."

```



Think:



```text

"The UI says Tutup.

What canonical value produced this label?"

```



Then trace it.



Do not think:



```text

"This field is undefined.

I'll give it a default."

```



Think:



```text

"Why is a required field undefined?"

```



Then trace it.



Do not think:



```text

"Maybe backend uses multiple values.

I'll support all possibilities."

```



Think:



```text

"What values does the contract actually support?"

```



Then verify them.



\---



\# 27. Evidence-Driven Implementation



Every domain transformation should have a reason.



For example:



```text

TRANSFORMATION:

CLOSED → Tutup



REASON:

presentation localization



SOURCE:

backend ScheduleStatus enum



SCOPE:

rendering only



SUBMISSION VALUE:

CLOSED

```



That is traceable.



This is not:



```text

Tutup → CLOSED



REASON:

seemed correct

```



\---



\# 28. Before Writing a Ternary, Ask These Questions



Before writing:



```ts

condition ? A : B

```



ask:



```text

Is this presentation logic?



Or am I collapsing domain state?



Where do A and B come from?



Does backend already provide the result?



Am I inventing a fallback?



What happens to a third valid state?



Will this hide an unknown state?



Am I destroying information?

```



If it changes domain meaning, stop and investigate.



\---



\# 29. Forbidden Patterns



Avoid these unless explicitly justified by verified architecture:



```ts

status === "Tutup" ? "CLOSED" : "OPEN"

```



```ts

status === "Buka" ? "OPEN" : "CLOSED"

```



```ts

status ?? "OPEN"

```



```ts

duration ?? 30

```



```ts

capacity ?? 10

```



```ts

api.status || localStatus || "OPEN"

```



```ts

status.toLowerCase() === "closed"

```



```ts

label.includes("Tutup")

```



```ts

const isClosed = label === "Tutup"

```



These patterns often indicate that presentation state has leaked into domain logic.



\---



\# 30. Preferred Pattern



Canonical value:



```ts

status = schedule.status;

```



Presentation:



```ts

label = statusLabels\[status];

```



Submission:



```ts

payload.status = status;

```



Conceptually:



```text

CLOSED

&#x20; ↓

state remains CLOSED

&#x20; ↓

UI displays Tutup

&#x20; ↓

submission remains CLOSED

```



No reconstruction.



No guessing.



No loss of information.



\---



\# 31. Required Search Before Any Status Refactor



Run:



```bash

rg -n "statusSesi|status\_sesi|sessionStatus|ScheduleStatus" .

```



Then:



```bash

rg -n "OPEN|CLOSED|OCCUPIED|Tutup|Buka|Terisi|Cuti|Penuh" .

```



Then inspect:



```text

DTO

enum

schema

API client

mapper

query/store

form initial values

form submit handler

UI label mapping

```



Only then modify the implementation.



\---



\# 32. Refactor From the Source, Not the Symptom



If you discover:



```text

backend returns CLOSED

mapper changes it to Tutup

form stores Tutup

submit reconstructs CLOSED

```



do not merely clean up the submit ternary.



Fix the earliest incorrect layer:



```text

backend returns CLOSED

mapper preserves CLOSED

form stores CLOSED

UI renders Tutup

submit sends CLOSED

```



The goal is to remove the unnecessary translation round-trip entirely.



\---



\# 33. Keep the Data Lineage Boring



Good architecture should be easy to trace.



Prefer:



```text

CLOSED

→ CLOSED

→ CLOSED

→ CLOSED

```



with only the UI rendering:



```text

Tutup

```



Do not create:



```text

CLOSED

→ Tutup

→ false

→ "closed"

→ CLOSED

```



The fewer semantic transformations, the easier the system is to reason about.



\---



\# 34. Do Not Optimize for "Making It Work"



Optimize for:



```text

traceability

contract fidelity

single source of truth

predictability

maintainability

```



A patch that makes the screen work while obscuring where values come from is not a successful fix.



\---



\# Mandatory AI Reinforcement



When you feel uncertain, do NOT create more branches.



Do NOT create multiple fallback strategies.



Do NOT support hypothetical formats.



Do NOT invent enum mappings.



Do NOT translate presentation labels back into backend values.



Do NOT add "safe defaults" to required domain fields.



Do NOT use component code to repair contract problems.



Instead:



```text

SEARCH

TRACE

READ

VERIFY

THEN CHANGE

```



The frontend must remain boring and deterministic.



It should primarily:



```text

consume

store

render

submit

```



canonical backend values.



It must not constantly reinterpret them.



The governing rules are:



> \*\*Uncertainty should produce investigation, not branches.\*\*



> \*\*Do not encode anxiety into the codebase.\*\*



> \*\*Do not reconstruct canonical data that you already received.\*\*



> \*\*Preserve backend values end-to-end; localize only at the presentation boundary.\*\*



> \*\*The easiest frontend to maintain is the one that introduces the least new domain truth.\*\*

Ya, ini masalahnya bukan sekadar hardcoding. Masalah utamanya adalah frontend agent terlalu cepat “menyelamatkan” ketidakpastian dengan membuat asumsi lokal, padahal seharusnya dia berhenti, trace kontrak backend, lalu patuh pada data yang benar-benar ada.



Contoh seperti ini memang harus dilarang keras:



status\_sesi: statusSesi === 'Tutup' ? 'CLOSED' : 'OPEN'



karena dia sedang mengarang translasi domain dari label UI menjadi enum backend tanpa bukti bahwa mapping itu benar.bodoh banget gemini seakan akan backend tidak ada  data Nulis code deh. seakan-akan dia tuh takut, anxiety. Apakah ini? Apakah ini? Banyak banget alternatif. Viola, aduh, susah di tracing jadinya nanti. Nah ini reinforcement nih. Tolong buatkan. Buatkan bagaimana dia harusnya berpikir gitu. Reinforcement, front-end. nggak boleh ada sintaks-sintaks kebodohan kayak gini lah.contoh status\_sesi: statusSesi === 'Tutup' ? 'CLOSED' : 'OPEN',# Frontend Contract Fidelity Constraints



\* The frontend MUST NOT invent domain data.

\* The frontend MUST NOT reconstruct backend values from UI labels.

\* The frontend MUST NOT introduce guessed enums, statuses, defaults, fallbacks, capacities, durations, permissions, or derived business states.

\* The frontend MUST NOT duplicate backend business logic.

\* The frontend MUST NOT calculate authoritative domain values if the backend already provides or should provide them.

\* The frontend MUST NOT hide missing API data with hardcoded values.

\* The frontend MUST NOT use localized labels as canonical state.

\* The frontend MUST NOT convert `"Tutup"` back into `"CLOSED"` through ternaries or conditionals.

\* The frontend MUST preserve canonical backend values end-to-end.

\* Localization belongs ONLY to the presentation layer.

\* The frontend MUST respect existing DTOs, schemas, API clients, repositories, abstraction layers, and state-management architecture.

\* The frontend MUST NOT bypass an existing API abstraction by calling endpoints directly from components.

\* The frontend MUST NOT create parallel state for canonical server data without a proven architectural reason.

\* The frontend MUST NOT create new mappers, enums, constants, services, stores, or normalization layers before searching for existing equivalents.

\* The frontend MUST NOT implement hypothetical compatibility paths without evidence that those variants actually exist.

\* Unknown or missing domain values MUST trigger investigation, not fallback behavior.

\* Contract mismatches MUST be exposed, not silently normalized into valid business states.

\* Required backend data that is missing MUST be reported as a backend contract requirement.

\* Before modifying data behavior, the agent MUST inspect the API response, DTO, mapper, repository/service, state layer, and UI consumer.

\* Use `rg` to trace definitions and usages before introducing new logic.

\* Always trace data from source to presentation:



```text

Backend

→ API Contract

→ DTO

→ API Client

→ Repository / Service

→ State / Query

→ Component

→ Presentation

```



\* For mutations, preserve the reverse contract:



```text

Canonical Form Value

→ Mutation

→ API Client

→ Backend

```



\* Never perform this:



```ts

status\_sesi: statusSesi === "Tutup" ? "CLOSED" : "OPEN"

```



\* Prefer this:



```ts

status\_sesi: statusSesi

```



while presentation handles:



```ts

statusLabels\[statusSesi]

```



The governing constraint is:



> \*\*The frontend consumes canonical truth. It does not manufacture, infer, repair, or reinterpret domain truth.\*\*



And when uncertain:



> \*\*Search first. Trace the contract. Read the response. Then change the code.\*\*# Frontend Abstraction \& Separation of Concerns Constraints



The frontend MUST be decomposed by responsibility.



Do not create god files.



Do not create 1,000–2,000 line components that contain:



\* API calls

\* DTO mapping

\* state management

\* business rules

\* form validation

\* mutation logic

\* formatting

\* localization

\* table configuration

\* modal logic

\* rendering

\* permission logic

\* constants

\* helper functions

\* query invalidation



inside one file.



A large file is often evidence that multiple architectural responsibilities have collapsed into one module.



The governing rule is:



> \*\*One file should have one clear reason to change.\*\*



\---



\## 1. Component Responsibility



A UI component should primarily handle:



```text

rendering

interaction

composition

presentation

```



It should NOT become:



```text

API client

repository

domain service

state container

validation engine

DTO mapper

business-rule engine

```



If a component needs all of those responsibilities, the architecture is already wrong.



\---



\## 2. Separate Server State



Server state belongs in the established query/data layer.



Examples:



```text

queries

mutations

repositories

services

API clients

```



Do not embed API orchestration directly into large UI components.



Prefer:



```text

Component

→ Hook / Query

→ Repository / Service

→ API Client

```



not:



```text

Component

→ fetch

→ normalize

→ calculate

→ mutate cache

→ render

```



\---



\## 3. Separate DTOs From UI Models



Transport contracts must not be scattered across components.



Use explicit boundaries:



```text

API DTO

→ Mapper

→ Application / View Model

→ UI

```



Do not construct API payloads manually in many unrelated components.



Do not duplicate DTO shapes.



\---



\## 4. Separate Presentation Mapping



Presentation mappings should live separately.



Examples:



```text

status → label

status → icon

status → badge variant

date → formatted string

```



Do not repeat these mappings across multiple components.



Use one canonical presentation mapping.



\---



\## 5. Separate Form Logic



Complex forms should not keep everything inside one component.



Extract:



```text

schema

default values

form hook

mutation hook

field groups

submit mapper

```



Do not combine:



```text

form rendering

validation

API payload construction

mutation

toast handling

cache invalidation

```



inside one giant file.



\---



\## 6. Separate Mutations



Mutation behavior should be isolated.



Prefer:



```text

useCreateScheduleMutation

useUpdateScheduleMutation

useDeleteScheduleMutation

```



or the equivalent architecture already used by the project.



Do not write mutation orchestration repeatedly inside components.



\---



\## 7. Separate Queries



Data fetching should be isolated.



Prefer:



```text

useScheduleQuery

useDoctorScheduleQuery

useAppointmentQuery

```



or the project's established equivalent.



Do not let every page independently rebuild query keys and fetch behavior.



\---



\## 8. Separate Query Keys



Query keys should not be scattered manually.



Bad:



```ts

\["schedule", doctorId]

```



repeated across 15 files.



Prefer centralized query-key factories or the project's equivalent abstraction.



This prevents invalidation drift.



\---



\## 9. Separate API Endpoints



Endpoint definitions belong in one API abstraction layer.



Do not scatter:



```text

/api/schedule

/api/doctors

/api/appointments

```



through UI components.



The component should not care about endpoint construction.



\---



\## 10. Separate Domain Types



Domain types and enums must have a stable home.



Do not redefine:



```text

ScheduleStatus

AppointmentStatus

DoctorSchedule

Availability

```



inside multiple component files.



Prefer shared canonical types generated from or aligned with backend contracts.



\---



\## 11. Separate Constants



Do not mix business constants, UI constants, route constants, and query constants in component files.



Classify them.



Examples:



```text

domain constants

presentation constants

route constants

query constants

```



But do not create constants for values that should come from backend.



\---



\## 12. Separate Pure Utilities



Pure transformation utilities may live separately if they are truly reusable.



Examples:



```text

formatDate

formatTime

formatCurrency

mapStatusLabel

```



Do not move business logic into `utils.ts` merely to make the component shorter.



Moving bad logic into another file does not make the architecture better.



\---



\## 13. Do Not Create a Generic `utils.ts` Dump



Avoid files like:



```text

utils.ts

helpers.ts

common.ts

misc.ts

```



that slowly become hundreds of unrelated functions.



Prefer domain-specific modules:



```text

schedule-formatters.ts

schedule-mappers.ts

schedule-labels.ts

appointment-formatters.ts

```



Responsibilities should remain discoverable.



\---



\## 14. Feature-Based Boundaries



Prefer organizing code by feature/domain when appropriate.



Example:



```text

features/

&#x20; schedule/

&#x20;   api/

&#x20;   components/

&#x20;   hooks/

&#x20;   mappers/

&#x20;   schemas/

&#x20;   types/

&#x20;   utils/

```



instead of one enormous generic folder containing everything.



The exact structure must respect the existing project architecture.



Do not force a new architecture if the project already has a coherent one.



\---



\## 15. Component Decomposition



If one component renders multiple independent visual regions, consider decomposing it.



Example:



```text

ScheduleDetailSheet

├── ScheduleHeader

├── ScheduleSummary

├── ScheduleTimeline

├── ScheduleActions

└── AppointmentDetail

```



Do not put all of these into a single 1,500-line component.



\---



\## 16. Extract by Responsibility, Not Arbitrarily



Do not split code merely to reduce line count.



Bad decomposition:



```text

component-part-1.tsx

component-part-2.tsx

component-part-3.tsx

```



without meaningful responsibilities.



Good decomposition:



```text

ScheduleHeader

ScheduleTimeline

ScheduleStatusBadge

ScheduleActions

```



Every extraction should represent a coherent responsibility.



\---



\## 17. Hooks Must Also Respect Boundaries



Do not create a giant hook such as:



```text

useEverythingAboutSchedule()

```



that returns 40 values and 25 callbacks.



A hook can become a god object too.



Split concerns where appropriate:



```text

useScheduleQuery

useScheduleForm

useScheduleMutation

useSchedulePermissions

```



only when those responsibilities genuinely differ.



\---



\## 18. Avoid Prop Explosion



If a component receives 20–30 unrelated props, inspect the architecture.



It may indicate:



```text

wrong component boundary

missing composition

missing domain object

prop drilling

too much responsibility

```



Do not solve prop explosion by simply wrapping everything in one giant object without considering ownership.



\---



\## 19. Avoid State Explosion



If one component has:



```text

15 useState calls

10 effects

8 memoized values

12 callbacks

```



stop.



That is a signal to re-evaluate boundaries.



Ask:



```text

Which state belongs to server state?

Which belongs to form state?

Which belongs to UI state?

Which is derived?

Which should not exist at all?

```



\---



\## 20. Avoid Effect-Driven Architecture



Do not use `useEffect` as a universal synchronization mechanism.



Be suspicious when a file contains many effects that:



```text

copy state

transform state

synchronize state

recalculate state

mirror props

```



This often indicates duplicated sources of truth.



Prefer deriving presentation values directly from canonical state.



\---



\## 21. No Manual State Mirroring



Avoid:



```text

API state

→ local state copy

→ transformed state copy

→ form state copy

```



unless each layer has a justified responsibility.



Every extra copy increases synchronization complexity.



\---



\## 22. Separate UI State From Domain State



UI state:



```text

isOpen

activeTab

selectedRow

isExpanded

```



Domain/server state:



```text

schedule status

appointment status

doctor availability

duration

```



Do not mix them into the same store blindly.



\---



\## 23. Separate Validation Responsibilities



Frontend may perform:



```text

required field validation

basic shape validation

UX validation

```



Backend remains responsible for:



```text

authoritative business validation

authorization

conflict validation

domain invariants

```



Do not rebuild backend validation rules inside components.



\---



\## 24. Keep Files Traceable



A developer should be able to answer:



```text

Where is schedule fetching?

Where is schedule mutation?

Where is status rendering?

Where is form validation?

Where is payload mapping?

```



without opening a 2,000-line file and searching manually for everything.



Architecture should reduce search entropy.



\---



\## 25. File Size Is a Signal, Not the Only Rule



Do not enforce line limits mechanically.



But treat the following as review signals:



```text

300+ lines → inspect responsibility

500+ lines → strong decomposition review

800+ lines → likely architectural smell

1000+ lines → almost certainly multiple concerns

2000+ lines → stop and refactor the responsibility boundaries

```



Exceptions may exist for generated files or declarative static data.



Generated files are not the same concern.



\---



\## 26. Before Adding Code to a Large File



Ask:



```text

Does this behavior belong here?



Is there already an abstraction responsible for this?



Can this responsibility be isolated?



Will adding this make the file harder to trace?



Am I mixing server state and UI state?



Am I mixing domain logic and presentation?



Am I duplicating existing behavior?

```



If the answer indicates another responsibility, do not add it to the current file.



\---



\## 27. Read Before Creating New Modules



Use `rg` first.



Example:



```bash

rg --files | rg -i "schedule|appointment|availability"

```



Then:



```bash

rg -n "useSchedule|ScheduleService|ScheduleRepository|ScheduleMapper|ScheduleStatus" .

```



Do not create:



```text

ScheduleServiceV2

NewScheduleUtils

ScheduleHelper

ScheduleManager

```



because you failed to find the existing abstraction.



\---



\## 28. Respect Existing Layering



If the project already follows:



```text

Component

→ Hook

→ Service

→ API Client

```



do not introduce:



```text

Component

→ Repository

→ Store

→ Utility

→ Service

→ API Client

```



without a real architectural requirement.



More abstraction is not automatically better.



The goal is clear ownership, not maximum number of layers.



\---



\## 29. Do Not Over-Abstract



Avoid creating abstractions after one usage merely because abstraction feels "clean."



Do not create:



```text

GenericScheduleFactory

UniversalStatusAdapter

CommonEntityManager

BaseDynamicDataProvider

```



without demonstrated reuse or domain justification.



Prefer simple, explicit code.



\---



\## 30. No Premature Generic Architecture



A schedule feature does not need to become a generic engine for:



```text

schedule

booking

hotel

flight

room

event

inventory

```



unless the product actually requires it.



Abstract around real repetition, not imagined future scenarios.



\---



\## 31. Locality Matters



Keep related code close enough to understand.



Do not split one simple operation across eight files unnecessarily.



Good separation means:



```text

clear responsibilities

clear ownership

clear dependency direction

```



not:



```text

maximum file count

```



\---



\## 32. Dependency Direction



Prefer:



```text

UI

↓

application/state

↓

data access

↓

API

```



Presentation should depend on lower abstractions.



Lower layers should not import UI components.



Avoid circular feature dependencies.



\---



\## 33. No Cross-Layer Imports Without Justification



A component should not directly import:



```text

raw backend transport implementation

database-shaped internal constants

unrelated feature internals

```



Respect module boundaries.



Use public feature APIs where the architecture provides them.



\---



\## 34. Feature Modules Should Expose Intentional APIs



Avoid importing deeply:



```text

features/schedule/internal/helpers/privateMapper

```



from unrelated features.



Prefer explicit exports.



This keeps internal architecture changeable.



\---



\## 35. Avoid Circular Dependencies



When splitting large files, ensure decomposition does not produce:



```text

A imports B

B imports C

C imports A

```



If circular dependencies appear, responsibilities may still be incorrectly defined.



\---



\## 36. Keep Mutation Side Effects Centralized



Side effects such as:



```text

toast

cache invalidation

navigation

analytics

```



should not be duplicated in every component performing the same mutation.



Centralize them at the appropriate mutation/application boundary where practical.



\---



\## 37. Avoid Copy-Paste Variants



If create/edit/detail components contain 80% identical logic, investigate reusable abstractions.



Do not copy:



```text

form fields

status mapping

validation

payload construction

```



three times.



But do not over-generalize unrelated flows either.



\---



\## 38. Reuse Domain Forms Carefully



Shared form primitives may be appropriate:



```text

DoctorSelector

ScheduleDateField

StartTimeField

```



while create/edit flows may still retain separate orchestration.



Reuse stable UI responsibility, not entire workflows blindly.



\---



\## 39. Refactor From the Largest Responsibility Boundary First



When encountering a 2,000-line file, do not randomly extract functions.



First classify the file into sections:



```text

API/data access

server state

form state

domain transformations

presentation mappings

handlers

rendering

subcomponents

```



Then move each concern toward its correct architectural layer.



\---



\## 40. Refactor in Traceable Steps



Recommended sequence:



```text

1\. identify existing responsibilities

2\. identify backend-owned logic that should disappear

3\. isolate API access

4\. isolate DTO/mappers

5\. isolate server-state queries/mutations

6\. isolate form logic

7\. isolate presentation mappings

8\. extract coherent visual components

9\. remove duplicated state

10\. simplify the root component

```



Do not perform random file splitting.



\---



\# Anti-God-File Rule



A file must not simultaneously own:



```text

data fetching

business computation

form state

mutation orchestration

validation

presentation mapping

UI rendering

```



If it does, decomposition is mandatory.



\---



\# Anti-God-Hook Rule



A hook must not become a hidden 1,000-line controller containing every behavior in the feature.



Moving a god component into a god hook is not a refactor.



\---



\# Anti-God-Service Rule



Do not solve frontend complexity by creating one enormous:



```text

ScheduleService

```



with dozens of unrelated responsibilities.



Services must also have coherent boundaries.



\---



\# Mandatory Agent Thinking Model



Before adding code, classify the responsibility:



```text

Is this API/data-access logic?

Is this server-state logic?

Is this form logic?

Is this presentation logic?

Is this localization?

Is this domain logic that should actually belong to backend?

Is this a reusable UI component?

```



Then place it in the correct layer.



If you cannot classify the responsibility, do not code yet.



\---



\# Governing Principles



> \*\*Separate by responsibility, not by arbitrary file size.\*\*



> \*\*A component should render the domain, not become the domain.\*\*



> \*\*A hook should orchestrate one concern, not become a hidden controller for the entire feature.\*\*



> \*\*A utility file is not a landfill.\*\*



> \*\*Moving code into another file is not abstraction unless ownership becomes clearer.\*\*



> \*\*The architecture should make tracing easier, not merely make individual files shorter.\*\*



> \*\*If a feature requires reading 2,000 lines to understand one user action, the boundaries are wrong.\*\*

