# Backend API Contract Changelog Protocol

## 0. Purpose

This repository is the backend source of truth.

Whenever a backend change affects an external client contract, the change MUST be communicated through an immutable API changelog record.

External clients may include:

- Web applications
- Mobile applications
- Internal frontend applications
- Other API consumers

The purpose of the changelog is NOT to implement client-side changes.

The purpose of the changelog is to communicate:

- what changed,
- where it changed,
- what the previous contract was,
- what the new contract is,
- whether the change is breaking,
- who is affected,
- what contract the client must now respect,
- when the change becomes effective.

The backend owns the API contract.

The backend does NOT own client implementation.

---

# 1. Core Principle

Every client-visible API contract change must produce a changelog entry.

The backend engineer must be able to answer:

```text
What changed?
Which endpoint changed?
Which client is affected?
Was the request contract changed?
Was the response contract changed?
Was status-code behavior changed?
Was validation behavior changed?
Was business semantics changed?
Was an enum changed?
Was a field added, removed, renamed, or retyped?
Was an endpoint introduced, deprecated, replaced, or removed?
Is the change breaking or non-breaking?
From which contract version to which contract version?
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
Bisa. Saya akan buat ini sebagai **reinforcement architecture section untuk `AGENTS.md`** yang memaksa agent memecah kompleksitas, mencegah God Object/God Function, dan menjaga dependency direction tetap bersih.

Satu koreksi konsep kecil: “100% decoupled” secara literal tidak mungkin karena komponen tetap harus berkomunikasi. Target yang benar adalah **maximally decoupled with explicit contracts**: coupling hanya boleh terjadi melalui boundary yang memang disengaja.

```md
# Complexity Decomposition, Separation of Concerns, and Decoupling Rules

## 0. Purpose

These rules are mandatory whenever creating, modifying, extending, or refactoring code.

The objective is to prevent:

- God Objects
- God Classes
- God Functions
- 1,000–2,000 line files
- business logic mixed with transport logic
- infrastructure leaking into domain logic
- duplicated utilities
- random helper dumping grounds
- deeply nested conditional logic
- hidden side effects
- tightly coupled modules
- circular dependencies
- implicit contracts
- feature-specific implementations leaking into shared infrastructure

The system must prefer:

- small cohesive units
- explicit contracts
- narrow responsibilities
- dependency inversion
- composition
- pure transformations
- reusable helpers
- domain ownership
- predictable dependency direction
- independently testable components

The fundamental principle is:

> Complexity must be decomposed before it becomes structural debt.

Do not wait until a file becomes impossible to understand.

---

# 1. Primary Rule: One Unit, One Reason to Change

Every:

- function
- class
- service
- module
- adapter
- utility
- hook
- repository
- controller
- interceptor
- middleware

must have one coherent responsibility.

Ask:

```text
Why would this unit need to change?
```

If the answer contains several unrelated reasons, the unit is probably carrying too many responsibilities.

Bad:

```text
ScheduleService

- validates DTO
- calculates slot state
- queries database
- formats dates
- sends notifications
- generates response DTO
- logs HTTP request
- manages cache
- parses environment variables
```

Good:

```text
ScheduleController
        ↓
ScheduleApplicationService
        ↓
SchedulePolicy
        ↓
ScheduleRepository
        ↓
Persistence Adapter
```

With independent collaborators such as:

```text
ScheduleStateResolver
ScheduleValidator
ScheduleMapper
NotificationPort
CachePort
```

Only create these boundaries when they represent real responsibilities.

Do not create abstractions merely to increase file count.

---

# 2. Never Create a God Object

A God Object is any class/module that becomes the center of unrelated responsibilities.

Warning signs:

```text
class AppService
class CommonService
class UtilsService
class HelperService
class ManagerService
class CoreService
```

containing dozens of unrelated methods.

Examples:

```text
createUser()
sendEmail()
calculateSchedule()
uploadImage()
parseDate()
generateToken()
formatResponse()
checkPermission()
writeLog()
```

This is forbidden.

Split by responsibility and ownership.

---

# 3. Never Create a God Function

A function should represent one logical operation.

Bad:

```ts
async function createAppointment() {
  // validation
  // authentication
  // database lookup
  // schedule computation
  // business rules
  // transaction
  // notification
  // serialization
  // logging
  // cache invalidation
  // response formatting
}
```

The function is doing orchestration AND implementation.

Prefer:

```text
createAppointment()
    ↓
validateAppointmentRequest()
    ↓
resolveAppointmentContext()
    ↓
appointmentPolicy.validate()
    ↓
appointmentRepository.create()
    ↓
publishAppointmentCreated()
```

The orchestration layer may coordinate several collaborators.

It should not implement every collaborator internally.

---

# 4. Orchestration and Computation Must Be Separated

A useful distinction:

```text
ORCHESTRATION

decides WHAT happens and in WHAT order
```

versus:

```text
COMPUTATION

implements HOW a specific operation works
```

Example:

Bad:

```ts
async createAppointment(dto) {
  const doctor = await ...
  const schedule = await ...

  if (...) {
    ...
  }

  const start = ...
  const end = ...

  const normalized = ...

  const appointment = ...

  await ...

  return ...
}
```

Better conceptually:

```ts
async createAppointment(command) {
  const context = await this.contextResolver.resolve(command);

  this.policy.assertCanCreate(context);

  const appointment =
    this.appointmentFactory.create(context);

  return this.repository.save(appointment);
}
```

Complex computation belongs in dedicated collaborators.

---

# 5. Extract Cohesive Chunks, Not Arbitrary Chunks

Do NOT split code merely because a function is long.

Split by meaning.

Bad decomposition:

```text
processPart1()
processPart2()
processPart3()
```

Good decomposition:

```text
validateSchedule()
resolveDoctorAvailability()
deriveSlotState()
buildAppointment()
persistAppointment()
```

Every extracted unit must have a semantic purpose.

---

# 6. Prefer Small Pure Functions for Transformations

Transformations should preferably be pure.

Example:

```ts
function normalizeDoctorSchedule(input) {
  return ...
}
```

A pure helper should:

- depend only on its arguments
- return a result
- not mutate global state
- not access the database
- not access environment variables
- not perform HTTP calls
- not write logs as a side effect
- not depend on framework state

Pure functions are easier to:

- test
- reason about
- reuse
- compose
- debug

---

# 7. Separate Pure and Impure Code

Pure logic:

```text
validation
mapping
normalization
calculation
comparison
state derivation
format conversion
policy evaluation
```

Impure operations:

```text
database
HTTP
filesystem
cache
message broker
clock
randomness
environment
logging
```

Do not mix them unnecessarily.

Target structure:

```text
IMPURE SHELL
    ↓
PURE CORE
    ↓
IMPURE ADAPTER
```

Example:

```text
HTTP Controller
    ↓
Application Service
    ↓
Pure Domain Policy
    ↓
Repository Port
    ↓
Database Adapter
```

---

# 8. Framework Code Must Stay at the Boundary

NestJS, Next.js, Flutter, database drivers, HTTP clients, Redis clients, etc. are infrastructure concerns.

Do not let framework-specific objects leak deeply into business logic.

Bad:

```ts
calculateSchedule(req: Request)
```

Better:

```ts
calculateSchedule(input: ScheduleInput)
```

Bad:

```ts
domainFunction(prismaRecord)
```

Better:

```ts
domainFunction(schedule)
```

Convert infrastructure representations at the boundary.

---

# 9. Dependency Direction Must Be Explicit

Prefer:

```text
Presentation
    ↓
Application
    ↓
Domain
    ↑
Infrastructure implements interfaces
```

Core business logic should not depend directly on infrastructure implementation.

Example:

```text
Application Service
    ↓
ScheduleRepository interface
    ↑
DrizzleScheduleRepository
```

Not:

```text
Application Service
    ↓
Drizzle ORM directly
```

when repository abstraction already exists.

---

# 10. Depend on Contracts, Not Concrete Implementations

Bad:

```ts
class AppointmentService {
  constructor(
    private readonly drizzleRepository:
      DrizzleAppointmentRepository,
  ) {}
}
```

Prefer where an abstraction is justified:

```ts
class AppointmentService {
  constructor(
    private readonly appointmentRepository:
      AppointmentRepository,
  ) {}
}
```

The application knows the capability.

Infrastructure knows the implementation.

---

# 11. Do Not Over-Abstract Everything

Dependency inversion is not permission to create meaningless interfaces.

Bad:

```text
DateFormatterInterface
StringConcatInterface
BooleanCheckerInterface
ArrayLengthInterface
```

Not every helper requires an interface.

Use an interface when there is a meaningful boundary:

```text
Repository
Storage
Mailer
Cache
Payment Gateway
External API
Clock
Queue
Logger
```

Prefer a simple function when the behavior is just deterministic transformation.

---

# 12. Utility Is Not a Dumping Ground

Never create:

```text
utils.ts
helpers.ts
common.ts
misc.ts
functions.ts
shared.ts
```

and continuously throw unrelated functionality into it.

This creates another God Object in file form.

Instead use semantic ownership.

Bad:

```text
utils.ts

formatDate()
calculateSlot()
sanitizeUser()
parsePhone()
resolveAvatar()
generateRequestId()
```

Better:

```text
date/
  format-date.ts

schedule/
  calculate-slot.ts

user/
  sanitize-user.ts

phone/
  normalize-phone.ts

observability/
  generate-request-id.ts
```

---

# 13. Helpers Must Have Ownership

