const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function isAppointmentLate(estimatedStartAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - estimatedStartAt.getTime() >= TWENTY_FOUR_HOURS_MS;
}
