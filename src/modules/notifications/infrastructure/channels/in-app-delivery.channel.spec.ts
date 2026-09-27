import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { InAppDeliveryChannel } from './in-app-delivery.channel';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { REALTIME_EVENTS } from '../../notifications.constants';

describe('InAppDeliveryChannel', () => {
  let channel: InAppDeliveryChannel;
  let mockRealtimeGateway: any;

  beforeEach(() => {
    mockRealtimeGateway = {
      emitToUser: mock().mockResolvedValue(true),
      isUserOnline: mock().mockReturnValue(true),
      getConnectedUserCount: mock().mockReturnValue(1),
    };

    channel = new InAppDeliveryChannel(mockRealtimeGateway);
  });

  it('should deliver notification to user via RealtimeGatewayPort', async () => {
    const notification: NotificationEntity = {
      id: 'notif-1',
      category: 'appointment',
      title: 'Antrian Dipanggil',
      body: 'Silakan menuju Poli Umum.',
      isUrgent: true,
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
      isRead: false,
    };

    const result = await channel.deliver(notification, 'user-patient-1');

    expect(result.channel).toBe('in_app');
    expect(result.status).toBe('delivered');
    expect(result.metadata?.online).toBe(true);
    expect(mockRealtimeGateway.emitToUser).toHaveBeenCalledWith(
      'user-patient-1',
      REALTIME_EVENTS.NOTIFICATION_NEW,
      notification,
    );
  });

  it('should report failure if RealtimeGatewayPort throws', async () => {
    mockRealtimeGateway.emitToUser.mockRejectedValue(new Error('Gateway socket dead'));

    const notification: NotificationEntity = {
      id: 'notif-2',
      category: 'system',
      body: 'Maintenance server',
      isUrgent: false,
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
      isRead: false,
    };

    const result = await channel.deliver(notification, 'user-patient-1');

    expect(result.channel).toBe('in_app');
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Gateway socket dead');
  });
});
