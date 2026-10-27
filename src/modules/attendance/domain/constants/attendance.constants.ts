import { attendanceMethod } from '../../../../database/schema/amanah.schema';

export const CANONICAL_STAFF_SHIFTS = [
  'early_morning',
  'morning',
  'afternoon',
  'night',
] as const;

export type ShiftCode = (typeof CANONICAL_STAFF_SHIFTS)[number];

export const ATTENDANCE_ACTIONS = {
  CHECK_IN: 'check_in',
  MANUAL_CHECK_IN: 'manual_check_in',
  CHECK_OUT: 'check_out',
} as const;

export type AttendanceAction =
  (typeof ATTENDANCE_ACTIONS)[keyof typeof ATTENDANCE_ACTIONS];

export type AttendanceMethod = (typeof attendanceMethod.enumValues)[number];
export const ATTENDANCE_METHODS = attendanceMethod.enumValues;

export const ATTENDANCE_STATUSES = [
  'present',
  'late',
  'leave',
  'absent',
  'missed',
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const SHIFT_LABEL_MAP: Record<ShiftCode, string> = {
  early_morning: 'Dini Hari',
  morning: 'Pagi',
  afternoon: 'Siang',
  night: 'Malam',
};

export const STATUS_LABEL_MAP: Record<AttendanceStatus, string> = {
  present: 'Hadir',
  late: 'Terlambat',
  leave: 'Izin / Cuti',
  absent: 'Tidak Hadir',
  missed: 'Tidak Hadir',
};

export const CATEGORY_LABEL_MAP: Record<string, string> = {
  doctor: 'Dokter',
  midwife: 'Bidan',
  worker: 'Staf',
};

export function normalizeShift(rawShift?: string | null): ShiftCode {
  if (rawShift) {
    const s = rawShift.trim().toLowerCase();
    if ((CANONICAL_STAFF_SHIFTS as readonly string[]).includes(s)) {
      return s as ShiftCode;
    }
  }
  return 'morning';
}

export function normalizeStatus(rawStatus?: string | null): AttendanceStatus {
  if (rawStatus) {
    const s = rawStatus.trim().toLowerCase();
    if ((ATTENDANCE_STATUSES as readonly string[]).includes(s)) {
      return s as AttendanceStatus;
    }
  }
  return 'present';
}
