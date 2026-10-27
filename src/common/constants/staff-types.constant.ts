export const STAFF_TYPES = {
  DOCTOR: 'doctor',
  MIDWIFE: 'midwife',
  WORKER: 'worker',
} as const;

export type StaffType = (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES];
