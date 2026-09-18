import { registerAs } from '@nestjs/config';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import validateConfig from '../utils/validate-config';
import { CacheConfig } from './cache-config.type';

class EnvironmentVariablesValidator {
  @IsUrl(
    { protocols: ['redis', 'rediss'], require_tld: false },
    { message: 'CACHE_REDIS_URL must be a redis:// or rediss:// URL' },
  )
  @IsOptional()
  CACHE_REDIS_URL: string;

  @IsUrl(
    { protocols: ['redis', 'rediss'], require_tld: false },
    { message: 'WORKER_HOST must be a redis:// or rediss:// URL' },
  )
  @IsOptional()
  WORKER_HOST: string;

  @IsString()
  @IsOptional()
  REDIS_HOST: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  REDIS_HOST_PORT: number;

  @IsString()
  @IsOptional()
  CACHE_KEY_PREFIX: string;

  @IsInt()
  @Min(1)
  @Max(86_400)
  @IsOptional()
  CACHE_DEFAULT_TTL_SECONDS: number;

  @IsInt()
  @Min(100)
  @Max(30_000)
  @IsOptional()
  CACHE_READINESS_TIMEOUT_MS: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  CACHE_MAX_RECONNECT_ATTEMPTS: number;
}

const getRedisUrl = (): string => {
  if (process.env.CACHE_REDIS_URL?.trim()) {
    return process.env.CACHE_REDIS_URL;
  }

  if (process.env.WORKER_HOST?.trim()) {
    return process.env.WORKER_HOST;
  }

  const host = process.env.REDIS_HOST || 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const port = isLocalHost
    ? (process.env.REDIS_HOST_PORT || process.env.REDIS_PORT || '6379')
    : (process.env.REDIS_PORT || '6379');

  return `redis://${host}:${port}/1`;
};

export default registerAs<CacheConfig>('cache', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    redisUrl: getRedisUrl(),
    keyPrefix: process.env.CACHE_KEY_PREFIX || 'amanah:local',
    defaultTtlSeconds: process.env.CACHE_DEFAULT_TTL_SECONDS
      ? parseInt(process.env.CACHE_DEFAULT_TTL_SECONDS, 10)
      : 300,
    readinessTimeoutMs: process.env.CACHE_READINESS_TIMEOUT_MS
      ? parseInt(process.env.CACHE_READINESS_TIMEOUT_MS, 10)
      : 1_000,
    maxReconnectAttempts: process.env.CACHE_MAX_RECONNECT_ATTEMPTS
      ? parseInt(process.env.CACHE_MAX_RECONNECT_ATTEMPTS, 10)
      : 10,
  };
});
