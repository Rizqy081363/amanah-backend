import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { eq, inArray, or, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  practitioners,
  roles,
  staffProfiles,
  userRoles,
} from '../../../../database/schema';
import { CLINIC_ADMIN_STAFF_ROLE_CODES } from '../../domain/constants/appointment-lifecycle.constants';

@Injectable()
export class AppointmentRecipientResolver {
  private readonly logger = new Logger(AppointmentRecipientResolver.name);

  constructor(
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {}

  /**
   * Resolves clinic recipients according to least privilege / need-to-know:
   * 1. Clinic Admins (`admin`)
   * 2. Clinic Frontdesk / Registration staff (`staff_worker`, `frontdesk`)
   * 3. The specifically assigned Practitioner (`staffId`), if provided.
   * Other doctors/midwives DO NOT receive the appointment notification.
   */
  async resolveScopedClinicRecipients(
    assignedStaffId?: string | null,
  ): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    try {
      const adminWorkerRecords = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
        .where(
          inArray(sql`lower(${roles.code})`, [
            'admin',
            'staff_worker',
            'frontdesk',
          ]),
        );

      const recipientIds = new Set<string>(
        adminWorkerRecords
          .map((r) => r.userId)
          .filter((id): id is string => Boolean(id)),
      );

      if (assignedStaffId) {
        const [staff] = await this.db
          .select({ userId: staffProfiles.userId })
          .from(staffProfiles)
          .leftJoin(
            practitioners,
            eq(practitioners.staffProfileId, staffProfiles.id),
          )
          .where(
            or(
              eq(staffProfiles.id, assignedStaffId),
              eq(practitioners.id, assignedStaffId),
            ),
          )
          .limit(1);

        if (staff?.userId) {
          recipientIds.add(staff.userId);
        }
      }

      return Array.from(recipientIds);
    } catch (error) {
      this.logger.warn(`Failed to resolve scoped clinic recipients: ${error}`);
      return [];
    }
  }

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
          inArray(
            sql`lower(${roles.code})`,
            CLINIC_ADMIN_STAFF_ROLE_CODES.map((code) => code.toLowerCase()),
          ),
        );

      const userIds = records.map((r) => r.userId).filter(Boolean);
      return Array.from(new Set(userIds));
    } catch (error) {
      this.logger.warn(`Failed to resolve admin and staff user IDs: ${error}`);
      return [];
    }
  }
}
