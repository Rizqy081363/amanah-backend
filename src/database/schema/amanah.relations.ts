import { relations } from 'drizzle-orm/relations';
import {
  appointmentStatusEvents,
  appointments,
  attendanceQrSessions,
  auditLogs,
  authAccounts,
  authSessions,
  authTwoFactors,
  clinicalEncounters,
  clinicRooms,
  clinicServiceComplaints,
  clinicServices,
  clinicUnits,
  conversationParticipants,
  conversations,
  files,
  medicalIntakeSubmissions,
  medicalSpecialties,
  messageAttachments,
  messages,
  notificationActions,
  notificationRecipients,
  notifications,
  patientAddresses,
  patientAllergies,
  patientEmergencyContacts,
  patientProfiles,
  patientTimelineEvents,
  permissions,
  practitionerAvailability,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
  publicTestimonials,
  queueTickets,
  rolePermissions,
  roles,
  serviceCategories,
  staffAttendanceRecords,
  staffCredentials,
  staffLeaveRequests,
  staffProfiles,
  supportTicketAttachments,
  supportTicketMessages,
  supportTickets,
  userDataExportJobs,
  userDevices,
  userRoles,
  users,
} from './amanah.schema';

export const userDevicesRelations = relations(userDevices, ({ one, many }) => ({
  user: one(users, {
    fields: [userDevices.userId],
    references: [users.id],
  }),
  authSessions: many(authSessions),
  staffAttendanceRecords: many(staffAttendanceRecords),
}));

export const usersRelations = relations(users, ({ many }) => ({
  userDevices: many(userDevices),
  authSessions: many(authSessions),
  authAccounts: many(authAccounts),
  authTwoFactors: many(authTwoFactors),
  userRoles_assignedBy: many(userRoles, {
    relationName: 'userRoles_assignedBy_users_id',
  }),
  userRoles_userId: many(userRoles, {
    relationName: 'userRoles_userId_users_id',
  }),
  patientProfiles: many(patientProfiles),
  patientAllergies: many(patientAllergies),
  staffProfiles: many(staffProfiles),
  staffCredentials: many(staffCredentials),
  practitionerScheduleDaySettings: many(practitionerScheduleDaySettings),
  staffLeaveRequests: many(staffLeaveRequests),
  practitionerLeavePeriods: many(practitionerLeavePeriods),
  appointments_createdBy: many(appointments, {
    relationName: 'appointments_createdBy_users_id',
  }),
  appointments_updatedBy: many(appointments, {
    relationName: 'appointments_updatedBy_users_id',
  }),
  appointmentStatusEvents: many(appointmentStatusEvents),
  medicalIntakeSubmissions: many(medicalIntakeSubmissions),
  clinicalEncounters: many(clinicalEncounters),
  attendanceQrSessions: many(attendanceQrSessions),
  staffAttendanceRecords: many(staffAttendanceRecords),
  notifications: many(notifications),
  notificationRecipients: many(notificationRecipients),
  conversationParticipants: many(conversationParticipants),
  messages: many(messages),
  files: many(files),
  supportTickets: many(supportTickets),
  supportTicketMessages: many(supportTicketMessages),
  userDataExportJobs: many(userDataExportJobs),
  auditLogs: many(auditLogs),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  userDevice: one(userDevices, {
    fields: [authSessions.deviceId],
    references: [userDevices.id],
  }),
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(users, {
    fields: [authAccounts.userId],
    references: [users.id],
  }),
}));

