import { Global, Module, Provider, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';

const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const logger = new Logger('RedisModule');
    const host = configService.get<string>('REDIS_HOST') || 'localhost';
    const port = Number(configService.get<number>('REDIS_PORT')) || 6379;
    const password = configService.get<string>('REDIS_PASSWORD');

    const client = new Redis({
      host,
      port,
      ...(password ? { password } : {}),
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.warn('Redis reconnection stopped after 3 attempts.');
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    });

    client.connect().catch((err) => {
      logger.warn(`Redis connection failed (${err.message}). Caching disabled.`);
    });

    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider, RedisService],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
