# Doctor Schedule Management

## Goal

Provide a single backend contract for Amanah Healthcare doctor schedule operations so the Flutter mobile doctor app, Next.js admin dashboard, and patient booking flow read and write the same PostgreSQL schedule source of truth.

## Actors

- Administrator: supervises all doctor schedules from the admin web dashboard.
- Doctor / clinical staff: manages their own practice schedule from the mobile app.
- Patient / public booking user: reads doctor availability for appointment booking.

## User Flow

1. A doctor or authorized staff member creates and updates practice sessions from the mobile schedule flow.
2. The admin web dashboard reads aggregated doctor schedule cards and detail calendars from `/api/v1/admin/doctor-schedules`.
3. Patient booking reads available clinical practitioners from `/api/v1/clinical/practitioners`.
4. All consumers receive presentation-ready fields for schedule status, quota, rooms, daily sessions, and display avatars.

## Functional Requirements

- Return paginated admin doctor schedule cards with filters for search, poli, status, month, and date.
- Return admin schedule detail with monthly calendar status and daily sessions.
- Allow admin cuti, capacity, day status, and extra-session overrides without creating doctor profiles from the schedule module.
- Preserve mobile doctor schedule CRUD endpoints under `/api/v1/schedules`.
- Return patient-facing practitioner availability under `/api/v1/clinical/practitioners`.
- Normalize doctor card avatar fields to a non-null string. If no avatar is stored, return `""`.

## Business Rules

- Doctor onboarding is outside schedule management.
- A doctor cannot have overlapping practice sessions on the same date.
- A room cannot be double-booked for overlapping sessions.
- Deleting a session with active bookings is blocked with HTTP 409.
- Cuti status closes availability for the affected date.
- Database avatar storage may remain nullable, but doctor-card API presentation fields must not return `null`.

## Data Requirements

- Existing PostgreSQL tables are reused: `practitioners`, `staff_profiles`, `medical_specialties`, `clinic_rooms`, `clinic_units`, `practitioner_schedule_sessions`, `practitioner_schedule_day_settings`, `practitioner_leave_periods`, and `appointments`.
- No new schedule table or duplicate persistence model is required.
- Doctor display avatars are read from `staff_profiles.avatar_url`.
- Missing doctor avatars are projected as `avatar: ""` in admin and clinical practitioner list responses.
- Patient booked-list `avatarUrl` remains nullable because it is a separate patient profile contract.

## API Requirements

- `GET /api/v1/admin/doctor-schedules`
- `GET /api/v1/admin/doctor-schedules/:id`
- `PUT` / `PATCH /api/v1/admin/doctor-schedules/:id`
- `PATCH /api/v1/admin/doctor-schedules/:id/day-status`
- `POST /api/v1/admin/doctor-schedules/:id/sessions`
- `GET /api/v1/clinical/practitioners`
- Existing mobile endpoints under `/api/v1/schedules/*`

For admin and clinical doctor cards, `avatar` is always a JSON string. Consumers should treat `""` as "no uploaded avatar" and render initials or local fallback UI.

## UI Requirements

- Admin web should bind to backend schedule endpoints instead of local doctor schedule mocks.
- Admin web runtime schemas should allow `avatar` as `string`; `""` is the empty state.
- Mobile Flutter should keep using `/api/v1/schedules/*` for authenticated doctor schedule management.
- Mobile Flutter can continue treating booked patient `avatarUrl` as nullable.

## Error States

- `401 Unauthorized`: missing or invalid session/token.
- `403 Forbidden`: role or ownership violation.
- `404 Not Found`: requested practitioner or schedule session does not exist.
- `409 Conflict`: overlapping schedule, occupied room, or active-booking deletion protection.
- `422 Unprocessable Entity`: invalid schedule payload, time range, date, or quota.

## Acceptance Criteria

- Given admin web requests `/api/v1/admin/doctor-schedules`, when doctors have no uploaded avatar, then each doctor card returns `avatar: ""` and not `avatar: null`.
- Given patient booking requests `/api/v1/clinical/practitioners`, when a practitioner has no uploaded avatar, then each practitioner card returns `avatar: ""` and not `avatar: null`.
- Given mobile creates or updates a schedule through `/api/v1/schedules`, then the admin web reads the same schedule data through `/api/v1/admin/doctor-schedules`.
- Given overlapping doctor or room schedules, then backend rejects the mutation with HTTP 409.
- Given a schedule has active bookings, then backend rejects deletion with HTTP 409.

## Out of Scope

- Creating or onboarding doctors.
- Editing STR/SIP credentials.
- Rewriting frontend web or Flutter code.
- Creating duplicate schedule tables.
- Changing patient profile avatar nullability.
