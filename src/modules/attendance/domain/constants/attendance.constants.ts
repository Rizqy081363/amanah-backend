import { attendanceMethod } from '../../../../database/schema/amanah.schema';

export type ShiftCode = 'early_morning' | 'morning' | 'afternoon' | 'night';

export const ATTENDANCE_ACTIONS = {
  CHECK_IN: 'check_in',
  MANUAL_CHECK_IN: 'manual_check_in',
  CHECK_OUT: 'check_out',
} as const;

export type AttendanceAction =
  (typeof ATTENDANCE_ACTIONS)[keyof typeof ATTENDANCE_ACTIONS];

export type AttendanceMethod = (typeof attendanceMethod.enumValues)[number];
export const ATTENDANCE_METHODS = attendanceMethod.enumValues;

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'leave'
  | 'absent'
  | 'missed';

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

export function normalizeShift(rawShift?: string): ShiftCode {
  if (!rawShift) return 'morning';
  const s = rawShift.toLowerCase();
  if (s === 'pagi' || s === 'morning') return 'morning';
  if (s === 'siang' || s === 'afternoon') return 'afternoon';
  if (s === 'malam' || s === 'night') return 'night';
  if (s === 'dini' || s === 'early_morning') return 'early_morning';
  return 'morning';
}

export function normalizeStatus(rawStatus?: string): AttendanceStatus {
  if (!rawStatus) return 'present';
  const s = rawStatus.toLowerCase();
  if (s === 'hadir' || s === 'present') return 'present';
  if (s === 'terlambat' || s === 'telat' || s === 'late') return 'late';
  if (s === 'cuti' || s === 'izin' || s === 'leave') return 'leave';
  if (s === 'missed') return 'missed';
  return 'absent';
}
