import { Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AllConfigType } from '../../config/config.type';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: async (configService: ConfigService<AllConfigType>) => {
    const logger = new Logger('RedisModule');
    const redisUrl = configService.getOrThrow('cache.redisUrl', {
      infer: true,
    });
    const readinessTimeoutMs = configService.getOrThrow(
      'cache.readinessTimeoutMs',
      { infer: true },
    );
    const maxReconnectAttempts = configService.getOrThrow(
      'cache.maxReconnectAttempts',
      { infer: true },
    );

    const client = new Redis(redisUrl, {
      connectTimeout: readinessTimeoutMs,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > maxReconnectAttempts) {
          logger.error(
            `Redis reconnection stopped after ${maxReconnectAttempts} attempts.`,
          );
          return null;
        }

        return Math.min(times * 100, readinessTimeoutMs);
      },
    });

    client.on('error', (error) => {
      logger.error(`Redis client error: ${error.message}`, error.stack);
    });

    await client.connect();
    logger.log('Redis connection established.');

    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider, RedisService],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
