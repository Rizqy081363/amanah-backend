import {
  type CanonicalStaffShift,
  resolveCanonicalShift,
  SHIFT_TIMING_CONFIGS,
} from '@modules/schedules/domain/constants/schedule-shift.constants';

export const SESSION_RECORD_RELATIONS = {
  practitioner: {
    with: {
      staffProfile: {
        with: {
          clinicUnit: true,
          user: true,
        },
      },
    },
  },
  clinicRoom: {
    with: {
      clinicUnit: true,
    },
  },
  clinicService: true,
} as const;

export type SessionShiftType = CanonicalStaffShift;

export function resolveSessionShift(input: {
  session?: string | null;
  sessionShift?: string | null;
}): {
  shift: SessionShiftType;
  defaultLabel: string;
} {
  const resolved = resolveCanonicalShift(input);
  return {
    shift: resolved.shift,
    defaultLabel: resolved.label,
  };
}

export function resolveDefaultSessionTimes(shift: SessionShiftType): {
  startTime: string;
  endTime: string;
} {
  const config = SHIFT_TIMING_CONFIGS[shift] || SHIFT_TIMING_CONFIGS.morning;
  return {
    startTime: config.defaultStartTime,
    endTime: config.defaultEndTime,
  };
}
