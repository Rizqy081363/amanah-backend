import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  clinicRooms,
  practitioners,
  serviceCategories,
  staffProfiles,
  users,
} from './amanah.schema';

// ============================================================================
// 1. CONFIGURATION REGISTRY (data, not code)
// ============================================================================
export const clinicSettings = pgTable('clinic_setting', {
  key: text('key').primaryKey().notNull(),
  scopeType: varchar('scope_type', { length: 20 }).default('global').notNull(),
  scopeId: text('scope_id'),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
});

// ============================================================================
// 1.1 CANONICAL MASTER DAYS (SSOT for calendar day names, sort order, & relations)
// ============================================================================
export const masterDays = pgTable('master_day', {
  dow: integer('dow').primaryKey().notNull(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  code: text('code').notNull().unique(),
  nameId: text('name_id').notNull(),
  nameEn: text('name_en').notNull(),
  shortNameId: varchar('short_name_id', { length: 10 }).notNull(),
  shortNameEn: varchar('short_name_en', { length: 10 }).notNull(),
  sortOrder: integer('sort_order').notNull().unique(),
  isWeekend: boolean('is_weekend').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
});

// ============================================================================
// 2. CLINIC-OWNED SESSION DEFINITIONS & SCHEDULES
// ============================================================================
export const sessionDefs = pgTable('session_def', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  labelKey: text('label_key'),
  codePrefix: varchar('code_prefix', { length: 4 }).notNull(),
  sortOrder: integer('sort_order').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  defaultStartsAt: time('default_starts_at').notNull(),
  defaultEndsAt: time('default_ends_at').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
});

export const sessionSchedules = pgTable(
  'session_schedule',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessionDefs.id, { onDelete: 'cascade' }),
    dow: integer('dow')
      .notNull()
      .references(() => masterDays.dow, { onDelete: 'restrict' }), // 0 = Sunday .. 6 = Saturday
    startsAt: time('starts_at').notNull(),
    endsAt: time('ends_at').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_session_schedule_dow_session').on(table.dow, table.sessionId),
  ],
);

export const doctorScheduleHistoryAction = pgEnum(
  'doctor_schedule_history_action',
  [
    'open_schedule',
    'close_schedule',
    'assign_roster',
    'remove_roster',
    'override_date',
  ],
);

export const doctorAssignments = pgTable(
  'doctor_assignment',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => practitioners.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => serviceCategories.id, {
      onDelete: 'cascade',
    }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessionDefs.id, { onDelete: 'cascade' }),
    dow: integer('dow').references(() => masterDays.dow, {
      onDelete: 'restrict',
    }),
    preferredRoomId: uuid('preferred_room_id').references(
      () => clinicRooms.id,
      { onDelete: 'set null' },
    ),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_doctor_assignment_lookup').on(
      table.categoryId,
      table.sessionId,
      table.isActive,
    ),
  ],
);

export const doctorScheduleStatusHistory = pgTable(
  'doctor_schedule_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => practitioners.id, { onDelete: 'cascade' }),
    scheduleDate: date('schedule_date'),
    sessionId: uuid('session_id').references(() => sessionDefs.id, {
      onDelete: 'set null',
    }),
    dow: integer('dow').references(() => masterDays.dow, {
      onDelete: 'restrict',
    }),
    action: doctorScheduleHistoryAction('action').notNull(),
    previousStatus: varchar('previous_status', { length: 20 }),
    newStatus: varchar('new_status', { length: 20 }),
    reason: text('reason'),
    metadata: jsonb('metadata').default({}),
    changedBy: uuid('changed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_doctor_sched_hist_doctor_date').on(
      table.doctorId,
      table.scheduleDate,
    ),
    index('idx_doctor_sched_hist_created_at').on(table.createdAt),
  ],
);

export const shiftExceptions = pgTable(
  'shift_exception',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => practitioners.id, { onDelete: 'cascade' }),
    serviceDate: date('service_date').notNull(),
    sessionId: uuid('session_id').references(() => sessionDefs.id, {
      onDelete: 'set null',
    }),
    type: varchar('type', { length: 20 }).notNull(), // 'leave' | 'extra'
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_shift_exception_date_doctor').on(
      table.serviceDate,
      table.doctorId,
    ),
  ],
);

// ============================================================================
// 4. OPENINGS & CLOSURES (Intervals half-open [starts_at, ends_at))
// ============================================================================
export const extraOpenings = pgTable('extra_opening', {
  id: uuid('id').defaultRandom().primaryKey().notNull(),
  categoryId: uuid('category_id').references(() => serviceCategories.id, {
    onDelete: 'cascade',
  }),
  startsAt: timestamp('starts_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  endsAt: timestamp('ends_at', {
    withTimezone: true,
    mode: 'string',
  }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .defaultNow()
    .notNull(),
});

export const clinicClosures = pgTable(
  'clinic_closure',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    scope: varchar('scope', { length: 20 }).default('clinic').notNull(), // 'clinic' | 'category' | 'doctor' | 'room'
    categoryId: uuid('category_id').references(() => serviceCategories.id, {
      onDelete: 'cascade',
    }),
    doctorId: uuid('doctor_id').references(() => practitioners.id, {
      onDelete: 'cascade',
    }),
    roomId: uuid('room_id').references(() => clinicRooms.id, {
      onDelete: 'cascade',
    }),
    startsAt: timestamp('starts_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    endsAt: timestamp('ends_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    inputKind: varchar('input_kind', { length: 20 }).notNull(), // 'day' | 'session' | 'range'
    lastCallBufferMin: integer('last_call_buffer_min').default(0).notNull(),
    reason: text('reason'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (table) => [
    index('idx_clinic_closure_period').on(table.startsAt, table.endsAt),
  ],
);

// ============================================================================
// 5. ATOMIC QUEUE COUNTER
// ============================================================================
export const queueCounters = pgTable(
  'queue_counter',
  {
    serviceDate: date('service_date').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessionDefs.id, { onDelete: 'cascade' }),
    lastNo: integer('last_no').default(0).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.serviceDate, table.categoryId, table.sessionId],
      name: 'queue_counter_pkey',
    }),
  ],
);

// ============================================================================
// 6. AUDIT & OUTBOX
// ============================================================================
export const ticketEvents = pgTable(
  'ticket_event',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    ticketId: uuid('ticket_id').notNull(),
    event: text('event').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actor: jsonb('actor'),
    at: timestamp('at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    payload: jsonb('payload'),
  },
  (table) => [index('idx_ticket_event_ticket_at').on(table.ticketId, table.at)],
);

export const queueNotificationOutbox = pgTable(
  'queue_notification_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    ticketId: uuid('ticket_id'),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index('idx_queue_outbox_pending').on(table.status, table.createdAt),
  ],
);

// ============================================================================
// 7. STAFF ROSTER (Independent operational roster, decoupled from practitioners)
// ============================================================================
export const staffRosters = pgTable(
  'staff_roster',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    staffProfileId: uuid('staff_profile_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessionDefs.id, { onDelete: 'cascade' }),
    dow: integer('dow')
      .notNull()
      .references(() => masterDays.dow, { onDelete: 'restrict' }),
    isActive: boolean('is_active').default(true).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_staff_roster_profile_session_dow_active')
      .on(table.staffProfileId, table.sessionId, table.dow)
      .where(sql`is_active = TRUE`),
    index('idx_staff_roster_profile').on(table.staffProfileId),
  ],
);
