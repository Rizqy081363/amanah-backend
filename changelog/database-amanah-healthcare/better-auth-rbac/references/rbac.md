# Reference: Role-based access control

Covers the access-control model, the admin plugin (app-wide roles), the organization plugin
(tenant-scoped roles), dynamic roles, and how to enforce all of it on the server.

## Contents

- [1. The model](#1-the-model)
- [2. Defining statements and roles](#2-defining-statements-and-roles)
- [3. Admin plugin](#3-admin-plugin)
- [4. Organization plugin](#4-organization-plugin)
- [5. Dynamic access control](#5-dynamic-access-control)
- [6. Enforcement patterns](#6-enforcement-patterns)
- [7. UI gating](#7-ui-gating)
- [8. Privilege changes and session freshness](#8-privilege-changes-and-session-freshness)
- [9. Naming and modeling rules](#9-naming-and-modeling-rules)
- [10. Pitfalls](#10-pitfalls)

---

## 1. The model

Better Auth's access control has three pieces:

- **Statement** — the catalog of resources and the actions available on each. It is the vocabulary of
  your permission system and it is defined in code with `as const` so TypeScript can infer it.
- **Role** — a named subset of that catalog, created with `ac.newRole({...})`.
- **Check** — asking whether a subject holds a given permission, either server-side (authoritative,
  sees dynamic roles) or client-side (synchronous, static roles only, rendering only).

Roles are stored as strings on a row: `user.role` for the admin plugin, `member.role` for the
organization plugin. A subject may hold multiple roles, stored comma-separated. Permissions are the
union of the roles held.

Two access controllers can coexist in one app. Keep them separate:

| Controller | Scope | Subject | Typical resources |
| --- | --- | --- | --- |
| admin | whole application | the user row | `user`, `session`, plus platform resources |
| organization | one organization | the membership row | `project`, `invoice`, `member`, `team` |

## 2. Defining statements and roles

Keep this in one file that both server and client import. It is the single source of truth for the
permission vocabulary.

```ts
// lib/permissions.ts
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc, userAc } from "better-auth/plugins/admin/access";

// `as const` is required — without it, TypeScript infers string[] and all inference is lost.
export const statement = {
  ...defaultStatements,            // keep the plugin's own `user` and `session` permissions
  project: ["create", "read", "update", "delete", "publish"],
  billing: ["read", "manage"],
} as const;

export const ac = createAccessControl(statement);

export const user = ac.newRole({
  ...userAc.statements,
  project: ["read"],
});

export const support = ac.newRole({
  user: ["list", "get", "ban"],
  session: ["list", "revoke"],
  project: ["read"],
});

export const admin = ac.newRole({
  ...adminAc.statements,           // keep every default admin permission
  project: ["create", "read", "update", "delete", "publish"],
  billing: ["read", "manage"],
});
```

Two rules that prevent silent breakage:

- **Import from the narrow path.** `better-auth/plugins/access` and
  `better-auth/plugins/admin/access` (or `better-auth/plugins/organization/access`), not
  `better-auth/plugins` — the wide import pulls unnecessary code into the bundle.
- **Spread the defaults.** Redefining a role name that the plugin already knows (`admin`, `user`,
  `owner`, `member`) *replaces* its permissions. Without `...adminAc.statements`, your `admin` role
  loses the ability to ban users, revoke sessions, and so on — and the failure appears later, as a
  confusing 403 on an endpoint nobody changed.

## 3. Admin plugin

```ts
// lib/auth.ts
import { betterAuth } from "better-auth";
import { admin as adminPlugin } from "better-auth/plugins";
import { ac, admin, support, user } from "./permissions";

export const auth = betterAuth({
  plugins: [
    adminPlugin({
      ac,
      roles: { admin, support, user },
      defaultRole: "user",
      adminRoles: ["admin"],              // roles treated as administrative
      impersonationSessionDuration: 60 * 15,
      bannedUserMessage: "Your account is suspended. Contact support.",
    }),
  ],
});
```

```ts
// lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, admin, support, user } from "./permissions";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles: { admin, support, user } })],
});
```

Schema added to `user`: `role`, `banned`, `banReason`, `banExpires`. Added to `session`:
`impersonatedBy`. Run the migration before deploying code that reads them.

Default statements: `user: create, list, set-role, ban, impersonate, impersonate-admins, delete,
set-password, set-email, get, update` and `session: list, revoke, delete`.

Administrative operations available through `authClient.admin.*` (client) and `auth.api.*` (server):
create/list/get/update users, `setRole`, `setUserPassword`, `banUser`/`unbanUser`,
`listUserSessions`, `revokeUserSession`, `revokeUserSessions`, `impersonateUser`,
`stopImpersonating`, `removeUser`.

Security notes specific to this plugin:

- `adminUserIds` bypasses the permission system entirely for the listed user IDs. Use it only as a
  break-glass mechanism, keep the list short, and log every action those accounts take.
- Banning revokes the user's existing sessions. A ban with no `banExpiresIn` never expires.
- Impersonation is a privileged, auditable action. Admins cannot impersonate other admins unless a
  role holds `user: ["impersonate-admins"]`. Keep `impersonationSessionDuration` short, log the
  `impersonatedBy` value on every mutation performed during the session, and show a persistent banner
  in the UI so the operator cannot forget they are acting as someone else.
- `setRole` is privilege escalation if it is reachable by the wrong person. Confirm the caller holds
  `user: ["set-role"]`, and block self-elevation explicitly — a user changing their own role is
  almost never legitimate.
- If you use email-enumeration protection (`requireEmailVerification` or `autoSignIn: false`), supply
  `emailAndPassword.customSyntheticUser` including the plugin's fields (`role`, `banned`,
  `banReason`, `banExpires`), or the fake sign-up response has a different shape from a real one and
  leaks which emails exist.

## 4. Organization plugin

```ts
import { organization } from "better-auth/plugins";
import { ac, owner, admin, member } from "./org-permissions";

organization({
  ac,
  roles: { owner, admin, member },
  creatorRole: "owner",
  membershipLimit: 100,
  invitationExpiresIn: 60 * 60 * 48,
  sendInvitationEmail: async ({ email, id, organization }) => { /* ... */ },
})
```

Org statements come from `better-auth/plugins/organization/access` (`defaultStatements`, `ownerAc`,
`adminAc`, `memberAc`). Default roles: `owner` (full control), `admin` (everything except deleting
the organization or transferring ownership), `member` (read-only).

The organization's own resources — `organization`, `member`, `invitation`, and `team` when teams are
enabled — are already in the default statements. Spread them when defining custom roles.

Enforcement uses the active organization from the session, not an ID from the request:

```ts
const { success } = await auth.api.hasPermission({
  headers: await headers(),
  body: { permissions: { project: ["delete"] } },
});
```

Checking against an `organizationId` supplied in the request body is the multi-tenant equivalent of
trusting a client-supplied role. If a call must name the organization explicitly, verify membership
of that organization first, then check the permission.

Invitations deserve their own scrutiny: they are a way to grant a role to an email address that has
not authenticated yet. Confirm the inviter holds the permission to invite *at the role they are
granting* (a member must not be able to invite an owner), expire invitations, and make acceptance
require the invited email's own authenticated session.

## 5. Dynamic access control

Runtime-created roles, stored per organization, for products where customers define their own roles.

```ts
organization({
  ac,                                   // required — it defines the permission universe
  dynamicAccessControl: { enabled: true },
})
```

The `ac` instance still bounds what any dynamic role can contain: customers compose from your
statement, they do not invent new resources. This is the property that keeps dynamic roles safe.

Consequences to handle explicitly:

- `checkRolePermission` on the client cannot see dynamic roles — it is synchronous and static.
  Any UI that depends on a dynamic role must call the server `hasPermission` endpoint.
- Creating or editing a role is itself a privileged action. Gate it, and prevent a role from granting
  permissions its creator does not hold — otherwise any role-manager escalates to full control.
- Renaming or deleting a role has to propagate to member rows. Confirm the behaviour in the installed
  version before relying on it.

## 6. Enforcement patterns

**Server-side, authoritative.** This is the only kind that protects anything.

```ts
// Admin domain
const { success } = await auth.api.userHasPermission({
  body: { userId: session.user.id, permissions: { project: ["delete"] } },
});

// Organization domain (permissions resolved against the active organization)
const { success } = await auth.api.hasPermission({
  headers: await headers(),
  body: { permissions: { project: ["delete"] } },
});
```

`userHasPermission` also accepts `role` instead of `userId` to ask "what can this role do" —
useful for building an admin UI that explains a role, not for authorizing a request.

**The three checks, in order, for every object-scoped operation:**

1. Session exists and the account is not banned.
2. Permission: does this subject's role allow this action on this resource type?
3. Scope: does this specific object belong to this user, or to the organization the session is
   currently acting in?

Step 3 is the one that gets skipped. Role checks answer "may an editor delete projects"; only the
scope check answers "may this editor delete *that* project". Enforce the scope in the query itself
(filter by owner or organization in the `where` clause) rather than fetching first and comparing
afterwards — a filtered query cannot be forgotten in a later code path.

**Layering.** Middleware can do a cheap optimistic check for redirects — session cookie present,
route requires auth — but it is not the boundary. Middleware runs on a path, not on data. Every
handler, server action, and job that touches data re-checks.

## 7. UI gating

```ts
// static roles only, synchronous, browser-side
const canDelete = authClient.admin.checkRolePermission({
  role: session.user.role,
  permissions: { project: ["delete"] },
});
```

Use it to hide buttons and avoid dead ends. It is not enforcement and never becomes enforcement by
being correct. Two rules: the endpoint behind a hidden control must still deny the request, and a UI
built on dynamic roles must call the server instead, because this function cannot see them.

## 8. Privilege changes and session freshness

Roles are read from the database on each server-side check — unless a cache sits in front. The two
caches that cause stale-permission bugs:

- `session.cookieCache` stores the session (including user fields) in a signed cookie for `maxAge`
  seconds. During that window a demoted user keeps their old role, and a banned user keeps their
  session. Keep `maxAge` small (a few minutes at most) and treat it as a latency optimization with a
  security cost, not a free win.
- Any application-level cache of the session or role you add yourself.

Whenever a privilege changes — role set, member removed, organization deleted, user banned — revoke
the affected user's sessions (`revokeUserSessions`) so the next request re-derives everything. A
permission system that takes five minutes to remove access has a five-minute window in every incident
response.

For high-impact operations (changing an owner, deleting an organization, rotating credentials),
require a recently authenticated session or a second factor. "Signed in three weeks ago on a laptop
in a coffee shop" is not the same assurance level as "authenticated one minute ago".

## 9. Naming and modeling rules

- **Resources are singular:** `user`, `session`, `project`, `organization`. The built-in statements
  are singular, and `users: ["ban"]` silently never matches.
- **Actions are lowercase, hyphenated, and reuse the built-in verbs** where they exist: `set-role`,
  not `change-role`; `ban` covers ban and unban.
- **Permissions name capabilities, not job titles.** `invoice: ["issue"]`, not
  `finance-person: ["do-finance-things"]`. Roles are the grouping; the statement is the vocabulary.
- **Start with the smallest role set that the product actually needs.** Every role is a combination
  someone has to reason about during an incident. Three well-chosen roles beat eight overlapping ones.
- **Export permission constants** from the permissions module and reference them at call sites, so a
  renamed resource is a compile error rather than a check that quietly stops matching.

## 10. Pitfalls

| Pitfall | Consequence | Avoid by |
| --- | --- | --- |
| Custom role without spreading defaults | Role loses plugin permissions; confusing 403s later | Spread `adminAc.statements` / `defaultStatements` |
| Plural resource names | Check never matches; may read as "no permission" or be skipped | Singular names, imported constants |
| Client `checkRolePermission` as the gate | Anyone can call the endpoint directly | Server check in the handler |
| App-wide `role` used for tenant permissions | A user gets the same power in every organization | Organization plugin with membership roles |
| `organizationId` taken from the request body | Cross-tenant access | Use the active organization from the session |
| Role check without an ownership check | User edits another user's row within the same role | Scope filter in the query |
| Missing migration after adding a plugin | Fields read as `undefined`; checks behave unpredictably | Generate/apply schema first, verify columns exist |
| `adminUserIds` used for convenience | Permission system bypassed silently | Real roles; break-glass only, audited |
| Self-service `setRole` | Privilege escalation | Explicitly block self-elevation; require `user:set-role` |
| Long `cookieCache` maxAge | Ban and demotion take minutes to apply | Short maxAge + revoke sessions on privilege change |
| Dynamic role creation ungated | Any role-manager escalates to full control | Gate role management; forbid granting permissions the creator lacks |
