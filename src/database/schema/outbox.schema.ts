import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'processing',
  'published',
  'failed',
  'dead_letter',
]);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    aggregateType: varchar('aggregate_type', { length: 64 }).notNull(),
    aggregateId: varchar('aggregate_id', { length: 64 }).notNull(),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: outboxStatus('status').default('pending').notNull(),
    retryCount: integer('retry_count').default(0).notNull(),
    maxRetries: integer('max_retries').default(5).notNull(),
    errorMessage: text('error_message'),
    traceId: varchar('trace_id', { length: 64 }),
    scheduledAt: timestamp('scheduled_at', {
      withTimezone: true,
      mode: 'string',
    })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'string',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_outbox_events_status_scheduled').on(
      table.status,
      table.scheduledAt,
    ),
    index('idx_outbox_events_aggregate').on(
      table.aggregateType,
      table.aggregateId,
    ),
    index('idx_outbox_events_created').on(table.createdAt),
  ],
);

export type OutboxEventSelect = typeof outboxEvents.$inferSelect;
export type OutboxEventInsert = typeof outboxEvents.$inferInsert;
