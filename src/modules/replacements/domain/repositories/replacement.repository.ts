import { ReplacementOpportunityStatus } from '../../../../database/schema';
import { ReplacementOpportunityEntity } from '../entities/replacement-opportunity.entity';

export const REPLACEMENT_REPOSITORY = 'REPLACEMENT_REPOSITORY';

export type ReplacementOpportunityFilter = {
  date?: string;
  status?: ReplacementOpportunityStatus | 'all';
};

export interface ReplacementRepository {
  findOpportunities(
    filters?: ReplacementOpportunityFilter,
  ): Promise<ReplacementOpportunityEntity[]>;
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
