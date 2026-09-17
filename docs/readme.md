# Amanah Healthcare Documentation

Documentation index for the Amanah Healthcare Backend platform.

---

## Canonical Architecture & Design Rules

The authoritative design rules and specifications for Amanah Healthcare are maintained in [`docs/database-amanah-healthcare/`](database-amanah-healthcare/):

- **[API Design Rules (API-001..API-200)](database-amanah-healthcare/API-DESIGN-RULES.md)** — Comprehensive guidelines for REST contracts, status codes, pagination, idempotency, RFC 7807/9457 Problem Details, caching, and rate limiting.
- **[Backend Architecture Rules (ARC-001..ARC-100)](database-amanah-healthcare/BACKEND-ARCHITECTURE-RULES.md)** — Clean architecture boundaries, dependency inversion, error wrapping, repository patterns, and resilience.
- **[Runtime Security & Ops Rules (SEC-001..SEC-100)](database-amanah-healthcare/RUNTIME-SECURITY-OPS-RULES.md)** — Production security standards, credential management, TLS, and operational observability.
- **[Database Design & Schema](database-amanah-healthcare/database-design.md)** — Relational entity modeling, foreign key constraints, indexes, and migrations.
- **[Database Schema SQL DDL](database-amanah-healthcare/schema.sql)** — Reference SQL DDL for PostgreSQL 17.
- **[Entity Relationship Diagram (ERD)](database-amanah-healthcare/erd.mmd)** — Mermaid ERD diagram.

---

## Verification & Testing

For end-to-end verification and automation scripts, refer to:
- **[Scripts & E2E Suites](../scripts/README.md)** — Automated test execution with Bun and PowerShell.

---

## Feature Delivery & Delegation

- **[Frontend Delegation Workflow](frontend-delegation.md)** — Required backend-to-frontend handoff structure for UI requirements, API contracts, auth, error semantics, and acceptance criteria.

---

## Legacy Architectural Reference Documentation

The following guides from the original project structure are preserved as architectural references:

- [Architecture Reference](architecture.md)
- [Auth Architecture](auth.md)
- [Installing and Running](installing-and-running.md)
- [CLI Tooling](cli.md)
- [File Uploading Reference](file-uploading.md)
- [Serialization](serialization.md)
- [Tests Setup](tests.md)
