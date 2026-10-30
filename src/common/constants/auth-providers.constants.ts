export const AUTH_PROVIDER = {
  CREDENTIAL: 'credential',
  GOOGLE: 'google',
} as const;

export type AuthProvider = (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER];
