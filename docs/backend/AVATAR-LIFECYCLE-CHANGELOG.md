# Changelog & Client Integration Contract: Profile-Image & Avatar Lifecycle Architecture

**Repository:** Amanah Healthcare Backend (`amanah-backend`)  
**Targets:**  
- Flutter Mobile Application Engineering Team (Staff & Doctor Mobile App)  
- Next.js Web Client Engineering Team (Admin & Clinic Web Portal)  
**Date:** 2026-09-22  
**Status:** Production-Ready & Verified Live in Docker Container  
**Contract Version:** `v1.2.0-avatar-lifecycle`

---

## 1. Executive Summary & Architectural Overview

The Amanah Healthcare backend has established a **unified, backend-first profile-image and avatar lifecycle architecture**. 

### 1.1. Core Architectural Principle: Single Source of Truth
Prior to this enhancement, avatar URLs were fragmented across tables or omitted in Google OAuth synchronization:
- Better Auth dual-engine sync trigger (`0003_auth_dual_engine_sync_triggers.sql`) omitted the `image` field when synchronizing OAuth users to core `public.users`.
- Client applications had to guess whether an avatar was an external OAuth URL, a custom uploaded file, or missing.
- When an avatar was absent, clients had to invent ad-hoc initials rendering that diverged between mobile and web.

### 1.2. Solved Capabilities
1. **Google OAuth & External Avatars:** Provider profile pictures are automatically synchronized into `users.image_url` on registration/login via PostgreSQL trigger `fn_sync_better_auth_user_to_core_users()`.
2. **Deterministic Initials Fallback (Clinical Grade):** If no custom or external avatar exists, the backend provides an on-the-fly, scalable vector graphic (SVG) avatar with user initials. Clinical prefixes (`dr.`, `drg.`, `Bdn.`, `Prof.`) and academic suffixes (`, Sp.A`, `, M.Kes`, `, S.Tr.Keb`) are stripped automatically, ensuring e.g. **dr. Ahmad Santoso, Sp.A** renders **AS** (not "DA").
3. **Atomic File Upload & Security Hardening:**
   - **Magic-Byte Sniffing:** Verifies actual file binary signatures (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, WebP: `RIFF...WEBP`), instantly blocking malicious files disguised with fake extensions.
   - **Image Normalization Pipeline:** Automatically reads EXIF orientation, strips all metadata/location privacy tags, crops and resizes to 512×512 cover format, and encodes into lightweight, high-performance WebP (`image/webp`).
   - **Atomic Write Pattern:** Writes to a temporary file before renaming (`.tmp-uuid` → `avatar.webp`) to prevent read tearing or corrupted avatars on failure.
4. **Zero Client Guesswork Contract:** Both Flutter and Next.js receive a unified `avatar` object in all auth responses (`/auth/email/login`, `/auth/me`, `/users/me`):
   ```json
   "avatar": {
     "url": "/api/v1/users/:id/avatar",
     "initials": "AS",
     "type": "custom",
     "hasCustomAvatar": true,
     "directUrl": "/api/v1/users/:id/avatar?v=1790076343134"
   }
   ```
   Every client can render `avatar.url` directly via standard image widgets (`Image.network`, `CachedNetworkImage`, `<Image />`, or `<img />`). The endpoint automatically resolves the correct asset (WebP stream, 307 OAuth redirect, or SVG initials fallback) with `ETag` and `Cache-Control` caching.

---

## 2. Avatar State Lifecycle Matrix

The profile image lifecycle transitions predictably across these states:

| Lifecycle Phase | Stored `users.image_url` | Response `avatar.type` | Response `avatar.hasCustomAvatar` | HTTP `GET /api/v1/users/:id/avatar` Delivery |
| :--- | :--- | :--- | :--- | :--- |
| **Manual User (No Upload)** | `null` | `"initials"` | `false` | HTTP 200 `image/svg+xml` (Initials SVG) |
| **Google OAuth First Sign-In** | `https://lh3.googleusercontent.com/...` | `"oauth"` | `false` | HTTP 307 Redirect to Google CDN |
| **User Uploads Custom Image** | `/api/v1/users/:id/avatar?v=...` | `"custom"` | `true` | HTTP 200 `image/webp` (WebP 512×512) |
| **User Deletes Custom Image** | `null` | `"initials"` | `false` | HTTP 200 `image/svg+xml` (Reverts to Initials) |

---

## 3. API Specifications & Endpoints

All endpoints use URI versioning prefix `/api/v1`.

### 3.1. Public Avatar Delivery (Stream / Redirect / SVG)
Retrieve a user's visual profile image representation without requiring authentication tokens (publicly cacheable).

