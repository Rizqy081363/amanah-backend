import { ClinicConfigService } from '@common/clinic-config';
import {
  DEFAULT_CONSULTATION_DURATION_MINUTES,
  DEFAULT_START_PRECISION_MINUTES,
} from '@modules/schedules/domain/constants/schedule.constants';
import { Injectable, Optional } from '@nestjs/common';

export interface EffectiveSchedulePolicy {
  durationMinutes: number;
  startPrecisionMinutes: number;
}

@Injectable()
export class SchedulePolicyReader {
  constructor(
    @Optional()
    private readonly clinicConfig?: ClinicConfigService,
  ) {}

  async getClinicSchedulePolicy(): Promise<EffectiveSchedulePolicy> {
    if (this.clinicConfig) {
      const policy = await this.clinicConfig.getSchedulePolicy();
      return {
        durationMinutes: policy.defaultConsultationDurationMinutes,
        startPrecisionMinutes: policy.defaultStartPrecisionMinutes,
      };
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

  async getDateFormatStyle(): Promise<string> {
    if (this.clinicConfig) {
      return this.clinicConfig.getDateFormatStyle();
    }
    return 'human_full';
  }
}
