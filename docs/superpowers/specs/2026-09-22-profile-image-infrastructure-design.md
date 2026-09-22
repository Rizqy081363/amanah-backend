# Design Spec: Profile-Image Backend Infrastructure

**Repository:** Amanah Healthcare Backend (`amanah-backend`)  
**Date:** 2026-09-22  
**Status:** Approved  
**Author:** Antigravity Engineering

---

## 1. Overview & Problem Statement

In the Amanah Healthcare clinical operations platform, users (doctors, midwives, administrative staff, and patients) authenticate through Flutter mobile and, in the future, Next.js web applications using either Google OAuth or manual credential authentication.

Currently:
1. Google OAuth avatar URLs are captured in Better Auth's `"user"."image"` table, but database trigger `fn_sync_better_auth_user_to_core_users()` fails to synchronize them to `users.image_url`.
2. Manually registered users start with no avatar, but there is no initials-based fallback mechanism, resulting in `null` images and inconsistent UI representation.
3. No secure, bounded, and atomic image upload and replacement endpoint exists.
4. Profile images are fragmented between `users.image_url`, `staff_profiles.avatar_url`, and `"user"."image"`.

This design establishes a **single source of truth** in `public.users.image_url`, fixes the OAuth synchronization trigger, implements an atomic upload pipeline (WebP 512×512, EXIF-stripped), creates an on-the-fly initials SVG generator, and provides a canonical public avatar route `GET /api/v1/users/:id/avatar`.

---

## 2. Core Architectural Principles

1. **Single Source of Truth:**
   - `users.image_url` is the authoritative persistent reference for all profile avatars.
   - For backward compatibility and relational integrity, `staff_profiles.avatar_url` is synchronized with `users.image_url`.
2. **Deterministic Lifecycle:**
   - **OAuth Initial:** Google OAuth provides an avatar URL, synced to `users.image_url` on registration.
   - **Manual Initial:** Manually registered users start with `users.image_url = null`.
   - **Fallback Resolution:** Whenever `image_url` is null, the system automatically resolves an initials avatar based on the user's name (ignoring medical prefixes such as "dr.", "Bdn.", "Prof." and suffixes such as "Sp.A").
   - **Custom Upload & Replacement:** Uploading a custom avatar via `PATCH /api/v1/users/me/avatar` replaces any previous representation (whether OAuth or initials fallback). Obsolete files are cleaned up from storage.
3. **Defense in Depth:**
   - Transport size limit: 5MB.
   - Magic-byte sniffing via `file-type` to reject forged extensions.
   - Decode & transform via `sharp`: normalize orientation, resize to 512×512 with `fit: 'cover'`, strip metadata, encode to canonical WebP.
   - Path-traversal defense: Storage key resolved and checked against `STORAGE_ROOT`.
   - Atomic replacement: write to `.tmp-{uuid}` before replacing the target file.

---

## 3. Detailed Component Design

