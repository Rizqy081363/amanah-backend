import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { ROLE_AUDIENCE } from '../../../../common/constants/role-audience.constants';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  permissions,
  rolePermissions,
  roles,
  staffProfiles,
  userRoles,
} from '../../../../database/schema';

@Injectable()
export class ChatRecipientResolver {
  private readonly logger = new Logger(ChatRecipientResolver.name);

  constructor(
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {}

  /**
   * Resolves authorized administrative desk recipients for incoming customer support messages:
   * 1. If assignedStaffId is provided: strictly resolves solely that assigned staff member's userId.
   * 2. If unassigned: strictly queries active internal non-clinical administrative staff
   *    (roles.audience = 'internal' AND roles.isClinical = false AND roles.isActive = true)
   *    who possess 'chat:read' or 'chat:send' permissions (Administrator and Customer Service).
   *
   * STRICT INVARIANT: Clinical practitioners (roles.isClinical = true, e.g. Dokter, Bidan)
   * are NEVER resolved for customer support chat tickets, eliminating any FCM push/inbox leak to Flutter mobile.
   */
  async resolveAdminChatRecipients(
    assignedStaffId?: string | null,
  ): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    try {
      // 1. If a specific staff member is assigned to this conversation, notify ONLY them
      if (assignedStaffId) {
        const [assigned] = await this.db
          .select({ userId: staffProfiles.userId })
          .from(staffProfiles)
          .where(eq(staffProfiles.id, assignedStaffId))
          .limit(1);

        if (assigned?.userId) {
          return [assigned.userId];
        }
      }

      // 2. If unassigned: query internal non-clinical administrative staff authorized to handle customer chat
      const adminStaff = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
        .innerJoin(
          permissions,
          eq(rolePermissions.permissionId, permissions.id),
        )
        .where(
          and(
            eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
            eq(roles.isClinical, false),
            eq(roles.isActive, true),
            isNull(userRoles.revokedAt),
            inArray(permissions.code, ['chat:read', 'chat:send']),
          ),
        );

      const recipientIds = new Set<string>();
      for (const row of adminStaff) {
        if (row.userId) {
          recipientIds.add(row.userId);
        }
      }

      return Array.from(recipientIds);
    } catch (error) {
      this.logger.warn(`Failed to resolve admin chat recipients: ${error}`);
      return [];
    }
  }
}
