# Reference: Verification and audit checklist

Use this before declaring work finished, and as the structure for auditing an existing Better Auth
setup. Each item states what to check and what a failing result looks like, because "looks fine" is
not a result.

## How to report

For each finding: **what is wrong → what an attacker or a mistake gets from it → the minimal fix.**
Rank by exploitability, not by ease of repair. Never bury a finding inside a paragraph about
something else. If you could not verify an item because you cannot run the application, say so
explicitly and give the user the exact check and the expected result.

---

## A. Configuration

- [ ] `baseURL` is set explicitly from an environment variable, not inferred.
- [ ] `BETTER_AUTH_SECRET` is 32+ random bytes, comes from the environment, and appears nowhere in
      the repository or in any client-visible variable.
- [ ] `trustedOrigins` lists real origins. No wildcard that could match a host the team does not own.
- [ ] `advanced.disableCSRFCheck` and `advanced.disableOriginCheck` are absent or `false`. Grep for
      them; a disabled check added during debugging is a common survivor.
- [ ] `useSecureCookies` / cookie attributes are correct for the deployment, and `sameSite: "none"`
      appears only where genuinely cross-site and always with `Secure`.
- [ ] `crossSubDomainCookies` is off, or every host under the domain is trusted.
- [ ] `account.encryptOAuthTokens` is `true`.
- [ ] `accountLinking` policy is explicit: `allowDifferentEmails: false`, `trustedProviders` limited
      to providers with a trustworthy verified-email signal, and a deliberate decision recorded on
      `disableImplicitLinking`.
- [ ] Rate limiting is enabled with shared storage, and credential-adjacent paths have tighter custom
      rules than the global default.
- [ ] Behind a proxy: `advanced.ipAddress.trustedProxies` is configured, so a forged forwarding
      header cannot mint a fresh rate-limit bucket.
- [ ] Unused auth paths are disabled (`emailAndPassword.enabled: false` on a social-only app,
      `disabledPaths` for endpoints never used).
- [ ] Telemetry setting is deliberate; logger level does not emit tokens or request bodies.

## B. Google provider

- [ ] Client secret is server-only. Confirm the module reading it is never imported by client code.
- [ ] Every environment's redirect URI exists in the Google Cloud Console and matches
      `baseURL + basePath + /callback/google` exactly — scheme, host, port, path.
- [ ] Sign-in succeeds end to end in the environment being shipped, not only locally.
- [ ] If `hd` is configured: an account outside the domain is rejected, and an account with no `hd`
      claim is rejected. If a custom `getUserInfo` exists, it re-implements the claim check.
- [ ] If ID-token sign-in is used: the `clientId` array contains only this project's platform client
      IDs. A token minted for a different audience is rejected.
- [ ] Extra Google scopes are requested only where a feature uses them.
- [ ] `callbackURL` values passed by the client are inside trusted origins; an external URL is
      refused.

## C. Access control wiring

- [ ] The schema migration for every enabled plugin has been applied. Verify the columns exist
      (`user.role`, `user.banned`, `session.impersonatedBy`, membership tables) rather than assuming.
- [ ] Statements use `as const`, singular resource names, and are defined in one shared module.
- [ ] Custom roles that reuse a built-in name spread the default statements. Verify by checking that
      an `admin` can still perform a default admin action such as revoking a session.
- [ ] The same `ac` and `roles` are passed to both the server plugin and the client plugin.
- [ ] Tenant permissions live on membership roles, not on the app-wide `user.role`.
- [ ] `adminUserIds` is empty, or contains only a documented break-glass account whose actions are
      audited.

## D. Enforcement — the part that actually matters

- [ ] Every protected endpoint, server action, and background job calls the guard helper. Enumerate
      them; do not sample.
- [ ] The guard throws on denial rather than returning a value a caller can ignore.
- [ ] The session is read from request headers on every call, never from a cached module variable.
- [ ] No authorization input is taken from the request body, query string, or headers — no `role`,
      `userId`, `organizationId`, or `isAdmin` supplied by the client.
