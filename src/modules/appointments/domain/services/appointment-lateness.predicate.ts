import {
  DEFAULT_CHECK_IN_CONFIG,
  hoursToMilliseconds,
} from '../constants/appointment-check-in.config';

export function isAppointmentLate(
  estimatedStartAt: Date,
  now: Date = new Date(),
  windowHours: number = DEFAULT_CHECK_IN_CONFIG.checkInWindowHours,
): boolean {
  const windowMs = hoursToMilliseconds(windowHours);
  return now.getTime() - estimatedStartAt.getTime() >= windowMs;
}
