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
import { maternalHealthIntakes } from './amanah.schema';

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
    education: varchar('education', { length: 64 }),
    bloodType: varchar('blood_type', { length: 32 }),
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
  ],
);

export const maternalScreeningQuestions = pgTable(
  'maternal_screening_questions',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    category: varchar('category', { length: 64 }).notNull(),
    questionText: text('question_text').notNull(),
    helpText: text('help_text'),
    inputType: varchar('input_type', { length: 32 }).notNull(),
    isRequired: boolean('is_required').default(true).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('maternal_screening_questions_code_unique').on(table.code),
    index('maternal_screening_questions_category_idx').on(table.category),
    index('maternal_screening_questions_order_idx').on(table.displayOrder),
  ],
);

export const maternalQuestionOptions = pgTable(
  'maternal_question_options',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    questionId: uuid('question_id').notNull(),
    optionCode: varchar('option_code', { length: 32 }).notNull(),
    label: varchar('label', { length: 128 }).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('maternal_question_options_unique').on(
      table.questionId,
      table.optionCode,
    ),
    index('maternal_question_options_question_idx').on(table.questionId),
    foreignKey({
      columns: [table.questionId],
      foreignColumns: [maternalScreeningQuestions.id],
      name: 'maternal_question_options_question_id_fkey',
    }).onDelete('cascade'),
  ],
);

export const maternalAnamnesisResponses = pgTable(
  'maternal_anamnesis_responses',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    maternalIntakeId: uuid('maternal_intake_id').notNull(),
    questionId: uuid('question_id').notNull(),
    questionCode: varchar('question_code', { length: 64 }).notNull(),
    selectedOptionId: uuid('selected_option_id'),
    selectedOptionCode: varchar('selected_option_code', { length: 32 }),
    textResponse: text('text_response'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('maternal_anamnesis_intake_idx').on(table.maternalIntakeId),
    index('maternal_anamnesis_question_idx').on(table.questionId),
    foreignKey({
      columns: [table.maternalIntakeId],
      foreignColumns: [maternalHealthIntakes.id],
      name: 'maternal_anamnesis_intake_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.questionId],
      foreignColumns: [maternalScreeningQuestions.id],
      name: 'maternal_anamnesis_question_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.selectedOptionId],
      foreignColumns: [maternalQuestionOptions.id],
      name: 'maternal_anamnesis_option_id_fkey',
    }).onDelete('set null'),
  ],
);

export const maternalHealthConditionCatalog = pgTable(
  'maternal_health_condition_catalog',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 128 }).notNull(),
    questionPrompt: text('question_prompt').notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('maternal_health_condition_catalog_code_unique').on(table.code),
    index('maternal_health_condition_order_idx').on(table.displayOrder),
  ],
);

export const maternalHealthConditionResponses = pgTable(
  'maternal_health_condition_responses',
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    maternalIntakeId: uuid('maternal_intake_id').notNull(),
    conditionId: uuid('condition_id').notNull(),
    conditionCode: varchar('condition_code', { length: 64 }).notNull(),
    hasCondition: boolean('has_condition').notNull(),
    diagnosisYear: integer('diagnosis_year'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('maternal_condition_resp_intake_idx').on(table.maternalIntakeId),
    index('maternal_condition_resp_condition_idx').on(table.conditionId),
    foreignKey({
      columns: [table.maternalIntakeId],
      foreignColumns: [maternalHealthIntakes.id],
      name: 'maternal_condition_resp_intake_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.conditionId],
      foreignColumns: [maternalHealthConditionCatalog.id],
      name: 'maternal_condition_resp_condition_id_fkey',
    }).onDelete('cascade'),
  ],
);
