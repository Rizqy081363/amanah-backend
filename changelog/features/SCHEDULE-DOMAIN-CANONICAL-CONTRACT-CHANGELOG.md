# Schedule Domain Canonical Contract Changelog

**Date:** 2026-09-24  
**Audience:** Backend, Next.js Web Admin, Flutter Mobile  
**Change Type:** Breaking schedule-domain contract correction  
**Compatibility Policy:** No backward compatibility, no fallback status mapping

## Executive Summary

The schedule module now uses one canonical backend-owned status model.

The database persists only operational state. The backend derives effective availability and occupancy. Web and mobile consume the API contract and must not compute their own schedule state.

```text
PostgreSQL
-> backend domain model
-> API contract
-> Next.js / Flutter consumers
```

The reverse direction is not valid. Client display labels do not define backend domain states.

## Canonical Status Model

### Database Persistence

`practitioner_schedule_sessions.status` now persists only:

```text
open
closed
```

Removed from `schedule_status` persistence:

```text
pending
full
leave
```

Rules:

- `full` is not persistent. It is derived from `available_slots <= 0` while the session remains operationally open.
- `leave` is not a session status. Leave/cuti is metadata owned by day settings and leave periods.
- `pending` is obsolete for practitioner schedule sessions.

### API Effective Status

Schedule read endpoints expose only:

```text
OPEN
OCCUPIED
CLOSED
```

Meaning:

| Status | Meaning | Owner |
|---|---|---|
| `OPEN` | Operationally open and still has capacity. | Backend-derived |
| `OCCUPIED` | Operationally open but no remaining capacity. | Backend-derived, read-only |
| `CLOSED` | Not available for booking because the session/day is closed or the practitioner is on leave. | Backend-derived |

### Mutation Status

Schedule mutation endpoints accept only:

```text
OPEN
CLOSED
```

`OCCUPIED` must never be submitted by web or mobile. It is read-only.

Rejected status values:

```text
Buka
Tutup
Terisi
Penuh
Cuti
open
closed
full
leave
pending
```

## Leave / Cuti Rule

Cuti is not a primary schedule status.

Canonical representation:

```text
session.status = closed
day_setting.is_leave = true
day_setting.leave_reason = ...
practitioner_leave_periods = date range metadata
```

Clients must read `is_cuti`, `cuti_reason`, `cuti_start`, and `cuti_end` as closure metadata, not as additional status values.

## Database Migration

Migration:

```text
src/database/migrations/0010_canonical_schedule_status.sql
```

Data mapping:

```text
pending -> closed
leave   -> closed
full    -> open
```

After migration, PostgreSQL enum `schedule_status` is:

```sql
CREATE TYPE schedule_status AS ENUM ('open', 'closed');
```

Direct inserts or updates using `full`, `leave`, or `pending` now fail at the database boundary.

## API Contract Changes

### Web Admin

#### `GET /api/v1/admin/doctor-schedules`

Returns canonical effective status:

```json
{
  "status_dokter": "CLOSED",
  "status_jadwal": "CLOSED",
  "slot_tersedia": 0,
  "kapasitas_per_hari": 0,
  "jadwal_hari_ini": "-",
  "jadwal_praktik_mendatang": "Praktik Ditutup",
  "slot_terisi_akumulasi": 0,
  "slot_kapasitas_akumulasi": 0,
  "display_akumulasi_slot": "-",
  "is_cuti": false,
  "cuti_reason": null
}
```

Closed invariant:

```text
status_dokter = CLOSED
slot_tersedia = 0
kapasitas_per_hari = 0
slot_terisi_akumulasi = 0
slot_kapasitas_akumulasi = 0
display_akumulasi_slot = "-"
```

The client must not show active slot cards for `CLOSED`.

Status filter accepts only:

```text
OPEN
OCCUPIED
CLOSED
```

Invalid filters return:

```text
400 INVALID_SCHEDULE_STATUS_FILTER
```

#### `GET /api/v1/admin/doctor-schedules/:id`

Affected fields now use canonical status:

```text
data.status_dokter
data.monthly_schedule[].status
data.sesi_harian[].status_sesi
data.timeline_intervals[].status
```

`timeline_intervals[].displayLabel` may still be localized display text.

#### `PATCH /api/v1/admin/doctor-schedules/:id/days/:date`

Request:

```json
{
  "status": "CLOSED",
  "notes": "Poli ditutup untuk sterilisasi ruangan"
}
```

Allowed values:

```text
OPEN
CLOSED
```

#### `PATCH /api/v1/admin/doctor-schedules/:id/sessions/:sessionId`

Request:

```json
{
  "status_sesi": "OPEN"
}
```

Allowed values:

```text
OPEN
CLOSED
```

#### `PUT/PATCH /api/v1/admin/doctor-schedules/:id`

`status_jadwal` accepts only:

```text
OPEN
CLOSED
```

Leave remains explicit metadata:

```json
{
  "is_cuti": true,
  "cuti_reason": "Cuti Tahunan",
  "cuti_start": "2026-09-24",
  "cuti_end": "2026-09-25"
}
```

#### Reschedule Endpoints

Closed and leave sessions are not reschedule-eligible.

Affected endpoints:

