import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  practitioners,
  staffLeaveRequests,
  staffProfiles,
  users,
} from './amanah.schema';
import { sessionDefs } from './queue-ticketing.schema';

// ============================================================================
// 1. LEAVE POLICY (Dynamic, admin-configurable leave rules)
// ============================================================================
export const leavePolicies = pgTable(
  'leave_policy',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    approvalRequired: boolean('approval_required').default(true).notNull(),
    limitMode: varchar('limit_mode', { length: 20 })
      .default('monthly_limit')
      .notNull(),
    monthlyLimit: integer('monthly_limit').default(3).notNull(),
    quotaCountingPolicy: varchar('quota_counting_policy', { length: 30 })
      .default('per_request')
      .notNull(),
    periodPolicy: varchar('period_policy', { length: 40 })
      .default('non_overlapping')
      .notNull(),
    noticeDaysRequired: integer('notice_days_required').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    effectiveFrom: date('effective_from').defaultNow().notNull(),
    effectiveTo: date('effective_to'),
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
    index('idx_leave_policy_active').on(table.isActive, table.effectiveFrom),
    check(
      'leave_policy_limit_mode_check',
      sql`${table.limitMode} IN ('unlimited', 'monthly_limit')`,
    ),
    check(
      'leave_policy_quota_policy_check',
      sql`${table.quotaCountingPolicy} IN ('per_request', 'per_session')`,
    ),
    check(
      'leave_policy_period_policy_check',
      sql`${table.periodPolicy} IN ('non_overlapping', 'previous_period_must_finish')`,
    ),
    check(
      'leave_policy_notice_days_check',
      sql`${table.noticeDaysRequired} >= 0`,
    ),
  ],
);

// ============================================================================
// 2. COMPENSATION RATES (Hourly base and overtime rates by staff category)
// ============================================================================
export const compensationRates = pgTable(
  'compensation_rates',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    category: varchar('category', { length: 30 }).notNull(), // 'doctor', 'midwife', 'worker'
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 })
      .default('0.00')
      .notNull(),
    overtimeHourlyRate: numeric('overtime_hourly_rate', {
      precision: 12,
      scale: 2,
    })
      .default('0.00')
      .notNull(),
    effectiveFrom: date('effective_from').defaultNow().notNull(),
    effectiveTo: date('effective_to'),
    isActive: boolean('is_active').default(true).notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, {
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
    uniqueIndex('idx_compensation_rates_active_category')
      .on(table.category)
      .where(sql`is_active = TRUE`),
    check(
      'compensation_rates_category_check',
      sql`${table.category} IN ('doctor', 'midwife', 'worker')`,
    ),
    check(
      'compensation_rates_rates_check',
      sql`${table.hourlyRate} >= 0 AND ${table.overtimeHourlyRate} >= 0`,
    ),
  ],
);

// ============================================================================
// 3. LEAVE REQUEST SESSIONS (Specific session mapping for session-level leave)
// ============================================================================
export const leaveRequestSessions = pgTable(
  'leave_request_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    leaveRequestId: uuid('leave_request_id')
      .notNull()
      .references(() => staffLeaveRequests.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessionDefs.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('leave_request_sessions_unique').on(
      table.leaveRequestId,
      table.sessionId,
      table.workDate,
    ),
    index('idx_leave_request_sessions_date').on(
      table.workDate,
      table.sessionId,
    ),
    index('idx_leave_request_sessions_request').on(table.leaveRequestId),
  ],
);

// ============================================================================
// 4. REPLACEMENT OPPORTUNITIES (Open shifts created from approved leave)
// ============================================================================
export const REPLACEMENT_OPPORTUNITY_STATUSES = [
  'open',
  'claimed',
  'completed',
  'cancelled',
] as const;

export type ReplacementOpportunityStatus =
  (typeof REPLACEMENT_OPPORTUNITY_STATUSES)[number];

