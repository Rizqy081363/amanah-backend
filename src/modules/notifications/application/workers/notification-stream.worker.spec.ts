import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { NotificationStreamWorker } from './notification-stream.worker';
import { DomainEvent } from '../../contracts/domain-event.interface';
import {
  REDIS_CONSUMER_GROUP_NOTIFICATIONS,
  REDIS_STREAM_NOTIFICATIONS,
} from '../../notifications.constants';

describe('NotificationStreamWorker', () => {
  let worker: NotificationStreamWorker;
  let mockRedisClient: any;
  let mockOrchestrator: any;

  beforeEach(() => {
    mockRedisClient = {
      xgroup: mock().mockResolvedValue('OK'),
      xreadgroup: mock(),
      xack: mock().mockResolvedValue(1),
    };
    mockOrchestrator = {
      processEvent: mock().mockResolvedValue(undefined),
    };

    worker = new NotificationStreamWorker(
      mockRedisClient,
      mockOrchestrator,
    );
  });

  it('should initialize consumer group and handle BUSYGROUP cleanly', async () => {
    mockRedisClient.xgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));

    // Should not throw
    await worker.onModuleInit();

    expect(mockRedisClient.xgroup).toHaveBeenCalledWith(
      'CREATE',
      REDIS_STREAM_NOTIFICATIONS,
      REDIS_CONSUMER_GROUP_NOTIFICATIONS,
      '0',
      'MKSTREAM',
    );

    worker.onModuleDestroy();
  });

  it('should not throw if redisClient is undefined', async () => {
    const workerNoRedis = new NotificationStreamWorker(
      undefined as any,
      mockOrchestrator,
    );

    await workerNoRedis.onModuleInit();
    workerNoRedis.onModuleDestroy();
  });
});