```text
GET  /api/v1/admin/doctor-schedules/:id/sessions/:sessionId/reschedule-eligibility
POST /api/v1/admin/doctor-schedules/:id/sessions/:sessionId/reschedule
```

Rejected closed-session reschedule:

```text
422 SESSION_NOT_ELIGIBLE_FOR_RESCHEDULE
```

### Flutter Mobile / Doctor Schedule

#### `GET /api/v1/schedules/reference/options`

Editable statuses:

```json
[
  { "id": "OPEN", "label": "Buka" },
  { "id": "CLOSED", "label": "Tutup" }
]
```

Read-only interval statuses:

```json
[
  { "id": "OPEN", "label": "Buka" },
  { "id": "OCCUPIED", "label": "Terisi" },
  { "id": "CLOSED", "label": "Tutup" }
]
```

Mobile must not display `OCCUPIED` as a user-editable status.

#### `GET /api/v1/schedules/my-schedules`

`status` now returns:

```text
OPEN
OCCUPIED
CLOSED
```

#### `GET /api/v1/schedules/:id`

`status` now returns canonical effective status.

#### `PATCH /api/v1/schedules/:id/availability`

The endpoint returns:

```text
OPEN
CLOSED
```

based on `isAvailable`.

#### `PATCH /api/v1/schedules/:id`

If status is included, it accepts only:

```text
OPEN
CLOSED
```

#### `PATCH /api/v1/schedules/days/:date`

Request:

```json
{
  "status": "CLOSED",
  "notes": "Dokter tidak praktik hari ini"
}
```

Allowed values:

```text
OPEN
CLOSED
```

#### `GET /api/v1/schedules/calendar-summary`

Day status now returns:

```text
OPEN
OCCUPIED
CLOSED
```

#### Projection and Occupancy Endpoints

Affected endpoints:

```text
GET /api/v1/schedules/projection
GET /api/v1/schedules/occupancy-overview
GET /api/v1/schedules/contexts
```

Interval status remains canonical:

```text
OPEN
OCCUPIED
CLOSED
OCCUPIED_BY_SELF
OCCUPIED_BY_OTHER
CLOSED_LEAVE
```

Localized fields such as `displayLabel` are presentation-only.

## Client Implementation Rules

Web and mobile must:

- Use `OPEN`, `OCCUPIED`, and `CLOSED` as the only effective schedule status values.
- Send only `OPEN` or `CLOSED` in mutation requests.
- Treat `OCCUPIED` as read-only.
- Stop sending Indonesian labels as status values.
- Stop sending lowercase database enum values as API request status values.
- Stop deriving schedule state from slot arrays.
- Stop deriving `OCCUPIED` locally.
- Render localized text from canonical backend status only at the UI boundary.

Web and mobile must not:

- Map `Buka -> OPEN` before sending.
- Map `Tutup -> CLOSED` before sending.
- Map `Terisi/Penuh/full -> OCCUPIED`.
- Treat `Cuti/leave` as schedule status.
- Keep fallback branches for old status values.

## Rendering Rules

### `OPEN`

Render active schedule UI. Slot and capacity metrics may be shown.

### `OCCUPIED`

Render active schedule UI with fully occupied state. Slot and capacity metrics may be shown because the schedule is still operational.

### `CLOSED`

Render closed/empty state. Do not render active slot cards, remaining slot counters, or accumulated filled-slot metrics.

## Appointment Cancellation Impact

Cancelling or marking an appointment as no-show restores `available_slots`.

It does not change `practitioner_schedule_sessions.status` from `full` to `open`, because `full` is no longer persisted. The persistent status remains:

```text
open
```

The effective read status changes from `OCCUPIED` to `OPEN` when restored availability becomes greater than zero.

## Verification Evidence

Executed on 2026-09-24 against the rebuilt Docker API container.

```text
bun run build
-> passed

bun run test -- modules/schedules --runInBand
-> 6 test suites passed
-> 52 tests passed

docker compose build api
-> amanah-healthcare-backend-api built

docker compose up -d api
-> api container recreated and healthy

SELECT enumlabel
FROM pg_enum
WHERE enumtypid = 'schedule_status'::regtype
ORDER BY enumsortorder;
-> open
-> closed

powershell -ExecutionPolicy Bypass -File scripts/e2e/test-schedule-v2-security-crud.ps1
-> 136 passed
-> 0 failed
```

The E2E suite includes explicit no-fallback checks:

```text
GET   /api/v1/admin/doctor-schedules?status=Buka
-> 400 INVALID_SCHEDULE_STATUS_FILTER

GET   /api/v1/admin/doctor-schedules?status=open
-> 400 INVALID_SCHEDULE_STATUS_FILTER

PATCH /api/v1/admin/doctor-schedules/:id/sessions/:sessionId
body: { "status_sesi": "Tutup" }
-> 422 enum validation rejection

PATCH /api/v1/schedules/days/:date
body: { "status": "Tutup" }
-> 400 INVALID_SCHEDULE_STATUS
```

## Frontend Handoff Decision

This contract is ready for Web Admin and Flutter Mobile implementation.

There is no compatibility layer for the old schedule statuses. Each client must update to the canonical backend contract.
