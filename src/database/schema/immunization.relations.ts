import { relations } from 'drizzle-orm';
import {
  appointments,
  childImmunizationIntakes,
  patientProfiles,
  staffProfiles,
} from './amanah.schema';
import {
  childImmunizationEntries,
  vaccineCatalog,
} from './immunization.schema';

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
    appointment: one(appointments, {
      fields: [childImmunizationEntries.appointmentId],
      references: [appointments.id],
    }),
    administeredStaff: one(staffProfiles, {
      fields: [childImmunizationEntries.administeredBy],
      references: [staffProfiles.id],
    }),
  }),
);
