export interface AppointmentCheckInConfig {
  checkInWindowHours: number;
  codeLength: number;
}

export const TIME_CONSTANTS = {
  MILLISECONDS_PER_SECOND: 1_000,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
  MILLISECONDS_PER_MINUTE: 60_000,
  MILLISECONDS_PER_HOUR: 3_600_000,
} as const;

export function hoursToMilliseconds(hours: number): number {
  return hours * TIME_CONSTANTS.MILLISECONDS_PER_HOUR;
}

export const DEFAULT_CHECK_IN_CONFIG: AppointmentCheckInConfig = {
  checkInWindowHours: Number(
    process.env.APPOINTMENT_CHECK_IN_WINDOW_HOURS || 24,
  ),
  codeLength: 6,
};
