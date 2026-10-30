export const AUTH_SURFACES = {
  MOBILE_INTERNAL: 'mobile-internal',
  WEB_ADMIN: 'web-admin',
  WEB_PATIENT: 'web-patient',
} as const;

export type AuthSurface = (typeof AUTH_SURFACES)[keyof typeof AUTH_SURFACES];
