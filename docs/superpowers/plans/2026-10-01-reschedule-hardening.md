# Reschedule Flow Hardening & Duplex Real-Time Notification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the appointment rescheduling mechanism across backend and real-time infrastructure, eliminating ghost/unscheduled slot assignments and establishing full duplex real-time notification propagation (patient-to-admin and admin-to-patient).

**Architecture:** Refactor `AppointmentRescheduleHandler` into a clean semantic abstraction layer without comment clutter, enforcing database-driven SSOT where session resolution, capacity transfers, slot allocation, and practitioner/room synchronization occur atomically. Expand `AppointmentNotificationPublisher` and `AppointmentsNotificationRules` to publish and route `APPOINTMENT_EVENTS.RESCHEDULED` bi-directionally through Redis Streams into the WebSocket gateway (`notification:new`).

**Tech Stack:** NestJS 11, TypeScript 5.7, Drizzle ORM, PostgreSQL, Redis Streams, Socket.io, Bun Test.

**Spec:** User Issue Intake: Rescheduling Flow Inconsistency & Missing Duplex Real-Time Notification.

## Global Constraints

- **Backend Single Source of Truth:** Frontend is strictly presentation; all schedule validation, practitioner assignment, and capacity bounds are enforced in PostgreSQL via Drizzle transactions.
- **No Comment-Annotated Clutter:** Code must be self-documenting through expressive semantic naming, early returns, and dedicated helper functions.
- **Zero Fallback Hacks:** No synthetic slot generation without an active practitioner schedule session.
- **File Length Limit:** All files must remain strictly under 500 lines of code.
- **Bi-directional Idempotent Real-Time:** Every reschedule must trigger a structured domain event with actor details, resolving admin/staff on patient actions and patient on admin actions.

---

### Task 1: Expand DTO and Domain Contracts for Reschedule

**Files:**
- Modify: `D:\Amanah-healthcare-backend\src\modules\appointments\presentation\dto\reschedule-appointment.dto.ts`

**Interfaces:**
- Consumes: Existing `RescheduleAppointmentDto`
- Produces: Updated `RescheduleAppointmentDto` accepting `target_shift` / `targetSession` alongside `target_session_id` / `newSessionId`

- [ ] **Step 1: Write test or type assertion for DTO validation**
Verify that `target_shift` and `targetSession` can be validated without errors.

- [ ] **Step 2: Add session name and shift fields to RescheduleAppointmentDto**
Add optional fields `target_shift` and `targetSession` to handle UI submissions where shift names are provided.

- [ ] **Step 3: Run bun test on appointments presentation**
Run: `bun test src/modules/appointments/presentation/appointments.controller.spec.ts`
Expected: PASS

---

### Task 2: Implement Rescheduled Event Publishing in `AppointmentNotificationPublisher`

**Files:**
- Modify: `D:\Amanah-healthcare-backend\src\modules\appointments\application\appointment-notification.publisher.ts`
- Create: `D:\Amanah-healthcare-backend\src\modules\appointments\application\appointment-notification.publisher.spec.ts`

**Interfaces:**
- Consumes: `DomainEvent`, `NotificationPublisher`, `APPOINTMENT_EVENTS.RESCHEDULED`
- Produces: `publishRescheduled(appointment, options, user)`

- [ ] **Step 1: Write unit tests for publishRescheduled in publisher spec**
Test that `publishRescheduled` builds a valid domain event containing:
  - `appointmentId`, `patientUserId`, `patientName`, `doctorName`, `targetDate`, `targetStartTime`, `targetEndTime`, `rescheduledByRole`.
  - Dispatches through `notificationPublisher.publish`.

- [ ] **Step 2: Implement publishRescheduled in AppointmentNotificationPublisher**
Add `publishRescheduled` method with actor normalization (identifying patient vs admin/staff) and safe error handling.

- [ ] **Step 3: Run test to verify publisher passes**
Run: `bun test src/modules/appointments/application/appointment-notification.publisher.spec.ts`
Expected: PASS

---

### Task 3: Upgrade `AppointmentsNotificationRules` to Duplex Resolution

**Files:**
- Modify: `D:\Amanah-healthcare-backend\src\modules\appointments\appointments.notifications.ts:131-145`
- Modify: `D:\Amanah-healthcare-backend\src\modules\appointments\appointments.notifications.spec.ts`

**Interfaces:**
- Consumes: `NotificationRulesRegistry`, `AppointmentRecipientResolver`
- Produces: Bi-directional rule for `APPOINTMENT_EVENTS.RESCHEDULED`

- [ ] **Step 1: Add unit tests for duplex reschedule notifications**
In `appointments.notifications.spec.ts`:
  - Test 1: When `rescheduledByRole === 'patient'`, recipient resolver returns admin & staff user IDs, title is "Perubahan Jadwal Janji Temu Pasien".
  - Test 2: When `rescheduledByRole === 'admin'`, recipients array contains `patientUserId`, title is "Jadwal Janji Temu Diperbarui oleh Klinik".

- [ ] **Step 2: Update Rule #5 in AppointmentsNotificationRules**
Replace unidirectional recipient resolution with duplex resolution:
  - Check `payload.rescheduledByRole`.
  - If admin/staff: target `payload.patientUserId`.
  - If patient: target admin and clinic staff via `recipientResolver.resolveAdminAndStaffUserIds()`, plus patient for in-app history.
  - Provide dynamic `titleTemplate`, `bodyTemplate`, `senderName`, `senderRole`, `visualKey`, and `resolveActions`.

