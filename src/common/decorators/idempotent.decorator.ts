import { SetMetadata } from '@nestjs/common';

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
}

/**
 * Decorator to configure distributed idempotency on state-changing endpoints (API-139..API-145).
 */
export const Idempotent = (options: IdempotencyOptions = {}) =>
  SetMetadata(IDEMPOTENT_METADATA_KEY, options);
