import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { DomainEvent } from '../../contracts/domain-event.interface';
import { REDIS_STREAM_NOTIFICATIONS } from '../../notifications.constants';
import { RedisStreamsPublisher } from './redis-streams.publisher';

describe('RedisStreamsPublisher', () => {
  let publisher: RedisStreamsPublisher;
  let mockRedis: any;
  let mockEventEmitter: any;

  beforeEach(() => {
    mockRedis = {
      xadd: mock().mockResolvedValue('1790000000000-0'),
    };
    mockEventEmitter = {
      emit: mock().mockReturnValue(true),
    };

    publisher = new RedisStreamsPublisher(
      mockRedis as unknown as Redis,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('should publish domain event to Redis Streams and local event emitter', async () => {
    const event: DomainEvent<{ appointmentId: string }> = {
      eventId: 'evt-uuid-1',
      eventType: 'appointment.created.v1',
      version: 1,
      module: 'appointments',
      occurredAt: '2026-09-27T06:00:00.000Z',
      payload: { appointmentId: 'apt-123' },
    };

    await publisher.publish(event);

    expect(mockRedis.xadd).toHaveBeenCalledWith(
      REDIS_STREAM_NOTIFICATIONS,
      '*',
      'event',
      JSON.stringify(event),
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'appointment.created.v1',
      event,
    );
  });
});
