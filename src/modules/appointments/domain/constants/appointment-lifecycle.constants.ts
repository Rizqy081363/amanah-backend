export const MAX_PATIENT_CALL_ATTEMPTS = 3;

export const APPOINTMENT_CALL_STATUS = {
  CALLED: 'called',
  RESPONDED: 'responded',
  NO_RESPONSE: 'no_response',
} as const;

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

export const TERMINAL_APPOINTMENT_STATUSES = [
  DB_APPOINTMENT_STATUS.COMPLETED,
  DB_APPOINTMENT_STATUS.CANCELLED,
] as const;

export function isTerminalAppointmentStatus(
  status: string | null | undefined,
): boolean {
  return (
    status === DB_APPOINTMENT_STATUS.COMPLETED ||
    status === DB_APPOINTMENT_STATUS.CANCELLED
  );
}

export const QUEUE_TICKET_STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  IN_SERVICE: 'in_service',
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
} as const;

export const DOMAIN_APPOINTMENT_STATUS = {
  BOOKED: 'BOOKED',
  WAITING: 'WAITING',
  IN_SERVICE: 'IN_SERVICE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  LATE: 'LATE',
} as const;

export const APPOINTMENT_EVENTS = {
  CREATED: 'appointment.created.v1',
  CHECKED_IN: 'appointment.checked_in.v1',
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

export const DOCTOR_AVAILABILITY = {
  AVAILABLE: 'AVAILABLE',
  SCHEDULE_REQUIRED: 'SCHEDULE_REQUIRED',
} as const;

export type DoctorAvailability =
  (typeof DOCTOR_AVAILABILITY)[keyof typeof DOCTOR_AVAILABILITY];

export const SHIFT_EXCEPTION_TYPE = {
  LEAVE: 'leave',
  EXTRA: 'extra',
} as const;

import { STAFF_TYPES } from '../../../../common/constants/staff-types.constant';

export const STAFF_TYPE = STAFF_TYPES;
