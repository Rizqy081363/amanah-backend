export const AUTH_SURFACES = {
  MOBILE_INTERNAL: 'mobile-internal',
  WEB_ADMIN: 'web-admin',
  WEB_PATIENT: 'web-patient',
} as const;

export type AuthSurface = (typeof AUTH_SURFACES)[keyof typeof AUTH_SURFACES];

export const AUTH_ERROR_CODES = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  CLIENT_NOT_ALLOWED: 'CLIENT_NOT_ALLOWED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  STAF: 'STAF',
  PATIENT: 'PATIENT',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * Canonical role codes mapped 1-to-1 from PostgreSQL `roles` table.
 * Source of Truth: `SELECT code FROM roles;`
 */
export const CANONICAL_ROLES = {
  ADMIN: 'admin',
  PATIENT: 'patient',
  STAFF_DOCTOR: 'staff_doctor',
  STAFF_MIDWIFE: 'staff_midwife',
  STAFF_WORKER: 'staff_worker',
} as const;

export type CanonicalRole =
  (typeof CANONICAL_ROLES)[keyof typeof CANONICAL_ROLES];

/**
 * Functional role groupings based on operational domain responsibilities.
 */
export const CLINIC_STAFF_ROLES = [
  CANONICAL_ROLES.ADMIN,
  CANONICAL_ROLES.STAFF_WORKER,
  CANONICAL_ROLES.STAFF_DOCTOR,
  CANONICAL_ROLES.STAFF_MIDWIFE,
] as const;

export const CHAT_SUPPORT_ROLES = [
  CANONICAL_ROLES.ADMIN,
  CANONICAL_ROLES.STAFF_WORKER,
] as const;

export const CLINICAL_PRACTITIONER_ROLES = [
  CANONICAL_ROLES.STAFF_DOCTOR,
  CANONICAL_ROLES.STAFF_MIDWIFE,
] as const;

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING_VERIFICATION: 'pending_verification',
  SUSPENDED: 'suspended',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

