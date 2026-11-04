import { relations } from 'drizzle-orm';
import { maternalHealthIntakes } from './amanah.schema';
import {
  maternalHealthConditionResponses,
  maternalHusbandProfiles,
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

export const maternalHealthConditionResponsesRelations = relations(
  maternalHealthConditionResponses,
  ({ one }) => ({
    maternalHealthIntake: one(maternalHealthIntakes, {
      fields: [maternalHealthConditionResponses.maternalIntakeId],
      references: [maternalHealthIntakes.id],
    }),
  }),
);
