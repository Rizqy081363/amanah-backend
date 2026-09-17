# Runtime, Security and Operations Rules

**Catalog 3 of 3** — configuration, authentication and authorization, input safety, data protection, abuse control, concurrency, background work, observability, resilience, containers, delivery pipeline, operational readiness.

> **Scope:** how the server behaves in production. Structure is covered in `BACKEND-ARCHITECTURE-RULES.md`; the contract surface in `API-DESIGN-RULES.md`.
>
> **Normativity:** **MUST** blocks merge or release. **SHOULD** requires written justification. **MAY** is discretionary.
>
> **Governing idea:** the code is correct only if it is still correct under a hostile client, a failing dependency, a restarted container, and a second replica running concurrently.
>
> **Form:** rules and paradigms only. No code, no configuration samples.

---

## Index

- [§1 Configuration and secrets](#1-configuration-and-secrets) — OPS-001…022
- [§2 Authentication](#2-authentication) — OPS-023…042
- [§3 Authorization](#3-authorization) — OPS-043…058
- [§4 Input handling and injection defense](#4-input-handling-and-injection-defense) — OPS-059…078
- [§5 Transport, headers, and network posture](#5-transport-headers-and-network-posture) — OPS-079…092
- [§6 Data protection and privacy](#6-data-protection-and-privacy) — OPS-093…113
- [§7 Abuse control, quotas, and denial of service](#7-abuse-control-quotas-and-denial-of-service) — OPS-114…128
- [§8 Concurrency, state, and horizontal scaling](#8-concurrency-state-and-horizontal-scaling) — OPS-129…143
- [§9 Background jobs, scheduling, and messaging](#9-background-jobs-scheduling-and-messaging) — OPS-144…168
- [§10 Observability](#10-observability) — OPS-169…195
- [§11 Resilience and failure handling](#11-resilience-and-failure-handling) — OPS-196…218
- [§12 Containers and images](#12-containers-and-images) — OPS-219…248
- [§13 Runtime and orchestration](#13-runtime-and-orchestration) — OPS-249…266
- [§14 Delivery pipeline and supply chain](#14-delivery-pipeline-and-supply-chain) — OPS-267…284
- [§15 Testing and quality gates](#15-testing-and-quality-gates) — OPS-285…300
- [§16 Operational readiness](#16-operational-readiness) — OPS-301…315

---

## §1 Configuration and secrets

**OPS-001 — Configuration comes from the environment, never from the artifact.** One build runs in every environment; behaviour differs only by injected configuration.

**OPS-002 — Configuration is validated at startup against a schema.** Types, ranges, formats, and required-ness are checked before the process serves traffic.

**OPS-003 — Invalid or missing configuration fails the process immediately and loudly.** Starting in a degraded, half-configured state is worse than not starting.

**OPS-004 — Configuration is read in exactly one module.** The rest of the codebase consumes typed values.

**OPS-005 — No configuration is read lazily at call time.** Late reads hide misconfiguration until the unluckiest moment.

**OPS-006 — Every configuration key is documented with its meaning, type, default, and whether it is required.**

**OPS-007 — An example environment file lists every key and contains no real values.**

**OPS-008 — Defaults are safe, not convenient.** Where a missing value could weaken security, there is no default — the process refuses to start.

**OPS-009 — Environment names are an enumerated set,** and behaviour that differs by environment branches on that value explicitly, never on the absence of a variable.

**OPS-010 — Debug, verbose, and permissive modes cannot be enabled in production by configuration alone.** They are compiled out or hard-gated.

**OPS-011 — Secrets are never committed to version control,** in any form, including tests, fixtures, documentation, and comments.

**OPS-012 — Secrets are never baked into images.** Not in layers, not in build arguments, not in labels, not in the history.

**OPS-013 — Secrets are injected at runtime** from a secret manager or an orchestrator-managed mechanism, and preferably mounted as files rather than passed as environment variables, because environment variables leak through process listings, crash dumps, and child processes.

**OPS-014 — Secrets are never logged, echoed, or included in error responses,** including at debug level and including when the process fails to parse them.

**OPS-015 — The logging layer redacts a known list of sensitive keys by default,** and the list is reviewed whenever a new sensitive field is introduced.

**OPS-016 — Secrets are rotatable without a code change,** and the rotation procedure is documented and rehearsed.

**OPS-017 — The application tolerates rotation.** It picks up new credentials on restart at minimum, and supports overlapping validity where the dependency allows it.

**OPS-018 — Each environment has distinct credentials.** No credential is shared across environments, and no production credential ever exists on a developer machine.

**OPS-019 — Every credential has the minimum scope required.** Database users, cloud roles, and API keys are least-privilege and purpose-specific.

**OPS-020 — Leaked credentials are revoked, not rotated quietly.** A leak is an incident with a record.

**OPS-021 — Secret scanning runs in the pipeline and on every commit,** and blocks the merge on a hit.

**OPS-022 — Feature flags are configuration, not branching logic left in the code forever.** Every flag has an owner and a removal date.

---

## §2 Authentication

**OPS-023 — Authentication is enforced by default and disabled per endpoint by explicit opt-out.** A deny-by-default posture means a forgotten annotation fails closed.

**OPS-024 — Every unauthenticated endpoint is enumerated and reviewed.** The list is short and deliberate.

**OPS-025 — Never build cryptographic authentication primitives in-house.** Use vetted, maintained implementations.

**OPS-026 — Passwords are stored only as salted hashes from a memory-hard algorithm with tuned work factors,** never as encryption, never as a fast hash.

**OPS-027 — Work factors are reviewed periodically** and increased as hardware improves; a rehash-on-login path exists.

**OPS-028 — Credential comparison is constant-time** for passwords, tokens, signatures, and keys.

**OPS-029 — Authentication failures return one indistinguishable outcome** regardless of whether the account exists, the password is wrong, or the account is locked.

**OPS-030 — Timing differences that reveal account existence are treated as a vulnerability.**

**OPS-031 — Authentication endpoints are rate-limited per account and per source,** with progressive delay or lockout, and the policy is documented.

**OPS-032 — Tokens are validated completely on every request:** signature, algorithm, issuer, audience, expiry, not-before, and revocation state where applicable.

**OPS-033 — The signing algorithm is pinned server-side.** The token's own header never selects the verification algorithm, and unsecured tokens are rejected outright.

**OPS-034 — Access tokens are short-lived.** Long-lived bearer credentials are a standing breach.

**OPS-035 — Refresh credentials are long-lived, revocable, stored server-side or made verifiable server-side, and rotated on use** with reuse detection.

**OPS-036 — Detected refresh reuse invalidates the whole credential family** and is treated as a security event.

**OPS-037 — Logout revokes server-side state.** Discarding a token only on the client is not logout.

**OPS-038 — Session and token invalidation happens on password change, permission change, and account deactivation.**

**OPS-039 — Browser-facing sessions use cookies that are marked as HTTP-only, secure, and same-site-restricted,** with explicit domain and path scope.

**OPS-040 — Cross-site request forgery defenses are applied to any cookie-authenticated state-changing endpoint.**

**OPS-041 — Machine-to-machine authentication uses scoped, individually revocable credentials with recorded ownership and expiry.** Shared static keys without ownership are forbidden.

**OPS-042 — Multi-factor and step-up authentication are enforced for privileged and destructive operations,** not only at the login boundary.

---

## §3 Authorization

**OPS-043 — Authorization is deny-by-default.** An endpoint without an explicit policy is inaccessible, not open.

**OPS-044 — Authentication is not authorization.** Every request is checked against what this specific caller may do with this specific object.

**OPS-045 — Object-level ownership is verified on every read, update, and delete of a scoped resource.** Insecure direct object reference is the most common and most damaging API vulnerability.

**OPS-046 — Ownership is verified against the authenticated identity, never against an identifier supplied in the request.**

**OPS-047 — Tenant scoping is applied at the data access layer,** so a forgotten filter in a single query cannot cross tenants.

**OPS-048 — Cross-tenant access is impossible by construction,** and is covered by an automated test per tenant-scoped resource.

**OPS-049 — Authorization rules live in policies, expressed once, and are invoked from the application layer.** Inline role string comparisons scattered across handlers are forbidden.

**OPS-050 — Permissions are fine-grained and named after capabilities,** not after job titles.

**OPS-051 — Roles are a grouping of permissions, never a synonym for a permission check.**

**OPS-052 — Privilege escalation paths are explicitly closed:** a caller may never grant themselves a permission, change their own role, or modify their own tenancy through a general-purpose update endpoint.

**OPS-053 — Field-level authorization is enforced on write.** Server-controlled fields are never bound from client input.

**OPS-054 — Field-level authorization is enforced on read.** Responses are shaped per caller, not filtered downstream.

**OPS-055 — Collection endpoints are scoped before pagination,** so counts and cursors never reveal inaccessible records.

**OPS-056 — Administrative capabilities are separated by network exposure, credential, and audit trail,** not only by a role flag.

**OPS-057 — Every authorization denial is logged with subject, object, action, and reason.**

**OPS-058 — Authorization behaviour is covered by tests for the negative case.** A test suite that only proves the permitted path proves nothing.

---

## §4 Input handling and injection defense

**OPS-059 — All input is untrusted:** request bodies, query strings, path parameters, headers, cookies, uploaded files, queue messages, webhook payloads, configuration, and responses from third parties.

**OPS-060 — Validation is by allowlist, never by blocklist.** Enumerate what is acceptable; everything else is rejected.

**OPS-061 — Validation happens before the value reaches business logic,** and the validated, narrowed type is what flows onward.

**OPS-062 — Type coercion is explicit.** Implicit coercion turns a string into a query operator, an array into an object, and a number into a boolean.

**OPS-063 — Structural attacks are rejected at the parser:** oversized bodies, deeply nested objects, huge arrays, duplicate keys, and prototype-polluting keys.

**OPS-064 — Every string field has a maximum length.** Unbounded strings become memory exhaustion and storage abuse.

**OPS-065 — Every numeric field has a documented range,** including negative and zero cases.

**OPS-066 — Every array field has a maximum length.**

**OPS-067 — Database access uses parameterized statements exclusively.** String concatenation into a query is forbidden without exception.

**OPS-068 — Identifiers that cannot be parameterized — table names, column names, sort directions — come from a fixed internal allowlist,** never from client input.

**OPS-069 — Document and search query operators are never accepted from client input,** because an operator injected into a filter is a full data disclosure.

**OPS-070 — Command execution with user-influenced input is forbidden.** Where a subprocess is unavoidable, arguments are passed as an argument vector, never through a shell.

**OPS-071 — File paths are never constructed from user input.** Path traversal is prevented by resolving against a fixed root and rejecting anything outside it.

**OPS-072 — Server-side requests to user-supplied destinations are blocked by default.** Where required, destinations are validated against an allowlist, resolved addresses are checked against private and link-local ranges, and redirects are not followed blindly.

**OPS-073 — Redirect targets are validated against an allowlist of internal paths.** Open redirects are a phishing primitive.

**OPS-074 — Template, expression, and serialization engines never evaluate user-supplied input.**

**OPS-075 — Deserialization of untrusted data never instantiates arbitrary types.**

**OPS-076 — Regular expressions applied to user input are checked for catastrophic backtracking,** and are bounded in input length.

**OPS-077 — Output is encoded for its destination context** when the server renders anything, including emails, generated documents, and spreadsheet exports.

**OPS-078 — Uploaded content is validated by inspection, stored outside the web root, served from a separate origin, and never executed.**

---

## §5 Transport, headers, and network posture

**OPS-079 — Transport encryption is mandatory on every hop,** including between internal services and to the database.

**OPS-080 — Plaintext listeners either do not exist or redirect permanently,** and the application asserts its own scheme awareness behind a proxy.

**OPS-081 — Proxy headers are trusted only from known proxies.** Blindly trusting forwarded headers lets a client forge its own source address, and therefore its own rate-limit identity and audit trail.

**OPS-082 — Minimum protocol versions and cipher suites are enforced,** and weak configurations are rejected rather than negotiated down.

**OPS-083 — Certificate validation is always on.** Disabling verification for convenience in any environment is forbidden.

**OPS-084 — Strict transport security is declared with an appropriate duration.**

**OPS-085 — Content type sniffing is disabled, framing is restricted, and referrer exposure is minimized** through standard response headers applied globally.

**OPS-086 — Server identification, framework, and version headers are removed.** Fingerprinting assists attackers and provides no value to clients.

**OPS-087 — Cross-origin access is configured by explicit origin allowlist.** Wildcard origins with credentials are forbidden.

**OPS-088 — Cross-origin configuration is per-environment,** and a permissive development setting can never be deployed.

**OPS-089 — Allowed methods and headers in cross-origin configuration are enumerated,** not wildcarded.

**OPS-090 — The application binds only to the interfaces it needs,** and management or metrics ports are not exposed publicly.

**OPS-091 — Network access between services is allowlisted.** Flat, fully reachable internal networks turn one compromise into total compromise.

**OPS-092 — Outbound network access is restricted to known destinations** wherever the platform supports it.

---

## §6 Data protection and privacy

**OPS-093 — Sensitive data is classified.** Each field is labelled, and handling rules follow from the label rather than from individual judgement.

**OPS-094 — Collect the minimum.** Data not collected cannot leak, cannot be subpoenaed, and cannot be mishandled.

**OPS-095 — Encryption at rest is enabled for databases, backups, object storage, and volumes.**

**OPS-096 — Field-level encryption is applied to the highest-sensitivity attributes,** with keys managed outside the application.

**OPS-097 — Encryption keys are managed by a key service, are versioned, and are rotatable without re-deploying the application.**

**OPS-098 — Personal data is never written to application logs,** including inside request bodies, error payloads, and stack context.

**OPS-099 — Personal data never appears in URLs,** because URLs reach proxies, logs, browser history, and referrer headers.

**OPS-100 — Analytics, error reporting, and third-party telemetry are scrubbed before transmission,** and the scrubbing rules are tested.

**OPS-101 — Retention periods are defined per data class and enforced by an automated process,** not by intention.

**OPS-102 — Deletion requests are honored across primary storage, caches, search indexes, backups policy, logs, and downstream processors.** A deletion that leaves copies is not a deletion.

**OPS-103 — Data export is supported where required, in a machine-readable format, through an authenticated and authorized path.**

**OPS-104 — Anonymization and pseudonymization are distinguished.** Reversible pseudonymization is not anonymization and is still personal data.

**OPS-105 — Non-production environments never contain production personal data.** Data is synthetic or irreversibly masked.

**OPS-106 — Access to production data by humans is authenticated, authorized, time-bound, justified, and logged.**

**OPS-107 — Backups are automated, encrypted, access-controlled, and retained per policy.**

**OPS-108 — Restores are tested on a schedule.** An untested backup is an assumption, not a recovery plan.

**OPS-109 — Recovery objectives are defined and measured** against the tested restore, not estimated.

**OPS-110 — Backups are isolated from the primary credential scope** so a compromise of production cannot destroy them.

**OPS-111 — Data flows to third parties are inventoried,** with a named purpose, a legal basis where relevant, and a review cycle.

**OPS-112 — An immutable audit log records who did what to which object, when, and from where,** for every privileged and state-changing operation.

**OPS-113 — Audit logs are append-only, separately retained, and not writable by the application's normal credentials.**

---

## §7 Abuse control, quotas, and denial of service

**OPS-114 — Every publicly reachable endpoint is rate-limited.** An unlimited endpoint is an availability incident waiting for a script.

**OPS-115 — Limits are applied per identity and per source, not only globally,** so one caller cannot consume the whole allowance.

**OPS-116 — Rate-limit state is shared across replicas.** Per-instance counters silently multiply the effective limit by the replica count.

**OPS-117 — Expensive operations get their own stricter limits:** authentication, search, export, report generation, and anything that fans out.

**OPS-118 — Rate limiting happens as early as possible in the request path,** ideally before application work begins.

**OPS-119 — Throttled responses state the limit and when to retry,** so well-behaved clients can adapt.

**OPS-120 — Quotas and rate limits are distinct concepts:** quotas govern volume over a billing or fairness period, rate limits govern burst.

**OPS-121 — Request bodies are size-limited at the edge,** before buffering.

**OPS-122 — Request and connection timeouts are enforced at every layer,** including headers, body read, handler execution, and idle connection.

**OPS-123 — Concurrency is bounded.** Unbounded parallelism turns a traffic spike into memory exhaustion.

**OPS-124 — Slow-client attacks are mitigated at the edge** with header and body read deadlines.

**OPS-125 — Expensive work is never triggered by an unauthenticated request** without an additional cost control.

**OPS-126 — Amplification vectors are closed:** unbounded page sizes, unbounded expansion depth, unbounded bulk item counts, and recursive relationship traversal.

**OPS-127 — Automated abuse detection exists for credential stuffing, enumeration, and scraping patterns,** with a defined response.

**OPS-128 — The response to abuse is graceful degradation, not collapse.** Shed load deliberately, protect the core path, and keep health signals honest.

---

## §8 Concurrency, state, and horizontal scaling

**OPS-129 — The process is stateless.** Anything that must survive a request lives in a database, a cache, or object storage.

**OPS-130 — Any instance can serve any request.** Sticky sessions are a design failure, not a solution.

**OPS-131 — In-memory caches are per-instance and therefore inconsistent by definition.** They are permitted only for immutable or tolerably stale data, with a bounded size and a TTL.

**OPS-132 — Local filesystem writes are ephemeral.** Nothing durable is written to a container's filesystem.

**OPS-133 — Scheduled work is coordinated so it runs once across the fleet,** through a leader election, a distributed lock, or a dedicated scheduler.

**OPS-134 — Distributed locks always have an expiry,** are released by their owner only, and the code behaves correctly when the lock is lost mid-operation.

**OPS-135 — Distributed locks are not a substitute for database-level guarantees** where the database can express the constraint directly.

**OPS-136 — Uniqueness is enforced by a database constraint,** never by a check-then-insert sequence, which is a race by construction.

**OPS-137 — Counters and balances are updated atomically at the storage layer,** never by reading, computing, and writing back.

**OPS-138 — Every state-changing operation is analyzed under concurrent execution** before it is merged: what happens if two identical requests arrive simultaneously.

**OPS-139 — Lock ordering is global and consistent** to prevent deadlocks.

**OPS-140 — Long-running work is chunked and checkpointed,** so a restart resumes rather than restarts.

**OPS-141 — Connection pools are sized against the total replica count and the database's connection ceiling,** not per instance in isolation.

**OPS-142 — Pool exhaustion is observable and alerted on,** because it presents as latency rather than as an error.

**OPS-143 — Scaling assumptions are documented:** what breaks first, at what load, and what the next bottleneck is.

---

## §9 Background jobs, scheduling, and messaging

**OPS-144 — Work that does not need to complete within the request is moved out of the request.**

**OPS-145 — Background work is queued durably,** never held in process memory, because a deployment is a process death.

**OPS-146 — Every consumer is idempotent.** Delivery is at-least-once; a handler that is not idempotent will eventually double-charge, double-send, or double-create.

**OPS-147 — Idempotency is enforced by a persisted deduplication key,** not by a hopeful existence check.

**OPS-148 — Jobs carry the minimum payload and a reference to the authoritative record,** because payloads age between enqueue and execution.

**OPS-149 — Job payloads never contain secrets or personal data.**

**OPS-150 — Job payloads are versioned,** and consumers tolerate both the current and the previous version during a rolling deploy.

**OPS-151 — Consumers tolerate out-of-order delivery** unless the transport guarantees ordering and the guarantee is documented.

**OPS-152 — Retries use bounded exponential backoff with jitter.** Fixed-interval retries synchronize and become a self-inflicted denial of service.

**OPS-153 — Retry budgets are finite.** Every job has a maximum attempt count and a terminal outcome.

**OPS-154 — Exhausted jobs move to a dead-letter destination,** which is monitored, alerted on, and has a documented replay procedure.

**OPS-155 — Poison messages are isolated quickly** so one malformed payload cannot stall a partition or a queue.

**OPS-156 — Permanent failures are not retried.** A validation failure will fail identically on every attempt and only wastes capacity.

**OPS-157 — Every job execution has a timeout,** and its heartbeat or visibility window exceeds the realistic worst case.

**OPS-158 — Handlers acknowledge only after the work is durably complete,** never on receipt.

**OPS-159 — Messages are published after the database transaction commits,** through an outbox or an equivalent mechanism, so no consumer ever reacts to a rolled-back change.

**OPS-160 — Consumers never assume the referenced record still exists in the state it had at publish time.**

**OPS-161 — Queue depth, consumer lag, processing latency, and failure rate are monitored with alert thresholds.**

**OPS-162 — Workers shut down gracefully:** stop accepting new messages, finish or return in-flight work, then exit within the orchestrator's grace period.

**OPS-163 — Scheduled jobs are idempotent and safe to run late, twice, or after being skipped.**

**OPS-164 — Scheduled jobs define their behaviour when the previous run has not finished:** skip, queue, or overlap — never undefined.

**OPS-165 — Schedules are expressed in a single explicit timezone,** and daylight-saving behaviour is considered rather than discovered.

**OPS-166 — Job execution is observable:** start, end, duration, outcome, and the identifier of the work item.

**OPS-167 — Failure to run is alerted on.** A silent scheduler is indistinguishable from a healthy one until the damage is visible.

**OPS-168 — Queues are separated by workload class,** so slow bulk work cannot starve latency-sensitive work.

---

## §10 Observability

**OPS-169 — Logs are structured, machine-parseable records,** never formatted prose.

**OPS-170 — The log field vocabulary is fixed and documented.** The same concept uses the same key everywhere.

**OPS-171 — Every log line carries a correlation identifier** that ties it to a request, a job, or a message.

**OPS-172 — The correlation identifier is accepted from the edge if present, generated if not, propagated to every downstream call, and returned to the client.**

**OPS-173 — Log levels have defined meanings, applied consistently:** unexpected failures needing attention, handled failures, notable state changes, and diagnostic detail.

**OPS-174 — The production log level excludes diagnostic detail** and is changeable without a code change.

**OPS-175 — Logging is never done through direct standard-output calls** scattered in business code; one logging abstraction is used.

**OPS-176 — Logs go to standard output as a stream,** not to files managed by the application.

**OPS-177 — Sensitive fields are redacted by the logger itself,** so redaction cannot be forgotten at a call site.

**OPS-178 — Every handled error is logged exactly once,** at the layer that handles it. Logging and rethrowing at every level produces unreadable duplication.

**OPS-179 — Error logs include the cause chain,** not only the outermost message.

**OPS-180 — Expected client errors are not logged as failures.** Validation noise hides real incidents.

**OPS-181 — Log volume is bounded.** High-frequency events are sampled or aggregated rather than emitted per occurrence.

**OPS-182 — Health endpoints are excluded from request logging.**

**OPS-183 — Metrics cover the four signals that matter for every service:** traffic, error rate, latency distribution, and saturation.

**OPS-184 — Latency is reported as a distribution.** Averages hide the experience of the worst-served users.

**OPS-185 — Metric labels have bounded cardinality.** Identifiers, emails, and raw paths as labels destroy the metrics backend.

**OPS-186 — Business-level metrics exist alongside technical ones,** because a healthy process serving zero successful orders is still an outage.

**OPS-187 — Every external dependency has its own latency, error, and saturation metrics.**

**OPS-188 — Distributed tracing is enabled for request-scoped work,** with context propagated across service, queue, and job boundaries.

**OPS-189 — Trace sampling is configurable, and errors are always sampled.**

**OPS-190 — Spans carry meaningful attributes and never carry sensitive values.**

**OPS-191 — Unexpected errors are reported to an error tracker with grouping that reflects the cause,** not the message text.

**OPS-192 — Alerts fire on symptoms users feel,** not on every internal anomaly.

**OPS-193 — Every alert is actionable and links to a runbook.** An alert with no defined response trains people to ignore alerts.

**OPS-194 — Alert thresholds derive from stated service objectives,** not from intuition.

**OPS-195 — Observability is part of the feature, not a follow-up.** A capability that ships without logs, metrics, and a way to answer "is it working" is incomplete.

---

## §11 Resilience and failure handling

**OPS-196 — Every outbound call has an explicit timeout.** A default of "wait forever" converts a slow dependency into a total outage.

**OPS-197 — Timeouts are budgeted across the call chain.** An inner timeout must be shorter than the outer one, or the caller gives up while work continues.

**OPS-198 — The total request deadline is propagated,** and work is abandoned once the caller can no longer receive the result.

**OPS-199 — Retries are applied only to idempotent operations** or to operations protected by an idempotency key.

**OPS-200 — Retries are bounded, use exponential backoff with jitter, and have a total time budget.**

**OPS-201 — Retries are never layered.** Retrying at the client, the gateway, and the service multiplies load on an already failing dependency.

**OPS-202 — Retry budgets are enforced globally,** so retries cannot consume more than a small fraction of total capacity.

**OPS-203 — Circuit breakers protect dependencies that can fail persistently,** with defined thresholds for opening, a half-open probe, and observable state.

**OPS-204 — Bulkheads isolate dependencies.** One saturated integration must not exhaust the pools that serve unrelated traffic.

**OPS-205 — Fallbacks are deliberate and documented:** cached data, reduced functionality, or a clear failure — never silently wrong data.

**OPS-206 — Degraded mode is designed, not improvised.** Which features fail first is a product decision made before the incident.

**OPS-207 — Failure of a non-critical dependency never fails the request.** Analytics, telemetry, and enrichment are best-effort by construction.

**OPS-208 — Critical dependencies are enumerated,** and the service's availability is understood as a function of theirs.

**OPS-209 — The application starts successfully when a non-critical dependency is unavailable,** and recovers when it returns.

**OPS-210 — Reconnection logic is built in for every persistent connection,** with backoff and without unbounded buffering.

**OPS-211 — Backpressure is propagated, not absorbed.** Unbounded internal queues trade a fast failure for a slow, memory-exhausting one.

**OPS-212 — Cache failures degrade to the origin,** and the origin is protected from the resulting stampede.

**OPS-213 — Cache stampedes are prevented** by request coalescing, staggered expiry, or serving stale while revalidating.

**OPS-214 — The process exits on unrecoverable state** rather than continuing in an undefined one; the orchestrator restarts it.

**OPS-215 — Unhandled rejections and uncaught exceptions are captured, reported, and terminate the process deliberately.**

**OPS-216 — Graceful shutdown is implemented completely:** stop accepting new work, fail readiness, drain in-flight requests and messages, close connections, exit within the grace period.

**OPS-217 — Startup does not accept traffic until dependencies are verified** and the process is genuinely ready.

**OPS-218 — Failure modes are exercised.** Dependency loss, restart under load, and rollback are tested before production discovers them.

---

## §12 Containers and images

**OPS-219 — The image is the deployment artifact.** The same image, byte-for-byte, is promoted through every environment.

**OPS-220 — Images are immutable and content-addressed.** Deployment references a digest; mutable tags are never deployed.

**OPS-221 — A moving latest tag is never deployed to any environment.**

**OPS-222 — Base images are pinned by digest,** and updated on a schedule with a review, not implicitly at build time.

**OPS-223 — Base images come from trusted, maintained sources** and are as minimal as the runtime allows.

**OPS-224 — Multi-stage builds separate build from runtime.** Compilers, development dependencies, and build tooling never ship in the final image.

**OPS-225 — The final image contains only what the process needs to run.** Every extra binary is attack surface.

**OPS-226 — Shells, package managers, and debugging tools are absent from production images** wherever the runtime permits it.

**OPS-227 — The image runs as a non-root user,** created explicitly in the image, with a fixed non-zero identifier.

**OPS-228 — The root filesystem is read-only at runtime,** with writable paths mounted explicitly where genuinely required.

**OPS-229 — Temporary and cache directories are mounted as ephemeral volumes,** not written into the image layers.

**OPS-230 — No secret ever enters the build.** Not as a build argument, not in an intermediate layer, not in a cached layer, not in the image history.

**OPS-231 — Build-time credentials use the builder's secret mounting mechanism,** which does not persist into layers.

**OPS-232 — Build context is minimized by an ignore file** covering version control metadata, dependency directories, environment files, test artifacts, and documentation.

**OPS-233 — Layer ordering is optimized for caching:** dependency manifests copied and installed before application source.

**OPS-234 — Dependency installation uses the lockfile in a reproducible, offline-deterministic mode,** and fails if the lockfile and the manifest disagree.

**OPS-235 — Development and optional dependencies are excluded from the runtime image.**

**OPS-236 — Package manager caches are not left inside layers.** Deleting them in a later layer does not reduce image size; they must never be written into a persisted layer.

**OPS-237 — The image declares an explicit working directory, user, entrypoint, and exposed port.**

**OPS-238 — The process runs as process identifier one correctly, or an init process is used,** so that termination signals reach the application and zombie processes are reaped.

**OPS-239 — The container runs exactly one concern.** Process supervisors bundling several services into one container defeat orchestration, scaling, and failure isolation.

**OPS-240 — The application is the entrypoint, not a shell script wrapper that swallows signals,** unless the wrapper explicitly replaces itself with the application process.

**OPS-241 — Images carry metadata labels** identifying source revision, build time, version, and ownership.

**OPS-242 — Image size is monitored.** Growth is reviewed, because it is usually accidental.

**OPS-243 — Images are scanned for known vulnerabilities in the pipeline,** with a documented severity threshold that fails the build.

**OPS-244 — Scanning is repeated on a schedule for images already deployed,** because vulnerabilities are discovered after the build.

**OPS-245 — A software bill of materials is generated and retained per image.**

**OPS-246 — Images are signed, and the runtime verifies signatures where the platform supports it.**

**OPS-247 — Registry access is authenticated and least-privilege,** with separate credentials for push and pull.

**OPS-248 — Development container configurations are never used in production.** Bind-mounted source, hot reload, exposed debuggers, and permissive settings are development-only by construction.

---

## §13 Runtime and orchestration

**OPS-249 — Resource requests and limits are set for memory and CPU.** A container without limits can destabilize every neighbour on the node.

**OPS-250 — The runtime's memory limit and the application runtime's own heap configuration are aligned,** or the process will be terminated by the platform instead of failing gracefully.

**OPS-251 — Liveness and readiness are distinct checks with distinct meanings.** Liveness answers "should this be restarted"; readiness answers "should this receive traffic".

**OPS-252 — Readiness reflects dependency availability; liveness does not.** A liveness check that fails because a database is down causes a restart storm that fixes nothing.

**OPS-253 — Health checks are cheap, bounded, and never authenticate or perform expensive queries.**

**OPS-254 — A startup check protects slow-starting processes** from being killed before they are ready.

**OPS-255 — The application handles termination signals and begins graceful shutdown immediately.**

**OPS-256 — The shutdown grace period exceeds the longest realistic in-flight operation,** and the application finishes within it.

**OPS-257 — Readiness fails before shutdown begins,** so the load balancer stops sending traffic before connections close.

**OPS-258 — Deployments are rolling and zero-downtime by default,** with the old and new versions briefly coexisting.

**OPS-259 — The application tolerates running alongside the previous version,** in both directions: message formats, database schema, and cache entries.

**OPS-260 — Rollback is always possible and is tested.** A release that cannot be rolled back is a one-way door and requires explicit approval.

**OPS-261 — Replica count is at least two for any production service,** so a single restart is not an outage.

**OPS-262 — Replicas are spread across failure domains** where the platform supports it.

**OPS-263 — Autoscaling signals are chosen deliberately** and are not derived from metrics that saturate before the real bottleneck.

**OPS-264 — Containers write logs to standard streams and let the platform collect them.**

**OPS-265 — Time is synchronized, and the container's timezone is deterministic** — the application never depends on the host's local timezone.

**OPS-266 — Filesystem, network, and capability privileges are dropped to the minimum;** privileged containers, host networking, and host mounts require explicit written justification.

---

## §14 Delivery pipeline and supply chain

**OPS-267 — Every change reaches production through the pipeline.** Manual deployment, hotfixes applied by hand, and direct changes to running containers are forbidden.

**OPS-268 — The pipeline builds once and promotes the same artifact.** Rebuilding per environment means the tested artifact is not the deployed one.

**OPS-269 — Every merge to the mainline is releasable.**

**OPS-270 — Pipeline gates are mandatory and identical to local gates:** type checking, linting, formatting, unit tests, integration tests, build, security scan.

**OPS-271 — A failing gate blocks the merge.** Overrides are recorded with a reason and an owner.

**OPS-272 — Dependencies are pinned by lockfile,** and the lockfile is committed and enforced in CI.

**OPS-273 — Dependency additions are reviewed as a security decision:** maintenance status, transitive weight, license, and whether the problem justifies a dependency at all.

**OPS-274 — Post-install scripts from dependencies are disabled or reviewed** wherever the ecosystem allows.

**OPS-275 — Automated dependency updates run continuously,** with security updates prioritized and applied on a defined timeline.

**OPS-276 — Vulnerability scanning covers application dependencies, base images, and infrastructure definitions.**

**OPS-277 — Static analysis for security issues runs in the pipeline,** not only style linting.

**OPS-278 — Infrastructure is defined as code, versioned, and reviewed.** Manual console changes are drift and are reverted.

**OPS-279 — Pipeline credentials are short-lived and scoped to the job,** preferably issued by federated identity rather than stored as long-lived secrets.

**OPS-280 — The pipeline cannot deploy to production without an approval path appropriate to the risk.**

**OPS-281 — Environments are isolated:** separate credentials, separate data stores, separate networks, separate accounts where possible.

**OPS-282 — Production access from developer machines is not a deployment mechanism.**

**OPS-283 — Every deployment is recorded** with the artifact digest, the source revision, the actor, and the time.

**OPS-284 — Database migrations run as a distinct, observable pipeline step** with a defined ordering relative to the application rollout and a defined failure behaviour.

---

## §15 Testing and quality gates

**OPS-285 — Business rules are tested without infrastructure.** Logic that needs a database to verify is in the wrong layer.

**OPS-286 — Repository and adapter implementations are tested against the real technology,** in a disposable container, not against a hand-written fake that shares the code's assumptions.

**OPS-287 — Test doubles verify behaviour, not call sequences.** Over-mocked tests assert the implementation and break on every refactor.

**OPS-288 — Every endpoint has an integration test covering success, validation failure, unauthenticated, unauthorized, and not-found.**

**OPS-289 — Authorization has a negative test per protected resource,** including cross-tenant access attempts.

**OPS-290 — Idempotency, concurrency, and retry behaviour are tested explicitly,** because they are invisible in single-threaded happy-path tests.

**OPS-291 — Contract tests verify the implementation against the published specification, including error shapes.**

**OPS-292 — Migrations are tested by applying them to a copy of a realistic schema,** including their reverse path where one exists.

**OPS-293 — Tests are deterministic.** No dependence on wall-clock time, timezone, ordering, network, or shared mutable fixtures.

**OPS-294 — Tests are isolated.** Each test creates and disposes of its own data; test order never matters.

**OPS-295 — Flaky tests are fixed or quarantined with an owner,** never re-run until green.

**OPS-296 — Coverage is a diagnostic, not a target.** Critical paths — money, permissions, data mutation, error mapping — are covered thoroughly; a percentage is not a substitute for judgement.

**OPS-297 — Every bug fix ships with the regression test that would have caught it.**

**OPS-298 — Load characteristics are measured before launch** for anything with a known traffic profile, and the first bottleneck is identified.

**OPS-299 — Test data is synthetic.** Production data never appears in a test fixture.

**OPS-300 — The full gate suite runs locally with one documented command,** identical to the pipeline.

---

## §16 Operational readiness

**OPS-301 — Every service has a named owner** responsible for its availability, its dependencies, and its alerts.

**OPS-302 — Every service has a runbook** covering what it does, what it depends on, how to deploy and roll it back, its alerts, and its known failure modes.

**OPS-303 — Service level objectives are defined and measured.** Without them, "is it healthy" has no answer.

**OPS-304 — Dashboards exist before launch,** covering traffic, errors, latency, saturation, and the primary business signal.

**OPS-305 — Alerts are tested.** An alert that has never fired in a drill is an untested code path.

**OPS-306 — Capacity assumptions are written down:** expected load, current headroom, and the scaling action when headroom is exhausted.

**OPS-307 — Dependency inventory is maintained,** including the blast radius of each dependency's failure.

**OPS-308 — Incident response has a defined path:** who is paged, how severity is decided, how communication happens, and who declares the end.

**OPS-309 — Incidents produce a blameless written review** with corrective actions that have owners and dates.

**OPS-310 — Corrective actions are tracked to completion,** or the review was theatre.

**OPS-311 — Security incidents follow a separate, documented procedure** including credential revocation, evidence preservation, and disclosure obligations.

**OPS-312 — A responsible disclosure channel exists and is monitored.**

**OPS-313 — Dependency and platform end-of-life dates are tracked,** and upgrades are planned before support ends rather than after a vulnerability forces it.

**OPS-314 — Operational toil is measured and reduced.** Recurring manual intervention is a backlog item, not a job description.

**OPS-315 — Deviation from this catalog requires a recorded decision** naming the context, the choice, the consequences, and the alternatives rejected. An undocumented deviation is a defect, not a preference.