Before creating a helper, answer:

```text
Who owns this behavior?
```

Possible answers:

```text
schedule domain
authentication domain
network infrastructure
logging infrastructure
date utility
serialization layer
```

If ownership cannot be determined, reconsider the abstraction.

---

# 14. Local Helper Before Global Utility

Default preference:

```text
feature-local
```

before:

```text
application-global
```

Do not move a helper into shared/core infrastructure merely because two files use it.

Promote functionality to shared infrastructure only when its semantics are genuinely domain-independent.

Duplication of two trivial lines is often safer than a bad global abstraction.

---

# 15. Shared Code Must Be Truly Shared

A shared utility must not know:

```text
appointment
doctor
patient
schedule
admin
mobile
web
```

unless shared domain ownership explicitly requires it.

Example:

Bad:

```text
shared/utils/getDoctorAppointmentColor.ts
```

That is not generic shared infrastructure.

It belongs to the relevant domain.

---

# 16. Domain Logic Stays With the Domain

Business semantics belong near their owning domain.

Example:

```text
schedule/
    domain/
        schedule-state.ts
        schedule-policy.ts
        schedule-rules.ts
```

not:

```text
common/utils/schedule-rules.ts
```

Avoid "common" as a dumping ground for domain logic.

---

# 17. Use Composition Instead of Giant Inheritance Trees

Prefer:

```text
Service
    +
Validator
    +
Policy
    +
Repository
    +
Mapper
```

over:

```text
BaseService
  ↓
AbstractCrudService
  ↓
GenericDomainService
  ↓
AppointmentBaseService
  ↓
AppointmentService
```

Inheritance creates hidden coupling.

Prefer composition unless inheritance models a genuine substitutable relationship.

---

# 18. Keep Side Effects at Explicit Boundaries

A function that appears to calculate something must not secretly:

```text
write database
send HTTP request
emit event
write file
invalidate cache
```

Names and behavior must align.

Bad:

```ts
getScheduleState()
```

that also updates the database.

Good:

```text
resolveScheduleState()
updateScheduleState()
```

Explicit behavior improves traceability.

---

# 19. Separate Read and Write Responsibilities

Do not mix query behavior and mutation behavior unnecessarily.

Conceptually:

```text
Query
→ retrieve / calculate information

Command
→ change state
```

A function named:

```text
getDoctorSchedule()
```

should not silently modify schedules.

A function named:

```text
updateDoctorSchedule()
```

may mutate state.

---

# 20. Separate Mapping From Business Logic

Avoid:

```ts
function createAppointment(dto) {
  // DTO parsing
  // business rules
  // DB mapping
  // response mapping
}
```

Prefer:

```text
DTO
 ↓
Input Mapper
 ↓
Application Command
 ↓
Domain
 ↓
Persistence Mapper
 ↓
Repository
```

Then:

```text
Domain Result
 ↓
Response Mapper
 ↓
API Response
```

Mapping should not silently contain business decisions.

---

# 21. Separate Validation Categories

Do not put all validation inside one function.

Differentiate:

```text
Transport validation
Domain validation
Authorization
Business invariants
Persistence constraints
```

Example:

```text
DTO validation
"is this a valid date string?"
```

versus:

```text
Domain policy
"may this doctor open this schedule?"
```

Those are different concerns.

---

# 22. Separate Error Translation

Domain errors should not know HTTP status codes unless the architecture explicitly treats them as HTTP-domain errors.

Prefer:

```text
Domain Error
    ↓
Boundary Error Mapper
    ↓
HTTP Exception
```

This prevents domain logic from becoming coupled to NestJS.

---

# 23. Controllers Must Remain Thin

Controllers should primarily:

```text
receive
validate transport input
delegate
return
```

Controllers must not become business services.

Bad controller:

```text
@Post()
create() {
  // 150 lines of logic
}
```

Desired:

```ts
@Post()
create(@Body() dto: CreateAppointmentDto) {
  return this.createAppointment.execute(dto);
}
```

Exact structure must respect the current architecture.

---

# 24. Services Must Not Become Everything

The word "service" is not permission to put every responsibility into one class.

Bad:

```text
AppointmentService
1200 lines
42 methods
9 dependencies
```

Inspect whether it actually contains several cohesive capabilities.

Possible decomposition:

```text
CreateAppointment
CancelAppointment
RescheduleAppointment
AppointmentPolicy
AppointmentQueryService
AppointmentRepository
```

Do not blindly create one class per method.

Split by use case or meaningful responsibility.

---

# 25. Repository Responsibility Is Persistence

A repository should primarily abstract persistence operations.

It must not become responsible for:

```text
HTTP response formatting
business presentation
UI status
email notifications
controller validation
logging request bodies
```

Keep persistence concerns focused.

---

# 26. Mapper Responsibility Is Mapping

A mapper should map representations.

It must not:

```text
query database
call external APIs
perform authorization
publish events
```

Avoid side effects in mappers.

---

# 27. Validator Responsibility Is Validation

A validator should validate.

It should not:

```text
persist
notify
format API response
```

Keep responsibilities narrow and obvious.

---

# 28. Policy Objects for Complex Business Decisions

When conditional business rules become complex, consider a policy or specification.

Instead of:

```ts
if (
  user.role === ...
  && schedule.status === ...
  && ...
  && ...
) {
}
```

spread across multiple services, centralize the actual business decision.

Example:

```text
ScheduleModificationPolicy
```

with:

```text
canModify()
assertCanModify()
```

where appropriate.

This creates one source of truth.

---

# 29. Avoid Deep Conditional Nesting

Bad:

```ts
if (...) {
  if (...) {
    if (...) {
      if (...) {
      }
    }
  }
}
```

Prefer:

```text
guard clauses
early returns
policy extraction
lookup tables
strategy selection
state machines
```

depending on semantics.

Example:

```ts
if (!doctor) throw ...
if (!schedule) throw ...
if (!policy.canModify(...)) throw ...

return updateSchedule(...);
```

---

# 30. Avoid Boolean Explosion

Warning:

```ts
processSchedule(
  true,
  false,
  true,
  false,
  true,
)
```

This is unreadable and tightly coupled to argument position.

Prefer named options:

```ts
processSchedule({
  includeClosed: true,
  includeOccupied: false,
});
```

Better still, determine whether multiple booleans represent a missing concept.

---

# 31. Avoid Parameter Explosion

A function receiving many unrelated parameters may indicate missing grouping or abstraction.

Bad:

```ts
createAppointment(
  doctorId,
  patientId,
  date,
  start,
  end,
  room,
  notes,
  status,
  ...
)
```

Prefer a meaningful input object:

```ts
CreateAppointmentInput
```

But do not turn every two arguments into a DTO.

---

# 32. Avoid Dependency Explosion

A class with an excessive number of injected dependencies is a strong architectural warning.

Example:

```text
Service
├── Repository A
├── Repository B
├── Repository C
├── Cache
├── Logger
├── Mailer
├── Storage
├── Queue
├── Mapper
├── Validator
├── Config
└── HTTP Client
```

Before adding another dependency, ask:

```text
Does this class actually represent several responsibilities?
```

Often the correct answer is yes.

Decompose by use case or responsibility.

---

# 33. File Size Is a Signal, Not the Root Problem

Do not mechanically split a file because it exceeds an arbitrary number of lines.

However, treat large files as an architectural review trigger.

Review aggressively when approximately:

```text
function > 40–60 logical lines
class > 250–400 lines
file > 400–600 lines
service > 8–10 meaningful dependencies
```

These are warning thresholds, not laws.

The actual question is:

```text
Does this unit contain multiple independently changing responsibilities?
```

If yes, decompose it.

---

# 34. Cohesion Is More Important Than File Count

Do not transform:

```text
1 coherent 150-line module
```

into:

```text
15 meaningless 10-line files
```

The goal is not maximum fragmentation.

The goal is:

```text
high cohesion
low coupling
clear ownership
```

---

# 35. Prefer Feature Ownership Over Technical Dumping Grounds

Where architecture permits, organize code around capabilities.

Example:

```text
schedule/
├── application/
├── domain/
├── infrastructure/
└── presentation/
```

instead of dumping all unrelated domains into:

```text
services/
repositories/
helpers/
utils/
```

Adapt to the existing repository architecture.

Do not reorganize the entire project without explicit need.

---

# 36. No Cross-Domain Imports Without Justification

Before importing one feature/domain directly into another, ask:

```text
Is this a legitimate dependency?
```

Bad:

```text
appointment
    ↓
doctor internal repository implementation
```

Better:

```text
appointment
    ↓
DoctorAvailabilityPort
    ↑
doctor/infrastructure adapter
```

when a real architectural boundary exists.

Do not expose internal implementation details across domains.

---

# 37. No Circular Dependencies

Circular dependencies are architectural defects unless strongly justified.

Forbidden pattern:

```text
ScheduleService
    ↓
AppointmentService
    ↓
ScheduleService
```

Do not solve architectural cycles with:

```ts
forwardRef(...)
```

as the first response.

`forwardRef` may solve NestJS wiring.

It does NOT solve architectural coupling.

First investigate ownership and dependency direction.

---

# 38. Dependency Inversion Before forwardRef

When a cycle exists, consider extracting:

```text
shared contract
domain event
application port
orchestrator
policy
query service
```

depending on actual semantics.

Break the dependency at the conceptual level.

---

# 39. Use Ports for External Capabilities

Useful boundaries:

