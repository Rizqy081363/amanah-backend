import { relations } from 'drizzle-orm';
import { maternalHealthIntakes } from './amanah.schema';
import {
  maternalAnamnesisResponses,
  maternalHealthConditionCatalog,
  maternalHealthConditionResponses,
  maternalHusbandProfiles,
  maternalQuestionOptions,
  maternalScreeningQuestions,
} from './maternal.schema';

export const maternalHusbandProfilesRelations = relations(
  maternalHusbandProfiles,
  ({ one }) => ({
    maternalHealthIntake: one(maternalHealthIntakes, {
      fields: [maternalHusbandProfiles.maternalIntakeId],
      references: [maternalHealthIntakes.id],
    }),
  }),
);

export const maternalScreeningQuestionsRelations = relations(
  maternalScreeningQuestions,
  ({ many }) => ({
    options: many(maternalQuestionOptions),
    responses: many(maternalAnamnesisResponses),
  }),
);

export const maternalQuestionOptionsRelations = relations(
  maternalQuestionOptions,
  ({ one }) => ({
    question: one(maternalScreeningQuestions, {
      fields: [maternalQuestionOptions.questionId],
      references: [maternalScreeningQuestions.id],
    }),
  }),
);

export const maternalAnamnesisResponsesRelations = relations(
  maternalAnamnesisResponses,
  ({ one }) => ({
    maternalHealthIntake: one(maternalHealthIntakes, {
      fields: [maternalAnamnesisResponses.maternalIntakeId],
      references: [maternalHealthIntakes.id],
    }),
    question: one(maternalScreeningQuestions, {
      fields: [maternalAnamnesisResponses.questionId],
      references: [maternalScreeningQuestions.id],
    }),
    selectedOption: one(maternalQuestionOptions, {
      fields: [maternalAnamnesisResponses.selectedOptionId],
      references: [maternalQuestionOptions.id],
    }),
  }),
);

export const maternalHealthConditionCatalogRelations = relations(
  maternalHealthConditionCatalog,
  ({ many }) => ({
    responses: many(maternalHealthConditionResponses),
  }),
);

export const maternalHealthConditionResponsesRelations = relations(
  maternalHealthConditionResponses,
  ({ one }) => ({
    maternalHealthIntake: one(maternalHealthIntakes, {
      fields: [maternalHealthConditionResponses.maternalIntakeId],
      references: [maternalHealthIntakes.id],
    }),
    condition: one(maternalHealthConditionCatalog, {
      fields: [maternalHealthConditionResponses.conditionId],
      references: [maternalHealthConditionCatalog.id],
    }),
  }),
);
