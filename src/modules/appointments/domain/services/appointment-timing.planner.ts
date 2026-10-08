import type {
  AppointmentTimingInput,
  EstimatedTiming,
} from '../types/appointment.types';

export function planAppointmentTiming(
  input: AppointmentTimingInput,
): EstimatedTiming {
  const durationMs = (input.durationMinutes || 30) * 60_000;
  const estimatedStartAt = new Date(
    input.dayStart.getTime() + (input.queueNumber - 1) * durationMs,
  );
  const estimatedEndAt = new Date(estimatedStartAt.getTime() + durationMs);
  return { estimatedStartAt, estimatedEndAt };
}
