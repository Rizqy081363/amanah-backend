# Amanah Healthcare — Panduan Resmi Sekuritas & Siklus Lengkap CRUD Jadwal (Schedule V2)

**Versi Dokumen:** 2.3.0  
**Target Pembaca:** Tim Frontend Web Admin & Tim Mobile Engineering  
**Backend Service:** Amanah Healthcare Backend v1.2.0  
**Base URL:** `http://localhost:3001/api/v1` (Development) / Gateway Base URL (Production)  

---

## 1. Aturan Sekuritas & Autentikasi (Penyebab Error 401 & Solusinya)

### 1.1 Mengapa Muncul Error 401: `"Sesi autentikasi tidak valid atau token tidak disertakan"`?
Error ini muncul dari guard backend (`HybridAuthGuard`) karena salah satu dari kondisi berikut:
1. **Header `Authorization` Tidak Dikirim:** Frontend menembak API tanpa menyertakan HTTP Header `Authorization`.
2. **Format Header Salah:** Tidak menggunakan format standar `Bearer <TOKEN>`. Contoh yang salah: `Token <TOKEN>`, `<TOKEN>`, atau salah ketik `bearer`.
3. **Token Bernilai `null`, `undefined`, atau Kosong:** Frontend mengambil token dari state/cookies/storage yang belum terisi atau sudah terhapus.
4. **Token Kadaluwarsa (Expired) atau Dicabut (Blacklisted):** Token akses JWT telah melewati masa berlakunya dan frontend belum melakukan refresh token.

### 1.2 Aturan Wajib Header HTTP di Semua Request
Setiap panggilan endpoint (kecuali endpoint publik seperti login) **WAJIB menyertakan header berikut**:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

### 1.3 Alur Autentikasi Resmi (Login & Refresh Token)

#### A. Login Email & Password (`POST /api/v1/auth/email/login`)
Frontend melakukan autentikasi awal untuk mendapatkan Access Token:

```http
POST /api/v1/auth/email/login HTTP/1.1
Content-Type: application/json

{
  "email": "admin@amanah.com",
  "password": "secretPassword123"
}
```

