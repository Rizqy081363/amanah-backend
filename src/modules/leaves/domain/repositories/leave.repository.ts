import { LeaveEntity } from '../entities/leave.entity';

export const LEAVE_REPOSITORY = 'LEAVE_REPOSITORY';

export interface LeaveRepository {
  create(data: Omit<LeaveEntity, 'id' | 'status' | 'approvedBy' | 'approvalNotes' | 'createdAt' | 'updatedAt'>): Promise<LeaveEntity>;
  findByStaffId(staffId: string): Promise<LeaveEntity[]>;
  findAllPending(): Promise<any[]>;
  updateStatus(
    id: string,
    status: 'DISETUJUI' | 'DITOLAK',
    approvedBy: number,
    approvalNotes?: string,
  ): Promise<LeaveEntity | null>;
}
