import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../../common/redis/redis.constants';
import { DomainEvent } from '../../contracts/domain-event.interface';
import {
  REDIS_CONSUMER_GROUP_NOTIFICATIONS,
  REDIS_STREAM_NOTIFICATIONS,
} from '../../notifications.constants';
import { NotificationOrchestratorService } from '../services/notification-orchestrator.service';

@Injectable()
export class NotificationStreamWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamWorker.name);
  private isRunning = false;
  private readonly consumerName =
    `worker-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;

  constructor(
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
    private readonly orchestrator: NotificationOrchestratorService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redisClient) {
      this.logger.warn(
        'Redis client is not configured; NotificationStreamWorker is disabled.',
      );
      return;
    }

    try {
      await this.redisClient.xgroup(
        'CREATE',
        REDIS_STREAM_NOTIFICATIONS,
        REDIS_CONSUMER_GROUP_NOTIFICATIONS,
        '0',
        'MKSTREAM',
      );
      this.logger.log(
        `Created Redis stream consumer group "${REDIS_CONSUMER_GROUP_NOTIFICATIONS}" on "${REDIS_STREAM_NOTIFICATIONS}".`,
      );
    } catch (error: any) {
      if (error?.message?.includes('BUSYGROUP')) {
        this.logger.debug(
          `Redis stream consumer group "${REDIS_CONSUMER_GROUP_NOTIFICATIONS}" already exists.`,
        );
      } else {
        this.logger.warn(
          `Failed to initialize Redis stream consumer group: ${error?.message || error}`,
        );
      }
    }

    this.isRunning = true;
    void this.runLoop();
  }

  onModuleDestroy(): void {
    this.isRunning = false;
    this.logger.log(
      `Notification stream worker [${this.consumerName}] stopped.`,
    );
  }

  private async runLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const response = await (this.redisClient as any).xreadgroup(
          'GROUP',
          REDIS_CONSUMER_GROUP_NOTIFICATIONS,
          this.consumerName,
          'BLOCK',
          2000,
          'COUNT',
          10,
          'STREAMS',
          REDIS_STREAM_NOTIFICATIONS,
          '>',
        );

        if (!response || !Array.isArray(response) || response.length === 0) {
          continue;
        }

        for (const [, messages] of response as [
          string,
          [string, string[]][],
        ][]) {
          for (const [messageId, fields] of messages) {
            try {
              const eventIndex = fields.indexOf('event');
              if (eventIndex !== -1 && fields[eventIndex + 1]) {
                const eventPayload = JSON.parse(
                  fields[eventIndex + 1],
                ) as DomainEvent;
                await this.orchestrator.processEvent(eventPayload);
              }

              await this.redisClient.xack(
                REDIS_STREAM_NOTIFICATIONS,
                REDIS_CONSUMER_GROUP_NOTIFICATIONS,
                messageId,
              );
            } catch (msgError) {
              this.logger.error(
                `Failed to process stream message ${messageId}: ${msgError}`,
              );
            }
          }
        }
      } catch (loopError: any) {
        if (!this.isRunning) break;
        this.logger.warn(
          `Redis stream polling error: ${loopError?.message || loopError}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}
