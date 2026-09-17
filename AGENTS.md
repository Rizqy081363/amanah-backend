# AGENTS.md

# Amanah Healthcare — Rational Legacy Cleanup

## Project Context

This repository is a fork of an existing NestJS backend project.

The original repository contains a mixture of:

* Architecture and directory structures that may still be useful
* Technologies that are no longer part of Amanah Healthcare
* Legacy infrastructure
* Unused integrations
* Historical documentation
* Contributor-specific metadata
* Configuration inherited from the original project
* Features that may not currently be used but could still be architecturally relevant

The goal is to transform this fork into a clean, focused backend foundation for:

> **Amanah Healthcare — a clinical healthcare backend**

The objective is **not** to blindly reproduce the original repository and it is also **not** to aggressively delete everything that is currently unused.

The objective is:

> **Preserve useful architecture. Remove irrelevant legacy. Make every deletion evidence-based.**

---

# 1. Core Principle

Treat the original repository primarily as an **architectural reference**, not as a collection of features that must all be preserved.

The following may be intentionally preserved:

* Directory structure
* Module organization
* Architectural patterns
* Shared abstractions
* Infrastructure patterns
* Error-handling patterns
* Configuration patterns
* Dependency injection patterns
* Testing architecture
* Security architecture
* Authentication/authorization foundations
* Logging infrastructure
* Validation infrastructure
* Common utilities
* Database abstraction patterns
* Other components that can reasonably support Amanah Healthcare

The following may be removed when verified to be irrelevant:

* Unused database technologies
* Legacy integrations
* Deprecated infrastructure
* Historical documentation
* Unused examples
* Unused demo features
* Dead configuration
* Redundant dependencies
* Original-project-specific assets
* Unused adapters
* Unused providers
* Unused scripts

---

# 2. Do Not Treat "Currently Unused" as Automatically "Safe to Delete"

This is one of the most important rules.

A component being unused by the current application does **not** automatically mean it should be deleted.

Before deleting anything, determine:

1. Is it referenced by the current application?
2. Is it required indirectly?
3. Is it part of the architecture?
4. Does another module depend on it?
5. Could it reasonably support Amanah Healthcare?
6. Is it infrastructure rather than a feature?
7. Is it only specific to the original repository?
8. Would removing it make future implementation harder?
9. Is the replacement already present?
10. Is there a clear architectural reason to remove it?

Only then decide whether to keep or remove it.

---

# 3. Database Migration Principle

The original project may use MongoDB.

Amanah Healthcare uses:

> **PostgreSQL**

Therefore, MongoDB-specific implementation should generally be removed **when it is truly part of the legacy stack and has no remaining architectural purpose**.

Inspect the entire repository before removing MongoDB.

Look for:

```text
MongoDB
Mongoose
MongoClient
MongoRepository
Mongo schemas
Mongo entities/models
Mongo configuration
Mongo environment variables
Mongo-specific providers
Mongo-specific modules
Mongo-specific utilities
Mongo-specific tests
Mongo-specific Docker services
Mongo-specific documentation
Mongo-specific scripts
```

Also inspect indirect references.

Do not only search for:

```text
mongodb
```

Search for related abstractions and imports.

---

# 4. PostgreSQL Must Become the Canonical Database

After legacy MongoDB removal, PostgreSQL should be the canonical persistence technology for Amanah Healthcare.

Do not leave two database systems active merely because the original project supported both.

Avoid architecture such as:

```text
PostgreSQL
+
MongoDB
```

unless Amanah Healthcare has a documented requirement for both.

The intended default is:

```text
NestJS
   ↓
PostgreSQL
```

If the repository already contains a suitable PostgreSQL architecture, preserve and adapt it rather than introducing a completely unrelated implementation.

---

# 5. Database Migration Must Be Dependency-Aware

Before deleting MongoDB-related files, trace:

```text
imports
providers
modules
services
repositories
configuration
environment variables
scripts
tests
Docker
CI
documentation
package dependencies
```

For every MongoDB-related component, determine whether it is:

### A. Active and required

Keep it temporarily and migrate or replace it.

