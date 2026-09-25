# Backend Architecture & Design Paradigm Catalog

**Purpose:** a reference lexicon for refactoring an oversized, tightly-coupled backend (2,000–4,000+ LOC files) into small, decoupled, reusable, and **client-agnostic** modules. Each entry is a named paradigm/pattern with a one- or two-line definition. Use it as a checklist when planning a module, or as context for an AI assistant doing the refactor: "apply Repository + Unit of Work + Mapper to this module" is a much more precise instruction than "clean this up."

The catalog is organized into 10 groups of 10. Nothing here is stack-specific — it applies whether the module is written in NestJS, Express, Go, or anything else. (For a NestJS + Drizzle-specific base-module catalog, see the companion file `nestjs-drizzle-base-module-catalog.md`.)

---

## A. Foundational Principles

1. **SOLID Principles** — five OOP rules (Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion) that keep classes small, focused, and swappable.
2. **DRY (Don't Repeat Yourself)** — one authoritative implementation of any given logic; duplicates are refactored into a shared module instead of copy-pasted.
3. **KISS (Keep It Simple, Stupid)** — prefer the simplest design that solves the actual problem; resist speculative complexity.
4. **YAGNI (You Aren't Gonna Need It)** — don't build abstractions for requirements that don't exist yet.
5. **SSOT (Single Source of Truth)** — one canonical place (a schema, a config, a contract) that everything else derives from, instead of copies that drift apart over time.
6. **Separation of Concerns (SoC)** — each unit of code owns exactly one responsibility (routing, validation, business rule, persistence) and nothing else.
7. **Composition over Inheritance** — build behavior by combining small objects/functions instead of deep class hierarchies.
8. **Law of Demeter (Principle of Least Knowledge)** — an object should only talk to its immediate collaborators, never reach through them to their internals.
9. **Tell, Don't Ask** — give objects commands to act on their own state instead of pulling state out to decide for them elsewhere.
10. **Convention over Configuration** — consistent, predictable defaults (naming, folder layout) so each new module needs less boilerplate wiring.

## B. Architectural Styles

11. **Layered (N-Tier) Architecture** — the classic Presentation → Application → Domain → Infrastructure stack.
12. **Clean Architecture** — dependencies point inward toward the domain; frameworks and the database are outer, replaceable "plugins."
13. **Hexagonal Architecture (Ports & Adapters)** — the domain core exposes *ports* (interfaces); HTTP, DB, and queues are *adapters* plugged into them.
14. **Onion Architecture** — a concentric-ring variant of Clean Architecture, with the domain model at the very center.
15. **Modular Monolith** — one deployable unit, internally split into strongly-bounded modules with enforced boundaries — easy to later extract into services.
16. **Vertical Slice Architecture** — organize code by feature/use-case end-to-end, instead of by technical layer.
17. **Screaming Architecture** — folder names announce the business capability ("orders", "billing"), not the technical pattern ("controllers", "services").
18. **Event-Driven Architecture (EDA)** — modules communicate by publishing/subscribing to events instead of calling each other directly, reducing coupling.
19. **CQRS (Command Query Responsibility Segregation)** — separate models/paths for writes (commands) and reads (queries), which can even use different data shapes.
20. **Backend For Frontend (BFF)** — a thin, client-specific API layer (one for mobile, one for web-admin) that both call the *same* shared core services underneath — the direct fix for "same behavior, different endpoint."

## C. Domain-Driven Design (DDD)

21. **Bounded Context** — an explicit boundary within which a domain model and its terms have one consistent meaning.
22. **Ubiquitous Language** — the same vocabulary used by business, code, and docs inside a bounded context, preventing translation drift.
23. **Aggregate / Aggregate Root** — a cluster of related entities/value objects treated as one consistency boundary, entered only through its root — this is the "aggregation" concept you were thinking of.
24. **Entity** — a domain object with identity/lifecycle that persists across state changes (e.g. an Order).
25. **Value Object** — an immutable object defined only by its attributes, with no identity of its own (e.g. Money, Address).
26. **Domain Service** — a stateless operation that doesn't naturally belong to any single entity or value object.
27. **Domain Event** — a record that "something happened" in the domain, used to decouple side effects from the action that triggered them.
28. **Anti-Corruption Layer (ACL)** — a translation layer that isolates your domain model from a foreign or legacy model it must integrate with.
29. **Context Mapping** (Shared Kernel / Customer-Supplier / Conformist / Open Host Service) — named patterns describing how two bounded contexts relate to and exchange data with each other.
30. **Specification Pattern** — encapsulate a business rule or query predicate as a reusable, combinable object instead of scattering `if` conditions everywhere.

## D. Data Access & Persistence

31. **Repository Pattern** — hides persistence details behind a collection-like interface (`findById`, `save`) so business logic never touches the ORM directly.
32. **Unit of Work** — tracks every change made during one business transaction and commits or rolls all of it back together, atomically.
33. **Data Mapper** — a translator between the persistence row/schema shape and the in-memory domain object, keeping the domain ignorant of the database.
34. **Active Record (contrast pattern)** — the model itself knows how to save/load; useful to name explicitly as the pattern you are moving *away from* for large domains.
35. **Generic Repository** — one reusable `IRepository<T>` implementation that every feature's specific repository extends, instead of hand-rolling CRUD each time.
36. **Query Object / Query Builder Abstraction** — encapsulate a complex, reusable query as its own object rather than duplicating raw query logic across services.
37. **Optimistic Concurrency Control** — detect conflicting concurrent writes via a version/timestamp column instead of locking rows.
38. **Soft Delete Pattern** — mark rows `deletedAt` instead of removing them, preserving history and referential integrity.
39. **Outbox Pattern** — write a domain event to an "outbox" table in the *same* database transaction as the business change, then publish it reliably afterward.
40. **Saga / Process Manager** — coordinate a multi-step transaction across several aggregates/services using a sequence of local transactions plus compensations.

## E. Object Creation & Transformation

41. **Factory Pattern** — centralizes and encapsulates object/aggregate construction so callers never need to know its internal invariants.
42. **Abstract Factory** — a factory that produces families of related objects without exposing which concrete classes are used.
43. **Builder Pattern** — assembles a complex object step by step; useful for objects with many optional fields.
44. **Mapper Pattern** — a dedicated class that converts between representations (Entity ↔ DTO, DB row ↔ Domain object).
45. **DTO (Data Transfer Object)** — a plain, validated shape used to move data across a boundary (API request/response), decoupled from the internal entity shape.
46. **Adapter Pattern** — wraps an incompatible interface (e.g. a third-party SDK) so the rest of the app depends on your own interface instead.
47. **Facade Pattern** — a simplified, unified entry point placed in front of a set of complex subsystems or services.
48. **Decorator Pattern** — attaches extra behavior to an object/function dynamically without altering its class (`@Injectable`, `@UseGuards`, etc.).
49. **Proxy Pattern** — a stand-in object that controls access to another object (lazy loading, caching, permission checks).
50. **Null Object Pattern** — return a harmless "do-nothing" object instead of `null`, removing null-checks scattered through the codebase.

## F. Behavioral & Cross-Cutting Patterns

51. **Strategy Pattern** — encapsulate interchangeable algorithms/behaviors behind one interface, selected at runtime.
52. **Chain of Responsibility** — pass a request along a chain of handlers until one of them handles it (the basis of middleware pipelines).
53. **Template Method** — define the skeleton of an algorithm in a base class, letting subclasses override only specific steps.
54. **Observer / Pub-Sub** — subscribers react to events published by a subject without the subject knowing who is listening.
55. **Mediator Pattern** — a central object coordinates communication between components instead of them referencing each other directly (the basis of command/query buses).
56. **Command Pattern** — encapsulate a request/intent as an object that can be queued, logged, validated, or routed to a dedicated handler.
57. **Middleware / Interceptor / Guard / Pipe / Filter** — the standard hook points for cross-cutting logic (logging, transformation, auth, validation, error-mapping) so it never has to be copy-pasted into every handler.
58. **Circuit Breaker** — stop calling a failing downstream dependency for a cooldown period instead of retrying it into the ground.
59. **Retry with Backoff** — automatically retry a transient failure with increasing delay instead of failing immediately.
60. **Rate Limiting / Throttling** — cap how often a client can call an endpoint, protecting shared resources from being overwhelmed.

## G. Error Handling & Reliability

61. **Result / Either Pattern** — return an explicit success-or-failure value instead of throwing exceptions for *expected* business failures.
62. **Railway-Oriented Programming** — chain operations so a failure short-circuits the rest of the pipeline cleanly, like a railway switch.
63. **Custom Exception Hierarchy** — a tree of domain-specific exception classes instead of throwing a generic `Error`.
64. **Global Exception Filter** — one centralized handler that turns any thrown exception into a consistent API error shape.
65. **Idempotency** — designing an operation so repeating it (e.g. a retried request) produces the same result without duplicate side effects.
66. **Idempotent Consumer** — a message/event handler that safely ignores duplicate deliveries of the same message.
67. **Compensating Transaction** — an explicit "undo" step used to roll back a previously committed step in a saga when a later step fails.
68. **Bulkhead Pattern** — isolate resources (thread pools, DB connections) per dependency so one failing dependency can't starve the others.
69. **Dead Letter Queue** — route messages that repeatedly fail processing into a separate queue for inspection, instead of losing them or retrying forever.
70. **Graceful Degradation** — define a fallback response/behavior for when a dependency is down, instead of a hard failure.

## H. Module, Folder & Dependency Structure

71. **Package by Feature (vs. Package by Layer)** — group files by business capability (`orders/`) rather than by technical role (`controllers/`, `services/`) scattered across the whole app.
72. **Barrel Exports (`index.ts`)** — one file per module that re-exports its public surface, so other modules import from a single clean path.
73. **Module Encapsulation** — a module exposes only what it explicitly exports; everything else stays private/internal to it.
74. **Composition Root** — the single place (usually app bootstrap) where all dependencies are wired together, kept separate from business logic.
75. **Dependency Injection (DI) / Inversion of Control (IoC)** — objects receive their dependencies from outside instead of constructing them, which is exactly what makes a module swappable and testable — this is the technical basis of "agnostic, plug-and-call" modules.
76. **Dynamic Modules (`forRoot` / `forFeature`)** — a pattern for configurable, reusable modules that accept options at import time.
77. **Shared Kernel Package** — a small, deliberately shared library (types, contracts, utilities) that multiple modules or apps depend on — your SSOT made physical.
78. **Monorepo Structure** — multiple apps/packages in one repository with shared tooling, enabling contract/code sharing without publishing separate packages.
79. **Module Boundary Enforcement** — lint/build rules that fail the build if one module reaches into another module's internals instead of its public interface.
80. **God Object / God Service (anti-pattern)** — a single class or file that knows and does too much. Naming this explicitly is usually the fastest way to justify splitting a 4,000-line file.

## I. Multi-Client & API Consistency

81. **Backend For Frontend (BFF), revisited** — see #20; this is the concrete answer to "mobile and web-admin do the same thing but hit different endpoints."
82. **Canonical Data Model** — one agreed-upon shape for a concept (e.g. `User`) that every client and internal module maps to/from, instead of each client inventing its own shape.
83. **Contract-First Design** (OpenAPI/JSON Schema/Zod-schema-first) — define the API contract before implementation, then generate types/clients from it so client and server can never silently drift apart.
84. **Shared DTO/Contract Package** — a package (in a monorepo) containing request/response types consumed by both the backend and multiple frontend clients.
85. **Transport-Agnostic Service Layer** — business/application logic lives in plain services that know nothing about HTTP, so *any* controller — mobile, web-admin, GraphQL, CLI, cron — can call the exact same logic. This is the core "agnostic module" idea you described.
86. **API Gateway** — a single entry point that routes, authenticates, and aggregates calls to internal services, presenting one consistent surface to every client.
87. **GraphQL Federation / Schema Stitching** — compose one graph from multiple services, letting each client query exactly the fields it needs instead of maintaining parallel REST endpoints.
88. **API Versioning Strategy** — a deliberate scheme (URI, header, or media-type versioning) for evolving a contract without breaking existing clients.
89. **Policy-Based Authorization (e.g. CASL)** — express "who can do what" as declarative policies attached to the shared service layer, instead of duplicating access checks inside every client-specific endpoint.
90. **Response Envelope Pattern** — a standard wrapper (`{ data, meta, error }`) around every API response, so all clients parse responses identically regardless of which endpoint served them.

## J. Scalability, Migration & Evolution

91. **Strangler Fig Pattern** — incrementally replace a legacy module by routing traffic to the new implementation piece by piece, until the old one can be safely deleted. This is the standard playbook for migrating a 4,000-line file without a risky big-bang rewrite.
92. **Feature Flags / Toggles** — ship code behind a runtime switch, decoupling deployment from release and enabling safe incremental rollout.
93. **Migration-as-Code** — schema changes are versioned, reviewable files generated from the schema, never manual, undocumented DB edits.
94. **Backward-Compatible Schema Evolution** — additive-first changes (a new nullable column, a new endpoint version) so old and new code can run side by side during rollout.
95. **Blue-Green Deployment** — run two identical production environments and switch traffic between them atomically, enabling instant rollback.
96. **Canary Release** — roll a new version out to a small slice of traffic first, watching for errors before a full rollout.
97. **Read/Write Splitting** — route read queries to replicas and writes to the primary, scaling read-heavy workloads horizontally.
98. **Multi-Tenancy Pattern** — a deliberate, named strategy (shared schema with `tenant_id`, schema-per-tenant, or database-per-tenant) for isolating each customer's data.
99. **Stateless Service Design** — services keep no in-memory session state, so any instance can serve any request — the property that makes horizontal scaling trivial.
100. **Test Data Builder / In-Memory Fake Repository** — reusable builders and in-memory repository fakes (built against the same `IRepository` interface as production) that make unit tests fast and independent of a real database.

---

### How to apply this during a refactor

A practical checklist, mapping directly to the two pains you described:

- **"Files are 2,000–4,000 lines"** → split by *Vertical Slice / Package by Feature* (#16, #71), pull data access out via *Repository* (#31), pull object construction out via *Factory* (#41), pull transformation out via *Mapper* (#44), wrap multi-step writes in a *Unit of Work* (#32). Migrate incrementally with the *Strangler Fig Pattern* (#91), not a rewrite.
- **"Mobile and web-admin do the same thing but hit different endpoints"** → introduce a *Transport-Agnostic Service Layer* (#85) once, then put a thin *BFF* or thin per-client controller (#20/#81) in front of it, sharing a *Canonical Data Model* (#82) and a *Shared DTO/Contract Package* (#84) so both clients are guaranteed to stay in sync.
# NestJS + Drizzle ORM — Base Module & Folder Structure Catalog

**Purpose:** a concrete "base module" reference for applying the paradigms in `backend-architecture-paradigm-catalog.md` to a **NestJS + Drizzle** codebase. Every "base X" building block below exists once, in `common/`, and every feature module extends or implements it instead of reinventing it — this is what keeps a feature module small and a new module "plug-and-call."

---

## 1. Top-Level Project Layout

```
src/
  main.ts
  app.module.ts

  config/                    # env loading + validation (Zod/Joi), one config per concern
    app.config.ts
    database.config.ts
    redis.config.ts
    config.module.ts

  database/
    drizzle.module.ts        # provides the DB client under a DATABASE_CONNECTION token
    schema/
      index.ts               # barrel: SSOT for drizzle-kit migrations
      <feature>.schema.ts    # one schema file per feature, re-exported from index.ts
    migrations/               # drizzle-kit generated SQL, never hand-edited
    seeders/

  common/                     # a.k.a. "core" or "shared" — the base-module catalog (§2)

  modules/
    <feature>/                # one folder per bounded context / feature (§4)

  shared-kernel/              # OPTIONAL — only needed if you go full BFF split (§6, Option B)
```

If the "same behavior, different endpoint" problem is large enough to need separate deployables (not just separate controllers), promote this to a monorepo:

```
apps/
  api-core/          # domain services — no HTTP awareness beyond hosting them
  bff-mobile/        # thin, mobile-specific controllers calling api-core's services
  bff-web-admin/     # thin, web-admin-specific controllers calling the same services
packages/
  shared-contracts/  # DTOs / Zod schemas shared by api-core + both BFFs + generated clients
  shared-utils/
```

---

## 2. `common/` — Base Building Block Catalog

| Base building block | File | Purpose |
|---|---|---|
| `BaseSchema` columns | `common/database/base.schema.ts` | Shared columns (`id`, `createdAt`, `updatedAt`, `deletedAt`) mixed into every Drizzle table definition. |
| `IRepository<T>` | `common/interfaces/repository.interface.ts` | Port that lets services depend on an abstraction, never on Drizzle directly (Repository Pattern). |
| `BaseRepository<T>` | `common/repositories/base.repository.ts` | Generic CRUD implemented once against Drizzle; every feature repository extends it and adds only its custom queries. |
| `BaseService<T>` | `common/services/base.service.ts` | Generic application-layer CRUD orchestration (calls repository + mapper), transport-agnostic. |
| `BaseController` | `common/controllers/base.controller.ts` | Optional generic REST CRUD controller for simple resources that don't need custom behavior. |
| `BaseQueryDto`, `PaginationQueryDto`, `BaseResponseDto` | `common/dto/` | Shared request/response shapes: paging, sorting, filtering, and the standard response envelope. |
| `IMapper<TEntity, TDto>` + `BaseMapper` | `common/mappers/` | One contract every entity↔DTO transformer implements. |
| `BaseFactory<T>` | `common/factories/` | Contract for constructing aggregates/entities with their invariants enforced in one place. |
| `BaseSpecification` | `common/specifications/` | Reusable, combinable query predicates (Specification Pattern), instead of ad-hoc `where` clauses in services. |
| `BaseException` + `GlobalExceptionFilter` | `common/exceptions/` | A domain exception hierarchy plus one filter that turns any thrown exception into a consistent error envelope. |
| Injection tokens & constants | `common/constants/` | `DATABASE_CONNECTION`, `LOGGER`, `CACHE_MANAGER`, error codes, shared enums. |
| Decorators | `common/decorators/` | `@CurrentUser()`, `@Public()`, `@Roles()`. |
| Guards | `common/guards/` | `JwtAuthGuard`, `RolesGuard` / `PolicyGuard` (CASL-based). |
| Interceptors | `common/interceptors/` | `ResponseTransformInterceptor` (wraps every response in the envelope), `LoggingInterceptor`, `TimeoutInterceptor`. |
| Pipes | `common/pipes/` | `ZodValidationPipe` — pairs naturally with `drizzle-zod` (§5). |
| Test utilities | `common/testing/` | `TestModuleBuilder`, `InMemoryRepository<T>` fake, `TestDataBuilder` — all built against `IRepository<T>`, so tests never touch a real DB. |

---

## 3. Unit of Work & Transactions (Drizzle-specific)

Drizzle's `db.transaction(cb)` gives you a scoped transaction client, but callers still need a clean way to run *one business operation that touches several repositories* atomically, without threading a `tx` parameter through every method signature. The standard base set:

| Piece | File | Purpose |
|---|---|---|
| `IUnitOfWork` | `common/unit-of-work/unit-of-work.interface.ts` | `startTransaction()`, `commit()`, `rollback()`, `getRepository<T>()`. |
| `DrizzleUnitOfWork` | `common/unit-of-work/drizzle-unit-of-work.service.ts` | Implements the above using `db.transaction()`, handing every repository the transactional client instead of the pooled one. |
| `TransactionContext` | `common/unit-of-work/transaction-context.ts` | An `AsyncLocalStorage` holder for "the current transaction client, if any" — this is what lets `BaseRepository` automatically pick up an active transaction without an explicit parameter. |
| `@Transactional()` | `common/unit-of-work/transactional.decorator.ts` | A method decorator for services: wraps the method body in `db.transaction()`, sets `TransactionContext`, commits on success, rolls back on any thrown exception. |

Conceptually, a service method becomes:

```ts
@Transactional()
async placeOrder(dto: CreateOrderDto) {
  const order = this.orderFactory.create(dto);       // Factory
  await this.orderRepository.save(order);             // uses tx from AsyncLocalStorage
  await this.inventoryRepository.reserve(dto.items);   // same tx, same context
  this.eventBus.publish(new OrderPlacedEvent(order));  // Outbox pattern, same tx
}
```

Nothing here mentions HTTP — this method could be called from a REST controller, a queue consumer, or a cron job unchanged, which is the "transport-agnostic" property from the paradigm catalog (#85).

---

## 4. Per-Feature Module Catalog — `modules/<feature>/`

```
modules/<feature>/
  <feature>.module.ts
  controllers/
    <feature>.controller.ts        # or split per client, see §6
  services/
    <feature>.service.ts            # extends BaseService<T>; all business rules live here
  repositories/
    <feature>.repository.ts         # extends BaseRepository<T>, implements I<Feature>Repository
    <feature>.repository.interface.ts
  dto/
    create-<feature>.dto.ts
    update-<feature>.dto.ts
    query-<feature>.dto.ts           # extends BaseQueryDto
    response/<feature>.response.dto.ts
  mappers/
    <feature>.mapper.ts               # implements IMapper<Entity, Dto>
  factories/
    <feature>.factory.ts
  events/
    <feature>-created.event.ts
  exceptions/
    <feature>-not-found.exception.ts  # extends BaseException
  constants/
    <feature>.constants.ts
  interfaces/
    <feature>.interface.ts
  tests/
    <feature>.service.spec.ts          # uses InMemoryRepository fake, no real DB
    <feature>.repository.spec.ts
  index.ts                              # barrel export — this feature's public surface only
```

Every file in this list maps directly back to a named paradigm: `service` → Transport-Agnostic Service Layer, `repository` → Repository Pattern, `mapper` → Mapper Pattern, `factory` → Factory Pattern, `dto` → DTO, `exceptions` → Custom Exception Hierarchy. A new engineer (or an AI) can regenerate this skeleton for any new feature mechanically.

---

## 5. Config, Database & Cross-Cutting Infrastructure

- **`ConfigModule`** — loads `.env`, validates it against a Zod/Joi schema at boot, and fails fast if anything required is missing, instead of failing at runtime deep inside a request.
- **`DrizzleModule`** — the *only* place that constructs the DB client, exposed elsewhere purely via the `DATABASE_CONNECTION` token (Dependency Injection).
- **`schema/index.ts`** — the single barrel that `drizzle-kit` reads to generate migrations; this file is the literal SSOT for your data model.
- **`drizzle-zod`** — generate Zod validation schemas directly from the Drizzle table definitions, so the DB schema and the DTO validation rules can never silently drift apart (another concrete SSOT application).
- **`LoggerModule`** — a thin wrapper behind an `ILogger` port, so the actual logging library (Pino, Winston, …) can be swapped without touching a single call site.
- **`CacheModule`** — same idea, behind an `ICache` port; Redis today, something else later, zero call-site changes.
- **`HealthModule`** — Terminus-based `/health` checks for the DB and cache, so infrastructure can detect a bad deploy automatically.

---

## 6. Solving "Same Behavior, Different Endpoint" (Mobile vs. Web-Admin)

Two options, in increasing order of scale:

**Option A — one deployable (recommended to start):**
Keep one NestJS app. Each feature module gets *two thin controllers* that both inject the exact same `<Feature>Service`:

```
modules/<feature>/controllers/
  <feature>.mobile.controller.ts   # @Controller('mobile/<feature>')
  <feature>.web.controller.ts      # @Controller('admin/<feature>')
```

The controllers differ only in route path, response shape (via the shared mapper/DTO), and which `PolicyGuard` rules apply — never in business logic. This alone removes the duplication you described, with no infrastructure change.

**Option B — full BFF split (once mobile and web-admin genuinely need independent scaling/deploys):**
Promote to the monorepo layout in §1: `apps/api-core` owns the services, `apps/bff-mobile` and `apps/bff-web-admin` are thin HTTP layers over it, and `packages/shared-contracts` guarantees both clients consume the exact same request/response shapes (Contract-First Design + Canonical Data Model, see the companion paradigm catalog, #82–84).

Start with Option A. Only move to Option B when you have an actual scaling or deployment reason to — this is YAGNI (#4) applied to your own infrastructure.

---

## 7. Import Path Discipline & Path Aliases

### No Deep Relative Imports / Use Path Aliases
Never use deep relative import chains such as `../../../..`. Use project-defined absolute path aliases such as `@database`, `@modules`, `@common`, or `@/` to keep imports stable, readable, and independent from file depth.

- `./something`     ✅ same/local folder
- `../something`    ✅ one level, acceptable within same feature boundary
- `../../something` ❌ prohibited (use path alias e.g. @modules, @common, @database)
- `../../../...`    ❌ prohibited (use path alias)

Configured path aliases in `tsconfig.json` and Jest `moduleNameMapper`:
- `@/*` → `src/*`
- `@database/*` → `src/database/*`
- `@modules/*` → `src/modules/*`
- `@common/*` → `src/common/*`

non negotiable logger pardigm
# NestJS Global API Observability with Pino

You are working inside an existing NestJS backend.

Your task is to implement a **professional, centralized, global HTTP API observability layer using Pino**.

The objective is extremely specific:

> Every HTTP request entering this NestJS application must be observable automatically, without requiring individual controllers, routes, services, repositories, or modules to manually add logging.

This observability system must provide a complete and transparent view of the HTTP boundary of the backend.

The developer must be able to open the terminal and immediately understand:

```text
Who called the API
→ from what client/device
→ which endpoint was called
→ using which HTTP method
→ with what headers/query/params/body
→ when it arrived
→ what happened inside the HTTP lifecycle
→ what status code was produced
→ what response was returned
→ how long it took
→ whether an exception occurred
→ which request and response belong together
```

This task concerns **API observability only**.

Do not turn this into application-wide business-event logging unless the existing architecture already requires it.

---

# 1. Non-Negotiable Requirement

Observability must cover **100% of HTTP endpoints registered in NestJS**.

That includes:

```text
GET
POST
PUT
PATCH
DELETE
OPTIONS
HEAD
```

and any other HTTP method supported by the application.

It must cover:

```text
existing endpoints
future endpoints
public endpoints
authenticated endpoints
admin endpoints
mobile API endpoints
web client API endpoints
internal HTTP endpoints
health endpoints
upload endpoints
download endpoints
authentication endpoints
```

unless an endpoint is explicitly excluded for a documented technical reason.

Do NOT implement observability endpoint by endpoint.

Do NOT add:

```ts
logger.info(...)
```

manually inside every controller method.

That approach is forbidden.

The implementation must live at the **global HTTP infrastructure boundary**.

Conceptually:

```text
Client
   ↓
NestJS HTTP Adapter
   ↓
GLOBAL HTTP OBSERVABILITY
   ↓
Guards / Pipes / Interceptors / Controllers
   ↓
Services
   ↓
Response
   ↓
GLOBAL HTTP OBSERVABILITY
   ↓
Client
```

Every HTTP request must pass through the observability system automatically.

---

# 2. First Phase Is Strictly READ-ONLY

Before changing anything, inspect the existing backend.

Do not immediately install Pino.

Do not immediately create middleware.

Do not assume Express.

Do not assume Fastify.

Do not assume there is no existing logger.

Inspect:

```text
package.json
main.ts
app.module.ts
Nest bootstrap process
HTTP adapter
global middleware
global interceptors
global exception filters
guards
authentication
request context implementation
existing logger configuration
existing Pino/Winston usage
environment configuration
Docker setup
existing observability utilities
request ID implementation
proxy configuration
```

Determine:

```text
NestJS version
Express or Fastify
current logging mechanism
current dependency injection conventions
current module ownership
whether nestjs-pino already exists
whether pino-http already exists
whether request IDs already exist
whether correlation IDs already exist
whether authentication adds user information to request
whether device/client metadata already exists
whether reverse proxy headers are trusted
```

Do not create duplicated infrastructure.

---

# 3. Report Before Implementation

After inspection, produce a short architecture report:

```text
CURRENT STATE

NestJS HTTP adapter:
Current logger:
Existing HTTP middleware:
Existing interceptors:
Existing exception filters:
Existing request/correlation ID:
Existing authentication context:
Existing device/client metadata:
Existing sensitive-data policy:
Existing environment configuration:

Recommended integration point:
Files to modify:
Files to create:
Dependencies required:
Dependencies already available:
Potential conflicts:
```

Only after understanding the existing architecture should implementation begin.

---

# 4. Preferred Logging Stack

Prefer:

```text
nestjs-pino
pino
pino-http
pino-pretty
```

where appropriate.

Do not install redundant packages if `nestjs-pino` already provides what is required.

`pino-pretty` must be considered a **development terminal transport**, not the canonical logging model.

The canonical log representation must remain structured JSON.

Conceptually:

```text
NestJS
   ↓
nestjs-pino / pino-http
   ↓
Structured JSON events
   ↓
Development
   └── pino-pretty
```

Future production sinks may consume the same structured output.

Do not design logs around pretty terminal strings as the source of truth.

---

# 5. Centralized Architecture

The desired architecture is approximately:

```text
                     ┌─────────────────┐
                     │ Mobile / Web    │
                     │ API Client      │
                     └────────┬────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ NestJS HTTP      │
                    │ Adapter          │
                    └────────┬─────────┘
                             │
                             ▼
                ┌──────────────────────────┐
                │ Global HTTP Observability│
                │ Pino / nestjs-pino       │
                └─────────────┬────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
      Guards                Pipes             Controllers
                                                    │
                                                    ▼
                                                 Service
                                                    │
                                                    ▼
                                                Repository
                                                    │
                                                    ▼
                                                Database
                                                    │
                                                    ▼
                                              HTTP Response
                                                    │
                                                    ▼
                ┌──────────────────────────┐
                │ Global HTTP Observability│
                │ response / error         │
                └─────────────┬────────────┘
                              │
                              ▼
                           Client
```

No controller should have to opt into generic HTTP observability.

---

# 6. Request Correlation

Every incoming request must have a unique identifier.

Use an existing correlation/request ID mechanism if the application already has one.

Otherwise establish one centrally.

Preferred concepts:

```text
requestId
correlationId
```

If the client sends a trusted supported identifier such as:

```text
X-Request-ID
X-Correlation-ID
```

inspect the existing contract before deciding whether to reuse it.

Do not blindly trust arbitrary client-provided identifiers.

Every log belonging to the same HTTP transaction must share the same request ID.

Example:

```text
REQ 7ca819
→ incoming request
→ authentication
→ response
```

The request and response must never appear as unrelated logs.

---

# 7. Incoming Request Observability

For every request, capture as much of the following as safely and technically possible:

```text
requestId
timestamp
HTTP method
protocol
hostname
resolved URL
base URL if applicable
route
path
path parameters
query parameters
request headers
content type
content length
request body
remote IP
forwarded IP when trusted
user agent
referrer if available
origin
accept header
accept-language
client metadata
device metadata
authenticated user identifier when available
authentication state
API version if applicable
```

Do not fabricate information.

If a value cannot be determined reliably, omit it.

---

# 8. Client and Device Identification

The developer specifically wants to understand which client/device is calling the backend.

Capture reliable metadata available from the request.

At minimum inspect:

```text
User-Agent
X-Forwarded-For
X-Real-IP
Origin
Referer
Host
Accept
Accept-Language
Content-Type
```

If the application already defines custom client headers such as:

```text
X-Client-Type
X-Client-Version
X-App-Version
X-Platform
X-Device-ID
X-Device-Model
X-OS-Version
```

capture them.

However:

DO NOT invent custom client metadata that clients do not currently send.

If mobile-device visibility is required but the Flutter application currently sends insufficient metadata, report exactly which headers are missing.

For example:

```text
Current backend cannot reliably determine:
- exact device model
- app build number
- operating system version

Recommended client headers:
- X-Client-Type
- X-App-Version
- X-App-Build
- X-Platform
- X-OS-Version
- X-Device-Model
```

Do not silently fake these values.

---

# 9. Trusted Proxy Awareness

If NestJS runs behind:

```text
Nginx
Caddy
Traefik
Cloudflare
Docker reverse proxy
load balancer
```

determine whether proxy trust is correctly configured.

Do NOT blindly treat:

```text
X-Forwarded-For
```

as trustworthy.

Correct IP observability depends on trusted proxy configuration.

Document the behavior.

The logs should make clear whether an IP represents:

```text
direct socket IP
trusted forwarded client IP
proxy IP
```

when relevant.

---

# 10. Request Body

Log JSON-compatible incoming request bodies during development.

Example:

```json
{
  "email": "example@example.com",
  "name": "John"
}
```

But request-body logging must pass through a sanitizer first.

Never expose credentials merely for the sake of "complete observability."

---

# 11. Path Parameters

Capture route parameters.

Example:

```text
GET /users/:id
```

should expose something structurally equivalent to:

```json
{
  "params": {
    "id": "a81c..."
  }
}
```

---

# 12. Query Parameters

Capture query parameters.

Example:

```text
GET /appointments?doctorId=123&date=2026-09-25
```

should expose:

```json
{
  "query": {
    "doctorId": "123",
    "date": "2026-09-25"
  }
}
```

---

# 13. Headers

Headers should be observable, but they MUST pass through centralized redaction.

Do not dump headers blindly.

Useful examples:

```text
content-type
accept
user-agent
origin
referer
accept-language
content-length
x-client-type
x-app-version
x-platform
```

Sensitive values must be sanitized.

---

# 14. Response Observability

For every outgoing HTTP response, capture:

```text
requestId
timestamp
HTTP method
URL/path
resolved route
status code
response headers when useful
response content type
response body
duration
response size if practical
authenticated user ID if available
client metadata if available
```

The developer must be able to correlate:

```text
incoming request
↓
outgoing response
```

through the same request ID.

---

# 15. Response Body Capture

The requirement is to expose API input/output transparently during development.

Therefore, response payloads should be observable.

However, implement this carefully.

Do NOT globally monkey-patch framework internals in fragile ways if NestJS interceptors can handle response observation safely.

Prefer standard NestJS mechanisms.

The logging layer must never mutate response content.

The response sent to the client must remain semantically identical.

---

# 16. Error Observability

Every HTTP exception must be visible.

Capture:

```text
requestId
timestamp
HTTP method
path
route
status code
exception name
exception type
exception message
response payload if available
stack trace according to environment policy
duration
client metadata
authenticated user context if available
```

Examples include:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
```

Do not only log successful requests.

Failed requests are often the most important part of observability.

---

# 17. Exceptions Must Preserve Existing Behavior

Logging must be passive.

Do NOT:

```text
swallow exceptions
replace exception payloads
convert exceptions into 200 responses
modify domain errors
change validation error structures
change existing exception filters unintentionally
```

Observe.

Do not interfere.

---

# 18. Request Duration

Measure complete HTTP request duration.

Output something such as:

```text
durationMs: 87
```

The measurement must be tied to the request lifecycle.

Avoid manually placing timestamps in controllers.

The duration calculation belongs to global HTTP infrastructure.

---

# 19. Structured Logging

Logs must remain machine-readable.

Preferred conceptual event shape:

```json
{
  "event": "http.request",
  "requestId": "req_123",
  "method": "POST",
  "path": "/api/v1/appointments",
  "client": {},
  "request": {},
  "timestamp": "..."
}
```

and:

```json
{
  "event": "http.response",
  "requestId": "req_123",
  "statusCode": 201,
  "durationMs": 93,
  "response": {},
  "timestamp": "..."
}
```

and:

```json
{
  "event": "http.error",
  "requestId": "req_123",
  "statusCode": 422,
  "durationMs": 46,
  "error": {},
  "timestamp": "..."
}
```

Do not encode all metadata into one giant human-readable string.

---

# 20. Stable Event Taxonomy

Use stable event names.

Recommended:

```text
http.request
http.response
http.error
```

Optionally:

```text
http.cancelled
http.aborted
```

only if these states can actually be detected.

Do not invent events that the system cannot reliably distinguish.

---

# 21. Terminal Developer Experience

In development, use `pino-pretty` or an equivalent Pino transport to make output readable.

Example conceptual terminal output:

```text
12:33:21 INFO  http.request

requestId    req_781f
method       POST
path         /api/v1/appointments
client       flutter/android
device       Pixel 7 Pro
appVersion   1.4.2
ip           192.168.1.20

params
{}

query
{}

body
{
  "doctorId": "dc_32",
  "scheduleId": "sc_71",
  "date": "2026-09-25"
}
```

Response:

```text
12:33:21 INFO  http.response

requestId    req_781f
method       POST
path         /api/v1/appointments
status       201
duration     87ms

response
{
  "success": true,
  "data": {
    "appointmentId": "ap_9921"
  }
}
```

Error:

```text
12:34:02 ERROR http.error

requestId    req_a392
method       POST
path         /api/v1/appointments
status       422
duration     44ms

response
{
  "message": "Schedule is unavailable",
  "statusCode": 422
}
```

These examples describe the intended developer experience.

Do not hardcode a custom pretty printer if Pino's ecosystem already handles it cleanly.

---

# 22. Security Is Mandatory

"Transparent" does NOT mean "leak credentials."

Never emit raw values for:

```text
Authorization
Proxy-Authorization
Cookie
Set-Cookie
access token
refresh token
JWT
API key
password
password confirmation
PIN
OTP
secret
client secret
private key
session identifier
CSRF token
```

Sensitive information must be redacted centrally.

Example:

```json
{
  "authorization": "[REDACTED]",
  "password": "[REDACTED]"
}
```

Do not depend on individual developers remembering to sanitize their endpoints.

---

# 23. Recursive Redaction

Sensitive fields may be deeply nested.

Example incoming payload:

```json
{
  "profile": {
    "email": "user@example.com"
  },
  "authentication": {
    "password": "secret",
    "otp": "123456"
  }
}
```

Expected observability:

```json
{
  "profile": {
    "email": "user@example.com"
  },
  "authentication": {
    "password": "[REDACTED]",
    "otp": "[REDACTED]"
  }
}
```

Use Pino's native redaction capability wherever appropriate.

Avoid unnecessary custom reinvention.

If custom sanitization is required for request/response bodies, centralize it.

---

# 24. File Uploads and Multipart Requests

Do not log raw binary data.

For multipart uploads, log metadata instead.

Example:

```json
{
  "field": "avatar",
  "filename": "avatar.jpg",
  "mimeType": "image/jpeg",
  "size": 382911
}
```

Never dump:

```text
Buffer(...)
base64 image
binary byte arrays
```

into terminal logs.

---

# 25. Downloads / Binary Responses

Do not print binary response bodies.

Instead log metadata:

```text
contentType
contentLength
filename if known
statusCode
duration
```

Mark body as:

```text
[BINARY_BODY_OMITTED]
```

or equivalent structured metadata.

---

# 26. Large JSON Responses

Prevent observability from destroying terminal usability.

Introduce controlled truncation if required.

If truncation occurs, make it explicit.

Example:

```json
{
  "_truncated": true,
  "_originalSize": 182901,
  "_loggedSize": 20000
}
```

Do NOT silently truncate.

Configuration should allow verbose local debugging if a developer explicitly needs complete output.

---

# 27. Health Check Noise

Health endpoints may generate enormous repetitive traffic.

Examples:

```text
/health
/healthz
/readiness
/liveness
```

Do not silently exclude them.

Default requirement remains:

> every endpoint is observable.

If noise reduction is desirable, implement configurable log levels or filtering.

For example:

```text
health request → debug
normal request → info
error → error
```

The traffic remains observable.

It is merely classified appropriately.

---

# 28. Logging Level Strategy

Recommended semantics:

```text
trace
very low-level transport diagnostics

debug
development HTTP details

info
successful API transaction summaries

warn
unexpected but recoverable HTTP behavior

error
failed API transaction / server exception

fatal
process-level failure
```

Do not log everything as `error`.

Do not log everything as `info`.

---

# 29. Authentication Context

After authentication has resolved a user, include a safe identifier where possible.

For example:

```text
userId
staffId
doctorId
role
```

ONLY if already available from the authenticated request context.

Do not serialize the entire user entity.

BAD:

```json
{
  "user": {
    "passwordHash": "...",
    "refreshToken": "...",
    "...": "..."
  }
}
```

GOOD:

```json
{
  "auth": {
    "userId": "usr_123",
    "role": "DOCTOR"
  }
}
```

Do not expose authentication secrets.

---

# 30. Anonymous Requests

Anonymous requests must remain observable.

Example:

```json
{
  "auth": {
    "authenticated": false
  }
}
```

Do not assume every endpoint has a user context.

---

# 31. Client Metadata Model

Prefer one stable structured area.

Conceptually:

```json
{
  "client": {
    "type": "mobile",
    "platform": "android",
    "appVersion": "1.4.2",
    "buildNumber": "104",
    "deviceModel": "Pixel 7 Pro",
    "osVersion": "Android 16",
    "userAgent": "..."
  }
}
```

But populate ONLY fields actually provided or reliably derivable.

Do not fake metadata.

---

# 32. HTTP Context Model

A useful conceptual structure is:

```json
{
  "http": {
    "method": "POST",
    "path": "/api/v1/appointments",
    "route": "/api/v1/appointments",
    "statusCode": 201,
    "durationMs": 94
  }
}
```

This creates stable searchable log semantics later.

---

# 33. One Request, One Observable Lifecycle

Avoid uncontrolled log spam.

The minimum useful lifecycle is:

```text
http.request
http.response
```

or:

```text
http.request
http.error
```

Both events must share:

```text
requestId
```

Do not generate ten meaningless generic messages per request.

Additional logs must add actual diagnostic value.

---

# 34. Global Coverage Verification

After implementation, enumerate all registered NestJS routes.

Verify that every route travels through the observability pipeline.

Do NOT simply assume global coverage.

If practical, inspect Nest route registration or run integration verification.

Test representative modules.

---

# 35. Required Verification Matrix

Verify at minimum:

```text
GET success
GET with query
GET with route params

POST JSON success
POST validation error
POST unauthorized
POST forbidden

PATCH
PUT
DELETE

404 unknown endpoint
409 conflict if applicable
422 validation/domain failure if applicable
500 server exception

multipart upload
binary/download endpoint if present
anonymous endpoint
authenticated endpoint
admin endpoint
mobile-client endpoint
web-client endpoint
```

For each verify:

```text
request logged
requestId present
method correct
path correct
client metadata present where available
query correct
params correct
body correct
sensitive fields redacted
status correct
response logged
duration present
error present when applicable
```

---

# 36. Do Not Pollute Controllers

Forbidden:

```ts
@Controller('appointments')
export class AppointmentController {
  @Post()
  async create() {
    this.logger.log('POST /appointments');
  }
}
```

Generic HTTP observability does not belong here.

Controllers should focus on HTTP orchestration and application behavior.

Global transport observability belongs in infrastructure.

---

# 37. Do Not Pollute Services

Forbidden:

```ts
async createAppointment(dto) {
  this.logger.log(dto);
  ...
}
```

unless the message represents an intentional business event.

HTTP request logging is not service responsibility.

---

# 38. Do Not Pollute Repositories

Repositories must not log:

```text
incoming endpoint
request headers
response body
client device
HTTP status
```

Those concepts do not belong to persistence infrastructure.

---

# 39. Respect NestJS Lifecycle

Before implementation, understand where:

```text
middleware
guards
interceptors
pipes
exception filters
controllers
```

run in NestJS.

Choose integration points intentionally.

Do not randomly place one giant middleware and assume it sees every finalized value.

For example:

- authentication information may not exist at the earliest middleware stage;
- route metadata may not yet be resolved;
- response payload observation is often more naturally handled by an interceptor;
- uncaught exceptions may require integration with exception handling.

Use the correct Nest lifecycle components.

---

# 40. Do Not Create a 2,000-Line Logger

Separate concerns.

Conceptual responsibilities may include:

```text
HTTP logger configuration
request serializer
response serializer
client metadata extractor
request context / correlation ID
sensitive-data redaction
Pino configuration
development pretty transport
```

Do not merge everything into one giant class.

Keep abstractions proportional.

Avoid architecture ceremony with dozens of empty interfaces.

---

# 41. Suggested Ownership

First respect existing architecture.

If no observability namespace exists, a structure similar to this is acceptable:

```text
src/
└── infrastructure/
    └── observability/
        ├── observability.module.ts
        ├── pino.config.ts
        ├── http/
        │   ├── http-context.ts
        │   ├── client-metadata.extractor.ts
        │   ├── request-context.middleware.ts
        │   ├── http-logging.interceptor.ts
        │   └── http-log.serializer.ts
        └── security/
            └── log-redaction.config.ts
```

OR:

```text
src/
└── common/
    └── logging/
```

if that matches the current codebase.

Do not impose this exact tree blindly.

Architecture coherence matters more than folder aesthetics.

---

# 42. Composition Root

Pino must be configured where application-wide infrastructure is composed.

Examples:

```text
AppModule
LoggingModule
ObservabilityModule
bootstrap
```

depending on architecture.

There must be one clear source of truth.

Do not instantiate random Pino instances throughout the codebase.

---

# 43. Dependency Injection

If custom components need Pino, inject them through Nest.

Do not repeatedly call:

```ts
pino()
```

inside unrelated classes.

Maintain lifecycle and configuration ownership.

---

# 44. Environment Policy

Development should provide rich terminal observability.

Conceptually:

```text
development
→ structured Pino
→ pino-pretty
→ request/response payload visibility
```

Production should remain structured and security-conscious.

Do not automatically assume response-body logging is appropriate for production.

Create centrally controlled configuration.

Example concepts:

```text
HTTP_LOGGING_ENABLED
HTTP_LOG_REQUEST_BODY
HTTP_LOG_RESPONSE_BODY
HTTP_LOG_HEADERS
HTTP_LOG_LEVEL
HTTP_LOG_MAX_BODY_LENGTH
```

Only introduce environment variables that are genuinely useful.

Do not create twenty toggles without justification.

---

# 45. No Silent Environment Fallbacks

Inspect `.env.example`, config schemas, and environment validation.

If new environment variables are required:

1. declare them;
2. validate them;
3. document them;
4. add them to the environment example;
5. explain expected values.

Do not silently fallback to arbitrary values that hide configuration mistakes.

---

# 46. JSON First, Pretty Second

Architecture:

```text
HTTP request
      ↓
Structured log object
      ↓
Pino
      ↓
JSON
      ↓
pino-pretty in development
```

NOT:

```text
HTTP request
      ↓
custom ASCII string
      ↓
console.log
```

---

# 47. No Console Logging

After migration, generic server HTTP logs must not rely on:

```ts
console.log()
console.error()
console.warn()
```

Use the centralized logger.

Do not necessarily delete legitimate existing console usage outside scope without first understanding it.

---

# 48. Preserve Backend Semantics

Observability must NOT alter:

```text
API contracts
DTO behavior
status codes
validation
serialization
authentication
authorization
database behavior
controller behavior
error contracts
response envelopes
```

This task observes the backend.

It does not redesign backend contracts.

---

# 49. Performance Safety

The observability system must avoid unreasonable overhead.

Pay attention to:

```text
large JSON serialization
deep cloning
buffers
streams
uploads
downloads
huge arrays
circular objects
```

If serialization fails, logging must degrade gracefully.

Logging failure must never cause an API request itself to fail.

This is critical.

---

# 50. Circular Structures

Never blindly serialize entire:

```text
Request
Response
Socket
User entity
Error object
```

objects.

These often contain circular references or sensitive internals.

Extract explicitly required fields.

Use Pino serializers where appropriate.

---

# 51. Operational Safety

The observability infrastructure must not:

```text
throw because logging failed
block responses
consume streams incorrectly
break multipart parsing
consume response streams twice
expose secret tokens
duplicate endpoint execution
mutate request DTOs
mutate response DTOs
```

---

# 52. Desired Development Output

At the end, when I run:

```bash
npm run start:dev
```

or the project's equivalent command, I want terminal traffic to be immediately understandable.

Example:

```text
12:51:14 INFO  HTTP REQUEST

requestId:   req_e938af
method:      POST
endpoint:    /api/v1/auth/login
client:      mobile
platform:    android
appVersion:  1.2.0
device:      Pixel 7 Pro
ip:          192.168.1.40

headers:
{
  "content-type": "application/json",
  "authorization": "[REDACTED]"
}

params:
{}

query:
{}

body:
{
  "email": "user@example.com",
  "password": "[REDACTED]"
}
```

Then:

```text
12:51:14 INFO  HTTP RESPONSE

requestId:   req_e938af
method:      POST
endpoint:    /api/v1/auth/login
status:      200
duration:    126ms

response:
{
  "success": true,
  "data": {
    "accessToken": "[REDACTED]",
    "refreshToken": "[REDACTED]"
  }
}
```

Or:

```text
12:53:01 ERROR HTTP ERROR

requestId:   req_a03be1
method:      POST
endpoint:    /api/v1/appointments
status:      409
duration:    39ms

request:
{
  "scheduleId": "sch_12"
}

response:
{
  "statusCode": 409,
  "message": "Schedule already occupied"
}
```

No emojis.

No decorative noise.

No meaningless banners.

Clean, structured, professional terminal observability.

---

# 53. Definition of "100% Transparent"

For this task, "100% transparent API observability" means:

For every HTTP transaction, where technically available and safe, I can inspect:

```text
WHEN
timestamp

IDENTITY
requestId

SOURCE
IP
client
platform
device
application version
user agent

TARGET
method
URL
route
params
query

INPUT
headers
body

AUTH CONTEXT
authenticated / anonymous
safe actor identifier
role

OUTPUT
status code
response headers where relevant
response body

PERFORMANCE
duration

FAILURE
exception
error type
status
message
stack according to environment policy
```

It does NOT mean:

```text
logging passwords
logging tokens
logging raw cookies
logging raw files
logging binary buffers
logging secrets
logging unbounded gigantic payloads
```

Professional observability includes security boundaries.

---

# 54. Acceptance Criteria

The implementation is complete only if all of the following are true:

- Pino is centrally configured.
- Pretty terminal output works in development.
- Every NestJS HTTP endpoint is covered globally.
- Existing endpoints require zero manual modification for generic observability.
- Future endpoints automatically inherit observability.
- Every request receives or resolves a request ID.
- Request and response/error logs can be correlated.
- HTTP method is visible.
- endpoint/path is visible.
- route params are visible.
- query parameters are visible.
- request body is visible where permitted.
- response status is visible.
- response body is visible where permitted.
- request duration is visible.
- errors are visible.
- authenticated actor metadata is visible when available.
- client metadata is visible when available.
- device metadata is visible when actually provided.
- IP handling respects proxy trust.
- secrets are centrally redacted.
- tokens are never dumped.
- passwords are never dumped.
- cookies are never dumped raw.
- multipart files are not dumped.
- binary responses are not dumped.
- logging failure cannot break HTTP execution.
- application response semantics remain unchanged.
- no controller-specific generic HTTP logging is required.
- no service-specific generic HTTP logging is required.
- no duplicate Pino configuration exists.
- no unnecessary package or abstraction was introduced.
- representative endpoints have been verified.

---

# 55. Final Deliverable

After implementation, provide a concise final report containing:

```text
IMPLEMENTED

Packages:
Files created:
Files modified:

GLOBAL INTEGRATION

Where Pino is initialized:
Where HTTP observation occurs:
Where request IDs are generated:
Where redaction is configured:
Where client/device metadata is extracted:

COVERAGE

Registered endpoints tested:
Successful request tested:
Validation failure tested:
Authentication failure tested:
Server error tested:
Multipart tested:
404 tested:

SECURITY

Redacted fields:
Binary handling:
Production behavior:

CLIENT METADATA

Metadata currently detectable:
Metadata unavailable:
Headers the Flutter/Web clients would need to send for richer visibility:

EXAMPLE OUTPUT

Provide one real sanitized request log.
Provide one real sanitized response log.
Provide one real sanitized error log.
```

Do not merely say:

```text
"Logging has been implemented successfully."
```

Prove it.

---

# 56. Core Engineering Principle

The final architecture should satisfy this statement:

> HTTP observability is an infrastructure capability of the backend, not a responsibility of individual endpoints.

A developer creating this tomorrow:

```ts
@Get('/something-new')
```

must automatically receive the same observability without writing additional logging code.

The final data flow should effectively become:

```text
Flutter / Web / API Client
          │
          ▼
      HTTP REQUEST
          │
          ▼
┌──────────────────────────┐
│ Global Pino Observability│
│                          │
│ requestId                │
│ client                   │
│ device                   │
│ IP                       │
│ method                   │
│ endpoint                 │
│ headers                  │
│ params                   │
│ query                    │
│ body                     │
└────────────┬─────────────┘
             │
             ▼
          NestJS
             │
             ▼
        Application
             │
             ▼
          Result
             │
             ▼
┌──────────────────────────┐
│ Global Pino Observability│
│                          │
│ requestId                │
│ statusCode               │
│ response                 │
│ duration                 │
│ exception                │
└────────────┬─────────────┘
             │
             ▼
       Pretty Terminal
```

Make the API boundary completely understandable from one terminal session without inserting temporary debug statements throughout the codebase.

# Observability and Traceability Reinforcement Rules

These rules are mandatory for every new feature, endpoint, background process, integration, or infrastructure change.

The system must never become functionally capable but operationally blind.

A feature is not considered complete if it works but cannot be traced, inspected, diagnosed, or correlated when something goes wrong.

---

## 1. Observability Is Part of the Feature

Every new feature must either:

1. automatically inherit the existing observability infrastructure, or
2. explicitly mount into the existing logging/tracing layer, or
3. introduce a new observability adapter only when the existing infrastructure genuinely cannot cover the new execution path.

Never build a new feature first and "add logging later."

Observability is part of the implementation contract.

---

## 2. Never Create an Unobservable Execution Path

Before implementing a feature, ask:

```text
How will I know this feature was executed?
How will I know what input it received?
How will I know what output it produced?
How will I know why it failed?
How will I correlate the failure with the originating request?
```

If these questions cannot be answered from the existing observability system, the implementation is incomplete.

---

## 3. Prefer Existing Global Observability

Do not create random local logging mechanisms.

Before adding any logger, inspect whether the project already has:

```text
Pino
HTTP observability
requestId
correlationId
request context
structured logging
error logging
exception filters
tracing infrastructure
```

If an existing mechanism already covers the feature, use it.

Do not reinvent:

```text
console.log()
custom logger instances
feature-specific log files
ad-hoc JSON dumps
temporary debug statements
```

---

## 4. Every HTTP Endpoint Must Be Automatically Traceable

Any new HTTP endpoint must automatically inherit the global HTTP observability layer.

A newly created endpoint such as:

```ts
@Post('/appointments')
```

must immediately be observable without adding manual logging inside the controller.

The HTTP trace must expose, where safely available:

```text
requestId
timestamp
method
route
path
params
query
request metadata
request body
client metadata
authenticated actor
status code
response
duration
error
```

If a new endpoint bypasses global observability, fix the architecture.

Do not compensate by adding manual controller logging.

---

## 5. New Features Must Reuse Correlation Context

Every operation initiated by an HTTP request must preserve the request correlation context when possible.

Prefer propagation of:

```text
requestId
correlationId
traceId
```

through relevant execution boundaries.

The same logical operation should not suddenly generate unrelated logs with no way to connect them.

Desired relationship:

```text
HTTP Request
    ↓
Controller
    ↓
Service
    ↓
Repository
    ↓
External API / Queue / Worker
```

should remain traceable to the same originating operation where architecture permits.

---

## 6. Logs Must Explain State Transitions

For important operations, log meaningful state transitions rather than arbitrary prose.

Preferred:

```text
appointment.creation.started
appointment.creation.completed
appointment.creation.failed
```

Not:

```text
"masuk sini"
"test"
"jalan"
"done"
"error nih"
```

Logs should communicate what happened in system terms.

---

## 7. Generic Transport Logging and Business Logging Are Different

Do not duplicate HTTP logs inside business code.

The global HTTP layer already observes:

```text
request
response
status
duration
client
```

Feature-level logging should only exist when it provides additional domain value.

Example:

HTTP observability:

```text
POST /appointments
201
87ms
```

Feature observability:

```text
appointment.created
doctorId=...
patientId=...
scheduleId=...
```

Do not log the same thing twice.

---

## 8. Every Failure Path Must Be Observable

Do not only log success.

Whenever a feature can fail, ask whether the failure is visible.

Failures may include:

```text
validation failure
authorization failure
missing configuration
database failure
external API failure
timeout
conflict
invalid state transition
unexpected null
serialization failure
queue failure
background job failure
```

A developer should be able to determine:

```text
what failed
where it failed
which operation triggered it
which entity was involved
which request initiated it
what error category occurred
```

without inserting temporary debug statements.

---

## 9. Do Not Swallow Errors

Forbidden:

```ts
try {
  ...
} catch {
  return null;
}
```

or equivalent silent failure patterns.

If an error is intentionally transformed, preserve observability.

For example:

```text
original error category
operation
relevant identifiers
correlation ID
```

should remain discoverable.

Do not destroy diagnostic context.

---

## 10. Do Not Hide Configuration Failures Behind Fallbacks

If a feature depends on:

```text
ENV
API key
URL
storage configuration
queue configuration
database configuration
external service credentials
```

verify them first.

Do not silently replace missing configuration with dummy or fallback values merely to make execution continue.

A missing required configuration must be explicit and traceable.

Preferred:

```text
configuration.missing
key=STORAGE_BASE_URL
```

Not:

```text
fallback to localhost
```

unless fallback behavior is an intentional documented product decision.

---

## 11. No Temporary Console Debugging as Architecture

Agents must not solve observability using:

```ts
console.log()
console.error()
console.warn()
```

inside random feature files.

Temporary debugging may be used during investigation if necessary, but it must not become the permanent observability solution.

Permanent diagnostics must use the centralized logging system.

---

## 12. Logs Must Be Structured

Prefer:

```ts
logger.info({
  event: 'appointment.created',
  requestId,
  appointmentId,
  doctorId,
});
```

over:

```ts
logger.info(
  `Appointment created ${appointmentId} doctor ${doctorId}`,
);
```

Structured metadata is easier to:

```text
filter
search
aggregate
correlate
export
parse
inspect
```

---

## 13. Stable Event Naming

Use stable machine-readable event names.

Preferred style:

```text
domain.action.state
```

Examples:

```text
auth.login.started
auth.login.completed
auth.login.failed

appointment.creation.started
appointment.creation.completed
appointment.creation.failed

schedule.update.started
schedule.update.completed
schedule.update.failed

storage.upload.started
storage.upload.completed
storage.upload.failed
```

Avoid changing event naming randomly between features.

---

## 14. Log Important Identifiers, Not Entire Objects

Prefer useful identifiers:

```text
userId
doctorId
patientId
scheduleId
appointmentId
requestId
```

Do not serialize an entire entity merely because it is available.

Bad:

```ts
logger.info({ user });
```

Better:

```ts
logger.info({
  userId: user.id,
  role: user.role,
});
```

This reduces noise and sensitive-data exposure.

---

## 15. Sensitive Data Must Never Be Logged Raw

Never emit:

```text
password
password hash
access token
refresh token
JWT
OTP
PIN
authorization header
cookie
session secret
API secret
private key
client secret
raw biometric data
```

Use centralized redaction.

Observability that leaks secrets is defective observability.

---

## 16. Logging Must Never Change Business Behavior

The logging layer must be passive.

It must not:

```text
change request payloads
change response payloads
change status codes
change exceptions
change transactions
change database state
change retry behavior
change authentication behavior
```

The system must behave identically whether verbose logging is enabled or disabled.

---

## 17. Logging Failure Must Not Break the Feature

If a logger, serializer, pretty printer, or telemetry sink fails, the business operation should continue whenever safely possible.

Observability infrastructure must not become a new critical failure dependency unless explicitly designed as one.

---

## 18. Do Not Log Huge or Binary Payloads Blindly

For:

```text
file uploads
images
documents
buffers
streams
binary responses
large arrays
```

log metadata instead.

Example:

```text
filename
mimeType
size
fieldName
```

Do not dump raw buffers or base64 contents into logs.

---

## 19. Preserve Request Context Across Async Boundaries

If the project uses request-scoped context or AsyncLocalStorage, respect it.

Do not create async execution paths that accidentally lose:

```text
requestId
correlationId
actor
client metadata
```

without checking whether the context must be propagated.

This is especially important for:

```text
async service operations
event handlers
queues
workers
scheduled jobs
external API calls
```

---

## 20. Background Jobs Need Their Own Trace Root

Operations without an HTTP request still require traceability.

Examples:

```text
cron jobs
queue consumers
scheduled tasks
workers
webhook processing
event handlers
```

They should create their own operation identifier such as:

```text
jobId
correlationId
traceId
```

Do not depend exclusively on HTTP request IDs.

---

## 21. External API Calls Must Be Traceable

When the backend calls another system, observe:

```text
target service
method
endpoint
duration
status
failure category
correlation ID
```

Do not log secrets or raw authorization headers.

If possible, propagate an existing correlation identifier to the downstream request.

---

## 22. Database Diagnostics Must Preserve Context

Do not spam SQL logs globally unless required.

However, important database failures should retain enough context to understand:

```text
which operation
which entity
which request
which repository action
which error
```

A database error should not appear as an isolated stack trace with no relationship to the request that caused it.

---

## 23. Feature Completion Requires Trace Verification

Before declaring a feature complete, verify at least:

```text
success path observable
validation failure observable
authorization failure observable
domain failure observable
unexpected failure observable
correlation ID present
important identifiers present
duration visible where relevant
sensitive data redacted
```

Do not assume observability works merely because Pino exists.

---

## 24. New Endpoint Checklist

For every new endpoint, ask:

```text
Does global HTTP logging see it automatically?
Does it have requestId?
Is input visible?
Is output visible?
Are errors visible?
Is duration visible?
Is actor context visible when authenticated?
Is client metadata visible when available?
Are secrets redacted?
```

If any answer is no, investigate before considering the endpoint finished.

---

## 25. New Service Checklist

For every new significant service operation:

```text
Does generic HTTP observability already provide enough information?
```

If yes:

do not add redundant logs.

If no:

add structured domain-level events at important state transitions.

---

## 26. New Integration Checklist

For every external integration:

```text
Can we see when the call starts?
Can we see which dependency was called?
Can we see how long it took?
Can we see the status/result?
Can we see the failure category?
Can we correlate it with the originating operation?
```

If not, mount it into the existing observability layer.

---

## 27. New Async Workflow Checklist

For queues, events, and workers:

```text
What identifies this job?
What triggered this job?
Can the trigger be correlated?
What input was accepted?
What state transition occurred?
What was the result?
Why did it fail?
```

Do not create invisible asynchronous workflows.

---

## 28. Do Not Create Observability Islands

Forbidden architecture:

```text
Feature A → Pino
Feature B → console.log
Feature C → custom text file
Feature D → no logging
Feature E → another logger
```

Target:

```text
Application
     ↓
Central Observability Contract
     ↓
Pino
```

with specialized adapters only where justified.

---

## 29. Single Source of Truth

There must be one authoritative configuration for:

```text
log levels
redaction
HTTP logging
pretty printing
request IDs
environment behavior
```

Do not duplicate these rules across modules.

---

## 30. Respect Existing Architecture Before Adding Files

Before creating:

```text
logger.service.ts
logging.module.ts
request-context.ts
observability.interceptor.ts
```

search the codebase first.

If equivalent infrastructure already exists, extend or reuse it.

Do not create parallel abstractions because you failed to inspect existing code.

---

## 31. Never Make Observability Feature-Specific Unless Necessary

Generic infrastructure belongs globally.

Bad:

```text
AppointmentHttpLogger
DoctorHttpLogger
PatientHttpLogger
ScheduleHttpLogger
```

for the same HTTP concerns.

Prefer:

```text
GlobalHttpObservability
```

Domain-specific event logging may remain domain-specific when it represents actual business events.

---

## 32. Observability Must Survive Future Features

The correct design should make this true:

> A developer can create a new endpoint tomorrow and receive HTTP observability automatically.

If every new endpoint requires remembering to add logging manually, the architecture is fragile.

Fix the infrastructure rather than writing another reminder.

---

## 33. Do Not Produce Noise Without Diagnostic Value

More logs do not automatically mean better observability.

Avoid:

```text
entered function
leaving function
service called
repository called
value is X
```

unless these events materially help diagnose the operation.

Prefer high-signal events.

---

## 34. Logs Must Answer Diagnostic Questions

For any feature, logs should allow an engineer to answer:

```text
What happened?
When?
Which request/job caused it?
Who initiated it?
What input mattered?
Which entity was affected?
What state changed?
How long did it take?
What result occurred?
Why did it fail?
```

If the logs cannot answer these questions, improve them.

---

## 35. Do Not Overengineer

Observability is mandatory.

Architectural ceremony is not.

Do not create:

```text
10 interfaces
15 factories
20 wrappers
```

for a simple operation.

Reuse the existing Pino infrastructure.

Introduce abstractions only when they create real boundaries.

---

## 36. Default Decision Rule

Whenever adding a new feature:

```text
1. Inspect existing observability.
2. Determine whether the new path is already covered.
3. Reuse existing tracing/logging if possible.
4. Add missing structured events only where necessary.
5. Preserve request/correlation context.
6. Verify success and failure traces.
7. Confirm sensitive data is redacted.
8. Only then consider the feature complete.
```

---

# Mandatory Agent Reinforcement

Before finishing ANY feature implementation, explicitly verify:

```text
OBSERVABILITY CHECK

[ ] New execution path is observable.
[ ] Existing global logger is reused.
[ ] No random console logging was introduced.
[ ] Request/job correlation exists.
[ ] Success path is traceable.
[ ] Failure path is traceable.
[ ] Important identifiers are included.
[ ] Sensitive information is redacted.
[ ] Logging does not change behavior.
[ ] Logging failure cannot break the feature.
[ ] No duplicate observability infrastructure was created.
```

If one of these conditions is false, the feature is NOT complete.

---

# Core Principle

Never build software that can execute but cannot explain what it did.

Functionality without observability creates invisible failure.

Every new feature must leave enough structured evidence for another engineer to reconstruct:

```text
trigger
→ input
→ execution
→ state transition
→ output
→ failure
```

without modifying the codebase merely to understand what happened.