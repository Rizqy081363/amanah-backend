# Mobile Endpoints Implementation Plan (Amanah Healthcare)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all backend endpoints required by the Amanah Healthcare Mobile App: Staff Notifications (`NotificationsModule`), IT Support & Helpdesk Tickets (`SupportTicketsModule`), Clinic Visitor Analytics (`ClinicAnalyticsModule`), and Staff Leave Cancellation (`LeavesModule` enhancements), complete with Drizzle persistence, RBAC security, and full OpenAPI documentation.

**Architecture:** Clean Domain-Driven Architecture following the established patterns in the repository: Domain (entities, repository interfaces, constants) -> Infrastructure (Drizzle ORM repository implementations, schema joins) -> Presentation (Controllers, DTOs, OpenAPI decorators) -> AppModule registration.

**Tech Stack:** NestJS 10, TypeScript 5, Drizzle ORM, PostgreSQL (via Docker pg driver), `@nestjs/swagger`, Passport JWT.

---

## Global Constraints
- Named security scheme across all controllers: `'access-token'` (`@ApiBearerAuth('access-token')`).
- ValidationPipe status code is 422 (`HttpStatus.UNPROCESSABLE_ENTITY`).
- All controller routes use global prefix `/api` and URI versioning `v1`.
- Clean Biome compliance (`bun run check:write`).
- Zero broken `$ref` references in the generated OpenAPI spec (`/docs-json`).

---

### Task 1: Notifications Module (`NotificationsModule`)

