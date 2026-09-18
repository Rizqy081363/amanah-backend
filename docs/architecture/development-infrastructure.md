# Development Infrastructure

## Goal

The local stack must be reproducible for every developer without editing tracked Docker, script, or source files. Developer-specific choices live in `.env`; tracked defaults live in `.env.example` and `env-example-relational`.

## Configuration Contract

Host-published ports are configured only through `.env`:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `API_HOST_PORT` | `3001` | Host port for the NestJS API |
| `POSTGRES_HOST_PORT` | `5433` | Host port for PostgreSQL |
| `REDIS_HOST_PORT` | `6379` | Host port for Redis |
| `SMTP_HOST_PORT` | `1025` | Host port for Mailpit SMTP |
| `MAILPIT_HOST_PORT` | `8025` | Host port for Mailpit Web UI |
| `ADMINER_HOST_PORT` | `8080` | Host port for Adminer |

Container-internal service names and ports stay stable:

- API talks to PostgreSQL at `postgres:5432`.
- API talks to Redis at `redis:6379`.
- API sends mail to Mailpit at `mailpit:1025`.
- API listens inside the container on `APP_PORT` (`3001` by default).

When changing `API_HOST_PORT`, update these values in the same `.env` file:

- `BACKEND_DOMAIN`
- `BETTER_AUTH_URL`
- `E2E_BASE_URL`

When changing `MAILPIT_HOST_PORT`, update `E2E_MAILPIT_BASE_URL`.

Do not set `DATABASE_URL` for normal local development. The application and
database tooling derive the PostgreSQL connection from `DATABASE_HOST`,
`POSTGRES_HOST_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, and
`DATABASE_NAME`. Reserve `DATABASE_URL` for explicit environment overrides such
as managed production databases.

Do not set `CACHE_REDIS_URL` for normal local development. The application
derives Redis from `REDIS_HOST_PORT` on the host and from `REDIS_HOST` /
`REDIS_PORT` inside containers. Reserve `CACHE_REDIS_URL` or `WORKER_HOST` for
explicit environment overrides.

## Standard Commands

Use the infra scripts rather than raw compose commands for normal development:

```powershell
bun run infra:up
bun run infra:up:build
bun run infra:ps
bun run infra:logs
bun run infra:down
```

`infra:up` checks configured host ports before starting a fresh stack and waits for `/health/ready`.

## Startup Sequence

The API container startup is deterministic:

1. Wait for PostgreSQL.
2. Wait for Redis.
3. Apply Drizzle migrations when `RUN_DB_MIGRATIONS=true`.
4. Seed development data when `RUN_DB_SEED=true`.
5. Start the compiled NestJS API as PID 1 via `exec bun run start:prod`.

Docker Compose additionally waits for healthy PostgreSQL, Redis, and Mailpit services before starting the API container.

## Migration Policy

Drizzle migrations are append-only. Do not rewrite an already-applied migration to fix a local issue.

The Better Auth tables are created by `0002_better_auth_tables.sql`. The companion snapshot `meta/0002_snapshot.json` records the current TypeScript Drizzle schema as the baseline so future `drizzle-kit generate` operations do not recreate the existing Amanah schema.

Before declaring a migration safe:

1. Apply it to an empty database.
2. Apply it to an already-migrated database.
3. Confirm `drizzle.__drizzle_migrations` contains the expected new row.
4. Confirm `generateMigration(previousSnapshot, currentSchema)` produces zero statements when no schema changes were made.

## Clean Developer Validation

A clean validation should use a separate Compose project and alternate host ports when the default stack is already running. Example:

```powershell
$env:COMPOSE_PROJECT_NAME = "amanah-clean-check"
$env:API_HOST_PORT = "13001"
$env:POSTGRES_HOST_PORT = "15433"
$env:REDIS_HOST_PORT = "16379"
$env:SMTP_HOST_PORT = "11025"
$env:MAILPIT_HOST_PORT = "18025"
$env:ADMINER_HOST_PORT = "18080"
$env:BACKEND_DOMAIN = "http://localhost:13001"
$env:BETTER_AUTH_URL = "http://localhost:13001"
$env:E2E_BASE_URL = "http://localhost:13001"
$env:E2E_MAILPIT_BASE_URL = "http://localhost:18025"
bun run infra:up:build
bun run test:e2e:all
docker-compose -p amanah-clean-check down -v
```
