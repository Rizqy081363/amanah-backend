import { NotificationAudienceTarget } from '../../../common/constants/notification-audience.constants';
import {
  NotificationCategoryType,
  NotificationSourceDomain,
} from '../notifications.constants';

type NotificationTargetType = 'user' | 'role' | 'broadcast';

interface NotificationTarget {
  type: NotificationTargetType;
  recipientUserIds?: string[];
  roles?: string[];
  roleId?: string;
  roleIds?: string[];
  excludedUserIds?: string[];
}

interface NotificationContent {
  title: string;
  body: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

export interface NotificationDispatchCommand
  extends Partial<NotificationAudienceTarget> {
  commandId: string;
  sourceDomain: NotificationSourceDomain | string;
  target: NotificationTarget;
  category: NotificationCategoryType;
  content: NotificationContent;
  channels: Array<'push' | 'in_app' | 'email'>;
  priority?: 'high' | 'normal' | 'low';
  vibrationPattern?: number[];
}