### B. Legacy and fully unused

Remove it.

### C. Architectural abstraction that may support PostgreSQL

Keep it and adapt it.

### D. Unclear

Do not delete it until its purpose is understood.

Never classify something as "unused" based solely on filename.

---

# 6. Internationalization / i18n

The original project may contain an internationalization system such as:

```text
i18n
I18n
I18nModule
translations
locales
language files
translation loaders
locale resolvers
```

Do not automatically delete it.

First determine whether internationalization could reasonably be relevant to Amanah Healthcare.

Healthcare applications may eventually need:

* Indonesian
* English
* Additional languages
* Localized validation messages
* Localized patient-facing content
* Localized notifications
* Localized system messages

If the existing i18n implementation is lightweight, well-integrated, and architecturally useful, **preserve it**.

If it is deeply coupled to the original project's unrelated features and provides no reusable architectural value, it may be removed after verification.

Do not remove i18n simply because the current prototype only uses one language.

---

# 7. Authentication and Authorization

Do not remove authentication-related infrastructure merely because the original authentication implementation differs from the planned implementation.

Inspect:

* Auth modules
* Guards
* Strategies
* Session handling
* Token handling
* Authorization
* Roles
* Permissions
* User abstractions
* Security utilities
* Password handling
* OAuth infrastructure

Determine which parts are:

```text
Reusable architecture
vs.
Original-project-specific implementation
```

Preserve useful security architecture where possible.

Replace only the implementation that is incompatible with Amanah Healthcare requirements.

---

# 8. Healthcare Domain Takes Priority

The target domain is:

> Amanah Healthcare — backend for clinical/healthcare operations.

Future backend requirements may include areas such as:

* Users
* Staff
* Doctors
* Patients
* Clinics
* Appointments
* Schedules
* Medical services
* Medical records
* Queues
* Reservations
* Billing
* Notifications
* Authentication
* Authorization
* Healthcare administration

Do not invent domain requirements that have not been established.

However, when deciding whether to preserve a generic architectural component, consider whether it can reasonably support these kinds of healthcare backend requirements.

---

# 9. Preserve Generic Infrastructure

Be conservative when evaluating generic infrastructure.

Examples that should receive additional scrutiny before deletion:

```text
common/
shared/
core/
config/
database/
infrastructure/
utils/
guards/
interceptors/
filters/
decorators/
pipes/
middleware/
logging/
events/
queues/
```

A generic utility may currently have zero usage but still represent useful architecture.

Before deleting it, determine whether:

* It is genuinely obsolete.
* It duplicates something already available.
* It is tightly coupled to the original project.
* It represents an architectural capability likely to be needed.
* Keeping it would create unnecessary maintenance burden.

---

# 10. Remove Original-Project Features, Not Architecture

The fork should gradually become:

```text
Original repository architecture
              ↓
    Rational evaluation
              ↓
     Amanah Healthcare
              ↓
Clean, focused backend
```

Do not destroy useful architectural structure merely because the original project had different business features.

For example:

If the original project has:

```text
src/
├── auth/
├── users/
├── database/
├── common/
├── notifications/
├── billing/
├── legacy-feature/
└── demo/
```

and only `legacy-feature/` and `demo/` are clearly unrelated and unused, remove those components.

Do not flatten the entire project into a new structure unless explicitly requested.

---

# 11. Documentation Cleanup

Legacy documentation is one of the safest areas to clean.

Inspect documentation such as:

```text
README.md
docs/
examples/
architecture/
contributing/
migration/
CHANGELOG
original-project documentation
```

Remove documentation that is clearly specific to the original project and no longer represents Amanah Healthcare.

Examples:

* Original product descriptions
* Original deployment instructions
* Original API examples
* Original screenshots
* Original feature descriptions
* Original database instructions
* Original project branding
* Historical setup instructions
* Deprecated migration guides

Replace the main project documentation with Amanah Healthcare documentation where appropriate.

---

# 12. Contributor Metadata

Be extremely careful with contributor information.

Do not casually modify or delete:

