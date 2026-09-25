# Flutter Mobile — Schedule V2 Integration & Migration Guide

**Document Version:** 2.0.0  
**Target Audience:** Flutter Mobile Engineers (`packages/amanah_healthcare`)  
**Backend API Version:** Amanah Healthcare Backend v1.2.0  
**Reference Directives:**
- `# Flutter Schedule Backend Delegation Report (2026-09-23)`  
- `# ARCHITECTURAL DIRECTIVE & TECHNICAL REPRIMAND (2026-09-24)`

---

## 1. Executive Summary & Architectural Compliance

In direct response to the **Architectural Directive & Technical Reprimand** issued by the Mobile Engineering & Client Platform Team, the backend engineering team has formally established the backend as the **Single Source of Truth (SSOT)** for all scheduling calculations:

1. **Zero Client-Side Arithmetic (Strict SSOT):**
   - Flutter is strictly a **consumer and presentation layer**.
   - Flutter **NEVER** derives `endTime = startTime + duration`, slices time intervals, calculates shift capacities, or enforces session boundary clamps.
   - **Single Consultation Session by Default:**
     Ketika dokter memilih jam mulai (misal `02:00` pada shift Dini Hari atau `06:00` pada shift Pagi), backend secara default membuat **1 sesi konsultasi tunggal** dengan durasi sesuai konfigurasi dokter (default: 30 menit):
     $$\text{Derived End Time} = \text{Start Time} + \text{Consultation Duration Minutes}$$
     $$\text{Capacity} = 1 \quad (\text{Available Slots} = 1)$$
     *Contoh:* Input `startTime: "02:00"` pada shift Dini Hari (`00:00 - 06:00`) menghasilkan sesi `02:00 - 02:30` (kapasitas 1), **bukan** mengisi seluruh shift sampai `06:00` (yang sebelumnya memblokir 4 jam penuh dan menyebabkan bentrok 409 pada slot berikutnya).
   - **Remaining Shift Slots (Sisa Slot Shift):**
     Backend menghitung berapa slot konsultasi yang masih tersisa menuju batas akhir shift:
     $$\text{Remaining Shift Slots} = \left\lfloor \frac{\text{Shift Boundary End Time} - \text{Session End Time}}{\text{Consultation Duration Minutes}} \right\rfloor$$
     *Contoh:* Sesi `02:00 - 02:30` pada Dini Hari (`00:00 - 06:00`) menyisakan 210 menit menuju jam `06:00`, sehingga `remainingShiftSlots = 7`.
     *Contoh:* Sesi `06:00 - 06:30` pada Pagi (`06:00 - 12:00`) menyisakan 330 menit menuju jam `12:00`, sehingga `remainingShiftSlots = 11`.
   - **Opsi Multi-Slot (Jika Diperlukan):**
     Jika klien ingin membuat sesi dengan lebih dari 1 slot sekaligus, sertakan salah satu parameter opsional:
     - `slotsCount`: Jumlah slot berurutan (misal `slotsCount: 2` dari `06:00` menghasilkan `06:00 - 07:00`, kapasitas 2).
     - `endTime`: Jam selesai spesifik (misal `endTime: "08:00"`).
     - `fillShift`: Boolean `true` jika dokter secara eksplisit ingin membuka seluruh shift hingga batas akhir (`boundaryEndTime`).

2. **Practitioner Consultation Duration Policy:**
   - Lives authoritatively in PostgreSQL (`practitioners.consultation_duration_minutes`).
   - Configurable per doctor by Clinic Administrators (default: `30` mins; range: 5 to 240 mins).
   - Delivered to Flutter via `GET /api/v1/schedules/contexts` as `effectiveConsultationDurationMinutes` with `durationEditableByCurrentUser = false` (read-only for doctors).

3. **Arbitrary Start Times Supported:**
   - Any valid minute-precision start time is permitted (e.g., `08:00`, `08:15`, `08:45`, `09:10`, `09:40`).
   - The backend does **not** round starts to hourly boundaries. A start of `08:45` will project intervals starting at `08:45` onwards.

4. **Elimination of Ambiguous Status `Penuh` & Removal of Manual `Terisi`:**
   - Clinical consultations are discrete 1-on-1 bookings, not bulk airline seating.
   - **Status "Terisi" adalah Kehendak Sistem (System-Derived State), Bukan Pilihan Dropdown:**
     Dokter atau admin tidak boleh secara manual memilih status "Terisi" pada form edit jadwal. Status "Terisi" hanya dievaluasi secara otomatis oleh backend apabila:
     a. Terdapat janji temu pasien aktif (`booked`, `checked_in`, `waiting`, `in_service`).
     b. Slot kapasitas yang tersedia telah habis (`availableSlots === 0`).
   - **Form / Modal Edit Jadwal Wajib Menggunakan Binary Switcher (`Buka` vs `Tutup`):**
     Dropdown pilihan status yang diedit oleh user kini strictly binary:
     ```json
     "statuses": [
       { "id": "OPEN", "label": "Buka" },
       { "id": "CLOSED", "label": "Tutup" }
     ]
     ```
     Flutter **HARUS** menggunakan toggle / switcher (`Buka` / `Tutup`) di form edit jadwal. Status `OCCUPIED` ('Terisi') tetap ada hanya pada level pembacaan interval slot konsultasi (`canonicalIntervalStatuses`), bukan opsi mutasi.

5. **Format Waktu Standar 24-Jam (`HH:mm`):**
   - Seluruh payload input, respons proyeksi, boundary shift, dan array intervals menggunakan format 24-jam standar ISO dua-digit (`HH:mm`, `00:00` s/d `23:59`).
   - Meliputi shift dini hari (`00:00` s/d `06:00`), pagi (`06:00` s/d `12:00`), siang (`12:00` s/d `17:00`), dan malam (`17:00` s/d `23:00`/`23:59`). Tidak ada format 12 jam (AM/PM).

