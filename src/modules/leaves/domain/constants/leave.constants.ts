import {
  staffLeaveRequestStatus,
  staffLeaveRequestType,
} from '../../../../database/schema';

export const CANONICAL_LEAVE_TYPES = staffLeaveRequestType.enumValues;
export type CanonicalLeaveType = (typeof CANONICAL_LEAVE_TYPES)[number];

export const CANONICAL_LEAVE_STATUSES = staffLeaveRequestStatus.enumValues;
export type CanonicalLeaveStatus = (typeof CANONICAL_LEAVE_STATUSES)[number];

export const CANONICAL_LEAVE_SCOPES = ['session', 'full_day'] as const;
export type CanonicalLeaveScope = (typeof CANONICAL_LEAVE_SCOPES)[number];
