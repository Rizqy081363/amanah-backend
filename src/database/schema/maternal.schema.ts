import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  bloodTypes,
  educationLevels,
  maternalHealthIntakes,
  occupations,
} from './amanah.schema';

export const maternalHusbandProfiles = pgTable(
  'maternal_husband_profiles',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    maternalIntakeId: uuid('maternal_intake_id').notNull(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    nik: varchar('nik', { length: 16 }),
    birthDate: date('birth_date'),
    age: integer('age'),
    job: varchar('job', { length: 128 }),
    occupationId: uuid('occupation_id'),
    education: varchar('education', { length: 64 }),
    educationId: uuid('education_id'),
    bloodType: varchar('blood_type', { length: 32 }),
    bloodTypeId: uuid('blood_type_id'),
    phoneNumber: varchar('phone_number', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('maternal_husband_intake_unique').on(table.maternalIntakeId),
    index('maternal_husband_intake_idx').on(table.maternalIntakeId),
    foreignKey({
      columns: [table.maternalIntakeId],
      foreignColumns: [maternalHealthIntakes.id],
      name: 'maternal_husband_intake_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.occupationId],
      foreignColumns: [occupations.id],
      name: 'maternal_husband_occupation_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.educationId],
      foreignColumns: [educationLevels.id],
      name: 'maternal_husband_education_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.bloodTypeId],
      foreignColumns: [bloodTypes.id],
      name: 'maternal_husband_blood_type_id_fkey',
    }).onDelete('set null'),
  ],
);

export const maternalHealthConditionResponses = pgTable(
  'maternal_health_condition_responses',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    maternalIntakeId: uuid('maternal_intake_id').notNull(),
    conditionCode: varchar('condition_code', { length: 64 }).notNull(),
    hasCondition: boolean('has_condition').notNull(),
    diagnosisYear: integer('diagnosis_year'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('maternal_cond_resp_intake_code_uniq').on(
      table.maternalIntakeId,
      table.conditionCode,
    ),
    index('maternal_condition_resp_intake_idx').on(table.maternalIntakeId),
    foreignKey({
      columns: [table.maternalIntakeId],
      foreignColumns: [maternalHealthIntakes.id],
      name: 'maternal_condition_resp_intake_id_fkey',
    }).onDelete('cascade'),
  ],
);
