#!/usr/bin/env bash
set -Eeuo pipefail

# Amanah Healthcare - Infrastructure Starter (POSIX/Bash)
# Delegates to the cross-platform bun runner when bun is available,
# or invokes docker compose directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if command -v bun >/dev/null 2>&1; then
  exec bun "${SCRIPT_DIR}/infra.ts" up "$@"
fi

echo "[Amanah Infra] Warning: bun not found in PATH, falling back to raw docker compose."
cd "${REPO_ROOT}"

if docker compose version >/dev/null 2>&1; then
  exec docker compose up -d "$@"
elif command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose up -d "$@"
else
  echo "[Amanah Infra] Error: Docker Compose is required." >&2
  exit 1
fi
