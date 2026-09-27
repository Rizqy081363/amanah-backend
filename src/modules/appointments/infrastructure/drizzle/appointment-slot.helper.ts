export function allocateSlotTiming(
  sessionStart: string,
  sessionEnd: string,
  existingStartTimes: string[],
  durationMinutes = 30,
): { startTime: string; endTime: string } {
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

  let currentMinutes = sessionStartMinutes;
  while (currentMinutes + durationMinutes <= sessionEndMinutes) {
    const hh = String(Math.floor(currentMinutes / 60) % 24).padStart(2, '0');
    const mm = String(currentMinutes % 60).padStart(2, '0');
    const candidateTime = `${hh}:${mm}`;

    if (!normalizedExisting.has(candidateTime)) {
      const endMins = currentMinutes + durationMinutes;
      const endHh = String(Math.floor(endMins / 60) % 24).padStart(2, '0');
      const endMm = String(endMins % 60).padStart(2, '0');
      return {
        startTime: `${candidateTime}:00`,
        endTime: `${endHh}:${endMm}:00`,
      };
    }
    currentMinutes += durationMinutes;
  }

  return {
    startTime: sessionStart.length === 5 ? `${sessionStart}:00` : sessionStart,
    endTime: sessionEnd.length === 5 ? `${sessionEnd}:00` : sessionEnd,
  };
}
