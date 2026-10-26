export const PAYROLL_PERIOD_STATUS = {
  DRAFT: 'draft',
  CALCULATED: 'calculated',
  FINALIZED: 'finalized',
} as const;

export type PayrollPeriodStatus =
  (typeof PAYROLL_PERIOD_STATUS)[keyof typeof PAYROLL_PERIOD_STATUS];

export const PAYROLL_ENTRY_TYPE = {
  BASE_SCHEDULED: 'base_scheduled',
  LEAVE_DEDUCTION: 'leave_deduction',
  REPLACEMENT_ADDITION: 'replacement_addition',
  OVERTIME_ADDITION: 'overtime_addition',
} as const;

export type PayrollEntryType =
  (typeof PAYROLL_ENTRY_TYPE)[keyof typeof PAYROLL_ENTRY_TYPE];

export const PAYROLL_SOURCE_TYPE = {
  ROSTER: 'roster',
  LEAVE_REQUEST: 'leave_request',
  REPLACEMENT_CLAIM: 'replacement_claim',
  ATTENDANCE: 'attendance',
  MANUAL: 'manual',
} as const;

export type PayrollSourceType =
  (typeof PAYROLL_SOURCE_TYPE)[keyof typeof PAYROLL_SOURCE_TYPE];
