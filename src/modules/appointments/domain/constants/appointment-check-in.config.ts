export interface AppointmentCheckInConfig {
  checkInWindowHours: number;
  qrCodeTtlMinutes: number;
  codeLength: number;
}

export const DEFAULT_CHECK_IN_CONFIG: AppointmentCheckInConfig = {
  checkInWindowHours: Number(
    process.env.APPOINTMENT_CHECK_IN_WINDOW_HOURS || 24,
  ),
  qrCodeTtlMinutes: Number(process.env.APPOINTMENT_QR_TTL_MINUTES || 60),
  codeLength: 6,
};
