# Google OAuth & Better Auth Integration Guide

This guide covers everything required to configure Google OAuth 2.0 with Better Auth for **Amanah Healthcare**, including Google Cloud Console setup, backend environment configuration, and complete Next.js frontend implementation (popup and redirect flows).

---

## 1. Architecture Overview

In the Amanah Healthcare architecture:
- **Backend (NestJS)** is the authoritative authentication server running Better Auth at `/api/auth/*` on port `3001`.
- **Frontend (Next.js)** is the client running on port `3000`.
- **Database (PostgreSQL 17)** persists users, sessions, accounts, and verifications using Drizzle ORM schema.
- **Cache / Rate Limiting (Redis 7)** handles distributed rate limiting and token session tracking.

```
┌────────────────────────────────────────┐
│             Next.js Web UI             │
│          http://localhost:3000         │
│                                        │
│  - authClient.signIn.social({ popup }) │
│  - useSession() hook                   │
│  - RBAC checks (role / permissions)    │
└───────────────────┬────────────────────┘
                    │ Cross-Origin HTTP
                    ▼
┌────────────────────────────────────────┐
│           NestJS API Server            │
│          http://localhost:3001         │
│                                        │
│  - BetterAuthController (/api/auth/*)  │
│  - Google OAuth Callback Handler       │
│  - BetterAuthGuard & BetterAuthRbacGuard│
└───────────────┬────────────┬───────────┘
                │            │
                ▼            ▼
     PostgreSQL (5432)   Redis (6379)
```

---

## 2. Google Cloud Console Setup

Follow these steps to generate legitimate Google OAuth 2.0 credentials:

### Step 2.1: Create or Select a GCP Project
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown in the top bar and select **New Project**.
3. Name your project (e.g., `amanah-healthcare`) and click **Create**.

### Step 2.2: Configure OAuth Consent Screen
1. In the left navigation menu, go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** user type (or **Internal** if using Google Workspace for clinic staff) and click **Create**.
3. Fill in the **App Information**:
   - **App name**: `Amanah Healthcare`
   - **User support email**: Select your developer/admin email.
   - **Developer contact information**: Enter your contact email.
4. Click **Save and Continue**.
5. In the **Scopes** step, click **Add or Remove Scopes** and select:
   - `.../auth/userinfo.email` (`https://www.googleapis.com/auth/userinfo.email`)
   - `.../auth/userinfo.profile` (`https://www.googleapis.com/auth/userinfo.profile`)
   - `openid`
6. Click **Save and Continue**.
7. In **Test users** (if in Testing mode), add any Google accounts you plan to use for testing.
8. Click **Save and Continue** to summary.

### Step 2.3: Create OAuth 2.0 Client Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **+ Create Credentials** at the top and select **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Set **Name** to `Amanah Healthcare Web Client`.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:3000` (Next.js development frontend)
   - `http://localhost:3001` (NestJS development backend)
   - `https://your-production-domain.com` (Production frontend)
   - `https://api.your-production-domain.com` (Production backend)
6. Under **Authorized redirect URIs**, add the Better Auth callback endpoint:
   - `http://localhost:3001/api/auth/callback/google` (Local development)
   - `https://api.your-production-domain.com/api/auth/callback/google` (Production)
7. Click **Create**.
8. A modal will display your **Client ID** and **Client Secret**. Copy both values.

---

## 3. Backend Environment Configuration

Add the Google OAuth credentials and Better Auth settings to your environment file (`.env` or `env-example-relational`):

```bash
# Better Auth Configuration
BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_SECRET=your-secure-random-32-character-secret-key-here

# Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-actual-client-secret

# Frontend & Backend Domains for CORS and Trusted Origins
FRONTEND_DOMAIN=http://localhost:3000
BACKEND_DOMAIN=http://localhost:3001
```

> [!IMPORTANT]
> Never commit actual Google Client Secrets to Git. Ensure `.env` is listed in `.gitignore`.

---

## 4. Frontend Integration (Next.js)

### Step 4.1: Install Better Auth Client in Next.js
In your Next.js project directory:

```bash
npm install better-auth
# or
bun add better-auth
```

### Step 4.2: Create Better Auth Client Instance (`lib/auth-client.ts`)

```typescript
// lib/auth-client.ts
import { createAuthClient } from 'better-auth/react';
import { adminClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  basePath: '/api/auth',
  plugins: [
    adminClient(),
  ],
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = authClient;
```

### Step 4.3: Implement Modern Popup Flow with Fallback (`components/GoogleSignInButton.tsx`)

Better Auth supports a modern popup flow that preserves application state and avoids redirect flashing:

```tsx
// components/GoogleSignInButton.tsx
'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  mode?: 'popup' | 'redirect';
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  mode = 'popup',
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      if (mode === 'popup') {
        // Modern popup flow: Opens popup window, receives session via postMessage
        const result = await authClient.signIn.social({
          provider: 'google',
          callbackURL: `${window.location.origin}/auth/callback`,
          newUserCallbackURL: `${window.location.origin}/auth/onboarding`,
          // popup: true enables the modern popup experience
          popup: true,
        });

        if (result?.error) {
          throw new Error(result.error.message || 'Google sign-in failed');
        }

        onSuccess?.();
      } else {
        // Standard redirect flow
        await authClient.signIn.social({
          provider: 'google',
          callbackURL: `${window.location.origin}/dashboard`,
        });
      }
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleGoogleSignIn}
      disabled={loading}
      className="flex items-center justify-center gap-3 px-4 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        />
      </svg>
      {loading ? 'Menghubungkan ke Google...' : 'Lanjutkan dengan Google'}
    </button>
  );
}
```

### Step 4.4: Popup Callback Handler (`app/auth/callback/page.tsx`)

If your application uses Next.js App Router, create this lightweight page to finalize the popup session and notify the opener window:

```tsx
// app/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';

export default function AuthCallbackPage() {
  useEffect(() => {
    // If opened in a popup, Better Auth communicates back to window.opener
    if (window.opener) {
      window.close();
    } else {
      window.location.href = '/dashboard';
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Memproses autentikasi...</h2>
        <p className="text-sm text-gray-500">Jendela ini akan tertutup secara otomatis.</p>
      </div>
    </div>
  );
}
```

---

## 5. Role-Based Access Control (RBAC)

### Defined Roles and Resources

Amanah Healthcare enforces 5 primary roles:

| Role | Description | Resource Access |
|---|---|---|
| `admin` | Full clinic administration | All clinic, patient, staff, appointment, schedule, medicalRecord, attendance, leave |
| `staffDoctor` | Dokter Umum / Spesialis | `read` clinic/patient/staff, `create/update` schedule, `call/complete` appointments, `create/update` medicalRecord |
| `staffMidwife` | Bidan (Poli KIA) | `read` clinic/patient/staff, `create/update` schedule, `call/complete` appointments, `create/update` medicalRecord |
| `staffWorker` | Staf Administrasi / Resepsionis | `read` clinic/staff, `record/read` attendance, `create/read` leave |
| `patient` | Pasien Klinik Amanah | `read` clinic, `read/update` own patient profile, `create/read` appointments, `read` medicalRecord |

### Frontend Session & RBAC Hook Usage

```tsx
// components/AppointmentManager.tsx
'use client';

import { authClient, useSession } from '@/lib/auth-client';

export function AppointmentManager() {
  const { data: session, isPending } = useSession();

  if (isPending) return <div>Memuat data akun...</div>;
  if (!session) return <div>Silakan login terlebih dahulu.</div>;

  const userRole = session.user.role; // 'admin' | 'staffDoctor' | 'staffMidwife' | 'staffWorker' | 'patient'

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Selamat Datang, {session.user.name}</h1>
      <p className="text-sm text-gray-600">Peran: <span className="font-mono">{userRole}</span></p>

      {/* Conditional rendering by role */}
      {['admin', 'staffDoctor', 'staffMidwife'].includes(userRole) && (
        <button className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded">
          Panggil Antrean Pasien
        </button>
      )}

      {userRole === 'patient' && (
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
          Buat Janji Temu Dokter
        </button>
      )}
    </div>
  );
}
```

---

## 6. Backend RBAC Guard Usage in NestJS

Backend endpoints can protect routes using the new Better Auth decorators and guards:

```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  BetterAuthGuard,
  BetterAuthRbacGuard,
  RequireRoles,
  RequirePermission,
  CurrentUser,
} from '@/auth/better-auth';

@Controller('v1/clinical-records')
@UseGuards(BetterAuthGuard, BetterAuthRbacGuard)
export class ClinicalRecordsController {
  
  // Requires specific role
  @Get('doctor-overview')
  @RequireRoles('admin', 'staffDoctor', 'staffMidwife')
  async getDoctorOverview(@CurrentUser() user: any) {
    return { doctorId: user.id, status: 'authorized' };
  }

  // Requires specific resource action
  @Post('encounter')
  @RequirePermission('medicalRecord', 'create')
  async createEncounter(@CurrentUser() user: any) {
    return { createdBy: user.id };
  }
}
```

---

## 7. Security Hardening Checklist

- [x] **CSRF Protection**: Enabled by default (`disableCSRFCheck: false`).
- [x] **Origin Verification**: Enabled by default (`disableOriginCheck: false`).
- [x] **No Account Hijacking**: `allowDifferentEmails: false` prevents linking Google accounts to different emails.
- [x] **Encrypted OAuth Tokens**: `account.encryptOAuthTokens: true` ensures Google refresh/access tokens are encrypted at rest in PostgreSQL.
- [x] **Ban Enforcement**: Active ban status (`user.banned`) is evaluated on every session verification.
- [x] **Rate Limiting**: Social login endpoints are rate limited to 10 requests per minute per IP.