* **Method:** `GET`
* **Route:** `/api/v1/users/:id/avatar`
* **Route (Auth Alias for current user):** `/api/v1/users/me/avatar` *(requires Bearer token)*
* **Parameters:** `id` (UUIDv4)
* **Headers:**
  - `If-None-Match`: Optional ETag string from previous request for conditional caching.
* **Responses:**
  - **HTTP 200 OK (WebP):** `Content-Type: image/webp`, `Cache-Control: public, max-age=86400, stale-while-revalidate=3600`, `ETag: W/"..."`.
  - **HTTP 200 OK (SVG Fallback):** `Content-Type: image/svg+xml; charset=utf-8`, `Cache-Control: public, max-age=86400, stale-while-revalidate=3600`, `ETag: W/"..."`.
  - **HTTP 304 Not Modified:** Returned when client's `If-None-Match` matches current ETag (zero bandwidth payload).
  - **HTTP 307 Temporary Redirect:** Returned when user has an external OAuth avatar (e.g. Google CDN).
  - **HTTP 404 Not Found:** User ID does not exist in database.

---

### 3.2. Upload or Replace Custom Avatar
Uploads a new avatar file from the local device filesystem. Atomically replaces any previous avatar.

* **Method:** `PATCH` or `POST`
* **Route:** `/api/v1/users/me/avatar`
* **Route (Auth Onboarding Alias):** `/api/v1/auth/me/avatar`
* **Authentication:** `HybridAuthGuard` (`Authorization: Bearer <token>` or Better Auth Session)
* **Content-Type:** `multipart/form-data`
* **Form Field:** `file` (Binary image buffer)
* **Constraints:**
  - Max Size: **5 MB**
  - Allowed Formats: **JPEG**, **PNG**, **WebP** (validated by magic-bytes sniffing, not just file extension)
* **Response:** `HTTP 200 OK`
  ```json
  {
    "avatarUrl": "/api/v1/users/c686b158-e0c8-420a-9885-f7c087321157/avatar?v=1790076343134",
    "avatar": {
      "url": "/api/v1/users/c686b158-e0c8-420a-9885-f7c087321157/avatar?v=1790076343134",
      "initials": "AS",
      "type": "custom",
      "hasCustomAvatar": true,
      "directUrl": "/api/v1/users/c686b158-e0c8-420a-9885-f7c087321157/avatar?v=1790076343134"
    }
  }
  ```
* **Error States:**
  - `HTTP 400 Bad Request`: Form field `file` is missing or empty.
  - `HTTP 422 Unprocessable Entity`: File is corrupted, not a valid image format, or exceeds 5 MB.
  - `HTTP 401 Unauthorized`: Missing or expired authentication token.

---

### 3.3. Delete Custom Avatar (Revert to Fallback)
Removes the custom avatar file from disk and clears `users.image_url`, automatically reverting the profile representation to the initials SVG.

* **Method:** `DELETE`
* **Route:** `/api/v1/users/me/avatar`
* **Authentication:** `HybridAuthGuard` (`Authorization: Bearer <token>`)
* **Response:** `HTTP 200 OK`
  ```json
  {
    "statusCode": 200,
    "message": "Avatar berhasil dihapus dan dikembalikan ke inisial nama"
  }
  ```

---

### 3.4. Unified Auth Profile Contract (`/api/v1/auth/me` & `/api/v1/auth/email/login`)
Every authentication endpoint returns the enriched user payload:

```json
{
  "id": "c686b158-e0c8-420a-9885-f7c087321157",
  "name": "dr. Ahmad Santoso, Sp.A",
  "email": "dokter@amanah.com",
  "imageUrl": "/api/v1/users/c686b158-e0c8-420a-9885-f7c087321157/avatar",
  "avatar": {
    "url": "/api/v1/users/c686b158-e0c8-420a-9885-f7c087321157/avatar",
    "initials": "AS",
    "type": "custom",
    "hasCustomAvatar": true,
    "directUrl": "/api/v1/users/c686b158-e0c8-420a-9885-f7c087321157/avatar?v=1790076343134"
  },
  "systemRole": "STAF",
  "role": {
    "id": "e305e553-61a7-4b7d-b657-3aa58fae4c0d",
    "code": "staff_doctor",
    "name": "STAF"
  },
  "staff": {
    "id": "4e7ba9f8-b3d1-419b-bc08-3bb8c7929a67",
    "userId": "c686b158-e0c8-420a-9885-f7c087321157",
    "fullName": "dr. Ahmad Santoso, Sp.A",
    "profession": "Dokter Spesialis Anak",
    "photoUrl": "/api/v1/users/c686b158-e0c8-420a-9885-f7c087321157/avatar",
    "isActive": true
  },
  "needsOnboarding": false
}
```

---

## 4. Flutter Mobile Client Integration Guide

