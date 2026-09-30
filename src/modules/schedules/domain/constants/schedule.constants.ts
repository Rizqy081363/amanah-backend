export const CLINIC_TIMEZONE = 'Asia/Jakarta';

export const ACTIVE_APPOINTMENT_STATUSES = [
  'booked',
  'checked_in',
  'waiting',
  'in_service',
] as const;

export const INACTIVE_APPOINTMENT_STATUSES = ['cancelled', 'no_show'] as const;

export const APPOINTMENT_STATUS_BADGE_MAP: Record<string, string> = {
  booked: 'Booked',
  checked_in: 'Menunggu',
  waiting: 'Menunggu',
  in_service: 'Di Sesi',
  completed: 'Selesai',
  cancelled: 'Batal',
  no_show: 'Terlambat',
};

export const DEFAULT_CONSULTATION_DURATION_MINUTES = 30;
export const DEFAULT_START_PRECISION_MINUTES = 1;
export const DEFAULT_TARGET_QUOTA = 8;

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
