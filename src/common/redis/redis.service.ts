import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AllConfigType } from '../../config/config.type';
import { REDIS_CLIENT } from './redis.constants';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetEpochSeconds: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly keyPrefix: string;
  private readonly defaultTtlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: Redis,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    this.keyPrefix = this.configService.getOrThrow('cache.keyPrefix', {
      infer: true,
    });
    this.defaultTtlSeconds = this.configService.getOrThrow(
      'cache.defaultTtlSeconds',
      { infer: true },
    );
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.redisClient.status === 'ready') {
        await this.redisClient.quit();
        return;
      }

      if (this.redisClient.status !== 'end') {
        this.redisClient.disconnect();
      }
    } catch (error) {
      this.logger.warn(`Redis shutdown failed: ${this.getErrorMessage(error)}`);
    }
  }

  async ping(): Promise<'PONG'> {
    return this.redisClient.ping();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const cacheKey = this.buildKey(key);

    try {
      const cachedValue = await this.redisClient.get(cacheKey);

      if (!cachedValue) {
        return null;
      }

      return JSON.parse(cachedValue) as T;
    } catch (error) {
      this.logger.warn(
        `Cache read skipped for "${key}": ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async setJson<T>(
    key: string,
    value: T,
    ttlSeconds = this.defaultTtlSeconds,
  ): Promise<void> {
    const cacheKey = this.buildKey(key);
    this.assertPositiveTtl(ttlSeconds);

    try {
      await this.redisClient.set(
        cacheKey,
        JSON.stringify(value),
        'EX',
        ttlSeconds,
      );
    } catch (error) {
      this.logger.warn(
        `Cache write skipped for "${key}": ${this.getErrorMessage(error)}`,
      );
    }
  }

  async setNx(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const cacheKey = this.buildKey(key);
    this.assertPositiveTtl(ttlSeconds);

    try {
      const result = await this.redisClient.set(
        cacheKey,
        value,
        'EX',
        ttlSeconds,
        'NX',
      );
      return result === 'OK';
    } catch (error) {
      this.logger.warn(
        `Cache setNx failed for "${key}": ${this.getErrorMessage(error)}`,
      );
      return false;
    }
  }

  async getString(key: string): Promise<string | null> {
    const cacheKey = this.buildKey(key);

    try {
      return await this.redisClient.get(cacheKey);
    } catch (error) {
      this.logger.warn(
        `Cache read string failed for "${key}": ${this.getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async setString(
    key: string,
    value: string,
    ttlSeconds = this.defaultTtlSeconds,
  ): Promise<void> {
    const cacheKey = this.buildKey(key);
    this.assertPositiveTtl(ttlSeconds);

    try {
      await this.redisClient.set(cacheKey, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Cache setString failed for "${key}": ${this.getErrorMessage(error)}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    const cacheKey = this.buildKey(key);

    try {
      await this.redisClient.del(cacheKey);
    } catch (error) {
      this.logger.warn(
        `Cache delete skipped for "${key}": ${this.getErrorMessage(error)}`,
      );
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    this.assertCacheKey(prefix);

    try {
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.redisClient.scan(
          cursor,
          'MATCH',
          `${this.buildKey(prefix)}*`,
          'COUNT',
          100,
        );

        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }

        cursor = nextCursor;
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        `Cache prefix delete skipped for "${prefix}": ${this.getErrorMessage(
          error,
        )}`,
      );
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds = this.defaultTtlSeconds,
  ): Promise<T> {
    const cached = await this.getJson<T>(key);

    if (cached !== null) {
      return cached;
    }

    const fresh = await factory();

    if (fresh !== null && fresh !== undefined) {
      await this.setJson(key, fresh, ttlSeconds);
    }

    return fresh;
  }

  async get<T>(key: string): Promise<T | null> {
    return this.getJson<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.setJson(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.delete(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
    await this.deleteByPrefix(prefix);
  }

  async addKeyToTag(
    tag: string,
    key: string,
    ttlSeconds = this.defaultTtlSeconds,
  ): Promise<void> {
    const tagKey = this.buildKey(`tag:${tag}`);
    try {
      await this.redisClient.sadd(tagKey, key);
      await this.redisClient.expire(tagKey, ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Failed to add key "${key}" to tag "${tag}": ${this.getErrorMessage(error)}`,
      );
    }
  }

  async invalidateTags(...tags: string[]): Promise<void> {
    if (!tags || tags.length === 0) return;

    try {
      for (const tag of tags) {
        const tagKey = this.buildKey(`tag:${tag}`);
        const members = await this.redisClient.smembers(tagKey);

        if (members.length > 0) {
          const keysToDelete = members.map((k) => this.buildKey(k));
          await this.redisClient.del(...keysToDelete);
        }

        await this.redisClient.del(tagKey);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to invalidate tags "${tags.join(',')}": ${this.getErrorMessage(error)}`,
      );
    }
  }

  async consumeRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const cacheKey = this.buildKey(`ratelimit:${key}`);
    const now = Date.now();
    const member = `${now}:${randomUUID().substring(0, 8)}`;

    const luaScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowSeconds = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

local clearBefore = now - (windowSeconds * 1000)
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
local currentCount = redis.call('ZCARD', key)

if currentCount < limit then
    redis.call('ZADD', key, now, member)
    redis.call('EXPIRE', key, windowSeconds + 1)
    local remaining = limit - (currentCount + 1)
    local resetEpoch = math.ceil((now + (windowSeconds * 1000)) / 1000)
    return { 1, limit, remaining, resetEpoch, 0 }
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local resetTime = now + (windowSeconds * 1000)
    if oldest and oldest[2] then
        resetTime = tonumber(oldest[2]) + (windowSeconds * 1000)
    end
    local retryAfter = math.max(1, math.ceil((resetTime - now) / 1000))
    local resetEpoch = math.ceil(resetTime / 1000)
    return { 0, limit, 0, resetEpoch, retryAfter }
end
`;

    try {
      const result = (await this.redisClient.eval(
        luaScript,
        1,
        cacheKey,
        now.toString(),
        windowSeconds.toString(),
        limit.toString(),
        member,
      )) as [number, number, number, number, number];

      const [allowedNum, limitNum, remainingNum, resetEpochNum, retryAfterNum] =
        result;

      return {
        allowed: allowedNum === 1,
        limit: Number(limitNum),
        remaining: Number(remainingNum),
        resetEpochSeconds: Number(resetEpochNum),
        retryAfterSeconds: Number(retryAfterNum),
      };
    } catch (error) {
      this.logger.warn(
        `Rate limit evaluation failed for "${key}", failing open: ${this.getErrorMessage(error)}`,
      );
      return {
        allowed: true,
        limit,
        remaining: limit,
        resetEpochSeconds: Math.ceil((now + windowSeconds * 1000) / 1000),
        retryAfterSeconds: 0,
      };
    }
  }

  private buildKey(key: string): string {
    this.assertCacheKey(key);
    return `${this.keyPrefix}:${key}`;
  }

  private assertCacheKey(key: string): void {
    if (key.trim().length === 0) {
      throw new Error('Cache key must not be blank.');
    }
  }

  private assertPositiveTtl(ttlSeconds: number): void {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('Cache TTL must be a positive integer.');
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
