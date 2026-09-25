# Profile-Image Backend Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a robust, backend-first profile-image infrastructure for Amanah Healthcare supporting Google OAuth defaults, initials fallback avatars, atomic custom uploads/replacements, and a unified client response contract.

**Architecture:** Hexagonal architecture with a domain storage port (`AvatarStoragePort`) and local adapter, sharp-based bounded WebP image processing (512×512, EXIF stripped), on-the-fly initials SVG fallback generator, single source of truth in `users.image_url` synchronized with `staff_profiles.avatar_url`, and fixed Better Auth triggers.

**Tech Stack:** NestJS 11, Drizzle ORM, PostgreSQL 17, `better-auth`, `sharp`, `file-type`, `multer`.

**Spec:** [`docs/superpowers/specs/2026-09-22-profile-image-infrastructure-design.md`](docs/superpowers/specs/2026-09-22-profile-image-infrastructure-design.md)

## Global Constraints
- Target database is PostgreSQL (canonical identity in `public.users.id`).
- All uploads must be validated at magic-byte level and bounded at 5MB transport / 512×512 WebP storage.
- File replacements must be atomic (write-temp-then-rename) with obsolete file cleanup.
- Every client receives a predictable profile representation with `avatarUrl`, `initials`, `avatarType`, and `hasCustomAvatar`.
- Singleton changelog principle: all integration guidance written to a new file `docs/backend/AVATAR-LIFECYCLE-CHANGELOG.md`.

---

### Task 1: Package Dependencies (`sharp`) & Docker Container Readiness
**Files:**
- Modify: `package.json`
- Target Container: `amanah-healthcare-backend-api-1`

- [ ] **Step 1: Install sharp and types**
  Run `bun add sharp @types/sharp` on host and in container.
- [ ] **Step 2: Verify sharp imports cleanly**
  Run node/bun test snippet importing sharp to confirm native binaries work in the Alpine container.
- [ ] **Step 3: Commit dependency changes**
  `git commit -m "chore(deps): add sharp for avatar image processing"`

---

### Task 2: Database Migration — OAuth Sync Trigger Fix
**Files:**
- Create: `src/database/migrations/0005_sync_oauth_avatar.sql`
- Execute against: live PostgreSQL database

- [ ] **Step 1: Create SQL migration**
  Write migration `0005_sync_oauth_avatar.sql` updating `fn_sync_better_auth_user_to_core_users()` to synchronize `NEW.image` to `users.image_url` using `COALESCE(users.image_url, EXCLUDED.image_url)`.
- [ ] **Step 2: Apply migration to live DB**
  Execute migration via `docker compose exec postgres psql -U amanah -d amanah_healthcare -f ...` or `drizzle-kit migrate`.
- [ ] **Step 3: Verify trigger update**
  Inspect `\ef fn_sync_better_auth_user_to_core_users` to confirm `image_url` is present in the trigger definition.
- [ ] **Step 4: Commit migration**
  `git commit -m "feat(db): update better-auth sync trigger to propagate oauth avatar to users.image_url"`

---

### Task 3: Initials Helper & SVG Fallback Service
**Files:**
- Create: `src/common/utils/name-initials.helper.ts`
- Create: `src/common/utils/name-initials.helper.spec.ts`
- Create: `src/modules/avatar/avatar-svg.service.ts`
- Create: `src/modules/avatar/avatar-svg.service.spec.ts`

- [ ] **Step 1: Write unit tests for `NameInitialsHelper`**
  Test extracting initials from standard names ("Fadilah Ahmad Zikri" -> "FA"), single names ("Budi" -> "BU"), and medical titles ("dr. Ahmad Santoso" -> "AS", "Bdn. Siti Rahmawati, Sp.OG" -> "SR").
- [ ] **Step 2: Implement `NameInitialsHelper`**
  Implement regex filtering for Indonesian clinical prefixes/suffixes and clean initial extraction.
- [ ] **Step 3: Implement `AvatarSvgService` with unit tests**
  Generate deterministic color palette from user ID/name and render circular 512x512 SVG with bold initials.
- [ ] **Step 4: Run unit tests**
  Execute `bun test src/common/utils/name-initials.helper.spec.ts` and `AvatarSvgService` tests.
- [ ] **Step 5: Commit**
  `git commit -m "feat(avatar): implement NameInitialsHelper and AvatarSvgService with unit tests"`

---

### Task 4: Hexagonal Avatar Storage Port & Local Adapter
**Files:**
- Create: `src/modules/avatar/ports/avatar-storage.port.ts`
- Create: `src/modules/avatar/adapters/local-avatar-storage.adapter.ts`

- [ ] **Step 1: Define `AvatarStoragePort` interface**
  Methods: `saveAvatar(userId: string, buffer: Buffer): Promise<{ storageKey: string; relativePath: string }>`, `getAvatarStream(storageKey: string): Promise<{ stream: Readable; mimeType: string; size: number } | null>`, `deleteAvatar(storageKey: string): Promise<void>`.
- [ ] **Step 2: Implement `LocalAvatarStorageAdapter`**
  Write to `./data/uploads/avatars/{userId}/avatar.webp` with atomic temp-file-rename and path-traversal guard.