export const authTwoFactorsRelations = relations(authTwoFactors, ({ one }) => ({
  user: one(users, {
    fields: [authTwoFactors.userId],
    references: [users.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user_assignedBy: one(users, {
    fields: [userRoles.assignedBy],
    references: [users.id],
    relationName: 'userRoles_assignedBy_users_id',
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  user_userId: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
    relationName: 'userRoles_userId_users_id',
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
}));

export const clinicRoomsRelations = relations(clinicRooms, ({ one, many }) => ({
  clinicUnit: one(clinicUnits, {
    fields: [clinicRooms.unitId],
    references: [clinicUnits.id],
  }),
  practitioners: many(practitioners),
  practitionerScheduleSessions: many(practitionerScheduleSessions),
  appointments: many(appointments),
  queueTickets: many(queueTickets),
  attendanceQrSessions: many(attendanceQrSessions),
  staffAttendanceRecords: many(staffAttendanceRecords),
}));

export const clinicUnitsRelations = relations(clinicUnits, ({ many }) => ({
  clinicRooms: many(clinicRooms),
  staffProfiles: many(staffProfiles),
  attendanceQrSessions: many(attendanceQrSessions),
  staffAttendanceRecords: many(staffAttendanceRecords),
}));

export const clinicServicesRelations = relations(
  clinicServices,
  ({ one, many }) => ({
    serviceCategory: one(serviceCategories, {
      fields: [clinicServices.serviceCategoryId],
      references: [serviceCategories.id],
    }),
    medicalSpecialty: one(medicalSpecialties, {
      fields: [clinicServices.specialtyId],
      references: [medicalSpecialties.id],
    }),
    clinicServiceComplaints: many(clinicServiceComplaints),
    practitionerScheduleSessions: many(practitionerScheduleSessions),
    appointments: many(appointments),
    queueTickets: many(queueTickets),
    clinicalEncounters: many(clinicalEncounters),
  }),
);

export const serviceCategoriesRelations = relations(
  serviceCategories,
  ({ many }) => ({
    clinicServices: many(clinicServices),
  }),
);

export const medicalSpecialtiesRelations = relations(
  medicalSpecialties,
  ({ many }) => ({
    clinicServices: many(clinicServices),
    practitioners: many(practitioners),
  }),
);

export const clinicServiceComplaintsRelations = relations(
  clinicServiceComplaints,
  ({ one }) => ({
    clinicService: one(clinicServices, {
      fields: [clinicServiceComplaints.serviceId],
      references: [clinicServices.id],
    }),
  }),
);

export const patientProfilesRelations = relations(
  patientProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [patientProfiles.userId],
      references: [users.id],
    }),
    patientAddresses: many(patientAddresses),
    patientEmergencyContacts: many(patientEmergencyContacts),
    patientAllergies: many(patientAllergies),
    appointments: many(appointments),
    medicalIntakeSubmissions: many(medicalIntakeSubmissions),
    clinicalEncounters: many(clinicalEncounters),
    conversations: many(conversations),
    patientTimelineEvents: many(patientTimelineEvents),
    publicTestimonials: many(publicTestimonials),
  }),
);

export const patientAddressesRelations = relations(
  patientAddresses,
  ({ one }) => ({
    patientProfile: one(patientProfiles, {
      fields: [patientAddresses.patientId],
      references: [patientProfiles.id],
    }),
  }),
);

export const patientEmergencyContactsRelations = relations(
  patientEmergencyContacts,
  ({ one }) => ({
    patientProfile: one(patientProfiles, {
      fields: [patientEmergencyContacts.patientId],
      references: [patientProfiles.id],
    }),
  }),
);

export const patientAllergiesRelations = relations(
  patientAllergies,
  ({ one }) => ({
    patientProfile: one(patientProfiles, {
      fields: [patientAllergies.patientId],
      references: [patientProfiles.id],
    }),
    user: one(users, {
      fields: [patientAllergies.recordedBy],
      references: [users.id],
    }),
  }),
);

export const staffProfilesRelations = relations(
  staffProfiles,
  ({ one, many }) => ({
    clinicUnit: one(clinicUnits, {
      fields: [staffProfiles.primaryUnitId],
      references: [clinicUnits.id],
    }),
    user: one(users, {
      fields: [staffProfiles.userId],
      references: [users.id],
    }),
    practitioners: many(practitioners),
    staffCredentials: many(staffCredentials),
    staffLeaveRequests: many(staffLeaveRequests),
    attendanceQrSessions: many(attendanceQrSessions),
    staffAttendanceRecords: many(staffAttendanceRecords),
    conversations: many(conversations),
    supportTickets: many(supportTickets),
  }),
);

export const practitionersRelations = relations(
  practitioners,
  ({ one, many }) => ({
    clinicRoom: one(clinicRooms, {
      fields: [practitioners.defaultRoomId],
      references: [clinicRooms.id],
    }),
    medicalSpecialty: one(medicalSpecialties, {
      fields: [practitioners.specialtyId],
      references: [medicalSpecialties.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [practitioners.staffProfileId],
      references: [staffProfiles.id],
    }),
    practitionerAvailabilities: many(practitionerAvailability),
    practitionerScheduleDaySettings: many(practitionerScheduleDaySettings),
    staffLeaveRequests_practitionerId: many(staffLeaveRequests, {
      relationName: 'staffLeaveRequests_practitionerId_practitioners_id',
    }),
    staffLeaveRequests_substitutePractitionerId: many(staffLeaveRequests, {
      relationName:
        'staffLeaveRequests_substitutePractitionerId_practitioners_id',
    }),
    practitionerLeavePeriods: many(practitionerLeavePeriods),
    practitionerScheduleSessions: many(practitionerScheduleSessions),
    appointments: many(appointments),
    clinicalEncounters: many(clinicalEncounters),
    conversations: many(conversations),
  }),
);

export const staffCredentialsRelations = relations(
  staffCredentials,
  ({ one }) => ({
    staffProfile: one(staffProfiles, {
      fields: [staffCredentials.staffProfileId],
      references: [staffProfiles.id],
    }),
    user: one(users, {
      fields: [staffCredentials.verifiedBy],
      references: [users.id],
    }),
  }),
);

export const practitionerAvailabilityRelations = relations(
  practitionerAvailability,
  ({ one }) => ({
    practitioner: one(practitioners, {
      fields: [practitionerAvailability.practitionerId],
      references: [practitioners.id],
    }),
  }),
);

export const practitionerScheduleDaySettingsRelations = relations(
  practitionerScheduleDaySettings,
  ({ one, many }) => ({
    user: one(users, {
      fields: [practitionerScheduleDaySettings.createdBy],
      references: [users.id],
    }),
    practitioner: one(practitioners, {
      fields: [practitionerScheduleDaySettings.practitionerId],
      references: [practitioners.id],
    }),
    practitionerScheduleSessions: many(practitionerScheduleSessions),
  }),
);

export const staffLeaveRequestsRelations = relations(
  staffLeaveRequests,
  ({ one, many }) => ({
    practitioner_practitionerId: one(practitioners, {
      fields: [staffLeaveRequests.practitionerId],
      references: [practitioners.id],
      relationName: 'staffLeaveRequests_practitionerId_practitioners_id',
    }),
    user: one(users, {
      fields: [staffLeaveRequests.reviewedBy],
      references: [users.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [staffLeaveRequests.staffProfileId],
      references: [staffProfiles.id],
    }),
    practitioner_substitutePractitionerId: one(practitioners, {
      fields: [staffLeaveRequests.substitutePractitionerId],
      references: [practitioners.id],
      relationName:
        'staffLeaveRequests_substitutePractitionerId_practitioners_id',
    }),
    practitionerLeavePeriods: many(practitionerLeavePeriods),
    staffAttendanceRecords: many(staffAttendanceRecords),
  }),
);

export const practitionerLeavePeriodsRelations = relations(
  practitionerLeavePeriods,
  ({ one }) => ({
    user: one(users, {
      fields: [practitionerLeavePeriods.createdBy],
      references: [users.id],
    }),
    staffLeaveRequest: one(staffLeaveRequests, {
      fields: [practitionerLeavePeriods.leaveRequestId],
      references: [staffLeaveRequests.id],
    }),
    practitioner: one(practitioners, {
      fields: [practitionerLeavePeriods.practitionerId],
      references: [practitioners.id],
    }),
  }),
);

export const practitionerScheduleSessionsRelations = relations(
  practitionerScheduleSessions,
  ({ one, many }) => ({
    practitionerScheduleDaySetting: one(practitionerScheduleDaySettings, {
      fields: [practitionerScheduleSessions.daySettingId],
      references: [practitionerScheduleDaySettings.id],
    }),
    practitioner: one(practitioners, {
      fields: [practitionerScheduleSessions.practitionerId],
      references: [practitioners.id],
    }),
    clinicRoom: one(clinicRooms, {
      fields: [practitionerScheduleSessions.roomId],
      references: [clinicRooms.id],
    }),
    clinicService: one(clinicServices, {
      fields: [practitionerScheduleSessions.serviceId],
      references: [clinicServices.id],
    }),
    appointments: many(appointments),
  }),
);

export const appointmentsRelations = relations(
  appointments,
  ({ one, many }) => ({
    user_createdBy: one(users, {
      fields: [appointments.createdBy],
      references: [users.id],
      relationName: 'appointments_createdBy_users_id',
    }),
    patientProfile: one(patientProfiles, {
      fields: [appointments.patientId],
      references: [patientProfiles.id],
    }),
    practitioner: one(practitioners, {
      fields: [appointments.practitionerId],
      references: [practitioners.id],
    }),
    clinicRoom: one(clinicRooms, {
      fields: [appointments.roomId],
      references: [clinicRooms.id],
    }),
    practitionerScheduleSession: one(practitionerScheduleSessions, {
      fields: [appointments.scheduleSessionId],
      references: [practitionerScheduleSessions.id],
    }),
    clinicService: one(clinicServices, {
      fields: [appointments.serviceId],
      references: [clinicServices.id],
    }),
    user_updatedBy: one(users, {
      fields: [appointments.updatedBy],
      references: [users.id],
      relationName: 'appointments_updatedBy_users_id',
    }),
    appointmentStatusEvents: many(appointmentStatusEvents),
    queueTickets: many(queueTickets),
    medicalIntakeSubmissions: many(medicalIntakeSubmissions),
    clinicalEncounters: many(clinicalEncounters),
    patientTimelineEvents: many(patientTimelineEvents),
  }),
);

export const appointmentStatusEventsRelations = relations(
  appointmentStatusEvents,
  ({ one }) => ({
    appointment: one(appointments, {
      fields: [appointmentStatusEvents.appointmentId],
      references: [appointments.id],
    }),
    user: one(users, {
      fields: [appointmentStatusEvents.changedBy],
      references: [users.id],
    }),
  }),
);

export const queueTicketsRelations = relations(queueTickets, ({ one }) => ({
  appointment: one(appointments, {
    fields: [queueTickets.appointmentId],
    references: [appointments.id],
  }),
  clinicRoom: one(clinicRooms, {
    fields: [queueTickets.roomId],
    references: [clinicRooms.id],
  }),
  clinicService: one(clinicServices, {
    fields: [queueTickets.serviceId],
    references: [clinicServices.id],
  }),
}));

export const medicalIntakeSubmissionsRelations = relations(
  medicalIntakeSubmissions,
  ({ one, many }) => ({
    appointment: one(appointments, {
      fields: [medicalIntakeSubmissions.appointmentId],
      references: [appointments.id],
    }),
    patientProfile: one(patientProfiles, {
      fields: [medicalIntakeSubmissions.patientId],
      references: [patientProfiles.id],
    }),
    user: one(users, {
      fields: [medicalIntakeSubmissions.submittedBy],
      references: [users.id],
    }),
    clinicalEncounters: many(clinicalEncounters),
  }),
);

export const clinicalEncountersRelations = relations(
  clinicalEncounters,
  ({ one }) => ({
    appointment: one(appointments, {
      fields: [clinicalEncounters.appointmentId],
      references: [appointments.id],
    }),
    user: one(users, {
      fields: [clinicalEncounters.createdBy],
      references: [users.id],
    }),
    patientProfile: one(patientProfiles, {
      fields: [clinicalEncounters.patientId],
      references: [patientProfiles.id],
    }),
    practitioner: one(practitioners, {
      fields: [clinicalEncounters.practitionerId],
      references: [practitioners.id],
    }),
    clinicService: one(clinicServices, {
      fields: [clinicalEncounters.serviceId],
      references: [clinicServices.id],
    }),
    medicalIntakeSubmission: one(medicalIntakeSubmissions, {
      fields: [clinicalEncounters.sourceIntakeId],
      references: [medicalIntakeSubmissions.id],
    }),
  }),
);

export const attendanceQrSessionsRelations = relations(
  attendanceQrSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [attendanceQrSessions.createdBy],
      references: [users.id],
    }),
    clinicRoom: one(clinicRooms, {
      fields: [attendanceQrSessions.roomId],
      references: [clinicRooms.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [attendanceQrSessions.staffProfileId],
      references: [staffProfiles.id],
    }),
    clinicUnit: one(clinicUnits, {
      fields: [attendanceQrSessions.unitId],
      references: [clinicUnits.id],
    }),
    staffAttendanceRecords: many(staffAttendanceRecords),
  }),
);

