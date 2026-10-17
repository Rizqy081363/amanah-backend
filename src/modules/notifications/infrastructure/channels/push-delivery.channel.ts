import { Injectable, Logger } from '@nestjs/common';
import {
  DeliveryChannelAdapter,
  DeliveryResult,
} from '../../contracts/delivery-channel.interface';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { NotificationGatewayService } from '../../application/services/notification-gateway.service';
import { NotificationChannel } from '../../notifications.constants';

@Injectable()
export class PushDeliveryChannel implements DeliveryChannelAdapter {
  private readonly logger = new Logger(PushDeliveryChannel.name);
  readonly channel: NotificationChannel = 'push';

  constructor(
    private readonly notificationGateway: NotificationGatewayService,
  ) {}

  async deliver(
    notification: NotificationEntity,
    recipientUserId: string,
  ): Promise<DeliveryResult> {
    try {
      const dispatched = await this.notificationGateway.dispatch({
        commandId: `push-${notification.id}-${recipientUserId}`,
        sourceDomain: notification.sourceType || 'appointments',
        target: {
          type: 'user',
          recipientUserIds: [recipientUserId],
        },
        category: (notification.category as any) || 'appointment',
        content: {
          title: notification.title || 'Pemberitahuan Klinik Amanah',
          body: notification.body,
          actionUrl: notification.metadata?.semanticAction?.params?.appointmentId
            ? `/dashboard/klinik/antrean?appointmentId=${notification.metadata.semanticAction.params.appointmentId}`
            : '/dashboard',
          data: {
            notificationId: notification.id,
            category: notification.category,
            audience: notification.audience,
            ...(notification.metadata || {}),
          },
        },
        channels: ['push'],
        priority: notification.isUrgent ? 'high' : 'normal',
        vibrationPattern: [300, 100, 300, 100, 300],
      });

      this.logger.log(
        `Push notification queued for user ${recipientUserId} [notifId=${notification.id}, dispatched=${dispatched}]`,
      );

      return {
        channel: this.channel,
        status: dispatched ? 'delivered' : 'failed',
      };
    } catch (err: any) {
      this.logger.error(
        `Failed to deliver push notification to user ${recipientUserId}: ${String(err?.message || err)}`,
      );
      return {
        channel: this.channel,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
