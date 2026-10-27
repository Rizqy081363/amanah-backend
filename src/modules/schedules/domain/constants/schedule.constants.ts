import { isUUID } from 'class-validator';

export const ACTIVE_APPOINTMENT_STATUSES = [
  'booked',
  'checked_in',
  'waiting',
  'in_service',
] as const;

export const INACTIVE_APPOINTMENT_STATUSES = ['cancelled', 'no_show'] as const;

export const CLINIC_POLICY_FALLBACK_CONFIG = {
  consultationDurationMinutes: 30,
  startPrecisionMinutes: 1,
} as const;

export const DEFAULT_CONSULTATION_DURATION_MINUTES =
  CLINIC_POLICY_FALLBACK_CONFIG.consultationDurationMinutes;
export const DEFAULT_START_PRECISION_MINUTES =
  CLINIC_POLICY_FALLBACK_CONFIG.startPrecisionMinutes;

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && isUUID(value);
}
