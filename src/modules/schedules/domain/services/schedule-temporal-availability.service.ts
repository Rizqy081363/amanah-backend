import {
  BOOKING_SESSION_DISABLED_REASONS,
  type BookingSessionDisabledReason,
} from '../constants/schedule-shift.constants';
import { parseClockTime } from '../schedule-projection';
import { getClinicNow } from './schedule-date.formatter';

export interface SessionTimingInput {
  startTime: string;
  endTime: string;
}

export function parseSessionEndMinutes(
  startTime: string,
  endTime: string,
): number {
  const start = parseClockTime(startTime.slice(0, 5));
  let end = parseClockTime(endTime.slice(0, 5));
  if (end <= start) {
    end += 1440;
  }
  return end;
}

export function resolveEffectiveEndMinutes(
  defaultTiming: SessionTimingInput,
  practitionerSessions: SessionTimingInput[],
): number {
  if (practitionerSessions.length === 0) {
    return parseSessionEndMinutes(
      defaultTiming.startTime,
      defaultTiming.endTime,
    );
  }

  const endMinutesList = practitionerSessions.map((session) =>
    parseSessionEndMinutes(session.startTime, session.endTime),
  );

  return Math.max(...endMinutesList);
}

export interface EvaluateSessionTemporalInput {
  scheduleDate: string;
  defaultTiming: SessionTimingInput;
  practitionerSessions: SessionTimingInput[];
  referenceDate?: Date;
}

export interface SessionTemporalAvailabilityResult {
  isPast: boolean;
  isDisabled: boolean;
  disabledReason: BookingSessionDisabledReason | null;
}

export function evaluateSessionTemporalAvailability(
  input: EvaluateSessionTemporalInput,
): SessionTemporalAvailabilityResult {
  const clinicNow = getClinicNow(input.referenceDate);
  const isPastDate = input.scheduleDate < clinicNow.date;
  const isToday = input.scheduleDate === clinicNow.date;

  const effectiveEndMinutes = resolveEffectiveEndMinutes(
    input.defaultTiming,
    input.practitionerSessions,
  );

  const isPast =
    isPastDate || (isToday && effectiveEndMinutes <= clinicNow.currentMinutes);

  // Aligned with Queue Paradigm Rule R19: Operational status signals past or ongoing shift,
  // never artificially hard-blocking or disabling sessions.
  return {
    isPast,
    isDisabled: false,
    disabledReason: null,
  };
}