```text
StoragePort
EmailPort
CachePort
PaymentPort
NotificationPort
ClockPort
ExternalApiPort
```

Infrastructure adapters implement those contracts.

Example:

```text
ProfileService
    ↓
StoragePort
    ↑
S3StorageAdapter
```

This makes infrastructure replaceable.

---

# 40. Do Not Leak Vendor Names Into Core Logic

Bad:

```text
uploadToCloudinary()
saveToRedis()
sendWithTwilio()
```

inside application/domain logic.

Prefer capability-oriented names:

```text
storage.upload()
cache.set()
notification.send()
```

Vendor-specific naming belongs in infrastructure adapters.

---

# 41. Use Adapters at Integration Boundaries

External representations should be adapted.

Example:

```text
External API
    ↓
External DTO
    ↓
Adapter / Mapper
    ↓
Internal Representation
```

Do not let the entire application depend directly on third-party response shapes.

---

# 42. Keep Configuration Centralized

Do not read environment variables throughout business code.

Bad:

```ts
process.env.API_URL
```

inside random services.

Prefer:

```text
Config module
    ↓
typed configuration
    ↓
injected where needed
```

Configuration access is infrastructure.

---

# 43. Keep Logging Centralized

Do not introduce:

```text
console.log
console.warn
console.error
```

throughout feature code.

Use the existing logger/observability contract.

New features must mount into existing observability infrastructure.

Do not create parallel logging systems.

---

# 44. Keep Constants Centralized by Ownership

Avoid magic values:

```ts
if (status === 'somevalue')
```

Prefer authoritative constants/enums/value objects.

Example:

```ts
if (status === ScheduleStatus.CLOSED)
```

Constants must live near the domain that owns them.

Do not put every constant in:

```text
common/constants.ts
```

---

# 45. Backend Response Is the Source of Truth

Client or downstream code must not reconstruct authoritative backend state unnecessarily.

If a backend response explicitly provides:

```text
status
type
state
permission
availability
```

consume that contract.

Do not re-derive backend truth from presentation strings.

This same principle applies internally:

Do not create duplicate calculations of an already authoritative state.

---

# 46. One Source of Truth Per Concept

Before introducing another field, helper, mapping, cache, or state representation, ask:

```text
Where is the authoritative source?
```

Avoid:

```text
users.image_url
staff_profiles.avatar_url
cachedAvatar
fallbackAvatar
```

all pretending to represent the same truth.

One authoritative source.

Other representations must derive from it deliberately.

---

# 47. No Silent Fallbacks

Do not hide missing data or broken integration with arbitrary fallback values.

Bad:

```ts
return schedule ?? showcaseSchedule;
```

Bad:

```ts
return avatarA || avatarB || defaultFakeAvatar;
```

when fallback behavior is not a documented product rule.

Prefer explicit absence or explicit failure.

Fallbacks can mask architecture defects.

---

# 48. Helper Functions Must Be Deterministic Where Possible

A helper named:

```text
resolveAvatarUrl()
```

should have clear inputs and outputs.

Avoid helpers that secretly:

```text
read database
read environment
modify state
call HTTP service
```

unless the name and ownership clearly communicate it.

---

# 49. Name Functions by Responsibility

Bad:

```text
handleData()
processStuff()
manageThing()
doLogic()
helper()
executeProcess()
```

Good:

```text
resolveScheduleState()
normalizePhoneNumber()
buildAppointmentResponse()
assertScheduleEditable()
mapDoctorRecord()
```

Names should communicate intent without opening the implementation.

---

# 50. Boolean Helpers Should Read Like Questions

Examples:

```text
isScheduleEditable()
hasActiveAppointment()
canDoctorModifySchedule()
```

Avoid:

```text
checkSchedule()
validateThing()
statusCheck()
```

when the return value is boolean.

---

# 51. Commands Should Use Action Names

Examples:

```text
createAppointment()
cancelAppointment()
closeSchedule()
updateDoctorProfile()
```

Not:

```text
appointment()
schedule()
data()
```

---

# 52. Mappers Should Use Mapping Names

Examples:

```text
toDomain()
toPersistence()
toResponse()
fromPersistence()
```

Do not hide unrelated business logic inside them.

---

# 53. Factories Should Construct, Not Orchestrate Infrastructure

A factory may construct a valid domain object.

A factory should not:

```text
query database
send email
perform HTTP request
write cache
```

unless the architecture explicitly defines a higher-level factory with such ownership.

---

# 54. Avoid Generic "Manager" Classes

Names such as:

```text
UserManager
ScheduleManager
SystemManager
DataManager
```

often hide unclear responsibilities.

Prefer specific capability names.

---

# 55. Avoid "CommonService"

`CommonService` is usually an architectural smell.

If functionality is shared, identify the actual capability.

Examples:

```text
Clock
IdGenerator
UrlBuilder
FileMetadataExtractor
RequestContext
```

---

# 56. Duplication vs Wrong Abstraction

Do not prematurely abstract two superficially similar pieces of code.

Ask:

```text
Do these pieces share the same semantic reason to change?
```

If not, keep them separate.

A small amount of duplication is cheaper than coupling unrelated domains.

---

# 57. Rule of Three as a Heuristic

When the same semantic behavior appears repeatedly, consider extraction.

Do not mechanically apply DRY based only on textual similarity.

DRY means:

```text
one authoritative representation of knowledge
```

not:

```text
never repeat a line of code
```

---

# 58. Keep APIs Narrow

Expose the minimum necessary public surface.

Bad:

```text
Service with 37 public methods
```

Prefer capability-specific APIs.

Internal helpers should remain private/local unless another module genuinely needs them.

---

# 59. Hide Implementation Details

Consumers should know:

```text
what capability exists
```

not:

```text
how it is implemented internally
```

Example:

```text
AppointmentRepository.save()
```

rather than exposing:

```text
Drizzle table
SQL builder
transaction internals
```

---

# 60. Avoid Propagating Database Models Everywhere

Persistence representations belong to persistence.

Do not make database records the universal application model.

Use mapping boundaries when the distinction is meaningful.

---

# 61. Avoid Propagating HTTP DTOs Everywhere

HTTP DTOs belong at the transport boundary.

Do not make a controller DTO the central domain model unless it truly represents the same concept.

---

# 62. Infrastructure Must Be Replaceable

A healthy boundary should make it possible to replace:

```text
Drizzle → another persistence implementation
Pino → another logger
Redis → another cache
S3 → another object storage
HTTP provider → another HTTP provider
```

without rewriting business rules.

You do not need to actively support every alternative.

The architecture simply must not unnecessarily couple core logic to one implementation.

---

# 63. Unit Testing Should Reveal Coupling Problems

A cohesive pure component should be testable without:

```text
database
Docker
HTTP server
Redis
filesystem
```

when those dependencies are irrelevant to the unit's responsibility.

If testing a simple policy requires booting half the application, investigate coupling.

---

# 64. Integration Tests Belong at Integration Boundaries

Do not mock everything.

Use:

```text
unit tests
```

for pure business logic.

Use:

```text
integration tests
```

for repository/database adapters.

Use:

```text
HTTP/e2e tests
```

for API contracts.

The test boundary should match the architecture boundary.

---

# 65. Refactor Before Adding More Complexity

When adding a feature to an already overloaded unit:

DO NOT simply append another:

```text
if
method
dependency
branch
switch
```

First evaluate whether the existing unit should be decomposed.

Feature work must not continuously increase structural debt.

---

# 66. Boy Scout Rule With Scope Control

When modifying an area:

improve structural clarity when directly relevant.

Do NOT perform unrelated repository-wide refactors without explicit reason.

Refactor enough to safely support the change.

Avoid uncontrolled scope expansion.

---

# 67. New Feature Workflow

Before implementing a new feature:

```text
1. Locate the owning domain.
2. Inspect existing abstractions.
3. Identify the feature's responsibilities.
4. Identify pure business logic.
5. Identify side effects.
6. Identify required external capabilities.
7. Identify existing reusable helpers.
8. Determine correct dependency direction.
9. Design the smallest cohesive components.
10. Implement.
11. Verify dependency boundaries.
12. Verify observability.
13. Verify tests.
```

Do not start by creating random files.

---

# 68. Mandatory Decomposition Questions

Before adding substantial code, answer:

```text
What is the orchestration responsibility?

What is the business-rule responsibility?

What is the persistence responsibility?

What is the mapping responsibility?

What is the validation responsibility?

What is the infrastructure responsibility?

What can be pure?

What requires side effects?

What already exists?

What should remain private?

What needs an interface?

What does NOT need an interface?
```

---

# 69. Before Extracting a Helper

Ask:

```text
Is this behavior coherent?

Does it have a meaningful name?

Is it deterministic?

Who owns it?

Will extraction reduce cognitive complexity?

Does it remove duplication of knowledge?

Will moving it create worse coupling?
```

If the answer is unclear, do not extract blindly.

---

# 70. Before Creating a Utility

Ask:

```text
Is this truly domain-independent?

Could this live closer to the feature?

Will unrelated domains depend on it?

Does its meaning remain identical across consumers?
```

If not, keep it local.

---

# 71. Before Creating an Interface

Ask:

```text
Is there a real architectural boundary?

Is this an external capability?

Could implementations reasonably vary?

Does inversion protect core logic?

Will this improve testability or ownership?
```

If no, a concrete implementation or pure function may be better.

---

# 72. Before Injecting Another Dependency

Ask:

```text
Why does this class need this?

Does this new dependency reveal another responsibility?

Should orchestration be split?

Could this capability belong to another collaborator?
```

