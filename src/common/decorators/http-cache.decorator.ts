import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const HTTP_CACHE_METADATA_KEY = 'HTTP_CACHE_METADATA_KEY';

export interface HttpCacheOptions {
  /**
   * Time to live in seconds for this cached response in Redis.
   * @default 60
   */
  ttlSeconds?: number;

  /**
   * Whether the cache is scoped to the authenticated user (private) or shared across all callers (public).
   * In compliance with API-150, authenticated/user-specific responses MUST be private.
   * @default false
   */
  isPrivate?: boolean;

  /**
   * Semantic invalidation tags for grouping related cached resources for bulk/proactive invalidation (API-155).
   * Example: ['queue', 'display'], ['clinics'], ['analytics']
   */
  tags?: string[];
}

/**
 * Decorator to configure high-performance read-through HTTP caching with conditional ETag validation (API-149..API-155, ARC-088).
 */
export const HttpCache = (options: HttpCacheOptions = {}) => {
  return applyDecorators(
    SetMetadata(HTTP_CACHE_METADATA_KEY, options),
    ApiHeader({
      name: 'If-None-Match',
      required: false,
      description:
        'Client validator ETag for conditional retrieval. Returns 304 Not Modified if representation has not changed (API-152, API-153).',
    }),
  );
};
