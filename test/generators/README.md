# Generator e2e tests

End-to-end tests for the hygen-based code generators (`bun run generate:resource:*`, `bun run add:property:to-*`).

## What's Covered

- Every property `--kind` (primitive, reference, denormalized).
- Every primitive type (string, number, boolean, Date).
- Every reference `--referenceType` (oneToOne, oneToMany, manyToOne, manyToMany).
- `--isAddToDto true | false`, `--isOptional true | false`, `--isNullable true | false` permutations.

## Phases

1. **Phase 1 (static)**: runs generators, then `bun run lint`, `bun run build`, then [generators-file-assertions.e2e-spec.ts](generators-file-assertions.e2e-spec.ts). No database, no app boot.
2. **Phase 2 (relational CRUD)**: boots Nest against PostgreSQL in Docker and exercises the generated REST endpoints. Uses [docker-compose.generators-relational.test.yaml](../../docker-compose.generators-relational.test.yaml), PostgreSQL, Redis, and Mailpit.

## Running Locally

Phase 1 only requires Bun / Node, no DB:

```bash
bun run test:generators:relational
```

Phase 2 requires Docker Compose:

```bash
bun run test:e2e:generators:relational:docker
```

**Precondition:** your tracked working tree must be clean. The dirty-tree guard checks `git diff` (tracked changes only); brand-new untracked files outside the cleanup paths are fine.

## Cleanup Model

Each orchestrator installs an `EXIT` trap that:

- `rm -rf src/articles src/tags src/comments`: removes only the generated resource directories.
- `git checkout -- src`: reverts every tracked change inside `src`, including the auto-patched `src/app.module.ts` and any lint-fix incidentals.
- Phase 2: `find src/database/migrations -name "*-GeneratorE2E.ts" -delete` then `docker compose down`.

Cleanup is bounded by path. It never touches the repo root, `node_modules`, or `test`. New untracked files in `test` survive the run.

## Layout

```text
test/generators/
  fixtures/
    matrix.ts                          # canonical entities + properties
  helpers/
    auth.ts                            # admin login helper
    exec.ts                            # child_process wrapper
    payloads-relational.ts             # CRUD payload builder for relational variant
  _matrix.sh                           # generator command list
  run-static.sh                        # Phase 1 orchestrator
  run-crud-relational.sh               # Phase 2 orchestrator
  startup.relational.test.sh           # Custom Docker startup
  generators-file-assertions.e2e-spec.ts
  generators-relational.e2e-spec.ts
  README.md
```