Do not normalize constructors with 12 dependencies.

---

# 73. Before Adding Another Conditional

Ask:

```text
Is this a one-off guard?

Or is a business policy emerging?
```

If the same state logic exists in several places, create one authoritative policy/resolver.

---

# 74. Before Adding Another Mapping

Ask:

```text
Is this another representation of existing authoritative data?
```

Avoid parallel mapping chains that gradually diverge.

---

# 75. No Architecture by Copy-Paste

Do not create new services/modules by copying an old oversized implementation.

Existing code may contain architectural debt.

Inspect first.

Reuse patterns only if they are structurally sound.

---

# 76. No Speculative Generalization

Do not design abstractions for hypothetical future requirements.

Bad:

```text
UniversalEntityProcessor<T, U, V, X>
```

for one current use case.

Implement today's known boundaries cleanly.

Refactor when actual variation emerges.

---

# 77. No "Just in Case" Layers

Every layer must have a purpose.

Do not create:

```text
Controller
→ Handler
→ Manager
→ Coordinator
→ Processor
→ Service
→ Executor
→ Repository
```

when half of them simply forward calls.

Indirection without responsibility is complexity.

---

# 78. Forwarding Wrapper Smell

Bad:

```ts
class ScheduleManager {
  constructor(private service: ScheduleService) {}

  update(input) {
    return this.service.update(input);
  }
}
```

If a wrapper adds no semantic boundary, policy, adaptation, or abstraction, remove it.

---

# 79. Architecture Must Reduce Cognitive Load

The goal is not:

```text
maximum number of patterns
```

The goal is:

```text
minimum mental context required to understand one responsibility
```

A developer should be able to open a component and understand its role without loading the entire application into their head.

---

# 80. Traceable Data Flow

Every feature should have a readable dependency path.

Example:

```text
HTTP
 ↓
Controller
 ↓
Use Case
 ↓
Domain Policy
 ↓
Repository Port
 ↓
Repository Adapter
 ↓
Database
```

Avoid invisible jumps through:

```text
global mutable state
service locator magic
random static singleton
cross-module mutation
```

---

# 81. Explicit Inputs and Outputs

Functions must expose their dependencies through:

```text
parameters
constructor injection
explicit context
```

Avoid hidden dependencies.

Bad:

```text
globalCurrentUser
globalConfig
globalDb
```

Prefer explicit dependency injection or request context.

---

# 82. Mutation Must Be Local and Intentional

Prefer immutable transformations where practical.

Do not pass an object through five functions that mutate it unpredictably.

Prefer:

```text
input
→ transformation
→ new result
```

over:

```text
shared object
→ mutate
→ mutate
→ mutate
→ mystery state
```

---

# 83. Avoid Temporal Coupling

Bad API:

```text
service.initialize()
service.setDoctor()
service.setDate()
service.calculate()
service.save()
```

where methods must be called in an undocumented order.

Prefer one explicit operation with required inputs.

---

# 84. Avoid Shared Mutable Singleton State

Singleton services are acceptable for stateless infrastructure.

Do not store request-specific mutable state inside application-wide singleton services.

Request context belongs in appropriate scoped/context infrastructure.

---

# 85. State Machines for Real State Complexity

If behavior depends heavily on state transitions such as:

```text
AVAILABLE
OCCUPIED
CLOSED
UNSCHEDULED
```

and transitions become complex, consider an explicit state transition model.

Do not scatter:

```text
if status === ...
```

across the entire codebase.

One authoritative state policy should define valid transitions.

---

# 86. Prefer Lookup Tables Over Repetitive Conditionals

When mapping stable values:

Bad:

```ts
if (state === A) ...
else if (state === B) ...
else if (state === C) ...
```

Consider:

```ts
const mapping = {
  [State.A]: ...,
  [State.B]: ...,
};
```

when semantics are truly mapping-based.

Do not force lookup tables when behavior requires logic.

---

# 87. Strategy Pattern Only When Behavior Varies

Use strategies when several implementations share one capability.

Example:

```text
NotificationSender
├── EmailNotificationSender
├── PushNotificationSender
└── SmsNotificationSender
```

Do not introduce Strategy Pattern for one implementation with no real behavioral variation.

---

# 88. Factory Pattern Only for Construction Complexity

Use factories when object creation has meaningful rules.

Do not create:

```text
StringFactory
DateFactory
BooleanFactory
```

for trivial construction.

---

# 89. Adapter Pattern at External Boundaries

Use adapters where your application interfaces with systems it does not own.

Examples:

```text
PinoLoggerAdapter
DrizzleScheduleRepository
S3StorageAdapter
ExternalClinicApiAdapter
```

This is appropriate decoupling.

---

# 90. Facade Is Not Permission for God Object

A facade may provide a simplified public API.

It must delegate to cohesive components.

Do not put all implementation inside the facade itself.

---

# 91. Modules Must Own Their Internals

Avoid exporting every provider.

Expose only what other modules genuinely require.

Internal implementation details should remain internal.

---

# 92. Public API of a Module Must Be Deliberate

For each module, ask:

```text
What capability does another module actually need?
```

Export that.

Do not export:

```text
every repository
every mapper
every helper
every internal service
```

without reason.

---

# 93. Avoid Barrel Files That Hide Dependency Cycles

Barrel exports may simplify imports but can hide circular dependencies.

If barrel imports cause ambiguous ownership or cycles, prefer explicit imports.

Readability is more important than shorter import paths.

---

# 94. Prefer Path Aliases for Stable Architectural Boundaries

If the project already supports path aliases, prefer:

```ts
import { ... } from '@/infrastructure/database';
```

over fragile chains such as:

```ts
import { ... } from '../../../../../database/...';
```

Do not introduce aliases without checking existing TypeScript configuration.

Use existing namespace conventions.

---

# 95. Do Not Reach Into Another Module's Internals

Bad:

```text
feature A
→ feature B/internal/helpers/private-file
```

Depend on the public contract exposed by feature B.

If the required capability is not exposed, reconsider ownership.

---

# 96. Keep Cross-Cutting Concerns Cross-Cutting

Concerns such as:

```text
logging
observability
authentication context
configuration
metrics
tracing
```

should have centralized infrastructure.

Do not duplicate implementations per feature.

---

# 97. Every New Feature Must Be Observable

A feature is not complete if it works but cannot explain what happened.

Reuse the existing logging/tracing system.

Do not add ad-hoc console logging.

Ensure:

```text
success path
failure path
important state transitions
request correlation
```

are traceable where appropriate.

---

# 98. Decomposition Must Preserve Observability

Do not split code into so many tiny helpers that the execution flow becomes impossible to trace.

There must still be a clear orchestration layer.

Good:

```text
CreateAppointmentUseCase
    ↓
policy
factory
repository
```

Bad:

```text
helperA
 ↓
helperB
 ↓
helperC
 ↓
helperD
 ↓
helperE
```

with no semantic execution owner.

---

# 99. Decomposition Must Preserve Transaction Boundaries

Do not split database mutations in ways that accidentally destroy atomicity.

The orchestration layer must make transaction ownership explicit.

Helpers should not independently create unrelated transactions unless intended.

---

# 100. Decomposition Must Preserve Error Semantics

Extracted helpers must not randomly convert errors.

There should be a clear boundary responsible for error translation.

Avoid:

```text
repository error
→ helper changes it
→ another helper swallows it
→ controller invents another error
```

Preserve diagnostic context.

---

# 101. Decomposition Must Preserve Performance Awareness

Do not turn one efficient query into five repository calls simply for architectural aesthetics.

Decoupling is not permission to create N+1 queries or excessive network calls.

Architecture and performance must coexist.

---

# 102. Do Not Duplicate Fetching Across Helpers

If several helpers need the same entity, prefer resolving shared context once where appropriate.

Example:

```text
ContextResolver
    ↓
doctor
schedule
appointment
```

Then pass explicit context to pure policies.

Do not repeatedly query the same data inside separate helpers.

---

# 103. Separate Context Resolution From Business Evaluation

Useful model:

```text
Input
 ↓
Context Resolver
 ↓
Resolved Context
 ↓
Policy
 ↓
Decision
```

The policy should not need to know how context was fetched.

---

# 104. Keep Time as a Dependency When Important

Business logic depending on "now" should not scatter:

```ts
new Date()
```

everywhere.

For test-sensitive domain logic, consider a clock abstraction or explicit current time input.

Do this only when time actually affects domain behavior.

---

# 105. Keep ID Generation Explicit When Important

If IDs are business/infrastructure-relevant, centralize their generation rather than scattering random UUID generation everywhere.

Again, do not abstract trivial usage unnecessarily.

---

# 106. Comments Must Explain Why, Not Compensate for Bad Structure

Bad:

```ts
// this section calculates state
// this section validates doctor
// this section saves
```

inside a 600-line method.

Extract meaningful units instead.

Comments should explain:

```text
business reason
non-obvious invariant
external constraint
architectural decision
```

not narrate obvious code.

---

# 107. Do Not Hide Complexity Behind "Helper"

Renaming:

```text
500 lines
```

to:

```text
helper.ts
```

does not reduce complexity.

Complexity is reduced only when responsibilities and dependencies become clearer.

---

# 108. Do Not Hide Complexity Behind "Service"

Same principle:

```text
MegaService
```

is still a God Object even if the framework calls everything a service.

---

# 109. Do Not Hide Complexity Behind Private Methods

