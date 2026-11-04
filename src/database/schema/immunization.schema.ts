import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  appointments,
  childImmunizationIntakes,
  patientProfiles,
  staffProfiles,
} from './amanah.schema';

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
    appointmentId: uuid('appointment_id'),
    administeredBy: uuid('administered_by'),
    rowIndex: integer('row_index').default(0).notNull(),
    vaccineName: varchar('vaccine_name', { length: 64 }).default('').notNull(),
    vaccineCode: varchar('vaccine_code', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    givenDate: date('given_date'),
    ageDisplay: varchar('age_display', { length: 64 }),
    fever: varchar('fever', { length: 32 }),
    cough: varchar('cough', { length: 32 }),
    runnyNose: varchar('runny_nose', { length: 32 }),
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    heightCm: numeric('height_cm', { precision: 5, scale: 2 }),
    headCircumferenceCm: numeric('head_circumference_cm', { precision: 5, scale: 2 }),
    temperatureCelsius: numeric('temperature_celsius', { precision: 4, scale: 1 }),
    planning: text('planning'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('child_imm_entries_patient_row_uniq').on(table.patientId, table.rowIndex),
    index('child_imm_entries_intake_idx').on(table.intakeId),
    index('child_imm_entries_patient_idx').on(table.patientId),
    index('child_imm_entries_row_idx').on(table.rowIndex),
    index('child_imm_entries_vaccine_code_idx').on(table.vaccineCode),
    index('child_imm_entries_appt_idx').on(table.appointmentId),
    index('child_imm_entries_admin_by_idx').on(table.administeredBy),
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
    foreignKey({
      columns: [table.appointmentId],
      foreignColumns: [appointments.id],
      name: 'child_immunization_entries_appointment_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.administeredBy],
      foreignColumns: [staffProfiles.id],
      name: 'child_immunization_entries_administered_by_fkey',
    }).onDelete('set null'),
  ],
);