6. **Doctor Day Closure & Reopening (`PATCH /schedules/days/:date`):**
   - Dokter pada aplikasi mobile memiliki kapabilitas penuh dan seamless yang identik dengan Web Admin untuk menutup atau membuka kembali seluruh jadwal pada satu tanggal kalender.
   - Saat ditutup (`Tutup`): Seluruh sesi dokter pada tanggal tersebut otomatis dinonaktifkan (`closed`, `availableSlots = 0`), dan janji temu pasien aktif dibatalkan secara aman (*soft delete* / *soft cancellation*).
   - Saat dibuka kembali (`Buka`): Seluruh sesi dokter pada tanggal tersebut diaktifkan kembali (`open`), dan kuota `availableSlots` otomatis direstore penuh sesuai kapasitas aslinya (`capacity`).

---

## 2. Answers to the 15 Backend Delegation Questions

### Q1: What is the canonical source for consultation duration?
**Answer:** The PostgreSQL database table `practitioners.consultation_duration_minutes`. The default is `30` minutes, but it can be configured per practitioner (e.g. 15, 20, 30, 45, 60 minutes) by clinic administrators.

### Q2: Is consultation duration editable by the doctor?
**Answer:** **No.** Doctors consume duration as **read-only** (`durationEditableByCurrentUser = false`). Only clinic administrators have permission to alter practitioner duration policies via `PATCH /api/v1/admin/doctor-schedules/:id/duration`. Flutter should display the effective duration with a lock icon or informational text (`"30 menit (Ditentukan Admin)"`).

### Q3: What is the start time precision rule?
**Answer:** The backend policy specifies `allowedStartPrecisionMinutes = 1`. Any valid minute-precision start time is permitted. An arbitrary start of `08:45` will project intervals starting at `08:45`, not rounded to `09:00`.

### Q4: How are session boundaries enforced?
**Answer:** Boundaries are owned by predefined schedule contexts:
- `early_morning`: `00:00` - `06:00` (Dini Hari)
- `morning`: `06:00` - `12:00` (Pagi)
- `afternoon`: `12:00` - `17:00` (Siang)
- `night`: `17:00` - `21:00` (Malam)

The doctor's selected start time must fall within `[boundaryStartTime, boundaryEndTime)`. Projection stops at or before `boundaryEndTime`.

### Q5: What is the persistence strategy?
**Answer:** The backend persists one continuous availability session in `practitioner_schedule_sessions` storing `startTime`, derived `endTime`, and calculated `capacity`. Projected intervals are calculated purely and deterministically by the backend projection engine, preventing database bloat.

### Q6: Can Flutter omit `endTime` when creating availability?
**Answer:** **Yes.** Use the endpoint `POST /api/v1/schedules/availability`. The payload only requires:
```json
{
  "date": "2026-09-24",
  "scheduleContextId": "morning",
  "startTime": "08:45",
  "roomId": "optional-uuid",
  "serviceId": "optional-uuid",
  "notes": "optional notes"
}
```
Secara default saat `endTime` dihilangkan, backend membuat **1 sesi konsultasi tunggal** berdurasi 30 menit (atau sesuai durasi dokter, misal `08:45 - 09:15`, kapasitas 1).
Jika dokter ingin membuka beberapa slot sekaligus atau membuka seluruh shift:
- `slotsCount`: Jumlah slot konsultasi (misal `slotsCount: 2` $\to$ `08:45 - 09:45`, kapasitas 2).
- `endTime`: Jam selesai spesifik (misal `endTime: "10:15"`).
- `fillShift: true`: Mengisi seluruh sisa shift hingga batas akhir shift.

### Q7: What is the canonical interval status enum?
**Answer:**
```typescript
enum ScheduleIntervalStatus {
  OPEN = 'OPEN',         // Indonesian: 'Buka'
  OCCUPIED = 'OCCUPIED', // Indonesian: 'Terisi'
  CLOSED = 'CLOSED'      // Indonesian: 'Tutup'
}
```

### Q8: How are `Cuti` and `Penuh` represented?
**Answer:**
- **`Penuh`:** Dieliminasi sebagai status utama. Slot konsultasi yang memiliki janji temu pasien berstatus `OCCUPIED` (`Terisi`).
- **`Cuti`:** Bukan status ketersediaan tingkat atas. Jika dokter tercatat cuti pada tanggal tersebut, interval dikembalikan sebagai `CLOSED` (`Tutup`) dengan `closedReason: "LEAVE"`.

### Q9: What conflict checks are performed, and how does Flutter navigate collisions?
**Answer:**
1. **Practitioner Overlap:** Jika dokter sudah memiliki sesi jadwal aktif yang bertabrakan pada rentang waktu tersebut, backend mengembalikan `409 Conflict` (`PRACTITIONER_ALREADY_SCHEDULED`).
2. **Room Overlap:** Jika dokter lain telah terjadwal di ruangan tersebut pada rentang waktu yang sama, backend mengembalikan `409 Conflict` (`ROOM_ALREADY_OCCUPIED`).
3. **Structured Navigation Metadata:** Pada respons 409 Conflict, backend menyertakan objek `metadata` lengkap berisi:
   - `conflictingSessionId`: UUID sesi jadwal yang bertabrakan (gunakan untuk navigasi detail).
   - `scheduleDate`: Tanggal sesi bentrok.
   - `startTime` & `endTime`: Rentang jam sesi bentrok.
   - `timeRange`: Format tampilan (misal `"08:45 - 09:15 WIB"`).
   - `roomName`: Nama ruangan yang bertabrakan.
   - `sessionLabel`: Label shift (misal `"Pagi"`).
   
   *Implementasi Flutter:* Tangkap respons 409, tampilkan dialog pemberitahuan lengkap dengan tombol *"Lihat Jadwal Terdaftar"*, lalu arahkan dokter langsung ke `GET /api/v1/schedules/:conflictingSessionId` atau ke tanggal kalender yang bersangkutan.

