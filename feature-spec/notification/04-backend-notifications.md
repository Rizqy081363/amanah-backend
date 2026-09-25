# Backend Notification Architecture (Next.js)

**Document 4 of 4 — Backend, Persistence, Delivery, and Docker Topology**
Assumes the paradigm, vocabulary, and technology decisions established in `01-architecture-overview.md`. This document is the implementation-facing counterpart: internal module layout, database schema, delivery adapters, the Realtime Gateway, retry/failure handling, observability, and how all of this maps onto Docker services.

---

## 1. Role of the Backend

The backend owns everything a feature module and a client (Flutter/Next.js web) are explicitly *not* allowed to know about: event durability, recipient resolution, persistence, delivery-channel selection, retries, idempotency, and real-time fan-out. It is built as **Next.js** (API/Route Handlers for the REST surface and event-publishing entry point), paired with two additional Node.js services — a **Notification Worker** and a **Realtime Gateway** — that are architecturally part of "the backend" even though they run as separate Docker containers. This split exists specifically to satisfy the requirements around statelessness, horizontal scaling, and single responsibility discussed in Document 1 §10.

## 2. Internal Module Layout

```
src/
  modules/                          # business feature modules — own their domain only
    appointments/
      appointments.service.ts
      appointments.notifications.ts # registers event types + resolvers (Doc 1 §6.2), nothing else
    orders/
      ...

  notifications/                    # the notification subsystem — domain-agnostic
    contracts/
      domain-event.ts               # DomainEvent<T>, NotificationPublisher interfaces
      delivery-channel.ts           # DeliveryChannelAdapter interface
      notification-repository.ts    # NotificationRepository interface
    registry/
      notification-rules-registry.ts
    application/
      notification-orchestration.service.ts
      publish-domain-event.ts       # concrete NotificationPublisher: writes to Redis Streams
    infrastructure/
      redis-streams.adapter.ts
      postgres-notification.repository.ts
      channels/
        in-app.channel.ts
        push.channel.ts             # future
        email.channel.ts            # future
    api/
      route-handlers/
        notifications.list.ts
        notifications.mark-read.ts
        notifications.unread-count.ts

services/
  notification-worker/              # separate deployable — consumes Redis Streams
    index.ts
  realtime-gateway/                 # separate deployable — Socket.IO server
    index.ts
```

The `notifications/` folder never imports anything from `modules/*`. The dependency arrow points the other way: each business module imports the notification `contracts/` (the port) and, at its own bootstrap, calls into `registry/` to register itself. This is the concrete file-level expression of the dependency-inversion requirement from your brief.

## 3. Domain Event Contract and Publishing

```typescript
// notifications/contracts/domain-event.ts
export interface DomainEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  type: string;
  module: string;
  occurredAt: string;
  payload: TPayload;
}

export interface NotificationPublisher {
  publish<T>(event: DomainEvent<T>): Promise<void>;
}
```

```typescript
// notifications/application/publish-domain-event.ts
export class RedisStreamsPublisher implements NotificationPublisher {
  constructor(private readonly redis: Redis) {}

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    await this.redis.xadd(
      'notifications:events',
      '*', // auto-generated stream ID
      'payload', JSON.stringify(event),
    );
    // Fire-and-forget from the caller's perspective: this resolves as soon as
    // Redis acknowledges the XADD, which is durable — the caller does not wait
    // for the notification to be processed, persisted, or delivered.
  }
}
```

```typescript
// modules/appointments/appointments.service.ts
export async function confirmAppointment(appointmentId: string) {
  const appointment = await appointmentsRepo.confirm(appointmentId);

  await notificationPublisher.publish({
    eventId: crypto.randomUUID(),
    type: 'appointment.confirmed',
    module: 'appointments',
    occurredAt: new Date().toISOString(),
    payload: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorName: appointment.doctorName,
      scheduledAt: appointment.scheduledAt,
    },
  });

  return appointment; // HTTP response returns now — publish already completed the durable handoff
}
```

## 4. The Notification Rules Registry

```typescript
// notifications/registry/notification-rules-registry.ts
interface NotificationRule<T = any> {
  defaultChannels: NotificationChannel[];
  resolveRecipient: (payload: T) => string | string[];
  titleTemplate: string;
}

class NotificationRulesRegistry {
  private rules = new Map<string, NotificationRule>();

  register<T>(eventType: string, rule: NotificationRule<T>) {
    this.rules.set(eventType, rule);
  }

  get(eventType: string): NotificationRule {
    const rule = this.rules.get(eventType);
    if (!rule) throw new UnregisteredEventTypeError(eventType);
    return rule;
  }
}

export const notificationRegistry = new NotificationRulesRegistry();
```

```typescript
// modules/appointments/appointments.notifications.ts — the ONLY coupling point
notificationRegistry.register<AppointmentConfirmedPayload>('appointment.confirmed', {
  defaultChannels: ['in_app', 'push'],
  resolveRecipient: (payload) => payload.patientId,
  titleTemplate: 'Your appointment with {{doctorName}} is confirmed',
});
```

This registration call runs once, at application bootstrap, for every module that wants notifications. Feature Y, arriving six months from now, adds exactly one file like this one and zero changes anywhere in `notifications/`.

## 5. Event Production → Redis Streams

Redis Streams (`XADD`) is the durable handoff from the API process to the Notification Worker process (Document 1 §7.1). A single stream, `notifications:events`, carries every domain event regardless of originating module — the stream itself is domain-agnostic; routing to the right handler happens downstream via the registry, not via separate streams per feature (which would reintroduce coupling at the infrastructure level).

## 6. Notification Worker: Orchestration Service

Runs as its own container, consuming the stream via a **consumer group** (`notification-service`), which is what allows multiple worker replicas to safely share the workload — each stream entry is delivered to exactly one member of the group.

```typescript
// services/notification-worker/index.ts
async function runConsumerLoop() {
  await redis.xgroup('CREATE', 'notifications:events', 'notification-service', '$', 'MKSTREAM')
    .catch(() => {}); // group may already exist

  while (true) {
    const entries = await redis.xreadgroup(
      'GROUP', 'notification-service', `worker-${process.env.HOSTNAME}`,
      'COUNT', 10, 'BLOCK', 5000,
      'STREAMS', 'notifications:events', '>',
    );
    if (!entries) continue;

    for (const [, messages] of entries) {
      for (const [streamId, fields] of messages) {
        const event: DomainEvent = JSON.parse(fields[1]);
        try {
          await orchestrationService.handle(event);
          await redis.xack('notifications:events', 'notification-service', streamId);
        } catch (err) {
          logger.error({ err, eventId: event.eventId }, 'notification processing failed');
          // deliberately NOT acked — remains in the Pending Entries List for XCLAIM/retry
        }
      }
    }
  }
}
```

```typescript
// notifications/application/notification-orchestration.service.ts
export class NotificationOrchestrationService {
  constructor(
    private readonly registry: NotificationRulesRegistry,
    private readonly repo: NotificationRepository,
    private readonly channels: Map<NotificationChannel, DeliveryChannelAdapter>,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const rule = this.registry.get(event.type);
    const recipients = [rule.resolveRecipient(event.payload)].flat();

    for (const recipientId of recipients) {
      const idempotencyKey = buildIdempotencyKey(event.eventId, recipientId, event.type);

      const notification = await this.repo.createIfNotExists({
        idempotencyKey,
        recipientId,
        type: event.type,
        module: event.module,
        referenceType: event.module,        // convention: module name doubles as reference type
        referenceId: firstIdLikeField(event.payload),
        payload: minimalDisplayPayload(event.payload, rule),
        channels: rule.defaultChannels,
      });

      if (!notification) continue; // already existed — redelivered stream message, safe no-op

      for (const channel of rule.defaultChannels) {
        await this.channels.get(channel)?.deliver(notification);
      }
    }
  }
}
```

## 7. Database Schema

