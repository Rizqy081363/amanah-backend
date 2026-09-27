# API Contract Changelog: Flutter Mobile Doctor Schedule Architecture & Hierarchy

- **Date:** 2026-09-27
- **Contract Version:** 1.5.0
- **Scope:** Schedules Module, Doctor Consultation Projection, Session Patients Lifecycle
- **Target Clients:** Flutter Mobile App (Doctor / Practitioner Portal), Web Admin

---

## 1. Executive Summary & Purpose

This changelog clarifies the end-to-end architecture and backend API contracts powering the **Doctor Schedule Flow** on the Flutter Mobile App.

In accordance with Single Source of Truth (SSOT) and database-driven domain principles, **all scheduling math, temporal status evaluation, consultation interval slicing, and patient demographic transformations are computed server-side**. The Flutter mobile client acts strictly as a presentation layer and must never perform manual timestamp arithmetic, slot partitioning, or custom status conversions.

---

## 2. Three-Tiered Schedule Navigation Hierarchy

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: KALENDER PRAKTIK BULANAN                                           │
│ Endpoint: GET /api/v1/schedules/calendar-summary?month=YYYY-MM              │
│ + Pasien Hari Ini: GET /api/v1/schedules/booked-patients?date=YYYY-MM-DD    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Dokter klik tanggal, misal: 27)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 2: DETAIL JADWAL TANGGAL & KARTU INTERVAL JAM (30 MENIT)              │
│ Endpoint: GET /api/v1/schedules/occupancy-overview?date=YYYY-MM-DD          │
│           (atau GET /api/v1/schedules/my-schedules?date=YYYY-MM-DD)         │
│ Fitur: 17+ Kartu Slot Diskrit (07:30 - 08:00, dst), Deteksi Selesai        │
│        otomatis via Server Clock (cth: jam 15:04 -> status COMPLETED)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Dokter klik "Detail Sesi" /
                                       │  "Lihat Pasien Booking")
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: RINCIAN PASIEN BOOKING PER SESI                                    │
│ Endpoint: GET /api/v1/schedules/sessions/:sessionId/patients?status=all     │
│ Fitur: Data pasien lengkap, rekam medis, keluhan, ruangan, antrean,         │
│        slot jam ("07:30 - 08:00 WIB"), dan badge UI siap render             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Level 1: Monthly Calendar & Day-Selected Patients

### 3.1 `GET /api/v1/schedules/calendar-summary`
- **Method:** `GET`
- **Auth:** Bearer Token (Practitioner / Role `STAF` or `ADMIN`)
- **Query Parameters:**
  - `month` (string, required): Format `YYYY-MM` (e.g. `2026-09`)
- **Description:** Returns daily metadata for the entire month for the authenticated practitioner, including active session count, quota utilization, leave (`cuti`) status, and occupancy percentage.
- **Response `200 OK` Contract:**
```json
{
  "month": "2026-09",
  "days": [
    {
      "date": "2026-09-27",
      "hasSchedule": true,
      "isCuti": false,
      "cutiReason": null,
      "sessionCount": 2,
      "targetQuota": 20,
      "bookedPatientCount": 2,
      "capacityPercentage": 10,
      "status": "OCCUPIED",
      "isClosed": false,
      "notes": "Interval terisi oleh pasien reservasi"
    }
  ]
}
```
- **Flutter Integration Rule:**
  - If `hasSchedule == true && !isCuti`: render active calendar marker (emerald / green).
  - If `isCuti == true`: render leave marker (amber / red).
  - Do not calculate quota or capacity percentages in Dart; read `capacityPercentage` directly.

---

### 3.2 `GET /api/v1/schedules/booked-patients`
- **Method:** `GET`
- **Auth:** Bearer Token (Doctor)
- **Query Parameters:**
  - `date` (string, required): Format `YYYY-MM-DD` (e.g. `2026-09-27`)
- **Description:** Returns all patients registered across all practice sessions for the logged-in doctor on that specific date. Used immediately under the monthly calendar on Level 1.
- **Response `200 OK` Contract:**
```json
[
  {
    "id": "f7dd6a32-6926-41b9-9d92-884166adbb6b",
    "appointmentId": "a4f75a22-a3bd-442f-a186-bc49c561dba7",
    "fullName": "Dewi Lestari",
    "medicalRecordNumber": "RM-202609-0010",
    "age": "31 Thn",
    "gender": "Perempuan",
    "queueNumber": "P-004",
    "timeSlot": "00:00 - 06:00 WIB",
    "sessionTitle": "Sesi Dini Hari",
    "room": "Ruang Poli Umum 1",
    "guardian": null,
    "complaint": "Pemeriksaan kesehatan rutin keluarga",
    "status": "booked",
    "statusBadge": "Booked",
    "avatarUrl": null
  }
]
```

---

## 4. Level 2: Date Practice Schedule & 30-Minute Interval Cards

When the doctor clicks a calendar day (e.g., September 27), the Flutter app renders discrete consultation cards (e.g. 17 cards from 07:30 to 16:00 WIB).

### 4.1 Why Cards Are Rendered Per Interval (Not Per Shift)
1. **Consultation Policy (SSOT):** The database policy specifies 30-minute standard intervals per patient.
2. **Server-Side Projection Engine (`ScheduleSlotStateResolver`):** The backend divides shifts into individual consultation slots. For example, a morning shift starting at 07:30 and ending in the afternoon generates 17 distinct 30-minute consultation slots.
3. **Past Time Detection (e.g. Current Time = 15:04 WIB):**
   - Any slot with `endTime <= currentTime` is automatically flagged by the backend as:
     - `temporalState: "PAST"`
     - `uiStatus: "COMPLETED"`
     - `uiVariant: "muted_gray"`
     - `uiLabel: "Selesai"`
   - Flutter reads `uiStatus` and applies the gray/disabled card styling without checking the device clock.

