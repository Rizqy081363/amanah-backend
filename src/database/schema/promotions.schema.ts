import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { clinicServices, users } from './amanah.schema';

export const promoImageType = pgEnum('promo_image_type', ['static', 'url']);

export const modalFrequency = pgEnum('modal_frequency', [
  'once_per_session',
  'once_per_day',
  'once_per_week',
]);

export const promotions = pgTable(
  'promotions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    serviceId: uuid('service_id').references(() => clinicServices.id, {
      onDelete: 'set null',
    }),
    title: varchar('title', { length: 80 }).notNull(),
    summary: varchar('summary', { length: 160 }).notNull(),
    body: varchar('body', { length: 1000 }),
    terms: varchar('terms', { length: 500 }),
    imageType: promoImageType('image_type').notNull(),
    imageValue: varchar('image_value', { length: 2048 }).notNull(),
    imageAlt: varchar('image_alt', { length: 150 }).notNull(),
    ctaLabel: varchar('cta_label', { length: 30 }),
    ctaUrl: varchar('cta_url', { length: 2048 }),
    showBanner: boolean('show_banner').default(true).notNull(),
    showModal: boolean('show_modal').default(false).notNull(),
    showSection: boolean('show_section').default(true).notNull(),
    modalFrequency: modalFrequency('modal_frequency')
      .default('once_per_day')
      .notNull(),
    modalDelaySec: smallint('modal_delay_sec').default(3).notNull(),
    priority: smallint('priority').default(0).notNull(),
    isPublished: boolean('is_published').default(false).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'string' }),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'string' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    broadcastToUsers: boolean('broadcast_to_users').default(false).notNull(),
    broadcastAt: timestamp('broadcast_at', {
      withTimezone: true,
      mode: 'string',
    }),
    broadcastChannels: text('broadcast_channels')
      .array()
      .default(sql`ARRAY['in_app', 'push']::text[]`)
      .notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'chk_promotions_period',
      sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      'chk_promotions_cta',
      sql`(${table.ctaLabel} IS NULL) = (${table.ctaUrl} IS NULL)`,
    ),
    check(
      'chk_promotions_place',
      sql`${table.showBanner} OR ${table.showModal} OR ${table.showSection}`,
    ),
    check(
      'chk_promotions_modal_delay',
      sql`${table.modalDelaySec} BETWEEN 0 AND 30`,
    ),
    index('idx_promotions_live')
      .using('btree', table.isPublished, table.startsAt, table.endsAt)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_promotions_priority')
      .using('btree', table.priority.desc(), table.startsAt.desc().nullsLast()),
    index('idx_promotions_service')
      .using('btree', table.serviceId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_promotions_broadcast')
      .using(
        'btree',
        table.isPublished,
        table.broadcastToUsers,
        table.broadcastAt,
      )
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export type PromotionRecord = typeof promotions.$inferSelect;
export type NewPromotionRecord = typeof promotions.$inferInsert;
