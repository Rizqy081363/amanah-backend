import { Inject, Injectable, Logger } from '@nestjs/common';
import { SocketIoRealtimeGateway } from '../../../../modules/notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { REALTIME_GATEWAY_PORT } from '../../../../modules/notifications/notifications.constants';
import type {
  PushNotificationPayload,
  PushNotificationPort,
} from '../../application/ports/push-notification.port';

@Injectable()
export class AppointmentPushAdapter implements PushNotificationPort {
  private readonly logger = new Logger(AppointmentPushAdapter.name);

  constructor(
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway: SocketIoRealtimeGateway,
  ) {}

  async sendPush(payload: PushNotificationPayload): Promise<void> {
    try {
      await this.realtimeGateway.emitToUser(
        payload.userId,
        'notification.patient_called',
        {
          title: payload.title,
          body: payload.body,
          data: payload.data,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch push notification: ${err.message}`);
    }
  }
}
