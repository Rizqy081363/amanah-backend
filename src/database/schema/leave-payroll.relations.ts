import { relations } from 'drizzle-orm/relations';
import {
  practitioners,
  staffLeaveRequests,
  staffProfiles,
  users,
} from './amanah.schema';
import {
  compensationRates,
  leavePolicies,
  leaveRequestSessions,
  payrollEntries,
  payrollPeriods,
  replacementOpportunities,
} from './leave-payroll.schema';
import { sessionDefs } from './queue-ticketing.schema';

export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
  user: one(users, {
    fields: [leavePolicies.updatedBy],
    references: [users.id],
  }),
}));

export const compensationRatesRelations = relations(
  compensationRates,
  ({ one }) => ({
    user: one(users, {
      fields: [compensationRates.createdBy],
      references: [users.id],
    }),
  }),
);

export const leaveRequestSessionsRelations = relations(
  leaveRequestSessions,
  ({ one }) => ({
    leaveRequest: one(staffLeaveRequests, {
      fields: [leaveRequestSessions.leaveRequestId],
      references: [staffLeaveRequests.id],
    }),
    sessionDef: one(sessionDefs, {
      fields: [leaveRequestSessions.sessionId],
      references: [sessionDefs.id],
    }),
  }),
);

export const replacementOpportunitiesRelations = relations(
  replacementOpportunities,
  ({ one }) => ({
    leaveRequest: one(staffLeaveRequests, {
      fields: [replacementOpportunities.leaveRequestId],
      references: [staffLeaveRequests.id],
    }),
    sessionDef: one(sessionDefs, {
      fields: [replacementOpportunities.sessionId],
      references: [sessionDefs.id],
    }),
    originalStaffProfile: one(staffProfiles, {
      fields: [replacementOpportunities.originalStaffProfileId],
      references: [staffProfiles.id],
    }),
    originalPractitioner: one(practitioners, {
      fields: [replacementOpportunities.originalPractitionerId],
      references: [practitioners.id],
    }),
    claimedByStaffProfile: one(staffProfiles, {
      fields: [replacementOpportunities.claimedByStaffProfileId],
      references: [staffProfiles.id],
    }),
    claimedByPractitioner: one(practitioners, {
      fields: [replacementOpportunities.claimedByPractitionerId],
      references: [practitioners.id],
    }),
  }),
);

export const payrollPeriodsRelations = relations(
  payrollPeriods,
  ({ one, many }) => ({
    user: one(users, {
      fields: [payrollPeriods.calculatedBy],
      references: [users.id],
    }),
    entries: many(payrollEntries),
  }),
);

export const payrollEntriesRelations = relations(payrollEntries, ({ one }) => ({
  payrollPeriod: one(payrollPeriods, {
    fields: [payrollEntries.payrollPeriodId],
    references: [payrollPeriods.id],
  }),
  staffProfile: one(staffProfiles, {
    fields: [payrollEntries.staffProfileId],
    references: [staffProfiles.id],
  }),
  practitioner: one(practitioners, {
    fields: [payrollEntries.practitionerId],
    references: [practitioners.id],
  }),
}));
