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

export class ScheduleShiftDescriptor {
  constructor(
    public readonly shift: CanonicalStaffShift,
    public readonly session: CanonicalSessionName,
    public readonly label: string,
    public readonly defaultStartTime: string,
    public readonly defaultEndTime: string,
  ) {}

  matches(raw?: string | null): boolean {
    if (!raw) return false;
    const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return (
      this.shift === normalized ||
      this.session.toLowerCase() === normalized ||
      this.label.toLowerCase() === normalized
    );
  }
}

export class ScheduleShiftRegistry {
  private static readonly DESCRIPTORS: readonly ScheduleShiftDescriptor[] = [
    new ScheduleShiftDescriptor('early_morning', 'DINI_HARI', 'Dini Hari', '00:00', '06:00'),
    new ScheduleShiftDescriptor('morning', 'PAGI', 'Pagi', '06:00', '12:00'),
    new ScheduleShiftDescriptor('afternoon', 'SIANG', 'Siang', '12:00', '18:00'),
    new ScheduleShiftDescriptor('night', 'MALAM', 'Malam', '18:00', '24:00'),
  ];

  static find(raw?: string | null): ScheduleShiftDescriptor | null {
    if (!raw) return null;
    const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (normalized.includes('dini') || normalized.includes('early')) return this.DESCRIPTORS[0];
    if (normalized.includes('siang') || normalized.includes('sore') || normalized.includes('afternoon')) return this.DESCRIPTORS[2];
    if (normalized.includes('malam') || normalized.includes('night')) return this.DESCRIPTORS[3];
    if (normalized.includes('pagi') || normalized.includes('morning')) return this.DESCRIPTORS[1];
    return this.DESCRIPTORS.find((d) => d.matches(raw)) ?? null;
  }

  static resolve(raw?: string | null): ScheduleShiftDescriptor {
    return this.find(raw) ?? this.DESCRIPTORS[1];
  }

  static getAll(): readonly ScheduleShiftDescriptor[] {
    return this.DESCRIPTORS;
  }

  static getByShift(shift: CanonicalStaffShift): ScheduleShiftDescriptor {
    return this.DESCRIPTORS.find((d) => d.shift === shift) ?? this.DESCRIPTORS[1];
  }
}

export const SHIFT_TO_SESSION_MAP: Record<
  CanonicalStaffShift,
  CanonicalSessionName
> = {
  early_morning: 'DINI_HARI',
  morning: 'PAGI',
  afternoon: 'SIANG',
  night: 'MALAM',
};

export const SESSION_TO_SHIFT_MAP: Record<string, CanonicalStaffShift> = new Proxy(
  {},
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== 'string') return undefined;
      return ScheduleShiftRegistry.resolve(prop).shift;
    },
  },
);

export const SHIFT_DISPLAY_LABELS: Record<CanonicalStaffShift, string> = {
  early_morning: 'Dini Hari',
  morning: 'Pagi',
  afternoon: 'Siang',
  night: 'Malam',
};

export const SHIFT_TIMING_CONFIGS: Record<
  CanonicalStaffShift,
  ShiftTimingConfig
> = {
  early_morning: ScheduleShiftRegistry.getByShift('early_morning'),
  morning: ScheduleShiftRegistry.getByShift('morning'),
  afternoon: ScheduleShiftRegistry.getByShift('afternoon'),
  night: ScheduleShiftRegistry.getByShift('night'),
};

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
  QUOTA_FULL: 'Kuota antrean pada sesi ini sudah penuh',
} as const;

export type BookingSessionDisabledReason =
  (typeof BOOKING_SESSION_DISABLED_REASONS)[keyof typeof BOOKING_SESSION_DISABLED_REASONS];
