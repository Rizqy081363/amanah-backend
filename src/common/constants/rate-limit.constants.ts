export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_TIERS = {
  AUTH: { limit: 30, windowSeconds: 60 },
  MUTATION: { limit: 60, windowSeconds: 60 },
  SEARCH: { limit: 30, windowSeconds: 60 },
  DISPLAY_QUEUE: { limit: 300, windowSeconds: 60 },
  DEFAULT: { limit: 120, windowSeconds: 60 },
} as const;

export const RATE_LIMIT_HEADER_LIMIT = 'X-RateLimit-Limit';
export const RATE_LIMIT_HEADER_REMAINING = 'X-RateLimit-Remaining';
export const RATE_LIMIT_HEADER_RESET = 'X-RateLimit-Reset';
export const RETRY_AFTER_HEADER = 'Retry-After';
