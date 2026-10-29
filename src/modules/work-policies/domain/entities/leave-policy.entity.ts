export class LeavePolicyEntity {
  id: string;
  approvalRequired: boolean;
  limitMode: 'unlimited' | 'monthly_limit';
  monthlyLimit: number;
  quotaCountingPolicy: 'per_request' | 'per_session';
  periodPolicy: 'non_overlapping' | 'previous_period_must_finish';
  noticeDaysRequired: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