PostgreSQL, generic by construction — no feature-specific columns, no feature-specific tables:

```sql
CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key   TEXT NOT NULL UNIQUE,          -- eventId + recipientId + type, hashed
    recipient_id      UUID NOT NULL,
    recipient_type    TEXT NOT NULL DEFAULT 'user',  -- future-proofs for non-user recipients (org, team...)

    type              TEXT NOT NULL,                 -- "appointment.confirmed"
    module            TEXT NOT NULL,                 -- "appointments" — provenance, not business logic

    reference_type    TEXT,                          -- "appointment" — polymorphic association
    reference_id      UUID,                          -- id of the entity in ITS OWN table, not duplicated here

    payload           JSONB NOT NULL DEFAULT '{}',   -- minimal display data only, never a full entity copy
    channels          TEXT[] NOT NULL,                -- ['in_app','push']

    status             TEXT NOT NULL DEFAULT 'created', -- created | delivered | failed
    read_at             TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at         TIMESTAMPTZ,

    retry_count       INT NOT NULL DEFAULT 0
);

-- Query patterns this indexing set is built for:
CREATE INDEX idx_notifications_recipient_unread
    ON notifications (recipient_id, created_at DESC)
    WHERE read_at IS NULL;                            -- fast "unread for user X" without a full scan

CREATE INDEX idx_notifications_recipient_all
    ON notifications (recipient_id, created_at DESC); -- paginated history, all notifications

CREATE INDEX idx_notifications_reference
    ON notifications (reference_type, reference_id);   -- "all notifications about this entity"
```

**How Feature Y adopts this with zero migrations:** `type = "order.shipped"`, `module = "orders"`, `reference_type = "order"` — all just string/UUID values inserted into the existing columns. Nothing about this schema encodes any knowledge of "orders" as a concept; it only encodes "a notification has a type, a module of origin, and an optional reference to some entity elsewhere." This is precisely the generic-identifier design your brief asked for.

### 7.1 Data lifecycle: retention, pagination, cleanup

- **Pagination**: keyset pagination on `(recipient_id, created_at DESC, id)` rather than `OFFSET`, since notification volume grows unboundedly per user and offset pagination degrades linearly with table size.
- **Retention**: a scheduled job (see §14, the `worker` service already running) archives or deletes notifications older than a configurable window (e.g., 12 months) once `read_at IS NOT NULL`, keeping the hot table small; unread notifications are exempt from automatic cleanup regardless of age.
- **Growth**: the `idx_notifications_recipient_unread` partial index specifically keeps the common "unread badge count" query cheap even as the full table grows into the tens of millions of rows, because the index only contains unread rows.

## 8. Delivery Channel Adapters

```typescript
// notifications/contracts/delivery-channel.ts
export interface DeliveryChannelAdapter {
  channel: NotificationChannel;
  deliver(notification: PersistedNotification): Promise<DeliveryResult>;
}
```

```typescript
// notifications/infrastructure/channels/in-app.channel.ts
export class InAppChannelAdapter implements DeliveryChannelAdapter {
  channel = 'in_app' as const;
  constructor(private readonly emitter: SocketIoEmitter) {}

  async deliver(notification: PersistedNotification): Promise<DeliveryResult> {
    // No external call, no failure mode beyond the emit itself —
    // if nobody is connected to the room, this is simply a no-op (Doc 1 §8.2).
    this.emitter.to(`user:${notification.recipientId}`).emit('notification:new', notification);
    return { status: 'delivered' };
  }
}
```

`push` and `email` adapters follow the same interface and, because genuine third-party failures are possible for them, route through the retry-capable job queue described in §11 rather than delivering inline during the orchestration loop — this keeps a slow/failing email provider from blocking the consumer group's throughput for every other notification.

## 9. Real-Time Gateway Service

A separate, stateless-by-design Node.js service whose only job is holding client WebSocket connections and routing room-targeted emits to them. It never talks to Postgres and never talks to Redis Streams — its only inputs are (a) incoming client connections and (b) the Socket.IO Redis adapter channel.

```typescript
// services/realtime-gateway/index.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

const io = new Server(httpServer, { cors: corsConfig });
io.adapter(createAdapter(pubClient, subClient)); // enables cross-replica room broadcast

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  try {
    const claims = await verifyJwt(token); // reject at handshake, never accept anonymously
    socket.data.userId = claims.sub;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.data.userId}`); // server-derived room, never client-specified
});
```

On the producer side, the **Notification Worker does not hold any socket connections itself** — it uses `socket.io-emitter`, an official companion library that publishes into the same Redis channel the gateway's `@socket.io/redis-adapter` listens on. This means "emit to a room" works identically whether zero, one, or twenty gateway replicas are running, and the worker has zero dependency on how many gateway instances exist or which one a given user happens to be connected to:

```typescript
// notifications/infrastructure/channels/in-app.channel.ts (emitter setup)
import { Emitter } from '@socket.io/redis-emitter';
const emitter = new Emitter(redisClient);
```

This single mechanism elegantly serves two purposes at once: it's the "real-time transport" from Document 1 §3, and it's also what makes the gateway horizontally scalable — both problems solved by one well-maintained, free/open-source library rather than custom-built coordination logic.

## 10. REST API Contract

| Method & Path | Purpose | Notes |
|---|---|---|
| `GET /api/notifications?page=&unreadOnly=&since=` | Paginated history / reconciliation fetch | `since` param supports the reconnect-reconciliation pattern (Doc 1 §8.3, Doc 2 §6, Doc 3 §3) |
| `GET /api/notifications/unread-count` | Badge count | Backed by the partial index (§7) |
| `PATCH /api/notifications/:id/read` | Mark one as read | Triggers `notification:read` sync emit to the user's room |
| `PATCH /api/notifications/read-all` | Mark all as read | Same sync mechanism, bulk |

All authenticated via the same session/JWT mechanism already used elsewhere in the application — no separate auth scheme for notifications.

## 11. Retry, Failure Handling, and Dead-Lettering

Two independent retry layers exist, at two different points in the pipeline, for two different failure modes:

1. **Stream-level (event processing itself failing)**: handled by Redis Streams' native Pending Entries List — an unacknowledged message is eligible for `XCLAIM` by another consumer after a visibility timeout. This covers worker crashes and transient DB errors during orchestration.
2. **Channel-level (an external provider call failing — push/email)**: handled by **BullMQ** (Redis-backed job queue), with exponential backoff and a bounded max-attempt count. Jobs that exhaust their attempts move to a dead-letter queue rather than vanishing, so failures are visible and inspectable rather than silent.

```typescript
// notifications/infrastructure/channels/push.channel.ts
export class PushChannelAdapter implements DeliveryChannelAdapter {
  channel = 'push' as const;
  constructor(private readonly queue: Queue) {}

