import { ReplacementOpportunityEntity } from '../entities/replacement-opportunity.entity';

export const REPLACEMENT_REPOSITORY = 'REPLACEMENT_REPOSITORY';

export interface ReplacementRepository {
  findOpenOpportunities(date?: string): Promise<ReplacementOpportunityEntity[]>;
  findByLeaveRequestId(
    leaveRequestId: string,
  ): Promise<ReplacementOpportunityEntity[]>;
  claimOpportunity(
    opportunityId: string,
    staffProfileId: string,
    practitionerId?: string,
  ): Promise<ReplacementOpportunityEntity>;
  createOpportunity(data: {
    leaveRequestId: string;
    sessionId: string;
    workDate: string;
    originalStaffProfileId: string;
    originalPractitionerId?: string;
    notes?: string;
  }): Promise<ReplacementOpportunityEntity>;
}
