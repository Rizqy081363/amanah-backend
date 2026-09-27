# Notification Infrastructure & Patient Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an enterprise-grade, technology-agnostic, event-driven real-time notification infrastructure (Redis Streams + Socket.IO) and align the patient appointment lifecycle, patient call attempt tracking (3-retry requeue policy), and patient appointment history query API.

**Architecture:** 
1. **Ports and Adapters (Hexagonal)**: A domain-agnostic notification engine where business modules publish typed `DomainEvent` instances and register their delivery policies at bootstrap via `NotificationRulesRegistry`.
2. **Three-Layer Event Pipeline**: Internal event bus (`EventEmitter2`) + durable broker handoff (`Redis Streams` via consumer group `notification-service`) + client-facing real-time transport (`Socket.IO` gateway with authenticated handshake and user-scoped rooms).
3. **Database-Driven Lifecycle & Single Source of Truth**: Authoritative appointment status in Postgres (`booked`, `waiting`, `in_service`, `completed`, `cancelled`, `no_show`). A dedicated `appointment_call_attempts` table tracks the 3-attempt call retry policy with requeuing before terminal `no_show`.
4. **Client-Agnostic Projections**: A unified patient appointment history API exposing terminal states (`COMPLETED`, `NO_SHOW`, `CANCELLED`) for both Flutter mobile and Admin Web.

**Tech Stack:** NestJS 11, Bun, TypeScript, Drizzle ORM, PostgreSQL 17, Redis 7 (Streams + Pub/Sub), Socket.IO 4, Docker Compose.

**Spec:**
- `feature-spec/notification/user-story.md`
- `feature-spec/notification/01-architecture-overview.md`
- `feature-spec/notification/02-flutter-notifications.md`
- `feature-spec/notification/03-nextjs-web-notifications.md`
- `feature-spec/notification/04-backend-notifications.md`
- `feature-spec/notification/initialprompt.txt`

## Global Constraints
- Every file MUST remain under 500 lines of code.
- Single Source of Truth (SSOT): No duplicated status definitions, no magic strings, no hardcoded timeouts in client code.
- Decoupling: Feature modules must never import WebSocket gateways, Redis transport clients, or notification persistence tables directly.
- Idempotency: Every notification insert enforces uniqueness on `idempotency_key` (`eventId + recipientId + type`).
- Offline-resilient: Persistence occurs before real-time delivery; REST endpoints are the source of truth for history and read-state.

---

### Task 1: Package Dependencies & Real-Time Configuration
**Files:**
- Modify: `package.json`
- Create: `src/config/realtime.config.ts`

**Interfaces:**
- Produces: `realtimeConfig` object (`corsOrigins`, `pingInterval`, `pingTimeout`)

- [ ] **Step 1: Install real-time packages**
Run: `bun add @nestjs/websockets @nestjs/platform-socket.io socket.io @socket.io/redis-adapter`
Run: `bun add -d @types/socket.io`

- [ ] **Step 2: Add Realtime configuration**
Create `src/config/realtime.config.ts` loading `REALTIME_GATEWAY_PORT`, `CORS_ORIGINS`.

---

### Task 2: Database Schema Migration - Call Attempts & Notification Idempotency
**Files:**
- Modify: `src/database/schema/amanah.schema.ts`
- Create: `src/database/migrations/0013_appointment_call_attempts_and_notification_idempotency.sql`

**Interfaces:**
- Produces: `appointmentCallAttempts` table, `notifications.idempotencyKey` unique index

- [ ] **Step 1: Update `amanah.schema.ts`**
Add `appointmentCallAttempts` table and `idempotencyKey` on `notifications`.

- [ ] **Step 2: Generate and apply migration**
Run: `bun run drizzle:generate` or execute migration SQL.

---

### Task 3: Notification Contracts & Rules Registry
**Files:**
- Create: `src/modules/notifications/notifications.constants.ts`
- Create: `src/modules/notifications/contracts/domain-event.interface.ts`
- Create: `src/modules/notifications/contracts/delivery-channel.interface.ts`
- Create: `src/modules/notifications/contracts/realtime-gateway.interface.ts`
- Create: `src/modules/notifications/domain/entities/notification-rule.entity.ts`
- Create: `src/modules/notifications/registry/notification-rules-registry.ts`
- Create: `src/modules/notifications/registry/notification-rules-registry.spec.ts`

- [ ] **Step 1: Write failing registry test**
Test registration and lookup of domain event rules.

- [ ] **Step 2: Implement NotificationRulesRegistry**
Implement in-memory rule registry with generic event payload types.

- [ ] **Step 3: Run test to verify passes**
Run: `bun test src/modules/notifications/registry/notification-rules-registry.spec.ts`

---

### Task 4: Notification Persistence Repository & Redis Streams Publisher
**Files:**
- Create: `src/modules/notifications/infrastructure/persistence/drizzle-notification.repository.ts`
- Create: `src/modules/notifications/application/publishers/redis-streams.publisher.ts`
- Create: `src/modules/notifications/application/publishers/redis-streams.publisher.spec.ts`

- [ ] **Step 1: Write failing publisher test**
Mock Redis client `xadd` and assert proper serialization.

- [ ] **Step 2: Implement RedisStreamsPublisher**
Implement `publish<T>(event: DomainEvent<T>): Promise<void>` writing to `notifications:events`.