  async deliver(notification: PersistedNotification): Promise<DeliveryResult> {
    await this.queue.add('deliver-push', { notificationId: notification.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return { status: 'queued' };
  }
}
```

In-app delivery (§8) deliberately has *no* retry queue of its own — there is nothing to retry, because persistence already succeeded before delivery was attempted (Document 1 §5, §8.2), and a missed real-time push is fully recovered by the client's own reconciliation fetch.

## 12. Idempotency and Duplicate Handling — Backend Mechanics

Recapping Document 1 §8.1 at the implementation level: `repo.createIfNotExists` performs `INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, returning `null` when the row already existed. The orchestration service treats a `null` return as "already handled" and skips delivery entirely — this single database constraint is what makes the whole pipeline safe under Redis Streams' at-least-once redelivery guarantee, without any additional deduplication logic needed elsewhere.

## 13. Observability

| Signal | Mechanism |
|---|---|
| Structured logs, correlated across services | `pino`, every log line carries `eventId` as a correlation ID from publish through delivery |
| Throughput / error metrics | Prometheus counters: `events_published_total`, `notifications_created_total`, `delivery_failures_total{channel}` |
| Live connection count | `socket_connections_gauge`, exported from the Realtime Gateway |
| Consumer backlog / lag | `XINFO GROUPS notifications:events` polled periodically — surfaces if the worker is falling behind |
| Service health | `/healthz` on each of the three services (API, worker, gateway), checked by Docker's `healthcheck` (see §14) |

## 14. Docker Architecture

### 14.1 Services

| Service | Statefulness | Exposed to host? | Responsibility |
|---|---|---|---|
| `web` | Stateless | Yes (via reverse proxy) | Next.js app: UI pages + REST API routes + event publishing (`XADD`) |
| `notification-worker` | Stateless (state lives in Redis/Postgres, not the process) | No | Consumes Redis Streams, orchestrates, persists, triggers in-app/push/email delivery |
| `realtime-gateway` | Stateless (connection state is ephemeral, coordinated via Redis adapter) | Yes (WebSocket endpoint) | Holds client WebSocket connections, emits to rooms |
| `redis` | **Stateful** | No | Streams (durable event handoff), Pub/Sub (Socket.IO adapter/emitter), BullMQ queues |
| `postgres` | **Stateful** | No | Notification persistence + rest of the application's data |

### 14.2 docker-compose sketch

```yaml
services:
  web:
    build: ./apps/web
    depends_on: [redis, postgres]
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgres://app:app@postgres:5432/app
    ports: ["3000:3000"]

  notification-worker:
    build: ./services/notification-worker
    depends_on: [redis, postgres]
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgres://app:app@postgres:5432/app
    # no ports exposed — internal-only service
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]

  realtime-gateway:
    build: ./services/realtime-gateway
    depends_on: [redis]
    environment:
      REDIS_URL: redis://redis:6379
      JWT_PUBLIC_KEY_PATH: /run/secrets/jwt_public_key
    ports: ["4001:4001"]

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes   # AOF persistence: protects Streams data across restarts
    volumes: ["redis_data:/data"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
    volumes: ["postgres_data:/var/lib/postgresql/data"]

volumes:
  redis_data:
  postgres_data:
```

### 14.3 Internal networking

All five services share a single Docker Compose bridge network by default, and reach each other by **service name** (`redis:6379`, `postgres:5432`) rather than any hardcoded IP. Only `web` and `realtime-gateway` publish ports to the host (typically behind a reverse proxy such as Nginx/Traefik in front of both, terminating TLS and routing `/socket.io/*` to the gateway and everything else to `web`). `notification-worker` exposes nothing externally — it has no HTTP surface a client would ever call directly.

### 14.4 Statelessness and volumes

- **Stateless**: `web`, `notification-worker`, `realtime-gateway`. Any of these can be killed and restarted (or scaled to N replicas) without data loss, because none of them hold durable state in memory — everything durable lives in Redis or Postgres.
- **Persistent volumes required**: `postgres_data` (obviously — this is the source of truth) and `redis_data` (Redis is configured with AOF persistence specifically because Streams data must survive a Redis restart; Pub/Sub messages themselves are inherently transient and don't need persistence, but the Streams log does).

### 14.5 Behavior on container restart

| Container restarts | What happens |
|---|---|
| `web` | Stateless — restarts cleanly, in-flight HTTP requests fail over to the next request/replica, nothing lost |
| `notification-worker` | Any unacknowledged stream entries remain in the consumer group's Pending Entries List and are picked up (via `XCLAIM`) once the worker (or another replica) comes back — no events are lost |
| `realtime-gateway` | All connected sockets drop; Socket.IO's client-side reconnection logic (Documents 2 §6, 3 §3) reconnects automatically, and the client's reconciliation fetch on reconnect covers anything emitted during the gap |
| `redis` | With AOF enabled, Streams data (and BullMQ queue state) survives; Pub/Sub in-flight messages at the exact moment of restart are lost, which is acceptable because Pub/Sub is only used for the ephemeral real-time-push step, not for durability |
| `postgres` | Standard database restart semantics; volume ensures no data loss |

## 15. How a Future Feature Y Integrates — Concretely

1. Feature Y's service code calls `notificationPublisher.publish({ type: 'invoice.overdue', module: 'billing', payload: {...} })` at the point where the business event occurs. *(One line, using a contract that already exists.)*
2. Feature Y adds one bootstrap file registering `invoice.overdue` with a recipient resolver and default channels. *(One new file.)*
3. Nothing in `notifications/`, the database schema, the Notification Worker, or the Realtime Gateway changes. No migration. No new table. No new WebSocket wiring. No changes in Flutter or Next.js beyond what already renders any notification generically (title/body from `payload`, timestamp, read state).

This is the "plug-and-play" outcome your brief specified, achieved by the combination of the domain-agnostic contract (§3), the registry pattern that keeps coupling one-directional (§4), and a database schema built on generic identifiers rather than feature-specific columns (§7).
Scope: NestJS backend only.
Purpose: enforce a production-oriented, event-driven, highly decoupled notification architecture that business modules can adopt without learning notification infrastructure internals.
This file is an instruction contract for coding agents. It is not a tutorial, not a place for speculative rewrites, and not permission to introduce infrastructure without evidence.

0. Agent Role
You are working as a senior backend/system-design engineer.
Treat the notification capability as an independent platform capability inside the backend, not as scattered helper functions inside business features.
Your job is to preserve these qualities at all times:
- modularity,
- dependency inversion,
- replaceable infrastructure,
- domain isolation,
- asynchronous event-driven communication,
- idempotency,
- recoverability,
- observability,
- Docker compatibility,
- operational simplicity,
- free/open-source preference where practical,
- and predictable extension for future modules.
Do not optimize for the shortest implementation.
Optimize for architectural clarity, low coupling, operational safety, and future replaceability.
1. Non-Negotiable Architectural Intent
The backend notification system MUST behave like a reusable platform capability.
A business module MUST NOT need to understand:
- WebSocket implementation details,
- Redis internals,
- RabbitMQ internals,
- Kafka internals,
- broker topology,
- notification persistence tables,
- retry queues,
- reconnect behavior,
- socket room naming,
- delivery acknowledgements,
- notification history storage,
- read/unread implementation,
- transport serialization,
- push-provider SDKs,
- email-provider SDKs,
- or infrastructure-specific error handling.
A business module should express intent through a stable contract.
Conceptually:
A business event occurred.
This is the event type.
This is the actor.
This is the recipient or recipient-resolution context.
This is the relevant business reference.
This is the safe notification context.
The notification subsystem owns everything after that boundary.
2. Absolute Rules
2.1 No Feature-Specific Notification Plumbing
Forbidden:
// inside appointments.service.ts
await notificationRepository.insert(...);
server.to(userId).emit('notification', ...);
await redis.publish(...);
Also forbidden:
if (module === 'appointment') {
  // special notification path
}
unless that condition belongs inside an explicit notification policy or event handler dedicated to the relevant domain event.
Business modules may publish domain events.
They may not directly perform notification infrastructure work.
2.2 No Infrastructure Leakage Into Domain or Application Contracts
Do not expose infrastructure types such as:
RedisClientType
Channel
KafkaMessage
RmqContext
Socket
Server
WebSocketGateway
FirebaseMessage
through domain-facing contracts.
Bad:
publishNotification(redisClient, socketServer, payload)
Good:
notificationEventPublisher.publish(event)
or:
domainEventBus.publish(event)
The abstraction must describe intent, not implementation.
2.3 No Hardcoded Business Meaning in Generic Notification Infrastructure
The notification core MUST NOT know what an appointment, prescription, doctor schedule, invoice, order, or attendance record means.
The core may know:
- notification IDs,
- recipients,
- channels,
- templates,
- event names,
- source module identifiers,
- references,
- delivery states,
- timestamps,
- retry metadata,
- read state,
- transport metadata.
Domain-specific meaning belongs in domain-specific policy/translator/handler code.
2.4 No Duplicate Source of Truth
Do not duplicate complete business entities inside notification records.
Notification persistence is not a shadow business database.
Store only notification-owned data plus stable references/context needed to render or resolve the notification.
Prefer:
source_module
event_type
entity_type
entity_id
recipient_id
notification_type
template_key
safe_metadata
over copying complete Appointment/User/Doctor/Invoice rows.
2.5 No Silent Fallbacks
Never introduce behavior such as:
const brokerUrl = process.env.BROKER_URL ?? 'some-random-default';
for critical infrastructure.
Do not hide missing configuration.
If a required dependency is missing:
1. identify it,
2. report it,
3. document the required environment variable,
4. fail fast when appropriate.
Infrastructure fallback must be an explicit architectural decision, not an agent convenience.
2.6 No Premature Microservices
The goal is NOT to fragment the application into unnecessary services.
Prefer a modular monolith with clean boundaries unless the existing system already proves the need for separately deployed services.
A broker, Redis, database, and backend container may be separate infrastructure services without turning every NestJS module into a microservice.
3. Mandatory Discovery Before Modification
Before writing code, inspect the real codebase.
Do not assume folder names, database schema, Redis usage, broker usage, authentication strategy, socket strategy, ORM, logging library, or existing abstractions.
3.1 Read-Only Inspection First
Start with read-only exploration.
Use rg aggressively.
Examples:
rg -n "WebSocketGateway|SubscribeMessage|socket\.io|ws\b" .
rg -n "redis|ioredis|bullmq|bull|rabbit|amqp|kafka|nats" .
rg -n "EventEmitter|event-emitter|@nestjs/event-emitter|cqrs" .
rg -n "notification|notifications|notify|unread|readAt|read_at" .
rg -n "Prisma|TypeORM|Drizzle|Sequelize|MikroORM" .
rg -n "Logger|Pino|Winston|nestjs-pino|OpenTelemetry|otel" .
rg -n "Dockerfile|docker-compose|compose\.ya?ml" .
rg -n "process\.env|ConfigService|registerAs" src .
rg -n "AuthGuard|Jwt|JWT|Passport|accessToken|refreshToken" src .
Inspect:
- module boundaries,
- imports,
- providers,
- repositories,
- event handlers,
- database migrations,
- websocket gateways,
- auth guards,
- config modules,
- Docker Compose files,
- queues,
- Redis clients,
- existing logging and tracing.
Do not edit anything until the current state is understood.
3.2 Report Reality Before Proposal
Before implementation, produce a short architectural inventory:
Current notification mechanism:
Current realtime transport:
Current event mechanism:
Current queue/broker:
Current Redis usage:
Current persistence:
Current ORM:
Current auth mechanism:
Current Docker services:
Current logger/observability:
Existing coupling problems:
Missing environment configuration:
If any item cannot be verified, write:
NOT VERIFIED
Do not guess.
4. Terminology Must Remain Correct
Never collapse these concepts into one thing.
4.1 Domain Event
A fact produced by a business domain.
Examples:
AppointmentCreated
AppointmentCancelled
ScheduleChanged
PaymentConfirmed
AttendanceRecorded
A domain event says what happened.
It does not describe a WebSocket packet.
4.2 Internal Event Bus
An application-level mechanism used to publish/subscribe to events within the backend process or application boundary.
Possible implementation:
- NestJS EventEmitter,
- NestJS CQRS EventBus,
- custom in-process abstraction.
It is not automatically durable.
It is not automatically a message broker.
4.3 Message Broker / Durable Messaging
Infrastructure for asynchronous communication, buffering, redelivery, competing consumers, durability, or service-to-service communication.
Possible technologies:
- RabbitMQ,
- Redis Streams,
- NATS JetStream,
- Kafka.
Do not introduce one unless the architecture needs the responsibility it provides.
4.4 Redis Pub/Sub
Ephemeral fan-out.
Messages are not inherently durable for disconnected subscribers.
Do not call Redis Pub/Sub a durable queue.
Do not use it as notification history.
4.5 Redis Streams
A persistent append-oriented Redis data structure with consumer-group semantics.
It can solve responsibilities that Pub/Sub cannot:
- replay,
- pending entries,
- consumer groups,
- acknowledgement.
Use only when those semantics are actually required.
4.6 WebSocket / Socket.IO
Client-facing real-time transport.
It solves:
backend <-> connected frontend/mobile client
It does NOT replace:
- database persistence,
- durable message brokers,
- retry queues,
- domain event modeling.
4.7 Server-Sent Events
Server-to-client unidirectional streaming.
Evaluate only when bidirectional communication is not required.
Do not choose it merely because it is simpler.
5. Target Dependency Direction
Dependencies must point inward toward abstractions.
Recommended conceptual dependency direction:
Business Domain
      |
      v
Domain Event Contract
      |
      v
Notification Application Layer
      |
      v
Notification Ports / Interfaces
      |
      +-------------------+
      |                   |
      v                   v
Persistence Adapter   Delivery Adapters
                          |
          +---------------+----------------+
          |               |                |
          v               v                v
      WebSocket         Push             Email
Infrastructure implements ports.
Application code depends on ports.
Domain code must not depend on infrastructure.
6. Recommended Backend Module Boundaries
Adapt naming to the actual codebase.
Do not blindly create folders if equivalent boundaries already exist.
Conceptual structure:
src/
  modules/
    notifications/
      domain/
        entities/
        value-objects/
        events/
        enums/
        errors/

      application/
        commands/
        queries/
        dto/
        handlers/
        policies/
        orchestrators/
        services/
        ports/

      infrastructure/
        persistence/
          repositories/
          mappers/
        realtime/
          gateways/
          adapters/
        messaging/
          publishers/
          consumers/
          adapters/
        queues/
        providers/
        config/

      presentation/
        http/
          controllers/
        websocket/
          gateway/
          dto/

      notifications.module.ts
If the repository follows a different architecture, preserve the repository convention.
The architectural boundary matters more than the exact folder names.
7. Domain Event Contract
Every event must have a stable event envelope.
Do not pass arbitrary anonymous objects across module boundaries.
Recommended conceptual contract:
export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: number;

  occurredAt: string;

  source: {
    module: string;
    entityType?: string;
    entityId?: string;
  };

  actor?: {
    userId?: string;
    role?: string;
  };

  correlationId?: string;
  causationId?: string;

  payload: TPayload;
}
Do not treat this exact interface as mandatory if the codebase already has a mature event contract.
The required properties are conceptual:
- unique event identity,
- event type,
- schema version,
- occurrence time,
- source identity,
- correlation metadata when appropriate,
- typed payload.
8. Notification Intent Must Be Separate From Domain Event
A domain event is not automatically a notification.
Example:
AppointmentCreated
may produce:
- no notification,
- one notification,
- multiple notifications,
- different notifications for different recipients,
- different channels.
Therefore introduce an explicit translation boundary.
Conceptual flow:
Domain Event
   |
   v
Notification Policy / Event Handler
   |
   v
Notification Command / Intent
   |
   v
Notification Orchestrator
Example intent:
interface NotificationIntent {
  intentId: string;
  recipient: RecipientDescriptor;
  type: string;
  templateKey: string;
  channels: NotificationChannel[];
  sourceReference?: SourceReference;
  metadata?: Record<string, unknown>;
}
Do not expose broker/websocket concepts here.
9. Recipient Resolution
Recipient resolution must be explicit.
Never scatter recipient lookup logic across business services.
Possible recipient descriptors:
type RecipientDescriptor =
  | { kind: 'USER'; userId: string }
  | { kind: 'ROLE'; role: string }
  | { kind: 'DOMAIN_RELATION'; relation: string; referenceId: string };
Only introduce forms actually needed by the system.
A dedicated resolver may own translation from a domain relationship to concrete user IDs.
For example:
"doctor assigned to appointment X"
        |
        v
RecipientResolver
        |
        v
userId[]
Business modules must not know socket connection IDs.
10. Persistence Model
If notifications must survive offline periods, process restarts, reconnects, or client reloads, persistence is required.
The notification record should be generic across business modules.
Conceptual fields:
id
recipient_id
notification_type
category
template_key

source_module
source_event_type
source_event_id

entity_type
entity_id

title
body
metadata

read_at
created_at
updated_at
Potential operational fields, if delivery tracking is required:
delivery_status
delivery_attempt_count
last_delivery_attempt_at
last_delivery_error
delivered_at
Do not add every possible column automatically.
Each field must have a defined owner and query requirement.
11. Notification Payload Rules
Notification metadata must be constrained.
Do not turn JSON metadata into an uncontrolled dumping ground.
Rules:
1. Metadata must be versionable.
2. Metadata must contain only client-relevant notification context.
3. Never store secrets.
4. Never store full domain entities.
5. Avoid storing mutable data unless snapshot semantics are intentional.
6. Document which fields are stable references versus snapshots.
7. Validate metadata before persistence.
8. Define maximum payload size.
Bad:
{
  "appointment": {
    "...entire database entity...": "..."
  },
  "doctor": {
    "...entire staff profile...": "..."
  }
}
Better:
{
  "appointmentId": "apt_123",
  "doctorNameSnapshot": "Dr. Example",
  "scheduledAtSnapshot": "2026-09-25T10:00:00+07:00"
}
only if those snapshots are intentionally required for notification history.
12. Database Integrity and Indexing
Do not invent indexes without identifying real queries.
At minimum investigate these access patterns:
Get latest notifications for user.
Get unread notifications for user.
Count unread notifications for user.
Mark one notification as read.
Mark all notifications for user as read.
Paginate historical notifications.
Find notification by source event for idempotency.
Cleanup notifications older than retention threshold.
Candidate indexes may include:
(recipient_id, created_at DESC)
(recipient_id, read_at, created_at DESC)
(source_event_id, recipient_id, notification_type)
The exact index definition depends on the database and ORM.
Use cursor pagination for continuously growing notification history when appropriate.
Avoid large OFFSET scans at scale.
13. Idempotency Is Mandatory
Assume events may be delivered more than once.
Duplicate delivery must not create duplicate notifications.
Never rely on:
if (!alreadySeenInMemory) ...
as the only protection.
Use durable idempotency when duplicate event processing matters.
Possible strategy:
source_event_id
recipient_id
notification_type
with a unique database constraint.
Alternative:
idempotency_key
generated deterministically from the event and notification policy.
The exact key must reflect business semantics.
Do not use random UUIDs as idempotency keys when the same logical notification may be retried.
14. Transactional Consistency
Pay close attention to this failure:
business transaction commits
-> process crashes
-> event never publishes
or:
event publishes
-> business transaction rolls back
If reliable event publication across database transactions is required, evaluate the Transactional Outbox pattern.
Conceptual flow:
DB Transaction:
  update business data
  insert outbox record
COMMIT

Outbox Publisher:
  read unpublished records
  publish event
  mark published
Do not add an outbox automatically.
First determine:
- whether event loss is acceptable,
- whether the current application already has a queue/outbox,
- whether the business operation and event publication must be atomic.
If the architecture requires reliability across process crashes, document why an outbox or equivalent mechanism is necessary.
15. Real-Time Delivery
Real-time delivery is a transport concern.
The notification application layer should call an abstraction such as:
interface RealtimeNotificationPort {
  deliver(
    recipients: readonly string[],
    notification: NotificationDeliveryPayload,
  ): Promise<DeliveryResult>;
}
The infrastructure adapter may use Socket.IO, native WebSocket, or another selected transport.
The application layer must not import the gateway implementation.
16. WebSocket Gateway Responsibilities
A gateway may own:
- authenticated connection establishment,
- disconnect cleanup,
- mapping authenticated user identity to connection(s),
- joining user-scoped rooms/channels,
- emitting notification events,
- transport-level acknowledgements,
- heartbeat/ping behavior,
- connection metadata,
- observability.
A gateway must NOT own:
- business decision logic,
- domain recipient resolution,
- notification persistence rules,
- template policy,
- database queries unrelated to transport,
- arbitrary feature-specific conditions.
Keep the gateway thin.
17. Connection Identity
Do not trust a client-provided user ID such as:
socket.emit('subscribe', { userId: '123' });
as authorization.
User identity for a realtime connection must come from authenticated server-side context.
Examples:
- verified access token during handshake,
- secure session cookie,
- another existing backend authentication mechanism.
After authentication, server-side code determines:
authenticated user -> allowed realtime scope
Never allow a client to subscribe to another user's notification stream by guessing an ID.
18. Multiple Devices and Multiple Tabs
Assume one user may have:
- phone,
- tablet,
- browser,
- multiple browser tabs.
Do not model:
user -> one socket
unless product requirements explicitly guarantee it.
Prefer conceptual mapping:
user -> zero or more active connections
User-scoped room/topic delivery is usually easier to manage than manually tracking exactly one socket ID.
19. Offline Behavior
Realtime transport is not notification history.
If the user is offline:
WebSocket delivery may not occur.
Persistent notification remains retrievable through HTTP/API.
On reconnect or app reload, the client should reconcile against server history.
Do not attempt to make the WebSocket layer itself the authoritative notification store.
20. Reconnection Model
Server responsibilities:
- authenticate every new connection,
- re-establish server-owned subscription scope,
- tolerate connection loss,
- avoid assuming the client received every previous realtime event.
Client reconciliation should be supported by a stable history endpoint.
The backend should provide deterministic history semantics, for example:
GET /notifications?cursor=...&limit=...
GET /notifications/unread-count
PATCH /notifications/:id/read
PATCH /notifications/read-all
Use repository naming and API conventions already established in the project.
Do not invent inconsistent routes.
21. Delivery Semantics
Explicitly document which guarantee applies.
Common semantics:
at-most-once
at-least-once
effectively-once through idempotency
True exactly-once delivery is not a casual assumption.
For most notification pipelines:
at-least-once processing + idempotent persistence
is a practical reliability model.
Do not claim exactly-once without proving every boundary supports it.
22. Retry Rules
Retry only transient failures.
Examples:
Potentially retryable:
temporary broker outage
temporary Redis outage
temporary provider timeout
temporary network error
5xx from external provider
Usually not retryable without intervention:
invalid recipient
invalid payload schema
unknown event version
authorization failure
permanent provider rejection
Retries must use:
- bounded attempts,
- exponential backoff where appropriate,
- jitter where appropriate,
- dead-letter/failure capture where required,
- structured logs.
Never implement infinite retries.
23. Dead-Letter / Failed Event Handling
If durable asynchronous processing exists, define what happens when an event repeatedly fails.
Possible destination:
dead-letter queue
failed_jobs table
failed_events table
broker-native DLQ
The system must preserve enough context to diagnose:
- event ID,
- event type,
- consumer,
- failure reason,
- attempt count,
- timestamps,
- correlation ID.
Do not silently discard failed notification work.
24. Broker Selection Rules
Do not choose Kafka, RabbitMQ, Redis Streams, or another broker by popularity.
Evaluate required capability.
24.1 Use an In-Process Event Bus When
The current system is a single backend process or modular monolith and:
- events do not need cross-service delivery,
- losing in-flight events during crash is acceptable,
- durable replay is unnecessary,
- operational simplicity is a priority.
24.2 Consider Redis Streams When
The system already operates Redis and needs:
- persistent event entries,
- consumer groups,
- acknowledgement,
- replay,
- modest operational complexity.
Do not confuse this with Redis Pub/Sub.
24.3 Consider RabbitMQ When
The system needs strong queue semantics such as:
- acknowledgements,
- redelivery,
- routing,
- dead-lettering,
- work queues,
- multiple asynchronous consumers,
- reliable broker-managed delivery.
Do not add RabbitMQ merely because notifications are asynchronous.
24.4 Consider Kafka When
There is a real requirement for:
- high-throughput durable event logs,
- long replay windows,
- partitioned event streams,
- multiple independent consumer groups,
- stream-processing architecture.
Kafka is usually unjustified for a small modular backend without those needs.
Do not create operational complexity for prestige.
25. Redis Usage Must Be Explicit
Redis may serve multiple different responsibilities.
Each must be named separately.
Possible roles:
cache
distributed lock
rate limit store
socket adapter
ephemeral pub/sub
durable-ish stream
job queue backend
Do not create one generic RedisService that becomes a god object for unrelated responsibilities.
Create role-specific abstractions when responsibilities diverge.
26. Horizontal Scaling
If the backend runs more than one application instance, verify realtime fan-out.
Problem:
User connected to App Instance A
Notification generated on App Instance B
Without shared transport coordination, Instance B may not reach the user's connection.
Possible solution for Socket.IO:
Socket.IO Redis adapter
or another supported distributed adapter.
Do not add this complexity before horizontal scaling exists, but design the realtime abstraction so it can be added without changing business modules.
27. Notification Channel Abstraction
The current product may only use in-app notifications.
Still keep channel selection behind an interface.
Conceptually:
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;

  send(
    notification: NotificationDelivery,
  ): Promise<NotificationChannelResult>;
}
Possible future adapters:
IN_APP
PUSH
EMAIL
SMS
Do not implement future channels that are not requested.
Architect for extension without speculative code.
28. Template / Message Construction
Do not let every feature manually concatenate notification text.
Bad:
const message =
  doctorName + ' changed schedule for ' + appointmentId;
Prefer an explicit formatting/template boundary.
Possible ownership:
NotificationTemplateResolver
NotificationContentFactory
NotificationPolicy
The chosen pattern must preserve:
- type safety,
- localization readiness if relevant,
- versionability,
- testability,
- domain isolation.
Do not place formatting inside WebSocket gateway code.
29. API Boundary
HTTP endpoints for notifications belong to the notification presentation layer.
Potential use cases:
list history
get unread count
mark read
mark all read
delete/archive if product supports it
Controllers should delegate.
Bad:
@Controller('notifications')
class NotificationsController {
  @Get()
  async list() {
    // 200 lines of query building + mapping + business logic
  }
}
Good:
Controller
 -> Query/Use Case
 -> Repository Port
 -> Persistence Adapter
30. Repository Rules
Repositories represent persistence boundaries.
Do not create generic repositories so abstract that they hide useful domain semantics.
Prefer:
interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  findForRecipient(...): Promise<...>;
  markRead(...): Promise<...>;
  countUnread(...): Promise<number>;
}
over:
interface GenericRepository<T> {
  create(...)
  find(...)
  update(...)
  delete(...)
}
if the generic interface weakens the model.
Repository methods should map to domain/application use cases.
31. Avoid God Services
Forbidden smell:
NotificationService
  - saves records
  - opens sockets
  - resolves users
  - sends email
  - publishes Redis
  - retries failures
  - builds text
  - loads templates
  - counts unread
  - parses auth
  - writes logs
  - manages queues