### Q10: What are the safe mutation and deletion rules?
**Answer:**
- **Dokter (Mobile):** Dokter dapat menghapus sesi miliknya via `DELETE /api/v1/schedules/:id`. Jika sesi telah memiliki janji temu pasien aktif (`booked`, `checked_in`, `waiting`, `in_service`), backend menolak penghapusan dengan status `409 Conflict` (`SCHEDULE_HAS_ACTIVE_BOOKINGS`). Janji temu harus dibatalkan atau dialihkan terlebih dahulu.
- **Admin (Web):** Administrator klinik **dilarang menghapus sesi jadwal dokter** (`DELETE /admin/doctor-schedules/:id/sessions/:sessionId` mengembalikan `403 Forbidden` dengan kode `ADMIN_SCHEDULE_DELETION_PROHIBITED`). Admin harus menggunakan fitur Reschedule atau mengubah status menjadi Tutup demi integritas rekam medis klinis.

### Q11: How is patient booking security handled in projected intervals?
**Answer:** Projected intervals return a minimal, non-sensitive `appointmentRef` containing only `{ appointmentId, queueNumber, status }`. Full patient PII (medical record number, full patient history, complaint, guardian) is NOT included in the projection and is only retrieved via the authenticated `GET /api/v1/schedules/:id/booked-patients` endpoint when the doctor specifically opens patient details.

### Q12: Is recurring schedule generation supported in V2?
**Answer:** In V2, doctors create availability per date or applicable practice session. Recurring weekly template engines remain on the future roadmap.

### Q13: How is session capacity/quota and remaining shift slots calculated?
**Answer:**
1. **Sesi Tunggal (Default):**
   $$\text{capacity} = 1 \quad (\text{Available Slots} = 1)$$
   $$\text{endTime} = \text{startTime} + \text{effectiveDuration}$$
2. **Remaining Shift Slots (`remainingShiftSlots`):**
   Backend menghitung sisa kapasitas konsultasi yang masih dapat dibuka di dalam shift yang sama:
   $$\text{remainingShiftSlots} = \left\lfloor \frac{\text{boundaryEndTime} - \text{endTime}}{\text{effectiveDuration}} \right\rfloor$$
   *Contoh:* Sesi `08:45 - 09:15` pada shift Pagi (`06:00 - 12:00`) menyisakan 165 menit hingga jam `12:00` $\to \lfloor 165 / 30 \rfloor = 5$ slot tersisa.
3. **Multi-Slot / Fill Shift:**
   Jika dokter menyertakan `fillShift: true`, kapasitas dihitung hingga batas shift:
   $$\text{capacity} = \left\lfloor \frac{\text{boundaryEnd} - \text{selectedStart}}{\text{effectiveDuration}} \right\rfloor$$

### Q14: How does Optimistic Concurrency Control (OCC) work?
**Answer:** All schedule responses include a `version` string (e.g. `"2026-09-23T16:50:00.000Z"`). When modifying a schedule, pass this version. If another device or admin updated the schedule in the interim, the backend returns `409 Conflict` (`SCHEDULE_MODIFIED_CONCURRENTLY`), prompting Flutter to refresh state.

### Q15: What is the rollout/migration strategy?
**Answer:** Non-breaking dual support. Legacy endpoints (`POST /api/v1/schedules`, `GET /api/v1/schedules/my-schedules`, `GET /api/v1/schedules/calendar-summary`) remain operational. Flutter can migrate the Add/Edit Schedule Drawer to Schedule V2 without impacting existing screens.

---

## 3. New API Endpoints for Mobile

### 3.1 Get Schedule Contexts
Retrieves available shifts, context boundaries, and the doctor's consultation duration policy for the selected date.

```http
GET /api/v1/schedules/contexts?date=2026-09-24 HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": [
    {
      "contextId": "early_morning",
      "contextLabel": "Dini Hari",
      "sessionShift": "early_morning",
      "date": "2026-09-24",
      "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
      "boundaryStartTime": "00:00",
      "boundaryEndTime": "06:00",
      "allowedStartPrecisionMinutes": 1,
      "timezone": "Asia/Jakarta",
      "effectiveConsultationDurationMinutes": 30,
      "durationSource": "PRACTITIONER_CONFIG",
      "durationScope": "practitioner-specific",
      "durationEditableByCurrentUser": false
    },
    {
      "contextId": "morning",
      "contextLabel": "Pagi",
      "sessionShift": "morning",
      "date": "2026-09-24",
      "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
      "boundaryStartTime": "06:00",
      "boundaryEndTime": "12:00",
      "allowedStartPrecisionMinutes": 1,
      "timezone": "Asia/Jakarta",
      "effectiveConsultationDurationMinutes": 30,
      "durationSource": "PRACTITIONER_CONFIG",
      "durationScope": "practitioner-specific",
      "durationEditableByCurrentUser": false
    },
    {
      "contextId": "afternoon",
      "contextLabel": "Siang",
      "sessionShift": "afternoon",
      "date": "2026-09-24",
      "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
      "boundaryStartTime": "12:00",
      "boundaryEndTime": "17:00",
      "allowedStartPrecisionMinutes": 1,
      "timezone": "Asia/Jakarta",
      "effectiveConsultationDurationMinutes": 30,
      "durationSource": "PRACTITIONER_CONFIG",
      "durationScope": "practitioner-specific",
      "durationEditableByCurrentUser": false
    },
    {
      "contextId": "night",
      "contextLabel": "Malam",
      "sessionShift": "night",
      "date": "2026-09-24",
      "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
      "boundaryStartTime": "17:00",
      "boundaryEndTime": "21:00",
      "allowedStartPrecisionMinutes": 1,
      "timezone": "Asia/Jakarta",
      "effectiveConsultationDurationMinutes": 30,
      "durationSource": "PRACTITIONER_CONFIG",
      "durationScope": "practitioner-specific",
      "durationEditableByCurrentUser": false
    }
  ]
}
```

