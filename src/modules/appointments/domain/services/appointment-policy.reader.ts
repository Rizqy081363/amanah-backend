import {
  ClinicConfigService,
  QueueThresholdsData,
} from '@common/clinic-config';
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
    return this.clinicConfig.getNumber('queue.arrive_early_minutes');
  }

  async getCheckInOverflowMinutes(): Promise<number> {
    return this.clinicConfig.getNumber('queue.overflow_tolerance_minutes');
  }

  async getCheckInReminderEnabled(): Promise<boolean> {
    return this.clinicConfig.getBoolean('queue.check_in_reminder_enabled');
  }

  async getOperationalBroadcastEnabled(): Promise<boolean> {
    return this.clinicConfig.getBoolean('queue.operational_broadcast_enabled');
  }

  async getNoShowGraceMinutes(): Promise<number> {
    return this.clinicConfig.getNumber('queue.no_show_grace_minutes');
  }

  async getNoShowCallAttempts(): Promise<number> {
    return this.clinicConfig.getNumber('queue.no_show_call_attempts');
  }

  async getRequeueBumpPositions(): Promise<number> {
    return this.clinicConfig.getNumber('queue.requeue_bump_positions');
  }
}
