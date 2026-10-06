import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { NotificationGatewayService } from './notification-gateway.service';
import type { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import type { NotificationDispatchCommand } from '../../contracts/notification-dispatch.contract';

describe('NotificationGatewayService', () => {
  let service: NotificationGatewayService;
  let mockRabbitMQ: { publish: ReturnType<typeof mock> };

  beforeEach(() => {
    mockRabbitMQ = {
      publish: mock(() => Promise.resolve(true)),
    };
    service = new NotificationGatewayService(
      mockRabbitMQ as unknown as RabbitMQService,
    );
  });

  it('should reject invalid command without sourceDomain or content', async () => {
    const result = await service.dispatch(null as any);
    expect(result).toBe(false);
    expect(mockRabbitMQ.publish).not.toHaveBeenCalled();
  });

  it('should publish command to RabbitMQ with topic routing key for each channel', async () => {
    const command: NotificationDispatchCommand = {
      commandId: 'cmd-123',
      sourceDomain: 'appointments',
      target: {
        type: 'user',
        recipientUserIds: ['user-1'],
      },
      category: 'appointment',
      content: {
        title: 'Panggilan Pasien',
        body: 'Nomor antrean A-001',
        actionUrl: '/dashboard/klinik/antrean',
      },
      channels: ['push', 'in_app'],
      priority: 'high',
      vibrationPattern: [300, 100, 300],
    };

    const result = await service.dispatch(command);
    expect(result).toBe(true);
    expect(mockRabbitMQ.publish).toHaveBeenCalledTimes(2);

    const calls = mockRabbitMQ.publish.mock.calls;
    expect(calls[0][0]).toBe('notifications.dispatch.appointments.push');
    expect(calls[1][0]).toBe('notifications.dispatch.appointments.in_app');
  });

  it('should default to in_app channel if channels array is empty', async () => {
    const command: NotificationDispatchCommand = {
      commandId: 'cmd-456',
      sourceDomain: 'billing',
      target: {
        type: 'role',
        roles: ['patient'],
      },
      category: 'support',
      content: {
        title: 'Tagihan Baru',
        body: 'Tagihan tersedia',
      },
      channels: [],
    };

    const result = await service.dispatch(command);
    expect(result).toBe(true);
    expect(mockRabbitMQ.publish).toHaveBeenCalledTimes(1);
    expect(mockRabbitMQ.publish.mock.calls[0][0]).toBe(
      'notifications.dispatch.billing.in_app',
    );
  });
});
