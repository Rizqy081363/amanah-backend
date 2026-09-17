export type CacheConfig = {
  redisUrl: string;
  keyPrefix: string;
  defaultTtlSeconds: number;
  readinessTimeoutMs: number;
  maxReconnectAttempts: number;
};
