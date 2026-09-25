# API Contract Changelog: Canonical 4-Shift Cycle, Database-Driven Shift Vocabularies, Status Normalization, and Multi-Client Synchronization Pattern

- **Changelog ID**: `CHG-20260925-SCHED-002`
- **Date**: 2026-09-25
- **Author**: Backend Engineering Team
- **Type**: Non-breaking Enhancement & Contract Clarification
- **Target Audience**: Flutter Mobile Team, Web-Admin Frontend Team, Backend Integration Engineers

---

## 1. Executive Summary

This changelog addresses the recent findings reported by the Flutter mobile development team regarding schedule creation and updates. It establishes the full **4-shift 24-hour cycle** (`early_morning`, `morning`, `afternoon`, `night`), aligns all DTOs and repositories directly with PostgreSQL database enums (`staff_shift` and `schedule_status`), eliminates hardcoded magic strings, introduces tolerant DTO transformers for client convenience while enforcing strict canonical values in the domain, and documents the recommended **`syncAll`** post-mutation synchronization pattern for both Flutter Mobile and Web-Admin clients.

---

## 2. Changes Summary

| Area | Previous State | New Canonical Contract | Breaking? | Affected Clients |
|---|---|---|---|---|
| **Shift Enumerations** | Only `PAGI`, `SIANG`, `MALAM` permitted in some DTOs; `Dini Hari` rejected with 422 Unprocessable Entity | All 4 shifts supported: `DINI_HARI`, `PAGI`, `SIANG`, `MALAM` matching DB `staff_shift` (`early_morning`, `morning`, `afternoon`, `night`) | No | Mobile, Web-Admin |
| **Status Normalization** | Strict rejection if client sent `Tutup` or `Buka` without uppercase canonical format | DTO layer normalizes `Tutup`/`tutup` -> `CLOSED` and `Buka`/`buka` -> `OPEN` via `@Transform`; domain remains strictly canonical | No | Mobile, Web-Admin |
| **Zero Magic Strings** | Inline ternary string checks scattered across repositories (`drizzle-schedule-patient.repository.ts`, `drizzle-admin-session-mutation.repository.ts`) | Centralized canonical constants (`schedule-shift.constants.ts`) and unified `resolveCanonicalShift()` | No | Internal / Quality |
| **Patient Repository** | `getAdminSessionPatients` and `getAdminDoctorPatientsByDate` had manual shift checks | Sourced directly from canonical constants with database-level shift resolution | No | Mobile, Web-Admin |
| **End Time Projection** | Reschedule pre-check previously lacked doctor duration context in some fallbacks | Reschedule pre-check automatically calculates `projectedEndTime` based on doctor's consultation duration (e.g. 30m); clients **never** provide `targetEndTime` | No | Mobile, Web-Admin |
| **Multi-Read Post-Mutation Sync** | Single endpoint call left calendar, day status, and room occupancy cards stale | Documented and validated `syncAll` pattern: 4 parallel queries to maintain 100% UI consistency | No | Mobile, Web-Admin |

---

## 3. Database Single Source of Truth (SSOT)

The backend derives all shifts and statuses directly from PostgreSQL database enums:

### 3.1. `public.staff_shift` Enum
```sql
CREATE TYPE staff_shift AS ENUM ('early_morning', 'morning', 'afternoon', 'night');
```

| Database Enum (`staff_shift`) | Canonical DTO (`session`) | Display Label (`sessionLabel`) | Default Window |
|---|---|---|---|
| `early_morning` | `DINI_HARI` | `Dini Hari` | `00:00 - 06:00 WIB` |
| `morning` | `PAGI` | `Pagi` | `06:00 - 12:00 WIB` |
| `afternoon` | `SIANG` | `Siang` | `12:00 - 18:00 WIB` |
| `night` | `MALAM` | `Malam` | `18:00 - 24:00 WIB` |

### 3.2. `public.schedule_status` Enum
```sql
CREATE TYPE schedule_status AS ENUM ('open', 'closed');
```
- Domain command status: `OPEN` or `CLOSED`.
- Database persistence status: `open` or `closed`.

---

## 4. Contract Specifications

### 4.1. Creating a Schedule Session
- **Endpoint**: `POST /api/v1/schedules`
- **Request Body (JSON)**:
```json
{
  "scheduleDate": "2026-09-26",
  "session": "DINI_HARI",
  "sessionType": "Dini Hari",
  "startTime": "02:00",
  "endTime": "02:30",
  "capacity": 1,
  "roomId": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
  "notes": "Sesi dini hari poli darurat"
}
```
*Note on `session`:* Accepted values are `DINI_HARI`, `PAGI`, `SIANG`, `MALAM`. DTO transformation automatically normalizes aliases such as `"Dini Hari"`, `"dini_hari"`, `"early_morning"` to `DINI_HARI`.

