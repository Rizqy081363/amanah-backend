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
  totalAvailableSlots: number;
  referenceDate?: Date;
}

export interface SessionTemporalAvailabilityResult {
  isPast: boolean;
  isDisabled: boolean;
  disabledReason: BookingSessionDisabledReason | null;
  effectiveAvailableSlots: number;
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

  if (isPast) {
    return {
      isPast: true,
      isDisabled: true,
      disabledReason: BOOKING_SESSION_DISABLED_REASONS.ELAPSED,
      effectiveAvailableSlots: 0,
    };
  }

  if (input.practitionerSessions.length === 0) {
    return {
      isPast: false,
      isDisabled: true,
      disabledReason: BOOKING_SESSION_DISABLED_REASONS.NO_SCHEDULE,
      effectiveAvailableSlots: 0,
    };
  }

  const isFull = input.totalAvailableSlots <= 0;
  if (isFull) {
    return {
      isPast: false,
      isDisabled: true,
      disabledReason: BOOKING_SESSION_DISABLED_REASONS.QUOTA_FULL,
      effectiveAvailableSlots: 0,
    };
  }

  return {
    isPast: false,
    isDisabled: false,
    disabledReason: null,
    effectiveAvailableSlots: input.totalAvailableSlots,
  };
}

export interface CalculateDoctorSessionAvailableSlotsInput {
  scheduleDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  availableSlots: number;
  durationMinutes: number;
  bookedStartTimes?: Set<string> | string[];
  referenceDate?: Date;
}

export function calculateDoctorSessionAvailableSlots(
  input: CalculateDoctorSessionAvailableSlotsInput,
): number {
  const clinicNow = getClinicNow(input.referenceDate);
  const isPastDate = input.scheduleDate < clinicNow.date;
  const isToday = input.scheduleDate === clinicNow.date;

  if (isPastDate) {
    return 0;
  }

  const startMinutes = parseClockTime(input.startTime.slice(0, 5));
  const endMinutes = parseSessionEndMinutes(input.startTime, input.endTime);
  const duration = input.durationMinutes > 0 ? input.durationMinutes : 30;

  const bookedTimes =
    input.bookedStartTimes instanceof Set
      ? input.bookedStartTimes
      : new Set((input.bookedStartTimes || []).map((t) => t.slice(0, 5)));

  let candidateMinutes = startMinutes;
  let allocatableCount = 0;

  while (candidateMinutes + duration <= endMinutes) {
    if (isToday && candidateMinutes + duration <= clinicNow.currentMinutes) {
      candidateMinutes += duration;
      continue;
    }

    const hh = String(Math.floor(candidateMinutes / 60) % 24).padStart(2, '0');
    const mm = String(candidateMinutes % 60).padStart(2, '0');
    const timeStr = `${hh}:${mm}`;

    if (!bookedTimes.has(timeStr)) {
      allocatableCount++;
    }

    candidateMinutes += duration;
  }

  return Math.max(0, Math.min(input.availableSlots, allocatableCount));
}
