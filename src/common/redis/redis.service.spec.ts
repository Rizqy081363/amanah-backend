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
    eval: jest.fn(),
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
    (redisClient.get as jest.Mock).mockResolvedValue(
      JSON.stringify({ total: 3 }),
    );
    const service = new RedisService(redisClient, createConfigService());

    await expect(
      service.getJson<{ total: number }>('clinic:summary'),
    ).resolves.toEqual({ total: 3 });
  });

  it('should delete a cache prefix using scan instead of keys', async () => {
    const redisClient = createRedisClient();
    (redisClient.scan as jest.Mock)
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

  it('should allow request when within rate limit', async () => {
    const redisClient = createRedisClient();
    (redisClient.eval as jest.Mock).mockResolvedValueOnce([
      1, 10, 9, 1789661460, 0,
    ]);
    const service = new RedisService(redisClient, createConfigService());

    const result = await service.consumeRateLimit('user:123', 10, 60);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(9);
    expect(result.resetEpochSeconds).toBe(1789661460);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it('should block request and provide retryAfter when rate limit is exceeded', async () => {
    const redisClient = createRedisClient();
    (redisClient.eval as jest.Mock).mockResolvedValueOnce([
      0, 10, 0, 1789661460, 45,
    ]);
    const service = new RedisService(redisClient, createConfigService());

    const result = await service.consumeRateLimit('user:123', 10, 60);

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(0);
    expect(result.resetEpochSeconds).toBe(1789661460);
    expect(result.retryAfterSeconds).toBe(45);
  });

  it('should fail open when redis eval fails', async () => {
    const redisClient = createRedisClient();
    (redisClient.eval as jest.Mock).mockRejectedValueOnce(
      new Error('Redis connection lost'),
    );
    const service = new RedisService(redisClient, createConfigService());

    const result = await service.consumeRateLimit('user:123', 10, 60);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10);
    expect(result.remaining).toBe(10);
  });
});
