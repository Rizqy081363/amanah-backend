/**
 * Canonical Role Audience definitions matching database migration 0063.
 * Single Source of Truth (SSOT) across all backend layers.
 */
export const ROLE_AUDIENCE = {
  INTERNAL: 'internal',
  EXTERNAL: 'external',
} as const;

export const ROLE_AUDIENCES = [
  ROLE_AUDIENCE.INTERNAL,
  ROLE_AUDIENCE.EXTERNAL,
] as const;

export type RoleAudience = (typeof ROLE_AUDIENCES)[number];
export const DEFAULT_ROLE_AUDIENCE: RoleAudience = ROLE_AUDIENCE.INTERNAL;

export const isRoleAudience = (v: unknown): v is RoleAudience =>
  typeof v === 'string' && (ROLE_AUDIENCES as readonly string[]).includes(v);