### 3.1. Database Migration: Sync Trigger Enhancement
Enhance trigger function `fn_sync_better_auth_user_to_core_users()`:
```sql
INSERT INTO users (
  id, name, email, email_verified, image_url, status, preferred_locale, created_at, updated_at
)
VALUES (
  NEW.id, NEW.name, NEW.email, NEW."emailVerified", NEW.image,
  CASE WHEN NEW.banned THEN 'inactive'::user_status WHEN NEW."emailVerified" THEN 'active'::user_status ELSE 'pending_verification'::user_status END,
  'id-ID', NEW."createdAt", NEW."updatedAt"
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    email = EXCLUDED.email,
    email_verified = EXCLUDED.email_verified,
    image_url = COALESCE(users.image_url, EXCLUDED.image_url),
    status = EXCLUDED.status,
    updated_at = EXCLUDED.updated_at;
```
*(Using `COALESCE(users.image_url, EXCLUDED.image_url)` ensures that if a user has already uploaded a custom avatar, subsequent OAuth logins do not overwrite their custom avatar with Google's image).*

### 3.2. Clinical Initials & SVG Fallback (`AvatarSvgService`)
- Utility: `NameInitialsHelper.extract(name: string): string`
  - Strips clinical prefixes: `dr.`, `drg.`, `Bdn.`, `Prof.`, `Ns.`, `apt.`, `dr`, `bdn`
  - Strips clinical suffixes: `, Sp.A`, `, Sp.OG`, `, Sp.PD`, `, M.Kes`, etc.
  - Takes the first letter of the first word and the first letter of the last word (or two letters if single word).
  - Upper-cased (e.g. `"dr. Ahmad Santoso"` → `"AS"`, `"Fadilah Ahmad Zikri"` → `"FA"`).
- Generator: `AvatarSvgService.generate(name: string, initials: string): string`
  - Deterministic background color chosen from Amanah palette (`#0284c7`, `#0f766e`, `#0369a1`, `#4338ca`, `#0d9488`).
  - Crisp, modern circular SVG with accessible `aria-label`, 512×512 viewBox, and white bold text.

### 3.3. Hexagonal Storage Abstraction
- Port:
  ```typescript
  export interface AvatarStoragePort {
    saveAvatar(userId: string, buffer: Buffer): Promise<{ storageKey: string }>;
    getAvatarStream(storageKey: string): Promise<{ stream: Readable; mimeType: string; size: number } | null>;
    deleteAvatar(storageKey: string): Promise<void>;
  }
  ```
- Local Adapter: writes to `./data/uploads/avatars/{userId}/avatar.webp`. Path traversal checked defensive assert.

### 3.4. API Endpoints
1. `PATCH /api/v1/users/me/avatar` (with alias `POST /api/v1/auth/me/avatar`):
   - Auth: `HybridAuthGuard` (JWT Bearer or Better Auth session).
   - Multipart payload: `file` (image/jpeg, image/png, image/webp).
   - Pipeline: Magic-byte sniff -> sharp decode/transform -> atomic storage write -> DB update -> delete old -> return formatted user profile.
2. `GET /api/v1/users/:id/avatar`:
   - Public endpoint with `Cache-Control: public, max-age=86400, stale-while-revalidate=3600` and `ETag`.
   - If user has custom uploaded avatar: streams WebP.
   - If user has OAuth avatar URL: redirects 307 to external URL.
   - If user has no avatar: streams generated SVG with `Content-Type: image/svg+xml`.

### 3.5. Response Contract Enhancement (`formatUser`)
In `AuthService.formatUser()` and `User` DTO:
```json
{
  "id": "c686b158-...",
  "name": "dr. Ahmad Santoso",
  "email": "dokter@amanah.com",
  "imageUrl": "http://localhost:3001/api/v1/users/c686b158-.../avatar",
  "avatar": {
    "url": "http://localhost:3001/api/v1/users/c686b158-.../avatar",
    "initials": "AS",
    "type": "custom",
    "hasCustomAvatar": true
  },
  "staff": {
    "photoUrl": "http://localhost:3001/api/v1/users/c686b158-.../avatar"
  }
}
```
Client benefits:
- Flutter/Web can simply bind `Image.network(user.avatar.url)` and it **always** works.
- If Flutter wants to render a native Flutter canvas/vector widget instead of loading an image network, it can read `user.avatar.initials` directly.

---

## 4. Error Taxonomy

| Error Code | HTTP Status | Meaning |
| :--- | :---: | :--- |
| `NO_FILE_UPLOADED` | 422 | No file was provided in `file` multipart field |
| `INVALID_IMAGE_FILE` | 422 | File is not a valid JPEG/PNG/WebP image or magic bytes do not match |
| `IMAGE_TOO_LARGE` | 422 | File exceeds 5MB size limit |
| `IMAGE_PROCESSING_FAILED` | 422 | Image decoding or re-encoding failed |
| `USER_NOT_FOUND` | 404 | User ID for avatar retrieval does not exist |

---

## 5. Verification Strategy
1. **Unit tests:**
   - `NameInitialsHelper`: tests with multi-word names, single-word names, Indonesian doctor/midwife titles.
   - `AvatarSvgService`: tests SVG generation, palette hashing, XML safety.
2. **E2E tests (`scripts/e2e/test-avatar-lifecycle.ps1`):**
   - Manual user gets valid initials SVG avatar at `GET /api/v1/users/:id/avatar`.
   - Upload valid PNG/JPEG -> converts to WebP, updates `users.image_url`, returns 200 with new `avatarUrl`.
   - Subsequent `GET /api/v1/users/:id/avatar` serves WebP binary.
   - Upload fake file (text file disguised as `.jpg`) -> rejected with 422.
   - Profile response `/api/v1/auth/me` includes synchronized `avatar` object and `staff.photoUrl`.