- [ ] **Step 3: Implement DrizzleNotificationRepository with idempotency**
Implement `createIfNotExists` using `ON CONFLICT (idempotency_key) DO NOTHING`.

---

### Task 5: Socket.IO Real-Time Gateway & In-App Channel Adapter
**Files:**
- Create: `src/modules/notifications/infrastructure/realtime/socket-io-realtime.gateway.ts`
- Create: `src/modules/notifications/infrastructure/channels/in-app-delivery.channel.ts`
- Create: `src/modules/notifications/infrastructure/realtime/socket-io-realtime.gateway.spec.ts`

- [ ] **Step 1: Implement SocketIoRealtimeGateway**
Authenticated handshake validating JWT or session token. Auto-joining `user:${userId}` room.

- [ ] **Step 2: Implement InAppChannelAdapter**
Implements `DeliveryChannelAdapter` for `'in_app'`, emitting `notification:new` to user room.

---

### Task 6: Notification Orchestrator & Stream Worker
**Files:**
- Create: `src/modules/notifications/application/services/notification-orchestrator.service.ts`
- Create: `src/modules/notifications/application/workers/notification-stream.worker.ts`
- Create: `src/modules/notifications/application/services/notification-orchestrator.service.spec.ts`

- [ ] **Step 1: Write failing orchestrator test**
Verify rule resolution, idempotency key generation, persistence, and channel dispatch.

- [ ] **Step 2: Implement NotificationOrchestratorService**
Coordinate repository insertion and channel delivery.

- [ ] **Step 3: Implement NotificationStreamWorker**
Consumer loop reading `notifications:events` via consumer group `notification-service`.

---

### Task 7: Notification REST API Endpoints
**Files:**
- Modify: `src/modules/notifications/presentation/notifications.controller.ts`
- Create: `src/modules/notifications/application/services/notification-query.service.ts`

- [ ] **Step 1: Implement NotificationQueryService**
Extract query logic, keyset pagination, and multi-device read sync emit.

- [ ] **Step 2: Update NotificationsController**
Support `GET /api/v1/notifications/me`, `/unread-count`, `PATCH /:id/read`, `PATCH /read-all`.

---

### Task 8: Appointment Call Attempt & Requeue Lifecycle Service
**Files:**
- Create: `src/modules/appointments/domain/constants/appointment-lifecycle.constants.ts`
- Create: `src/modules/appointments/infrastructure/drizzle/appointment-call.drizzle-repository.ts`
- Create: `src/modules/appointments/application/appointment-call-lifecycle.service.ts`
- Create: `src/modules/appointments/application/appointment-call-lifecycle.service.spec.ts`

- [ ] **Step 1: Write failing call lifecycle test**
Test: Call 1 -> requeue; Call 2 -> requeue; Call 3 -> auto `no_show`.

- [ ] **Step 2: Implement AppointmentCallDrizzleRepository**
Persist call attempts in `appointment_call_attempts`, manage ticket queue order.

- [ ] **Step 3: Implement AppointmentCallLifecycleService**
Handle doctor call action, timeout evaluation, requeue, and terminal `no_show` transition.

---

### Task 9: Appointment Notification Integration
**Files:**
- Create: `src/modules/appointments/appointments.notifications.ts`
- Create: `src/common/events/appointment-lifecycle.events.ts`
- Modify: `src/modules/appointments/appointments.module.ts`

- [ ] **Step 1: Define Appointment Lifecycle Domain Events**
`AppointmentPatientCalledEvent`, `AppointmentNoShowEvent`, `AppointmentCompletedEvent`.

- [ ] **Step 2: Register notification rules**
Connect `appointment.patient_called` and `appointment.no_show` to `NotificationRulesRegistry`.

---

### Task 10: Patient Appointment History Query API
**Files:**
- Create: `src/modules/appointments/application/appointment-history.service.ts`
- Create: `src/modules/appointments/presentation/patient-appointment-history.controller.ts`
- Create: `src/modules/appointments/presentation/dto/patient-appointment-history-query.dto.ts`
- Create: `src/modules/appointments/application/appointment-history.service.spec.ts`

- [ ] **Step 1: Write history service test**
Assert only terminal appointments (`completed`, `cancelled`, `no_show`) are returned.

- [ ] **Step 2: Implement AppointmentHistoryService**
Fetch terminal appointments with status events and call attempts, sorted DESC.

- [ ] **Step 3: Expose History Endpoints**
`GET /api/v1/appointments/history/patient/:patientId` and `GET /api/v1/appointments/history/me`.

---

### Task 11: Validation Seeder
**Files:**
- Create: `src/database/seeds/drizzle/notification-lifecycle.seed.ts`

- [ ] **Step 1: Implement limited validation seeder**
Seed 1 Doctor practice session, Patient 1 (Completed), Patient 2 (No-Show 3-calls), Patient 3 (Cancelled).

- [ ] **Step 2: Execute seeder and verify database states**
Run: `bun ./src/database/seeds/drizzle/notification-lifecycle.seed.ts`

---

### Task 12: Verification and E2E Testing
**Files:**
- Create: `test/e2e/notification-and-lifecycle.e2e-spec.ts`

- [ ] **Step 1: Run unit tests**
Run: `bun test`

- [ ] **Step 2: Run verification script**
Run E2E tests validating API endpoints, notification flow, and socket connections.
