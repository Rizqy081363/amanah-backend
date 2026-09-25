# API Contract Changelog: Schedule Automation, Dynamic Calculations, and Mobile-Admin Parity

- **Changelog ID**: `CHG-20260925-SCHED-001`
- **Date**: 2026-09-25
- **Author**: Backend Engineering Team
- **Type**: Non-breaking Feature & Enhancement
- **Target Audience**: Mobile App Developers, Web-Admin Frontend Developers, API Consumers

---

## 1. Executive Summary

This release resolves the endpoint prefix discrepancies between Web-Admin and Mobile App, introduces canonical shared routes for doctor schedule session operations, eliminates hardcoded shift/slot assumptions, and restores realistic clinical shifts and real booked patient data for mobile development testing.

---

## 2. Changes Summary

| Area | Change | Type | Breaking? | Affected Clients |
|---|---|---|---|---|
| **Schedules Controller** | Added `GET /api/v1/schedules/sessions/:sessionId/reschedule-eligibility` | New Endpoint | No | Mobile, Web-Admin |
| **Schedules Controller** | Added `POST /api/v1/schedules/sessions/:sessionId/reschedule` | New Endpoint | No | Mobile, Web-Admin |
| **Schedules Controller** | Added `GET /api/v1/schedules/sessions/:sessionId/patients` | New Endpoint | No | Mobile, Web-Admin |
| **Admin Doctor Schedules** | Expanded authorization from `ADMIN` to `['ADMIN', 'STAF']` with doctor data ownership assertions | Security / Parity | No | Mobile, Web-Admin |
| **Reschedule Calculation** | Automatic backend calculation for `projectedEndTime` based on doctor's consultation duration (e.g. 30m) via `ScheduleSlotFactory.calculateSessionTiming`. Client does not provide `targetEndTime`. | Enhancement | No | Mobile, Web-Admin |
| **Database Seeder** | Doctor Zikri (`c518facb-372e-4f07-9766-f3eacf54221f`) assigned realistic clinic shifts (`morning` 06:00–12:00, `afternoon` 12:00–18:00) with 2 active booked patients on `current_date` | Test Data | No | Mobile, QA |

---

## 3. Detailed Endpoint Contracts

