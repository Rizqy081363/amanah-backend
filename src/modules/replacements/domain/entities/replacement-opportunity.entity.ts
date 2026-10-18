export class ReplacementOpportunityEntity {
  id: string;
  leaveRequestId: string;
  sessionId: string;
  sessionCode?: string;
  sessionLabel?: string;
  workDate: string;
  originalStaffProfileId: string;
  originalPractitionerId?: string | null;
  originalStaffName?: string;
  claimedByStaffProfileId?: string | null;
  claimedByPractitionerId?: string | null;
  claimedByName?: string | null;
  claimedAt?: Date | null;
  status: 'open' | 'claimed' | 'completed' | 'cancelled';
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
