import {
  NotificationCategoryType,
  NotificationSourceDomain,
} from '../notifications.constants';

export type NotificationTargetType = 'user' | 'role' | 'broadcast';

export interface NotificationTarget {
  type: NotificationTargetType;
  recipientUserIds?: string[];
  roles?: string[];
  excludedUserIds?: string[];
}

export interface NotificationContent {
  title: string;
  body: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

export interface NotificationDispatchCommand {
  commandId: string;
  sourceDomain: NotificationSourceDomain | string;
  target: NotificationTarget;
  category: NotificationCategoryType;
  content: NotificationContent;
  channels: Array<'push' | 'in_app' | 'email'>;
  priority?: 'high' | 'normal' | 'low';
  vibrationPattern?: number[];
}
