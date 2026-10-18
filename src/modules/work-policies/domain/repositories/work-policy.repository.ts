import { CompensationRateEntity } from '../entities/compensation-rate.entity';
import { LeavePolicyEntity } from '../entities/leave-policy.entity';

export const WORK_POLICY_REPOSITORY = 'WORK_POLICY_REPOSITORY';

export interface WorkPolicyRepository {
  getActiveLeavePolicy(): Promise<LeavePolicyEntity>;
  updateLeavePolicy(
    data: Partial<
      Pick<
        LeavePolicyEntity,
        | 'approvalRequired'
        | 'limitMode'
        | 'monthlyLimit'
        | 'quotaCountingPolicy'
      >
    >,
    updatedBy: string,
  ): Promise<LeavePolicyEntity>;
  getActiveCompensationRates(): Promise<CompensationRateEntity[]>;
  updateCompensationRates(
    rates: Array<{
      category: 'doctor' | 'midwife' | 'worker';
      hourlyRate: number;
      overtimeHourlyRate: number;
      notes?: string;
    }>,
    updatedBy: string,
  ): Promise<CompensationRateEntity[]>;
}