```text
AUTHORS
CONTRIBUTORS
.git-blame-ignore-revs
CODEOWNERS
Git history
Git metadata
commit history
author information
co-author information
license attribution
copyright notices
```

Do not rewrite Git history.

Do not remove contributor attribution merely to make the fork look cleaner.

Do not perform destructive Git operations.

If contributor information is part of historical or legal attribution, preserve it.

If the original repository contains an attribution file that is clearly required by its license, do not remove it.

---

# 13. Git History Is Not a Cleanup Target

The objective is to clean the **working tree**, not rewrite history.

Never:

```text
git reset --hard
git rebase --root
git filter-repo
git filter-branch
rewrite commits
rewrite authors
delete Git history
```

unless explicitly requested as a separate task.

The fact that the project originated from another repository is part of the repository's history.

Do not alter that history as part of normal legacy cleanup.

---

# 14. Dependency Cleanup

Inspect `package.json` carefully.

For every dependency, determine:

```text
Is it imported?
Is it required transitively by project tooling?
Is it used by scripts?
Is it required for build?
Is it required for testing?
Is it framework infrastructure?
Is it legacy?
```

Remove dependencies only when their functionality is no longer needed.

Examples of candidates:

```text
mongoose
mongodb
original-project SDKs
unused API clients
unused cloud providers
unused queues
unused storage providers
unused adapters
unused development tooling
```

Do not remove a package simply because no obvious source import exists.

Some packages may be used through:

* CLI scripts
* configuration
* decorators
* build tooling
* test configuration
* runtime loading
* plugins

Verify first.

---

# 15. Environment Variables

Inspect:

```text
.env
.env.example
.env.local
.env.development
.env.production
configuration files
Docker configuration
CI configuration
```

Identify variables associated with legacy technologies.

For example:

```text
MONGO_URI
MONGODB_URI
MONGO_HOST
MONGO_PORT
```

Do not blindly delete environment variables.

Verify whether they are referenced anywhere.

After MongoDB has been removed completely, remove obsolete MongoDB environment variables from project configuration and examples.

Do not remove unrelated secrets or configuration.

Never expose secret values.

---

# 16. Docker and Infrastructure

Inspect Docker-related files before deleting anything.

Examples:

```text
Dockerfile
docker-compose.yml
compose.yml
docker/
scripts/
```

If Docker contains a MongoDB service that exists only because of the original project, remove it after verifying that nothing else depends on it.

For example:

```yaml
services:
  api:
    ...
  mongodb:
    ...
```

If PostgreSQL is the intended database, the final development infrastructure should not unnecessarily start MongoDB.

However, preserve Docker architecture that remains useful for:

* PostgreSQL
* Redis
* Queues
* Local development
* Testing
* Application services

Do not rewrite Docker infrastructure merely for cosmetic reasons.

---

# 17. Configuration Cleanup

Inspect configuration modules and environment loaders.

Remove configuration that belongs exclusively to deleted technologies.

For example:

```text
MongoDB configuration
Legacy cloud provider configuration
Unused external API configuration
Deprecated feature flags
Original project URLs
Original project secrets
```

Do not remove generic configuration infrastructure simply because some values are currently unused.

---

# 18. Tests

Do not delete tests simply because their corresponding feature is currently not part of the first implementation.

First determine whether the tests represent:

* Generic architecture
* Reusable utilities
* Infrastructure
* Original business logic
* Legacy feature behavior

Tests for deleted original-project features can be removed alongside those features.

Tests for reusable infrastructure should generally remain.

After cleanup, run the available test suite.

---

# 19. Build and Runtime Verification

After cleanup, verify the application from a clean perspective.

At minimum:

```text
install dependencies
↓
format
↓
lint
↓
type-check/build
↓
tests
↓
application startup
```

Use the repository's existing package manager and scripts.

Do not claim the cleanup is complete if the application no longer builds.

---

# 20. Dependency Graph Verification

Before deleting a directory or module, perform repository-wide reference analysis.

Search for:

```text
imports
exports
module references
providers
configuration keys
environment variables
scripts
tests
Docker references
CI references
documentation references
```

