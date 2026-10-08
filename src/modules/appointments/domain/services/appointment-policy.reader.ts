import { Injectable } from '@nestjs/common';
import { ClinicConfigService } from '@common/clinic-config';

@Injectable()
export class AppointmentPolicyReader {
  constructor(
    private readonly clinicConfig: ClinicConfigService,
  ) {}

  async getCheckInWindowHours(): Promise<number> {
    return this.clinicConfig.getCheckInWindowHours();
  }
}
