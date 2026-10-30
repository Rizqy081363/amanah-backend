export const NOTIFICATION_AUDIENCE = {
  ALL: 'all',
  INTERNAL: 'internal',
  EXTERNAL: 'external',
} as const;

export const NOTIFICATION_AUDIENCES = [
  NOTIFICATION_AUDIENCE.ALL,
  NOTIFICATION_AUDIENCE.INTERNAL,
  NOTIFICATION_AUDIENCE.EXTERNAL,
] as const;

export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];
export const DEFAULT_NOTIFICATION_AUDIENCE: NotificationAudience =
  NOTIFICATION_AUDIENCE.INTERNAL;

export const isNotificationAudience = (
  v: unknown,
): v is NotificationAudience =>
  typeof v === 'string' &&
  (NOTIFICATION_AUDIENCES as readonly string[]).includes(v);

export interface NotificationAudienceTarget {
  audience: NotificationAudience;
  targetRoleId?: string | null;
}