A file is not safe to delete simply because it is not imported directly.

---

# 21. Decision Framework

For every potentially removable component, classify it using this decision tree.

### Question 1

Is it currently required by Amanah Healthcare?

```text
YES → KEEP
NO  → continue
```

### Question 2

Is it generic infrastructure that can reasonably support Amanah Healthcare?

```text
YES → KEEP
NO  → continue
```

### Question 3

Could it reasonably be required by the planned backend architecture?

```text
YES → KEEP or DEFER
NO  → continue
```

### Question 4

Is it tightly coupled to the original project's business domain or technology?

```text
YES → REMOVE after dependency verification
NO  → continue
```

### Question 5

Is its purpose unclear?

```text
YES → DO NOT DELETE
```

Uncertainty is a reason to investigate, not a reason to delete.

---

# 22. Confidence Levels

Before destructive cleanup, classify decisions internally as:

### High confidence

Clearly obsolete and fully unused.

Examples:

```text
Original demo feature
Unused MongoDB adapter after PostgreSQL migration
Original project screenshot
Original project-specific documentation
```

These can generally be removed after reference verification.

### Medium confidence

Likely unnecessary but potentially reusable.

These require additional architectural inspection.

### Low confidence

Purpose is unclear or potentially foundational.

Do not delete.

Investigate first.

---

# 23. Batch Deletion Rules

Do not delete hundreds of files in one blind operation.

Prefer incremental cleanup:

```text
1. Inspect
2. Identify candidate
3. Trace dependencies
4. Classify
5. Remove a coherent group
6. Run checks
7. Inspect git diff
8. Continue
```

For example:

```text
MongoDB migration
        ↓
remove Mongo-specific code
        ↓
verify build
        ↓
verify tests
        ↓
remove Mongo dependencies
        ↓
verify again
```

This makes regressions easier to identify.

---

# 24. Git Diff Is Mandatory

After every meaningful cleanup batch:

```bash
git status
git diff
```

Review the changes.

The diff should answer:

> "Did we remove only what we intended to remove?"

If unrelated application logic changed, revert those unrelated changes.

---

# 25. Do Not Optimize for File Count

The goal is not:

> "Make the repository contain fewer files."

The goal is:

> "Make the repository contain only relevant and understandable project assets while preserving useful architecture."

A 500-file project can be cleaner than a 200-file project if the 500 files are meaningful.

Do not delete code simply to make the repository look smaller.

---

# 26. Do Not Create Fake Usage

Never preserve something by creating artificial references just to prevent deletion.

Do not add:

```text
unused imports
fake modules
placeholder calls
dummy services
fake configuration
```

The codebase should reflect actual architecture.

---

# 27. Do Not Rewrite Architecture Without Reason

The existing repository may contain a good architecture.

Preserve it when it is compatible with Amanah Healthcare.

Do not replace the entire architecture simply because:

* Naming is different
* Directory names are unfamiliar
* The original author used a different style
* Another architecture looks more modern
* The code can be reorganized cosmetically

Architecture changes should be driven by an actual requirement.

---

# 28. Naming and Branding Cleanup

Where appropriate, replace original project-specific branding with:

> Amanah Healthcare

Inspect:

```text
README
package.json
application metadata
environment examples
Docker metadata
documentation
API metadata
```

Do not modify historical attribution or legal information merely for branding consistency.

---

# 29. Preserve Licenses and Legal Information

Do not delete:

```text
LICENSE
copyright notices
required attribution
third-party license notices
```

unless there is a clear legal basis and explicit instruction to do so.

Fork cleanup must not accidentally remove required licensing information.

---

# 30. Final Repository State

The desired state is conceptually:

```text
Original Repository
        │
        ├── Useful architecture ────────────┐
        │                                   │
        ├── Reusable infrastructure ────────┤
        │                                   ▼
        ├── Legacy technology ────────→ Rational evaluation
        │                                   │
        ├── Original features ──────────────┤
        │                                   │
        └── Legacy documentation ───────────┘
                                            │
                                            ▼
                                  Amanah Healthcare
                                  focused backend
```

