export interface CheckInWindowEvaluation {
  isOpen: boolean;
  reason?: 'NOT_TODAY' | 'TOO_EARLY' | 'EXPIRED' | 'OK';
  openTimeStr?: string;
  closeTimeStr?: string;
  openMinutesFromMidnight?: number;
  closeMinutesFromMidnight?: number;
  currentMinutesFromMidnight?: number;
}

export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

export function formatMinutesToTime(minutesFromMidnight: number): string {
  const normalized = Math.max(0, Math.min(1439, minutesFromMidnight));
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isAppointmentWithinCheckInWindow(params: {
  scheduledDate: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  todayDateStr: string;
  currentTimeStr: string;
  arriveEarlyMinutes?: number;
  overflowToleranceMinutes?: number;
}): CheckInWindowEvaluation {
  const {
    scheduledDate,
    scheduledStartTime,
    scheduledEndTime,
    todayDateStr,
    currentTimeStr,
    arriveEarlyMinutes = 15,
    overflowToleranceMinutes = 30,
  } = params;

  // 1. Must be on the exact same clinic day
  if (scheduledDate !== todayDateStr) {
    if (scheduledDate < todayDateStr) {
      return { isOpen: false, reason: 'EXPIRED' };
    }
    return { isOpen: false, reason: 'NOT_TODAY' };
  }

  // 2. Parse current time and scheduled bounds
  const currentMinutes = parseTimeToMinutes(currentTimeStr);
  const startMinutes = parseTimeToMinutes(scheduledStartTime);
  const endMinutes = parseTimeToMinutes(scheduledEndTime);

  if (currentMinutes === null || startMinutes === null) {
    return { isOpen: false, reason: 'NOT_TODAY' };
  }

  // Window opens early by arriveEarlyMinutes before session/appointment start
  const openMinutes = Math.max(0, startMinutes - arriveEarlyMinutes);
  // Window closes after scheduledEndTime + overflowToleranceMinutes
  const closeMinutes =
    endMinutes !== null
      ? endMinutes + overflowToleranceMinutes
      : startMinutes + 60 + overflowToleranceMinutes;

  const openTimeStr = formatMinutesToTime(openMinutes);
  const closeTimeStr = formatMinutesToTime(closeMinutes);

  if (currentMinutes < openMinutes) {
    return {
      isOpen: false,
      reason: 'TOO_EARLY',
      openTimeStr,
      closeTimeStr,
      openMinutesFromMidnight: openMinutes,
      closeMinutesFromMidnight: closeMinutes,
      currentMinutesFromMidnight: currentMinutes,
    };
  }

  if (currentMinutes > closeMinutes) {
    return {
      isOpen: false,
      reason: 'EXPIRED',
      openTimeStr,
      closeTimeStr,
      openMinutesFromMidnight: openMinutes,
      closeMinutesFromMidnight: closeMinutes,
      currentMinutesFromMidnight: currentMinutes,
    };
  }

  return {
    isOpen: true,
    reason: 'OK',
    openTimeStr,
    closeTimeStr,
    openMinutesFromMidnight: openMinutes,
    closeMinutesFromMidnight: closeMinutes,
    currentMinutesFromMidnight: currentMinutes,
  };
}
