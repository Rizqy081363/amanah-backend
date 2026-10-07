import type {
  AppointmentSlotInput,
  PlannedSlot,
} from '../types/appointment.types';

export function planSlot(input: AppointmentSlotInput): PlannedSlot {
  const slotMs = input.slotMinutes * 60_000;
  const estimatedStartAt = new Date(
    input.dayStart.getTime() + (input.queueNumber - 1) * slotMs,
  );
  const estimatedEndAt = new Date(estimatedStartAt.getTime() + slotMs);
  return { estimatedStartAt, estimatedEndAt };
}
