import { DEFAULT_CHECK_IN_CONFIG } from '../constants/appointment-check-in.config';

export function isAppointmentLate(
  estimatedStartAt: Date,
  now: Date = new Date(),
  windowHours: number = DEFAULT_CHECK_IN_CONFIG.checkInWindowHours,
): boolean {
  const windowMs = windowHours * 60 * 60 * 1000;
  return now.getTime() - estimatedStartAt.getTime() >= windowMs;
}
