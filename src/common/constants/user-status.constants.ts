/**
 * Canonical user_status matching database enum pgEnum('user_status', [...]).
 * Single Source of Truth (SSOT).
 */
export const USER_STATUS = {
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
} as const;

export const USER_STATUSES = [
  USER_STATUS.PENDING_VERIFICATION,
  USER_STATUS.ACTIVE,
  USER_STATUS.INACTIVE,
  USER_STATUS.SUSPENDED,
] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
export const DEFAULT_USER_STATUS: UserStatus = USER_STATUS.PENDING_VERIFICATION;

export const isUserStatus = (v: unknown): v is UserStatus =>
  typeof v === 'string' && (USER_STATUSES as readonly string[]).includes(v);
