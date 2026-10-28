import type {
  CanonicalLeaveScope,
  CanonicalLeaveStatus,
  CanonicalLeaveType,
} from '../constants/leave.constants';

export class LeaveEntity {
  id: string;
  staffId: string;
  practitionerId?: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  reason: string;
  type: CanonicalLeaveType;
  scope: CanonicalLeaveScope;
  decisionSource?: 'admin' | 'auto';
  substituteStaffId?: string | null;
  documentUrl?: string | null;
  status: CanonicalLeaveStatus;
  approvedBy?: string | null;
  approvalNotes?: string | null;
  cancelledAt?: Date | null;
  sessions?: Array<{
    id: string;
    sessionId: string;
    sessionCode?: string;
    sessionLabel?: string;
    workDate: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}