Split by responsibility.
Possible components:
NotificationOrchestrator
NotificationRepository
RecipientResolver
NotificationPolicyRegistry
NotificationTemplateResolver
RealtimeDeliveryAdapter
NotificationChannelDispatcher
NotificationEventConsumer
NotificationEventPublisher
NotificationQueryService
Only create abstractions justified by actual complexity.
32. File Size and Complexity Discipline
Do not allow one file to grow into a multi-responsibility implementation.
As a heuristic:
- investigate files approaching ~300–500 lines,
- split by responsibility,
- extract reusable pure utilities,
- isolate adapters,
- isolate mappings,
- isolate validation,
- isolate policies.
Do not split mechanically by line count.
A 200-line cohesive file may be better than five artificial wrappers.
The rule is responsibility cohesion.
33. No Deep Relative Import Chaos
Respect the project's alias/import convention.
Avoid:
import { X } from '../../../../../../infrastructure/database/...';
Prefer configured aliases such as:
import { X } from '@/modules/notifications/...';
or project-specific path mappings.
Do not invent aliases without checking tsconfig.json.
34. Barrel Export Rules
Barrel exports may be used per module boundary.
Do not create giant global barrels that cause:
- circular dependencies,
- accidental coupling,
- hidden imports,
- unclear ownership.
Preferred:
notifications/domain/index.ts
notifications/application/index.ts
only when the codebase already supports this style and circular dependency risk is controlled.
Do not export infrastructure internals through a public domain barrel.
35. Configuration
Notification infrastructure configuration must be centralized and validated.
Examples:
REALTIME_*
REDIS_*
BROKER_*
NOTIFICATION_*
Use the project's existing NestJS configuration mechanism.
Validate required configuration at startup.
Do not scatter:
process.env.X
through business code.
Prefer typed config providers.
36. Environment Review Before Run
Before starting the system, inspect:
rg -n "process\.env|ConfigService|getOrThrow|registerAs" src
rg -n "REDIS_|BROKER_|RABBIT|KAFKA|SOCKET|WS_|NOTIFICATION_" .
Produce a required environment checklist.
Never claim the feature is ready if required keys are absent.
37. Docker Is the Execution Boundary
Assume backend infrastructure is executed through Docker when the project is Docker-based.
Do not instruct the user to start Redis/RabbitMQ/PostgreSQL manually on the host if Compose owns those services.
Inspect actual Compose configuration first.
Use project commands such as:
docker compose ps
docker compose config
docker compose logs <service>
docker compose exec <service> <command>
Use the exact service names discovered in the repository.
Do not invent names such as backend, redis, or rabbitmq.
38. Docker Service Responsibilities
Potential services may include:
NestJS API
PostgreSQL
Redis
RabbitMQ or another broker
worker process
Do not add containers automatically.
Each independent container must have a reason.
Stateless services:
NestJS API instance
notification worker, if used
Stateful services generally require persistent volumes:
PostgreSQL
durable broker data
Redis, if persistence is intentionally required
Do not use volumes as a substitute for understanding persistence semantics.
39. Container Restart Behavior
The design must explicitly answer:
What happens if the API container restarts?
What happens if the Redis container restarts?
What happens if the broker restarts?
What happens if the worker restarts?
What work is lost?
What work is replayed?
What is persisted?
What reconnects automatically?
Do not call the architecture reliable until these questions have answers.
40. Health and Readiness
A notification backend may depend on:
database
Redis
message broker
Differentiate:
liveness
readiness
Liveness:
Is the process alive?
Readiness:
Can this process currently serve the responsibilities it claims to serve?
Do not make a service appear ready when its critical dependency is unavailable.
41. Observability
Every asynchronous boundary must be observable.
Use the repository's existing structured logging stack.
Important fields:
event_id
event_type
notification_id
recipient_id
channel
source_module
correlation_id
causation_id
attempt
delivery_status
duration_ms
error_code
Avoid logging full sensitive payloads.
Never rely on free-form strings alone for asynchronous pipeline debugging.
42. Correlation and Traceability
A single business action should be traceable across:
HTTP request
business transaction
domain event
notification handler
notification persistence
broker publication
delivery attempt
WebSocket emission
Preserve correlation identifiers across asynchronous boundaries when the current observability stack supports them.
Do not generate unrelated IDs at every layer without preserving causality.
43. Metrics
Where the monitoring stack supports metrics, useful notification metrics include:
notifications_created_total
notifications_delivered_total
notification_delivery_failures_total
notification_processing_duration
notification_queue_depth
notification_retry_total
active_realtime_connections
notification_unread_count distribution where appropriate
Do not create high-cardinality labels such as raw user IDs.
44. Error Taxonomy
Use explicit error categories.
Examples:
InvalidNotificationIntentError
UnknownNotificationPolicyError
RecipientResolutionError
NotificationPersistenceError
RealtimeDeliveryUnavailableError
UnsupportedNotificationChannelError
Do not expose raw infrastructure errors directly to business modules.
Translate infrastructure failures at adapter boundaries.
45. Security
45.1 Authorization
Notification history endpoints must scope queries to the authenticated user unless an explicitly authorized administrative use case exists.
Never accept arbitrary recipientId from a normal user request and trust it.
45.2 Realtime Authentication
Authenticate the connection before joining any user-specific room/channel.
Reject expired/invalid credentials according to the application's existing auth rules.
45.3 Sensitive Data
Do not place sensitive/private data in:
- WebSocket room names,
- broker topic names,
- logs,
- unvalidated metadata,
- notification title/body unless product requirements explicitly allow it.
45.4 Payload Validation
Validate:
- domain event schema,
- notification intent,
- API input,
- broker input,
- WebSocket inbound messages.
Never trust data merely because it came from another internal module.
46. Versioning
Domain events evolve.
Include event versioning if events cross asynchronous boundaries or may be replayed later.
Example:
appointment.created.v1
appointment.created.v2
or:
{
  "eventType": "appointment.created",
  "eventVersion": 2
}
Do not silently reinterpret an old payload using a new schema.
47. Event Naming
Use stable semantic names.
Preferred:
appointment.created
appointment.cancelled
schedule.changed
attendance.recorded
Avoid transport-oriented names:
send-socket-notification
redis-message
ws-update
The event name should describe business fact, not infrastructure action.
48. Testing Strategy
48.1 Unit Tests
Test pure behavior:
event -> notification policy decision
recipient resolution
template selection
idempotency-key generation
state transitions
metadata validation
48.2 Application Tests
Test use cases with mocked ports:
consume event
create notification
persist notification
dispatch delivery
mark read
query unread count
48.3 Adapter Tests
Test infrastructure adapters separately:
database repository
WebSocket adapter
broker producer
broker consumer
Redis adapter
48.4 Integration Tests
Use real test containers/services where justified.
Test:
database unique constraint for idempotency
broker redelivery
worker retry
gateway authentication
history after offline/reconnect
48.5 Failure Tests
Explicitly test:
duplicate event
database unavailable
Redis unavailable
broker unavailable
socket disconnected
worker crash during processing
invalid event version
missing recipient
retry exhaustion
container restart
Do not test only the happy path.
49. Required End-to-End Lifecycle
The backend design must support a flow equivalent to:
1. Actor performs a business action.
2. Business module validates and commits its own state change.
3. Business module produces a domain event.
4. Event is published through the established abstraction.
5. Notification event handler/policy consumes the relevant event.
6. The handler decides whether a notification is required.
7. Recipient(s) are resolved.
8. A notification intent is created.
9. Idempotency is checked/enforced.
10. Notification record is persisted when history/offline recovery requires it.
11. Channel(s) are selected.
12. Realtime adapter attempts immediate delivery to connected client(s).
13. Delivery outcome is recorded if required.
14. Client can later query notification history.
15. Client marks notification read.
16. Backend persists read state.
Every implementation must preserve these responsibility boundaries.
50. Example Integration Contract
A future feature should integrate with minimal knowledge.
Example:
await this.domainEvents.publish(
  AppointmentCancelledEvent.create({
    appointmentId,
    actorId,
    patientId,
    doctorId,
    cancelledAt,
  }),
);
That feature must NOT then do:
await this.notifications.create(...);
await this.socket.emit(...);
Notification behavior is handled by a notification-side subscriber/policy.
51. Example Notification-Side Handler
Conceptual only:
@Injectable()
export class AppointmentCancelledNotificationHandler {
  constructor(
    private readonly notifications: NotificationOrchestrator,
  ) {}

