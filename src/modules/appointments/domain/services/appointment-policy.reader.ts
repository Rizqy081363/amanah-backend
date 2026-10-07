import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { clinicSchedulePolicies } from '../../../../database/schema/amanah.schema';
import { DEFAULT_CHECK_IN_CONFIG } from '../constants/appointment-check-in.config';

@Injectable()
export class AppointmentPolicyReader {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async getCheckInWindowHours(): Promise<number> {
    try {
      const policy = await this.db.query?.clinicSchedulePolicies?.findFirst?.({
        where: eq(clinicSchedulePolicies.code, 'default'),
      });
      return policy?.checkInWindowHours ?? DEFAULT_CHECK_IN_CONFIG.checkInWindowHours;
    } catch {
      return DEFAULT_CHECK_IN_CONFIG.checkInWindowHours;
    }
  }
}