- [ ] **Step 3: Run tests to verify rule**
Run: `bun test src/modules/appointments/appointments.notifications.spec.ts`
Expected: PASS

---

### Task 4: Refactor `AppointmentRescheduleHandler` into Semantic Chunk Functions

**Files:**
- Modify: `D:\Amanah-healthcare-backend\src\modules\appointments\infrastructure\drizzle\appointment-reschedule.handler.ts`

**Interfaces:**
- Consumes: `DrizzleDatabase`, `appointments`, `practitionerScheduleSessions`, `queueTickets`
- Produces: Atomically updated `AppointmentEntity` with synchronized `practitionerId`, `roomId`, `scheduleSessionId`, and slot timings.

- [ ] **Step 1: Define semantic decomposition functions**
Decompose the monolithic transaction into focused functions:
  - `validateRescheduleAuthorization(tx, apt, userId)`
  - `validateAppointmentStateForReschedule(apt)`
  - `resolveTargetScheduleSession(tx, dto, apt)`
  - `transferSessionCapacity(tx, oldSessionId, targetSession)`
  - `allocateRescheduledSlot(tx, targetSession, targetDate, currentAppointmentId)`
  - `synchronizeQueueTicket(tx, apt, targetSession, targetDate)`
  - `persistRescheduledAppointment(tx, appointmentId, targetSession, targetDate, slotTiming, userId)`
  - `recordStatusEvent(tx, appointmentId, status, userId, reason)`

- [ ] **Step 2: Fix practitioner and room synchronization bug**
Ensure `persistRescheduledAppointment` explicitly updates:
  ```ts
  practitionerId: targetSession.practitionerId,
  roomId: targetSession.roomId ?? apt.roomId,
  scheduledDate: targetDate,
  scheduledStartTime: slotTiming.startTime,
  scheduledEndTime: slotTiming.endTime,
  scheduleSessionId: targetSession.id,
  ```
And `synchronizeQueueTicket` updates `roomId: targetSession.roomId ?? apt.roomId`.

- [ ] **Step 3: Enforce strict DB validation without fallback**
If `targetSession` is full or closed or unresolvable, throw an explicit NestJS exception (`BadRequestException` or `UnprocessableEntityException`). Do not generate phantom slots.

- [ ] **Step 4: Verify code has no comment annotations and stays < 500 LOC**
Inspect line count and verify clean, self-documenting syntax.

---

### Task 5: Integrate Duplex Publishing in Services and Admin Schedule Repository

**Files:**
- Modify: `D:\Amanah-healthcare-backend\src\modules\appointments\application\appointments.service.ts:152-173`
- Modify: `D:\Amanah-healthcare-backend\src\modules\appointments\presentation\appointments.controller.ts:390-396`
- Modify: `D:\Amanah-healthcare-backend\src\modules\schedules\infrastructure\drizzle\repositories\reschedule\drizzle-schedule-reschedule.repository.ts:200-235`

**Interfaces:**
- Consumes: `AppointmentNotificationPublisher`, `AppointmentsService`, `DrizzleScheduleRescheduleRepository`
- Produces: Immediate Redis Stream notification event dispatch on patient reschedule and admin doctor session reschedule.

- [ ] **Step 1: Update AppointmentsService.reschedule to accept `user?: any`**
Invoke `this.notificationPublisher.publishRescheduled(updated, ...)` after repo reschedule succeeds.

- [ ] **Step 2: Update AppointmentsController.rescheduleAppointment**
Pass `user` object to `this.appointmentsService.reschedule(id, dto, user?.id || user?.sub, user)`.

- [ ] **Step 3: Connect admin doctor session reschedule to patient notification dispatch**
In `DrizzleScheduleRescheduleRepository`:
When `activeAppointments` are shifted to a new date/time by admin, dispatch `publishRescheduled` for each shifted appointment with `rescheduledByRole: 'admin'`.

- [ ] **Step 4: Run unit tests**
Run: `bun test src/modules/schedules/infrastructure/drizzle/repositories/reschedule/drizzle-schedule-reschedule.spec.ts`
Expected: PASS

---

### Task 6: Rebuild Backend API Container and Live End-to-End Verification

**Files:**
- Create: `D:\Amanah-healthcare-backend\scripts\e2e\test-reschedule-duplex.ps1`

- [ ] **Step 1: Rebuild Docker API container**
Command: `docker compose up --build -d api` in `D:\Amanah-healthcare-backend`
Verify health: `GET http://localhost:3001/api/v1/health/live` returns 200.

- [ ] **Step 2: Execute live duplex test script**
Test execution flow:
  1. Admin logs in and establishes WebSocket connection listening to `notification:new`.
  2. Patient creates appointment for Morning session with Dr. Ahmad Santoso.
  3. Admin receives creation notification.
  4. Patient reschedules appointment to target session.
  5. Admin WebSocket client receives `notification:new` within 300ms.
  6. Query DB to verify appointment record has exact matching `practitionerId`, `roomId`, and `scheduleSessionId` of the target session.
  7. Admin shifts doctor session -> Patient WebSocket client receives `notification:new`.
