# Systemic Account Deletion (Purge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a production-grade, systemic self-account deletion feature (`DELETE /api/v1/auth/me`) that purges all user data across all 59 PostgreSQL tables and invalidates all user-associated cache/keys in Redis, allowing the user to re-register cleanly as a brand new account.

**Architecture:** The endpoint `DELETE /api/v1/auth/me` is secured by `HybridAuthGuard` (supporting both canonical Passport JWT and Better Auth Google OAuth sessions). When invoked, `AuthService.purgeAccount` executes the verified database stored procedure `purge_user_systemic` in PostgreSQL to delete all records in reverse-dependency order (handling RESTRICT, CASCADE, and SET NULL constraints), followed by `RedisService.purgeUserData` to scan and wipe all cached sessions, OTP cooldowns, and rate limits. The endpoint returns a structured HTTP 200 confirmation payload.

**Tech Stack:** NestJS 11, PostgreSQL 17 (Drizzle ORM & PL/pgSQL), Redis 7 (ioredis), Better Auth, Jest.

**Spec:** User request: "buatkan fitur hapus akun, jadi semua data user itu akan terhapus di redis dan db bersih seperti membuat akun baru, nanti kalau sudah anda buat changelog nya, dan siap di kirim ke frontend, biar mereka pasang, matangkan ya, respect rules non negotiable".

---

## Global Constraints

- Never break or bypass PostgreSQL foreign key constraints; purge in reverse-dependency order.
- Dual-engine auth compatibility: support both Passport JWT (credential login) and Better Auth session token (Google OAuth).
- Redis wipe must remove all user-associated keys (sessions, tokens, rate limits, OTP cooldowns) via SCAN pattern matching without blocking the Redis event loop.
- Comprehensive RFC 7807 error handling and clear HTTP 200 success response with confirmation details.
- Comprehensive documentation and frontend delegation changelog provided in `docs/backend-modules/authentication/ACCOUNT-DELETION-CHANGELOG.md` and `docs/agent-changelog.md`.

---

### Task 1: Database Migration for `purge_user_systemic`

**Files:**
- Create: `src/database/migrations/0004_purge_user_systemic_function.sql`
- Modify: `src/database/migrations/meta/_journal.json`

**Interfaces:**
- Produces: PostgreSQL stored procedure `purge_user_systemic(p_target_input TEXT) RETURNS JSONB`

- [ ] **Step 1: Create migration file `0004_purge_user_systemic_function.sql`**
- [ ] **Step 2: Update `_journal.json` to register migration `0004_purge_user_systemic_function`**
- [ ] **Step 3: Execute migration in PostgreSQL container and verify function definition**

---

### Task 2: Redis Service Extension for User Data Purge

**Files:**
- Modify: `src/common/redis/redis.service.ts`
- Test: `src/common/redis/redis.service.spec.ts`

**Interfaces:**
- Produces: `RedisService.purgeUserData(userId: string, email?: string): Promise<number>`

- [ ] **Step 1: Write unit test in `src/common/redis/redis.service.spec.ts` for `purgeUserData`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `purgeUserData` in `src/common/redis/redis.service.ts` using non-blocking SCAN pattern matching**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**

---

### Task 3: AuthService & AuthController Implementation

**Files:**
- Modify: `src/auth/auth.service.ts`
- Modify: `src/auth/auth.controller.ts`
- Create: `src/auth/dto/delete-account-response.dto.ts`
- Test: `src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `RedisService.purgeUserData`, `purge_user_systemic` in PostgreSQL
- Produces: `DELETE /api/v1/auth/me` returning `DeleteAccountResponseDto`

- [ ] **Step 1: Create DTO `DeleteAccountResponseDto`**
- [ ] **Step 2: Implement `purgeAccount` in `AuthService`**
- [ ] **Step 3: Update `delete` method in `AuthController` to call `purgeAccount` with HTTP 200 OK and response DTO**
- [ ] **Step 4: Create unit test `src/auth/auth.service.spec.ts` covering `purgeAccount`**
- [ ] **Step 5: Run unit tests to verify all tests pass**
- [ ] **Step 6: Commit changes**

---

### Task 4: Live End-to-End Verification

**Files:**
- Test against running Docker services (PostgreSQL, Redis, API)

- [ ] **Step 1: Seed / register a test patient user via API**
- [ ] **Step 2: Verify user exists in PostgreSQL (`users`, `user`, `patient_profiles`, etc.) and Redis**
- [ ] **Step 3: Call `DELETE /api/v1/auth/me` with Bearer token**
- [ ] **Step 4: Verify HTTP 200 OK response with success details**
- [ ] **Step 5: Query PostgreSQL to confirm zero rows remain for this user**
- [ ] **Step 6: Query Redis to confirm zero keys remain for this user**
- [ ] **Step 7: Verify that re-registering with the exact same email succeeds without conflict**

---

### Task 5: Documentation & Frontend Delegation Changelog

**Files:**
- Create: `docs/backend-modules/authentication/ACCOUNT-DELETION-CHANGELOG.md`
- Modify: `docs/agent-changelog.md`

- [ ] **Step 1: Author complete frontend integration guide detailing the `DELETE /api/v1/auth/me` contract, authentication headers, response schemas, error handling, and frontend cleanup advice (clearing local storage, cookie, redirecting to login/landing)**
- [ ] **Step 2: Update `docs/agent-changelog.md` with release notes**
- [ ] **Step 3: Commit documentation with Conventional Commits**