### 4.2. Updating a Schedule Session
- **Endpoint**: `PATCH /api/v1/schedules/:id`
- **Request Body (JSON)**:
```json
{
  "session": "PAGI",
  "status": "CLOSED",
  "notes": "Dokter berhalangan hadir"
}
```
*Note on `status`:* Canonical values are `OPEN` and `CLOSED`. For frontend compatibility, the DTO automatically converts `"Tutup"`/`"tutup"` to `CLOSED` and `"Buka"`/`"buka"` to `OPEN`.

### 4.3. Reschedule Eligibility & Execution (Backend-Calculated End Time)
- **Pre-check**: `GET /api/v1/schedules/sessions/:sessionId/reschedule-eligibility?targetDate=2026-09-26&targetStartTime=08:30&targetRoomId=b77d141b-2fa5-4481-9f47-a5a040faf57a`
- **Rule**: Client passes **only** `targetStartTime` (e.g. `08:30`). The backend automatically looks up the doctor's consultation duration (e.g. 30 minutes) and projects `projectedEndTime` to `09:00`.
- **Response**:
```json
{
  "success": true,
  "data": {
    "sessionId": "6fb1f17e-e9cf-44bd-add6-773c5fb870e9",
    "isEligible": true,
    "targetValidation": {
      "evaluated": true,
      "targetDate": "2026-09-26",
      "targetStartTime": "08:30",
      "projectedEndTime": "09:00",
      "targetRoomId": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
      "isTargetEligible": true,
      "conflictCode": null,
      "conflictMessage": null
    }
  }
}
```
- **Execution**: `POST /api/v1/schedules/sessions/:sessionId/reschedule`
```json
{
  "targetDate": "2026-09-26",
  "targetStartTime": "08:30",
  "targetRoomId": "b77d141b-2fa5-4481-9f47-a5a040faf57a",
  "rescheduleActiveAppointments": true
}
```

---

## 5. Client Synchronization Guidance (`syncAll`)

To prevent UI state inconsistencies where the calendar strip, day status card, session list, and room occupancy display stale data after any schedule mutation, both **Flutter Mobile** and **Web-Admin** clients should execute the following 4 parallel reads:

```dart
// Flutter Example Pattern (AmanahScheduleStore.syncAll)
Future<void> syncAll(DateTime date, {bool forceRefresh = true}) async {
  final dateStr = DateFormat('yyyy-MM-dd').format(date);
  final monthKey = DateFormat('yyyy-MM').format(date);

  await Future.wait([
    // 1. Session list & patient counters for selected date
    loadSchedulesForDate(dateStr, forceRefresh: forceRefresh),
    // 2. Calendar monthly dot indicators & status badges
    loadCalendarSummary(monthKey),
    // 3. Day operational settings (open/closed full day, max patients)
    loadDaySettings(dateStr),
    // 4. Room occupancy grid across all 4 shifts
    loadOccupancyOverview(date: dateStr),
  ]);
}
```

### Endpoints Called by `syncAll`:
1. `GET /api/v1/schedules/my-schedules?date=YYYY-MM-DD`
2. `GET /api/v1/schedules/calendar-summary?month=YYYY-MM`
3. `GET /api/v1/schedules/day-settings?date=YYYY-MM-DD`
4. `GET /api/v1/schedules/occupancy-overview?date=YYYY-MM-DD`

---

## 6. Verification & Test Evidence

- **Unit & Domain Tests**: All 52 test cases across 13 test files passed:
  - `ScheduleSlotFactory`: divisions of 24h into 4 shifts, early morning 00:00 start time, dynamic duration calculation.
  - `schedule-status.spec.ts`: strict canonical command parsing (`OPEN`, `CLOSED`).
  - `drizzle-schedule-availability.spec.ts`: 30-minute end time auto-calculation for early morning sessions.
  - `schedules.controller.spec.ts`: 21 passed tests covering dynamic projection, reschedule parity, and occupancy overview.
- **Docker Verification**: API container rebuilt and running healthy with all updated schemas and constants.
- **Live Documentation**: Verified and regenerated via `bun run docs:schedules` (`docs/SCHEDULE_MANAGEMENT_API_SPEC.md`).
