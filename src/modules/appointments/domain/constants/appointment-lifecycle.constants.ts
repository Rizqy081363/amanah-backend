export const MAX_PATIENT_CALL_ATTEMPTS = 3;

export const APPOINTMENT_CALL_STATUS = {
  CALLED: 'called',
  RESPONDED: 'responded',
  NO_RESPONSE: 'no_response',
} as const;

export type AppointmentCallStatus =
  (typeof APPOINTMENT_CALL_STATUS)[keyof typeof APPOINTMENT_CALL_STATUS];

export const APPOINTMENT_EVENTS = {
  PATIENT_CALLED: 'appointment.patient_called.v1',
  PATIENT_REQUEUED: 'appointment.patient_requeued.v1',
  PATIENT_RESPONDED: 'appointment.patient_responded.v1',
  NO_SHOW: 'appointment.no_show.v1',
  COMPLETED: 'appointment.completed.v1',
  CANCELLED: 'appointment.cancelled.v1',
} as const;

export const APPOINTMENT_CALL_REPOSITORY = Symbol(
  'APPOINTMENT_CALL_REPOSITORY',
);