A class with:

```text
40 private methods
```

may still have too many responsibilities.

Private methods are not architectural decomposition if all responsibilities remain coupled to one class.

Extract collaborators when responsibilities genuinely differ.

---

# 110. Use Cognitive Complexity as a Smell

When understanding a function requires tracking:

```text
many branches
many mutable variables
multiple side effects
several external dependencies
nested loops
several state transitions
```

stop extending it.

Decompose it first.

---

# 111. Agent Must Inspect Before Refactoring

Before changing architecture:

```text
search usages
trace imports
inspect dependency graph
inspect existing abstractions
inspect tests
inspect DI registration
inspect public exports
```

Do not create a new abstraction because you failed to discover an existing one.

---

# 112. Refactoring Must Preserve Behavior

Unless behavior change is explicitly requested:

```text
input contract
output contract
status codes
side effects
database semantics
event semantics
```

must remain unchanged during architectural decomposition.

Refactoring and behavior modification must not be silently mixed.

---

# 113. Refactor in Coherent Steps

For large God Objects:

Do not rewrite everything blindly.

Prefer:

```text
1. identify responsibilities
2. identify dependencies
3. identify tests
4. extract pure logic
5. extract infrastructure boundaries
6. simplify orchestration
7. verify behavior
8. remove dead code
```

Keep each step understandable.

---

# 114. Delete Obsolete Code After Extraction

Do not leave:

```text
old method
new method
fallback method
legacy helper
temporary adapter
```

all active indefinitely.

After verification, remove obsolete implementation unless backwards compatibility explicitly requires it.

---

# 115. No "Fallback Architecture"

Do not keep two competing implementations "just in case."

Example:

```text
new schedule resolver
+
old schedule resolver fallback
```

without a documented compatibility requirement.

This destroys single source of truth.

---

# 116. One Canonical Path

For each capability, prefer one canonical execution path.

Bad:

```text
Controller A → old service
Controller B → new service
Worker → helper
Admin → repository directly
```

Good:

```text
all appropriate callers
        ↓
canonical application capability
```

Different contexts may still have different entry points when semantics genuinely differ.

---

# 117. Vertical Slice Must Respect Shared Infrastructure

Features may own domain/application code.

Cross-cutting infrastructure should remain reusable.

Example:

```text
appointment/
schedule/
user/

infrastructure/
    database/
    logging/
    cache/
```

Do not duplicate database/logging infrastructure inside every feature.

---

# 118. High Cohesion, Low Coupling

The target architecture is:

```text
inside a module:
HIGH COHESION

between modules:
LOW COUPLING
```

A module should contain things that change together.

Modules that change for unrelated reasons should not be merged.

---

# 119. Explicit Contract at Every Boundary

Whenever two layers/modules communicate, the interaction should have a clear contract.

Examples:

```text
DTO
interface
type
command
query
domain object
event
port
```

Avoid "pass any object and inspect fields dynamically" architecture.

---

# 120. No `any` as a Decoupling Shortcut

`any` is not decoupling.

It removes the contract.

Prefer explicit types.

If external input is unknown, validate and narrow it at the boundary.

---

# 121. Avoid Stringly-Typed Architecture

Bad:

```ts
if (type === 'doctor')
if (state === 'close')
if (role === 'some admin value')
```

when authoritative enums/constants exist.

Prefer:

```ts
Role.DOCTOR
ScheduleState.CLOSED
```

or existing domain value objects.

---

# 122. No Duplicate Domain Constants

If backend owns:

```text
ScheduleState
```

do not introduce:

```text
ScheduleStatus
SlotStatus
ScheduleStateValue
```

representing the same concept in different files without explicit distinction.

---

# 123. Avoid Bidirectional Module Knowledge

Prefer:

```text
A → B
```

not:

```text
A ↔ B
```

When both domains need collaboration, introduce an orchestration boundary or event mechanism where appropriate.

---

# 124. Domain Events for Loose Coupling When Semantically Appropriate

If one completed business event triggers secondary effects:

```text
appointment created
    ↓
notification
analytics
audit
```

consider domain/application events.

Do not force synchronous direct dependencies when the behavior is naturally event-driven.

Do not use events merely to avoid understandable direct calls.

---

# 125. Critical Operations May Remain Synchronous

Do not use asynchronous events for state that must succeed atomically.

Examples depend on domain semantics.

Architectural decoupling must not compromise consistency guarantees.

---

# 126. No Hidden Runtime Magic Without Documentation

Avoid dependency behavior that cannot be understood from code navigation.

If decorators, interceptors, proxies, or global providers create important behavior, make the ownership discoverable and documented.

---

# 127. Composition Root Owns Wiring

Dependency wiring belongs at the composition root.

Examples:

```text
NestJS module registration
provider registration
adapter binding
```

Business code should not instantiate infrastructure itself.

Bad:

```ts
const repo = new DrizzleRepository();
```

inside use cases.

---

# 128. Constructor Injection Over Service Locator

Prefer explicit injection.

Avoid:

```text
globalContainer.resolve(...)
```

from arbitrary business code.

Hidden dependency retrieval increases coupling.

---

# 129. Module Boundaries Must Be Enforceable

Where tooling permits, use:

```text
lint rules
path aliases
public exports
dependency graph checks
```

to prevent accidental cross-layer imports.

Architecture should not depend only on developer memory.

---

# 130. No Premature Microservices

Decoupling does not mean splitting everything into separate services.

A well-structured modular monolith is often preferable.

Decouple logically before distributing physically.

---

# 131. No Premature Generic CRUD Abstraction

Do not force every domain into:

```text
GenericCrudService<T>
GenericRepository<T>
GenericController<T>
```

when domains have different invariants.

Generic CRUD often hides business semantics and creates tight coupling.

Abstract only genuinely identical behavior.

---

# 132. Business Use Cases Deserve Explicit Names

Prefer:

```text
CreateAppointment
RescheduleAppointment
CancelAppointment
OpenDoctorSchedule
CloseDoctorSchedule
```

over:

```text
AppointmentCrudService
ScheduleCrudService
```

when behavior contains real domain rules.

---

# 133. Read Models May Differ From Write Models

Do not force the same model everywhere.

Queries may require optimized projections.

Commands may require domain objects.

This separation can reduce accidental coupling.

Use only when it genuinely improves the design.

---

# 134. No Leaky Abstraction

If every consumer must understand internal details of an abstraction to use it correctly, the abstraction is failing.

Example:

A repository should not require callers to know SQL table joins.

A storage port should not require callers to know S3-specific concepts unless explicitly part of the contract.

---

# 135. Optimize for Change Isolation

A good design should make this possible:

```text
Change persistence implementation
→ business logic unchanged

Change logger
→ domain unchanged

Change HTTP transport
→ core use case unchanged

Change response serializer
→ persistence unchanged
```

This is the practical meaning of decoupling.

---

# 136. Change Impact Must Stay Local

When one business rule changes, the agent should not need to modify:

```text
controller
service
repository
utility
mapper
frontend model
database adapter
```

unless each layer is genuinely affected.

If a simple semantic change requires editing many unrelated files, investigate duplication or poor ownership.

---

# 137. Refactoring Acceptance Criteria

A decomposition is successful when:

```text
each unit has clear ownership
dependencies are explicit
business logic is easier to locate
side effects are visible
tests become easier
duplicate knowledge decreases
cross-module imports decrease
orchestration becomes readable
no behavior is accidentally changed
```

File count alone is not evidence of improvement.

---

# 138. Mandatory God Object Detection

Before completing substantial work, inspect modified classes/files for:

```text
multiple unrelated responsibilities
large dependency lists
large public API
mixed infrastructure/domain concerns
deep branching
repeated state logic
repeated mapping logic
random utility methods
```

If detected, decompose before completion.

---

# 139. Mandatory Helper Review

For every new helper, verify:

```text
[ ] It has one meaningful responsibility.
[ ] Its ownership is clear.
[ ] It is located near the correct domain/layer.
[ ] It is not a dumping-ground utility.
[ ] It does not hide unexpected side effects.
[ ] It does not create circular dependencies.
[ ] It does not duplicate an existing helper.
```

---

# 140. Mandatory Dependency Review

For every new dependency/import, verify:

```text
[ ] Dependency direction is correct.
[ ] Core logic does not depend unnecessarily on infrastructure.
[ ] No module internals are bypassed.
[ ] No circular dependency is introduced.
[ ] Existing public contract is used.
```

---

# 141. Mandatory Service Review

For every modified service, verify:

```text
[ ] It still has a coherent responsibility.
[ ] It has not become a God Service.
[ ] New behavior belongs here.
[ ] Number of dependencies remains reasonable.
[ ] Business rules are not duplicated.
[ ] Infrastructure details have not leaked in.
```

---

# 142. Mandatory Function Review

For every substantial function, verify:

```text
[ ] Purpose can be described in one sentence.
[ ] Inputs are explicit.
[ ] Output is explicit.
[ ] Side effects are obvious.
[ ] Nesting is reasonable.
[ ] Business rules are not duplicated elsewhere.
[ ] Extraction candidates were considered.
```

---

# 143. Mandatory Refactoring Report

After a meaningful decomposition/refactor, report:

```text
DECOMPOSITION REPORT

Original responsibility:
...

Problems found:
...

Responsibilities identified:
...

Components extracted:
...

Pure functions extracted:
...

Infrastructure boundaries introduced/reused:
...

Dependencies removed:
...

Dependency direction:
...

God Object risk:
LOW / MEDIUM / HIGH

Circular dependencies:
NONE / describe

Behavior changed:
NO / describe explicitly

Tests performed:
...

Observability preserved:
YES / NO
```

