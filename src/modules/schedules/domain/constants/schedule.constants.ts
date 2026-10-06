export const ACTIVE_APPOINTMENT_STATUSES = [
  'booked',
  'checked_in',
  'waiting',
  'in_service',
] as const;

export const INACTIVE_APPOINTMENT_STATUSES = ['cancelled', 'no_show'] as const;

export const SCHEDULE_SLOT_STATUS = {
  AVAILABLE: 'AVAILABLE',
  PAST: 'PAST',
  OCCUPIED_BY_OTHER: 'OCCUPIED_BY_OTHER',
  OCCUPIED_BY_SELF: 'OCCUPIED_BY_SELF',
  CLOSED_LEAVE: 'CLOSED_LEAVE',
} as const;

export type ScheduleSlotStatus =
  (typeof SCHEDULE_SLOT_STATUS)[keyof typeof SCHEDULE_SLOT_STATUS];

export const SCHEDULE_SLOT_CONFLICT_TYPE = {
  TEMPORAL_PAST: 'TEMPORAL_PAST',
  ROOM_OCCUPIED: 'ROOM_OCCUPIED',
  PRACTITIONER_OVERLAP: 'PRACTITIONER_OVERLAP',
  LEAVE: 'LEAVE',
} as const;

export type ScheduleSlotConflictType =
  (typeof SCHEDULE_SLOT_CONFLICT_TYPE)[keyof typeof SCHEDULE_SLOT_CONFLICT_TYPE];

export const APPOINTMENT_STATUS_BADGE_MAP: Record<string, string> = {
  booked: 'Booked',
  checked_in: 'Menunggu',
  waiting: 'Menunggu',
  in_service: 'Di Sesi',
  completed: 'Selesai',
  cancelled: 'Batal',
  no_show: 'Terlambat',
};

export const CLINIC_POLICY_FALLBACK_CONFIG = {
  consultationDurationMinutes: 30,
  startPrecisionMinutes: 1,
  targetQuota: 8,
} as const;

export const DEFAULT_CONSULTATION_DURATION_MINUTES =
  CLINIC_POLICY_FALLBACK_CONFIG.consultationDurationMinutes;
export const DEFAULT_START_PRECISION_MINUTES =
  CLINIC_POLICY_FALLBACK_CONFIG.startPrecisionMinutes;
export const DEFAULT_TARGET_QUOTA =
  CLINIC_POLICY_FALLBACK_CONFIG.targetQuota;

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export const INDO_DAYS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
] as const;

export const INDO_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

export const INDO_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;
