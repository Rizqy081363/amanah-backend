import { ReplacementOpportunityStatus } from '../../../../database/schema';
import { ReplacementOpportunityEntity } from '../entities/replacement-opportunity.entity';

export const REPLACEMENT_REPOSITORY = 'REPLACEMENT_REPOSITORY';

export type ReplacementOpportunityFilter = {
  date?: string;
  exactDate?: string;
  startDate?: string;
  endDate?: string;
  status?: ReplacementOpportunityStatus | 'all';
  staffProfileId?: string;
};

export interface ReplacementStaffFacetItem {
  staffProfileId: string;
  fullName: string;
  staffType: string;
  avatarUrl: string | null;
  opportunityCount: number;
  earliestDate: string;
  availableDates: string[];
}

export interface ReplacementDateFacetItem {
  workDate: string;
  count: number;
}

export interface ReplacementFacetsEntity {
  distinctStaff: ReplacementStaffFacetItem[];
  availableDates: ReplacementDateFacetItem[];
  totalOpenOpportunities: number;
}

export interface ReplacementRepository {
  findOpportunities(
    filters?: ReplacementOpportunityFilter,
  ): Promise<ReplacementOpportunityEntity[]>;
  findOpenOpportunities(date?: string): Promise<ReplacementOpportunityEntity[]>;
  getReplacementFacets(): Promise<ReplacementFacetsEntity>;
  cleanupExpiredOpportunities(leadHours?: number): Promise<number>;
  findByLeaveRequestId(
    leaveRequestId: string,
  ): Promise<ReplacementOpportunityEntity[]>;
  claimOpportunity(
    opportunityId: string,
    staffProfileId: string,
    practitionerId?: string,
  ): Promise<ReplacementOpportunityEntity>;
  assignOpportunity(
    opportunityId: string,
    staffProfileId: string,
    practitionerId?: string,
    notes?: string,
  ): Promise<ReplacementOpportunityEntity>;
  cancelOpportunity(
    opportunityId: string,
    reason?: string,
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
