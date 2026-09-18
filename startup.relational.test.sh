#!/usr/bin/env bash
set -Eeuo pipefail

trap 'echo "[startup:test] failed at line ${LINENO}" >&2' ERR

WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-60}"
DATABASE_HOST="${DATABASE_HOST:-postgres}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
MAIL_HOST="${SMTP_HOST:-${MAIL_HOST:-mailpit}}"
MAIL_WEB_PORT="${MAILPIT_INTERNAL_PORT:-8025}"

/opt/wait-for-it.sh -t "${WAIT_TIMEOUT_SECONDS}" "${DATABASE_HOST}:${DATABASE_PORT}"
/opt/wait-for-it.sh -t "${WAIT_TIMEOUT_SECONDS}" "${MAIL_HOST}:${MAIL_WEB_PORT}"
bun run db:migrate
bun run db:seed:dev
exec bun run start:dev
