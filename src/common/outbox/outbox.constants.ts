/**
 * Outbox Event Lifecycle Statuses (OPS-144..168).
 */
export enum OutboxStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PUBLISHED = 'published',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export const DEFAULT_OUTBOX_BATCH_SIZE = 20;
export const MAX_OUTBOX_BATCH_SIZE = 100;
export const DEFAULT_OUTBOX_POLL_INTERVAL_MS = 1000;
export const DEFAULT_MAX_RETRIES = 5;
export const BASE_RETRY_BACKOFF_SECONDS = 2;
export const MAX_RETRY_BACKOFF_SECONDS = 300;
