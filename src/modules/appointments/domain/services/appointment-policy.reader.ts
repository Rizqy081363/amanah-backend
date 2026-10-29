import { ClinicConfigService, QueueThresholdsData } from '@common/clinic-config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppointmentPolicyReader {
  constructor(private readonly clinicConfig: ClinicConfigService) {}

  async getCheckInWindowHours(): Promise<number> {
    return this.clinicConfig.getCheckInWindowHours();
  }

  async getQueueThresholds(): Promise<QueueThresholdsData> {
    return this.clinicConfig.getQueueThresholds();
  }

  async getCheckInEarlyMinutes(): Promise<number> {
    const thresholds = await this.clinicConfig.getQueueThresholds();
    return thresholds.arriveEarlyMinutes;
  }

  async getCheckInOverflowMinutes(): Promise<number> {
    const thresholds = await this.clinicConfig.getQueueThresholds();
    return thresholds.overflowToleranceMinutes;
  }

  async getCheckInReminderEnabled(): Promise<boolean> {
    return this.clinicConfig.getCheckInReminderEnabled();
  }

  async getOperationalBroadcastEnabled(): Promise<boolean> {
    return this.clinicConfig.getOperationalBroadcastEnabled();
  }
}
