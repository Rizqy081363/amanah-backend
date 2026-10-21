import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { files, users } from './amanah.schema';

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    exportType: varchar('export_type', { length: 64 }).notNull(),
    format: varchar('format', { length: 16 }).notNull(),
    parameters: jsonb('parameters').default({}).notNull(),
    parametersHash: text('parameters_hash'),
    status: varchar('status', { length: 32 }).default('queued').notNull(),
    totalRows: bigint('total_rows', { mode: 'number' }),
    processedRows: bigint('processed_rows', { mode: 'number' }).default(0).notNull(),
    attempt: integer('attempt').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    objectKey: text('object_key'),
    fileSize: bigint('file_size', { mode: 'number' }),
    parts: integer('parts').default(1).notNull(),
    idempotencyKey: text('idempotency_key'),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'string' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    uniqueIndex('idx_export_jobs_idempotency')
      .on(table.requestedBy, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    index('idx_export_jobs_user_status').on(
      table.requestedBy,
      table.status,
      table.createdAt,
    ),
    index('idx_export_jobs_stale').on(table.status, table.heartbeatAt),
  ],
);

export const exportJobsRelations = relations(exportJobs, ({ one }) => ({
  user: one(users, {
    fields: [exportJobs.requestedBy],
    references: [users.id],
  }),
  file: one(files, {
    fields: [exportJobs.fileId],
    references: [files.id],
  }),
}));

export type ExportJobSelect = typeof exportJobs.$inferSelect;
export type ExportJobInsert = typeof exportJobs.$inferInsert;
