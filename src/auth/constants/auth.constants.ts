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

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING_VERIFICATION: 'pending_verification',
  SUSPENDED: 'suspended',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