---

### 3.2 Live Preview Projection
Calculates and previews the projected intervals as soon as the doctor enters or changes the start time in the drawer, without committing to the database.

```http
GET /api/v1/schedules/projection?date=2026-09-24&scheduleContextId=morning&startTime=08:45 HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "scheduleId": null,
    "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
    "date": "2026-09-24",
    "scheduleContextId": "morning",
    "contextLabel": "Pagi",
    "selectedStartTime": "08:45",
    "boundaryStartTime": "06:00",
    "boundaryEndTime": "12:00",
    "shiftBoundary": {
      "startTime": "06:00",
      "endTime": "12:00"
    },
    "projectedEndTime": "11:45",
    "effectiveConsultationDurationMinutes": 30,
    "durationSource": "PRACTITIONER_CONFIG",
    "durationScope": "practitioner-specific",
    "durationEditableByCurrentUser": false,
    "allowedStartPrecisionMinutes": 1,
    "timezone": "Asia/Jakarta",
    "capacity": 6,
    "intervals": [
      {
        "intervalIndex": 1,
        "startTime": "08:45",
        "endTime": "09:15",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 2,
        "startTime": "09:15",
        "endTime": "09:45",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 3,
        "startTime": "09:45",
        "endTime": "10:15",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 4,
        "startTime": "10:15",
        "endTime": "10:45",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 5,
        "startTime": "10:45",
        "endTime": "11:15",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      },
      {
        "intervalIndex": 6,
        "startTime": "11:15",
        "endTime": "11:45",
        "status": "OPEN",
        "displayLabel": "Buka",
        "isOccupied": false,
        "appointmentRef": null,
        "closedReason": null
      }
    ]
  }
}
```

---

#### 3.3 Create Availability
Submits the doctor's practice availability. Backend validates boundaries, computes projection, and commits the session atomically.
Secara default saat `endTime`/`slotsCount`/`fillShift` tidak dikirimkan, backend membuat **1 sesi konsultasi tunggal** berdurasi 30 menit (atau sesuai durasi dokter).

```http
POST /api/v1/schedules/availability HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
Content-Type: application/json

{
  "date": "2026-09-24",
  "scheduleContextId": "morning",
  "startTime": "08:45",
  "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
  "notes": "Praktek poli pagi"
}
```

#### Optional Fields untuk Multi-Slot / Fill Shift:
- `slotsCount` (`number`): Jumlah slot berurutan (misal `2` $\to$ `08:45 - 09:45`).
- `endTime` (`string`): Jam selesai eksplisit format `HH:mm`.
- `fillShift` (`boolean`): Set `true` jika dokter ingin membuka seluruh shift hingga akhir boundary shift (`12:00`).

#### Response (`201 Created` - Default Single Session):
```json
{
  "success": true,
  "data": {
    "schedule": {
      "id": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
      "staffId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
      "staffName": "dr. Siti Rahma",
      "profession": "Dokter Gigi",
      "scheduleDate": "2026-09-24",
      "specificDate": "2026-09-24",
      "poliklinikId": "239a5ec2-23c2-4fa8-b2ef-15608c02a76f",
      "poliklinikName": "Poli Gigi",
      "session": "PAGI",
      "sessionLabel": "Pagi",
      "sessionShift": "morning",
      "startTime": "08:45",
      "endTime": "09:15",
      "timeRange": "08:45 - 09:15 WIB",
      "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
      "roomName": "Ruang Gigi 1",
      "capacity": 1,
      "availableSlots": 1,
      "bookedPatientCount": 0,
      "status": "Buka",
      "rawStatus": "open",
      "isAvailable": true,
      "notes": "Praktek poli pagi",
      "version": "2026-09-24T02:00:00.000Z"
    },
    "projection": {
      "scheduleId": "8489be4c-7c05-4c07-b352-7bf579b29cb1",
      "capacity": 1,
      "remainingShiftSlots": 5,
      "projectedEndTime": "09:15",
      "intervals": [
        {
          "intervalIndex": 1,
          "startTime": "08:45",
          "endTime": "09:15",
          "status": "OPEN",
          "displayLabel": "Buka",
          "isOccupied": false,
          "appointmentRef": null,
          "closedReason": null
        }
      ]
    }
  }
}
```

---

### 3.4 Anti-Collision & Slot Occupancy Overview (`GET /api/v1/schedules/occupancy-overview`)
Menyediakan grid keterisian jadwal dokter secara komprehensif pada 4 shift (`early_morning`, `morning`, `afternoon`, `night`) untuk tanggal terpilih (dan ruangan terpilih opsional).

Endpoint ini dipanggil oleh aplikasi mobile saat dokter membuka layar tambah jadwal atau memilih tanggal/ruangan. Dengan data ini, Flutter dapat **langsung menonaktifkan (`disabled: true`) tombol slot yang sudah terisi atau cuti**, mencegah dokter mengalami error 409 Conflict saat menekan tombol Simpan.

```http
GET /api/v1/schedules/occupancy-overview?date=2026-09-25&roomId=e3067341-a185-484d-91d6-84848fcff1ef HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
```

