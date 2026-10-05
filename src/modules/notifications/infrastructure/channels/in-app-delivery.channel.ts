import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DeliveryChannelAdapter,
  DeliveryResult,
} from '../../contracts/delivery-channel.interface';
import { RealtimeGatewayPort } from '../../contracts/realtime-gateway.interface';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import {
  NotificationChannel,
  NotificationEnvelopeV2,
  REALTIME_EVENTS,
  REALTIME_GATEWAY_PORT,
} from '../../notifications.constants';

@Injectable()
export class InAppDeliveryChannel implements DeliveryChannelAdapter {
  private readonly logger = new Logger(InAppDeliveryChannel.name);
  readonly channel: NotificationChannel = 'in_app';

  constructor(
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway: RealtimeGatewayPort,
  ) {}

  async deliver(
    notification: NotificationEntity,
    recipientUserId: string,
  ): Promise<DeliveryResult> {
    try {
      const isOnline = this.realtimeGateway.isUserOnline(recipientUserId);

      const envelope: NotificationEnvelopeV2 = {
        schemaVersion: 2,
        id: notification.id,
        eventId: notification.metadata?.eventId || notification.id,
        correlationId: notification.metadata?.correlationId,
        audience:
          (notification.audience as 'patient' | 'clinic') ||
          (notification.metadata?.audience as 'patient' | 'clinic') ||
          'clinic',
        recipientUserId,
        type: notification.metadata?.eventType || notification.category,
        title: notification.title || '',
        body: notification.body,
        severity: notification.isUrgent ? 'warning' : 'info',
        action: notification.metadata?.semanticAction || undefined,
        actions: notification.actions,
        presentation: {
          toast: notification.metadata?.presentationToast !== false,
        },
        createdAt: notification.createdAt,
        badgeIcon: notification.badgeIcon,
        metaIcon: notification.metaIcon,
        visualKey: notification.visualKey,
        senderName: notification.senderName,
        senderRole: notification.senderRole,
      };

      await this.realtimeGateway.emitToUser(
        recipientUserId,
        REALTIME_EVENTS.NOTIFICATION_NEW,
        envelope,
      );

      this.logger.log(
        `In-app notification delivered to user ${recipientUserId} [notifId=${notification.id}, audience=${envelope.audience}, toast=${envelope.presentation.toast}, online=${isOnline}]`,
      );

      return {
        channel: this.channel,
        status: 'delivered',
        metadata: {
          online: isOnline,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to deliver in-app notification to user ${recipientUserId}: ${error}`,
      );
      return {
        channel: this.channel,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