Do not merely report:

```text
"Refactoring completed."
```

---

# 144. Definition of Done

A feature/refactor is NOT complete merely because:

```text
it compiles
tests pass
endpoint returns 200
```

It must also satisfy:

```text
[ ] Responsibilities are coherent.
[ ] No God Object was introduced.
[ ] No God Function was introduced.
[ ] Existing abstractions were reused where appropriate.
[ ] New abstractions have semantic value.
[ ] Pure logic is separated where useful.
[ ] Side effects are explicit.
[ ] Dependency direction is correct.
[ ] No unnecessary circular dependency exists.
[ ] Shared utilities are genuinely shared.
[ ] Domain logic stays with its domain.
[ ] Infrastructure stays at infrastructure boundaries.
[ ] Business logic is independently testable where practical.
[ ] Observability remains intact.
[ ] Existing behavior is preserved unless explicitly changed.
```

---

# 145. Final Architectural Reinforcement

Do not solve complexity by hiding it.

Do not move 500 lines from:

```text
service.ts
```

into:

```text
helpers.ts
```

and call that refactoring.

Do not solve coupling by introducing meaningless interfaces.

Do not solve circular dependencies with `forwardRef()` without investigating architecture.

Do not solve duplication by creating an over-generalized utility.

Do not solve file size by producing dozens of meaningless files.

Instead:

```text
Identify responsibility
        ↓
Identify owner
        ↓
Separate pure logic
        ↓
Separate side effects
        ↓
Define explicit contract
        ↓
Invert infrastructure dependency where appropriate
        ↓
Compose small cohesive units
        ↓
Keep one readable orchestrator
        ↓
Verify dependency direction
        ↓
Verify behavior
```

The desired architecture is not:

```text
everything depends on everything
```

and it is also not:

```text
nothing depends on anything
```

The desired architecture is:

```text
DEPENDENCIES ARE FEW,
INTENTIONAL,
ONE-DIRECTIONAL,
EXPLICIT,
AND BASED ON STABLE CONTRACTS.
```

The ultimate rule is:

> A component should know only what it needs to perform its responsibility and nothing more.

If a feature cannot be understood without opening ten unrelated modules, the boundaries are wrong.

If changing one responsibility requires modifying many unrelated components, the coupling is too high.

If one class understands the database, HTTP, business rules, logging, mapping, validation, caching, and notifications simultaneously, it is a God Object and must be decomposed.

Build small cohesive components, compose them through explicit contracts, keep orchestration readable, and keep infrastructure replaceable.
```

Untuk agent coding, bagian yang paling penting adalah kombinasi tiga aturan: **“extract by responsibility, not by line count”**, **“keep one readable orchestrator”**, dan **“utilities are not dumping grounds.”** Itu mencegah AI melakukan refactor palsu seperti memindahkan 2.000 baris dari `service.ts` menjadi `helpers.ts` tanpa benar-benar mengurangi coupling.
Saya akan membuatnya sebagai **`AGENTS.md` khusus backend contract & changelog enforcement**. Fokusnya bukan sekadar “buat dokumentasi”, tetapi menjadikan dokumentasi sebagai **handoff contract resmi dari backend ke frontend**, sehingga frontend tidak perlu menebak, menduplikasi, atau mengimplementasikan ulang business logic yang sudah disediakan backend.

````markdown
# AGENTS.md — Backend API Contract & Change Log Enforcement

## 1. Purpose

You are a Backend Engineer.

Your responsibility does not end when the backend feature is implemented and the tests pass.

Every backend feature, endpoint, behavior change, response change, validation change, authentication change, authorization change, database-driven behavior, or API contract modification MUST be documented so that frontend engineers can consume the backend correctly without guessing.

The backend is the authoritative source of truth for:

- Business rules
- Data state
- Validation rules
- Resource relationships
- Status values
- Derived states
- Permissions
- Availability
- Scheduling rules
- Error semantics
- API request contracts
- API response contracts
- Backend-generated values
- Backend-generated calculations
- Backend-generated status mappings
- Backend-generated timestamps
- Backend-generated identifiers
- Backend-generated metadata

The frontend is a consumer of these contracts.

The frontend MUST NOT reverse-engineer backend behavior from implementation details, database schemas, source code, or assumptions when an API contract already defines the behavior.

---

# 2. Core Principle

## Backend Implementation Is Not Complete Until Its Contract Is Documented

A feature is considered incomplete if:

1. The backend implementation exists but its API contract is undocumented.
2. A new endpoint exists but the request structure is undocumented.
3. A response exists but its JSON structure is undocumented.
4. New fields were added without documenting their meaning.
5. New status values were introduced without documenting their semantics.
6. Validation rules exist only inside backend code.
7. Error responses are not documented.
8. Authentication or authorization requirements are undocumented.
9. Frontend-specific expectations are unclear.
10. The frontend is forced to inspect backend source code to understand how an endpoint works.
11. The frontend has to guess whether a field is nullable.
12. The frontend has to guess whether a field is optional or required.
13. The frontend has to recreate calculations already performed by the backend.
14. The frontend has to recreate state transitions already defined by the backend.
15. The frontend has to invent fallback behavior because the backend contract is unclear.

A working endpoint without a documented contract is an undocumented dependency.

---

# 3. Single Source of Truth

The backend API contract is the source of truth for frontend integration.

Frontend engineers should be able to understand how to consume a feature without reading backend implementation code.

The documentation MUST answer:

- What feature was added?
- Why does the feature exist?
- What endpoints were added?
- What existing endpoints changed?
- What HTTP methods are supported?
- What URL is used?
- What authentication is required?
- What authorization is required?
- What request body is expected?
- What query parameters are supported?
- What path parameters are required?
- Which fields are required?
- Which fields are optional?
- Which fields are nullable?
- What data types are expected?
- What enum values are valid?
- What validation rules apply?
- What response does the endpoint return?
- What does the JSON response look like?
- What does each response field mean?
- Which fields are generated by the backend?
- Which fields must never be generated by the frontend?
- What errors can occur?
- What HTTP status codes can occur?
- What should the frontend do with the response?
- What should the frontend NOT do?
- Are there pagination rules?
- Are there sorting/filtering rules?
- Are there ordering guarantees?
- Are timestamps UTC or local?
- Are IDs opaque identifiers?
- Are empty collections returned as `[]`?
- Can fields be `null`?
- What happens when there is no data?
- What happens when the resource does not exist?
- What happens when the user is unauthorized?
- What happens when validation fails?
- What changed from the previous contract?

---

# 4. Change Log Is Mandatory

Every completed backend feature MUST produce a changelog entry.

Do not assume that Git history is sufficient documentation.

Git answers:

> "What code changed?"

The API changelog answers:

> "What changed for API consumers?"

These are different concerns.

The changelog MUST describe changes from the perspective of API consumers.

---

# 5. Changelog Location

Before creating a new documentation structure, inspect the existing repository.

Use the existing documentation convention if one already exists.

Search for:

- `CHANGELOG.md`
- `docs/`
- `documentation/`
- `api/`
- `openapi/`
- `swagger/`
- `README.md`
- `contracts/`
- `architecture/`
- Existing API documentation
- Existing feature documentation

Do not create competing documentation systems when one already exists.

If an established convention exists:

> Extend it.

Do not replace it unnecessarily.

If no appropriate contract documentation exists:

> Create a clear backend API contract documentation structure.

Recommended structure:

```text
docs/
├── api/
│   ├── README.md
│   ├── contracts/
│   │   ├── feature-name.md
│   │   └── another-feature.md
│   └── CHANGELOG.md
````

Adapt this structure to the repository instead of blindly enforcing it.

---

# 6. Every New Feature Must Be Documented

For every new backend feature, document:

```text
Feature
├── Purpose
├── Scope
├── Endpoints
├── Authentication
├── Authorization
├── Request Contract
├── Response Contract
├── Error Contract
├── Business Rules
├── State Rules
├── Backend Responsibilities
├── Frontend Responsibilities
├── Frontend Restrictions
└── Compatibility / Breaking Changes
```

---

# 7. Feature Documentation Template

Every feature document SHOULD follow this structure.

````markdown
# Feature: <Feature Name>

## Overview

<Short explanation of what the feature provides.>

## Purpose

<Why this feature exists.>

## Backend Responsibility

The backend is responsible for:

- ...
- ...
- ...

## Frontend Responsibility

The frontend is responsible for:

- ...
- ...
- ...

## Frontend MUST NOT

The frontend MUST NOT:

- ...
- ...
- ...

---

## API Endpoints

### <HTTP METHOD> <PATH>

#### Purpose

<What this endpoint does.>

#### Authentication

Required: Yes / No

#### Authorization

<Required role/permission if applicable.>

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Resource identifier |

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number |

#### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | Bearer token |

#### Request Body