The resulting repository should feel like:

> **Amanah Healthcare's backend that happens to have been derived from an existing architecture**, rather than an unchanged fork containing remnants of another project.

---

# 31. Required Final Verification

Before declaring the cleanup complete, verify:

### Architecture

* Existing useful NestJS architecture remains intact.
* Important abstractions were not accidentally deleted.
* Directory structure remains coherent.

### Database

* PostgreSQL is the canonical database.
* MongoDB is removed only where truly obsolete.
* No stale MongoDB configuration remains.
* No stale MongoDB dependencies remain.
* No unnecessary MongoDB Docker service remains.

### Tooling

* Build works.
* TypeScript works.
* Linting works.
* Formatting works.
* Tests work where available.

### Documentation

* Original-project documentation that is no longer relevant is removed.
* Remaining documentation describes Amanah Healthcare or reusable architecture.
* License and attribution information remain intact.

### Git

* Git history remains untouched.
* Contributor attribution remains intact.
* No destructive Git operations were performed.
* Final diff has been reviewed.

---

# 32. Agent Operating Rules

## Rule 1 — Read First

Do not modify the repository before understanding its structure.

## Rule 2 — Search Before Delete

Every non-trivial deletion requires repository-wide reference checking.

## Rule 3 — Preserve Before Rebuild

If an existing component can serve Amanah Healthcare, prefer preserving/adapting it over rebuilding it.

## Rule 4 — Uncertainty Means Keep

If you cannot confidently determine that something is obsolete, do not delete it yet.

## Rule 5 — Delete Coherently

When removing a technology, remove its complete obsolete footprint:

```text
implementation
configuration
dependencies
environment variables
tests
Docker
scripts
documentation
```

but only when each component is independently verified as belonging to that obsolete technology.

## Rule 6 — Never Touch History

Do not rewrite Git history or contributor metadata.

## Rule 7 — Avoid Cosmetic Refactoring

Do not reorganize the repository merely to make it look cleaner.

## Rule 8 — Verify After Change

Every meaningful cleanup batch must be followed by build/lint/test verification where applicable.

## Rule 9 — No Guessing

Never invent why a file exists.

Inspect it and trace its usage.

## Rule 10 — Preserve Future Utility

A component does not need to be used today to justify keeping it.

If it represents useful, lightweight infrastructure with reasonable future relevance to Amanah Healthcare, preserve it.

---

# 33. Final Report

At the end of the cleanup, provide a concise report containing:

### Removed

List the major legacy components removed and why.

Example:

```text
- MongoDB/Mongoose persistence layer
  Reason: PostgreSQL is the canonical database and no remaining code depends on MongoDB.

- Original demo module
  Reason: Original-project-specific and unrelated to Amanah Healthcare.

- Legacy documentation
  Reason: Described the original application rather than the resulting project.
```

### Preserved

List important components intentionally retained.

Example:

```text
- Authentication architecture
- Shared infrastructure
- Configuration module
- i18n infrastructure
- Error handling
- Testing structure
```

### Deferred

List anything intentionally not removed because its purpose or future relevance remains uncertain.

Example:

```text
- Generic notification abstraction
- i18n infrastructure
- Shared event abstraction
```

### Verification

Report the actual commands executed and their results.

Never claim a command passed if it was not actually executed.

---

# AGENTS.md — Feature Specification & Delegation Workflow

## Purpose

This document defines the workflow that agents MUST follow before implementing or delegating a feature to Frontend or Backend engineering work.

The primary objective is to prevent:

* implementation based on assumptions
* duplicated business logic
* frontend/backend contract mismatch
* undocumented architectural decisions
* undocumented API behavior
* scope creep
* hallucinated requirements
* implementation that does not respect the existing repository architecture

The repository itself is the primary source of truth.

**Read first. Implement second.**

---

# 1. Core Principle

Never begin implementation immediately after receiving a feature request.

First determine:

1. What is being requested?
2. What already exists?
3. Which architectural boundaries are affected?
4. What are the business rules?
5. What data is required?
6. What API contract is required?
7. What does the frontend need?
8. What does the backend need?
9. How will the result be verified?
10. What is explicitly out of scope?

