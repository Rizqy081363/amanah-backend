# Backend Architecture Rules

**Catalog 1 of 3** — structure, layering, modules, dependency management, persistence, domain modeling, naming.

> **Scope:** server-side application code. Framework-agnostic by intent; written for a dependency-injected, module-oriented runtime, and maps directly onto module/provider frameworks.
>
> **Companion catalogs:** `API-DESIGN-RULES.md` (contract surface), `RUNTIME-SECURITY-OPS-RULES.md` (security, reliability, containers).
>
> **Normativity:** **MUST** = violation blocks merge. **SHOULD** = deviation requires a written justification in the PR. **MAY** = permitted, at the author's discretion.
>
> **Precedence:** explicit instruction in the current task → this catalog → conventions of the touched module → framework defaults.
>
> **Form:** this is a catalog of rules and paradigms only. It deliberately contains no code. Implementation belongs in the codebase, not in the wiki.

---

## Index

- [§1 Foundational principles](#1-foundational-principles) — ARC-001…015
- [§2 Layering and dependency direction](#2-layering-and-dependency-direction) — ARC-016…035
- [§3 Module boundaries](#3-module-boundaries) — ARC-036…052
- [§4 Dependency injection and composition](#4-dependency-injection-and-composition) — ARC-053…067
- [§5 Repository pattern and persistence](#5-repository-pattern-and-persistence) — ARC-068…107
- [§6 Domain modeling](#6-domain-modeling) — ARC-108…125
- [§7 Use cases and application services](#7-use-cases-and-application-services) — ARC-126…138
- [§8 Boundary types, mapping, error architecture](#8-boundary-types-mapping-error-architecture) — ARC-139…158
- [§9 Naming conventions](#9-naming-conventions) — ARC-159…188
- [§10 Code hygiene](#10-code-hygiene) — ARC-189…200

---

## §1 Foundational principles

**ARC-001 — Single source of truth.** Every concept (a contract, an enum, a limit, a route, a permission) has exactly one authoritative definition. Everything else derives from it. If one change requires edits in more than two files, the principle is broken.

**ARC-002 — Separation of concerns.** Each unit has one reason to change. Transport handling, orchestration, business rules, and persistence are four different reasons.

**ARC-003 — The dependency rule.** Dependencies point inward: delivery → application → domain. Inner layers know nothing about outer layers. Compile-time direction is the architecture.

**ARC-004 — Depend on abstractions at process boundaries.** Database, HTTP clients, message brokers, cache, filesystem, clock, randomness, and identifier generation are accessed through interfaces owned by the inner layer.

**ARC-005 — Explicit over implicit.** No ambient globals, no hidden singletons, no behaviour that depends on file naming or import order. Wiring is readable in one place.

**ARC-006 — Fail fast at the edge, trust the core.** Everything crossing a trust boundary is validated once, at entry. Past that point, data is typed and assumed valid.

**ARC-007 — Push I/O outward.** Business rules are expressed as pure decisions over data; side effects happen at the edges. Logic that requires a database connection to test is misplaced.

**ARC-008 — Composition over inheritance.** Inheritance is reserved for genuine substitutability. Shared behaviour is injected or composed, never inherited from an abstract base "to avoid duplication".

**ARC-009 — Rule of least power.** Choose the simplest construct that satisfies the requirement: a function before a class, a class before a framework feature, a framework feature before a new dependency.

**ARC-010 — Abstraction must be earned.** An interface is justified by a second real implementation or by a testability need. Aesthetics are not a justification.

**ARC-011 — No speculative generality.** Do not build for requirements that do not exist. Plugin systems, generic CRUD superclasses, and configuration for a single caller are defects.

**ARC-012 — Optimize for deletion.** A capability should be removable by deleting its module and its migrations. If deletion requires archaeology, the boundaries are wrong.

**ARC-013 — Consistency beats preference.** Within one codebase, follow the established pattern even when a different one is marginally better. Change the pattern by amending this catalog, not by diverging locally.

**ARC-014 — Complexity must be paid for.** Every layer, indirection, and dependency has a permanent maintenance cost. Introduce it only against a named problem.

**ARC-015 — Correct before fast.** Optimize only against a measurement. Performance claims without a benchmark are opinions.

---

## §2 Layering and dependency direction

**ARC-016 — Four layers.** Delivery (HTTP controllers, message consumers, schedulers, CLI), Application (use cases), Domain (entities, value objects, policies, domain services), Infrastructure (repositories, external clients, adapters). Every file belongs to exactly one.

**ARC-017 — Delivery translates, nothing more.** It converts transport input into application input, invokes one use case, and converts the result into a transport response.

**ARC-018 — No business rules in delivery.** Conditionals expressing policy, pricing, eligibility, or state transitions do not belong in a controller.

**ARC-019 — Delivery must not touch persistence.** A controller that injects a repository, ORM session, or query builder is a layering violation.

**ARC-020 — One use case per endpoint.** A delivery handler orchestrating several use cases is doing application work; move the orchestration inward.

**ARC-021 — Framework transport objects stop at the boundary.** Request, response, headers, cookies, socket, and message envelope types never appear in application or domain signatures.

**ARC-022 — The domain layer has no framework imports.** No decorators from the web framework, no ORM annotations, no serialization library, no logging framework.

**ARC-023 — Persistence concerns do not shape the domain.** Column types, cascade rules, and lazy-loading behaviour must not dictate domain design. Where the ORM model and the domain model are deliberately unified for pragmatism, that decision is recorded once and applied consistently.

**ARC-024 — Ports are defined inward, adapters implemented outward.** The interface lives with its consumer; the implementation lives in infrastructure.

**ARC-025 — Infrastructure never calls application or domain use cases.** An adapter that orchestrates has become a use case in the wrong folder.

**ARC-026 — No layer skipping.** Delivery calls application; application calls domain and ports. Delivery never calls a repository; domain never calls a controller.

**ARC-027 — Every entrypoint shares the same core.** HTTP, queue consumer, cron job, CLI command, and admin tooling all invoke the same use cases. No path may bypass validation, authorization, or auditing.

**ARC-028 — Scheduled and event-driven entrypoints are delivery, not application.** They are thin adapters with their own retry and idempotency posture.

**ARC-029 — Cross-cutting concerns are implemented once.** Authentication, correlation IDs, logging, serialization, rate limiting, and error translation live in middleware, interceptors, guards, or filters — never copy-pasted into handlers.

**ARC-030 — The cross-cutting pipeline order is documented.** Which interceptor runs before which guard is behaviour, and undocumented behaviour is accidental.

**ARC-031 — Cross-cutting components must not contain business logic.** A guard may decide access; it may not mutate domain state.

**ARC-032 — Configuration is injected as typed objects.** No layer reads raw environment variables directly except the single configuration module.

**ARC-033 — Clock, randomness, and ID generation are injected.** Non-determinism accessed directly makes logic untestable and time-dependent bugs unreproducible.

**ARC-034 — Serialization is a delivery concern.** The domain does not know about JSON, field casing, or wire formats.

**ARC-035 — Layer violations are enforced mechanically.** Import boundaries are checked in CI. A rule that is not enforced is a suggestion.

---

## §3 Module boundaries

**ARC-036 — A module is a business capability.** Modules are named after domain nouns (billing, catalog, identity), not technical roles (services, helpers, controllers).

**ARC-037 — Group by feature first, by layer second.** The top level of the source tree reflects the business, not the framework.

**ARC-038 — A module owns its data.** No other module reads or writes its tables, collections, or indexes directly.

**ARC-039 — A module has a declared public surface.** Everything not explicitly exported is internal and may change without notice.

**ARC-040 — Cross-module access goes through the public surface.** Never through repositories, entities, private services, or direct database access.

**ARC-041 — Prefer events over synchronous coupling.** When module A merely needs to react to module B, subscribe to an event rather than calling into B.

**ARC-042 — Circular module dependencies are forbidden.** Break the cycle by inverting a dependency, extracting a shared abstraction, or introducing an event. Forward references that hide a cycle are not a fix.

**ARC-043 — Shared modules are generic or they are not shared.** A shared/common module must not depend on any feature module.

**ARC-044 — The rule of two.** Code moves into a shared module when a second consumer actually exists, not in anticipation of one.

**ARC-045 — One module, one bounded vocabulary.** The same word may mean different things in different modules; do not force a single universal model. Translate at the boundary instead.

**ARC-046 — Split a module when it hosts unrelated aggregates.** Two independent lifecycles in one module is a merge-conflict factory and a future service boundary ignored.

**ARC-047 — Module boundaries are candidate service boundaries.** Design them so extraction later requires replacing a call, not rewriting a domain.

**ARC-048 — Avoid distributed transactions across modules.** Prefer one local transaction plus an event; accept eventual consistency deliberately and document the window.

**ARC-049 — Each module owns its configuration namespace.** Configuration keys are prefixed by module so ownership is unambiguous.

**ARC-050 — Each module owns its migrations.** Migration names identify the owning module so schema ownership is traceable.

**ARC-051 — Each module owns its error codes.** Codes are namespaced by module to prevent collisions and to make triage instant.

**ARC-052 — Do not extract microservices to solve a code organization problem.** A modular monolith solves boundaries; distribution adds network failure modes. Split processes only for independent scaling, isolation, or team autonomy reasons that are written down.

---

## §4 Dependency injection and composition

**ARC-053 — Constructor injection only.** No property injection, no setter injection, no post-construction mutation of dependencies.

**ARC-054 — No service locator.** Runtime container lookups hide the dependency graph and defeat static analysis.

**ARC-055 — Inject interfaces, not implementations, across process boundaries.** Injecting a concrete class is acceptable for pure in-process collaborators with no I/O.

**ARC-056 — One composition root.** Implementation selection (real vs fake, provider A vs B, flagged variants) happens in one place, never scattered through conditionals in business code.

**ARC-057 — Providers are stateless by default.** Any instance field that survives a request must be immutable, a connection pool, or a deliberately documented cache.

**ARC-058 — Singleton is the default lifetime.** Request-scoped dependencies are contagious, degrade performance, and are permitted only when the dependency genuinely carries per-request identity.

**ARC-059 — Request context travels explicitly or through a context propagation mechanism** — never through a mutable global that the next request can observe.

**ARC-060 — No I/O in constructors.** No connections opened, no files read, no HTTP calls. Use explicit lifecycle initialization.

**ARC-061 — Startup work is ordered and observable.** Initialization declares its dependencies, logs its outcome, and fails the process loudly on error.

**ARC-062 — Lifecycle hooks are idempotent.** Initialization and shutdown may be invoked more than once under orchestration; they must tolerate it.

**ARC-063 — Shutdown releases everything it acquired.** Connections, consumers, timers, watchers, and in-flight work are drained or cancelled explicitly.

**ARC-064 — Global mutable state is forbidden.** Module-level caches, counters, and flags are per-process hidden state that breaks horizontal scaling and tests.

**ARC-065 — Optional dependencies are discouraged.** An optional dependency usually means two classes wearing one name.

**ARC-066 — Keep constructor arity small.** More than roughly five dependencies indicates the class has more than one responsibility.

**ARC-067 — Test doubles are wired at the composition root, not by monkey-patching modules.** If a seam requires patching internals, the seam is missing.

---

## §5 Repository pattern and persistence

### 5.1 Shape of the abstraction

**ARC-068 — One repository per aggregate root, not per table.** Child tables are persisted through the aggregate that owns them.

**ARC-069 — The repository interface belongs to the inner layer; the implementation to infrastructure.** This is the dependency inversion that makes the core testable without a database.

**ARC-070 — Repository methods speak the domain's language.** Names describe intent, not storage mechanics or query shape.

**ARC-071 — Repositories accept and return domain objects.** Rows, documents, ORM entities, and query results never escape the adapter.

**ARC-072 — No query construction outside a persistence adapter.** Query builders, raw SQL, ORM sessions, and aggregation pipelines appear nowhere else in the codebase.

**ARC-073 — Repositories contain no business rules.** No pricing, no eligibility checks, no cross-aggregate mutation, no orchestration.

**ARC-074 — The persistence model may differ from the domain model.** When it does, mapping is explicit and field-by-field. Blind object spreading between the two is forbidden.

**ARC-075 — A generic CRUD base repository is a smell.** It couples all aggregates to one lowest-common-denominator interface and invites leaking storage semantics upward.

**ARC-076 — Expose intent-revealing finders, not a generic query API.** A repository that accepts arbitrary filter objects has re-implemented SQL with fewer guarantees.

**ARC-077 — Complex criteria are modeled as named specifications** owned by the domain, translated to storage terms by the adapter.

### 5.2 Query behaviour

**ARC-078 — Absence is a normal outcome.** Finders return an explicit empty result; they do not throw for "not found". Throwing is the caller's decision.

**ARC-079 — Existence checks use a dedicated existence query.** Fetching an entity to test a boolean wastes I/O and often hides an N+1.

**ARC-080 — Every collection query is bounded.** A mandatory limit with a hard server-side ceiling; unbounded reads are forbidden regardless of current table size.

**ARC-081 — Keyset (cursor) pagination for large or growing datasets.** Offset pagination degrades and is permitted only for small, bounded, internal views.

**ARC-082 — Sort keys must be indexed and deterministic.** Every sort includes a unique tiebreaker, otherwise pagination silently duplicates and drops rows.

**ARC-083 — Filter and sort fields are an allowlist.** Client input is mapped to columns through a fixed table; input never becomes a column name, operator, or direction verbatim.

**ARC-084 — N+1 access patterns are defects.** Load collections in a single query or batch them explicitly.

**ARC-085 — Select only the columns needed.** Blanket selection of every column, including large blobs, is a default that must be overridden deliberately.

**ARC-086 — Every query has a timeout.** Statement-level limits are configured; no query may run unbounded.

**ARC-087 — Read and write models may diverge.** Reporting and list projections may bypass the aggregate, but must be named distinctly and must never be used for writes.

**ARC-088 — Caching is explicit and invalidated by the writer.** A cache without a documented invalidation trigger and TTL is a correctness bug waiting to be observed.

### 5.3 Transactions and consistency

**ARC-089 — The application layer owns the transaction boundary.** A use case decides what is atomic; repositories participate but do not open their own.

**ARC-090 — One transaction per use case.** Nested or ambient transactions must be explicit and justified.

**ARC-091 — One transaction changes one aggregate.** Multi-aggregate atomicity is a modeling signal: either the boundary is wrong or the consistency should be eventual.

**ARC-092 — No external I/O inside a transaction.** HTTP calls, emails, publishes, and file writes hold locks for the duration of someone else's latency.

**ARC-093 — Side effects fire after commit.** Use an outbox or an after-commit hook so nothing is published for a transaction that rolled back.

**ARC-094 — Keep transactions short.** Long transactions escalate locks, block vacuum/compaction, and exhaust the pool.

**ARC-095 — Optimistic concurrency for concurrently edited entities.** A version or timestamp guard, with a defined conflict outcome surfaced to the caller.

**ARC-096 — Pessimistic locks are last resort.** Always with a timeout, always acquired in a consistent global order, always released on every path.

**ARC-097 — Retries on serialization failures are explicit and bounded**, and only for operations that are safe to repeat.

**ARC-098 — Isolation level is a conscious decision per use case** where it deviates from the database default, and is documented at the call site.

### 5.4 Schema and data

**ARC-099 — Schema changes are versioned, forward-only migrations.** Automatic schema synchronization is forbidden in every deployed environment.

**ARC-100 — Migrations are backward compatible with the previous release.** Expand first, migrate data, contract in a later release, so rolling deploys and rollbacks never break.

**ARC-101 — Destructive changes ship separately.** Drops and renames occur only after the deployed code no longer references the object.

**ARC-102 — Data backfills are idempotent, resumable, and batched** — never a single unbounded statement inside a deploy step.

**ARC-103 — Reference data is seeded by migration**, never by a manual production step.

**ARC-104 — Every foreign key relationship is declared or deliberately not.** The choice is documented; accidental orphan data is not acceptable.

**ARC-105 — Money is stored as integer minor units or exact decimal.** Floating point for currency is forbidden.

**ARC-106 — Timestamps are stored in UTC with timezone-aware types.** Local time and naive timestamps never enter the database.

**ARC-107 — Identifiers are surrogate and opaque.** Sequential integers that leak volume or allow enumeration are avoided on public resources; prefer time-ordered unique identifiers for insert locality without exposing counts.

---

## §6 Domain modeling

**ARC-108 — Model behaviour where rules exist; stay simple where they do not.** Rich modeling for a table with no invariants is ceremony; anemic modeling for a domain with complex rules is technical debt.

**ARC-109 — Invariants are enforced at construction.** An object that cannot exist in an invalid state removes an entire class of defects.

**ARC-110 — Objects validate themselves, not their callers.** A rule enforced at three call sites will be missed at the fourth.

**ARC-111 — Use value objects for concepts with value equality.** Money, email, date range, quantity, identifier. Primitive obsession spreads validation everywhere.

**ARC-112 — Value objects are immutable.** Change produces a new instance.

**ARC-113 — Aggregates are consistency boundaries,** chosen from transactional requirements, not from the shape of a UI screen.

**ARC-114 — Aggregates reference each other by identity, never by object reference.** Object graphs that span aggregates produce accidental loading and accidental transactions.

**ARC-115 — Keep aggregates small.** A large aggregate concentrates contention and lock conflicts.

**ARC-116 — Domain services hold rules that belong to no single entity,** and remain free of I/O.

**ARC-117 — State transitions are modeled explicitly.** Legal transitions are enumerated; illegal transitions are rejected by the domain, not by a database constraint alone.

**ARC-118 — One calculation, one implementation.** Totals, discounts, taxes, and scoring are computed in one place used by every path, including reports.

**ARC-119 — Domain events describe facts in the past tense,** named after what happened, not after what should happen next.

**ARC-120 — Events carry identifiers and minimal payload.** Consumers re-read what they need; fat events couple producers to consumer needs.

**ARC-121 — Events are immutable and versioned.** An event's meaning never changes after release; new meaning is a new version.

**ARC-122 — Publishing an event is not the same as calling a handler.** Producers must not know their consumers, and must not depend on handler outcomes.

**ARC-123 — Format validation belongs at the boundary; business validation belongs in the domain.** "Is this a well-formed email" and "may this customer order" are different questions answered in different layers.

**ARC-124 — Domain concepts use the business's vocabulary.** If the business says "settlement", the code says settlement, not "payment_batch_2".

**ARC-125 — Avoid modeling by database table.** Tables are storage; the domain is the model. They may coincide, but the domain decides.

---

## §7 Use cases and application services

**ARC-126 — One use case, one responsibility, one imperative name.** A class that handles "create, update, and archive" is three use cases.

**ARC-127 — Use cases have dedicated input and output types.** Not transport DTOs, not entities, not database rows.

**ARC-128 — Use cases are transport-agnostic.** No status codes, headers, HTTP verbs, queue metadata, or serialization concerns.

**ARC-129 — A use case orchestrates, it does not decide.** Fetch, delegate the decision to the domain, persist, emit. Long conditional chains inside a use case indicate missing domain logic.

**ARC-130 — Authorization is enforced in the application layer.** Delivery-layer guards are a first filter, not the security boundary, because other entrypoints exist.

**ARC-131 — Authorization decisions are centralized in policies,** not duplicated as inline role checks across handlers.

**ARC-132 — Ownership checks are mandatory for every resource-scoped operation.** Authenticated is not authorized; the caller must be proven to own or be permitted the specific object.

**ARC-133 — Use cases invoked by retryable transports must be idempotent,** keyed on a caller-supplied or message-derived identifier.

**ARC-134 — Use case failures are typed application or domain errors,** never framework exceptions and never bare strings.

**ARC-135 — Use cases do not call other use cases as a habit.** Share a domain service, or orchestrate at a higher level; deep chains hide transaction and authorization boundaries.

**ARC-136 — Auditing of state-changing operations happens in the application layer,** so every entrypoint is covered uniformly.

**ARC-137 — Batch operations declare their failure semantics:** all-or-nothing, or per-item with a result report. Silent partial success is forbidden.

**ARC-138 — A use case must be testable with in-memory adapters alone.** If it cannot be, a boundary is missing.

---

## §8 Boundary types, mapping, error architecture

**ARC-139 — Validate at every trust boundary.** HTTP requests, queue messages, webhook payloads, CLI arguments, configuration, third-party API responses, and data read from another system's storage.

**ARC-140 — Third-party responses are untrusted input.** Parse them; do not assume the contract held.

**ARC-141 — One schema per input, and it is the source of truth for the type.** Types are derived from the schema; parallel hand-written types drift.

**ARC-142 — Unknown properties are handled by an explicit, uniform policy** — either rejected or stripped. Silent pass-through allows mass assignment.

**ARC-143 — Mass assignment is forbidden.** Fields are bound from input to model by allowlist only.

**ARC-144 — DTOs are per-direction and per-use case.** A request type is never reused as a response type, a persistence model, or a domain object.

**ARC-145 — Mapping is explicit and total.** Every field of the target is assigned deliberately; spreading objects across layers leaks fields that were never meant to be exposed.

**ARC-146 — Response shaping uses an allowlist.** New sensitive columns must not become publicly visible by default.

**ARC-147 — Serialization of a domain object is never the API contract.** The contract is a separate, deliberately designed type.

**ARC-148 — Define the error taxonomy once,** distinguishing at minimum: validation, authentication, authorization, not-found, conflict, rate-limit, dependency failure, and unexpected.

**ARC-149 — Every error carries a stable machine-readable code.** Messages are human text and may be rewritten; codes are contract.

**ARC-150 — Error codes are namespaced by module** and never reused for a different meaning.

**ARC-151 — Infrastructure exceptions are translated at the adapter boundary.** Driver, ORM, and HTTP client exceptions never propagate into the application layer.

**ARC-152 — Expected outcomes are not exceptions by default.** Not-found and conflict may be modeled as results; whichever style is chosen is applied consistently and mapped uniformly at delivery.

**ARC-153 — Catch narrowly, never generically, except at the outermost handler.** A broad catch in business code hides defects.

**ARC-154 — Never swallow.** A caught error is handled, enriched and rethrown, or reported. Empty catch blocks are defects.

**ARC-155 — Enrich, do not replace.** Preserve the original cause when wrapping so the root cause survives to the logs.

**ARC-156 — Internal details never reach the client.** No stack traces, SQL fragments, hostnames, connection strings, library names, or upstream payloads.

**ARC-157 — One global error translator maps internal errors to transport responses.** Handlers do not craft error responses individually.

**ARC-158 — Unexpected errors are reported; expected ones are not.** Validation and not-found noise drowns the signal that matters.

---

## §9 Naming conventions

### 9.1 Structure

**ARC-159 — Folders are named after capabilities, in the singular,** using one casing convention project-wide.

**ARC-160 — File names describe the artifact and its role,** with a consistent suffix scheme that makes the layer obvious at a glance.

**ARC-161 — One primary export per file, and the file is named after it.**

**ARC-162 — Suffixes are reserved and meaningful:** controller, use case/service, repository, mapper, entity, value object, policy, event, handler/consumer, job, adapter, client, config, error. A suffix is never decorative.

**ARC-163 — Never suffix by layer where it adds nothing.** A class named for a technical pattern with no domain noun tells the reader nothing.

### 9.2 Symbols

**ARC-164 — Classes and types use the domain noun,** never abbreviations, never hungarian prefixes, never a leading marker letter on interfaces.

**ARC-165 — Methods begin with a verb that reveals intent.** Retrieval, creation, mutation, and calculation verbs are used consistently across the codebase.

**ARC-166 — Verb vocabulary is fixed and consistent:** one verb for retrieval-or-absent, one for retrieval-or-error, one for creation, one for full replacement, one for partial change, one for removal. Synonyms are not interchangeable.

**ARC-167 — Booleans read as assertions,** using a consistent affirmative prefix. Negative names are forbidden because they produce double negation.

**ARC-168 — Collections are plural; single items are singular.** Maps are named by their key relationship.

**ARC-169 — Asynchronous functions are not marked by a suffix;** the type system states it.

**ARC-170 — Identifiers are named with their entity,** so a bare identifier never appears in a signature with two identifier parameters.

**ARC-171 — Units are in the name** for durations, sizes, and rates. A bare number in a signature is a future incident.

**ARC-172 — Acronyms follow one casing rule project-wide.**

**ARC-173 — Banned names:** data, info, item, manager, helper, util, processor, handler-without-a-noun, base-prefixed classes, temp, misc, common, and any name with a trailing digit.

### 9.3 Data and infrastructure

**ARC-174 — Table names use one convention, applied without exception,** including pluralization and casing.

**ARC-175 — Column names are snake-cased, unabbreviated, and unprefixed by the table name.**

**ARC-176 — Foreign key columns are named after the referenced entity plus the identifier suffix.**

**ARC-177 — Timestamp columns use consistent past-tense naming** and a uniform suffix for the moment they record.

**ARC-178 — Boolean columns are named as assertions,** matching the code convention.

**ARC-179 — Index names encode table, columns, and index type,** so their purpose is readable in a migration diff.

**ARC-180 — Constraint names are explicit,** never database-generated, so migrations are reversible across environments.

**ARC-181 — Migration file names carry a sortable timestamp and an imperative description of the change.**

**ARC-182 — Enumerated values are lowercase stable strings,** never ordinal integers tied to declaration order.

### 9.4 Messaging, configuration, observability

**ARC-183 — Event names are past tense and namespaced** by domain and entity, with a version marker where the schema can evolve.

**ARC-184 — Queue and topic names encode owner, purpose, and environment** under one project-wide grammar.

**ARC-185 — Job names are imperative and unique across the system.**

**ARC-186 — Environment variables are uppercase, namespaced by concern, and never abbreviated.** Names state what they configure, not where the value came from.

**ARC-187 — Log field keys are a fixed, documented vocabulary.** The same concept always uses the same key across every module.

**ARC-188 — Metric names follow one naming grammar** with units in the name and labels of bounded cardinality.

---

## §10 Code hygiene

**ARC-189 — Files stay short enough to read in one screenful of scrolling.** Length limits are enforced by lint and split by responsibility, never arbitrarily.

**ARC-190 — Functions do one thing at one level of abstraction.** Mixed levels within a function are a refactoring signal.

**ARC-191 — More than three parameters becomes a named input object.**

**ARC-192 — Boolean parameters that select behaviour are forbidden.** Split the function.

**ARC-193 — Guard clauses over nesting.** Deep nesting hides conditions and is a defect vector.

**ARC-194 — No magic values.** Every literal with meaning is a named constant with a single home.

**ARC-195 — Dead code is deleted, not commented out.** Version control is the archive.

**ARC-196 — Markers such as TODO carry an owner and a tracking reference,** or they are not merged.

**ARC-197 — Ad-hoc console output is forbidden in committed code.** All output goes through the structured logger.

**ARC-198 — Public surfaces are documented at the contract level,** stating behaviour, failure modes, and invariants — not restating the signature.

**ARC-199 — Static analysis, type checking, and formatting are non-negotiable CI gates,** identical locally and in the pipeline.

**ARC-200 — Deviations from this catalog require a recorded decision.** A written decision record names the context, the choice, the consequences, and the alternatives rejected. Undocumented deviation is a defect, not a style.