#### Query Parameters:
| Parameter | Type | Required | Description |
|---|---|---|---|
| `date` | `string` | **Ya** | Tanggal target format ISO (`YYYY-MM-DD`). |
| `roomId` | `string` | Tidak | UUID ruangan praktik. Jika disertakan, backend mendeteksi apakah ruangan sedang dipakai oleh dokter lain pada jam tersebut. |
| `staffId` | `string` | Tidak | UUID praktisi target (hanya diizinkan untuk role `ADMIN`). Untuk dokter, backend otomatis mengunci ke praktisi yang sedang login (IDOR protected). |

#### Response (`200 OK`):
```json
{
  "success": true,
  "data": {
    "date": "2026-09-25",
    "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
    "practitionerName": "dr. Ahmad Santoso",
    "effectiveConsultationDurationMinutes": 30,
    "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
    "roomName": "Ruang Poli 1",
    "isCuti": false,
    "cutiReason": null,
    "summary": {
      "totalShifts": 4,
      "totalSlots": 42,
      "availableSlots": 40,
      "occupiedSlots": 2
    },
    "shifts": [
      {
        "contextId": "early_morning",
        "contextLabel": "Dini Hari",
        "sessionShift": "early_morning",
        "timeRange": "00:00 - 06:00 WIB",
        "boundaryStartTime": "00:00",
        "boundaryEndTime": "06:00",
        "totalSlots": 12,
        "availableSlotsCount": 11,
        "occupiedSlotsCount": 1,
        "slots": [
          {
            "slotIndex": 1,
            "startTime": "00:00",
            "endTime": "00:30",
            "timeRange": "00:00 - 00:30 WIB",
            "isAvailable": true,
            "status": "AVAILABLE",
            "displayLabel": "Tersedia",
            "conflictInfo": null
          },
          {
            "slotIndex": 5,
            "startTime": "02:00",
            "endTime": "02:30",
            "timeRange": "02:00 - 02:30 WIB",
            "isAvailable": false,
            "status": "OCCUPIED_BY_SELF",
            "displayLabel": "Jadwal Anda (Ruang Poli 1)",
            "conflictInfo": {
              "type": "SELF",
              "message": "Anda sudah memiliki jadwal di jam ini",
              "sessionId": "46596e5c-6f0f-4aa3-a60e-909564b89830",
              "practitionerId": "3cb62e10-450b-43e5-aba9-49ec37079ebb",
              "practitionerName": "dr. Ahmad Santoso",
              "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
              "roomName": "Ruang Poli 1"
            }
          }
        ]
      },
      {
        "contextId": "morning",
        "contextLabel": "Pagi",
        "sessionShift": "morning",
        "timeRange": "06:00 - 12:00 WIB",
        "boundaryStartTime": "06:00",
        "boundaryEndTime": "12:00",
        "totalSlots": 12,
        "availableSlotsCount": 11,
        "occupiedSlotsCount": 1,
        "slots": [
          {
            "slotIndex": 5,
            "startTime": "08:00",
            "endTime": "08:30",
            "timeRange": "08:00 - 08:30 WIB",
            "isAvailable": false,
            "status": "OCCUPIED_BY_OTHER",
            "displayLabel": "Terisi (Bdn. Siti Rahmawati - Ruang Poli 1)",
            "conflictInfo": {
              "type": "OTHER",
              "message": "Ruangan telah digunakan oleh Bdn. Siti Rahmawati",
              "sessionId": "ec2209dd-e7a9-483f-bef2-cfc04201cf27",
              "practitionerId": "77bbb45a-18df-4311-b2a4-a4b6f22870ca",
              "practitionerName": "Bdn. Siti Rahmawati",
              "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
              "roomName": "Ruang Poli 1"
            }
          }
        ]
      }
    ]
  }
}
```

#### Aturan Tampilan & State di Flutter:
1. **Status Ketersediaan Slot:**
   - Jika `isAvailable: true` $\to$ Tampilkan slot sebagai aktif/dapat ditekan.
   - Jika `isAvailable: false` $\to$ Nonaktifkan slot (`disabled: true`), ganti warna menjadi abu-abu/merah pudar.
2. **Konteks & Label:**
   - Tampilkan `displayLabel` pada badge atau tooltip slot.
   - Jika `status == "OCCUPIED_BY_SELF"` $\to$ Tampilkan teks *"Jadwal Anda"* beserta nama ruangan.
   - Jika `status == "OCCUPIED_BY_OTHER"` $\to$ Tampilkan teks *"Terisi"* beserta nama dokter lain yang menempati ruangan.
   - Jika `status == "CLOSED_LEAVE"` $\to$ Tampilkan teks *"Cuti"*.
3. **Ringkasan Shift:**
   - Gunakan `availableSlotsCount` dan `totalSlots` pada header setiap shift (misal: *"Dini Hari (11/12 Tersedia)"*).

---

### 3.5 Doctor Schedule Lifecycle Endpoints (CRUD)

| Method | Endpoint | Description | Status Code |
|---|---|---|---|
| `GET` | `/api/v1/schedules/reference/options` | Master shifts, interval, dan opsi status kanonik | `200 OK` |
| `GET` | `/api/v1/schedules/my-schedules?date=YYYY-MM-DD` | Daftar jadwal praktek dokter yang sedang login pada tanggal terpilih | `200 OK` |
| `GET` | `/api/v1/schedules/:id` | Detail 1 sesi jadwal praktek dokter | `200 OK` |
| `PATCH` | `/api/v1/schedules/:id/availability` | Toggle status buka/tutup sesi praktek (`isAvailable: true/false`) | `200 OK` |
| `PATCH` | `/api/v1/schedules/:id` | Update catatan (`notes`), ruangan (`roomId`), kapasitas, atau status binary | `200 OK` |
| `PATCH` | `/api/v1/schedules/days/:date` | **Tutup atau Buka kembali seluruh sesi dokter pada 1 tanggal kalender** | `200 OK` |
| `DELETE` | `/api/v1/schedules/:id` | Menghapus sesi jadwal (hanya jika **tidak ada** janji temu pasien aktif) | `204 No Content` |
| `GET` | `/api/v1/schedules/:id/booked-patients` | Daftar pasien yang terdaftar pada sesi jadwal tersebut | `200 OK` |
| `GET` | `/api/v1/schedules/calendar-summary?month=YYYY-MM` | Ringkasan kalender bulanan dokter dengan status hari dan indicator | `200 OK` |