Do not invent missing information.

If important information cannot be established from the repository, existing documentation, design files, or the user's explicit requirements, mark it as **UNKNOWN** and ask for clarification when necessary.

---

# 2. Repository Exploration Comes First

Before proposing or implementing changes, inspect the repository.

Prioritize reading over reasoning.

Inspect at minimum:

* repository structure
* existing architecture
* package/module boundaries
* existing feature implementations
* configuration
* constants
* environment handling
* database layer
* API layer
* authentication/authorization
* validation
* error handling
* existing documentation
* OpenAPI/Swagger definitions
* frontend integration patterns
* testing conventions

Do not assume that a common framework convention is being used.

The existing repository architecture takes precedence over generic framework conventions.

---

# 3. Establish the Feature Specification

Before implementation, create or update the relevant feature specification under:

```text
docs/features/
```

Example:

```text
docs/features/doctor-schedule.md
```

The specification should contain:

```markdown
# Feature Name

## Goal

What problem does this feature solve?

## Actors

Who can use this feature?

## User Flow

Describe the expected flow.

## Functional Requirements

List the required behavior.

## Business Rules

Describe rules that must be enforced.

## Data Requirements

Describe required entities, fields, relationships, and states.

## API Requirements

Describe required endpoints and contracts.

## UI Requirements

Describe required frontend behavior.

## Error States

Describe expected failure conditions.

## Acceptance Criteria

Define objectively verifiable outcomes.

## Out of Scope

Explicitly describe what this feature does NOT include.
```

Do not create requirements that were not established by evidence.

---

# 4. Separate Responsibilities

Every feature must clearly distinguish ownership.

Use the following model:

```text
Frontend owns:
- presentation
- UI state
- user interaction
- client-side form behavior
- API integration
- loading/error/empty states

Backend owns:
- business rules
- authorization
- validation
- persistence
- transactional behavior
- domain logic
- API behavior

Shared contract:
- request schema
- response schema
- HTTP semantics
- error semantics
- enum values
- authentication requirements
```

Do not move business rules into the frontend merely because they are convenient to implement there.

Do not move presentation concerns into the backend.

---

# 5. Define Business Rules Before Code

Business rules must be identified before implementation.

For example:

```text
A doctor cannot have overlapping schedules.

A schedule cannot be created without a valid doctor.

Only authorized administrators can modify schedules.

A schedule marked as leave cannot accept bookings.
```

Only document rules that are actually established.

If a rule is unclear:

```text
UNKNOWN — clarification required.
```

Do not silently invent behavior.

---

# 6. Define the Data Contract

Before implementation, identify:

* entities
* fields
* field types
* required/optional fields
* relationships
* enums
* nullable fields
* identifiers
* state transitions

Example:

```text
DoctorSchedule

id
doctorId
date
startTime
endTime
roomId
capacity
status
createdAt
updatedAt
```

Do not introduce a new entity when an existing entity already represents the same concept.

Search the repository first.

---

# 7. Define the API Contract

Frontend and backend must share an explicit API contract.

The contract should define:

* HTTP method
* endpoint
* authentication
* authorization
* path parameters
* query parameters
* request body
* response body
* status codes
* validation errors
* business errors
* pagination
* filtering
* sorting
* enums

Example:

```http
GET /api/v1/doctors/{doctorId}/schedules
```

Example response:

```json
{
  "data": [
    {
      "id": "sch_123",
      "doctorId": "doc_001",
      "date": "2026-09-20",
      "startTime": "09:00",
      "endTime": "13:00",
      "status": "AVAILABLE"
    }
  ]
}
```

The actual repository conventions MUST be inspected before defining a new contract.

Do not invent endpoint naming conventions if an established convention already exists.

---

# 8. Swagger / OpenAPI Synchronization

If the project uses Swagger/OpenAPI:

**OpenAPI documentation MUST remain synchronized with the actual implementation.**

Before modifying API documentation:

