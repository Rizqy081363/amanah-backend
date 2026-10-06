export interface PushNotificationPayload {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export const PUSH_NOTIFICATION_PORT = Symbol('PUSH_NOTIFICATION_PORT');

export interface PushNotificationPort {
  sendPush(payload: PushNotificationPayload): Promise<void>;
}
