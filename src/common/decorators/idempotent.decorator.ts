import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const IDEMPOTENT_METADATA_KEY = 'IDEMPOTENT_METADATA_KEY';

export interface IdempotencyOptions {
  /**
   * Whether the Idempotency-Key header is strictly required.
   * If true, requests missing the header receive a 400 Bad Request.
   * @default false
   */
  required?: boolean;

  /**
   * Retention window in seconds for the recorded result (API-143).
   * @default 86400 (24 hours)
   */
  ttl?: number;

  /**
   * Concurrency lock duration in seconds during active execution (API-144).
   * @default 60 (1 minute)
   */
  lockTtl?: number;

  /**
   * Max wait time in milliseconds for concurrent in-flight requests before emitting retry signal (API-144).
   * @default 1500 (1.5 seconds)
   */
  concurrencyWaitMs?: number;
}

/**
 * Decorator to configure distributed idempotency on state-changing endpoints (API-139..API-145).
 * Enriches both runtime interceptor metadata and OpenAPI Swagger documentation.
 */
export const Idempotent = (options: IdempotencyOptions = {}) => {
  const ttl = options.ttl ?? 86400;
  return applyDecorators(
    SetMetadata(IDEMPOTENT_METADATA_KEY, options),
    ApiHeader({
      name: 'Idempotency-Key',
      required: options.required ?? false,
      description: `Client-supplied idempotency key (UUID or alphanumeric, max 128 chars). Retention window: ${ttl}s (API-139..API-145).`,
      schema: {
        type: 'string',
        maxLength: 128,
        example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      },
    }),
  );
};
