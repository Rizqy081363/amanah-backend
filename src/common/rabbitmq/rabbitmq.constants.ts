export const RABBITMQ_CONNECTION = Symbol('RABBITMQ_CONNECTION');
export const RABBITMQ_CHANNEL = Symbol('RABBITMQ_CHANNEL');

export const NOTIFICATIONS_EXCHANGE = 'notifications.exchange';
export const NOTIFICATIONS_DLX_EXCHANGE = 'notifications.dlx';

export const NOTIFICATIONS_PUSH_QUEUE = 'notifications.push.queue';
export const NOTIFICATIONS_IN_APP_QUEUE = 'notifications.in_app.queue';
export const NOTIFICATIONS_FAILED_QUEUE = 'notifications.failed.queue';

export const ROUTING_KEY_PUSH_PATTERN = 'notifications.dispatch.*.push';
export const ROUTING_KEY_IN_APP_PATTERN = 'notifications.dispatch.*.in_app';
