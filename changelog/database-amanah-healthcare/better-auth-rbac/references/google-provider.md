# Reference: Google provider setup

Covers Google Cloud Console configuration, the provider block, every sign-in flow, and the errors
that consume the most debugging time.

## Contents

- [1. Google Cloud Console](#1-google-cloud-console)
- [2. Environment variables](#2-environment-variables)
- [3. Server instance and route handler](#3-server-instance-and-route-handler)
- [4. Provider options](#4-provider-options)
- [5. Sign-in flows](#5-sign-in-flows)
- [6. Workspace domain restriction](#6-workspace-domain-restriction)
- [7. Refresh tokens and extra scopes](#7-refresh-tokens-and-extra-scopes)
- [8. Reading the session on the server](#8-reading-the-session-on-the-server)
- [9. Troubleshooting](#9-troubleshooting)

---

## 1. Google Cloud Console

1. Google Cloud Console → **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID → Web application**.
3. Add an **Authorized redirect URI** for every environment that will ever run the flow:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://staging.example.com/api/auth/callback/google`
   - `https://example.com/api/auth/callback/google`
4. Copy the **Client ID** and **Client Secret**.

The callback path is `{baseURL}{basePath}/callback/google`. `basePath` defaults to `/api/auth`, so a
custom `basePath` changes the redirect URI and every entry in the console must be updated with it.
Google matches redirect URIs exactly — scheme, host, port, and path, with no trailing slash
tolerance. Preview deployments with generated hostnames will not match a static entry; for those use
a stable proxy domain or the OAuth Proxy plugin rather than adding URIs by hand for every branch.

Mobile and desktop clients get their own Client ID in the same Google Cloud project. Only the web
client ID pairs with the client secret for the redirect flow.

## 2. Environment variables

```bash
BETTER_AUTH_URL=https://example.com          # must match the deployed origin exactly
BETTER_AUTH_SECRET=                          # openssl rand -base64 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DATABASE_URL=
```

`GOOGLE_CLIENT_SECRET` and `BETTER_AUTH_SECRET` are server-only. Never give them a client-visible
prefix (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`) and never import the module that reads them into a client
component. The client ID alone is public by design; the secret is not.

Validate these at startup with a schema so a missing value fails the boot rather than the first
sign-in attempt in production.

## 3. Server instance and route handler

```ts
// lib/auth.ts — the single server instance
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  appName: "Example",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: /* your adapter */,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
});
```

```ts
// app/api/auth/[...all]/route.ts — Next.js App Router
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth.handler);
```

```ts
// lib/auth-client.ts — browser
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL, // omit when the client is same-origin
});
```

Run the schema step before the first request:

```bash
npx @better-auth/cli generate   # emit schema/migration files for your ORM
npx @better-auth/cli migrate    # apply directly (Kysely-backed adapters)
```

Framework note: the handler mounting differs per framework (`toNextJsHandler`, `toNodeHandler`,
Hono/Elysia/SvelteKit/Nuxt adapters). Confirm the exact import for the framework in use rather than
assuming Next.js.

## 4. Provider options

Options available on `socialProviders.google`:

| Option | Purpose | Safety note |
| --- | --- | --- |
| `clientId` | Web client ID, or an array of IDs to accept ID tokens from multiple platforms | The array only widens ID-token audience verification; the redirect flow still uses the first entry with the single secret and redirect URI |
| `clientSecret` | Web client secret | Server-only |
| `redirectURI` | Override the computed callback | Only when a proxy rewrites paths; must match the console entry |
| `scope` | Extra OAuth scopes | Request the minimum; extra scopes can be added later with `linkSocial` |
| `prompt` | `select_account`, `consent`, `login`, `none`, `select_account consent` | `select_account` prevents silent sign-in as the wrong Google account on shared machines |
| `accessType` | `offline` to receive a refresh token | Pair with `prompt: "consent"` (see §7) |
| `hd` | Require a Google Workspace hosted domain claim | Enforced by Better Auth on the returned claim, not just hinted to Google (see §6) |
| `disableSignUp` | Reject sign-in from users who do not already exist | Use for closed/invite-only apps |
| `disableImplicitSignUp` | Require `requestSignUp: true` on the call to create a user | Lets you gate account creation behind an explicit UI step |
| `requireEmailVerification` | Require the provider's verified-email signal before a session is created | Safe to enable for Google, which reports `email_verified` reliably |
| `overrideUserInfoOnSignIn` | Refresh local profile from the provider on every sign-in | Weigh against users who edited their own name/avatar |
| `mapProfileToUser` | Map provider profile fields onto your user row | Never map a field that grants privileges |
| `disableIdTokenSignIn` | Reject client-supplied ID tokens | Enable when only the redirect flow should exist |
| `includeGrantedScopes` | Incremental authorization; defaults to `true` | Set `false` when each flow should carry only its own scopes |
| `verifyIdToken` | Replace built-in ID-token verification | Only with a correct JWKS-backed implementation; getting this wrong accepts forged tokens |
| `getUserInfo` | Custom profile fetch | Replaces the built-in callback-path `hd` check — re-implement it if you use `hd` |

A hardened baseline for a web app:

```ts
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    prompt: "select_account",
    requireEmailVerification: true,
  },
},
```

## 5. Sign-in flows

**Redirect flow (default, web).**

```ts
await authClient.signIn.social({
  provider: "google",
  callbackURL: "/dashboard",       // validated against trustedOrigins
  errorCallbackURL: "/sign-in?error=1",
  newUserCallbackURL: "/welcome",  // first-time users, e.g. onboarding
});
```

`callbackURL` values are validated by the origin check. Do not disable that check to make an
arbitrary redirect work; add the origin to `trustedOrigins` if it is genuinely yours.

**ID-token flow (native apps, Google One Tap).**

```ts
const { idToken, accessToken } = await GoogleSignin.signIn();
await authClient.signIn.social({
  provider: "google",
  idToken: { token: idToken, accessToken },
});
```

No redirect happens; the user is signed in directly. The server verifies the token's signature and
audience against the configured client IDs — which is exactly why the client ID array must list every
platform's ID and nothing else. Never widen it to accept tokens issued for another project.

For Google One Tap on the web, use the One Tap plugin rather than hand-rolling the flow.

**Linking Google to an existing signed-in account.**

```ts
await authClient.linkSocial({ provider: "google", callbackURL: "/settings/security" });
```

This is the safe way to attach a provider: the user is already authenticated, so the link is
authorized by an active session rather than by an email match.

## 6. Workspace domain restriction

To limit sign-in to one Google Workspace domain:

```ts
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    hd: "company.com",     // "*" allows any Workspace domain, rejecting personal accounts
  },
},
```

Better Auth enforces the `hd` claim on the signed response, and tokens with no `hd` claim are
rejected whenever `hd` is configured. Google also receives the value as an account-selection hint,
but the hint alone is not a control — the enforcement is what matters.

Per-request restriction is possible with `additionalParams: { hd: "example.com" }` on the sign-in
call. Treat it as UX, not as a boundary: a per-call parameter originates on the client. Anything that
must hold for every sign-in belongs in the provider config.

Two caveats worth stating in code review:

- A custom `getUserInfo` replaces the built-in callback-path `hd` check. If you supply one, validate
  the claim yourself and return `null` when it is missing or does not match.
- Domain restriction is not the same as membership. Users can leave the company before your next
  session expiry. Pair it with SCIM/deprovisioning or short sessions if the domain is your only gate.

## 7. Refresh tokens and extra scopes

Google issues a refresh token only on the first consent. To receive one reliably:

```ts
socialProviders: {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    accessType: "offline",
    prompt: "select_account consent",
  },
},
```

For a user who already consented, a new refresh token requires them to revoke the app in their Google
account settings and re-authorize — there is no server-side way around it.

Request additional Google API scopes only when the feature that needs them is actually used:

```ts
await authClient.linkSocial({
  provider: "google",
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
```

Set `account.encryptOAuthTokens: true` before storing provider tokens. An access or refresh token in
a plaintext column is a credential sitting in every database backup and every accidental dump.

## 8. Reading the session on the server

```ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const session = await auth.api.getSession({ headers: await headers() });
```

Always pass the incoming request headers — `auth.api` calls do not carry ambient cookies. Server-side
`auth.api` endpoints that act on behalf of a user require those headers, and omitting them either
fails or, worse, executes without the user context you assumed.

Client-side reactive access uses the hook, which is for rendering only:

```ts
const { data: session, isPending } = authClient.useSession();
```

Never let a component's session object be the reason a server handler returns data.

## 9. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch` | Console URI ≠ computed callback | Set `baseURL`/`BETTER_AUTH_URL` explicitly; check `basePath`, scheme, port, no trailing slash |
| Callback lands on `localhost` in production | `baseURL` not set, inferred from the request | Set it explicitly; never rely on inference |
| Sign-in loops back to the sign-in page | Cookie not stored: cross-site context, missing `Secure`, or wrong cookie domain | Check `useSecureCookies`, `crossSubDomainCookies`, and that client and API share an origin or are both HTTPS |
| `state_mismatch` / invalid state | State cookie lost across the redirect, or multiple app instances without shared storage | Use `account.storeStateStrategy: "database"` (default when a DB is configured) or shared secondary storage |
| `account_not_linked` | Same email, different provider, linking not permitted | Decide the linking policy deliberately — see the account-linking section in `security-hardening.md` |
| Refresh token missing | Google only issues it on first consent | `accessType: "offline"` + `prompt: "consent"`, or have the user revoke and re-authorize |
| Works locally, 403 in production | Origin not in `trustedOrigins`, or proxy rewriting Origin | Add the real production origin; do not disable the origin check |
| ID-token sign-in rejected on mobile | Platform client ID not in the `clientId` array | Add the iOS/Android client ID from the same Google project |
| Users see a Google consent screen every time | `prompt: "consent"` left on permanently | Use `select_account` unless you specifically need a fresh refresh token |
