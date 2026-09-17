#!/usr/bin/env bash
set -e

/opt/wait-for-it.sh postgres:5432
/opt/wait-for-it.sh maildev:1080
bun install --frozen-lockfile
bun run db:migrate
bun run db:seed:dev
bun run start:dev
