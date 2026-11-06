import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
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
   * Resolves solely the assigned practitioner's userId, without querying clinic-wide staff.
   */
  async resolveAssignedPractitionerUserId(
    assignedStaffId?: string | null,
  ): Promise<string | null> {
    if (!this.db || !assignedStaffId) {
      return null;
    }

    try {
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

      return staff?.userId ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to resolve assigned practitioner user ID for ${assignedStaffId}: ${error}`,
      );
      return null;
    }
  }

  /**
   * Resolves all active internal clinical practitioners (roles with isClinical = true).
   */
  async resolveAllClinicalPractitionerUserIds(): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    try {
      const clinicalUsers = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(
          and(
            eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
            eq(roles.isClinical, true),
            eq(roles.isActive, true),
            isNull(userRoles.revokedAt),
          ),
        );

      const staffProfilesClinical = await this.db
        .select({ userId: staffProfiles.userId })
        .from(staffProfiles)
        .innerJoin(roles, eq(staffProfiles.roleId, roles.id))
        .where(
          and(
            eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
            eq(roles.isClinical, true),
            eq(roles.isActive, true),
            isNotNull(staffProfiles.userId),
          ),
        );

      const recipientIds = new Set<string>();
      for (const u of clinicalUsers) {
        if (u.userId) recipientIds.add(u.userId);
      }
      for (const sp of staffProfilesClinical) {
        if (sp.userId) recipientIds.add(sp.userId);
      }

      return Array.from(recipientIds);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve clinical practitioner user IDs: ${error}`,
      );
      return [];
    }
  }

  /**
   * Resolves clinic recipients according to dynamic RBAC permissions and assignment:
   * 1. Active internal staff whose role has appointment read/manage permissions OR is clinical
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
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .leftJoin(
          permissions,
          eq(rolePermissions.permissionId, permissions.id),
        )
        .where(
          and(
            eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
            eq(roles.isActive, true),
            isNull(userRoles.revokedAt),
            or(
              eq(roles.isClinical, true),
              inArray(permissions.code, [
                'appointments:read',
                'appointments:manage',
              ]),
            ),
          ),
        );

      const staffProfilesClinical = await this.db
        .select({ userId: staffProfiles.userId })
        .from(staffProfiles)
        .innerJoin(roles, eq(staffProfiles.roleId, roles.id))
        .where(
          and(
            eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
            eq(roles.isClinical, true),
            eq(roles.isActive, true),
            isNotNull(staffProfiles.userId),
          ),
        );

      const recipientIds = new Set<string>(
        authorizedStaff
          .map((r) => r.userId)
          .filter((id): id is string => Boolean(id)),
      );

      for (const sp of staffProfilesClinical) {
        if (sp.userId) {
          recipientIds.add(sp.userId);
        }
      }

      if (assignedStaffId) {
        const assignedPractitionerUserId =
          await this.resolveAssignedPractitionerUserId(assignedStaffId);
        if (assignedPractitionerUserId) {
          recipientIds.add(assignedPractitionerUserId);
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