- [ ] Object-scoped operations filter by owner or organization **inside the query**, not after
      fetching.
- [ ] Organization permission checks resolve against the session's active organization.
- [ ] Middleware is treated as UX redirection only; removing it would not expose data.
- [ ] Client-side `checkRolePermission` appears only in rendering code.

### Manual probes to run

1. Sign in as the lowest-privilege role. Call each protected endpoint directly (curl, REST client) —
   bypassing the UI entirely. Expect a denial, not an empty list. An empty `200` usually means the
   permission check is missing and the query simply matched nothing.
2. Sign in as a member of organization A. Call an endpoint for a resource in organization B by ID.
   Expect a denial. A `404` is acceptable if existence is confidential and that policy is documented.
3. Attempt self-elevation: call the role-setting endpoint targeting your own user. Expect a denial.
4. Attempt to grant a role you do not hold (dynamic access control): expect a denial.
5. Ban a test user in one session while they are active in another; confirm their next request fails.
   If it does not, the session cache window is longer than you think.
6. Change a user's role and confirm the new permissions apply on the next request, not minutes later.
7. Remove the session cookie and repeat the first probe. Expect `401`, never a partial response.

## E. Session lifecycle

- [ ] `expiresIn` and `updateAge` are deliberate values, appropriate to the product's risk.
- [ ] `cookieCache`, if enabled, has a short `maxAge`, and privilege changes revoke sessions
      explicitly.
- [ ] Sessions are revoked on: ban, role change, membership removal, password change or reset,
      account deletion.
- [ ] Users can list and revoke their own sessions.
- [ ] High-impact operations require recent authentication or a second factor.

## F. Admin surface

- [ ] Admin endpoints require the specific permission, not merely "is signed in".
- [ ] Impersonation is permission-gated, short-lived, visibly indicated in the UI, and every action
      performed while impersonating is attributed to the operator via `impersonatedBy`.
- [ ] Impersonating other admins requires an explicitly granted permission.
- [ ] Privilege-relevant mutations (role set, ban, member add/remove, org delete) emit audit records
      containing actor, target, action, timestamp, and source.
- [ ] Audit records are written where the application cannot later edit them.

## G. Data exposure

- [ ] Responses never include `password`, token columns, or other users' identifiers beyond what the
      caller needs.
- [ ] Admin list endpoints are paginated with a server-enforced ceiling.
- [ ] Error messages do not reveal whether an account exists.
- [ ] If enumeration protection is on and plugins add user fields, `customSyntheticUser` includes
      them so the protective response is shape-identical to a real one.

## H. Deployment

- [ ] HTTPS in every environment that handles real credentials.
- [ ] Sessions, rate limits, and OAuth state use shared storage across replicas.
- [ ] Secrets are injected at runtime, absent from the image and from version control.
- [ ] A secret-rotation path exists and has been read by someone other than its author.
- [ ] Auth-specific alerts exist: failure-rate spikes, ban events, impersonation events, permission
      denials rising sharply.

---

## Fast triage when auditing unfamiliar code

Search the codebase for these, in order. Each has a high hit rate:

1. `disableCSRFCheck`, `disableOriginCheck`, `allowDifferentEmails: true`, `trustedOrigins: ["*"]`.
2. `role === "admin"` and similar inline comparisons — every one is a check that bypasses the
   permission system and will drift.
3. `checkRolePermission` imported into a server file.
4. `getSession` called without `headers`.
5. `organizationId` or `userId` read from `body`/`query` near a database call.
6. Endpoints and server actions with no guard call at the top.
7. `adminUserIds` with entries.
8. Secrets or client secrets in files with a public-variable prefix.
9. `cookieCache` enabled with a long `maxAge` and no session revocation on role change.
10. A second `betterAuth(...)` instance anywhere in the tree.