1. inspect the actual controller
2. inspect DTOs
3. inspect validation
4. inspect response types
5. inspect authentication/authorization
6. inspect service behavior
7. compare against existing Swagger definitions

Swagger must describe reality.

Never modify Swagger based on assumptions.

Never use Swagger as evidence that an endpoint behaves a certain way if the implementation contradicts it.

If implementation and Swagger disagree:

```text
Implementation
      ↓
Reality check
      ↓
Determine intended contract
      ↓
Synchronize Swagger
```

If the intended behavior cannot be established, flag the discrepancy instead of guessing.

---

# 9. UI Specification

When a feature requires frontend work, document the UI requirements.

At minimum define:

```text
Screen
Components
User interactions
Loading state
Empty state
Error state
Validation state
Success state
Disabled state
Permission-dependent state
```

If a Figma design or screenshot exists, treat it as visual reference.

Do not invent UI elements that are not present in the source material unless the requirement explicitly calls for them.

---

# 10. Acceptance Criteria

Every feature MUST have acceptance criteria.

Acceptance criteria must be objectively testable.

Prefer:

```text
Given an authenticated administrator

When the administrator updates a doctor's schedule

Then the backend persists the new schedule

And the API returns the updated schedule
```

over vague statements such as:

```text
The schedule should work correctly.
```

Acceptance criteria should cover:

* happy path
* validation
* authorization
* error handling
* empty states where applicable
* edge cases
* integration behavior

---

# 11. Define Out of Scope

Every non-trivial feature should explicitly define what is excluded.

Example:

```markdown
## Out of Scope

- WhatsApp notifications
- automatic schedule generation
- payroll integration
- doctor mobile application
- appointment billing
```

Do not implement out-of-scope functionality unless the user explicitly expands the requirement.

---

# 12. Technical Design

For changes that affect architecture, create or update technical documentation under:

```text
docs/architecture/
```

Document:

* affected modules
* dependencies
* data flow
* integration points
* architectural constraints
* migration requirements
* infrastructure impact

For significant architectural decisions, create an ADR:

```text
docs/decisions/
```

Example:

```text
docs/decisions/ADR-001-schedule-domain.md
```

An ADR should explain:

```text
Context
Decision
Alternatives considered
Consequences
```

Do not create an ADR for trivial implementation details.

---

# 13. Delegation Readiness Checklist

A feature is ready to be delegated when the following are sufficiently defined:

```text
[ ] Goal is clear
[ ] Actors are identified
[ ] User flow is defined
[ ] Functional requirements are defined
[ ] Business rules are defined
[ ] Data requirements are defined
[ ] API contract is defined
[ ] UI requirements are defined when applicable
[ ] Error behavior is defined
[ ] Acceptance criteria are defined
[ ] Out-of-scope items are defined
[ ] Existing architecture has been inspected
[ ] Existing implementation has been inspected
[ ] Relevant constants/configuration have been identified
[ ] Swagger/OpenAPI impact is identified
[ ] Database impact is identified
[ ] Authentication/authorization impact is identified
```

Not every checkbox must produce a separate document.

The goal is **clarity**, not documentation volume.

---

# 14. Frontend Delegation

When delegating to Frontend Engineering, provide:

```text
Feature specification
+
UI/UX design
+
User flow
+
API contract
+
Authentication requirements
+
Error semantics
+
Acceptance criteria
```

Frontend engineers should NOT need to reverse-engineer backend behavior from source code when a stable API contract can be provided.

Frontend implementation must follow the agreed API contract.

If the contract is insufficient, stop and resolve the contract rather than inventing request/response behavior.

---

# 15. Backend Delegation

When delegating to Backend Engineering, provide:

```text
Feature specification
+
Business rules
+
Data requirements
+
API requirements
+
Authorization requirements
+
Acceptance criteria
```

Backend engineers should determine the implementation details according to the existing architecture.

Do not prescribe implementation details unnecessarily.

For example, prefer:

```text
The system must prevent overlapping schedules.
```

over:

```text
Create ScheduleValidationService.ts and put overlap validation there.
```

The first defines the requirement.

The second prematurely dictates implementation.

---

