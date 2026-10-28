import { attendanceMethod } from '../../../../database/schema/amanah.schema';

export const CANONICAL_STAFF_SHIFTS = [
  'early_morning',
  'morning',
  'afternoon',
  'night',
] as const;

export type ShiftCode = (typeof CANONICAL_STAFF_SHIFTS)[number];

export const CANONICAL_STAFF_SHIFT_VALUES = CANONICAL_STAFF_SHIFTS as unknown as [
  ShiftCode,
  ...ShiftCode[],
];

export const ATTENDANCE_ACTIONS = {
  CHECK_IN: 'check_in',
  MANUAL_CHECK_IN: 'manual_check_in',
  CHECK_OUT: 'check_out',
} as const;

export type AttendanceAction =
  (typeof ATTENDANCE_ACTIONS)[keyof typeof ATTENDANCE_ACTIONS];

export type AttendanceMethod = (typeof attendanceMethod.enumValues)[number];
export const ATTENDANCE_METHODS = attendanceMethod.enumValues as unknown as [
  AttendanceMethod,
  ...AttendanceMethod[],
];

export const ATTENDANCE_STATUSES = [
  'present',
  'late',
  'leave',
  'absent',
  'missed',
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_VALUES = ATTENDANCE_STATUSES as unknown as [
  AttendanceStatus,
  ...AttendanceStatus[],
];


export function isValidShift(shift: string): shift is ShiftCode {
  return (CANONICAL_STAFF_SHIFTS as readonly string[]).includes(shift);
}

export function isValidStatus(status: string): status is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(status);
}

/**
 * Normalizes shift string safely, preserving domain validity without inventing values.
 */
export function normalizeShift(rawShift?: string | null): ShiftCode | undefined {
  if (rawShift) {
    const s = rawShift.trim().toLowerCase();
    if (isValidShift(s)) {
      return s;
    }
  }
  return undefined;
}

/**
 * Normalizes status string safely, preserving domain validity without inventing values.
 */
export function normalizeStatus(rawStatus?: string | null): AttendanceStatus | undefined {
  if (rawStatus) {
    const s = rawStatus.trim().toLowerCase();
    if (isValidStatus(s)) {
      return s;
    }
  }
  return undefined;
}
