import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DeliveryChannelAdapter,
  DeliveryResult,
} from '../../contracts/delivery-channel.interface';
import { RealtimeGatewayPort } from '../../contracts/realtime-gateway.interface';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import {
  NotificationChannel,
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

      await this.realtimeGateway.emitToUser(
        recipientUserId,
        REALTIME_EVENTS.NOTIFICATION_NEW,
        notification,
      );

      this.logger.debug(
        `In-app notification delivered to user ${recipientUserId} [notifId=${notification.id}, online=${isOnline}]`,
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
