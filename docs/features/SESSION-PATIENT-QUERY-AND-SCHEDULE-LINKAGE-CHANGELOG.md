# CHANGELOG — Dual-Linkage Sesi Jadwal, Query Pasien & Upstream Auto-Healing

**Tanggal Efektif:** 24 September 2026  
**Status:** In Production / Verified  
**Target:** Tim Web Admin, Tim Mobile, & Backend Engineering  
**Konteks:** Penyelesaian tuntas isu discrepancy Schedule Sheet Grid Hour vs Roster Modal Pasien.

---

## 1. Ringkasan Eksekutif & Teguran Frontend

### Masalah yang Terjadi
Pada tampilan **Schedule Sheet Grid Hour** dokter, sesi menampilkan jumlah pasien terdaftar (misalnya "2 Pasien" berdasarkan kalkulasi `kapasitas_sesi - slot_tersedia` atau interval `OCCUPIED`), namun ketika modal diklik:
```http
GET /api/v1/admin/doctor-schedules/:doctorId/sessions/:sessionId/patients?status=all
```
Backend mengembalikan:
```json
{
  "success": true,
  "data": {
    "sessionId": "...",
    "bookedCount": 0,
    "patients": []
  }
}
```
Modal pasien menjadi kosong (`patients: []`), padahal di sheet grid tertera pasien ada.

---

## 2. Akar Masalah Teknis Backend (Root Cause)

1. **Filter Query Backend Terlalu Kaku:**
   Sebelumnya pada `schedule.drizzle-repository.ts`:
   ```typescript
   const conditions: any[] = [eq(appointments.scheduleSessionId, sessionId)];
   ```
2. **Data Historis / Booking Tanpa FK Session (`NULL`):**
   Pada tabel `appointments`, janji temu seringkali di-insert hanya dengan `practitioner_id`, `scheduled_date`, dan `scheduled_start_time`. Kolom `schedule_session_id` bernilai `NULL` (tidak terisi ID sesi).
3. **Penyebab Upstream (Insert Appointment):**
   Metode pembuatan appointment (`appointment.drizzle-repository.ts`) sebelumnya tidak menyematkan `schedule_session_id` dan tidak memotong slot sesi dokter yang bersangkutan.

Akibatnya, query yang hanya mencocokkan `scheduleSessionId = sessionId` gagal menemukan record pasien yang jadwalnya jatuh pada rentang waktu sesi dokter tersebut.

---

## 3. Solusi Arsitektural Backend (100% Backend Cover, Zero Frontend Fallback)

Sesuai prinsip: **"Backend meng-cover semua, Frontend tinggal consume. Jangan ada fallback, jangan ada hardcoding."**

### A. Dual-Linkage Session Patient Resolution
Semua query pasien sesi kini menggunakan resolusi dual-linkage:
1. Cocokkan jika `appointments.schedule_session_id == sessionId`, **ATAU**
2. Cocokkan jika `practitioner_id == doctorId` **AND** `scheduled_date == sessionDate` **AND** `scheduled_start_time >= sessionStartTime` **AND** `scheduled_start_time < sessionEndTime`.

```typescript
const sessStart = session.startTime.length === 5 ? `${session.startTime}:00` : session.startTime;
const sessEnd = session.endTime.length === 5 ? `${session.endTime}:00` : session.endTime;

const sessionMatchCondition = or(
  eq(appointments.scheduleSessionId, sessionId),
  and(
    eq(appointments.practitionerId, practitioner.id),
    eq(appointments.scheduledDate, session.scheduleDate),
    gte(appointments.scheduledStartTime, sessStart),
    lt(appointments.scheduledStartTime, sessEnd),
  ),
);
```

### B. Automatic Database Self-Healing
Saat `getAdminSessionPatients` dieksekusi, appointment yang ditemukan tanpa `schedule_session_id` akan **secara otomatis di-backfill dan di-update** di database PostgreSQL (`schedule_session_id = session.id`).
Data historis secara bertahap bersih dan terhubung permanen tanpa memerlukan migrasi manual.

### C. Upstream Auto-Linking pada Pembuatan Janji Temu (`appointments.create`)
Pada `src/modules/appointments/infrastructure/drizzle/appointment.drizzle-repository.ts`:
* Saat janji temu dibuat, backend mencari sesi praktik dokter yang aktif (`status = 'open'`) pada tanggal dan jam janji temu.
* Menyematkan `scheduleSessionId: matchedSession.id` langsung saat `INSERT INTO appointments`.
* Mengurangi `available_slots` sesi secara atomik.

