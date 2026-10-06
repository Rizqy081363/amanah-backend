import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './amanah.schema';

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    userId: uuid('user_id').notNull(),
    endpoint: text('endpoint').notNull(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    platform: varchar('platform', { length: 32 }).default('web').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('push_subscriptions_user_endpoint_idx').on(table.userId, table.endpoint),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'push_subscriptions_user_id_fkey',
    }).onDelete('cascade'),
    index('push_subscriptions_user_idx').on(table.userId),
  ],
);

export type PushSubscriptionDbRecord = typeof pushSubscriptions.$inferSelect;
export type PushSubscriptionDbInsert = typeof pushSubscriptions.$inferInsert;
