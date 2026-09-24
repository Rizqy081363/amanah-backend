# Schedule V2 Backend Projection

## Goal

Make the backend the canonical scheduling engine for practitioner availability so Flutter mobile, Next.js admin, and patient booking consume the same duration, context boundary, projected interval, appointment occupation, and status semantics.

## Actors

- Doctor / clinical staff: creates their own availability from mobile by choosing date, context, and start time.
- Administrator: manages practitioner schedule policy such as consultation duration and reviews schedules in the web dashboard.
- Patient booking user: consumes open availability through booking flows.

## User Flow

1. Doctor selects a date.
2. Backend returns valid schedule contexts and the effective consultation duration.
3. Doctor enters an arbitrary valid start time.
4. Backend projects intervals from that exact start time until the context boundary.
5. Doctor submits availability without manually supplying `endTime`.
6. Backend persists the canonical availability and returns the projected intervals.
7. Admin web renders the same projected intervals as a timeline/Gantt view.

## Functional Requirements

- Backend owns the effective consultation duration.
- Duration is practitioner-specific and admin-editable.
- Doctor-facing availability creation accepts `date`, `scheduleContextId`, and `startTime`; `endTime` is derived by backend.
- Backend preserves arbitrary valid start times such as `08:45`, `09:10`, or `09:40`.
- Backend returns projected intervals anchored to the selected start time.
- Backend returns interval statuses using only `OPEN`, `OCCUPIED`, and `CLOSED`.
- Indonesian display labels are `Buka`, `Terisi`, and `Tutup`.
- Leave is represented as `CLOSED` with `closedReason: LEAVE`, not a top-level availability status.
- Existing legacy schedule endpoints remain available during migration.

## Business Rules

- A practitioner cannot have overlapping schedule sessions on the same date.
- A room cannot be occupied by overlapping sessions.
- Availability mutations that would move, close, or delete active appointments must be rejected.
- Admin controls consultation duration; doctors consume it as read-only.
- If a start time leaves less than one consultation interval before the context boundary, backend rejects the request.
- `Penuh` is not a canonical status. Occupied intervals are `OCCUPIED` / `Terisi`.

## Data Requirements

- Add practitioner-level schedule policy fields:
  - `consultation_duration_minutes`
  - `start_precision_minutes`
- Reuse existing PostgreSQL schedule tables:
  - `practitioners`
  - `practitioner_schedule_sessions`
  - `practitioner_schedule_day_settings`
  - `appointments`
  - `clinic_rooms`
  - `clinic_services`
- Persist one continuous availability window as one `practitioner_schedule_sessions` row.
- Projected intervals are derived from persisted availability windows and appointments.

## API Requirements

- `GET /api/v1/schedules/contexts?date=YYYY-MM-DD`
- `GET /api/v1/schedules/projection?date=YYYY-MM-DD&scheduleContextId=morning&startTime=08:45`
- `POST /api/v1/schedules/availability`
- `PATCH /api/v1/admin/doctor-schedules/:id/duration`

Legacy endpoints stay available while frontend clients migrate.

## UI Requirements

- Flutter removes manual `To` input after switching to `POST /api/v1/schedules/availability`.
- Flutter displays backend duration as read-only for doctors.
- Next.js admin renders `timeline_intervals` as the schedule detail timeline/Gantt source.
- Both frontend clients map `OPEN`, `OCCUPIED`, `CLOSED` to `Buka`, `Terisi`, `Tutup`.

## Error States

- `START_OUTSIDE_BOUNDARY`: selected start is outside the chosen context boundary.
- `INVALID_START_PRECISION`: selected start does not satisfy backend precision policy.
- `DURATION_LEAVES_NO_CAPACITY`: selected start and duration leave zero valid intervals.
- `SCHEDULE_OVERLAP`: practitioner already has overlapping availability.
- `ROOM_OVERLAP`: room already has overlapping availability.
- `APPOINTMENTS_ALREADY_EXIST`: mutation would affect active appointments.
- `PRACTITIONER_NOT_AUTHORIZED`: actor cannot mutate that practitioner schedule.
- `SCHEDULE_MODIFIED_CONCURRENTLY`: submitted version is stale.

## Acceptance Criteria

- Given duration is `30`, when start is `08:45`, projection begins at `08:45` and does not round to `09:00`.
- Given boundary end is `12:00`, when start is `09:40` and duration is `30`, backend returns four intervals ending at `11:40` with remaining boundary time unused.
- Given an appointment overlaps an interval, backend marks that interval `OCCUPIED`.
- Given a day is leave, backend marks intervals `CLOSED` with reason `LEAVE`.
- Given Flutter creates availability through v2, request body does not need `endTime`.
- Given admin changes duration, later projections for that practitioner use the new value.
- Given active appointments exist, unsafe schedule update or delete returns conflict instead of mutating data.

## Out of Scope

- Building Flutter or Next.js UI changes in this backend repository.
- Automatic appointment rescheduling.
- Recurring schedule generation.
- Service-specific duration inheritance beyond practitioner-level policy.
