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

  // Under the queue-ticket model (Rule P4), patients are never blocked from booking.
  // Capacity limits adjust wait estimates or display soft load warnings rather than disabling controls.
  const fallbackSlots =
    input.practitionerSessions.length === 0
      ? 20
      : Math.max(1, input.totalAvailableSlots);

  return {
    isPast: false,
    isDisabled: false,
    disabledReason: null,
    effectiveAvailableSlots: fallbackSlots,
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

  const endMinutes = parseSessionEndMinutes(input.startTime, input.endTime);
  if (isToday && endMinutes <= clinicNow.currentMinutes) {
    return 0;
  }

  const bookedCount =
    input.bookedStartTimes instanceof Set
      ? input.bookedStartTimes.size
      : Array.isArray(input.bookedStartTimes)
        ? input.bookedStartTimes.length
        : 0;

  const sessionCapacity =
    input.capacity > 0 ? input.capacity : Math.max(0, input.availableSlots);

  return Math.max(0, sessionCapacity - bookedCount);
}

