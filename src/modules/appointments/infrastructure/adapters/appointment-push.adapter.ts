import { Injectable, Logger } from '@nestjs/common';
import { NotificationGatewayService } from '../../../../modules/notifications/application/services/notification-gateway.service';
import type {
  PushNotificationPayload,
  PushNotificationPort,
} from '../../application/ports/push-notification.port';

@Injectable()
export class AppointmentPushAdapter implements PushNotificationPort {
  private readonly logger = new Logger(AppointmentPushAdapter.name);

  constructor(
    private readonly notificationGateway: NotificationGatewayService,
  ) {}

  async sendPush(payload: PushNotificationPayload): Promise<void> {
    try {
      await this.notificationGateway.dispatch({
        commandId: `apt-call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        sourceDomain: 'appointments',
        target: {
          type: 'user',
          recipientUserIds: [payload.userId],
        },
        category: 'appointment',
        content: {
          title: payload.title,
          body: payload.body,
          actionUrl: `/klinik/antrean?appointmentId=${payload.data?.appointmentId || ''}`,
          data: payload.data,
        },
        channels: ['push', 'in_app'],
        priority: 'high',
        vibrationPattern: [300, 100, 300, 100, 300],
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to dispatch push notification: ${String(err?.message || err)}`,
      );
    }
  }
}
