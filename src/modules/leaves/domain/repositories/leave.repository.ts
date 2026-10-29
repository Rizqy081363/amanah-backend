import type { StaffType } from '../../../../common/constants/staff-types.constant';
import type {
  CanonicalLeaveScope,
  CanonicalLeaveStatus,
  CanonicalLeaveType,
} from '../constants/leave.constants';
import type { LeaveEntity } from '../entities/leave.entity';

export const LEAVE_REPOSITORY = 'LEAVE_REPOSITORY';

export interface CreateLeaveData {
  staffId: string;
  practitionerId?: string | null;
  startDate: string;
  endDate: string;
  reason: string;
  type: CanonicalLeaveType;
  scope: CanonicalLeaveScope;
  sessionIds?: string[];
  substituteStaffId?: string | null;
  documentUrl?: string | null;
}

export interface LeaveFilterOptions {
  status?: CanonicalLeaveStatus;
  staffType?: StaffType;
}

export interface LeaveRepository {
  create(data: CreateLeaveData): Promise<LeaveEntity>;
  findById(id: string): Promise<LeaveEntity | null>;
  findByStaffId(staffId: string): Promise<LeaveEntity[]>;
  findAllPending(): Promise<LeaveEntity[]>;
  findAll(filters?: LeaveFilterOptions): Promise<LeaveEntity[]>;
  getEligibleSessions(staffProfileId: string, date: string): Promise<any[]>;
  updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    approvedBy: string,
    approvalNotes?: string | null,
  ): Promise<LeaveEntity | null>;
  cancel(id: string, staffId: string): Promise<LeaveEntity | null>;
}
