import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  permissions,
  practitioners,
  rolePermissions,
  roles,
  staffProfiles,
  userRoles,
} from '../../../../database/schema';
import { ROLE_AUDIENCE } from '../../../../common/constants/role-audience.constants';

@Injectable()
export class AppointmentRecipientResolver {
  private readonly logger = new Logger(AppointmentRecipientResolver.name);

  constructor(
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {}

  /**
   * Resolves clinic recipients according to dynamic RBAC permissions and assignment:
   * 1. Active internal staff whose role has appointment read/manage permissions
   * 2. The specifically assigned Practitioner (staffId/practitionerId), if provided.
   */
  async resolveScopedClinicRecipients(
    assignedStaffId?: string | null,
  ): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    try {
      const authorizedStaff = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(
          and(
            eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
            isNull(userRoles.revokedAt),
            inArray(permissions.code, [
              'appointments:read',
              'appointments:manage',
            ]),
          ),
        );

      const recipientIds = new Set<string>(
        authorizedStaff
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

  /**
   * Resolves all active internal staff authorized to manage appointments.
   */
  async resolveAdminAndStaffUserIds(): Promise<string[]> {
    return this.resolveScopedClinicRecipients();
  }
}
