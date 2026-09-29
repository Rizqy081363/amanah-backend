export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');
export const NOTIFICATION_PUBLISHER = Symbol('NOTIFICATION_PUBLISHER');
export const REALTIME_GATEWAY_PORT = Symbol('REALTIME_GATEWAY_PORT');
export const NOTIFICATION_RULES_REGISTRY = Symbol(
  'NOTIFICATION_RULES_REGISTRY',
);
export const DELIVERY_CHANNEL_ADAPTERS = Symbol('DELIVERY_CHANNEL_ADAPTERS');

export const REDIS_STREAM_NOTIFICATIONS = 'notifications:events';
export const REDIS_CONSUMER_GROUP_NOTIFICATIONS = 'notification-service';

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CATEGORIES = [
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
} as const;