export const staffAttendanceRecordsRelations = relations(
  staffAttendanceRecords,
  ({ one }) => ({
    userDevice: one(userDevices, {
      fields: [staffAttendanceRecords.deviceId],
      references: [userDevices.id],
    }),
    staffLeaveRequest: one(staffLeaveRequests, {
      fields: [staffAttendanceRecords.leaveRequestId],
      references: [staffLeaveRequests.id],
    }),
    attendanceQrSession: one(attendanceQrSessions, {
      fields: [staffAttendanceRecords.qrSessionId],
      references: [attendanceQrSessions.id],
    }),
    user: one(users, {
      fields: [staffAttendanceRecords.recordedBy],
      references: [users.id],
    }),
    clinicRoom: one(clinicRooms, {
      fields: [staffAttendanceRecords.roomId],
      references: [clinicRooms.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [staffAttendanceRecords.staffProfileId],
      references: [staffProfiles.id],
    }),
    clinicUnit: one(clinicUnits, {
      fields: [staffAttendanceRecords.unitId],
      references: [clinicUnits.id],
    }),
  }),
);

export const notificationsRelations = relations(
  notifications,
  ({ one, many }) => ({
    user: one(users, {
      fields: [notifications.createdBy],
      references: [users.id],
    }),
    notificationActions: many(notificationActions),
    notificationRecipients: many(notificationRecipients),
  }),
);

export const notificationActionsRelations = relations(
  notificationActions,
  ({ one }) => ({
    notification: one(notifications, {
      fields: [notificationActions.notificationId],
      references: [notifications.id],
    }),
  }),
);

export const notificationRecipientsRelations = relations(
  notificationRecipients,
  ({ one }) => ({
    notification: one(notifications, {
      fields: [notificationRecipients.notificationId],
      references: [notifications.id],
    }),
    user: one(users, {
      fields: [notificationRecipients.userId],
      references: [users.id],
    }),
  }),
);

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    practitioner: one(practitioners, {
      fields: [conversations.assignedPractitionerId],
      references: [practitioners.id],
    }),
    staffProfile: one(staffProfiles, {
      fields: [conversations.assignedStaffId],
      references: [staffProfiles.id],
    }),
    patientProfile: one(patientProfiles, {
      fields: [conversations.patientId],
      references: [patientProfiles.id],
    }),
    conversationParticipants: many(conversationParticipants),
    messages: many(messages),
    patientTimelineEvents: many(patientTimelineEvents),
  }),
);

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationParticipants.userId],
      references: [users.id],
    }),
  }),
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [messages.senderUserId],
    references: [users.id],
  }),
  messageAttachments: many(messageAttachments),
}));

