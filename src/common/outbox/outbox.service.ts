import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../database/drizzle/drizzle.provider';
import {
  outboxEvents,
  OutboxEventSelect,
} from '../../database/schema/outbox.schema';
import {
  BASE_RETRY_BACKOFF_SECONDS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_OUTBOX_BATCH_SIZE,
  MAX_OUTBOX_BATCH_SIZE,
  MAX_RETRY_BACKOFF_SECONDS,
} from './outbox.constants';
import { OutboxEventRecord, OutboxMetrics } from './outbox.types';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  /**
   * Persists an event record into the transactional outbox table (ARC-089..094, OPS-159).
   * Participates in an existing database transaction if provided, guaranteeing atomicity with business mutations.
   */
  async recordEvent(
    event: OutboxEventRecord,
    tx?: any,
  ): Promise<OutboxEventSelect> {
    const client = tx || this.db;
    const scheduledAtStr = event.scheduledAt
      ? event.scheduledAt instanceof Date
        ? event.scheduledAt.toISOString()
        : event.scheduledAt
      : new Date().toISOString();

    const [inserted] = await client
      .insert(outboxEvents)
      .values({
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
        traceId: event.traceId || null,
        scheduledAt: scheduledAtStr,
        maxRetries: event.maxRetries ?? DEFAULT_MAX_RETRIES,
        status: 'pending',
      })
      .returning();

    return inserted;
  }

  /**
   * Concurrency-safe batch claiming using SELECT ... FOR UPDATE SKIP LOCKED (ARC-096, OPS-130).
   * Ensures multiple replicas never double-claim or stall partitions.
   */
  async fetchAndClaimBatch(
    batchSize = DEFAULT_OUTBOX_BATCH_SIZE,
  ): Promise<OutboxEventSelect[]> {
    const limit = Math.min(Math.max(1, batchSize), MAX_OUTBOX_BATCH_SIZE);
    const nowStr = new Date().toISOString();

    const queryResult = await this.db.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM outbox_events
        WHERE status = 'pending'
          AND scheduled_at <= ${nowStr}
        ORDER BY scheduled_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events
      SET status = 'processing',
          updated_at = ${nowStr}
      WHERE id IN (SELECT id FROM claimed)
      RETURNING *;
    `);

    const rows = (queryResult as any).rows || [];
    return rows.map((r: any) => this.mapRowToSelect(r));
  }

  /**
   * Marks an outbox event as successfully published (OPS-158).
   */
  async markPublished(id: string): Promise<void> {
    const nowStr = new Date().toISOString();
    await this.db
      .update(outboxEvents)
      .set({
        status: 'published',
        publishedAt: nowStr,
        updatedAt: nowStr,
      })
      .where(eq(outboxEvents.id, id));
  }

  /**
   * Handles delivery failure with bounded exponential backoff or moves to dead-letter (OPS-152..154).
   */
  async markFailed(
    id: string,
    errorMessage: string,
    currentRetries: number,
    maxRetries = DEFAULT_MAX_RETRIES,
  ): Promise<void> {
    const nextRetry = currentRetries + 1;
    const nowStr = new Date().toISOString();

    if (nextRetry >= maxRetries) {
      this.logger.warn(
        `Outbox event ${id} reached maximum retries (${maxRetries}). Moving to dead-letter destination (OPS-154). Reason: ${errorMessage}`,
      );
      await this.db
        .update(outboxEvents)
        .set({
          status: 'dead_letter',
          retryCount: nextRetry,
          errorMessage,
          updatedAt: nowStr,
        })
        .where(eq(outboxEvents.id, id));
    } else {
      // Bounded exponential backoff with jitter (OPS-152)
      const jitterSeconds = Math.floor(Math.random() * 2);
      const backoffSeconds = Math.min(
        MAX_RETRY_BACKOFF_SECONDS,
        2 ** currentRetries * BASE_RETRY_BACKOFF_SECONDS + jitterSeconds,
      );
      const nextScheduled = new Date(
        Date.now() + backoffSeconds * 1000,
      ).toISOString();

      this.logger.debug(
        `Outbox event ${id} failed attempt ${nextRetry}/${maxRetries}. Rescheduling in ${backoffSeconds}s.`,
      );

      await this.db
        .update(outboxEvents)
        .set({
          status: 'pending',
          retryCount: nextRetry,
          scheduledAt: nextScheduled,
          errorMessage,
          updatedAt: nowStr,
        })
        .where(eq(outboxEvents.id, id));
    }
  }

  /**
   * Replays dead-lettered events back into the pending queue (OPS-154).
   */
  async reprocessDeadLetters(limit = 50): Promise<number> {
    const nowStr = new Date().toISOString();
    const result = await this.db.execute(sql`
      WITH to_reprocess AS (
        SELECT id
        FROM outbox_events
        WHERE status = 'dead_letter'
        ORDER BY created_at ASC
        LIMIT ${limit}
      )
      UPDATE outbox_events
      SET status = 'pending',
          retry_count = 0,
          scheduled_at = ${nowStr},
          updated_at = ${nowStr}
      WHERE id IN (SELECT id FROM to_reprocess)
      RETURNING id;
    `);

    const count = (result as any).rows?.length || 0;
    this.logger.log(`Reprocessed ${count} dead-lettered outbox events.`);
    return count;
  }

  /**
   * Returns queue depth and lag metrics for observability (OPS-161).
   */
  async getMetrics(): Promise<OutboxMetrics> {
    const result = await this.db.execute(sql`
      SELECT
        status,
        count(*)::int as count
      FROM outbox_events
      GROUP BY status;
    `);

    const rows = (result as any).rows || [];
    const counts: Record<string, number> = {
      pending: 0,
      processing: 0,
      published: 0,
      failed: 0,
      dead_letter: 0,
    };

    for (const r of rows) {
      counts[r.status] = Number(r.count || 0);
    }

    const oldestPendingResult = await this.db.execute(sql`
      SELECT EXTRACT(EPOCH FROM (NOW() - created_at))::int as age_seconds
      FROM outbox_events
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1;
    `);
    const oldestRow = (oldestPendingResult as any).rows?.[0];
    const oldestAge =
      oldestRow?.age_seconds != null ? Number(oldestRow.age_seconds) : null;

    const total = Object.values(counts).reduce((acc, v) => acc + v, 0);

    return {
      pending: counts.pending || 0,
      processing: counts.processing || 0,
      published: counts.published || 0,
      failed: counts.failed || 0,
      deadLetter: counts.dead_letter || 0,
      total,
      oldestPendingAgeSeconds: oldestAge,
    };
  }

  private mapRowToSelect(r: any): OutboxEventSelect {
    return {
      id: r.id,
      aggregateType: r.aggregate_type ?? r.aggregateType,
      aggregateId: r.aggregate_id ?? r.aggregateId,
      eventType: r.event_type ?? r.eventType,
      payload:
        typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: r.status,
      retryCount: Number(r.retry_count ?? r.retryCount ?? 0),
      maxRetries: Number(r.max_retries ?? r.maxRetries ?? DEFAULT_MAX_RETRIES),
      errorMessage: r.error_message ?? r.errorMessage ?? null,
      traceId: r.trace_id ?? r.traceId ?? null,
      scheduledAt: r.scheduled_at
        ? new Date(r.scheduled_at).toISOString()
        : (r.scheduledAt ?? new Date().toISOString()),
      publishedAt: r.published_at
        ? new Date(r.published_at).toISOString()
        : (r.publishedAt ?? null),
      createdAt: r.created_at
        ? new Date(r.created_at).toISOString()
        : (r.createdAt ?? new Date().toISOString()),
      updatedAt: r.updated_at
        ? new Date(r.updated_at).toISOString()
        : (r.updatedAt ?? new Date().toISOString()),
    };
  }
}
