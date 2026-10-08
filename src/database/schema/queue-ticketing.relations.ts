import { relations } from 'drizzle-orm';
import {
  clinicRooms,
  patientProfiles,
  practitioners,
  queueTickets,
  serviceCategories,
  users,
} from './amanah.schema';
import {
  clinicClosures,
  doctorAssignments,
  extraOpenings,
  queueCounters,
  queueNotificationOutbox,
  sessionDefs,
  sessionSchedules,
  shiftExceptions,
  ticketEvents,
} from './queue-ticketing.schema';

export const sessionDefsRelations = relations(sessionDefs, ({ many }) => ({
  schedules: many(sessionSchedules),
  doctorAssignments: many(doctorAssignments),
  queueCounters: many(queueCounters),
}));

export const sessionSchedulesRelations = relations(sessionSchedules, ({ one }) => ({
  sessionDef: one(sessionDefs, {
    fields: [sessionSchedules.sessionId],
    references: [sessionDefs.id],
  }),
}));

export const doctorAssignmentsRelations = relations(doctorAssignments, ({ one }) => ({
  practitioner: one(practitioners, {
    fields: [doctorAssignments.doctorId],
    references: [practitioners.id],
  }),
  category: one(serviceCategories, {
    fields: [doctorAssignments.categoryId],
    references: [serviceCategories.id],
  }),
  sessionDef: one(sessionDefs, {
    fields: [doctorAssignments.sessionId],
    references: [sessionDefs.id],
  }),
  preferredRoom: one(clinicRooms, {
    fields: [doctorAssignments.preferredRoomId],
    references: [clinicRooms.id],
  }),
}));

export const shiftExceptionsRelations = relations(shiftExceptions, ({ one }) => ({
  practitioner: one(practitioners, {
    fields: [shiftExceptions.doctorId],
    references: [practitioners.id],
  }),
  sessionDef: one(sessionDefs, {
    fields: [shiftExceptions.sessionId],
    references: [sessionDefs.id],
  }),
}));

export const extraOpeningsRelations = relations(extraOpenings, ({ one }) => ({
  category: one(serviceCategories, {
    fields: [extraOpenings.categoryId],
    references: [serviceCategories.id],
  }),
}));

export const clinicClosuresRelations = relations(clinicClosures, ({ one }) => ({
  category: one(serviceCategories, {
    fields: [clinicClosures.categoryId],
    references: [serviceCategories.id],
  }),
  practitioner: one(practitioners, {
    fields: [clinicClosures.doctorId],
    references: [practitioners.id],
  }),
  room: one(clinicRooms, {
    fields: [clinicClosures.roomId],
    references: [clinicRooms.id],
  }),
  createdByUser: one(users, {
    fields: [clinicClosures.createdBy],
    references: [users.id],
  }),
}));

export const queueCountersRelations = relations(queueCounters, ({ one }) => ({
  category: one(serviceCategories, {
    fields: [queueCounters.categoryId],
    references: [serviceCategories.id],
  }),
  sessionDef: one(sessionDefs, {
    fields: [queueCounters.sessionId],
    references: [sessionDefs.id],
  }),
}));

export const ticketEventsRelations = relations(ticketEvents, ({ one }) => ({
  ticket: one(queueTickets, {
    fields: [ticketEvents.ticketId],
    references: [queueTickets.id],
  }),
}));

export const queueNotificationOutboxRelations = relations(
  queueNotificationOutbox,
  ({ one }) => ({
    ticket: one(queueTickets, {
      fields: [queueNotificationOutbox.ticketId],
      references: [queueTickets.id],
    }),
  }),
);
