# Canonical Schedule Status Contract Changelog

> Canonical full-module handoff is now maintained at
> `docs/features/SCHEDULE-DOMAIN-CANONICAL-CONTRACT-CHANGELOG.md`.
> Use that document as the source of truth for both Next.js Web Admin and Flutter Mobile.

**Date:** 2026-09-24  
**Audience:** Next.js Web Admin, Flutter Mobile, Backend  
**Change Type:** Breaking API contract correction  
**Backend Rule:** PostgreSQL -> backend domain -> API contract -> clients

## Summary

Schedule status is now governed by one canonical backend model. Clients must stop sending or treating Indonesian display labels as domain status values.

## Canonical Model

### Persistent Session Status

`practitioner_schedule_sessions.status` persists only operating state:

```text
open
closed
```

Removed from session persistence:

```text
pending
full
leave
```

`full` is not a persisted session status. Occupancy is derived from `capacity`, `available_slots`, and active appointments.

`leave` is not a persisted session status. Leave is represented by `practitioner_schedule_day_settings.is_leave`, `leave_reason`, and `practitioner_leave_periods`.

### Effective API Status

API consumers must use these canonical values:

```text
OPEN
OCCUPIED
CLOSED
```

Definitions:

| Status | Meaning | Source |
|---|---|---|
| `OPEN` | Session/day can accept bookings and has available capacity. | Derived by backend |
| `OCCUPIED` | Operationally open, but fully occupied by active appointments/capacity. | Derived by backend |
| `CLOSED` | Not available for booking because the session/day is closed or practitioner is on leave. | Derived by backend |

## Breaking Changes

The backend no longer accepts these values as status inputs:

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

For status mutation requests, clients must send only:

```text
OPEN
CLOSED
```

`OCCUPIED` is read-only and backend-derived. Clients must not submit it.

## API Contract

### `GET /api/v1/admin/doctor-schedules`

Status fields now return canonical effective status:

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
  "is_cuti": false
}
```

Closed invariant:

```text
status_dokter == CLOSED
=> no active slot metrics
=> display_akumulasi_slot == "-"
=> frontend must not render active slot/stat cards
```

Fully occupied invariant:

```text
status_dokter == OCCUPIED
=> practice is not closed
=> capacity may remain > 0
=> available slots are 0
```

### Status Filter

`GET /api/v1/admin/doctor-schedules?status=...`

Allowed values:

```text
OPEN
OCCUPIED
CLOSED
```

Invalid values return `400 INVALID_SCHEDULE_STATUS_FILTER`.

### `PATCH /api/v1/admin/doctor-schedules/:id/days/:date`

Request:

```json
{
  "status": "CLOSED",
  "notes": "Poli ditutup untuk sterilisasi ruangan"
}
```

Allowed `status` values:

```text
OPEN
CLOSED
```

`Cuti` is not accepted here. Use leave/cuti fields or leave endpoints.

### `PATCH /api/v1/admin/doctor-schedules/:id/sessions/:sessionId`

Request:

```json
{
  "status_sesi": "OPEN"
}
```

Allowed `status_sesi` values:

```text
OPEN
CLOSED
```

### `PUT/PATCH /api/v1/admin/doctor-schedules/:id`

`status_jadwal` accepts only:

```text
OPEN
CLOSED
```

Leave/cuti remains separate:

```json
{
  "is_cuti": true,
  "cuti_reason": "Cuti Tahunan",
  "cuti_start": "2026-09-24",
  "cuti_end": "2026-09-25"
}
```

When `is_cuti` is true, affected sessions are persisted as `closed`, while leave reason/date remains in leave metadata.

## Database Migration

Migration added:

```text
src/database/migrations/0010_canonical_schedule_status.sql
```

Migration mapping:

```text
pending -> closed
leave   -> closed
full    -> open
```

Then PostgreSQL enum `schedule_status` is recreated as:

```sql
CREATE TYPE schedule_status AS ENUM ('open', 'closed');
```

## Frontend Required Changes

Clients must:

- Treat `OPEN`, `OCCUPIED`, and `CLOSED` as the only effective API status values.
- Send only `OPEN` or `CLOSED` for schedule/session/day status mutations.
- Stop sending `Buka`, `Tutup`, `Terisi`, `Penuh`, `Cuti`, `open`, `closed`, `full`, `leave`, or `pending`.
- Stop computing schedule state from local slot arrays.
- Stop deriving `OCCUPIED` locally.
- Use `is_cuti` and `cuti_reason` only as leave metadata, not as a primary status.
- For `CLOSED`, render the closed/empty state and hide active slot metric cards.

Frontend may localize display text, but localization must be a pure presentation mapping from canonical backend values.
