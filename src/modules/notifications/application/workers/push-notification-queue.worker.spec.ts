import { beforeEach, describe, expect, it, mock } from 'bun:test';

const sendNotificationMock = mock(() => Promise.resolve({ statusCode: 201 }));
const setVapidDetailsMock = mock(() => {});

mock.module('web-push', () => ({
  sendNotification: sendNotificationMock,
  setVapidDetails: setVapidDetailsMock,
}));

import { PushNotificationQueueWorker } from './push-notification-queue.worker';
import type { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import type { PushSubscriptionRepository } from '../../domain/repositories/push-subscription.repository';
import type { NotificationDispatchCommand } from '../../contracts/notification-dispatch.contract';

describe('PushNotificationQueueWorker', () => {
  let worker: PushNotificationQueueWorker;
  let mockRabbitMQ: {
    getChannel: ReturnType<typeof mock>;
  };
  let mockChannel: {
    prefetch: ReturnType<typeof mock>;
    consume: ReturnType<typeof mock>;
    ack: ReturnType<typeof mock>;
    nack: ReturnType<typeof mock>;
  };
  let mockPushRepo: {
    findByUserIds: ReturnType<typeof mock>;
    findAllActive: ReturnType<typeof mock>;
    deleteByEndpoint: ReturnType<typeof mock>;
  };
  let mockDb: {
    select: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    sendNotificationMock.mockReset();
    sendNotificationMock.mockImplementation(() =>
      Promise.resolve({ statusCode: 201 } as any),
    );
    setVapidDetailsMock.mockReset();

    process.env.VAPID_PUBLIC_KEY =
      'BDNgm6G2ZbM6CiUnj1X1Cnz2BlyLrcqGJVnujY2Dkf6ecz17uwPHF_LzUyWWs26BmzaDHPbBTjPE7zirNVpSyoQ';
    process.env.VAPID_PRIVATE_KEY =
      't4MO5HCKQMPvKqWt7qhkMwWbKivs1JtQzxlFjjnc_5k';
    process.env.VAPID_SUBJECT = 'mailto:admin@amanah-healthcare.local';

    mockChannel = {
      prefetch: mock(() => Promise.resolve()),
      consume: mock(() => Promise.resolve({ consumerTag: 'tag-1' })),
      ack: mock(() => {}),
      nack: mock(() => {}),
    };
    mockRabbitMQ = {
      getChannel: mock(() => mockChannel),
    };
    mockPushRepo = {
      findByUserIds: mock(() => Promise.resolve([])),
      findAllActive: mock(() => Promise.resolve([])),
      deleteByEndpoint: mock(() => Promise.resolve()),
    };
    mockDb = {
      select: mock(() => ({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
      })),
    };

    worker = new PushNotificationQueueWorker(
      mockRabbitMQ as unknown as RabbitMQService,
      mockPushRepo as unknown as PushSubscriptionRepository,
      mockDb as any,
    );
  });

  it('should initialize and attach consumer to channel', async () => {
    await worker.onModuleInit();
    expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
    expect(mockChannel.consume).toHaveBeenCalled();
  });

  it('should process push command and deliver via webpush to registered endpoints', async () => {
    mockPushRepo.findByUserIds = mock(() =>
      Promise.resolve([
        {
          id: 'sub-1',
          userId: 'user-patient-1',
          endpoint: 'https://fcm.googleapis.com/fcm/send/token123',
          p256dhKey: 'key_p256',
          authKey: 'key_auth',
          platform: 'web',
          userAgent: 'Mozilla',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );

    await worker.onModuleInit();

    const command: NotificationDispatchCommand = {
      commandId: 'cmd-call-1',
      sourceDomain: 'appointments',
      target: {
        type: 'user',
        recipientUserIds: ['user-patient-1'],
      },
      category: 'appointment',
      content: {
        title: 'Panggilan Antrean',
        body: 'Nomor antrean A-001 silakan masuk',
        actionUrl: '/dashboard/klinik/antrean',
      },
      channels: ['push'],
    };

    const consumeCallback = mockChannel.consume.mock.calls[0][1];
    await consumeCallback({
      content: Buffer.from(JSON.stringify(command)),
    });

    expect(mockPushRepo.findByUserIds).toHaveBeenCalledWith(['user-patient-1']);
    expect(sendNotificationMock).toHaveBeenCalled();
    expect(mockChannel.ack).toHaveBeenCalled();
  });

  it('should remove expired subscription if webpush returns 410 Gone', async () => {
    sendNotificationMock.mockImplementation(() =>
      Promise.reject({ statusCode: 410, message: 'Subscription has expired' }),
    );

    mockPushRepo.findByUserIds = mock(() =>
      Promise.resolve([
        {
          id: 'sub-expired',
          userId: 'user-patient-2',
          endpoint: 'https://fcm.googleapis.com/fcm/send/expired',
          p256dhKey: 'key_p256',
          authKey: 'key_auth',
          platform: 'web',
          userAgent: 'Mozilla',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    );

    await worker.onModuleInit();

    const command: NotificationDispatchCommand = {
      commandId: 'cmd-call-2',
      sourceDomain: 'appointments',
      target: {
        type: 'user',
        recipientUserIds: ['user-patient-2'],
      },
      category: 'appointment',
      content: {
        title: 'Panggilan Antrean',
        body: 'Silakan masuk',
      },
      channels: ['push'],
    };

    const consumeCallback = mockChannel.consume.mock.calls[0][1];
    await consumeCallback({
      content: Buffer.from(JSON.stringify(command)),
    });

    expect(mockPushRepo.deleteByEndpoint).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/fcm/send/expired',
    );
    expect(mockChannel.ack).toHaveBeenCalled();
  });
});
