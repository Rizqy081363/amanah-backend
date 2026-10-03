import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { childImmunizationIntakes, patientProfiles } from './amanah.schema';

export const vaccineCatalog = pgTable(
  'vaccine_catalog',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    ageMilestone: varchar('age_milestone', { length: 64 }).notNull(),
    scheduleMonths: integer('schedule_months'),
    altGroup: varchar('alt_group', { length: 64 }),
    description: text('description'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('vaccine_catalog_code_unique').on(table.code),
    index('vaccine_catalog_order_idx').on(table.sortOrder),
    index('vaccine_catalog_alt_group_idx').on(table.altGroup),
  ],
);

export const childImmunizationEntries = pgTable(
  'child_immunization_entries',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    intakeId: uuid('intake_id').notNull(),
    patientId: uuid('patient_id').notNull(),
    vaccineCode: varchar('vaccine_code', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    givenDate: date('given_date'),
    givenMonth: varchar('given_month', { length: 16 }),
    ageEstimateMonths: integer('age_estimate_months'),
    datePrecision: varchar('date_precision', { length: 32 }),
    reviewReasons: jsonb('review_reasons'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('child_imm_entries_intake_idx').on(table.intakeId),
    index('child_imm_entries_patient_idx').on(table.patientId),
    index('child_imm_entries_vaccine_code_idx').on(table.vaccineCode),
    foreignKey({
      columns: [table.intakeId],
      foreignColumns: [childImmunizationIntakes.id],
      name: 'child_imm_entries_intake_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.patientId],
      foreignColumns: [patientProfiles.id],
      name: 'child_imm_entries_patient_id_fkey',
    }).onDelete('cascade'),
  ],
);
