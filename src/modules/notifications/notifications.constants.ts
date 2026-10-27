export const NOTIFICATION_REPOSITORY = Symbol.for('NOTIFICATION_REPOSITORY');
export const NOTIFICATION_PUBLISHER = Symbol.for('NOTIFICATION_PUBLISHER');
export const REALTIME_GATEWAY_PORT = Symbol.for('REALTIME_GATEWAY_PORT');
export const NOTIFICATION_RULES_REGISTRY = Symbol.for(
  'NOTIFICATION_RULES_REGISTRY',
);
export const DEVICE_SUBSCRIPTION_REPOSITORY = Symbol.for(
  'DEVICE_SUBSCRIPTION_REPOSITORY',
);
export const DELIVERY_CHANNEL_ADAPTERS = Symbol.for(
  'DELIVERY_CHANNEL_ADAPTERS',
);

export const REDIS_STREAM_NOTIFICATIONS = 'notifications:events';
export const REDIS_CONSUMER_GROUP_NOTIFICATIONS = 'notification-service';

const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_SOURCE_DOMAINS = {
  ATTENDANCE: 'attendance',
  PAYROLL: 'payroll',
  LEAVE: 'leave',
  REPLACEMENT: 'replacement',
  QUEUE: 'queue',
  APPOINTMENT: 'appointment',
  CLINICAL: 'clinical',
} as const;
export type NotificationSourceDomain =
  (typeof NOTIFICATION_SOURCE_DOMAINS)[keyof typeof NOTIFICATION_SOURCE_DOMAINS];

const NOTIFICATION_CATEGORIES = [
  'appointment',
  'promotion',
  'lab_result',
  'queue',
  'clinical',
  'shift',
  'pharmacy',
  'telemedicine',
  'support',
  'system',
] as const;
export type NotificationCategoryType = (typeof NOTIFICATION_CATEGORIES)[number];

export const REALTIME_EVENTS = {
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',
  NOTIFICATION_UNREAD_COUNT: 'notification:unread_count',
} as const;

export const REALTIME_ROOMS = {
  user: (userId: string) => `user:${userId}`,
  role: (roleName: string) => `role:${roleName.toLowerCase()}`,
  clinic: 'room:clinic',
} as const;

export interface NotificationEnvelopeV2 {
  schemaVersion: 2;
  id: string;
  eventId: string;
  correlationId?: string;
  audience: 'patient' | 'clinic';
  recipientUserId: string;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  action?: { type: string; params: Record<string, string>; label?: string };
  actions?: Array<{
    label: string;
    actionKey: string;
    actionType?: string | null;
    url?: string | null;
  }>;
  presentation: { toast: boolean };
  createdAt: string;
  badgeIcon?: string | null;
  metaIcon?: string | null;
  visualKey?: string | null;
  senderName?: string | null;
  senderRole?: string | null;
}