### 4.1. Base URL & Network Environment
Ensure your Dio/HttpClient resolves the correct backend host:
- **Android Emulator:** `http://10.0.2.2:3001`
- **iOS Simulator:** `http://localhost:3001`
- **Physical Device (WiFi):** `http://<YOUR_PC_LAN_IP>:3001`

### 4.2. Recommended Dart Model
```dart
class UserAvatar {
  final String url;
  final String initials;
  final String type; // 'custom' | 'oauth' | 'initials'
  final bool hasCustomAvatar;
  final String? directUrl;

  UserAvatar({
    required this.url,
    required this.initials,
    required this.type,
    required this.hasCustomAvatar,
    this.directUrl,
  });

  factory UserAvatar.fromJson(Map<String, dynamic> json) {
    return UserAvatar(
      url: json['url'] as String,
      initials: json['initials'] as String,
      type: json['type'] as String? ?? 'initials',
      hasCustomAvatar: json['hasCustomAvatar'] as bool? ?? false,
      directUrl: json['directUrl'] as String?,
    );
  }
}
```

### 4.3. Universal Avatar Widget Example
Use `CachedNetworkImage` or `flutter_svg` for optimal caching and rendering:

```dart
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_svg/flutter_svg.dart';

class AmanahAvatar extends StatelessWidget {
  final UserAvatar avatar;
  final String baseUrl;
  final double radius;

  const AmanahAvatar({
    Key? key,
    required this.avatar,
    required this.baseUrl,
    this.radius = 24.0,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final fullUrl = avatar.url.startsWith('http') 
        ? avatar.url 
        : '$baseUrl${avatar.url}';

    // If type is initials, render vector SVG or local CircleAvatar
    if (avatar.type == 'initials') {
      return CircleAvatar(
        radius: radius,
        backgroundColor: const Color(0xFF0284C7),
        child: Text(
          avatar.initials,
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: radius * 0.8,
          ),
        ),
      );
    }

    // Otherwise render cached network image
    return CachedNetworkImage(
      imageUrl: fullUrl,
      imageBuilder: (context, imageProvider) => CircleAvatar(
        radius: radius,
        backgroundImage: imageProvider,
      ),
      placeholder: (context, url) => CircleAvatar(
        radius: radius,
        backgroundColor: Colors.grey[200],
        child: const CircularProgressIndicator(strokeWidth: 2),
      ),
      errorWidget: (context, url, error) => CircleAvatar(
        radius: radius,
        backgroundColor: const Color(0xFF0284C7),
        child: Text(
          avatar.initials,
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
            fontSize: radius * 0.8,
          ),
        ),
      ),
    );
  }
}
```

### 4.4. Uploading New Avatar via Dio in Flutter
```dart
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

Future<UserAvatar?> uploadUserAvatar({
  required Dio dio,
  required String authToken,
  required XFile imageFile,
}) async {
  final formData = FormData.fromMap({
    'file': await MultipartFile.fromFile(
      imageFile.path,
      filename: imageFile.name,
    ),
  });

  final response = await dio.patch(
    '/api/v1/users/me/avatar',
    data: formData,
    options: Options(
      headers: {
        'Authorization': 'Bearer $authToken',
        'Content-Type': 'multipart/form-data',
      },
    ),
  );

  if (response.statusCode == 200) {
    return UserAvatar.fromJson(response.data['avatar']);
  }
  return null;
}
```

---

## 5. Next.js Web Client Integration Guide

### 5.1. TypeScript Types
```typescript
export interface UserAvatar {
  url: string;
  initials: string;
  type: 'custom' | 'oauth' | 'initials';
  hasCustomAvatar: boolean;
  directUrl?: string | null;
}
```

### 5.2. React / Next.js Avatar Component Example
```tsx
import React from 'react';
import Image from 'next/image';

interface AvatarProps {
  avatar: UserAvatar;
  name: string;
  size?: number;
}

export const ClinicAvatar: React.FC<AvatarProps> = ({
  avatar,
  name,
  size = 48,
}) => {
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const fullAvatarUrl = avatar.url.startsWith('http')
    ? avatar.url
    : `${backendBaseUrl}${avatar.url}`;

  if (avatar.type === 'initials') {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-sky-600 text-white font-semibold select-none shadow-sm"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
        title={name}
      >
        {avatar.initials}
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-full border border-slate-200 shadow-sm"
      style={{ width: size, height: size }}
    >
      <Image
        src={fullAvatarUrl}
        alt={name}
        fill
        sizes={`${size}px`}
        className="object-cover"
        unoptimized // Allows handling dynamic redirects and SVG fallbacks
      />
    </div>
  );
};
```