#### 1. Binary Switcher Contract (`GET /reference/options` & Edit Jadwal):
Ketika dokter mengedit jadwal via `PATCH /api/v1/schedules/:id`:
- Payload status yang diizinkan hanya binary:
  - `status: "open"` atau `"Buka"`
  - `status: "closed"` atau `"Tutup"`
- **Nilai "Terisi" / "OCCUPIED" DILARANG DIKIRIMKAN OLEH FRONTEND.** Backend akan menolak atau mengabaikannya karena "Terisi" adalah kalkulasi komputasi sistem.
- Di UI Flutter, implementasikan sebagai **Switch / Toggle**:
  - `ON` (Aktif) $\to$ Status `"Buka"` (`open`)
  - `OFF` (Nonaktif) $\to$ Status `"Tutup"` (`closed`)

#### 2. Deletion by Doctor (`DELETE /api/v1/schedules/:id`):
- Jika sesi masih kosong (tidak ada booking): Terhapus permanen dari DB dengan status `204 No Content`.
- Jika sesi sudah memiliki pasien terdaftar (`booked`, `checked_in`, `waiting`, `in_service`): Ditolak dengan `409 Conflict` (`SCHEDULE_HAS_ACTIVE_BOOKINGS`).

---

### 3.6 Doctor Mobile Calendar Day Closure & Reopening (`PATCH /schedules/days/:date`)

Memberikan dokter wewenang penuh menutup atau membuka kembali satu hari praktek secara menyeluruh melalui aplikasi mobile dokter.

```http
PATCH /api/v1/schedules/days/2026-10-24 HTTP/1.1
Authorization: Bearer <DOCTOR_JWT_TOKEN>
Content-Type: application/json

{
  "status": "Tutup",
  "notes": "Dokter izin cuti seminar darurat"
}
```

#### Request Body Schema:
| Field | Type | Required | Values | Description |
|---|---|---|---|---|
| `status` | `string` | **Ya** | `"Tutup"` \| `"Buka"` \| `"Cuti"` | Status operasional dokter pada tanggal tersebut |
| `notes` | `string` | Tidak | String bebas | Alasan/catatan penutupan hari |

#### Response (`200 OK` - Menutup Hari):
```json
{
  "success": true,
  "message": "Jadwal hari berhasil ditutup dan seluruh sesi dinonaktifkan (pasien aktif dibatalkan secara soft delete)",
  "data": {
    "date": "2026-10-24",
    "status": "Tutup",
    "notes": "Dokter izin cuti seminar darurat",
    "affectedSessionsCount": 2,
    "cancelledAppointmentsCount": 1
  }
}
```

#### Response (`200 OK` - Membuka Kembali Hari):
```json
{
  "success": true,
  "message": "Jadwal hari berhasil dibuka kembali dan seluruh sesi diaktifkan",
  "data": {
    "date": "2026-10-24",
    "status": "Buka",
    "notes": "Operasional normal kembali",
    "affectedSessionsCount": 2,
    "cancelledAppointmentsCount": 0
  }
}
```

#### Synchronized Monthly Calendar Summary (`GET /schedules/calendar-summary?month=YYYY-MM`):
Setiap elemen di `data.days[*]` kini menyertakan:
```json
{
  "date": "2026-10-24",
  "sessionCount": 2,
  "isAvailable": false,
  "hasBooking": false,
  "status": "Tutup",
  "isClosed": true,
  "notes": "Dokter izin cuti seminar darurat"
}
```
Ketika hari dibuka kembali: `status: "Buka"`, `isClosed: false`, `isAvailable: true`. State ini 100% tersinkronisasi dengan Web Admin.

---

## 4. Error Codes & Collision Navigation Contract

The backend returns standardized error responses with specific codes. Flutter must inspect `error.response?.data['code']` and `error.response?.data['metadata']`:

| Error Code | HTTP Status | Indonesian User Message | Cause |
|---|---|---|---|
| `START_OUTSIDE_BOUNDARY` | 422 | "Jam mulai berada di luar batas waktu shift yang dipilih." | e.g. selecting `05:30` or `12:15` for the `morning` shift (06:00 - 12:00). |
| `INVALID_START_PRECISION` | 422 | "Jam mulai tidak sesuai presisi menit yang diizinkan." | Minute component does not match allowed step. |
| `DURATION_LEAVES_NO_CAPACITY` | 422 | "Waktu mulai terlalu dekat dengan akhir shift sehingga tidak ada kuota konsultasi." | e.g. starting at `11:45` in a context ending at `12:00` with a 30m duration. |
| `DATE_CLOSED` | 409 | "Tidak dapat membuat jadwal karena Anda tercatat sedang cuti pada tanggal ini." | Doctor has registered leave on the selected date. |
| `PRACTITIONER_ALREADY_SCHEDULED` | 409 | "Anda sudah memiliki jadwal lain yang bertabrakan pada rentang waktu ini." | Doctor schedule overlap on the same date. |
| `ROOM_ALREADY_OCCUPIED` | 409 | "Ruangan tersebut sudah digunakan oleh dokter lain pada jam ini." | Room conflict with another doctor. |
| `SCHEDULE_HAS_ACTIVE_BOOKINGS` | 409 | "Jadwal tidak dapat dihapus karena sudah ada pasien terdaftar. Silakan batalkan atau pindahkan pasien terlebih dahulu." | Attempted deletion of session with bookings. |

