import { LeaveEntity } from '../entities/leave.entity';

export const LEAVE_REPOSITORY = 'LEAVE_REPOSITORY';

export interface LeaveRepository {
  create(
    data: Omit<
      LeaveEntity,
      | 'id'
      | 'status'
      | 'approvedBy'
      | 'approvalNotes'
      | 'cancelledAt'
      | 'createdAt'
      | 'updatedAt'
    >,
  ): Promise<LeaveEntity>;
  findById(id: string): Promise<LeaveEntity | null>;
  findByStaffId(staffId: string): Promise<LeaveEntity[]>;
  findAllPending(): Promise<any[]>;
  updateStatus(
    id: string,
    status: 'DISETUJUI' | 'DITOLAK',
    approvedBy: string,
    approvalNotes?: string,
  ): Promise<LeaveEntity | null>;
  cancel(id: string, staffId: string): Promise<LeaveEntity | null>;
}