export const replacementOpportunities = pgTable(
  'replacement_opportunities',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    leaveRequestId: uuid('leave_request_id')
      .notNull()
      .references(() => staffLeaveRequests.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessionDefs.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    originalStaffProfileId: uuid('original_staff_profile_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'cascade' }),
    originalPractitionerId: uuid('original_practitioner_id').references(
      () => practitioners.id,
      { onDelete: 'set null' },
    ),
    claimedByStaffProfileId: uuid('claimed_by_staff_profile_id').references(
      () => staffProfiles.id,
      { onDelete: 'set null' },
    ),
    claimedByPractitionerId: uuid('claimed_by_practitioner_id').references(
      () => practitioners.id,
      { onDelete: 'set null' },
    ),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'string' }),
    status: varchar('status', { length: 20 }).default('open').notNull(), // 'open', 'claimed', 'completed', 'cancelled'
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_replacement_opp_date_status').on(table.workDate, table.status),
    index('idx_replacement_opp_leave_req').on(table.leaveRequestId),
    index('idx_replacement_opp_claimed_staff')
      .on(table.claimedByStaffProfileId)
      .where(sql`claimed_by_staff_profile_id IS NOT NULL`),
    check(
      'replacement_opportunities_status_check',
      sql`${table.status} IN ('open', 'claimed', 'completed', 'cancelled')`,
    ),
  ],
);

// ============================================================================
// 5. PAYROLL PERIODS (Calculation batches and finalization lifecycle)
// ============================================================================
export const payrollPeriods = pgTable(
  'payroll_periods',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    periodName: text('period_name').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: varchar('status', { length: 20 }).default('draft').notNull(), // 'draft', 'calculated', 'finalized'
    totalPayout: numeric('total_payout', { precision: 14, scale: 2 })
      .default('0.00')
      .notNull(),
    calculatedAt: timestamp('calculated_at', {
      withTimezone: true,
      mode: 'string',
    }),
    calculatedBy: uuid('calculated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    ruleVersion: text('rule_version').default('v1.0'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_payroll_periods_dates').on(table.periodStart, table.periodEnd),
    check('payroll_period_dates_check', sql`${table.periodEnd} >= ${table.periodStart}`),
    check(
      'payroll_period_status_check',
      sql`${table.status} IN ('draft', 'calculated', 'finalized')`,
    ),
  ],
);

// ============================================================================
// 6. PAYROLL ENTRIES (Auditable itemized breakdown per employee)
// ============================================================================
export const payrollEntries = pgTable(
  'payroll_entries',
  {
    id: uuid('id').defaultRandom().primaryKey().notNull(),
    payrollPeriodId: uuid('payroll_period_id')
      .notNull()
      .references(() => payrollPeriods.id, { onDelete: 'cascade' }),
    staffProfileId: uuid('staff_profile_id')
      .notNull()
      .references(() => staffProfiles.id, { onDelete: 'cascade' }),
    practitionerId: uuid('practitioner_id').references(() => practitioners.id, {
      onDelete: 'set null',
    }),
    entryType: varchar('entry_type', { length: 30 }).notNull(), // 'base_scheduled', 'leave_deduction', 'replacement_addition', 'overtime_addition'
    sourceType: varchar('source_type', { length: 30 }).notNull(), // 'roster', 'leave_request', 'replacement_claim', 'attendance', 'manual'
    sourceId: uuid('source_id'),
    quantityHours: numeric('quantity_hours', { precision: 6, scale: 2 })
      .default('0.00')
      .notNull(),
    hourlyRate: numeric('hourly_rate', { precision: 12, scale: 2 })
      .default('0.00')
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 })
      .default('0.00')
      .notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_payroll_entries_period_staff').on(
      table.payrollPeriodId,
      table.staffProfileId,
    ),
    index('idx_payroll_entries_practitioner')
      .on(table.practitionerId)
      .where(sql`practitioner_id IS NOT NULL`),
    check(
      'payroll_entry_type_check',
      sql`${table.entryType} IN ('base_scheduled', 'leave_deduction', 'replacement_addition', 'overtime_addition')`,
    ),
    check(
      'payroll_source_type_check',
      sql`${table.sourceType} IN ('roster', 'leave_request', 'replacement_claim', 'attendance', 'manual')`,
    ),
  ],
);