### 3.1. Canonical Session Patients
- **Route**: `GET /api/v1/schedules/sessions/:sessionId/patients`
- **Roles**: `STAF`, `ADMIN` (Staff restricted to their own sessions; Admin has clinic-wide access)
- **Response Shape**:
```json
{
  "success": true,
  "data": {
    "sessionId": "1ebd53e9-4d61-43af-a12e-219d8d772c98",
    "sessionLabel": "Pagi",
    "shift": "Pagi",
    "scheduleDate": "2026-09-25",
    "startTime": "06:00",
    "endTime": "12:00",
    "capacity": 12,
    "availableSlots": 10,
    "bookedCount": 2,
    "clinicRoom": {
      "id": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
      "name": "Ruang Poli Umum 1",
      "floor": null
    },
    "patients": [
      {
        "appointmentId": "2b22bd5e-53f6-4623-9d86-7fecb89afad0",
        "queueTicketId": "83b1eb50-ddff-40f4-b19d-44a9fd2a68be",
        "queueNumber": "UM-101",
        "timeSlot": "08:00 - 08:30 WIB",
        "status": "booked",
        "statusBadge": "Booked",
        "chiefComplaint": "Pemeriksaan rutin gula darah dan kontrol tensi berkala",
        "clinicRoomName": "Ruang Poli Umum 1",
        "isCancellable": true,
        "patient": {
          "id": "ab115dbf-cb8e-4ac8-8764-2586b07ca367",
          "fullName": "Dewi Lestari",
          "medicalRecordNumber": "RM-2026-0001",
          "nik": "3201234567890001",
          "gender": "Perempuan",
          "birthDate": "1995-05-12",
          "age": "31 Thn",
          "phoneNumber": "081311223344",
          "email": "pasien@amanah.com",
          "address": "Jl. Merdeka No. 45, Bandung, Bandung",
          "guardianName": null,
          "avatarUrl": null
        },
        "bookingMetadata": {
          "bookedAt": "2026-09-25T05:58:18.011Z",
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

### 3.2. Canonical Reschedule Eligibility Pre-Check
- **Route**: `GET /api/v1/schedules/sessions/:sessionId/reschedule-eligibility`
- **Query Parameters**:
  - `targetDate` *(optional, string, YYYY-MM-DD)*
  - `targetStartTime` *(optional, string, HH:mm)* — *Backend otomatis menghitung `projectedEndTime` (`targetStartTime + consultationDurationMinutes`, misal `08:30` -> `09:00`). Client TIDAK PERNAH mengirim `targetEndTime`.*
  - `targetRoomId` *(optional, UUID v4)*
- **Response Shape**:
```json
{
  "success": true,
  "data": {
    "sessionId": "1ebd53e9-4d61-43af-a12e-219d8d772c98",
    "practitionerId": "c518facb-372e-4f07-9766-f3eacf54221f",
    "practitionerName": "Ahmadamikom Zikri",
    "isEligible": true,
    "sourceSession": {
      "id": "1ebd53e9-4d61-43af-a12e-219d8d772c98",
      "scheduleDate": "2026-09-25",
      "startTime": "06:00",
      "endTime": "12:00",
      "timeRange": "06:00 - 12:00 WIB",
      "status": "open",
      "statusLabel": "OPEN",
      "sessionLabel": "Pagi",
      "sessionShift": "morning",
      "roomName": "Ruang Poli Umum 1, Gedung Utama",
      "activeAppointmentsCount": 2,
      "isSourceEligible": true,
      "rejectionReason": null
    },
    "targetValidation": {
      "evaluated": true,
      "targetDate": "2026-10-15",
      "targetStartTime": "08:30",
      "projectedEndTime": "09:00",
      "targetRoomId": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
      "targetRoomName": "Ruang Poli Umum 1, Gedung Utama",
      "isTargetEligible": true,
      "conflictCode": null,
      "conflictMessage": null,
      "conflictMetadata": null
    },
    "actionableGuidance": "Sesi dan target waktu memenuhi syarat untuk di-reschedule. Silakan lanjutkan konfirmasi."
  }
}
```

### 3.3. Canonical Reschedule Execution
- **Route**: `POST /api/v1/schedules/sessions/:sessionId/reschedule`
- **Request Body**:
```json
{
  "targetDate": "2026-10-20",
  "targetStartTime": "13:00",
  "targetRoomId": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
  "notes": "Sesi dialihkan ke siang",
  "rescheduleActiveAppointments": true
}
```
*(Catatan: Client tidak mengirim `targetEndTime`; backend menghitung otomatis `endTime` dari durasi konsultasi dokter di database, misal `13:00` -> `13:30`).*
- **Response Shape**: Includes `previousSchedule`, `rescheduledSchedule`, `rescheduledAppointmentsCount`, and complete dynamic `projection` with intervals and slot occupancy.

---

## 4. Migration & Integration Guidance

1. **For Mobile Clients**:
   - Instead of calling `/api/v1/admin/doctor-schedules/:id/sessions/:sessionId/...`, mobile applications can now directly call canonical endpoints:
     - `/api/v1/schedules/sessions/:sessionId/reschedule-eligibility`
     - `/api/v1/schedules/sessions/:sessionId/reschedule`
     - `/api/v1/schedules/sessions/:sessionId/patients`
2. **For Web-Admin Clients**:
   - Web-Admin may continue using either the existing `/api/v1/admin/doctor-schedules/:id/...` routes or the canonical `/api/v1/schedules/sessions/:sessionId/...` routes.
3. **Automated Verification Script**:
   - Run `pwsh -ExecutionPolicy Bypass -File scripts/test-schedules-contract.ps1` to test the contract end-to-end.