export const filesRelations = relations(files, ({ one, many }) => ({
  user: one(users, {
    fields: [files.uploadedBy],
    references: [users.id],
  }),
  userDataExportJobs: many(userDataExportJobs),
  messageAttachments: many(messageAttachments),
  supportTicketAttachments: many(supportTicketAttachments),
}));

export const supportTicketsRelations = relations(
  supportTickets,
  ({ one, many }) => ({
    staffProfile: one(staffProfiles, {
      fields: [supportTickets.assignedStaffId],
      references: [staffProfiles.id],
    }),
    user: one(users, {
      fields: [supportTickets.reporterUserId],
      references: [users.id],
    }),
    supportTicketMessages: many(supportTicketMessages),
  }),
);

export const supportTicketMessagesRelations = relations(
  supportTicketMessages,
  ({ one, many }) => ({
    user: one(users, {
      fields: [supportTicketMessages.senderUserId],
      references: [users.id],
    }),
    supportTicket: one(supportTickets, {
      fields: [supportTicketMessages.ticketId],
      references: [supportTickets.id],
    }),
    supportTicketAttachments: many(supportTicketAttachments),
  }),
);

export const userDataExportJobsRelations = relations(
  userDataExportJobs,
  ({ one }) => ({
    file: one(files, {
      fields: [userDataExportJobs.fileId],
      references: [files.id],
    }),
    user: one(users, {
      fields: [userDataExportJobs.requestedBy],
      references: [users.id],
    }),
  }),
);

