# Reference: Security hardening

Every option here is a real Better Auth setting with a real failure mode behind it. The ordering is
roughly by how much damage the default does if left alone in production.

## Contents

- [1. Secrets](#1-secrets)
- [2. Base URL, origins, CSRF](#2-base-url-origins-csrf)
- [3. Cookies](#3-cookies)
- [4. Sessions](#4-sessions)
- [5. Account linking — the takeover path](#5-account-linking--the-takeover-path)
- [6. OAuth token storage](#6-oauth-token-storage)
- [7. Rate limiting and client IP](#7-rate-limiting-and-client-ip)
- [8. Credential paths and enumeration](#8-credential-paths-and-enumeration)
- [9. Database and IDs](#9-database-and-ids)
- [10. Logging, errors, telemetry](#10-logging-errors-telemetry)
- [11. Deployment topology](#11-deployment-topology)
- [12. Hardened baseline](#12-hardened-baseline)

---

## 1. Secrets

`secret` signs cookies and encrypts stored token material. Better Auth reads
`BETTER_AUTH_SECRET` or `AUTH_SECRET`; without either it falls back to a **publicly known** default
in development and throws in production. Generate with `openssl rand -base64 32`.

Rotation without invalidating existing data uses versioned secrets:

```ts
secrets: [
  { version: 2, value: process.env.BETTER_AUTH_SECRET_V2! },  // current: encrypts new data
  { version: 1, value: process.env.BETTER_AUTH_SECRET_V1! },  // decryption only
]
```

Or `BETTER_AUTH_SECRETS=2:...,1:...`. The first entry encrypts; the rest only decrypt. Plan rotation
before an incident forces it — rotating under pressure with one key means signing everyone out and
losing the ability to decrypt stored tokens.

Secrets belong in a secret manager, never in the repository, never in a client-visible variable,
never in an image layer or build argument.

## 2. Base URL, origins, CSRF

```ts
baseURL: process.env.BETTER_AUTH_URL,   // explicit, always
trustedOrigins: ["https://app.example.com"],
```

If `baseURL` is unset, Better Auth infers it from the incoming request. Inference means an attacker
who controls the `Host` header influences generated URLs, and it means the OAuth callback silently
points at the wrong origin in production.

`trustedOrigins` is the origin allowlist backing CSRF protection and redirect validation
(`callbackURL`, `redirectTo`). It accepts static arrays, a function of the request, and wildcard
patterns (`?` one character, `*` within a path segment, `**` across segments). Use the narrowest form
that works: `https://*.example.com` is acceptable if you own every subdomain; a pattern that can
match a host you do not control is an open redirect and a CSRF bypass.

For custom schemes (`myapp://`, `exp://`), note that a host-less entry trusts every host of that
scheme. Prefer a host-bearing entry.

Multi-domain deployments should use the object form of `baseURL` with an `allowedHosts` list rather
than disabling checks. Forwarded host and protocol headers are ignored unless you explicitly opt in
with `advanced.trustedProxyHeaders: true` — only enable that behind a proxy you control that strips
client-supplied forwarding headers.

Two options that must stay `false`:

- `advanced.disableCSRFCheck` — removes origin validation and Fetch Metadata checks.
- `advanced.disableOriginCheck` — removes URL validation for redirect targets.

If a legitimate flow is blocked by these, the fix is adding the origin, not removing the check. A
comment saying "temporarily disabled for testing" in auth config has a way of surviving to
production.

## 3. Cookies

```ts
advanced: {
  useSecureCookies: true,             // force Secure in every environment
  defaultCookieAttributes: {
    httpOnly: true,
    secure: true,
    sameSite: "lax",                  // "none" only for genuine cross-site, and then always Secure
  },
  cookiePrefix: "example",
}
```

Defaults are already secure in production; set `useSecureCookies` explicitly when staging runs over
HTTPS too, so the environments behave identically.

`sameSite: "lax"` is correct for a first-party app and preserves OAuth redirects. `"none"` is
required when the frontend and API are on different sites — it must be paired with `Secure`, and it
widens CSRF exposure, so keep the origin check on.

Cross-subdomain sharing:

```ts
crossSubDomainCookies: { enabled: true, domain: ".example.com" }
```

This makes the session cookie readable by every subdomain. If any subdomain hosts user-generated
content or a third-party tool, that tool now sits inside your session boundary. Enable it only when
you control every host under the domain.

## 4. Sessions

```ts
session: {
  expiresIn: 60 * 60 * 24 * 7,   // absolute lifetime
  updateAge: 60 * 60 * 24,       // sliding refresh interval
  cookieCache: { enabled: false } // enable only with a short maxAge, see below
}
```

`expiresIn` is a product decision: a consumer app can live with a week, an admin console should not.
`updateAge` controls how often an active session is extended; `disableSessionRefresh: true` turns
extension off entirely for a hard absolute timeout.

`cookieCache` stores the session in a signed cookie so reads skip the database. The cost is that
revocation, bans, and role changes are invisible until it expires. If you enable it, keep `maxAge`
in the low minutes and revoke sessions explicitly on every privilege change.

Session hygiene to implement in the app:

- Revoke all other sessions on password change or reset
  (`emailAndPassword.revokeSessionsOnPasswordReset: true`).
- Revoke sessions on ban, role change, and organization removal.
- Give users a visible session list with device/IP and a revoke control.
- Re-authenticate before high-impact actions rather than trusting an old session.

## 5. Account linking — the takeover path

This is the highest-value thing to get right on a Google-enabled app.

```ts
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ["google"],
    allowDifferentEmails: false,
    allowUnlinkingAll: false,
    updateUserInfoOnLink: false,
  },
},
```

The attack it defends against: an attacker registers an account with the victim's email address on
one authentication path, the victim later signs in with another path using the same email, and the
two are merged into one identity — handing the attacker a session, or handing the victim's data to
the attacker's credentials. Which direction it runs depends on which side registered first.

Decisions, in order of safety:

- `allowDifferentEmails: false` — always. Linking identities whose emails do not match discards the
  only signal tying them to the same person.
- `trustedProviders` — list only providers with a trustworthy verified-email signal. Google reports
  `email_verified` reliably; a provider that lets a user set an arbitrary unverified email does not
  belong here. The option also accepts an async function of the request when the policy varies.
- `disableImplicitLinking: true` — the strict posture. A same-email OAuth sign-in for an existing
  user is rejected with `account_not_linked` instead of being merged. New users can still sign up via
  OAuth, and signed-in users can still link explicitly through `linkSocial()`. Choose this when the
  app holds anything sensitive; the cost is a support-visible error message that you should design a
  screen for ("This email already has an account — sign in and connect Google from settings").
- `allowUnlinkingAll: false` — prevents a user from removing their last credential and locking
  themselves out.
- `updateUserInfoOnLink` — copies provider profile onto the local user. Email and `emailVerified` are
  never changed by it, but `name`/`image` are; leave it off if users curate their own profile.

Whatever you choose, make it explicit in the config. The dangerous state is not knowing which
behaviour you have.

## 6. OAuth token storage

```ts
account: {
  encryptOAuthTokens: true,
  storeStateStrategy: "database",   // default when a DB or secondaryStorage is configured
}
```

Provider access and refresh tokens are live credentials for a third-party account. Encrypt them at
rest. Request the minimum scopes; a compromised database with `drive` scope tokens is a different
incident from one with `profile email`.

`storeStateStrategy: "database"` keeps the OAuth state payload server-side with a signed state
cookie validated on callback. `"cookie"` is for fully stateless deployments only. With multiple
instances and no shared storage, cookie-strategy state plus sticky-session-less load balancing is a
common source of intermittent `state_mismatch`.

`storeAccountCookie` (encrypted account data in a cookie) exists for database-less flows. Prefer
database-backed storage in production: cookies have size limits, and provider tokens are large.

## 7. Rate limiting and client IP

```ts
rateLimit: {
  enabled: true,
  window: 10,
  max: 100,
  storage: "secondary-storage",      // or "database"
  customRules: {
    "/sign-in/email": { window: 60, max: 5 },
    "/forget-password": { window: 60, max: 3 },
    "/sign-up/email": { window: 60, max: 3 },
    "/two-factor/verify": { window: 60, max: 5 },
  },
},
```

Rate limiting defaults to enabled in production, disabled in development, with **memory** storage.
Memory storage is per-instance: with four replicas the effective limit is four times what you
configured, and it resets on every deploy. Use shared storage anywhere you run more than one process.

Tighten the credential-adjacent paths well below the global default — those are the ones that get
sprayed with credential lists.

Client IP resolution decides who a limit applies to:

```ts
advanced: {
  ipAddress: {
    ipAddressHeaders: ["cf-connecting-ip"],   // or your proxy's header
    trustedProxies: ["10.0.0.0/8"],
  },
},
```

Without proxy configuration, a client can send a forged forwarding header and receive a fresh bucket
per request, which is the same as having no rate limiting. With `trustedProxies`, the forwarded chain
is walked right to left, trusted hops are skipped, and the first untrusted address is used.

Rate limiting is not bot defense on its own. Add the Captcha plugin on sign-up and password reset if
abuse is a real concern, and the Have I Been Pwned plugin to reject known-breached passwords if
credentials are enabled.

## 8. Credential paths and enumeration

Every enabled authentication path is attack surface. For a Google-only app, leave
`emailAndPassword.enabled` at `false` — it is off by default and there is no reason to turn it on for
a flow nobody uses.

If credentials are enabled:

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,
  minPasswordLength: 12,
  revokeSessionsOnPasswordReset: true,
  resetPasswordTokenExpiresIn: 60 * 15,
},
```

`requireEmailVerification` does double duty: it blocks sessions for unverified addresses and it
enables enumeration protection, so sign-up with an existing email does not reveal that the account
exists. When plugins add user fields (the admin plugin adds four), supply
`customSyntheticUser` so the protective fake response has the same shape as a real one — otherwise
the shape difference is itself the oracle.

Related settings: `disableSignUp` for invite-only apps, `disabledPaths` to switch off endpoints you
never use, and per-provider `requireEmailVerification` for social providers whose email signal you
trust.

Verification identifiers should be stored hashed (`verification.storeIdentifier: "hashed"`) so a
database read does not yield usable reset tokens.

## 9. Database and IDs

```ts
advanced: {
  database: {
    generateId: "uuid",       // or your own; avoid guessable sequential IDs on public entities
    validateSchema: true,     // catches drift between config and actual tables
  },
},
```

Default IDs are random base62 strings, which are fine. `"serial"` is not, for anything a user can
reference: sequential IDs leak volume and invite enumeration.

Other database-side concerns: keep the auth schema migrations in the same forward-only migration
pipeline as the rest of the app, index the session token and user email columns, and treat the
`account` table as secret-bearing when setting up backups and access controls.

## 10. Logging, errors, telemetry

```ts
logger: { level: "warn" },
telemetry: { enabled: false },
onAPIError: {
  errorURL: "/auth/error",
  onError: (error, ctx) => { /* report with correlation id, no PII, no tokens */ },
},
```

Never log tokens, session identifiers, password material, or full request bodies from auth endpoints.
Log the outcome and a correlation identifier. Authentication failures should be logged with enough
structure to alert on (spikes in failures per account and per IP) and nothing more.

User-facing auth errors stay generic — "invalid email or password", never "no account with that
email". `databaseHooks` are the right place to emit audit events for privilege-relevant changes
(role set, ban, member added, organization deleted) because they fire regardless of which entry point
triggered the change.

## 11. Deployment topology

- **HTTPS everywhere**, including staging. Cookie behaviour differs on plaintext and you want the
  environments to match.
- **Shared state across replicas**: sessions, rate limits, and OAuth state must not live in
  per-instance memory. Configure `secondaryStorage` (Redis or equivalent) or database storage.
- **One canonical origin.** Multiple hostnames serving the same app split cookies and break CSRF
  expectations; redirect to the canonical host at the edge.
- **Container secrets** injected at runtime, never baked into the image (see the ops rules catalog if
  the project has one).
- **Serverless**: `advanced.backgroundTasks.handler` (for example `waitUntil`) defers non-critical
  work, at the cost of eventual consistency — enable only if that trade-off is acceptable.

## 12. Hardened baseline

A starting configuration for a Google-only, multi-replica web app. Adjust deliberately; do not
copy-paste past the parts you have not read.

```ts
export const auth = betterAuth({
  appName: "Example",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.APP_ORIGIN!],

  database: /* adapter */,
  secondaryStorage: /* redis */,

  emailAndPassword: { enabled: false },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
      requireEmailVerification: true,
    },
  },

  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },

  rateLimit: {
    enabled: true,
    storage: "secondary-storage",
    customRules: { "/sign-in/social": { window: 60, max: 10 } },
  },

  advanced: {
    useSecureCookies: true,
    disableCSRFCheck: false,
    disableOriginCheck: false,
    defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "lax" },
    ipAddress: { trustedProxies: [process.env.PROXY_CIDR!] },
    database: { generateId: "uuid" },
  },

  logger: { level: "warn" },
  telemetry: { enabled: false },

  plugins: [/* admin(...) and/or organization(...) */],
});
```
