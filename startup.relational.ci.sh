#!/usr/bin/env bash
set -e

/opt/wait-for-it.sh postgres:5432
bun run db:migrate
bun run db:seed:dev
bun run start:prod > prod.log 2>&1 &
/opt/wait-for-it.sh maildev:1080
/opt/wait-for-it.sh localhost:3001
bun run lint
bun run test:e2e -- --runInBand
