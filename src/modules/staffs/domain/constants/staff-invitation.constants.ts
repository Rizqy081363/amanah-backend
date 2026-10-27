export const STAFF_INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
} as const;

export type StaffInvitationStatus =
  (typeof STAFF_INVITATION_STATUS)[keyof typeof STAFF_INVITATION_STATUS];

export const STAFF_ROLE_CODES = {
  DOCTOR: 'staff_doctor',
  MIDWIFE: 'staff_midwife',
  WORKER: 'staff_worker',
} as const;

export type StaffRoleCode =
  (typeof STAFF_ROLE_CODES)[keyof typeof STAFF_ROLE_CODES];

export { STAFF_TYPES, type StaffType } from '../../../../common/constants/staff-types.constant';

export const STAFF_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ON_LEAVE: 'on_leave',
} as const;

export const BETTER_AUTH_STAFF_ROLES = {
  DOCTOR: 'staffDoctor',
  MIDWIFE: 'staffMidwife',
  WORKER: 'staffWorker',
} as const;

export type BetterAuthStaffRole =
  (typeof BETTER_AUTH_STAFF_ROLES)[keyof typeof BETTER_AUTH_STAFF_ROLES];
