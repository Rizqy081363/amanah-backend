/**
 * Domain status invariants for immunization clinical records.
 * Pure business domain rules (state machine), zero presentation/UI coupling.
 */
export const IMMUNIZATION_ENTRY_STATUS = {
  GIVEN: 'GIVEN',
  NOT_GIVEN: 'NOT_GIVEN',
  PENDING: 'PENDING',
  POSTPONED: 'POSTPONED',
  CONTRAINDICATED: 'CONTRAINDICATED',
} as const;

export type ImmunizationEntryStatus =
  (typeof IMMUNIZATION_ENTRY_STATUS)[keyof typeof IMMUNIZATION_ENTRY_STATUS];

export const VALID_IMMUNIZATION_STATUSES: readonly ImmunizationEntryStatus[] = [
  IMMUNIZATION_ENTRY_STATUS.GIVEN,
  IMMUNIZATION_ENTRY_STATUS.NOT_GIVEN,
  IMMUNIZATION_ENTRY_STATUS.PENDING,
  IMMUNIZATION_ENTRY_STATUS.POSTPONED,
  IMMUNIZATION_ENTRY_STATUS.CONTRAINDICATED,
] as const;
