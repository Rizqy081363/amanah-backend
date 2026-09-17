export class NotificationActionEntity {
  id: string;
  notificationId: string;
  label: string;
  actionKey: string;
  actionType: string;
  icon?: string | null;
  url?: string | null;
  metadata?: Record<string, any>;
  createdAt: string;
}

export class NotificationRecipientEntity {
  id: string;
  notificationId: string;
  userId: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  dismissedAt?: string | null;
  createdAt: string;
}

export class NotificationEntity {
  id: string;
  category: string;
  title?: string | null;
  senderName?: string | null;
  senderRole?: string | null;
  badgeIcon?: string | null;
  metaIcon?: string | null;
  visualKey?: string | null;
  body: string;
  isUrgent: boolean;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, any>;
  createdBy?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;

  // Recipient status for the querying user
  recipient?: NotificationRecipientEntity | null;
  isRead?: boolean;
  actions?: NotificationActionEntity[];
}
