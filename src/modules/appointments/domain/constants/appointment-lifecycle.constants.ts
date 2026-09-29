export const MAX_PATIENT_CALL_ATTEMPTS = 3;

export const APPOINTMENT_CALL_STATUS = {
  CALLED: 'called',
  RESPONDED: 'responded',
  NO_RESPONSE: 'no_response',
} as const;

export type AppointmentCallStatus =
  (typeof APPOINTMENT_CALL_STATUS)[keyof typeof APPOINTMENT_CALL_STATUS];

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
} as const;

export const APPOINTMENT_LIFECYCLE_EVENTS = APPOINTMENT_EVENTS;

export const APPOINTMENT_CALL_REPOSITORY = Symbol(
  'APPOINTMENT_CALL_REPOSITORY',
);
