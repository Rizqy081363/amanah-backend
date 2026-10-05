import { getClinicNow } from '../../../schedules/domain/services/schedule-date.formatter';

export function allocateSlotTiming(
  sessionStart: string,
  sessionEnd: string,
  existingStartTimes: string[],
  durationMinutes = 30,
  appointmentDate?: string,
): { startTime: string; endTime: string } | null {
  const [startHour, startMin] = sessionStart
    .split(':')
    .map((v) => parseInt(v, 10));
  const [endHour, endMin] = sessionEnd.split(':').map((v) => parseInt(v, 10));
  const sessionStartMinutes = startHour * 60 + startMin;
  const sessionEndMinutes =
    (endHour === 0 && startHour > 0 ? 24 : endHour) * 60 + endMin;

  const normalizedExisting = new Set(
    existingStartTimes.map((t) => t.slice(0, 5)),
  );

  let isToday = false;
  let clinicCurrentMinutes = 0;

  if (appointmentDate) {
    const clinicNow = getClinicNow();
    if (appointmentDate < clinicNow.date) {
      return null;
    }
    if (appointmentDate === clinicNow.date) {
      isToday = true;
      clinicCurrentMinutes = clinicNow.currentMinutes;
    }
  }

  let candidateMinutes = sessionStartMinutes;
  while (candidateMinutes + durationMinutes <= sessionEndMinutes) {
    if (isToday && candidateMinutes + durationMinutes <= clinicCurrentMinutes) {
      candidateMinutes += durationMinutes;
      continue;
    }

    const hh = String(Math.floor(candidateMinutes / 60) % 24).padStart(2, '0');
    const mm = String(candidateMinutes % 60).padStart(2, '0');
    const candidateTime = `${hh}:${mm}`;

    if (!normalizedExisting.has(candidateTime)) {
      const endMins = candidateMinutes + durationMinutes;
      const endHh = String(Math.floor(endMins / 60) % 24).padStart(2, '0');
      const endMm = String(endMins % 60).padStart(2, '0');
      return {
        startTime: `${candidateTime}:00`,
        endTime: `${endHh}:${endMm}:00`,
      };
    }
    candidateMinutes += durationMinutes;
  }

  return null;
}