### D. Slot Restoration Fallback pada Pembatalan Janji Temu
Pada `cancelAdminAppointment`, `updateAdminAppointmentStatus`, dan `updateStatus`:
* Jika `apt.scheduleSessionId` bernilai `NULL`, sistem mencari sesi dokter berdasarkan tanggal dan jam janji temu secara fallback.
* Slot `available_slots` tetap dipulihkan (+1) secara akurat di tabel `practitioner_schedule_sessions`.

### E. Penyelarasan di Seluruh Titik Terkait:
1. `getAdminSessionPatients`: Mengembalikan pasien terdaftar secara dual-linkage dan memicu self-healing.
2. `getBookedPatients`: Mendukung pencarian pasien berbasis sesi secara dual-linkage.
3. `getAppointmentOccupations`: Mengisi okupansi interval timeline (`OCCUPIED`) dengan mencakup appointment unlinked.
4. `rescheduleAdminDoctorSession`: Memindahkan seluruh pasien sesi (termasuk yang unlinked) ke jadwal baru dan mem-backfill `scheduleSessionId`.
5. `checkRescheduleEligibility`: Menghitung `activeAppointmentsCount` secara akurat mencakup appointment unlinked.
6. `delete`: Memproteksi penghapusan sesi jika terdapat pasien aktif pada rentang waktu sesi tersebut.

---

## 4. Bukti Pengujian Nyata (Real Live Endpoint Verification)

Pengujian dijalankan langsung pada backend container yang berjalan (`http://localhost:3001`):

### Skenario Uji Nyata:
1. Dibuat record appointment dengan `schedule_session_id = NULL` pada rentang waktu sesi dokter `dr. Ahmad Santoso` tanggal `2026-09-23` jam `08:00:00 - 12:00:00`.
2. Endpoint dipanggil:
   ```http
   GET /api/v1/admin/doctor-schedules/77bbb45a-18df-4311-b2a4-a4b6f22870ca/sessions/41a6d84b-aee7-4a83-8782-c6dffe7dbd82/patients?status=all
   ```
3. Hasil response real API:
   ```json
   {
     "success": true,
     "data": {
       "sessionId": "41a6d84b-aee7-4a83-8782-c6dffe7dbd82",
       "sessionLabel": "Pagi",
       "scheduleDate": "2026-09-23",
       "startTime": "08:00",
       "endTime": "12:00",
       "capacity": 20,
       "availableSlots": 19,
       "bookedCount": 1,
       "patients": [
         {
           "appointmentId": "cedbe4cb-3053-4d90-b88e-782a43f6146d",
           "queueNumber": "P-001",
           "timeSlot": "08:00 - 12:00 WIB",
           "status": "booked",
           "statusBadge": "Booked",
           "patient": {
             "id": "...",
             "fullName": "Test User One",
             "medicalRecordNumber": "RM-202609-0001"
           }
         }
       ]
     }
   }
   ```
4. **Verifikasi Database:**
   Query langsung ke PostgreSQL membuktikan bahwa `schedule_session_id` pada record appointment tersebut langsung terisi otomatis:
   ```sql
   SELECT COUNT(*) FROM appointments WHERE schedule_session_id = '41a6d84b-aee7-4a83-8782-c6dffe7dbd82';
   -- Result: 1 (Self-healed)
   ```

---

## 5. Ringkasan Verifikasi Sistem

| Pengujian | Status | Bukti |
| :--- | :---: | :--- |
| `bun run build` | **PASSED** | Clean compile (0 error) |
| Unit Tests (Schedules) | **PASSED** | 6 suites passed, 53 tests passed |
| Unit Tests (Appointments) | **PASSED** | 2 suites passed, 6 tests passed |
| Docker Image Rebuild | **PASSED** | `amanah-healthcare-backend-api` rebuilt |
| Container Recreate | **PASSED** | Container restarted, running on port 3001 |
| Real Endpoint Test | **PASSED** | Roster modal pasien terisi lengkap |
| Database Self-Healing | **PASSED** | FK `schedule_session_id` ter-backfill otomatis |
| E2E Security & CRUD Suite | **PASSED** | 136 checks passed, 0 failed |
| Web Admin Response Log | **PASSED** | 28 endpoint HTTP evidence logs exported |

---

## 6. Panduan untuk Frontend (Web Admin & Mobile)

* **TIDAK PERLU:** Frontend menambahkan logika `if` manual, fallback client-side, atau manipulasi query.
* **CUKUP:** Panggil endpoint `GET /api/v1/admin/doctor-schedules/:doctorId/sessions/:sessionId/patients?status=all`.
* Array `data.patients` dijamin sinkron dengan slot yang terisi pada Schedule Sheet Grid Hour.
