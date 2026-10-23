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

export interface ShiftTimingConfig {
  shift: CanonicalStaffShift;
  session: CanonicalSessionName;
  label: string;
  defaultStartTime: string;
  defaultEndTime: string;
}

export const SHIFT_CONFIGS: Record<CanonicalStaffShift, ShiftTimingConfig> = {
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
  PAGI: 'morning',
  SIANG: 'afternoon',
  MALAM: 'night',
  early_morning: 'early_morning',
  morning: 'morning',
  afternoon: 'afternoon',
  night: 'night',
};

export const SHIFT_DISPLAY_LABELS: Record<CanonicalStaffShift, string> = {
  early_morning: 'Dini Hari',
  morning: 'Pagi',
  afternoon: 'Siang',
  night: 'Malam',
};

export const SESSION_FRIENDLY_LABELS: Record<string, string> = {
  early_morning: 'Sesi Dini Hari',
  morning: 'Sesi Pagi',
  afternoon: 'Sesi Siang',
  night: 'Sesi Malam',
  DINI_HARI: 'Sesi Dini Hari',
  PAGI: 'Sesi Pagi',
  SIANG: 'Sesi Siang',
  MALAM: 'Sesi Malam',
};

export function formatSessionTitle(codeOrKey?: string | null): string {
  if (!codeOrKey) return 'Sesi Dinas';
  const key = codeOrKey.startsWith('session.') ? codeOrKey.slice(8) : codeOrKey;
  return SESSION_FRIENDLY_LABELS[key] || `Sesi ${key}`;
}

export class ScheduleShiftDescriptor {
  constructor(
    public readonly shift: CanonicalStaffShift,
    public readonly session: CanonicalSessionName,
    public readonly label: string,
    public readonly defaultStartTime: string,
    public readonly defaultEndTime: string,
  ) {}
}

export class ScheduleShiftRegistry {
  private static readonly DESCRIPTORS: readonly ScheduleShiftDescriptor[] = [
    new ScheduleShiftDescriptor(
      'early_morning',
      'DINI_HARI',
      'Dini Hari',
      '00:00',
      '06:00',
    ),
    new ScheduleShiftDescriptor('morning', 'PAGI', 'Pagi', '06:00', '12:00'),
    new ScheduleShiftDescriptor(
      'afternoon',
      'SIANG',
      'Siang',
      '12:00',
      '18:00',
    ),
    new ScheduleShiftDescriptor('night', 'MALAM', 'Malam', '18:00', '24:00'),
  ];

  static find(raw?: string | null): ScheduleShiftDescriptor | null {
    if (!raw) return null;
    const shift =
      SESSION_TO_SHIFT_MAP[raw] || SESSION_TO_SHIFT_MAP[raw.toLowerCase()];
    if (shift) return this.getByShift(shift);
    return null;
  }

  static resolve(raw?: string | null): ScheduleShiftDescriptor {
    return this.find(raw) ?? this.DESCRIPTORS[1];
  }

  static getAll(): readonly ScheduleShiftDescriptor[] {
    return this.DESCRIPTORS;
  }

  static getByShift(shift: CanonicalStaffShift): ScheduleShiftDescriptor {
    const idx = CANONICAL_STAFF_SHIFTS.indexOf(shift);
    return this.DESCRIPTORS[idx >= 0 ? idx : 1];
  }
}

export const SHIFT_TIMING_CONFIGS: Record<
  CanonicalStaffShift,
  ShiftTimingConfig
> = SHIFT_CONFIGS;

export function resolveCanonicalShift(input: {
  session?: string | null;
  sessionShift?: string | null;
}): {
  shift: CanonicalStaffShift;
  session: CanonicalSessionName;
  label: string;
} {
  const descriptor = ScheduleShiftRegistry.resolve(
    input.sessionShift || input.session,
  );
  return {
    shift: descriptor.shift,
    session: descriptor.session,
    label: descriptor.label,
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

export const BOOKING_SESSION_DISABLED_REASONS = {
  ELAPSED: 'Waktu praktik sesi ini telah berakhir',
  NO_SCHEDULE: 'Dokter/bidan tidak ada jadwal praktik pada sesi ini',
} as const;

export type BookingSessionDisabledReason =
  (typeof BOOKING_SESSION_DISABLED_REASONS)[keyof typeof BOOKING_SESSION_DISABLED_REASONS];
