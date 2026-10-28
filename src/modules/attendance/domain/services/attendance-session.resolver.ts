import {
  NoActiveSessionException,
  SessionExpiredException,
  SessionMismatchException,
} from '../errors/attendance-domain.errors';

export interface CandidateScheduledSession {
  id: string;
  sessionId: string;
  shift: string;
  startsAt: string | null;
  endsAt: string | null;
  isReplacement?: boolean;
  replacementOpportunityId?: string | null;
  originalStaffName?: string | null;
  originalStaffCode?: string | null;
}

export interface ResolveActiveSessionParams {
  candidateSessions: CandidateScheduledSession[];
  currentTime: Date;
  checkInWindowMinutesBefore: number;
  requestedShift?: string | null;
  requestedSessionId?: string | null;
  shiftHint?: string | null;
  isAdministrativeEntry?: boolean;
}

export interface ResolvedActiveSessionResult {
  session: CandidateScheduledSession;
  isLate: boolean;
  lateMinutes: number;
}

/**
 * Converts a time string "HH:mm:ss" or "HH:mm" into total minutes from midnight.
 * Treats "24:00:00" as 1440 minutes (end of day).
 */
export function timeStringToMinutes(timeStr: string | null | undefined): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  if (h === 24 || (h === 0 && parts[0] === '24')) {
    return 1440;
  }
  return h * 60 + m;
}

/**
 * Pure domain resolver for dynamic session resolution.
 * Strictly respects database schedules, start/end boundaries, and check-in window policies.
 */
export function resolveActiveSessionForCheckIn(
  params: ResolveActiveSessionParams,
): ResolvedActiveSessionResult {
  const {
    candidateSessions,
    currentTime,
    checkInWindowMinutesBefore,
    requestedShift,
    requestedSessionId,
    shiftHint,
    isAdministrativeEntry = false,
  } = params;

  if (candidateSessions.length === 0) {
    throw new NoActiveSessionException(
      'Staf tidak memiliki jadwal dinas aktif pada hari ini.',
    );
  }

  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // 1. If client explicitly requested a shift or sessionId, validate against scheduled candidates
  if (requestedShift || requestedSessionId) {
    const matched = candidateSessions.find((s) => {
      if (requestedSessionId && s.sessionId === requestedSessionId) return true;
      if (requestedShift && s.shift.toLowerCase() === requestedShift.toLowerCase()) return true;
      return false;
    });

    if (!matched) {
      throw new SessionMismatchException();
    }

    // Administrative entry allows recording presence for scheduled shift regardless of current time
    if (!isAdministrativeEntry) {
      const startMinutes = timeStringToMinutes(matched.startsAt);
      const rawEndMinutes = timeStringToMinutes(matched.endsAt);
      const endMinutes = rawEndMinutes === 0 ? 1440 : rawEndMinutes;
      const windowStart = Math.max(0, startMinutes - checkInWindowMinutesBefore);

      if (nowMinutes > endMinutes) {
        throw new SessionExpiredException(
          `Sesi dinas '${matched.shift}' telah berakhir. Presensi masuk tidak dapat dilakukan setelah jam dinas selesai.`,
        );
      }

      if (nowMinutes < windowStart) {
        throw new NoActiveSessionException(
          `Jendela presensi masuk untuk sesi '${matched.shift}' belum dibuka. Jam masuk dinas: ${matched.startsAt?.slice(0, 5)}.`,
        );
      }
    }

    return {
      session: matched,
      isLate: false,
      lateMinutes: 0,
    };
  }

  // 2. Dynamic Progressive Resolution: Check which candidate sessions have an open check-in window right now
  const openSessions = candidateSessions.filter((s) => {
    const startMinutes = timeStringToMinutes(s.startsAt);
    const rawEndMinutes = timeStringToMinutes(s.endsAt);
    const endMinutes = rawEndMinutes === 0 ? 1440 : rawEndMinutes;
    const windowStart = Math.max(0, startMinutes - checkInWindowMinutesBefore);

    return nowMinutes >= windowStart && nowMinutes <= endMinutes;
  });

  if (openSessions.length > 0) {
    // If shiftHint is provided and matches one of the open sessions, prioritize that session
    let selected: CandidateScheduledSession | undefined;
    if (shiftHint) {
      selected = openSessions.find(
        (s) => s.shift.toLowerCase() === shiftHint.toLowerCase(),
      );
    }

    // Otherwise, pick the open session closest to current time
    if (!selected) {
      selected = openSessions.reduce((prev, curr) => {
        const prevStart = timeStringToMinutes(prev.startsAt);
        const currStart = timeStringToMinutes(curr.startsAt);
        return Math.abs(nowMinutes - currStart) < Math.abs(nowMinutes - prevStart)
          ? curr
          : prev;
      });
    }

    return {
      session: selected,
      isLate: false,
      lateMinutes: 0,
    };
  }

  // Administrative entry without explicit shift defaults to first scheduled session
  if (isAdministrativeEntry && candidateSessions.length > 0) {
    return {
      session: candidateSessions[0],
      isLate: false,
      lateMinutes: 0,
    };
  }

  // 3. No session currently open: Determine if all scheduled sessions for today have expired
  const allExpired = candidateSessions.every((s) => {
    const rawEndMinutes = timeStringToMinutes(s.endsAt);
    const endMinutes = rawEndMinutes === 0 ? 1440 : rawEndMinutes;
    return nowMinutes > endMinutes;
  });

  if (allExpired) {
    throw new SessionExpiredException(
      'Sesi dinas staf untuk hari ini telah berakhir. Presensi masuk tidak dapat dilakukan setelah jam dinas selesai.',
    );
  }

  throw new NoActiveSessionException(
    'Tidak ada sesi dinas yang aktif pada jam ini untuk staf tersebut.',
  );
}
