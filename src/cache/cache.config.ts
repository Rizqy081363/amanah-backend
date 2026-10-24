import { registerAs } from '@nestjs/config';
import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';
import { env } from '../config/env';
import validateConfig from '../utils/validate-config';
import { CacheConfig } from './cache-config.type';

class EnvironmentVariablesValidator {
  @IsUrl(
    { protocols: ['redis', 'rediss'], require_tld: false },
    { message: 'REDIS_URL must be a valid redis:// or rediss:// URL' },
  )
  @IsOptional()
  REDIS_URL: string;

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

export default registerAs<CacheConfig>('cache', () => {
  validateConfig(process.env, EnvironmentVariablesValidator);

  return {
    redisUrl: env.REDIS_URL,
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