### 4.2 Available Endpoints for Level 2
- **Endpoint A (Doctor's Own Sessions):**
  - `GET /api/v1/schedules/my-schedules?date=YYYY-MM-DD`
  - Returns practitioner sessions with `capacity`, `availableSlots`, `bookedPatientCount`, `startTime`, `endTime`, `roomId`, and `roomName`.
- **Endpoint B (Comprehensive 24h Anti-Collision Grid):**
  - `GET /api/v1/schedules/occupancy-overview?date=YYYY-MM-DD`
  - Returns all shifts and individual 30-minute interval slots with pre-computed conflict detection, occupancy, and room allocations.

---

## 5. Level 3: Session Detail & "Lihat Pasien Booking"

When the doctor clicks a specific card or taps **"Detail Sesi" ➔ "Lihat Pasien Booking"**, Flutter calls the dedicated session patients endpoint.

### 5.1 `GET /api/v1/schedules/sessions/:sessionId/patients`
- **Method:** `GET`
- **Auth:** Bearer Token (Doctor / Staff / Admin)
- **Path Parameter:**
  - `sessionId` (UUID, required): Unique identifier of the practice session
- **Query Parameters:**
  - `status` (string, optional): Filter by appointment status:
    - `all` (default): all non-cancelled appointments
    - `waiting`: patients waiting or checked in
    - `in_service`: patient currently with doctor
    - `completed`: patients finished
    - `cancelled`: patients who cancelled
  - `search` (string, optional): Search keyword against patient name, medical record number, NIK, or queue number.

### 5.2 Response `200 OK` Contract
```json
{
  "success": true,
  "data": {
    "sessionId": "2c66fd9c-73d1-4a61-9e0f-38e249047495",
    "sessionLabel": "Dini Hari",
    "shift": "Dini Hari",
    "scheduleDate": "2026-09-27",
    "startTime": "00:00",
    "endTime": "06:00",
    "capacity": 12,
    "availableSlots": 11,
    "bookedCount": 2,
    "clinicRoom": {
      "id": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
      "name": "Ruang Poli Umum 1",
      "floor": null
    },
    "patients": [
      {
        "appointmentId": "a4f75a22-a3bd-442f-a186-bc49c561dba7",
        "queueTicketId": "fa9f5f56-61b0-4740-99cc-f34ee71b69cf",
        "queueNumber": "P-004",
        "timeSlot": "00:00 - 00:30 WIB",
        "status": "booked",
        "statusBadge": "Booked",
        "chiefComplaint": "Pemeriksaan kesehatan rutin keluarga",
        "clinicRoomName": "Ruang Poli Umum 1",
        "isCancellable": true,
        "patient": {
          "id": "f7dd6a32-6926-41b9-9d92-884166adbb6b",
          "fullName": "Dewi Lestari",
          "medicalRecordNumber": "RM-202609-0010",
          "nik": "3201583065724673",
          "gender": "Perempuan",
          "birthDate": "1995-08-17",
          "age": "31 Thn",
          "phoneNumber": "081298765432",
          "email": null,
          "address": null,
          "guardianName": null,
          "avatarUrl": null
        },
        "bookingMetadata": {
          "bookedAt": "2026-09-27 14:47:27.052572+07",
          "checkedInAt": null,
          "startedAt": null,
          "completedAt": null,
          "cancelledAt": null,
          "cancelReason": null
        }
      }
    ]
  }
}
```

---

## 6. Zero Frontend Computation Guarantee

The Flutter application receives completely resolved presentation attributes:

| Field | Origin | What Flutter Does |
|---|---|---|
| `timeSlot` | Formatted by backend (`"07:30 - 08:00 WIB"`) | Direct text display |
| `age` | Formatted by backend (`"31 Thn"`) from date of birth | Direct text display |
| `gender` | Formatted by backend (`"Laki-laki"` / `"Perempuan"`) | Direct text display |
| `statusBadge` | Mapped by backend (`"Menunggu"`, `"Di Sesi"`, `"Selesai"`, `"Batal"`, `"Terlambat"`) | Direct badge display |
| `isCancellable` | Evaluated server-side based on status (`!in_service && !completed && !cancelled`) | Direct button enable/disable |
| `queueNumber` | Resolved server-side from active queue ticket | Direct badge display |
| `isPast` / `uiStatus: COMPLETED` | Server clock comparison against slot `endTime` | Card opacity & styling |

---

## 7. Client Impact & Migration Checklist

1. **No Breaking Changes:** Existing endpoints remain fully backward-compatible.
2. **Flutter Screen 1 (Calendar):** Call `GET /schedules/calendar-summary?month=YYYY-MM` and `GET /schedules/booked-patients?date=YYYY-MM-DD`.
3. **Flutter Screen 2 (Date Slots):** Call `GET /schedules/my-schedules?date=YYYY-MM-DD` or `GET /schedules/occupancy-overview?date=YYYY-MM-DD`.
4. **Flutter Screen 3 (Lihat Pasien Booking):** Call `GET /schedules/sessions/:sessionId/patients?status=all` on tap.
