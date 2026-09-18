# Amanah Healthcare - Scripts Directory

This directory contains utility and automated end-to-end verification scripts for the Amanah Healthcare Backend platform.

---

## Directory Structure

```
scripts/
├── README.md                 # This documentation file
└── e2e/                      # End-to-end integration and verification suites
    ├── test-all-endpoints.ps1              # Verifies all 45 API endpoints across the system
    ├── test-idempotency.ps1                # Distributed idempotency & concurrency (API-139..145)
    ├── test-problem-details.ps1            # RFC 7807/9457 error contracts (API-197)
    ├── test-swagger-spec.ps1               # OpenAPI 3.0 specification & Swagger UI 'Try It Out'
    ├── test-mobile-endpoints.ps1           # Mobile client compatibility (tickets, leaves, analytics)
    ├── test-better-auth-credentials.ps1    # Better Auth & JWT authentication flows
    ├── test-email-infrastructure.ps1       # Mailpit SMTP verification & templating
    ├── test-cache-invalidation.ps1         # Redis cache invalidation on mutations
    ├── test-phase1-crud.ps1                # Clinical foundation CRUD workflows
    ├── test-phase2-queue.ps1               # Queue ticket management & TV display flows
    ├── test-phase3-medical-records.ps1     # Medical records lifecycle & diagnosis
    └── test-endpoints.ps1                  # General endpoint smoke tests
```

---

## Running Verification Suites

All test suites can be executed either directly via PowerShell (`powershell`) or through standardized `npm` / `bun` scripts configured in `package.json`.

### Using npm / bun (Recommended)

```bash
# Run all 45 API endpoints
bun run test:e2e:all

# Run distributed idempotency test suite (18 assertions)
bun run test:e2e:idempotency

# Run RFC 7807 problem details test suite (18 assertions)
bun run test:e2e:problem-details

# Run mobile client verification suite (25 assertions)
bun run test:e2e:mobile

# Run OpenAPI 3.0 / Swagger test suite (35 assertions)
bun run test:e2e:swagger

# Run authentication credentials suite
bun run test:e2e:auth

# Run email infrastructure & Mailpit suite
bun run test:e2e:email

# Run Redis cache invalidation suite
bun run test:e2e:cache

# Run all sequential phase suites (Phase 1 CRUD, Phase 2 Queue, Phase 3 Medical Records)
bun run test:e2e:phases

# Run the complete end-to-end verification suite
bun run test:e2e:full-suite
```

### Direct Execution with PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File scripts/e2e/test-all-endpoints.ps1
powershell -ExecutionPolicy Bypass -File scripts/e2e/test-idempotency.ps1
powershell -ExecutionPolicy Bypass -File scripts/e2e/test-problem-details.ps1
powershell -ExecutionPolicy Bypass -File scripts/e2e/test-swagger-spec.ps1
powershell -ExecutionPolicy Bypass -File scripts/e2e/test-mobile-endpoints.ps1
```

---

## Prerequisites

Before executing the E2E verification suites:
1. Docker infrastructure must be running:
   ```bash
   bun run infra:up
   ```
2. API container must be reachable through `E2E_BASE_URL` (default: `http://localhost:3001`).
3. PostgreSQL, Redis, Mailpit, and Adminer host ports are configured in `.env`.
4. Mailpit must be reachable through `E2E_MAILPIT_BASE_URL` (default: `http://localhost:8025`).
