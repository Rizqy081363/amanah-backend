import { NotificationEntity } from '../entities/notification.entity';

export { NOTIFICATION_REPOSITORY } from '../../notifications.constants';

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

  abstract createNotification(data: {
    category:
      | 'clinical'
      | 'system'
      | 'announcement'
      | 'billing'
      | 'schedule'
      | 'attendance'
      | 'permission'
      | 'appointment'
      | 'promotion'
      | 'lab_result'
      | 'queue'
      | 'shift'
      | 'pharmacy'
      | 'telemedicine'
      | 'support'
      | string;
    title?: string;
    body: string;
    senderName?: string;
    senderRole?: string;
    isUrgent?: boolean;
    recipientUserIds: string[];
    actions?: Array<{
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
    }>;
  }): Promise<NotificationEntity>;

  abstract createIfNotExists(data: {
    idempotencyKey?: string;
    category: string;
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
    actions?: Array<{
      label: string;
      actionKey: string;
      actionType?: string;
      url?: string;
    }>;
  }): Promise<NotificationEntity | null>;
}
