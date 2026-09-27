/**
 * Canonical Shift & Session Constants (Database-Driven)
 *
 * Sourced directly from PostgreSQL enum `staff_shift`:
 * ['early_morning', 'morning', 'afternoon', 'night']
 */

export const CANONICAL_STAFF_SHIFTS = [
  'early_morning',
  'morning',
  'afternoon',
  'night',
] as const;

export type CanonicalStaffShift = (typeof CANONICAL_STAFF_SHIFTS)[number];

export const CANONICAL_SESSION_NAMES = [
  'DINI_HARI',
  'PAGI',
  'SIANG',
  'MALAM',
] as const;

export type CanonicalSessionName = (typeof CANONICAL_SESSION_NAMES)[number];

export const SHIFT_TO_SESSION_MAP: Record<
  CanonicalStaffShift,
  CanonicalSessionName
> = {
  early_morning: 'DINI_HARI',
  morning: 'PAGI',
  afternoon: 'SIANG',
  night: 'MALAM',
};

export const SESSION_TO_SHIFT_MAP: Record<string, CanonicalStaffShift> = {
  DINI_HARI: 'early_morning',
  'DINI HARI': 'early_morning',
  EARLY_MORNING: 'early_morning',
  dini_hari: 'early_morning',
  'dini hari': 'early_morning',
  early_morning: 'early_morning',

  PAGI: 'morning',
  MORNING: 'morning',
  pagi: 'morning',
  morning: 'morning',

  SIANG: 'afternoon',
  AFTERNOON: 'afternoon',
  siang: 'afternoon',
  afternoon: 'afternoon',
  sore: 'afternoon',
  SORE: 'afternoon',

  MALAM: 'night',
  NIGHT: 'night',
  malam: 'night',
  night: 'night',
};

export const SHIFT_DISPLAY_LABELS: Record<CanonicalStaffShift, string> = {
  early_morning: 'Dini Hari',
  morning: 'Pagi',
  afternoon: 'Siang',
  night: 'Malam',
};

export interface ShiftTimingConfig {
  shift: CanonicalStaffShift;
  session: CanonicalSessionName;
  label: string;
  defaultStartTime: string;
  defaultEndTime: string;
}

export const SHIFT_TIMING_CONFIGS: Record<
  CanonicalStaffShift,
  ShiftTimingConfig
> = {
  early_morning: {
    shift: 'early_morning',
    session: 'DINI_HARI',
    label: 'Dini Hari',
    defaultStartTime: '00:00',
    defaultEndTime: '06:00',
  },
  morning: {
    shift: 'morning',
    session: 'PAGI',
    label: 'Pagi',
    defaultStartTime: '06:00',
    defaultEndTime: '12:00',
  },
  afternoon: {
    shift: 'afternoon',
    session: 'SIANG',
    label: 'Siang',
    defaultStartTime: '12:00',
    defaultEndTime: '18:00',
  },
  night: {
    shift: 'night',
    session: 'MALAM',
    label: 'Malam',
    defaultStartTime: '18:00',
    defaultEndTime: '24:00',
  },
};

export function resolveCanonicalShift(input: {
  session?: string | null;
  sessionShift?: string | null;
}): {
  shift: CanonicalStaffShift;
  session: CanonicalSessionName;
  label: string;
} {
  const candidate = (input.sessionShift || input.session || '')
    .trim()
    .toLowerCase();
  let matchedShift: CanonicalStaffShift | undefined =
    SESSION_TO_SHIFT_MAP[candidate] ||
    SESSION_TO_SHIFT_MAP[candidate.toUpperCase()];

  if (!matchedShift) {
    if (candidate.includes('dini') || candidate.includes('early')) {
      matchedShift = 'early_morning';
    } else if (
      candidate.includes('siang') ||
      candidate.includes('sore') ||
      candidate.includes('afternoon')
    ) {
      matchedShift = 'afternoon';
    } else if (candidate.includes('malam') || candidate.includes('night')) {
      matchedShift = 'night';
    } else {
      matchedShift = 'morning';
    }
  }

  return {
    shift: matchedShift,
    session: SHIFT_TO_SESSION_MAP[matchedShift],
    label: SHIFT_DISPLAY_LABELS[matchedShift],
  };
}

export function resolveSessionFromTime(
  timeStr?: string | null,
): CanonicalSessionName {
  if (!timeStr) {
    return SHIFT_TIMING_CONFIGS.morning.session;
  }
  const prefix = timeStr.slice(0, 5);
  if (prefix < SHIFT_TIMING_CONFIGS.early_morning.defaultEndTime) {
    return SHIFT_TIMING_CONFIGS.early_morning.session;
  }
  if (prefix < SHIFT_TIMING_CONFIGS.morning.defaultEndTime) {
    return SHIFT_TIMING_CONFIGS.morning.session;
  }
  if (prefix < SHIFT_TIMING_CONFIGS.afternoon.defaultEndTime) {
    return SHIFT_TIMING_CONFIGS.afternoon.session;
  }
  return SHIFT_TIMING_CONFIGS.night.session;
}
