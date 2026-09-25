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