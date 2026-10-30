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

/**
 * Canonical Role Tier definitions matching database migration 0062.
 */
export const ROLE_TIER = {
  MACRO: 'macro',
  MICRO: 'micro',
} as const;

export const ROLE_TIERS = [ROLE_TIER.MACRO, ROLE_TIER.MICRO] as const;
export type RoleTier = (typeof ROLE_TIERS)[number];
export const DEFAULT_ROLE_TIER: RoleTier = ROLE_TIER.MACRO;

export const isRoleTier = (v: unknown): v is RoleTier =>
  typeof v === 'string' && (ROLE_TIERS as readonly string[]).includes(v);