```json
{
  "example": "value"
}
````

#### Request Contract

| Field     | Type   | Required | Nullable | Description   |
| --------- | ------ | -------- | -------- | ------------- |
| `example` | string | Yes      | No       | Example field |

#### Validation Rules

* `example` must not be empty.
* `example` must follow the specified format.
* ...

#### Success Response

HTTP Status:

```text
200 OK
```

Response:

```json
{
  "data": {
    "id": "..."
  }
}
```

#### Response Contract

| Field     | Type   | Nullable | Description         | Backend Generated |
| --------- | ------ | -------- | ------------------- | ----------------- |
| `data.id` | string | No       | Resource identifier | Yes               |

#### Error Responses

##### 400 Bad Request

```json
{
  "statusCode": 400,
  "message": "...",
  "error": "Bad Request"
}
```

##### 401 Unauthorized

```json
{
  "statusCode": 401,
  "message": "...",
  "error": "Unauthorized"
}
```

##### 403 Forbidden

```json
{
  "statusCode": 403,
  "message": "...",
  "error": "Forbidden"
}
```

##### 404 Not Found

```json
{
  "statusCode": 404,
  "message": "...",
  "error": "Not Found"
}
```

---

## Business Rules

<Describe backend-enforced rules.>

## State / Status Semantics

| Value | Meaning | Backend Controlled |
| ----- | ------- | ------------------ |
| `...` | ...     | Yes                |

## Empty State

<Document exactly what the API returns when no data exists.>

Example:

```json
{
  "data": []
}
```

Do not invent frontend fallback values.

## Ordering

<Document ordering guarantees if applicable.>

## Pagination

<Document pagination contract if applicable.>

## Timestamp Semantics

<Document timezone and serialization format.>

## Compatibility

<Document whether this is additive, behavior-changing, or breaking.>

## Frontend Integration Notes

<Important integration instructions.>
```

---

# 8. Endpoint Documentation Is Mandatory

Every endpoint MUST explicitly document:

```text
HTTP Method
URL Path
Purpose
Authentication
Authorization
Path Parameters
Query Parameters
Headers
Request Body
Request Validation
Success Status
Success Response
Response Schema
Error Statuses
Error Responses
Business Rules
Side Effects
Pagination
Sorting
Filtering
Ordering
Empty State
Nullability
Timestamp Semantics
```

Do not document only the endpoint name.

This is insufficient:

```text
GET /appointments
Returns appointments.
```

The frontend engineer needs the actual contract.

---

# 9. Request Contract

The request contract MUST explicitly define:

* Field name
* Data type
* Required/optional
* Nullable/non-nullable
* Allowed values
* Validation constraints
* Format
* Default behavior
* Semantic meaning

Example:

```markdown
| Field | Type | Required | Nullable | Allowed Values |
|-------|------|----------|----------|----------------|
| `status` | string | No | No | `ACTIVE`, `CLOSED` |
| `doctorId` | string | Yes | No | Existing doctor ID |
| `startAt` | ISO-8601 datetime | Yes | No | Valid datetime |
```

Do not leave these details implicit.

---

# 10. Response Contract

The response contract is especially important.

The documentation MUST describe the exact JSON shape.

Example:

```json
{
  "data": {
    "id": "appointment_123",
    "status": "CONFIRMED",
    "scheduledAt": "2026-09-27T08:30:00Z"
  }
}
```

Document:

```text
data
├── id
├── status
└── scheduledAt
```

The frontend must know:

* Which fields exist
* Which fields are nullable
* Which fields are optional
* Which fields are generated
* Which fields are authoritative
* Which fields are derived
* Which fields can change
* Which values are enums
* Which values should be rendered directly
* Which values should not be recalculated

---

# 11. JSON Must Be Treated as a Contract

Do not describe responses only in prose.

Bad:

> The endpoint returns appointment information.

Good:

```json
{
  "data": {
    "id": "string",
    "status": "CONFIRMED",
    "scheduledAt": "2026-09-27T08:30:00Z"
  }
}
```

Then explain every field.

The JSON example MUST reflect the actual implementation.

Do not invent example fields that do not exist.

Do not document fields that the endpoint does not actually return.

---

# 12. Backend-Generated Values

Clearly identify values generated by the backend.

Examples:

```text
id
createdAt
updatedAt
status
availability
expiration
computed totals
derived state
schedule slots
permissions
notification state
booking state
```

If the backend generates a value, document:

```markdown
Backend Generated: Yes
Frontend Input: No
Frontend Modification: Not Allowed
```

This explicitly tells frontend engineers:

> Consume this value. Do not recreate it.

---

# 13. Prevent Frontend Reimplementation

The documentation MUST explicitly identify logic that already belongs to the backend.

Example:

```markdown
## Frontend Must Not Reimplement Backend Logic

The backend already determines:

- Appointment availability
- Appointment status
- Slot state
- Expiration
- Schedule generation
- Permission state
- Booking state
- Derived timestamps
- Resource availability

The frontend MUST consume the values returned by the API.

The frontend MUST NOT independently recreate these calculations.
```

This section is mandatory whenever the backend contains derived business logic.

---

# 14. No Frontend Business-Logic Duplication

If the backend returns:

```json
{
  "status": "AVAILABLE"
}
```

The frontend should consume:

```text
status = AVAILABLE
```

It should not reconstruct:

```text
if currentTime < startTime && currentTime > openingTime:
    status = AVAILABLE
```

If the backend already calculates it, frontend calculation is duplication.

The same principle applies to:

* Schedule generation
* Availability
* Booking state
* Expiration
* Eligibility
* Permissions
* Totals
* Aggregates
* Derived status
* State transitions
* Resource relationships

---

# 15. No Magic Strings in Frontend

If the backend exposes an enum:

```json
{
  "status": "AVAILABLE"
}
```

Document the contract explicitly:

```markdown
### Status Enum

- `AVAILABLE`
- `OCCUPIED`
- `CLOSED`
- `UNSCHEDULED`
```

The frontend should consume these as typed constants/enums according to its architecture.

Do not make frontend developers guess valid values.

---

# 16. No Frontend Fallback for Missing Backend Data

The API contract MUST define empty and unavailable states.

For example:

```json
{
  "data": []
}
```

means:

> There is currently no data.

The frontend MUST NOT invent:

```text
sample data
default doctor
fake schedule
hardcoded date
fallback appointment
placeholder API result
```

If the backend returns an empty result, the frontend should render the documented empty state.

---

# 17. Nullability Must Be Explicit

Never make frontend engineers guess whether a field can be null.

Document:

```text
Nullable: Yes
```

or:

```text
Nullable: No
```

Example:

```json
{
  "data": {
    "imageUrl": null
  }
}
```

must be documented as:

```markdown
`imageUrl`
- Type: string
- Nullable: Yes
- Meaning: User profile image URL.
- `null` means no image has been configured.
```

---

# 18. Error Contract

Every endpoint must document meaningful error cases.

At minimum, consider:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

Only document statuses actually produced by the implementation.

Do not invent error codes.

Document:

```text
HTTP status
Error payload
Meaning
Frontend handling expectation
```

Example:

```json
{
  "statusCode": 409,
  "message": "Appointment already exists",
  "error": "Conflict"
}
```

---

# 19. HTTP Status Codes Are Part of the Contract

Do not treat HTTP status codes as implementation details.

For example:

```text
200 = successful retrieval/update
201 = successful creation
204 = successful operation with no response body
400 = invalid request
401 = authentication required/invalid
403 = authenticated but not authorized
404 = resource not found
409 = resource/state conflict
422 = validation failure when applicable
```

Use the actual application's conventions.

Document deviations explicitly.

---

# 20. Authentication Contract

Every protected endpoint MUST document:

```text
Authentication required
Authentication mechanism
Required token
Required headers
Token source
Session requirements
```

Example:

```markdown
Authentication:
Required

Header:

Authorization: Bearer <access_token>
```

---

# 21. Authorization Contract

Authentication and authorization are different.

Document:

```text
Who can call the endpoint?
What permission is required?
What happens if the user lacks permission?
```

Example:

```markdown
Required roles:

- ADMIN
- DOCTOR

Other authenticated users receive `403 Forbidden`.
```

Use the actual authorization model.

---

# 22. Database Is Not the API Contract

Frontend engineers should not consume database schemas directly as a substitute for API documentation.

The contract is the API.

Document DTOs and API representations, not merely:

```text
users table
appointments table
schedule table
```

A database column does not automatically imply an API field.

---

# 23. DTOs Are Contract Boundaries

Whenever DTOs are used, document the public representation.

Do not assume:

```text
Entity == DTO == JSON Response
```

They may be different.

Document what the client actually receives.

---

# 24. Derived Data Must Be Identified

If the backend returns derived data:

```json
{
  "availableSlots": [...],
  "remainingQuota": 5,
  "isExpired": false
}
```

document that these values are backend-derived.

Example:

```markdown
`isExpired`

- Type: boolean
- Backend-generated: Yes
- Frontend calculation: Not allowed
- Meaning: Whether the backend considers the resource expired at response time.
```

---

# 25. State Machines Must Be Documented

If a feature has states, document them explicitly.

Example:

```text
PENDING
CONFIRMED
CANCELLED
COMPLETED
EXPIRED
```

Document:

```text
State
Meaning
Allowed transitions
Who can trigger transition
Backend authority
```

Example:

```markdown
PENDING -> CONFIRMED
PENDING -> CANCELLED
CONFIRMED -> COMPLETED
CONFIRMED -> CANCELLED
```

Do not force frontend engineers to infer state transitions from UI behavior.

---

# 26. Scheduling Contracts

For scheduling-related features, documentation MUST additionally define:

* Schedule source
* Schedule ownership
* Schedule creation rules
* Slot generation rules
* Slot duration
* Time boundaries
* Timezone
* Availability rules
* Closure rules
* Expiration rules
* Status semantics
* Conflict behavior

If the backend generates schedule slots, explicitly state:

