import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AllConfigType } from '../../config/config.type';
import { RedisService } from './redis.service';

const createConfigService = () =>
  ({
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        'cache.keyPrefix': 'amanah:test',
        'cache.defaultTtlSeconds': 60,
      };

      return values[key];
    }),
  }) as unknown as ConfigService<AllConfigType>;

const createRedisClient = () =>
  ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    scan: jest.fn(),
    ping: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    status: 'ready',
  }) as unknown as Redis;

describe('RedisService', () => {
  it('should store JSON with the configured key prefix and default TTL', async () => {
    const redisClient = createRedisClient();
    const service = new RedisService(redisClient, createConfigService());

    await service.setJson('clinic:summary', { total: 3 });

    expect(redisClient.set).toHaveBeenCalledWith(
      'amanah:test:clinic:summary',
      JSON.stringify({ total: 3 }),
      'EX',
      60,
    );
  });

  it('should parse cached JSON values', async () => {
    const redisClient = createRedisClient();
    jest
      .mocked(redisClient.get)
      .mockResolvedValue(JSON.stringify({ total: 3 }));
    const service = new RedisService(redisClient, createConfigService());

    await expect(
      service.getJson<{ total: number }>('clinic:summary'),
    ).resolves.toEqual({ total: 3 });
  });

  it('should delete a cache prefix using scan instead of keys', async () => {
    const redisClient = createRedisClient();
    jest
      .mocked(redisClient.scan)
      .mockResolvedValueOnce([
        '19',
        ['amanah:test:clinic:a', 'amanah:test:clinic:b'],
      ])
      .mockResolvedValueOnce(['0', []]);
    const service = new RedisService(redisClient, createConfigService());

    await service.deleteByPrefix('clinic:');

    expect(redisClient.scan).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'amanah:test:clinic:*',
      'COUNT',
      100,
    );
    expect(redisClient.del).toHaveBeenCalledWith(
      'amanah:test:clinic:a',
      'amanah:test:clinic:b',
    );
  });
});
