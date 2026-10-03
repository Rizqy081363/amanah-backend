import { relations } from 'drizzle-orm';
import { childImmunizationIntakes, patientProfiles } from './amanah.schema';
import { childImmunizationEntries, vaccineCatalog } from './immunization.schema';

export const vaccineCatalogRelations = relations(
  vaccineCatalog,
  ({ many }) => ({
    entries: many(childImmunizationEntries),
  }),
);

export const childImmunizationEntriesRelations = relations(
  childImmunizationEntries,
  ({ one }) => ({
    intake: one(childImmunizationIntakes, {
      fields: [childImmunizationEntries.intakeId],
      references: [childImmunizationIntakes.id],
    }),
    patientProfile: one(patientProfiles, {
      fields: [childImmunizationEntries.patientId],
      references: [patientProfiles.id],
    }),
  }),
);
