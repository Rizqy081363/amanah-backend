import { ReplacementOpportunityStatus } from '../../../../database/schema';

export class ReplacementOpportunityEntity {
  id: string;
  leaveRequestId: string;
  sessionId: string;
  sessionCode?: string;
  sessionLabel?: string;
  startTime?: string | null;
  endTime?: string | null;
  workDate: string;
  originalStaffProfileId: string;
  originalPractitionerId?: string | null;
  originalStaffName?: string;
  originalStaffRole?: string | null;
  originalStaffAvatarUrl?: string | null;
  leaveReason?: string | null;
  claimedByStaffProfileId?: string | null;
  claimedByPractitionerId?: string | null;
  claimedByName?: string | null;
  claimedByRole?: string | null;
  claimedByAvatarUrl?: string | null;
  claimedAt?: Date | null;
  status: ReplacementOpportunityStatus;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
