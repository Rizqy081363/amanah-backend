import { NotificationEntity } from '../domain/entities/notification.entity';
import { NotificationChannel } from '../notifications.constants';

export interface DeliveryResult {
  channel: NotificationChannel;
  status: 'delivered' | 'queued' | 'skipped' | 'failed';
  error?: string;
  metadata?: Record<string, unknown>;
}

export abstract class DeliveryChannelAdapter {
  abstract readonly channel: NotificationChannel;
  abstract deliver(
    notification: NotificationEntity,
    recipientUserId: string,
  ): Promise<DeliveryResult>;
}
