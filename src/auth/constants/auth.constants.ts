export const AUTH_SURFACES = {
  MOBILE_INTERNAL: 'mobile-internal',
  WEB_ADMIN: 'web-admin',
  WEB_PATIENT: 'web-patient',
} as const;

export const AUTH_ERROR_CODES = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  CLIENT_NOT_ALLOWED: 'CLIENT_NOT_ALLOWED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
} as const;

export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  STAF: 'STAF',
  PATIENT: 'PATIENT',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export function resolveSystemRole(
  roleCode?: string | null,
  hasStaffProfile = false,
): SystemRole {
  if (roleCode === 'admin' || roleCode === 'ADMIN') {
    return SYSTEM_ROLES.ADMIN;
  }
  if (roleCode === 'patient' || roleCode === 'PATIENT') {
    return SYSTEM_ROLES.PATIENT;
  }
  if (hasStaffProfile || (roleCode && roleCode !== 'patient')) {
    return SYSTEM_ROLES.STAF;
  }
  return SYSTEM_ROLES.PATIENT;
}

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING_VERIFICATION: 'pending_verification',
  SUSPENDED: 'suspended',
} as const;

