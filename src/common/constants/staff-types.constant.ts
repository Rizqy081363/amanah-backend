export const STAFF_TYPES = {
  DOCTOR: 'doctor',
  MIDWIFE: 'midwife',
  WORKER: 'worker',
} as const;

export type StaffType = (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES];

const STAFF_TYPE_LABELS: Record<StaffType, string> = {
  [STAFF_TYPES.DOCTOR]: 'Dokter',
  [STAFF_TYPES.MIDWIFE]: 'Bidan',
  [STAFF_TYPES.WORKER]: 'Staf Operasional',
};
