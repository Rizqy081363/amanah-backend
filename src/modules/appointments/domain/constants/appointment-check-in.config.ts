export interface AppointmentCheckInConfig {
  checkInWindowHours: number;
  codeLength: number;
}

export const DEFAULT_CHECK_IN_CONFIG: AppointmentCheckInConfig = {
  checkInWindowHours: Number(
    process.env.APPOINTMENT_CHECK_IN_WINDOW_HOURS || 24,
  ),
  codeLength: 6,
};
