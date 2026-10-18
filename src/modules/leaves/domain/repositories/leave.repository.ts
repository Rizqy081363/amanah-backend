import { LeaveEntity } from '../entities/leave.entity';

export const LEAVE_REPOSITORY = 'LEAVE_REPOSITORY';

export interface LeaveRepository {
  create(data: {
    staffId: string;
    practitionerId?: string | null;
    startDate: string;
    endDate: string;
    reason: string;
    type?: string;
    scope?: 'session' | 'full_day';
    sessionIds?: string[];
    substituteStaffId?: string | null;
    documentUrl?: string | null;
  }): Promise<LeaveEntity>;
  findById(id: string): Promise<LeaveEntity | null>;
  findByStaffId(staffId: string): Promise<LeaveEntity[]>;
  findAllPending(): Promise<any[]>;
  findAll(filters?: { status?: string; staffType?: string }): Promise<any[]>;
  getEligibleSessions(staffProfileId: string, date: string): Promise<any[]>;
  updateStatus(
    id: string,
    status: 'approved' | 'rejected',
    approvedBy: string,
    approvalNotes?: string,
  ): Promise<LeaveEntity | null>;
  cancel(id: string, staffId: string): Promise<LeaveEntity | null>;
}