# 16. Parallel Frontend and Backend Work

Frontend and Backend may work in parallel only after the shared contract is sufficiently stable.

Recommended flow:

```text
Feature Specification
        ↓
Business Rules
        ↓
API Contract
        ↓
   ┌────┴────┐
   ↓         ↓
Backend   Frontend
   ↓         ↓
   └────┬────┘
        ↓
Integration
        ↓
Acceptance Testing
```

Do not allow frontend and backend engineers to independently invent their own contract.

---

# 17. Change Management

When requirements change:

1. update the feature specification
2. update business rules
3. update data requirements if necessary
4. update API contract if necessary
5. update Swagger/OpenAPI
6. update frontend requirements
7. update acceptance criteria
8. identify affected implementation

Do not modify implementation alone while leaving the specification and contract stale.

Documentation and implementation must remain synchronized.

---

# 18. Existing Architecture Has Priority

Before introducing:

* new modules
* new services
* new utilities
* new constants
* new configuration
* new database patterns
* new API patterns
* new error handling
* new authentication mechanisms

search for an existing equivalent.

If one exists, reuse it unless there is an established reason not to.

Avoid:

```text
duplicate constant
duplicate config
duplicate utility
duplicate service
duplicate API pattern
duplicate validation
duplicate error format
```

The agent MUST respect the existing architecture.

---

# 19. No Hallucination Policy

The agent MUST NOT fabricate:

* endpoints
* database fields
* DTO properties
* business rules
* configuration values
* environment variables
* modules
* services
* existing functionality
* API responses
* authentication behavior
* frontend components

When something cannot be established:

```text
UNKNOWN
```

Then either:

1. inspect more of the repository,
2. inspect the relevant documentation,
3. inspect related implementations,
4. ask the user for clarification.

Never convert uncertainty into an implementation assumption.

---

# 20. Definition of Ready

A feature is **Ready for Implementation** when:

```text
Requirement is understood
AND
Architecture impact is understood
AND
Business rules are understood
AND
Data requirements are understood
AND
API contract is understood
AND
UI requirements are understood when applicable
AND
Acceptance criteria are testable
AND
Scope boundaries are clear
```

If these conditions are not satisfied, continue exploration or request clarification.

---

# 21. Definition of Done

A feature is **Done** only when:

```text
Implementation completed
AND
Tests completed where applicable
AND
API contract matches implementation
AND
Swagger/OpenAPI is synchronized
AND
Frontend integration works where applicable
AND
Acceptance criteria pass
AND
No known architectural violation was introduced
AND
Relevant documentation is updated
```

A feature is not considered complete merely because the code compiles.

---

# 22. Agent Execution Protocol

For every non-trivial feature, follow this sequence:

```text
PHASE 1 — EXPLORE
Read repository and existing implementation.

PHASE 2 — UNDERSTAND
Identify architecture, domain, dependencies, and constraints.

PHASE 3 — SPECIFY
Create or update the feature specification.

PHASE 4 — CONTRACT
Define or verify the API/data contract.

PHASE 5 — PLAN
Identify affected modules and implementation boundaries.

PHASE 6 — IMPLEMENT
Implement according to the repository architecture.

PHASE 7 — SYNCHRONIZE
Update API documentation, Swagger/OpenAPI, and relevant docs.

PHASE 8 — VERIFY
Run tests, validation, linting, type checking, and relevant integration checks.

PHASE 9 — ACCEPT
Verify every acceptance criterion.

PHASE 10 — REPORT
Summarize:
- what changed
- why it changed
- files affected
- contracts changed
- documentation changed
- verification performed
- unresolved issues
```

---

# 23. Final Principle

The goal is not to produce more documentation.

The goal is to eliminate ambiguity before implementation.

Use this hierarchy:

```text
Requirements
    ↓
Business Rules
    ↓
Architecture
    ↓
Data Contract
    ↓
API Contract
    ↓
UI Contract
    ↓
Implementation
    ↓
Verification
```

**Do not let implementation become the place where requirements are discovered accidentally.**

**Read first. Establish the contract. Then implement.**