### 4.1 Collision Response Payload (`409 Conflict`):
Ketika terjadi bentrok jadwal dokter atau ruangan, backend menyertakan `metadata` detail:
```json
{
  "statusCode": 409,
  "code": "PRACTITIONER_ALREADY_SCHEDULED",
  "message": "Dokter sudah memiliki jadwal praktek lain yang bertabrakan pada rentang waktu ini.",
  "metadata": {
    "conflictingSessionId": "85cadfaa-89f1-4123-8dd3-51982d626661",
    "scheduleDate": "2026-09-25",
    "startTime": "02:00",
    "endTime": "02:30",
    "timeRange": "02:00 - 02:30 WIB",
    "roomId": "e3067341-a185-484d-91d6-84848fcff1ef",
    "roomName": "Ruang Poli 1",
    "sessionShift": "early_morning",
    "sessionLabel": "Dini Hari",
    "occupiedBy": "Ahmadamikom Zikri"
  }
}
```

#### Alur Penanganan di Flutter:
1. Tangkap status `409` dan periksa `data.code == "PRACTITIONER_ALREADY_SCHEDULED"`.
2. Tampilkan dialog alert kepada dokter:
   *"Anda sudah memiliki jadwal di sesi Dini Hari (02:00 - 02:30 WIB) di Ruang Poli 1."*
3. Sediakan tombol tindakan:
   - **Tutup / Pilih Jam Lain:** Menutup dialog agar dokter memilih jam lain di shift yang sama.
   - **Lihat Sesi Terdaftar:** Melakukan navigasi langsung ke detail sesi yang bentrok menggunakan `metadata.conflictingSessionId` (`GET /api/v1/schedules/:conflictingSessionId`) atau berpindah ke tanggal tersebut di kalender.

---

## 5. API Data Contracts & Field Specifications

### 5.1 `ScheduleContext` Schema
Dikembalikan oleh `GET /api/v1/schedules/contexts?date=YYYY-MM-DD`.

| Field Name | Type | Description | Example |
|---|---|---|---|
| `contextId` | `string` | ID unik shift (`early_morning`, `morning`, `afternoon`, `night`) | `"morning"` |
| `contextLabel` | `string` | Label bahasa Indonesia resmi | `"Pagi"` |
| `sessionShift` | `string` | Shift identifier kanonik | `"morning"` |
| `date` | `string` | Tanggal ISO (YYYY-MM-DD) | `"2026-09-24"` |
| `practitionerId` | `string` | UUID praktisi dokter | `"3cb62e10-450b-43e5-aba9-49ec37079ebb"` |
| `boundaryStartTime` | `string` | Jam mulai batas shift (format 24-jam `HH:mm`) | `"06:00"` |
| `boundaryEndTime` | `string` | Jam selesai batas shift (format 24-jam `HH:mm`) | `"12:00"` |
| `allowedStartPrecisionMinutes` | `number` | Langkah presisi pemilihan menit (default: 1) | `1` |
| `timezone` | `string` | Zona waktu operasional klinik | `"Asia/Jakarta"` |
| `effectiveConsultationDurationMinutes` | `number` | Durasi konsultasi dokter yang berlaku dari DB | `30` |
| `durationSource` | `string` | Sumber konfigurasi (`PRACTITIONER_CONFIG`) | `"PRACTITIONER_CONFIG"` |
| `durationEditableByCurrentUser` | `boolean` | Flag izin edit durasi bagi pemanggil (selalu `false` untuk dokter) | `false` |

---

### 5.2 `ScheduleProjection` Schema
Dikembalikan oleh `GET /api/v1/schedules/projection` dan `POST /api/v1/schedules/availability`.

| Field Name | Type | Description | Example |
|---|---|---|---|
| `scheduleId` | `string \| null` | UUID sesi jadwal jika sudah tersimpan, `null` pada preview | `"8489be4c-7c05-4c07-b352-7bf579b29cb1"` |
| `practitionerId` | `string` | UUID praktisi dokter | `"3cb62e10-450b-43e5-aba9-49ec37079ebb"` |
| `date` | `string` | Tanggal shift (YYYY-MM-DD) | `"2026-09-24"` |
| `scheduleContextId` | `string` | Shift context identifier | `"morning"` |
| `contextLabel` | `string` | Label shift | `"Pagi"` |
| `selectedStartTime` | `string` | Jam mulai terpilih (format 24-jam `HH:mm`) | `"08:45"` |
| `projectedEndTime` | `string` | Jam selesai hasil kalkulasi backend (format 24-jam `HH:mm`) | `"09:15"` |
| `boundaryStartTime` | `string` | Jam mulai batas shift | `"06:00"` |
| `boundaryEndTime` | `string` | Jam selesai batas shift | `"12:00"` |
| `effectiveConsultationDurationMinutes` | `number` | Durasi per slot konsultasi | `30` |
| `capacity` | `number` | Total kuota pasien untuk sesi ini | `1` |
| `remainingShiftSlots` | `number` | **Sisa slot konsultasi yang masih dapat dibuka menuju batas akhir shift** | `5` |
| `intervals` | `ScheduleInterval[]` | Array slot konsultasi ter-serialisasi | `[...]` |

---

### 5.3 `ScheduleInterval` Schema
Setiap elemen di dalam array `intervals`.

