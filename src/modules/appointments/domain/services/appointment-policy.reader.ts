import { ClinicConfigService } from '@common/clinic-config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppointmentPolicyReader {
  constructor(private readonly clinicConfig: ClinicConfigService) {}

  async getCheckInWindowHours(): Promise<number> {
    return this.clinicConfig.getCheckInWindowHours();
  }
}
