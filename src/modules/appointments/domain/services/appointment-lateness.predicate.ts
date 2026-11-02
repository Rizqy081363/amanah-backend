export function isAppointmentLate(
  estimatedStartAt: Date,
  now: Date,
  overflowToleranceMinutes: number,
): boolean {
  const windowMs = overflowToleranceMinutes * 60_000;
  return now.getTime() - estimatedStartAt.getTime() >= windowMs;
}
