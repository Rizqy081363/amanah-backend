import { NotificationAudienceTarget } from '../../../../common/constants/notification-audience.constants';
import {
  NotificationCategoryType,
  NOTIFICATION_REPOSITORY,
} from '../../notifications.constants';
import { NotificationEntity } from '../entities/notification.entity';

export { NOTIFICATION_REPOSITORY };

export interface NotificationActionInput {
  label: string;
  actionKey: string;
  actionType?:
    | 'primary'
    | 'secondary'
    | 'warning'
    | 'info'
    | 'danger'
    | 'link'
    | string;
  url?: string;
}

export interface CreateNotificationInput
  extends Partial<NotificationAudienceTarget> {
  category: NotificationCategoryType | string;
  title?: string;
  body: string;
  senderName?: string;
  senderRole?: string;
  isUrgent?: boolean;
  recipientUserIds: string[];
  actions?: NotificationActionInput[];
}

export interface CreateIfNotExistsInput
  extends Partial<NotificationAudienceTarget> {
  idempotencyKey?: string;
  category: NotificationCategoryType | string;
  title?: string | null;
  body: string;
  senderName?: string | null;
  senderRole?: string | null;
  badgeIcon?: string | null;
  metaIcon?: string | null;
  visualKey?: string | null;
  isUrgent?: boolean;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, any>;
  recipientUserIds: string[];
  actions?: NotificationActionInput[];
}

export abstract class NotificationRepository {
  abstract findMyNotifications(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    },
  ): Promise<{
    data: NotificationEntity[];
    total: number;
    unreadCount: number;
  }>;

  abstract markAsRead(notificationId: string, userId: string): Promise<boolean>;

  abstract markAllAsRead(userId: string): Promise<number>;

  abstract createNotification(
    data: CreateNotificationInput,
  ): Promise<NotificationEntity>;

  abstract createIfNotExists(
    data: CreateIfNotExistsInput,
  ): Promise<NotificationEntity | null>;
}
