export class LeaveEntity {
  id: string;
  staffId: string;
  practitionerId?: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  reason: string;
  type?: string;
  scope: 'session' | 'full_day';
  decisionSource?: 'admin' | 'auto';
  substituteStaffId?: string | null;
  documentUrl?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
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
