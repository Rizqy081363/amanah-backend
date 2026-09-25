import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../database/drizzle/drizzle.provider';
import { clinicSchedulePolicies } from '../../../../../database/schema';
import {
  DEFAULT_CONSULTATION_DURATION_MINUTES,
  DEFAULT_START_PRECISION_MINUTES,
} from '../../../domain/constants/schedule.constants';

export interface EffectiveSchedulePolicy {
  durationMinutes: number;
  startPrecisionMinutes: number;
}

@Injectable()
export class SchedulePolicyReader {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async getClinicSchedulePolicy(): Promise<EffectiveSchedulePolicy> {
    const policy = await this.db.query?.clinicSchedulePolicies?.findFirst?.({
      where: eq(clinicSchedulePolicies.code, 'default'),
    });
    return {
      durationMinutes:
        policy?.defaultConsultationDurationMinutes ??
        DEFAULT_CONSULTATION_DURATION_MINUTES,
      startPrecisionMinutes:
        policy?.defaultStartPrecisionMinutes ?? DEFAULT_START_PRECISION_MINUTES,
    };
  }

  async getPolicy(
    practitioner?: {
      consultationDurationMinutes?: number | null;
      startPrecisionMinutes?: number | null;
    } | null,
  ): Promise<EffectiveSchedulePolicy> {
    const clinicPolicy = await this.getClinicSchedulePolicy();
    if (!practitioner) {
      return clinicPolicy;
    }
    return {
      durationMinutes:
        practitioner.consultationDurationMinutes ??
        clinicPolicy.durationMinutes,
      startPrecisionMinutes:
        practitioner.startPrecisionMinutes ??
        clinicPolicy.startPrecisionMinutes,
    };
  }
}
