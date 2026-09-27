import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../common/redis/redis.constants';
import {
  DomainEvent,
  NotificationPublisher,
} from '../../contracts/domain-event.interface';
import { REDIS_STREAM_NOTIFICATIONS } from '../../notifications.constants';

@Injectable()
export class RedisStreamsPublisher implements NotificationPublisher {
  private readonly logger = new Logger(RedisStreamsPublisher.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    const serialized = JSON.stringify(event);

    try {
      // 1. Durable handoff to Redis Streams (Doc 1 §3.2, Doc 4 §5)
      const streamMessageId = await this.redisClient.xadd(
        REDIS_STREAM_NOTIFICATIONS,
        '*',
        'event',
        serialized,
      );

      this.logger.debug(
        `Published domain event "${event.eventType}" [id: ${event.eventId}] to Redis stream "${REDIS_STREAM_NOTIFICATIONS}" (streamId: ${streamMessageId})`,
      );
    } catch (redisError) {
      this.logger.warn(
        `Failed to publish event "${event.eventType}" [id: ${event.eventId}] to Redis Stream, falling back to in-process dispatch: ${String(redisError)}`,
      );
    }

    // 2. Local in-process event emit for immediate modular listeners
    try {
      this.eventEmitter.emit(event.eventType, event);
    } catch (emitError) {
      this.logger.error(
        `Local event emitter failed for "${event.eventType}": ${String(emitError)}`,
      );
    }
  }
}
