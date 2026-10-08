import { ClinicConfigService } from '@common/clinic-config';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { clinicSchedulePolicies } from '@database/schema';
import {
  DEFAULT_CONSULTATION_DURATION_MINUTES,
  DEFAULT_START_PRECISION_MINUTES,
} from '@modules/schedules/domain/constants/schedule.constants';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { eq } from 'drizzle-orm';

export interface EffectiveSchedulePolicy {
  durationMinutes: number;
  startPrecisionMinutes: number;
}

@Injectable()
export class SchedulePolicyReader {
  private readonly clinicConfig?: ClinicConfigService;
  private readonly db?: DrizzleDatabase;

  constructor(
    @Optional()
    clinicConfigOrDb?: ClinicConfigService | DrizzleDatabase,
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    db?: DrizzleDatabase,
  ) {
    if (clinicConfigOrDb && 'getSchedulePolicy' in clinicConfigOrDb) {
      this.clinicConfig = clinicConfigOrDb;
      this.db = db;
    } else {
      this.db = (clinicConfigOrDb as DrizzleDatabase) ?? db;
    }
  }

  async getClinicSchedulePolicy(): Promise<EffectiveSchedulePolicy> {
    if (this.clinicConfig) {
      const policy = await this.clinicConfig.getSchedulePolicy();
      return {
        durationMinutes: policy.defaultConsultationDurationMinutes,
        startPrecisionMinutes: policy.defaultStartPrecisionMinutes,
      };
    }
    if (this.db?.query?.clinicSchedulePolicies?.findFirst) {
      const policy = await this.db.query.clinicSchedulePolicies.findFirst({
        where: eq(clinicSchedulePolicies.code, 'default'),
      });
      if (policy) {
        return {
          durationMinutes:
            policy.defaultConsultationDurationMinutes ??
            DEFAULT_CONSULTATION_DURATION_MINUTES,
          startPrecisionMinutes:
            policy.defaultStartPrecisionMinutes ??
            DEFAULT_START_PRECISION_MINUTES,
        };
      }
    }
    return {
      durationMinutes: DEFAULT_CONSULTATION_DURATION_MINUTES,
      startPrecisionMinutes: DEFAULT_START_PRECISION_MINUTES,
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