### 5.3. Upload Function in Next.js
```typescript
export async function uploadAvatar(file: File, token: string): Promise<UserAvatar> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/users/me/avatar`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Gagal mengunggah foto profil');
  }

  const data = await res.json();
  return data.avatar;
}
```

---

## 6. Verification & Automated Test Evidence

The profile-image infrastructure was verified end-to-end against the live backend stack (PostgreSQL 17 + Redis 7 + Node/Bun + Docker).

### 6.1. Unit Test Suite Results
```text
bun test src/modules/avatar src/common/utils
✓ NameInitialsHelper > extracts first two initials for standard 3-word name ("FA")
✓ NameInitialsHelper > strips medical and academic prefixes (dr., Bdn., drg., Prof.) -> "AS"
✓ NameInitialsHelper > strips clinical specialty suffixes (, Sp.A, , Sp.OG, M.Kes) -> "AS"
✓ AvatarProcessingService > rejects non-image buffers with UnprocessableEntityException
✓ AvatarProcessingService > processes valid images into 512x512 WebP with stripped metadata
✓ AvatarSvgService > generates valid vector SVG with extracted initials
✓ AvatarSvgService > escapes special XML characters
✓ LocalAvatarStorageAdapter > saves avatar atomically and reports existence
✓ LocalAvatarStorageAdapter > prevents directory traversal attempts
13 pass, 0 fail (100% passing)
```

### 6.2. Live End-to-End Test Suite Results
Script: `scripts/e2e/test-avatar-lifecycle.ps1`
```text
=================================================================
 Amanah Healthcare: Avatar Lifecycle & Contract E2E Suite
 Base URL: http://localhost:3001
=================================================================

1. Authenticating as Doctor (dr. Ahmad Santoso)...
 [PASS] Authentication succeeded
 [PASS] User has canonical avatar object
 [PASS] Initials correctly strips 'dr.' prefix to 'AS'
 [PASS] Canonical avatar URL is populated
 [PASS] User imageUrl points to canonical avatar endpoint
 [PASS] Staff photoUrl is synchronized

2. Verifying Public Initials SVG Fallback Delivery...
 [PASS] SVG endpoint returns HTTP 200
 [PASS] Content-Type is image/svg+xml
 [PASS] SVG body contains user initials 'AS'
 [PASS] Cache-Control header is present
 [PASS] ETag header is present on SVG response
 [PASS] ETag conditional request returns HTTP 304 Not Modified

3. Testing Security Defense: Magic-Byte Sniffing against Fake Image...
 [PASS] Fake image rejected with HTTP 422 (Unprocessable Entity)

4. Uploading Valid Avatar (PNG) via PATCH /api/v1/users/me/avatar...
 [PASS] Avatar upload returns HTTP 200
 [PASS] Upload response returns avatar.type 'custom'
 [PASS] Upload response returns avatar.hasCustomAvatar = true
 [PASS] Upload response contains avatarUrl with cache-busting version

5. Verifying Delivery of Uploaded Custom Avatar (WebP)...
 [PASS] Custom avatar delivery returns HTTP 200
 [PASS] Content-Type is image/webp
 [PASS] Custom avatar delivery includes ETag
 [PASS] Custom avatar conditional request returns HTTP 304 Not Modified

6. Verifying Profile Retrieval Synchronicity (/api/v1/auth/me)...
 [PASS] GET /auth/me returns avatar.type 'custom'
 [PASS] GET /auth/me returns avatar.hasCustomAvatar = true
 [PASS] GET /auth/me imageUrl matches canonical avatar URL
 [PASS] GET /auth/me staff.photoUrl matches canonical avatar URL

7. Testing Auth Alias Route (POST /api/v1/auth/me/avatar)...
 [PASS] Auth alias POST /auth/me/avatar returns HTTP 200
 [PASS] Auth alias upload returns avatar.type 'custom'

8. Testing Avatar Deletion & Reversion to Initials (DELETE /api/v1/users/me/avatar)...
 [PASS] DELETE /users/me/avatar returns success status
 [PASS] Reverted delivery returns HTTP 200
 [PASS] Reverted delivery Content-Type is image/svg+xml
 [PASS] Reverted delivery body contains initials 'AS'
 [PASS] Reverted /auth/me returns avatar.type 'initials'
 [PASS] Reverted /auth/me returns avatar.hasCustomAvatar = false

=================================================================
 Avatar Lifecycle Verification Results: 33 Passed, 0 Failed
=================================================================
```

### 6.3. Regression Test Verification
- `scripts/e2e/test-better-auth-credentials.ps1`: **20 Passed, 0 Failed**
- `scripts/e2e/test-mobile-endpoints.ps1`: **25 Passed, 0 Failed**
- Total passing automated assertions: **78 out of 78 (100%)**