export const patientTimelineEventsRelations = relations(
  patientTimelineEvents,
  ({ one }) => ({
    appointment: one(appointments, {
      fields: [patientTimelineEvents.appointmentId],
      references: [appointments.id],
    }),
    conversation: one(conversations, {
      fields: [patientTimelineEvents.conversationId],
      references: [conversations.id],
    }),
    patientProfile: one(patientProfiles, {
      fields: [patientTimelineEvents.patientId],
      references: [patientProfiles.id],
    }),
  }),
);

export const publicTestimonialsRelations = relations(
  publicTestimonials,
  ({ one }) => ({
    patientProfile: one(patientProfiles, {
      fields: [publicTestimonials.patientId],
      references: [patientProfiles.id],
    }),
  }),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
  }),
);

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const messageAttachmentsRelations = relations(
  messageAttachments,
  ({ one }) => ({
    file: one(files, {
      fields: [messageAttachments.fileId],
      references: [files.id],
    }),
    message: one(messages, {
      fields: [messageAttachments.messageId],
      references: [messages.id],
    }),
  }),
);

export const supportTicketAttachmentsRelations = relations(
  supportTicketAttachments,
  ({ one }) => ({
    file: one(files, {
      fields: [supportTicketAttachments.fileId],
      references: [files.id],
    }),
    supportTicketMessage: one(supportTicketMessages, {
      fields: [supportTicketAttachments.messageId],
      references: [supportTicketMessages.id],
    }),
  }),
);
