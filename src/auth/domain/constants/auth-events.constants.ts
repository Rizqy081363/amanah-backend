export const AUTH_EVENTS = {
  USER_PROVISIONED: 'auth.user_provisioned',
} as const;

export type AuthEventType = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS];