**Files:**
- Create: `src/modules/notifications/domain/entities/notification.entity.ts`
- Create: `src/modules/notifications/domain/repositories/notification.repository.ts`
- Create: `src/modules/notifications/infrastructure/drizzle/notification.drizzle-repository.ts`
- Create: `src/modules/notifications/presentation/dto/query-notification.dto.ts`
- Create: `src/modules/notifications/presentation/notifications.controller.ts`
- Create: `src/modules/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: Tables `notifications`, `notificationRecipients`, `notificationActions` from `src/database/schema`
- Produces:
  - `GET /api/v1/notifications/me` -> `{ data: NotificationEntity[], unreadCount: number }`
  - `PATCH /api/v1/notifications/:id/read` -> `{ success: true }`
  - `PATCH /api/v1/notifications/read-all` -> `{ success: true, updatedCount: number }`

- [ ] **Step 1: Create domain entity and repository interface**
  Define `NotificationEntity`, `NotificationActionEntity`, and `NOTIFICATION_REPOSITORY` symbol in `src/modules/notifications/domain`.

- [ ] **Step 2: Implement Drizzle persistence repository**
  Implement `NotificationDrizzleRepository` querying `notificationRecipients` joined with `notifications` and `notificationActions` filtered by `userId`. Implement `markAsRead(id, userId)` and `markAllAsRead(userId)`.

- [ ] **Step 3: Create presentation DTO and controller**
  Create `QueryNotificationDto` with pagination/filter options. Implement `NotificationsController` with `@UseGuards(AuthGuard('jwt'))`, `@ApiBearerAuth('access-token')`, and complete `@ApiOperation` & `@ApiOkResponse`.

- [ ] **Step 4: Create NotificationsModule and export repository**
  Assemble module providers and controllers.

---

### Task 2: Support Tickets & IT Helpdesk Module (`SupportTicketsModule`)

**Files:**
- Create: `src/modules/support-tickets/domain/entities/support-ticket.entity.ts`
- Create: `src/modules/support-tickets/domain/repositories/support-ticket.repository.ts`
- Create: `src/modules/support-tickets/infrastructure/drizzle/support-ticket.drizzle-repository.ts`
- Create: `src/modules/support-tickets/presentation/dto/create-support-ticket.dto.ts`
- Create: `src/modules/support-tickets/presentation/dto/create-ticket-message.dto.ts`
- Create: `src/modules/support-tickets/presentation/support-tickets.controller.ts`
- Create: `src/modules/support-tickets/support-tickets.module.ts`

**Interfaces:**
- Consumes: Tables `supportTickets`, `supportTicketMessages`, `supportTicketAttachments` from `src/database/schema`
- Produces:
  - `POST /api/v1/support-tickets` -> Create ticket with auto number `TK-YYYY-XXXX`
  - `GET /api/v1/support-tickets/my-tickets` -> List tickets reported by logged in staff/doctor
  - `GET /api/v1/support-tickets/:id` -> Get ticket detail
  - `GET /api/v1/support-tickets/:id/messages` -> Get conversation thread
  - `POST /api/v1/support-tickets/:id/messages` -> Send reply message

- [ ] **Step 1: Create domain entities and repository contract**
  Define `SupportTicketEntity`, `SupportTicketMessageEntity`, and `SUPPORT_TICKET_REPOSITORY` symbol.

- [ ] **Step 2: Implement Drizzle repository**
  Implement `createTicket` (with unique ticket number generator `TK-2026-XXXX`), `findMyTickets(reporterUserId)`, `findTicketById(id)`, `findMessages(ticketId)`, and `createMessage(ticketId, senderUserId, senderType, message)`.

- [ ] **Step 3: Create DTOs and Controller**
  Create `CreateSupportTicketDto` (`title`, `description`, `priority`, `sourceChannel`) and `CreateTicketMessageDto` (`message`).
  Create `SupportTicketsController` decorated with `@ApiTags('Support Tickets (Bantuan Teknis IT)')`, `@ApiBearerAuth('access-token')`.

- [ ] **Step 4: Create SupportTicketsModule**
  Wire Drizzle provider, repository binding, and controller into `SupportTicketsModule`.

---

### Task 3: Clinic Analytics & Dashboard Module (`ClinicAnalyticsModule`)

**Files:**
- Create: `src/modules/clinics/presentation/dto/query-clinic-analytics.dto.ts`
- Create: `src/modules/clinics/presentation/clinic-analytics.controller.ts`
- Modify: `src/modules/clinics/clinics.module.ts`

**Interfaces:**
- Consumes: `appointments`, `queueTickets`, `clinicUnits` tables from `src/database/schema`
- Produces:
  - `GET /api/v1/clinics/analytics/monthly` -> Array of `{ monthName, year, data: [{ dayShort, label, patients, newPatients }] }`
  - `GET /api/v1/clinics/analytics/summary` -> `{ totalVisitsToday, waitingQueue, inService, completed, activeClinics }`

- [ ] **Step 1: Create analytics query DTOs and response types**
  Define `QueryClinicAnalyticsDto` (`year?: number`, `poliklinikId?: string`).

- [ ] **Step 2: Create ClinicAnalyticsController**
  Implement aggregation queries using Drizzle on `appointments` and `queueTickets` grouped by date and status to supply real data for the mobile app's `kMonthlyRecords` and dashboard cards.

- [ ] **Step 3: Register controller in ClinicsModule**
  Add `ClinicAnalyticsController` to `ClinicsModule` controllers.

---

### Task 4: Leaves Module Enhancements (Cancel Leave & DTO Fields)

**Files:**
- Modify: `src/modules/leaves/domain/repositories/leave.repository.ts`
- Modify: `src/modules/leaves/infrastructure/drizzle/leave.drizzle-repository.ts`
- Modify: `src/modules/leaves/presentation/dto/request-leave.dto.ts`
- Modify: `src/modules/leaves/presentation/leaves.controller.ts`

**Interfaces:**
- Consumes: `staffLeaveRequests` table in `src/database/schema`
- Produces:
  - `PATCH /api/v1/leaves/:id/cancel` -> Allows staff to cancel their own `MENUNGGU` leave request.

- [ ] **Step 1: Update LeaveRepository contract and Drizzle implementation**
  Add `cancel(id: string, staffId: string): Promise<LeaveEntity | null>`. In Drizzle repository, update status to `DIBATALKAN` if status is `MENUNGGU` and matches `staffId`.

- [ ] **Step 2: Update RequestLeaveDto and LeavesController**
  Add `type?: string` (Cuti Tahunan, Izin Sakit, etc.) and `substituteStaffId?: string` to `RequestLeaveDto`.
  Add `PATCH /leaves/:id/cancel` endpoint in `LeavesController` with `@Roles('STAF')` and complete OpenAPI documentation.

---

### Task 5: App Integration, Docker Deployment & Automated Verification

**Files:**
- Modify: `src/app.module.ts`
- Create: `scripts/e2e/test-mobile-endpoints.ps1`

- [ ] **Step 1: Register all new modules in AppModule**
  Import `NotificationsModule`, `SupportTicketsModule` into `src/app.module.ts`.

- [ ] **Step 2: Run Biome formatting and TypeScript compilation**
  Run `bun run check:write` and `bun run build`.

- [ ] **Step 3: Deploy to Docker container**
  Run `docker compose up -d --build api`.

- [ ] **Step 4: Create and run comprehensive PowerShell verification test suite**
  Write `scripts/e2e/test-mobile-endpoints.ps1` testing:
  - Notifications list, mark as read, mark all as read.
  - Support ticket creation, list my tickets, send message, list messages.
  - Clinic analytics monthly records and daily breakdown.
  - Leave cancellation by staff.
  - OpenAPI spec audit for new endpoints.