- [ ] **Step 3: Commit**
  `git commit -m "feat(avatar): implement AvatarStoragePort and LocalAvatarStorageAdapter"`

---

### Task 5: Avatar Processing Service (Validation & Transformation)
**Files:**
- Create: `src/modules/avatar/avatar-processing.service.ts`
- Create: `src/modules/avatar/avatar-processing.service.spec.ts`

- [ ] **Step 1: Write unit tests for `AvatarProcessingService`**
  Verify magic byte sniffing (reject non-images) and successful WebP re-encoding.
- [ ] **Step 2: Implement `AvatarProcessingService`**
  Verify buffer with `file-type`, process with `sharp` (auto-orient, resize 512x512 cover, strip EXIF metadata, format webp).
- [ ] **Step 3: Commit**
  `git commit -m "feat(avatar): implement AvatarProcessingService with sharp and file-type sniffing"`

---

### Task 6: Avatar Module & Controller (`PATCH` Upload & `GET` Delivery)
**Files:**
- Create: `src/modules/avatar/avatar.controller.ts`
- Create: `src/modules/avatar/avatar.service.ts`
- Create: `src/modules/avatar/avatar.module.ts`
- Modify: `src/app.module.ts` (import `AvatarModule`)

- [ ] **Step 1: Implement `AvatarService`**
  Orchestrate upload, atomic storage, database update (`users.image_url` and `staff_profiles.avatar_url`), and obsolete file cleanup.
- [ ] **Step 2: Implement `AvatarController`**
  Endpoints:
  - `PATCH /api/v1/users/me/avatar`: upload file with `HybridAuthGuard` and `FileInterceptor('file')`.
  - `GET /api/v1/users/:id/avatar`: public delivery route with caching headers (WebP stream, OAuth 307 redirect, or SVG initials stream).
- [ ] **Step 3: Wire into `AppModule`**
  Register `AvatarModule` in `src/app.module.ts`.
- [ ] **Step 4: Commit**
  `git commit -m "feat(avatar): add AvatarController, AvatarService, and wire into AppModule"`

---

### Task 7: Contract Enrichment & Auth Profile Synchronization
**Files:**
- Modify: `src/auth/auth.service.ts` (`formatUser` method)
- Modify: `src/auth/auth.controller.ts` (add alias `POST /api/v1/auth/me/avatar` and `PATCH /api/v1/auth/me/avatar`)
- Modify: `src/modules/staffs/infrastructure/drizzle/staff.drizzle-repository.ts`

- [ ] **Step 1: Enrich `formatUser` in `AuthService`**
  Add computed `avatar` object: `{ url, initials, type: 'custom' | 'oauth' | 'initials', hasCustomAvatar: boolean }` and set `imageUrl`. Synchronize `staff.photoUrl` with `users.image_url`.
- [ ] **Step 2: Add alias route in `AuthController`**
  Delegate `POST /api/v1/auth/me/avatar` and `PATCH /api/v1/auth/me/avatar` to avatar service for client backward compatibility.
- [ ] **Step 3: Commit**
  `git commit -m "feat(auth): enrich formatUser response with unified avatar contract and add auth avatar alias"`

---

### Task 8: End-to-End Test Suite & Verification
**Files:**
- Create: `scripts/e2e/test-avatar-lifecycle.ps1`

- [ ] **Step 1: Write E2E test script**
  Test cases:
  1. Manually registered doctor has `avatar.type === 'initials'`, initials `"AS"`, and `GET /api/v1/users/:id/avatar` returns SVG with status 200.
  2. Upload valid image (PNG/JPEG) via `PATCH /api/v1/users/me/avatar`: returns status 200, `avatar.type === 'custom'`, `avatar.hasCustomAvatar === true`.
  3. Subsequent `GET /api/v1/users/:id/avatar` returns `image/webp` binary with Cache-Control headers.
  4. Upload invalid/disguised file (`fake.jpg` with plain text) -> rejected with HTTP 422 `INVALID_IMAGE_FILE`.
  5. Profile retrieval via `GET /api/v1/auth/me` and `GET /api/v1/staffs/me` both reflect the new avatar.
- [ ] **Step 2: Execute E2E test script**
  Run `powershell -ExecutionPolicy Bypass -File scripts/e2e/test-avatar-lifecycle.ps1` and verify all tests pass.
- [ ] **Step 3: Run existing regression tests**
  Run `powershell -ExecutionPolicy Bypass -File scripts/e2e/test-better-auth-credentials.ps1` and `scripts/e2e/test-mobile-endpoints.ps1` to ensure zero regressions.
- [ ] **Step 4: Commit**
  `git commit -m "test(avatar): add comprehensive e2e test suite for avatar lifecycle"`

---

### Task 9: Singleton Changelog & Client Integration Guide
**Files:**
- Create: `docs/backend/AVATAR-LIFECYCLE-CHANGELOG.md`

- [ ] **Step 1: Author comprehensive immutable changelog**
  Document the complete contract for Flutter mobile and Next.js web: endpoints, payload shapes, response models, fallback behavior, error handling, and concrete Dart/TypeScript integration examples.
- [ ] **Step 2: Commit**
  `git commit -m "docs(backend): add AVATAR-LIFECYCLE-CHANGELOG for mobile and web integration"`