**Response Sukses (`200 OK`):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenExpires": 1758690000000,
  "user": {
    "id": "c1f7a01d-55e1-45d2-b0e2-7634f19b2184",
    "email": "admin@amanah.com",
    "name": "Super Admin",
    "role": {
      "id": 1,
      "name": "Admin",
      "code": "admin"
    }
  }
}
```
> **Aturan Frontend:** Simpan `token` (Access Token) dan `refreshToken`. Sertakan `token` tersebut di setiap request selanjutnya pada header `Authorization: Bearer <token>`.

#### B. Perpanjang Sesi / Refresh Token (`POST /api/v1/auth/refresh`)
Ketika Access Token kadaluwarsa (atau mendekati expired):

```http
POST /api/v1/auth/refresh HTTP/1.1
Authorization: Bearer <REFRESH_TOKEN>
```
Backend akan mengembalikan token baru.

### 1.4 Matriks Otorisasi Berbasis Peran (RBAC)

| Peran Akun (Role) | Hak Akses Jadwal | Batasan Keamanan |
|---|---|---|
| **`ADMIN`** | Akses penuh ke seluruh supervisi dokter (`/admin/doctor-schedules/*`) dan referensi. | **DILARANG MENGHAPUS** sesi jadwal dokter (`DELETE` diblokir permanen dengan `403 Forbidden`). Wajib gunakan Reschedule atau tutup sesi. |
| **`STAF` (Dokter / Bidan)** | Akses jadwal praktik milik sendiri (`/schedules/*`). | **IDOR / BOLA Protected:** Dokter A dilarang membaca, mengubah, atau menghapus jadwal Dokter B (diblokir dengan `403 Forbidden`). Dilarang mengakses endpoint admin. |
| **`PATIENT`** | Hanya membaca jadwal dokter publik untuk reservasi. | **Dilarang** mengakses endpoint manajemen jadwal internal (diblokir dengan `403 Forbidden`). |

---

## 2. Katalog Lengkap Seluruh Proses CRUD Jadwal

Berikut adalah dokumentasi in-and-out untuk seluruh siklus hidup (**Create, Read, Update, Delete**) jadwal dokter:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SIKLUS CRUD JADWAL DOKTER                       │
├───────────────┬────────────────────────────────────────────────────────┤
│ C (Create)    │ • POST /schedules/availability (Dokter/Staf)           │
│               │ • POST /admin/doctor-schedules/:id/sessions (Admin)   │
├───────────────┼────────────────────────────────────────────────────────┤
│ R (Read)      │ • GET /schedules/my-schedules (Daftar Jadwal Dokter)   │
│               │ • GET /schedules/:id (Detail Sesi)                     │
│               │ • GET /schedules/occupancy-overview (Anti-Collision)   │
│               │ • GET /schedules/:id/booked-patients (Daftar Pasien)   │
│               │ • GET /admin/doctor-schedules (Supervisi Seluruh Dr)   │
│               │ • GET /admin/doctor-schedules/:id (Detail + Gantt)     │
│               │ • GET /schedules/reference/rooms (Master Ruangan)      │
│               │ • GET /schedules/reference/polikliniks (Master Poli)   │
├───────────────┼────────────────────────────────────────────────────────┤
│ U (Update)    │ • PATCH /schedules/:id/availability (Toggle Buka/Tutup)│
│               │ • PATCH /schedules/:id (Ubah Notes, Ruang, Kuota)      │
│               │ • POST /admin/.../reschedule (Pindah Hari/Jam + Pasien)│
│               │ • PATCH /admin/.../sessions/:sessionId (Edit Sesi Admin│
│               │ • PATCH /admin/.../duration (Ubah Durasi Konsultasi Dr)│
│               │ • PATCH /admin/.../day-status (Ubah Status Hari Dr)    │
├───────────────┼────────────────────────────────────────────────────────┤
│ D (Delete)    │ • DELETE /schedules/:id (Dokter: Hanya jika 0 booking) │
│               │ • DELETE /admin/.../sessions/:id (Admin: DILARANG 403) │
└───────────────┴────────────────────────────────────────────────────────┘
```

---

## 3. Spesifikasi Detail: CREATE (Tambah Jadwal)

### 3.1 Dokter / Staf Tambah Jadwal (`POST /api/v1/schedules/availability`)
Dokter memilih jam mulai (`startTime`). Backend otomatis menghitung jam selesai (`endTime = startTime + 30m`), kuota, dan interval.

```http
POST /api/v1/schedules/availability HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
Content-Type: application/json

{
  "date": "2026-09-25",
  "scheduleContextId": "morning",
  "startTime": "08:45",
  "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
  "notes": "Praktek poli pagi"
}
```

* **Field Wajib:** `date` (`YYYY-MM-DD`), `scheduleContextId` (`early_morning` | `morning` | `afternoon` | `night`), `startTime` (`HH:mm`).
* **Field Opsional:** `roomId` (`UUID`), `notes` (`string`).
* **Response Sukses (`201 Created`):**
  Mengembalikan objek `schedule` (tersimpan di DB dengan `endTime: "09:15"`, `capacity: 1`) dan objek `projection` (menampilkan `remainingShiftSlots: 5`).

---

## 4. Spesifikasi Detail: READ (Lihat Jadwal & Referensi)

### 4.1 Dokter Melihat Jadwal Hari Ini (`GET /api/v1/schedules/my-schedules`)
```http
GET /api/v1/schedules/my-schedules?date=2026-09-25 HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
```
* **Response (`200 OK`):** Array sesi jadwal dokter yang sedang login pada tanggal tersebut.

### 4.2 Detail 1 Sesi Jadwal (`GET /api/v1/schedules/:id`)
```http
GET /api/v1/schedules/8489be4c-7c05-4c07-b352-7bf579b29cb1 HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
```

### 4.3 Anti-Collision Slot Overview (`GET /api/v1/schedules/occupancy-overview`)
Menampilkan peta okupansi seluruh 4 shift untuk tanggal terpilih sebelum dokter/admin memilih jam agar tidak bentrok.
```http
GET /api/v1/schedules/occupancy-overview?date=2026-09-25&roomId=e3067341-a185-484d-91d6-84848fcff1ef HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
```
* **Bagi Dokter:** Parameter `staffId` otomatis diambil dari login dokter (IDOR protected).
* **Bagi Admin:** Dapat menyertakan `&staffId={doctorId}` untuk mengecek jadwal dokter mana pun.
* **Response (`200 OK`):**
  Objek `summary` dan array 4 `shifts` (`early_morning`, `morning`, `afternoon`, `night`). Setiap slot memiliki:
  * `isAvailable: true` $\to$ Tombol slot bisa dipilih (`status: "AVAILABLE"`).
  * `isAvailable: false` $\to$ Tombol slot dinonaktifkan (`status: "OCCUPIED_BY_SELF"` atau `"OCCUPIED_BY_OTHER"`).

### 4.4 Master Referensi Ruangan Bebas Hardcode (`GET /api/v1/schedules/reference/rooms`)
```http
GET /api/v1/schedules/reference/rooms HTTP/1.1
Authorization: Bearer <JWT_TOKEN>
```
* Mengembalikan seluruh ruangan aktif untuk dropdown form: `id`, `name`, `code`, `location`, `floor`.

### 4.5 Admin Melihat Detail Dokter & Gantt Chart (`GET /api/v1/admin/doctor-schedules/:id`)
```http
GET /api/v1/admin/doctor-schedules/3cb62e10-450b-43e5-aba9-49ec37079ebb?date=2026-09-25 HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
```
* **Response (`200 OK`):** Data dokter, status dokter (`Buka`/`Terisi`/`Tutup`), `sesi_harian` (daftar sesi), dan `timeline_intervals` (interval Gantt chart ter-serialisasi).

---

## 5. Spesifikasi Detail: UPDATE (Ubah Jadwal)

### 5.1 Dokter Toggle Status Buka / Tutup (`PATCH /api/v1/schedules/:id/availability`)
Dokter menutup atau membuka sesi praktiknya secara mandiri:
```http
PATCH /api/v1/schedules/8489be4c-7c05-4c07-b352-7bf579b29cb1/availability HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
Content-Type: application/json

{
  "isAvailable": false
}
```
* **Response (`200 OK`):** Status berubah menjadi `"Tutup"` (`closed`).

### 5.2 Dokter Edit Ruangan / Catatan (`PATCH /api/v1/schedules/:id`)
```http
PATCH /api/v1/schedules/8489be4c-7c05-4c07-b352-7bf579b29cb1 HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
Content-Type: application/json

{
  "notes": "Praktek poli pagi ruang 2",
  "roomId": "4a713919-0128-4448-936e-5ec80f55cf01"
}
```

### 5.3 Admin Reschedule Sesi ke Tanggal / Jam Baru (`POST .../reschedule`)
Memindahkan sesi praktik dokter ke tanggal atau jam lain dan **otomatis menggeser seluruh janji temu pasien aktif**:

```http
POST /api/v1/admin/doctor-schedules/{doctorId}/sessions/{sessionId}/reschedule HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
Content-Type: application/json

{
  "targetDate": "2026-10-15",
  "targetStartTime": "09:00",
  "targetRoomId": "e3067341-a185-484d-91d6-84848fcff1ef",
  "notes": "Dokter dialihkan ke sesi pagi",
  "rescheduleActiveAppointments": true
}
```
* **`targetDate` (Wajib):** Tanggal baru `YYYY-MM-DD`.
* **`targetStartTime` (Wajib):** Jam mulai baru `HH:mm`. Jam selesai otomatis dihitung backend.
* **`targetRoomId` (Opsional):** Ruangan baru.
* **`notes` (Opsional):** Catatan pemindahan. (Jika tidak butuh input catatan di UI, field ini tidak perlu dikirim).
* **`rescheduleActiveAppointments` (Opsional, default `true`):** Otomatis memindahkan janji temu pasien.

---

## 6. Spesifikasi Detail: DELETE (Hapus Jadwal)

### 6.1 Penghapusan oleh Dokter (`DELETE /api/v1/schedules/:id`)
Dokter dapat membatalkan/menghapus jadwal praktiknya sendiri:
```http
DELETE /api/v1/schedules/8489be4c-7c05-4c07-b352-7bf579b29cb1 HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
```
* **Kondisi 1 (Sesi Kosong / Belum Ada Pasien):**
  * Terhapus dengan status **`204 No Content`**.
* **Kondisi 2 (Sesi Sudah Ada Pasien Terdaftar):**
  * Ditolak dengan status **`409 Conflict`** (`SCHEDULE_HAS_ACTIVE_BOOKINGS`).
  * *Pesan:* *"Jadwal tidak dapat dihapus karena sudah ada pasien terdaftar. Silakan batalkan atau pindahkan pasien terlebih dahulu."*

### 6.2 Larangan Penghapusan bagi Admin (`DELETE .../sessions/:sessionId`)
```http
DELETE /api/v1/admin/doctor-schedules/{doctorId}/sessions/{sessionId} HTTP/1.1
Authorization: Bearer <ADMIN_JWT_TOKEN>
```
* **Respons:** **`403 Forbidden`** (`ADMIN_SCHEDULE_DELETION_PROHIBITED`).
* **Aturan:** Administrator klinik **dilarang menghapus sesi jadwal dokter** demi menjaga integritas data klinis dan histori rekam medis. Admin diwajibkan menggunakan fitur Reschedule atau mengubah status menjadi Tutup/Cuti.

---

## 7. Matriks Status HTTP & Error Code Lengkap

| HTTP Status | Error Code | Penyebab | Solusi untuk Frontend |
|---|---|---|---|
| **`401 Unauthorized`** | `UNAUTHORIZED` | Header `Authorization: Bearer <token>` tidak dikirim, format salah, atau token expired. | Pastikan token tersimpan dan dikirimkan di header HTTP. Lakukan re-login jika token expired. |
| **`403 Forbidden`** | `FORBIDDEN` | Akun tidak memiliki hak akses role (misal: Pasien memanggil endpoint dokter, atau Dokter memanggil endpoint admin). | Periksa peran user yang sedang login. |
| **`403 Forbidden`** | `ADMIN_SCHEDULE_DELETION_PROHIBITED` | Admin memanggil endpoint `DELETE` sesi jadwal. | Hapus tombol delete di Web Admin. Gunakan tombol Reschedule atau Ubah Status. |
| **`404 Not Found`** | `NOT_FOUND` | ID dokter atau ID sesi tidak ada di database. | Pastikan UUID parameter URL valid. |
| **`409 Conflict`** | `PRACTITIONER_ALREADY_SCHEDULED` | Dokter sudah memiliki jadwal lain pada rentang jam tersebut. | Tampilkan dialog bentrok, minta user memilih jam lain. |
| **`409 Conflict`** | `ROOM_ALREADY_OCCUPIED` | Ruangan target sudah digunakan oleh praktisi lain. | Minta user memilih ruangan lain atau jam lain. |
| **`409 Conflict`** | `DATE_CLOSED` | Dokter tercatat sedang cuti pada tanggal tersebut. | Minta user memilih tanggal di luar periode cuti dokter. |
| **`409 Conflict`** | `SCHEDULE_HAS_ACTIVE_BOOKINGS` | Dokter menghapus jadwal yang sudah ada antrean pasiennya. | Minta dokter membatalkan/memindahkan janji temu pasien terlebih dahulu. |
| **`422 Unprocessable`** | `START_OUTSIDE_BOUNDARY` | Jam mulai berada di luar batas waktu shift (misal: `05:30` di shift pagi `06:00-12:00`). | Pastikan jam mulai berada dalam rentang shift yang dipilih. |
| **`422 Unprocessable`** | `DURATION_LEAVES_NO_CAPACITY` | Jam mulai terlalu mepet dengan akhir batas shift sehingga tidak menghasilkan kuota konsultasi minimal. | Pilih jam mulai yang menyisakan minimal 1 durasi konsultasi (30 menit). |