  async handle(event: AppointmentCancelledEvent): Promise<void> {
    await this.notifications.create({
      idempotencyKey: buildNotificationKey(event),
      recipient: {
        kind: 'USER',
        userId: event.patientId,
      },
      type: 'APPOINTMENT_CANCELLED',
      templateKey: 'appointment.cancelled',
      source: {
        module: 'appointments',
        eventId: event.eventId,
        entityType: 'appointment',
        entityId: event.appointmentId,
      },
      metadata: {
        appointmentId: event.appointmentId,
      },
      channels: ['IN_APP'],
    });
  }
}
The real implementation must follow repository conventions.
Do not copy this example blindly.
52. Read/Unread State
Read/unread is backend-owned persistent state when notification history is persistent.
Recommended model:
read_at = NULL     -> unread
read_at != NULL    -> read
This preserves timestamp semantics better than a bare boolean when the time matters.
Do not create separate read-state tables unless product requirements require per-device, per-channel, or multi-recipient semantics that justify them.
53. State Machine for Delivery
If delivery tracking is required, define state transitions explicitly.
Example:
PENDING
  -> DELIVERED
  -> FAILED_RETRYABLE
  -> DEAD_LETTER
Do not create ambiguous combinations such as:
isSent = true
status = FAILED
Prefer one coherent state model.
54. History Retention
Notification data grows continuously.
The design must define:
- retention requirement,
- cleanup policy,
- archival requirement if any,
- database growth expectations,
- indexes used by cleanup,
- whether old notification metadata remains useful.
Do not add automatic deletion without product approval.
Do not assume notifications must be stored forever.
55. Pagination
Avoid returning all historical notifications.
Use bounded limits.
Prefer stable cursor pagination based on:
(created_at, id)
or the repository/database equivalent.
The cursor must produce deterministic ordering.
56. Concurrency
Assume concurrent consumers may process the same logical work.
Use:
- database uniqueness,
- atomic state transitions,
- broker acknowledgements,
- transactional updates,
rather than process-local flags.
Do not rely on a JavaScript Set for distributed correctness.
57. Worker Architecture
If notification processing is asynchronous, decide whether it runs:
inside the API process
or
inside a dedicated worker process
Do not choose by habit.
Dedicated workers are useful when:
- delivery work can be slow,
- retries are needed,
- API request latency should remain isolated,
- independent scaling is useful.
But they add deployment complexity.
Document the reason.
58. Fire-and-Forget Is Not "Ignore Errors"
Business code may use asynchronous event publication semantics.
But infrastructure must still define:
- ownership,
- failure reporting,
- retries,
- observability,
- durability expectations.
Do not implement:
somePromise();
with no await, no queue, no error handling, and call that "fire-and-forget architecture."
59. No Hidden Magic
Avoid opaque abstractions that make tracing impossible.
Every event flow should be discoverable through:
- explicit event types,
- explicit handlers,
- explicit provider registration,
- explicit module ownership,
- searchable naming.
Do not create metaprogramming that saves ten lines but makes event ownership impossible to trace.
60. Searchability
Names must be grep-friendly.
Good:
AppointmentCancelledEvent
AppointmentCancelledNotificationHandler
NotificationOrchestrator
RealtimeNotificationAdapter
Bad:
Handler1
Processor
Helper
CommonUtil
Manager
The agent should be able to trace an event with:
rg -n "AppointmentCancelled" src
61. Utility Functions
Reusable stateless operations may be extracted into pure utilities.
Examples:
buildIdempotencyKey
serializeNotificationCursor
parseNotificationCursor
sanitizeNotificationMetadata
Do not put domain workflows into generic utils.ts.
Utilities must remain:
- stateless,
- deterministic when possible,
- domain-neutral or clearly scoped.
62. Factory Usage
Use factories when they enforce invariants or produce valid domain/application objects.
A factory is not a dumping ground for unrelated helpers.
Good reason:
NotificationFactory.create(...)
guarantees required fields and valid state.
Bad reason:
NotificationFactory.sendSocket(...)
NotificationFactory.queryDatabase(...)
63. Dependency Injection
Use NestJS DI to bind ports to adapters.
Conceptual example:
{
  provide: REALTIME_NOTIFICATION_PORT,
  useClass: SocketIoRealtimeNotificationAdapter,
}
Application code depends on the token/port.
Infrastructure class remains replaceable.
Avoid direct new InfrastructureService() inside business services.
64. Provider Tokens
Use explicit tokens for abstraction boundaries when interfaces disappear at runtime.
Example:
export const NOTIFICATION_REPOSITORY =
  Symbol('NOTIFICATION_REPOSITORY');
