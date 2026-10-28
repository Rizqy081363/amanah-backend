import { attendanceMethod } from '../../../../database/schema/amanah.schema';

export type ShiftCode = string;

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


export function isValidShift(shift: string): boolean {
  return typeof shift === 'string' && shift.trim().length > 0;
}

export function isValidStatus(status: string): status is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(status);
}

/**
 * Normalizes shift string safely, preserving domain validity without inventing values.
 */
export function normalizeShift(rawShift?: string | null): string | undefined {
  if (rawShift) {
    const s = rawShift.trim();
    if (s.length > 0) {
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
