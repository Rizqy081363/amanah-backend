export const MAX_PATIENT_CALL_ATTEMPTS = 3;

export const APPOINTMENT_CALL_STATUS = {
  CALLED: 'called',
  RESPONDED: 'responded',
  NO_RESPONSE: 'no_response',
} as const;

export type AppointmentCallStatus =
  (typeof APPOINTMENT_CALL_STATUS)[keyof typeof APPOINTMENT_CALL_STATUS];

export const DB_APPOINTMENT_STATUS = {
  BOOKED: 'booked',
  CHECKED_IN: 'checked_in',
  WAITING: 'waiting',
  IN_SERVICE: 'in_service',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_DOCTOR: 'no_doctor',
  NO_SHOW: 'no_show',
  LATE: 'late',
} as const;

export type DbAppointmentStatusValue =
  (typeof DB_APPOINTMENT_STATUS)[keyof typeof DB_APPOINTMENT_STATUS];

export const QUEUE_TICKET_STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  IN_SERVICE: 'in_service',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
} as const;

export type QueueTicketStatusValue =
  (typeof QUEUE_TICKET_STATUS)[keyof typeof QUEUE_TICKET_STATUS];

export const DOMAIN_APPOINTMENT_STATUS = {
  BOOKED: 'BOOKED',
  WAITING: 'WAITING',
  IN_SERVICE: 'IN_SERVICE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  LATE: 'LATE',
} as const;

export type DomainAppointmentStatusValue =
  (typeof DOMAIN_APPOINTMENT_STATUS)[keyof typeof DOMAIN_APPOINTMENT_STATUS];

export const APPOINTMENT_EVENTS = {
  CREATED: 'appointment.created.v1',
  NEW_BOOKING_ALERT: 'appointment.new_booking_alert.v1',
  PATIENT_CALLED: 'appointment.patient_called.v1',
  PATIENT_REQUEUED: 'appointment.patient_requeued.v1',
  PATIENT_RESPONDED: 'appointment.patient_responded.v1',
  NO_SHOW: 'appointment.no_show.v1',
  COMPLETED: 'appointment.completed.v1',
  CANCELLED: 'appointment.cancelled.v1',
  RESCHEDULED: 'appointment.rescheduled.v1',
  ASSIGNMENT_UPDATED: 'appointment.assignment_updated.v1',
} as const;

export const APPOINTMENT_LIFECYCLE_EVENTS = APPOINTMENT_EVENTS;

export const APPOINTMENT_CALL_REPOSITORY = Symbol(
  'APPOINTMENT_CALL_REPOSITORY',
);

export const CLINIC_ADMIN_STAFF_ROLE_CODES = [
  'admin',
  'staff_worker',
  'staff_doctor',
  'staff_midwife',
  'staf',
  'staff',
] as const;
