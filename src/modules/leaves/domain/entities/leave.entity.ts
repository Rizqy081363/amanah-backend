export class LeaveEntity {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
  type?: string;
  substituteStaffId?: string | null;
  documentUrl?: string | null;
  status: 'MENUNGGU_KONFIRMASI' | 'DISETUJUI' | 'DITOLAK' | 'DIBATALKAN';
  approvedBy?: string | null;
  approvalNotes?: string | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
