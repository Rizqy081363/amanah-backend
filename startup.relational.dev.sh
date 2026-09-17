#!/usr/bin/env bash
set -e

/opt/wait-for-it.sh postgres:5432
bun run db:migrate
bun run db:seed:dev
bun run start:prod
