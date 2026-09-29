import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { roles, userRoles } from '../../../../database/schema';

@Injectable()
export class AppointmentRecipientResolver {
  private readonly logger = new Logger(AppointmentRecipientResolver.name);

  constructor(
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {}

  async resolveAdminAndStaffUserIds(): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    try {
      const records = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
        .where(
          inArray(sql`lower(${roles.code})`, ['admin', 'staf', 'staff']),
        );

      const userIds = records.map((r) => r.userId).filter(Boolean);
      return Array.from(new Set(userIds));
    } catch (error) {
      this.logger.warn(`Failed to resolve admin and staff user IDs: ${error}`);
      return [];
    }
  }
}
