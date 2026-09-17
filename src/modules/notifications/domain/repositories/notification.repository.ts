import { NotificationEntity } from '../entities/notification.entity';

export const NOTIFICATION_REPOSITORY = Symbol('NOTIFICATION_REPOSITORY');

export interface NotificationRepository {
  findMyNotifications(
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

  markAsRead(notificationId: string, userId: string): Promise<boolean>;

  markAllAsRead(userId: string): Promise<number>;

  createNotification(data: {
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
}