```text
The frontend consumes generated slots.

The frontend MUST NOT generate schedule slots independently.
```

---

# 27. Pagination Contract

If an endpoint is paginated, document:

```text
page
limit
offset
cursor
total
hasNext
hasPrevious
```

and provide an exact response example.

Example:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "hasNext": true
  }
}
```

Do not leave pagination semantics ambiguous.

---

# 28. Sorting and Filtering

Document supported:

```text
Filters
Sort fields
Sort direction
Search behavior
Default ordering
Maximum limits
```

If sorting is backend-controlled, frontend must consume the returned ordering rather than reproducing it locally.

---

# 29. Timestamps

Every timestamp field MUST document:

* Format
* Timezone
* Meaning
* Whether it is server-generated
* Whether clients may send it

Example:

```text
createdAt
Type: ISO-8601 datetime
Timezone: UTC
Backend-generated: Yes
Frontend-generated: No
```

Do not allow ambiguity between:

```text
local time
UTC
server time
device time
```

---

# 30. Backward Compatibility

Every API change MUST be classified.

Use one of:

```text
ADDITIVE
BEHAVIOR CHANGE
DEPRECATION
BREAKING CHANGE
BUG FIX
```

Explain the impact.

Example:

```markdown
## Compatibility

Type: ADDITIVE

A new optional response field `statusLabel` was added.

Existing consumers remain compatible.
```

Or:

```markdown
## Compatibility

Type: BREAKING CHANGE

`appointment.status` changed from a boolean to an enum.
Frontend consumers must update their response model.
```

Do not hide breaking changes.

---

# 31. Changelog Format

Use a consistent structure.

Example:

```markdown
# API Changelog

## [YYYY-MM-DD]

### Added

- Added `POST /api/v1/...`
- Added `GET /api/v1/...`
- Added `<Feature Name>`.

### Changed

- Updated `GET /api/v1/...` response.
- Added `status` to the response contract.

### Deprecated

- Deprecated `<endpoint>`.

### Removed

- Removed `<endpoint>`.

### Fixed

- Corrected `<behavior>`.

### Frontend Impact

- Frontend must consume `status` from the backend.
- Frontend must not calculate `<business rule>`.
- Frontend must handle the documented empty state.
- Frontend must update its response model for `<field>`.
```

---

# 32. Feature Handoff Section

Every new feature MUST include a dedicated frontend handoff section.

Use:

```markdown
## Frontend Handoff

### Consume From Backend

The frontend should consume:

- `<field>`
- `<field>`
- `<status>`
- `<derived value>`

### Do Not Reimplement

The frontend must not implement:

- `<business rule>`
- `<calculation>`
- `<state transition>`
- `<schedule generation>`
- `<availability logic>`

### Required Frontend Models

The frontend needs models for:

- `<DTO>`
- `<Response>`
- `<Enum>`

### Expected UI Behavior

When the API returns:

- `<condition>` → frontend should show the documented state.
- empty data → frontend should show empty state.
- `409` → frontend should handle conflict.
- `403` → frontend should show authorization state according to the application design.
```

This section exists specifically to prevent frontend/backend contract drift.

---

# 33. Contract Before Frontend Implementation

When a backend feature is complete, the frontend team should be able to start integration from documentation.

The intended workflow is:

```text
Backend Implementation
        ↓
Tests
        ↓
API Contract Verification
        ↓
Documentation
        ↓
Changelog
        ↓
Frontend Handoff
        ↓
Frontend Integration
```

Not:

```text
Backend Implementation
        ↓
Frontend guesses API
        ↓
Frontend reads backend source code
        ↓
Frontend invents missing behavior
        ↓
Frontend duplicates backend logic
        ↓
Integration problems
```

---

# 34. Do Not Document From Assumptions

Documentation MUST be based on the actual implementation.

Before documenting an endpoint:

1. Inspect the route/controller.
2. Inspect the request DTO/schema.
3. Inspect validation rules.
4. Inspect service/business logic.
5. Inspect response DTO/serializer.
6. Inspect authorization guards/policies.
7. Inspect relevant tests.
8. Verify actual HTTP status codes.
9. Verify actual JSON response shape.
10. Verify actual error behavior.

Then document it.

Never write a contract based solely on what the feature was intended to do.

The implementation and tests are the evidence.

---

# 35. Documentation Must Match Reality

The following is unacceptable:

```text
Documentation says:
status = AVAILABLE

Implementation returns:
status = OPEN
```

This creates a broken contract.

Likewise:

```text
Documentation says:
imageUrl is always string

Implementation returns:
imageUrl = null
```

This is also a broken contract.

The contract must match the actual API.

---

# 36. Verify Documentation Against Tests

Where practical, compare documentation against:

* Integration tests
* E2E tests
* DTO validation
* Controller behavior
* OpenAPI definitions
* Response serializers

If documentation contradicts tests or implementation:

> Fix the documentation or implementation so that one authoritative contract exists.

Do not knowingly leave contradictory documentation.

---

# 37. No Silent API Changes

Never silently modify:

```text
Response fields
Request fields
Field types
Nullability
Enum values
HTTP status codes
Error structure
Endpoint paths
Authentication requirements
Authorization requirements
Business semantics
```

Every externally observable API change requires a changelog entry.

---

# 38. Contract Review Checklist

Before declaring a feature complete, verify:

```text
[ ] Feature documented
[ ] Endpoint documented
[ ] HTTP method documented
[ ] URL documented
[ ] Authentication documented
[ ] Authorization documented
[ ] Path parameters documented
[ ] Query parameters documented
[ ] Headers documented
[ ] Request body documented
[ ] Request field types documented
[ ] Required fields documented
[ ] Optional fields documented
[ ] Nullable fields documented
[ ] Validation documented
[ ] Success status documented
[ ] Exact JSON response documented
[ ] Response fields documented
[ ] Backend-generated fields documented
[ ] Enum values documented
[ ] State transitions documented where applicable
[ ] Empty state documented
[ ] Error statuses documented
[ ] Error payloads documented
[ ] Pagination documented where applicable
[ ] Sorting documented where applicable
[ ] Filtering documented where applicable
[ ] Timestamp semantics documented
[ ] Frontend responsibilities documented
[ ] Frontend restrictions documented
[ ] Backend-derived logic identified
[ ] Frontend duplication explicitly prohibited where applicable
[ ] Compatibility impact documented
[ ] Changelog updated
[ ] Documentation verified against implementation
[ ] Documentation verified against tests
```

---

# 39. Definition of Done

A backend feature is NOT considered complete until:

```text
Implementation
    +
Tests
    +
API Contract
    +
JSON Response Documentation
    +
Error Contract
    +
Business Rule Documentation
    +
Frontend Handoff
    +
Changelog
```

are complete.

The absence of documentation is a completion failure, not a cosmetic issue.

---

# 40. Backend Engineer Mindset

Think of every API as a public contract between the backend and its consumers.

Your job is not merely:

> "Make the endpoint work."

Your job is:

> "Make the endpoint work, define its contract, document its behavior, document its constraints, and make the contract consumable by another engineer without requiring them to reverse-engineer the backend."

The frontend engineer should not need to ask:

> "What does this field mean?"

> "Can this be null?"

> "What status values are valid?"

> "Should I calculate this myself?"

> "What happens if there is no data?"

> "What error do I handle?"

> "Who is allowed to call this?"

> "Does the backend already calculate this?"

> "How do I know whether this resource is expired?"

The contract documentation must answer these questions before frontend implementation begins.

---

# 41. Anti-Pattern: Backend Works, Documentation Does Not Exist

This is NOT acceptable:

```text
Feature implemented
✓

Tests pass
✓

Endpoint works
✓

Documentation
✗

Changelog
✗
```

The feature is incomplete.

Correct:

```text
Feature implemented
✓

Tests pass
✓

Endpoint verified
✓

Contract documented
✓

JSON response documented
✓

Error behavior documented
✓

Frontend handoff documented
✓

Changelog updated
✓
```

---

# 42. Anti-Pattern: Frontend Reads Backend Source Code

Do not make frontend engineers inspect:

```text
controllers
services
repositories
entities
database queries
internal helper functions
```

to understand the public API.

Internal implementation details are not an acceptable API contract.

Expose the necessary public behavior through documentation.

---

# 43. Anti-Pattern: Frontend Recreates Backend Logic

If backend already provides:

```json
{
  "status": "EXPIRED"
}
```

do not require frontend to determine:

```text
now > expiresAt
```

If backend already provides:

```json
{
  "availableSlots": [...]
}
```

do not require frontend to generate slots.

If backend already provides:

```json
{
  "canEdit": false
}
```

do not require frontend to reconstruct authorization rules.

Consume the backend contract.

---

# 44. Anti-Pattern: Documentation as an Afterthought

Do not wait until weeks later to document an API.

Documentation must be created as part of feature completion.

The closer documentation is created to implementation, the lower the chance of contract drift.

---

# 45. Final Enforcement Rule

For every backend feature you implement:

> **Document what changed, document the API contract, document the exact JSON shape, document the business semantics, document errors, document backend responsibilities, document frontend responsibilities, explicitly identify logic the frontend must not duplicate, and update the changelog before declaring the feature complete.**

If another engineer cannot integrate the feature using the documentation without inspecting backend implementation code, the documentation is insufficient.

The backend is the source of truth.

The API contract is the communication boundary.

The changelog is the historical record of contract evolution.

The frontend consumes the contract; it does not invent or duplicate it.

```
```
