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