Do not use magic strings scattered across modules.
Centralize tokens at the relevant module boundary.
65. Circular Dependency Prevention
Notification architecture is especially vulnerable to cycles.
Bad:
AppointmentsModule imports NotificationsModule
NotificationsModule imports AppointmentsModule
Preferred:
Appointments -> event contract
Notifications -> subscribes to event contract
Use event communication to reduce direct module imports.
Do not reach for forwardRef() as the first solution.
A forwardRef() may be evidence of a boundary problem.
66. Business Module Integration Checklist
Before allowing a feature to use notifications, verify:
[ ] The feature publishes a domain event.
[ ] The feature does not import WebSocket infrastructure.
[ ] The feature does not insert notification rows.
[ ] The feature does not call Redis directly for notification delivery.
[ ] The feature does not know notification retry policy.
[ ] A notification-side handler/policy exists.
[ ] Recipient resolution is owned outside the feature where appropriate.
[ ] Idempotency is defined.
[ ] Notification metadata is minimal and validated.
[ ] Tests cover duplicate event delivery.
67. Notification Module Checklist
[ ] Stable event contract.
[ ] Explicit notification intent.
[ ] Application orchestration separated from infrastructure.
[ ] Repository port.
[ ] Realtime delivery port.
[ ] Channel abstraction if needed.
[ ] Authenticated gateway.
[ ] Persistent history if offline recovery is required.
[ ] Cursor pagination.
[ ] Read/unread semantics.
[ ] Idempotency.
[ ] Retry behavior.
[ ] Failure capture.
[ ] Structured logging.
[ ] Docker dependency configuration.
[ ] Environment validation.
[ ] Health/readiness.
[ ] Restart behavior documented.
68. Anti-Patterns — Reject Immediately
Reject designs containing any of the following unless there is a documented exceptional reason.
68.1 Socket Calls Inside Business Services
this.server.emit(...)
inside appointment/schedule/payment/attendance services.
68.2 Direct Notification Table Writes From Features
this.notificationTable.insert(...)
inside business modules.
68.3 Feature-Specific Columns
Bad generic notification table:
appointment_id
doctor_schedule_id
invoice_id
attendance_id
prescription_id
This becomes coupled to every new feature.
Use generic source references unless strong relational requirements justify specific relations.
68.4 Giant Switch in Core
switch (event.type) {
  case 'APPOINTMENT_CREATED':
  case 'PAYMENT_PAID':
  case 'SCHEDULE_CHANGED':
  case 'ATTENDANCE_RECORDED':
  ...
}
in one central god service.
Prefer modular event handlers/policies registered through DI.
68.5 Broker Everywhere
Do not route every internal function call through RabbitMQ/Kafka merely to look "event-driven."
Use the simplest mechanism that satisfies required reliability and scaling.
68.6 WebSocket as Database
Never assume:
if emitted, notification exists.
Delivery is ephemeral unless persistence exists.
68.7 Redis Pub/Sub as Queue
Do not assume Redis Pub/Sub supports replay/redelivery.
68.8 Infinite JSON Metadata
Do not let arbitrary metadata become an unvalidated schema escape hatch.
68.9 Infrastructure-Specific Event Names
Do not publish:
SOCKET_SEND
REDIS_NOTIFY
RABBIT_NOTIFICATION
from domain modules.
68.10 Hardcoded User/Role Mapping
Do not duplicate recipient logic throughout handlers.
Centralize reusable resolution rules.
69. Change Workflow for Agents
Every implementation request must follow this sequence.
Phase A — Discover
1. Inspect relevant modules.
2. Search existing notification/realtime/event infrastructure.
3. Inspect Docker services.
4. Inspect environment configuration.
5. Inspect database schema and migrations.
6. Identify existing abstractions.
7. Identify coupling and duplication.
No writes.
Phase B — Model
Describe:
current flow
desired flow
ownership changes
new/changed contracts
data model impact
runtime dependency impact
Docker impact
failure behavior
migration impact
Do not code yet if architecture is still ambiguous.
Phase C — Minimal Architectural Change
Prefer extending existing abstractions over creating parallel systems.
Do not build:
NotificationServiceV2
NewNotificationManager
NotificationHelper2
when the current module should be repaired.
Phase D — Implement
Implement in small cohesive units.
Keep commits/patches conceptually separable:
event contract
persistence
orchestration
realtime adapter
consumer
API query/read-state
Docker/config
tests
Phase E — Verify
At minimum verify:
typecheck
lint
unit tests
integration tests where available
database migration validity
Docker startup
health checks
event flow
duplicate delivery
offline history
read-state update
Run commands through Docker when the project runs through Docker.
70. Required Agent Output After Modification
After completing a change, report:
1. What changed
2. Why it changed
3. Which architectural boundary owns it
4. Files modified
5. New contracts/interfaces
6. Database changes
7. Environment variables required
8. Docker changes
9. Failure behavior
10. Idempotency behavior
11. Tests executed
12. Remaining risks
Do not report "done" without verification evidence.
71. Decision Record Requirements
Whenever choosing a significant technology such as:
- RabbitMQ,
- Redis Streams,
- Redis Pub/Sub,
- BullMQ,
- Kafka,
- Socket.IO,
- native WebSocket,
- SSE,
document:
Problem being solved:
Required guarantee:
Why the current stack is insufficient:
Why this technology fits:
Operational cost:
Failure behavior:
Replacement boundary:
Why simpler alternatives were rejected:
No technology-by-fashion decisions.
72. Default Architectural Preference
Unless repository evidence or requirements justify something more complex, prefer this progression:
1. Clean NestJS module boundaries.
2. Stable domain event abstraction.
3. In-process event dispatch for local modular communication.
4. Persistent notification records for offline/history requirements.
5. WebSocket/Socket.IO adapter for realtime connected clients.
6. Redis only when a concrete coordination/caching/socket-scaling need exists.
7. Durable broker/queue only when durability, retries, buffering, or worker isolation requires it.
8. Outbox only when transactional event reliability requires it.
9. Kafka only when its event-log/throughput/replay model is genuinely needed.
This is a decision heuristic, not permission to skip discovery.
73. Source of Truth Hierarchy
When requirements conflict, prioritize:
1. Current explicit product requirement.
2. Existing verified database/domain contract.
3. Existing backend architectural conventions.
4. This AGENTS.md architectural guardrail.
5. Technology defaults.
Never override real backend contracts because an example in this document looks cleaner.
74. Definition of Done
A notification backend change is not complete merely because a socket message appears.
It is complete only when the relevant responsibilities are correct.
Required questions:
Can the business feature publish intent without infrastructure knowledge?
Can the notification subsystem be changed without changing that feature?
Can duplicate events be handled safely?
Can an offline user retrieve notification history?
Can the system identify which user is authorized to receive the notification?
Can the realtime connection recover after disconnect?
Can failures be observed?
Can retries occur without duplicate persistent notifications?
Can a container restart without undefined behavior?
Can another feature integrate using the same contract?
Can the current infrastructure technology be replaced behind an adapter?
If the answer to any required question is unknown, the implementation is not architecturally complete.
75. Final Principle
The desired developer experience is:
A feature experiences a domain event.
The feature publishes the event through a stable contract.
The notification subsystem decides whether a notification exists.
The subsystem resolves recipients.
The subsystem persists the notification if required.
The subsystem delivers it through selected adapters.
The subsystem handles idempotency, failure, retry, history, and observability.
The feature remains unaware of notification infrastructure