# API Design Rules

**Catalog 2 of 3** — resource modeling, URI naming, HTTP semantics, payload conventions, collections, errors, versioning, idempotency, contracts.

> **Scope:** the public and internal HTTP surface of the backend. Transport-level conventions only; internal structure is covered in `BACKEND-ARCHITECTURE-RULES.md`, runtime posture in `RUNTIME-SECURITY-OPS-RULES.md`.
>
> **Normativity:** **MUST** blocks merge. **SHOULD** requires written justification. **MAY** is discretionary.
>
> **Governing idea:** the API is a product with an SLA on its shape. Internal refactors are free; contract changes are never free.
>
> **Form:** rules and paradigms only. No code, no payload samples — those belong in the machine-readable specification.

---

## Index

- [§1 Resource modeling and URI naming](#1-resource-modeling-and-uri-naming) — API-001…025
- [§2 HTTP method semantics](#2-http-method-semantics) — API-026…042
- [§3 Status codes](#3-status-codes) — API-043…060
- [§4 Payload conventions](#4-payload-conventions) — API-061…085
- [§5 Collections: pagination, filtering, sorting, search](#5-collections-pagination-filtering-sorting-search) — API-086…105
- [§6 Error contract](#6-error-contract) — API-106…122
- [§7 Versioning and evolution](#7-versioning-and-evolution) — API-123…138
- [§8 Idempotency, concurrency, caching](#8-idempotency-concurrency-caching) — API-139…156
- [§9 Asynchronous, bulk, and long-running operations](#9-asynchronous-bulk-and-long-running-operations) — API-157…168
- [§10 Webhooks and outbound callbacks](#10-webhooks-and-outbound-callbacks) — API-169…178
- [§11 Files, streaming, and non-JSON payloads](#11-files-streaming-and-non-json-payloads) — API-179…186
- [§12 Contract governance](#12-contract-governance) — API-187…200

---

## §1 Resource modeling and URI naming

**API-001 — Model resources, not procedures.** The URI identifies a thing; the method states the action. An API whose paths are verbs has reinvented RPC over HTTP without its benefits.

**API-002 — Resource names are plural nouns.** Collections and their members share the same noun; a singular collection is never mixed in.

**API-003 — A member is addressed by appending its identifier to the collection.** Identity lives in the path, never in the body of a read or delete.

**API-004 — Use lowercase kebab-case in path segments.** No camelCase, no snake_case, no uppercase, no spaces, no encoded punctuation.

**API-005 — No trailing slash.** One canonical form per resource; the alternate form redirects or is rejected, consistently.

**API-006 — No file extensions in paths.** Representation is negotiated by headers, not by the URI.

**API-007 — No verbs in resource paths** except for the controlled action exception below.

**API-008 — Actions that are genuinely not CRUD are modeled as sub-resources or explicit action endpoints,** and are the rare exception. They use a consistent grammar and remain a small, reviewed list.

**API-009 — Prefer promoting a state change to its own resource** when it has a lifecycle, its own audit trail, or its own permissions. An action that can be listed and inspected is a resource.

**API-010 — Nest paths only to express ownership,** and only when the child cannot be addressed meaningfully without its parent.

**API-011 — Nesting depth stops at one level.** Deeper hierarchies are brittle; expose the child as a top-level resource with a parent filter instead.

**API-012 — A resource has exactly one canonical path.** Aliases and duplicate routes to the same entity are forbidden; they fragment caching, permissions, and documentation.

**API-013 — Identifiers in paths are opaque to the client.** Clients must never construct, parse, increment, or derive meaning from them.

**API-014 — Avoid exposing sequential identifiers on externally reachable resources,** because they leak volume and invite enumeration.

**API-015 — Singleton resources are permitted for genuinely single-instance concepts** and are named in the singular deliberately.

**API-016 — Relationship endpoints are explicit.** Expressing a link as a sub-path is preferred over overloading a query parameter with structural meaning.

**API-017 — Query parameters filter, sort, and paginate; they never identify.** If a parameter selects exactly one entity, it belongs in the path.

**API-018 — Query parameter names use one casing convention project-wide,** matching the body convention.

**API-019 — Path segments never contain user-supplied free text.** Slugs are validated against a strict pattern and are separate from identifiers.

**API-020 — Base path and version prefix are uniform for every endpoint.** No endpoint escapes the convention for convenience.

**API-021 — Operational endpoints live outside the versioned API namespace** and are excluded from public documentation.

**API-022 — Internal-only endpoints are separated by path namespace and by network exposure,** not by obscurity.

**API-023 — The same concept uses the same noun everywhere** — in paths, fields, events, error codes, and documentation. Synonyms across surfaces are defects.

**API-024 — Abbreviations in resource names are forbidden** unless they are the business's own established term.

**API-025 — Route ordering must not create ambiguity.** Static segments never collide with parameterized ones; conflicts are resolved by design, not by registration order.

---

## §2 HTTP method semantics

**API-026 — Read operations MUST be safe.** A read never changes observable state, never consumes a quota that alters data, and is never used as a side-effecting trigger.

**API-027 — Retrieval, replacement, and deletion MUST be idempotent.** Repeating an identical request leaves the resource in the same state.

**API-028 — Creation is the only inherently non-idempotent standard method,** and may be made idempotent with a client-supplied key.

**API-029 — Full replacement carries the complete representation.** Absent fields mean "clear", and this must be stated in the documentation.

**API-030 — Partial update carries only what changes.** Semantics for null versus absent are defined explicitly and applied consistently across every endpoint.

**API-031 — Choose one partial-update style and apply it everywhere:** a merge document or a patch document. Mixing styles across endpoints is a contract defect.

**API-032 — Deletion returns the same result whether or not the resource existed at the time of the second call.** The first deletion may report presence; repeats must not fail spuriously.

**API-033 — Cascading deletes are documented at the endpoint** or replaced by an explicit confirmation parameter. Silent cascades destroy data users did not know they were destroying.

**API-034 — Requests without a body do not send one,** and bodies on retrieval requests are forbidden.

**API-035 — Metadata-only retrieval is supported where the full representation is expensive.**

**API-036 — Preflight and option discovery behave correctly without custom handling in business code.**

**API-037 — Method override headers are not accepted.** Tunnelling methods through another method defeats caches, proxies, and audit trails.

**API-038 — An unsupported method on an existing resource is rejected with the correct status and an advertisement of what is allowed.**

**API-039 — Bulk operations are not expressed by overloading a member endpoint.** They get their own explicit resource and documented semantics.

**API-040 — Search that exceeds URI length limits gets a dedicated non-safe endpoint,** documented as an exception with its caching consequences stated.

**API-041 — Request bodies are accepted only in the declared content type.** Unexpected content types are rejected, not guessed.

**API-042 — One operation per request.** A request body that selects between several behaviours via a mode flag is several endpoints wearing one URI.

---

## §3 Status codes

**API-043 — Status codes are part of the contract.** A client may branch on them; changing one is a breaking change.

**API-044 — Use the narrowest correct code.** Blanket use of a single success code and a single error code destroys the protocol's value.

**API-045 — Successful retrieval returns a success status with a body.**

**API-046 — Successful creation returns the created status and the location of the new resource.**

**API-047 — Successful operations with no representation to return use the no-content status with an empty body** — not a success status with an empty object.

**API-048 — Accepted-but-not-complete is signalled distinctly from completed,** with a way to observe progress.

**API-049 — Client input that is syntactically malformed is distinguished from input that is syntactically valid but semantically rejected.** The two are different failures and clients handle them differently.

**API-050 — Missing or invalid credentials return the unauthenticated status** together with an accurate challenge header.

**API-051 — Authenticated but insufficient permission returns the forbidden status.** Never conflate it with unauthenticated; never return it for a missing resource the caller may not know about.

**API-052 — Where existence itself is confidential, the not-found status is returned instead of forbidden,** and this policy is documented so it is deliberate rather than accidental.

**API-053 — A state conflict, uniqueness violation, or concurrent modification returns the conflict status** with a machine code identifying which conflict.

**API-054 — Precondition failures return the precondition status,** not a generic conflict.

**API-055 — Payloads exceeding declared limits return the payload-too-large status,** and the limit is documented.

**API-056 — Unsupported media types and unacceptable representations use their specific codes,** never a generic client error.

**API-057 — Throttling returns the rate-limit status with a retry hint.**

**API-058 — Unhandled internal failures return the generic server error and nothing more.** No details, no partial data.

**API-059 — Upstream dependency failures are distinguished from internal defects,** using the gateway and unavailable codes appropriately, with a retry hint where recovery is expected.

**API-060 — Success status codes are never used to carry failure.** An error inside a success envelope breaks every client, proxy, monitor, and retry policy in the chain.

---

## §4 Payload conventions

**API-061 — One casing convention for every field name, across every endpoint, forever.** The convention is stated once in the specification.

**API-062 — Field names are descriptive nouns without type prefixes or storage hints.**

**API-063 — The wire format is a deliberate contract, not a serialized internal model.** Renaming an internal field must never change the API.

**API-064 — Response envelopes are consistent.** Either every response is wrapped or none is; mixed conventions force clients to special-case.

**API-065 — Collection responses always return a structured container with metadata,** never a bare array, so pagination and future metadata can be added without breaking clients.

**API-066 — A single resource is returned as an object, never as a one-element array.**

**API-067 — Absent versus null is defined and consistent.** Null means "known to have no value"; omission means "not provided or not applicable". The distinction is documented per endpoint.

**API-068 — Never use empty strings, zero, or sentinel values to mean absence.**

**API-069 — Identifiers are transported as strings,** even when stored numerically, to protect clients whose numeric precision is limited.

**API-070 — Timestamps use a single unambiguous format in UTC with an explicit offset,** on every field, in every endpoint.

**API-071 — Dates without time are a distinct type and are never transported as a timestamp at midnight.**

**API-072 — Durations and intervals carry their unit in the field name or use a standard duration format.** Bare numbers for time are forbidden.

**API-073 — Monetary amounts are transported as integer minor units or as an exact decimal string, always accompanied by a currency code.** Floating point money is forbidden.

**API-074 — Quantities with units carry their unit explicitly.**

**API-075 — Enumerated values are lowercase stable strings,** never integers and never localized labels.

**API-076 — Clients must tolerate unknown enum members;** the documentation states this expectation and the API may add members in a minor revision.

**API-077 — Booleans are true booleans,** never strings, never numbers, never present-or-absent flags.

**API-078 — Object keys are fixed and documented.** Dynamic keys derived from data are forbidden; use an array of objects with explicit key and value fields.

**API-079 — Deep nesting is avoided.** Beyond roughly three levels, the structure is hard to validate, version, and document.

**API-080 — Related resources are referenced by identifier by default,** with embedding offered as an explicit, documented opt-in.

**API-081 — Embedding is bounded.** Depth, breadth, and the set of embeddable relations are an allowlist with a hard ceiling.

**API-082 — Responses never include fields the caller is not authorized to see.** Field-level authorization is applied during shaping, not by post-filtering in the client.

**API-083 — Secrets, tokens, password material, and internal identifiers are never present in any response,** including those echoed back from a request.

**API-084 — Requests never accept server-controlled fields.** Identifiers, timestamps, computed totals, and ownership fields supplied by a client are rejected or ignored by allowlist.

**API-085 — Payload size limits are enforced for body, array length, string length, and nesting depth,** and all limits are documented.

---

## §5 Collections: pagination, filtering, sorting, search

**API-086 — Every collection endpoint is paginated from the first release.** Retrofitting pagination is a breaking change.

**API-087 — One pagination style per API.** Cursor-based is the default for large or growing collections; offset is permitted only for small bounded sets and is documented as such.

**API-088 — The page size has a documented default and a hard maximum enforced server-side.**

**API-089 — Cursors are opaque.** Clients never decode, construct, or modify them, and the documentation states this.

**API-090 — Pagination metadata is consistent across every collection:** the same field names, the same semantics, in every endpoint.

**API-091 — Total counts are optional and may be omitted or approximate on large datasets;** whichever applies is documented per endpoint rather than assumed.

**API-092 — Result ordering is always deterministic,** with a unique tiebreaker, otherwise pagination silently loses and repeats records.

**API-093 — The default sort order is documented and stable.**

**API-094 — Sortable fields are an explicit allowlist,** and each must be backed by an index.

**API-095 — Sort syntax is uniform** across every collection endpoint, including how direction is expressed and how multiple keys are combined.

**API-096 — Filterable fields are an explicit allowlist,** mapped internally to storage; client input never becomes a field or operator name.

**API-097 — Filter syntax is uniform and simple.** A general-purpose query language embedded in query strings becomes an unbounded, unverifiable contract.

**API-098 — Range and set filters use one documented grammar** for boundaries, inclusivity, and multi-value semantics.

**API-099 — Repeated parameters versus delimited lists: pick one convention** and apply it to every multi-value parameter.

**API-100 — Unknown query parameters are rejected or ignored by a single documented policy.** Silent ignoring hides client bugs; strict rejection breaks forward compatibility — the choice is deliberate.

**API-101 — Free-text search is a separate, explicitly named parameter** with documented matching behaviour, minimum length, and normalization.

**API-102 — Search and filter results respect the caller's authorization scope.** Filtering must never become a way to confirm the existence of inaccessible records.

**API-103 — Sparse field selection, where offered, uses an allowlist** and never permits arbitrary internal field names.

**API-104 — Expensive collection parameters have their own cost controls:** stricter page ceilings, stricter rate limits, or both.

**API-105 — Empty results are a successful response with an empty collection,** never a not-found error.

---

## §6 Error contract

**API-106 — Errors use a single schema across the entire API.** One shape, one place, one parser on the client side.

**API-107 — Adopt a standard problem-details structure** rather than inventing a bespoke error envelope.

**API-108 — Every error carries a stable machine-readable code** that is documented, namespaced, and never reused for a different meaning.

**API-109 — The machine code, not the message or the status, is what clients branch on.** Messages are display text and may change at any time.

**API-110 — The status code and the error code agree.** A conflict code never accompanies a validation status.

**API-111 — Validation failures enumerate every offending field in one response,** rather than failing on the first.

**API-112 — Field errors identify the field with a path that matches the request body structure,** including array indices, so clients can attach them to inputs.

**API-113 — Field error entries carry their own machine code,** so clients can localize without parsing English.

**API-114 — Error messages are written for humans and state what happened and what to do next.** They do not apologize, do not blame, and do not restate the status code.

**API-115 — Messages never contain internal identifiers, SQL, stack frames, file paths, hostnames, library names, or upstream provider payloads.**

**API-116 — Every error response carries a correlation identifier** that matches the server logs, so a user-reported failure is findable.

**API-117 — Error responses are not cached,** and carry headers that say so.

**API-118 — Retryable and non-retryable failures are distinguishable** from the status and code alone, without parsing prose.

**API-119 — Rate-limit and temporary-failure errors include a retry hint** in a standard header.

**API-120 — Authentication failures state the scheme and the reason category** without revealing whether an account exists.

**API-121 — Partial failures in multi-item operations return a structured per-item outcome,** never a single ambiguous status.

**API-122 — Error codes are enumerated in the specification per endpoint.** An error a client can receive but cannot find documented is a defect.

---

## §7 Versioning and evolution

**API-123 — The API is versioned from the first public release.** Adding versioning later is itself a breaking change.

**API-124 — One versioning mechanism for the whole API.** Whichever is chosen — path prefix, media type, or header — it applies uniformly and is documented.

**API-125 — Major versions change only for breaking changes.** Additive evolution never increments the major version.

**API-126 — Breaking changes are defined explicitly:** removing or renaming a field, changing a type or format, tightening validation, changing a status or error code, changing default behaviour, adding a required request field, removing an enum member, or changing pagination semantics.

**API-127 — Non-breaking changes are defined explicitly:** adding an optional request field, adding a response field, adding an endpoint, adding an enum member where clients were told to tolerate them, and relaxing validation.

**API-128 — Clients MUST tolerate unknown response fields.** This expectation is published, because it is what makes additive evolution possible.

**API-129 — A field's meaning never changes after release.** Repurposing an existing field is the most damaging breaking change because it is silent.

**API-130 — Removal follows a deprecate-then-remove lifecycle** with a published timeline, never an immediate deletion.

**API-131 — Deprecations are announced in the response itself** through standard deprecation and sunset signalling, not only in a changelog.

**API-132 — Deprecated surfaces are instrumented.** Removal requires evidence that usage has reached zero, not an assumption.

**API-133 — Supported versions and their end-of-life dates are published,** and the support window is a stated policy rather than case-by-case.

**API-134 — Running two major versions in parallel is a temporary, budgeted state** with a scheduled end.

**API-135 — Internal refactoring must never be observable through the API.** If it is, it was a contract change.

**API-136 — Defaults are part of the contract.** Changing a default value, a default sort, or a default page size is breaking.

**API-137 — Validation is tightened only in a new version.** Rejecting input that previously succeeded breaks working clients.

**API-138 — Every contract change is recorded in a client-facing changelog** with date, type, and migration guidance.

---

## §8 Idempotency, concurrency, caching

**API-139 — Every non-idempotent state-changing endpoint supports a client-supplied idempotency key.** Networks retry; without a key, retries duplicate money, orders, and messages.

**API-140 — The idempotency key is scoped to the caller and the endpoint,** never global.

**API-141 — A repeated key with an identical payload returns the original recorded result,** including its original status.

**API-142 — A repeated key with a different payload is rejected as a conflict,** never silently executed.

**API-143 — Idempotency records have a documented retention window,** after which the key may be reused.

**API-144 — Concurrent requests with the same key resolve to one execution;** the loser waits or receives a retry signal.

**API-145 — Idempotency is enforced server-side, atomically.** A read-then-write check without atomicity is not idempotency.

**API-146 — Resources that can be concurrently edited expose an entity version identifier** on retrieval.

**API-147 — Conditional updates are supported through precondition headers,** and their absence on a concurrent-edit resource is either rejected or documented as last-write-wins.

**API-148 — Lost updates are prevented by design, not by hope.** The chosen strategy is documented per resource.

**API-149 — Every response states its cacheability explicitly.** Absent cache directives are an accident, not a policy.

**API-150 — Authenticated and user-scoped responses are never publicly cacheable.**

**API-151 — Cache directives distinguish shared caches from private caches deliberately.**

**API-152 — Validators are provided for expensive representations** so clients can revalidate cheaply.

**API-153 — Conditional retrieval is honored** and returns the not-modified status without a body.

**API-154 — Any response that varies by a request header declares that variance,** or caches will serve one caller's representation to another.

**API-155 — Mutations invalidate the affected cached representations** through a defined strategy, not incidentally.

**API-156 — Rate-limit state is exposed through consistent headers** on every throttled surface: allowance, remaining, and reset.

---

## §9 Asynchronous, bulk, and long-running operations

**API-157 — Operations that cannot complete within the request timeout are asynchronous by design,** never a long-held connection.

**API-158 — An accepted asynchronous request returns an operation resource** the client can poll or subscribe to.

**API-159 — The operation resource exposes a documented state machine** with terminal success and failure states, timestamps, and a result reference.

**API-160 — Failure detail for an asynchronous operation uses the same error schema** as synchronous failures.

**API-161 — Polling guidance is provided** through a retry hint so clients do not choose their own interval.

**API-162 — Operation records have a documented retention period.**

**API-163 — Bulk endpoints declare their atomicity up front:** all-or-nothing or per-item. Ambiguity here causes silent data loss.

**API-164 — Bulk endpoints impose and document a maximum item count.**

**API-165 — Per-item bulk results preserve request order and echo a client-supplied reference,** so outcomes can be matched without positional guessing.

**API-166 — Bulk operations are never used to bypass per-item authorization or validation.**

**API-167 — Export-style operations produce a retrievable artifact with a time-limited, single-purpose access grant** rather than streaming unbounded data inline.

**API-168 — Asynchronous work is idempotent at the worker level as well as at the API level,** because delivery is at-least-once.

---

## §10 Webhooks and outbound callbacks

**API-169 — Outbound events are a versioned, documented contract,** governed by the same evolution rules as the inbound API.

**API-170 — Every delivery is signed,** with a documented signature scheme and a published verification procedure.

**API-171 — Signatures include a timestamp and a replay window,** and receivers are instructed to reject stale deliveries.

**API-172 — Deliveries carry a unique event identifier** so receivers can deduplicate.

**API-173 — Delivery is at-least-once, and consumers are told so explicitly.** Exactly-once delivery is not offered.

**API-174 — Ordering is not guaranteed unless explicitly stated;** events carry sequence or timestamp data so receivers can order them.

**API-175 — Retries use bounded exponential backoff with jitter** and a documented total attempt window.

**API-176 — Endpoints that fail persistently are disabled with notification,** not retried forever.

**API-177 — Payloads are minimal and reference-based where the data is sensitive,** requiring the receiver to fetch the authoritative record.

**API-178 — Outbound destinations are validated against the network policy** for the same reasons any server-side request is: internal addresses are not valid webhook targets.

---

## §11 Files, streaming, and non-JSON payloads

**API-179 — Uploads declare and enforce a maximum size at the edge,** before the payload is buffered by application code.

**API-180 — File type is validated by content inspection, not by the supplied filename or declared type.**

**API-181 — Client-supplied filenames are never used as storage paths** and are sanitized before being echoed anywhere.

**API-182 — Large uploads and downloads use pre-signed, time-limited, scope-limited direct transfer** where the storage layer supports it, rather than proxying bytes through the application.

**API-183 — Downloads set explicit disposition and content-type headers** and never allow the browser to sniff the type.

**API-184 — Streaming responses define their framing, keep-alive, and termination semantics** and communicate errors within the stream protocol, not by silently closing.

**API-185 — Compression is negotiated, bounded, and never applied to payloads containing secrets in a way that enables compression-based inference.**

**API-186 — Non-JSON representations are offered only where justified** and are versioned under the same policy as the primary representation.

---

## §12 Contract governance

**API-187 — The machine-readable specification is the single source of truth for the contract.** Documentation, client SDKs, mocks, and tests derive from it.

**API-188 — Specification-first is the default workflow.** The contract is agreed before implementation, because a contract discovered after implementation is an accident.

**API-189 — Every endpoint, parameter, field, status code, and error code is documented.** An undocumented surface is not shipped.

**API-190 — Every field's documentation states its type, format, constraints, nullability, and whether it is required.**

**API-191 — The specification is validated in CI,** and drift between specification and implementation fails the build.

**API-192 — Contract tests verify the implementation against the specification,** including error responses, not just success paths.

**API-193 — Breaking-change detection runs automatically on every change to the specification** and requires an explicit approval to merge.

**API-194 — Examples in the documentation are generated or tested,** so they cannot silently rot.

**API-195 — Authentication requirements, scopes, and permissions are documented per endpoint.**

**API-196 — Rate limits, quotas, and payload limits are documented per endpoint** where they differ from the global default.

**API-197 — Idempotency, pagination, filtering, sorting, versioning, and error conventions are documented once, centrally,** and referenced — not restated per endpoint.

**API-198 — Internal and external surfaces are documented separately,** with internal-only endpoints excluded from any public artifact.

**API-199 — Every endpoint has a named owner.** An API surface without an owner has no one to answer a breaking-change question.

**API-200 — The contract is reviewed by someone who is not its author** before release, with the reviewer accountable for consistency against this catalog.
