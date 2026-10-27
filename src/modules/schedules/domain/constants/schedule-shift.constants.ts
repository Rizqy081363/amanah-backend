export const CANONICAL_STAFF_SHIFTS = [
  'early_morning',
  'morning',
  'afternoon',
  'night',
] as const;

export type CanonicalStaffShift = (typeof CANONICAL_STAFF_SHIFTS)[number];
