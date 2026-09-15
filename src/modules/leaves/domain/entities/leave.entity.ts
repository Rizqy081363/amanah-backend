export class LeaveEntity {
  id: string;
  staffId: string;
  startDate: string;
  endDate: string;
  reason: string;
  documentUrl?: string | null;
  status: 'MENUNGGU_KONFIRMASI' | 'DISETUJUI' | 'DITOLAK';
  approvedBy?: number | null;
  approvalNotes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
