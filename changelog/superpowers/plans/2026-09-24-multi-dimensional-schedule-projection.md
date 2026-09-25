# Multi-Dimensional Schedule Projection & State Refactor Implementation Plan

> **Goal:** Refactor schedule projection into a pure theoretical slot generator (`ScheduleSlotFactory`) and multi-dimensional state resolver (`ScheduleSlotStateResolver`) covering 24 hours in four 6-hour shifts, backed by database closure and reschedule events.

**Architecture:** 
1. Database persists only facts that change the grid: policies (`clinic_schedule_policies`), availability sessions (`practitioner_schedule_sessions`), real appointments (`appointments`), leave periods (`practitionerLeavePeriods`), manual non-leave closures (`practitioner_schedule_closures`), and structured reschedule events (`schedule_reschedule_events`).
2. Pure mathematical factory (`ScheduleSlotFactory`) generates theoretical slots from shift boundaries (360m / interval = 12 slots).
3. Resolver (`ScheduleSlotStateResolver`) overlays facts onto theoretical slots, producing multi-dimensional states (Temporal: PAST/CURRENT/FUTURE, Availability: UNSCHEDULED/AVAILABLE/OCCUPIED/CLOSED, Closure: LEAVE/OTHER, Reschedule: structured metadata, Effective: EXPIRED/CLOSED/OCCUPIED/AVAILABLE/UNSCHEDULED).
4. Summary counts (`total`, `unscheduled`, `available`, `occupied`, `closed`) are mathematically derived from slot projection without guessing formulas.

**Tech Stack:** NestJS, TypeScript, Drizzle ORM, PostgreSQL, Docker.

---

## Task Breakdown

### Task 1: Database Migration & Schema for Closures and Reschedule Events
- **Files:**
  - Create: `src/database/migrations/0012_schedule_closures_and_reschedule_events.sql`
  - Modify: `src/database/schema/amanah.schema.ts`
  - Modify: `src/database/schema/amanah.relations.ts`
- **Tables to add:**
  1. `practitioner_schedule_closures`:
     - `id`: varchar(36) PK
     - `practitioner_id`: uuid FK -> practitioners.id
     - `schedule_date`: date
     - `scope`: varchar(20) ('DAY', 'CONTEXT', 'INTERVAL')
     - `context_code`: varchar(30) nullable ('early_morning', 'morning', 'afternoon', 'night')
     - `start_time`: varchar(5) nullable
     - `end_time`: varchar(5) nullable
     - `category`: varchar(20) ('OTHER')
     - `reason_code`: varchar(50) ('MEETING', 'EMERGENCY', 'CLINIC_CLOSED', 'MANUAL', 'OTHER')
     - `reason_text`: text
     - `created_by`: uuid nullable
     - `created_at`, `updated_at`: timestamps
     - `cancelled_at`: timestamp nullable
  2. `schedule_reschedule_events`:
     - `id`: varchar(36) PK
     - `schedule_session_id`: uuid nullable
     - `practitioner_id`: uuid FK -> practitioners.id
     - `source_date`: date
     - `source_start_time`: varchar(8)
     - `source_end_time`: varchar(8)
     - `source_room_id`: uuid nullable
     - `target_date`: date
     - `target_start_time`: varchar(8)
     - `target_end_time`: varchar(8)
     - `target_room_id`: uuid nullable
     - `reason_code`: varchar(50) nullable
     - `reason_text`: text nullable
     - `moved_appointments_count`: integer DEFAULT 0
     - `performed_by`: uuid nullable
     - `created_at`: timestamp

### Task 2: Domain Types & Pure Theoretical ScheduleSlotFactory
- **Files:**
  - Modify: `src/modules/schedules/domain/factories/schedule-slot.factory.ts`
  - Test: `src/modules/schedules/domain/factories/schedule-slot.factory.spec.ts`
- **Capabilities:**
  - 4 six-hour contexts (360m): `early_morning` (00:00-06:00), `morning` (06:00-12:00), `afternoon` (12:00-18:00), `night` (18:00-24:00).
  - Handles midnight rollover (minute 1440 = 24:00).
  - Pure method `generateTheoreticalSlots(context, intervalMinutes)` returning:
    `Array<{ slotIndex: number, startTime: string, endTime: string, startMinutes: number, endMinutes: number }>`
  - Never queries database, never persists, never checks appointments.

### Task 3: Multi-Dimensional ScheduleSlotStateResolver
- **Files:**
  - Create: `src/modules/schedules/domain/resolvers/schedule-slot-state.resolver.ts`
  - Test: `src/modules/schedules/domain/resolvers/schedule-slot-state.resolver.spec.ts`
- **Capabilities:**
  - Multi-dimensional model:
    - Temporal: `PAST | CURRENT | FUTURE` (derived from clock time)
    - Availability: `UNSCHEDULED | AVAILABLE | OCCUPIED | CLOSED`
    - Closure: `{ category: 'LEAVE' | 'OTHER', reasonCode?: string, reasonText?: string, sourceId?: string }`
    - Reschedule: `{ isRescheduled: boolean, previous?: object, current?: object, reason?: string }`
    - Effective Status: `EXPIRED | CLOSED | OCCUPIED | AVAILABLE | UNSCHEDULED`
    - `isSelectable`: boolean (`effectiveStatus === 'AVAILABLE' && temporalState !== 'PAST'`)
  - Summary counts:
    - `total`: sum of all theoretical slots
    - `unscheduled`: count of UNSCHEDULED
    - `available`: count of AVAILABLE
    - `occupied`: count of OCCUPIED
    - `closed`: count of CLOSED
    - `past`: count of PAST temporal slots

### Task 4: Repository & Projection Integration
- **Files:**
  - Modify: `src/modules/schedules/infrastructure/drizzle/schedule.drizzle-repository.ts`
  - Modify: `src/modules/schedules/domain/repositories/schedule.repository.ts`
  - Modify: `src/modules/schedules/domain/entities/schedule.entity.ts`
- **Capabilities:**
  - Bulk loads for date/practitioner: sessions, appointments, leave, closures, reschedule events.
  - Builds authoritative multi-dimensional projection via `ScheduleSlotStateResolver`.
  - Exposes timeline intervals with full dimensions to `/api/v1/admin/doctor-schedules/:id` and `/api/v1/schedules/projection`.

### Task 5: Database Seeder & Showcase Scenarios
- **Files:**
  - Modify: `src/database/seeds/drizzle/seed.ts`
- **Scenarios seeded:**
  - `UNSCHEDULED`: slots outside doctor's opened ranges.
  - `AVAILABLE`: doctor opened ranges with no booking/closure.
  - `OCCUPIED`: real active patient booking occupying interval.
  - `CLOSED / LEAVE`: doctor on leave.
  - `CLOSED / OTHER`: manual range closure (e.g. meeting / emergency).
  - `PAST / EXPIRED`: intervals before current clock time.
  - `RESCHEDULED`: session moved with history in `schedule_reschedule_events`.

### Task 6: Testing & Verification
- Unit tests (`jest modules/schedules`).
- Database migration execution in Docker postgres.
- Docker build & container recreation.
- Live PowerShell verification script testing all multi-dimensional states and summary counts.
- Fresh changelog document: `docs/web/CHANGELOG-MULTI-DIMENSIONAL-SCHEDULE-PROJECTION.md`.
