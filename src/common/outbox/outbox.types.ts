import { OutboxEventSelect } from '../../database/schema/outbox.schema';

export interface OutboxEventRecord {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, any>;
  traceId?: string;
  scheduledAt?: Date | string;
  maxRetries?: number;
}

export interface OutboxMetrics {
  pending: number;
  processing: number;
  published: number;
  failed: number;
  deadLetter: number;
  total: number;
  oldestPendingAgeSeconds: number | null;
}

export interface OutboxProcessResult {
  processedCount: number;
  publishedCount: number;
  failedCount: number;
  metrics: OutboxMetrics;
}

export type OutboxEventItem = OutboxEventSelect;
