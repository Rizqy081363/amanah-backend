# Amanah Healthcare — Backend Platform

Modern, robust, clinical-grade backend platform powering **Amanah Healthcare** operations, clinical queues, electronic medical records (EMR), patient management, staff workflows, and mobile client applications.

---

## Architectural Stack

- **Runtime & Framework**: NestJS 11 on Bun / Node.js 24
- **Database (Canonical Persistence)**: PostgreSQL 17 via [Drizzle ORM](https://orm.drizzle.team/)
- **Distributed Cache & Idempotency**: Redis 7 (DB 1) for query caching and distributed lock-based request deduplication (API-139..145)
- **Authentication & Security**: Better Auth & JWT with Role-Based Access Control (`ADMIN`, `PATIENT`, `STAF`)
- **API Error Standard**: RFC 7807 / RFC 9457 Problem Details (`application/problem+json`) with mandatory `x-correlation-id` tracing
- **Email Infrastructure**: Nodemailer with local [Mailpit](https://github.com/axllent/mailpit) capture sink
- **Documentation & Spec**: OpenAPI 3.0 / Swagger UI live at `/docs` (`/docs-json`)

---

## Core Domain Modules

```
src/
├── app.module.ts                         # Root application module & global middleware
├── main.ts                               # Bootstrap, Swagger UI setup & global pipes/filters
├── auth/                                 # Better Auth & JWT authentication strategies
├── common/                               # Cross-cutting concerns & shared infrastructure
│   ├── auth/                             # Roles guard, current-user & public decorators
│   ├── decorators/                       # @Idempotent() distributed concurrency decorator
│   ├── filters/                          # Global RFC 7807 Problem Details exception filter
│   ├── interceptors/                     # Distributed idempotency & cache interceptors
│   ├── middleware/                       # Correlation ID request tracing middleware
│   └── redis/                            # Redis connection pooling & health checks
├── config/                               # Centralized environment configuration
├── database/                             # Drizzle ORM schema, seeds & migrations
├── health/                               # Health probe endpoints (/health/live, /health/ready)
├── home/                                 # App gateway / info endpoint (GET /)
├── mail/                                 # Email dispatching & HTML templates
└── modules/                              # Domain-driven healthcare modules
    ├── appointments/                     # Appointments & live clinic queue ticket system
    ├── attendance/                       # QR/Geofence staff attendance tracking
    ├── clinics/                          # Clinics, departments & operational analytics
    ├── leaves/                           # Staff leave requests & status workflow
    ├── medical-records/                  # Clinical records, soap notes & diagnoses
    ├── notifications/                    # In-app user notifications & read status
    ├── patients/                         # Patient master records & medical identifiers
    ├── schedules/                        # Doctor practice session scheduling
    ├── staffs/                           # Healthcare staff & practitioner profiles
    └── support-tickets/                  # Customer care tickets & live chat replies
```

---

## Getting Started

### 1. Prerequisites
- [Docker](https://www.docker.com/) & Docker Compose
- [Bun](https://bun.sh/) (>= 1.2.0) or Node.js (>= 22.0.0)
- PowerShell 7 (`pwsh`) for running verification suites

### 2. Infrastructure Setup

Start the PostgreSQL, Redis, Mailpit, and Adminer containers:
```bash
docker compose up -d
```

### 3. Database Migration & Seed

Run Drizzle migrations and seed initial development data:
```bash
bun run db:migrate
bun run db:seed:dev
```

### 4. Running the Application

```bash
# Start local development server (with watch mode)
bun run start:dev

# Or run with SWC compiler
bun run start:swc
```

The API will be available at:
- **REST API Base URL**: `http://localhost:3001`
- **Swagger Documentation**: `http://localhost:3001/docs`
- **Mailpit Web UI**: `http://localhost:8025`
- **Adminer Database UI**: `http://localhost:8080`

---

## Automated Verification & Test Suites

The codebase includes end-to-end integration test suites located in `scripts/e2e/`:

```bash
# Verify all 45 API endpoints across the system
bun run test:e2e:all

# Verify distributed idempotency, concurrency lock & payload hashing (18 assertions)
bun run test:e2e:idempotency

# Verify RFC 7807/9457 Problem Details error contracts (18 assertions)
bun run test:e2e:problem-details

# Verify mobile client endpoints (25 assertions)
bun run test:e2e:mobile

# Verify OpenAPI 3.0 / Swagger UI 'Try It Out' specifications (35 assertions)
bun run test:e2e:swagger

# Run the complete end-to-end test suite
bun run test:e2e:full-suite

# Run unit tests via Jest
bun run test

# Run Biome linter and formatter
bun run check
```

---

## Architectural Rules & Documentation

Comprehensive architectural rules, database designs, and API standards are located in `docs/database-amanah-healthcare/`:
- [`API-DESIGN-RULES.md`](docs/database-amanah-healthcare/API-DESIGN-RULES.md) — 200+ canonical REST & security rules
- [`BACKEND-ARCHITECTURE-RULES.md`](docs/database-amanah-healthcare/BACKEND-ARCHITECTURE-RULES.md) — Clean architecture & module boundaries
- [`RUNTIME-SECURITY-OPS-RULES.md`](docs/database-amanah-healthcare/RUNTIME-SECURITY-OPS-RULES.md) — Production runtime security
- [`database-design.md`](docs/database-amanah-healthcare/database-design.md) — Relational schema design & foreign key relationships

---

## Upstream Boilerplate Attribution & Contributors

This repository originated from the NestJS REST API boilerplate by Brocoders and has been extensively adapted into the Amanah Healthcare clinical platform.

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Shchepotin"><img src="https://avatars.githubusercontent.com/u/6001723?v=4?s=100" width="100px;" alt="Vladyslav Shchepotin"/><br /><sub><b>Vladyslav Shchepotin</b></sub></a><br /><a href="#maintenance-Shchepotin" title="Maintenance">🚧</a> <a href="#doc-Shchepotin" title="Documentation">📖</a> <a href="#code-Shchepotin" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/SergeiLomako"><img src="https://avatars.githubusercontent.com/u/31205374?v=4?s=100" width="100px;" alt="SergeiLomako"/><br /><sub><b>SergeiLomako</b></sub></a><br /><a href="#code-SergeiLomako" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ElenVlass"><img src="https://avatars.githubusercontent.com/u/72293912?v=4?s=100" width="100px;" alt="Elena Vlasenko"/><br /><sub><b>Elena Vlasenko</b></sub></a><br /><a href="#doc-ElenVlass" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://brocoders.com"><img src="https://avatars.githubusercontent.com/u/226194?v=4?s=100" width="100px;" alt="Rodion"/><br /><sub><b>Rodion</b></sub></a><br /><a href="#business-sars" title="Business development">💼</a></td>
    </tr>
  </tbody>
</table>
<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->
<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

MIT License. See [LICENSE](LICENSE) for details.
