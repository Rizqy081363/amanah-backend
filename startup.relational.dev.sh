#!/usr/bin/env bash
set -Eeuo pipefail

trap 'echo "[startup] failed at line ${LINENO}" >&2' ERR

WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-60}"
DATABASE_HOST="${DATABASE_HOST:-postgres}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"

echo "[startup] waiting for PostgreSQL at ${DATABASE_HOST}:${DATABASE_PORT}"
/opt/wait-for-it.sh -t "${WAIT_TIMEOUT_SECONDS}" "${DATABASE_HOST}:${DATABASE_PORT}"

echo "[startup] waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}"
/opt/wait-for-it.sh -t "${WAIT_TIMEOUT_SECONDS}" "${REDIS_HOST}:${REDIS_PORT}"

if [[ "${RUN_DB_MIGRATIONS:-true}" == "true" ]]; then
  echo "[startup] applying database migrations"
  bun run db:migrate
else
  echo "[startup] skipping database migrations"
fi

if [[ "${RUN_DB_SEED:-true}" == "true" ]]; then
  echo "[startup] seeding development data"
  bun run db:seed:dev
else
  echo "[startup] skipping development seed"
fi

echo "[startup] starting API"
exec bun run start:prod
