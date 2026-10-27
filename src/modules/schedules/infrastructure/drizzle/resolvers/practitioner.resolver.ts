import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import { practitioners, staffProfiles } from '@database/schema';
import { isUuid } from '@modules/schedules/domain/constants/schedule.constants';
import { Inject, Injectable } from '@nestjs/common';
import { eq, or } from 'drizzle-orm';

@Injectable()
export class PractitionerResolver {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async resolve(staffOrPractitionerId: string) {
    if (!staffOrPractitionerId) {
      return null;
    }

    if (isUuid(staffOrPractitionerId)) {
      return this.db.query.practitioners.findFirst({
        where: or(
          eq(practitioners.id, staffOrPractitionerId),
          eq(practitioners.staffProfileId, staffOrPractitionerId),
        ),
        with: {
          staffProfile: true,
          medicalSpecialty: true,
        },
      });
    }

    const code = decodeURIComponent(staffOrPractitionerId).trim();

    const matchedStaff = await this.db.query.staffProfiles.findFirst({
      where: eq(staffProfiles.staffCode, code),
    });

    if (matchedStaff) {
      return this.db.query.practitioners.findFirst({
        where: eq(practitioners.staffProfileId, matchedStaff.id),
        with: {
          staffProfile: true,
          medicalSpecialty: true,
        },
      });
    }

    return null;
  }
}
