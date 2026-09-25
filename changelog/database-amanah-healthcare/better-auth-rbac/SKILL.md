---
name: better-auth-rbac
description: Build, review, and harden authentication with Better Auth in TypeScript/JavaScript apps — server configuration, Google OAuth sign-in, session and cookie security, and role-based access control via the admin and organization plugins. Use this skill whenever the user mentions Better Auth, better-auth, betterAuth, auth.ts, authClient, createAuthClient, social or Google sign-in, OAuth callback setup, roles, permissions, RBAC, access control, protecting routes, admin panels, multi-tenant organizations, impersonation, or banning users — and also when they ask to "add login", "gate this by role", "check permissions", "secure my API", or "audit my auth setup" without naming the library, as long as the project uses or is choosing Better Auth. Treat any auth-related task in a Better Auth codebase as in scope; under-triggering here produces insecure code.
---

# Better Auth: Google Sign-In + RBAC, built safely

Authentication code fails quietly. A broken permission check does not throw — it returns data to
someone who should not have it. This skill exists to make the safe construction the default one.

Targets Better Auth **1.7.x** (1.7.5 is the latest stable line; 1.8 is in beta). Before writing code,
check the installed version (`package.json`) and confirm any option you are unsure about against the
installed package's types rather than memory — this library moves fast and options have been relocated
between majors (for example, OAuth state options moved from `advanced` into `account`).

## Read this first, then load what you need

| You are doing | Read |
| --- | --- |
| First-time setup, Google credentials, callback URLs, sign-in flows | `references/google-provider.md` |
| Roles, permissions, statements, enforcement, multi-tenant orgs | `references/rbac.md` |
| Config hardening, cookies, CSRF, rate limits, account-linking attacks | `references/security-hardening.md` |
| Auditing an existing setup, or before declaring work finished | `references/verification-checklist.md` |

Load the reference files as you reach the relevant step. Do not guess at option names — the reference
files carry the verified ones.

## The five invariants

Everything else in this skill is downstream of these. If a change would break one, stop and say so
rather than shipping it.

1. **Authorization is enforced on the server, at the data boundary.** Client-side role checks decide
   what to render, never what to return. Every handler, server action, and resolver re-derives the
   session from cookies and re-checks permission before touching data.
2. **Deny by default.** A route with no explicit permission check is closed, not open. Never rely on
   "this route isn't linked anywhere in the UI".
3. **Authenticated ≠ authorized.** After confirming a session, confirm that *this* user may act on
   *this* object. Ownership and tenant scoping are separate checks from role.
4. **The session cookie is the only thing you trust from the browser.** Never accept `role`,
   `userId`, `organizationId`, or `isAdmin` from a request body, query string, or header as an
   authorization input.
5. **Security-weakening options stay off.** `disableCSRFCheck`, `disableOriginCheck`, wildcard
   `trustedOrigins`, and `allowDifferentEmails` are not acceptable fixes for a bug you are debugging.

## Choose the access-control model before writing code

```
Do permissions depend on which workspace/tenant the user is acting in?
├── No → admin plugin only.
│        App-wide roles on the user row (admin, user, custom).
│        Good for: internal tools, support consoles, single-tenant SaaS.
│
└── Yes → organization plugin (+ admin plugin if you also need platform staff).
         Roles live on the membership row, scoped per organization.
         Good for: multi-tenant SaaS, team workspaces.
         │
         └── Do customers need to invent their own roles at runtime?
             ├── No  → static roles defined in code (`ac.newRole`).
             └── Yes → organization plugin with `dynamicAccessControl: { enabled: true }`.
```

Using the admin plugin's app-wide `role` column for tenant permissions is the most common structural
mistake in Better Auth projects: it gives a user the same power in every organization they join.

If both plugins are present, keep the two vocabularies separate — platform staff powers (`user:ban`,
`session:revoke`) belong to the admin access controller; tenant powers (`project:delete`,
`invoice:issue`) belong to the organization access controller.

## Build order

Work in this sequence. Each step depends on the previous one being correct, and skipping ahead
produces the failures listed at the end of this file.

1. **Server instance** — one `auth.ts` exporting `betterAuth({...})`, imported everywhere on the
   server. Never construct a second instance.
2. **Database + migration** — run the CLI to generate or apply the schema before touching plugins
   that add columns. Plugin fields (`role`, `banned`, `banExpires`, membership tables) must exist
   before any code reads them.
3. **Route handler** — mount the catch-all handler at `basePath` (default `/api/auth`).
4. **Google provider** — credentials, redirect URIs, `baseURL`. See `references/google-provider.md`.
5. **Hardening pass** — cookies, trusted origins, rate limiting, account linking, secrets. See
   `references/security-hardening.md`. Do this *before* building features, not after.
6. **Access control** — statements, roles, plugin wiring, then the server-side guard helper. See
   `references/rbac.md`.
7. **Enforcement + UI** — guard every protected entry point, then gate the UI for usability only.
8. **Verify** — walk `references/verification-checklist.md` and report the result.

## The guard helper is the deliverable

Scattered `if (session.user.role === "admin")` checks are how permission bugs get in. Produce one
helper per access-control domain and route every check through it. The shape that works:

```ts
// server/guard.ts
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { forbidden, unauthorized } from "@/lib/errors";

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw unauthorized();
  if (session.user.banned) throw forbidden("account_banned");
  return session;
}

export async function requirePermission(permissions: Record<string, string[]>) {
  const session = await requireSession();
  const { success } = await auth.api.userHasPermission({
    body: { userId: session.user.id, permissions },
  });
  if (!success) throw forbidden();
  return session;
}
```

Rules for the helper:

- It throws; it does not return `false` for callers to ignore. A forgotten return value is a hole.
- It reads the session from request headers on every call. Never from a module-level variable, and
  never from an argument the caller supplies.
- Permission names are imported from the statement definition, never typed as string literals at the
  call site — a typo in a resource name fails *open* in some check styles and is invisible in review.
- Ownership and tenant checks live beside it and are mandatory for object-scoped operations. Role
  alone answers "may this kind of user do this kind of thing", not "may this user touch this row".

## Configuration defaults to apply

Apply these unless the user has a stated reason not to. `references/security-hardening.md` explains
each one and what breaks without it.

| Setting | Value | Why it matters |
| --- | --- | --- |
| `baseURL` | explicit, from env | Inferred base URLs produce wrong OAuth callbacks and open redirect surface |
| `secret` | from env, 32+ random bytes | Signs cookies and encrypts tokens; the built-in fallback is public |
| `trustedOrigins` | explicit list | Origin allowlist for CSRF protection; no blanket wildcards |
| `advanced.useSecureCookies` | `true` in production | Prevents cookie transmission over plaintext |
| `advanced.disableCSRFCheck` | `false` (never change) | Turning it off removes origin + Fetch Metadata validation |
| `advanced.disableOriginCheck` | `false` (never change) | Turning it off allows arbitrary `callbackURL` redirects |
| `account.encryptOAuthTokens` | `true` | Provider access/refresh tokens are credentials at rest |
| `account.accountLinking.allowDifferentEmails` | `false` | Linking across emails is an account-takeover path |
| `session.expiresIn` / `updateAge` | tuned deliberately | 7-day default is not right for every product |
| `rateLimit.storage` | shared (`secondary-storage` or `database`) | Memory storage multiplies the limit by replica count |
| `advanced.ipAddress.trustedProxies` | set when behind a proxy | Otherwise clients forge their own rate-limit identity |
| `emailAndPassword.enabled` | `false` unless required | Every enabled credential path is attack surface |

## When you are reviewing existing code

Read `references/verification-checklist.md` and work through it as an audit rather than writing new
code first. Report findings as: what is wrong, what an attacker gets from it, and the minimal fix.
Rank by exploitability, not by how easy the fix is. Do not silently "improve" auth code while doing
an unrelated task — auth changes need to be visible and deliberate.

## Failure modes to check for by name

These account for most real Better Auth incidents. Check each one explicitly rather than assuming.

- **UI-only gating.** A hidden button with an unprotected endpoint behind it. The endpoint is the
  security boundary; the button is decoration.
- **Stale permissions from session cookie cache.** With `session.cookieCache` enabled, role and ban
  changes are not visible until the cache expires. Revoke sessions on any privilege change, and keep
  `maxAge` short if you enable it at all.
- **Client-side `checkRolePermission` used as enforcement.** It is synchronous, runs in the browser,
  and does not see dynamic roles at all. It is for rendering only.
- **Implicit account linking on a same email.** A user who signs up with email/password can be
  silently merged with a Google identity, or vice versa. Decide this deliberately; see the account
  linking section of `references/security-hardening.md`.
- **Custom roles that erase defaults.** Defining a role without spreading `defaultStatements` /
  `adminAc.statements` silently removes permissions the plugin relies on.
- **Plural resource names.** The built-in statements use singular (`user`, `session`,
  `organization`). `users: ["ban"]` never matches and fails silently.
- **Missing schema migration.** Adding the admin or organization plugin without running the
  migration leaves reads returning `undefined`, which most permission code treats as "not admin" —
  until someone writes a check that treats it as "unknown, allow".
- **`adminUserIds` in production.** It bypasses the permission system entirely. Acceptable only for
  a break-glass account, and it belongs in the audit log.
- **Impersonation without an audit trail.** Sessions carry `impersonatedBy`; log it, surface it in
  the UI, and keep the duration short.
- **Secrets in the repo or in `NEXT_PUBLIC_*`.** Client IDs are public; client secrets and
  `BETTER_AUTH_SECRET` are not.

## Before you say it's done

State plainly which of these you verified and which you could not:

- Every new endpoint calls the guard helper, and the guard throws rather than returns.
- A user with the lowest role receives a denial (not a silent empty result) from every protected
  endpoint you touched.
- Cross-tenant access was attempted and refused, if the organization plugin is in use.
- The Google callback URL in the Google Cloud Console matches `baseURL` + `basePath` + `/callback/google`
  for every environment that exists.
- No security-weakening option was introduced, and no secret was written into a client-visible file.

If you could not verify something because you cannot run the app, say which checks the user needs to
run and exactly what a correct result looks like.