| Field Name | Type | Description | Example |
|---|---|---|---|
| `intervalIndex` | `number` | Urutan indeks interval (1-indexed) | `1` |
| `startTime` | `string` | Waktu mulai slot (format 24-jam `HH:mm`) | `"08:45"` |
| `endTime` | `string` | Waktu selesai slot (format 24-jam `HH:mm`) | `"09:15"` |
| `status` | `string` | Status slot kanonik: `"OPEN"`, `"OCCUPIED"`, `"CLOSED"` | `"OPEN"` |
| `displayLabel` | `string` | Label bahasa Indonesia resmi: `"Buka"`, `"Terisi"`, `"Tutup"` | `"Buka"` |
| `isOccupied` | `boolean` | `true` jika slot terisi janji temu pasien | `false` |
| `appointmentRef` | `object \| null` | Metadata ringkas janji temu (`appointmentId`, `queueNumber`, `status`) | `null` |
| `closedReason` | `string \| null` | Alasan jika slot ditutup (`"LEAVE"`, `"SCHEDULE_CLOSED"`, `null`) | `null` |

---

### 5.4 `ScheduleOccupancyOverviewData` Schema
Dikembalikan oleh `GET /api/v1/schedules/occupancy-overview`.

| Field Name | Type | Description | Example |
|---|---|---|---|
| `date` | `string` | Tanggal shift (YYYY-MM-DD) | `"2026-09-25"` |
| `practitionerId` | `string` | UUID praktisi dokter | `"3cb62e10-450b-43e5-aba9-49ec37079ebb"` |
| `practitionerName` | `string` | Nama lengkap dokter | `"dr. Ahmad Santoso"` |
| `effectiveConsultationDurationMinutes` | `number` | Durasi per slot konsultasi dari DB | `30` |
| `roomId` | `string \| null` | UUID ruangan praktik yang diperiksa | `"e3067341-a185-484d-91d6-84848fcff1ef"` |
| `roomName` | `string \| null` | Nama ruangan praktik | `"Ruang Poli 1"` |
| `isCuti` | `boolean` | `true` jika dokter tercatat cuti pada tanggal tersebut | `false` |
| `cutiReason` | `string \| null` | Alasan cuti jika dokter sedang cuti | `null` |
| `summary` | `object` | Ringkasan harian: `{ totalShifts, totalSlots, availableSlots, occupiedSlots }` | `{ totalShifts: 4, totalSlots: 42, ... }` |
| `shifts` | `ScheduleShiftOccupancy[]` | Array 4 shift: Dini Hari, Pagi, Siang, Malam | `[...]` |

---

### 5.5 `ScheduleShiftSlot` Schema
Setiap elemen di dalam array `shifts[].slots`.

| Field Name | Type | Description | Example |
|---|---|---|---|
| `slotIndex` | `number` | Urutan indeks slot dalam shift (1-indexed) | `5` |
| `startTime` | `string` | Waktu mulai slot (format 24-jam `HH:mm`) | `"02:00"` |
| `endTime` | `string` | Waktu selesai slot (format 24-jam `HH:mm`) | `"02:30"` |
| `timeRange` | `string` | Format label rentang jam | `"02:00 - 02:30 WIB"` |
| `isAvailable` | `boolean` | **Flag utama untuk disable button/chip di UI** (`false` jika terisi/cuti) | `false` |
| `status` | `string` | Status slot: `"AVAILABLE"`, `"OCCUPIED_BY_SELF"`, `"OCCUPIED_BY_OTHER"`, `"CLOSED_LEAVE"` | `"OCCUPIED_BY_SELF"` |
| `displayLabel` | `string` | Label informatif: `"Tersedia"`, `"Jadwal Anda"`, `"Terisi: dr. X"`, `"Cuti"` | `"Jadwal Anda (Ruang Poli 1)"` |
| `conflictInfo` | `object \| null` | Detail pemegang slot: `{ type, message, sessionId, practitionerId, practitionerName, roomId, roomName }` | `{ type: "SELF", ... }` |

---

## 6. Migration Checklist for Flutter Devs

- [x] **Zero Arithmetic on Client:** Hapus seluruh perhitungan `endTime = startTime + duration` di Flutter.
- [x] **Single-Session by Default:** Sadari bahwa memilih jam mulai (misal `02:00` atau `06:00`) hanya membuka 1 sesi berdurasi 30 menit (`02:00 - 02:30`, kapasitas 1).
- [x] **Gunakan `remainingShiftSlots`:** Render sisa kuota yang masih tersedia dalam shift (misal: `"Tersisa 7 slot lagi di shift Dini Hari"`).
- [x] **Standard 24-Hour TimePicker:** Dokter dapat memilih jam menit presisi standar 24-jam (misal `08:45`, `02:00`, `13:30`).
- [x] **Anti-Collision Pre-Submit Grid (`GET /occupancy-overview`):** Panggil endpoint saat dokter membuka drawer tanggal/ruangan. Nonaktifkan (`disabled: true`) slot dengan `isAvailable == false`, tampilkan label konteks dari `displayLabel`.
- [x] **Navigasi Bentrok Jadwal (409):** Baca `metadata.conflictingSessionId` dari respons error 409 untuk menampilkan tombol *"Lihat Jadwal Terdaftar"*.
- [x] **Binary Switcher di Edit Jadwal:** Gunakan toggle / switcher (`Buka` vs `Tutup`). Jangan tampilkan status `Terisi` di opsi pilihan edit jadwal karena `Terisi` adalah kehendak sistem.
- [x] **Tutup & Buka Hari via Mobile (`PATCH /schedules/days/:date`):** Dokter dapat menutup atau membuka satu hari penuh langsung dari aplikasi mobile dengan sinkronisasi kalender dan pembatalan pasien (*soft delete*).
- [x] **Dokter Hapus Jadwal:** Dokter dapat menghapus jadwal kosong via `DELETE /api/v1/schedules/:id`. Jika ada pasien, backend menolak dengan `409 SCHEDULE_HAS_ACTIVE_BOOKINGS`.
- [x] **Verified against Live API:** Terverifikasi 100% lulus seluruh pengujian security, concurrency, dan CRUD (113 / 113 test checks passed).

