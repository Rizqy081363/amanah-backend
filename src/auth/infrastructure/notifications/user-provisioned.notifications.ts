import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { NOTIFICATION_AUDIENCE } from '../../../common/constants/notification-audience.constants';
import { ROLE_AUDIENCE } from '../../../common/constants/role-audience.constants';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import { permissions, rolePermissions, roles, staffProfiles, userRoles } from '../../../database/schema';
import { NotificationIntent } from '../../../modules/notifications/domain/entities/notification-rule.entity';
import { NotificationRulesRegistry } from '../../../modules/notifications/registry/notification-rules-registry';
import { AUTH_EVENTS } from '../../domain/constants/auth-events.constants';

@Injectable()
export class UserProvisionedNotificationRules implements OnModuleInit {
  private readonly logger = new Logger(UserProvisionedNotificationRules.name);

  constructor(
    private readonly registry: NotificationRulesRegistry,
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {
    this.onModuleInit();
  }

  onModuleInit(): void {
    this.registry.registerRule({
      eventType: AUTH_EVENTS.USER_PROVISIONED,
      category: 'system',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: {
          userId: string;
          name: string;
          email: string;
          roleId: string;
          roleName: string;
          roleCode: string;
          audience: string;
          avatarUrl?: string | null;
        },
        actor?: { userId?: string },
      ): Promise<NotificationIntent[]> => {
        if (!this.db) {
          return [];
        }

        try {
          // Resolve authorized clinic staff through dynamic RBAC capabilities
          const authorizedStaff = await this.db
            .select({ userId: userRoles.userId })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(
              and(
                eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
                eq(roles.isActive, true),
                isNull(userRoles.revokedAt),
                inArray(permissions.code, [
                  'users:read',
                  'users:manage',
                  'roles:manage',
                ]),
              ),
            );

          const authorizedStaffProfiles = await this.db
            .select({ userId: staffProfiles.userId })
            .from(staffProfiles)
            .innerJoin(roles, eq(staffProfiles.roleId, roles.id))
            .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
            .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
            .where(
              and(
                eq(roles.audience, ROLE_AUDIENCE.INTERNAL),
                eq(roles.isActive, true),
                isNotNull(staffProfiles.userId),
                inArray(permissions.code, [
                  'users:read',
                  'users:manage',
                  'roles:manage',
                ]),
              ),
            );

          const recipientUserIds = new Set<string>();
          for (const s of authorizedStaff) {
            if (s.userId && (!actor?.userId || actor.userId !== s.userId)) {
              recipientUserIds.add(s.userId);
            }
          }
          for (const sp of authorizedStaffProfiles) {
            if (sp.userId && (!actor?.userId || actor.userId !== sp.userId)) {
              recipientUserIds.add(sp.userId);
            }
          }

          const intents: NotificationIntent[] = [];
          for (const recipientUserId of recipientUserIds) {
            intents.push({
              recipientUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: 'Pengguna Baru Terdaftar',
              body: `${payload.name}\n${payload.email} · ${payload.roleName}`,
              severity: 'info',
              action: {
                type: 'view_role_management',
                params: {
                  roleId: payload.roleId || '',
                },
                label: 'Lihat',
              },
              actions: [
                {
                  label: 'Lihat',
                  actionKey: 'view_role_management',
                  actionType: 'primary',
                  url: '/admin/management-role',
                },
              ],
              badgeIcon: 'user-plus',
              senderName: payload.name,
              senderRole: payload.roleName,
              isUrgent: false,
              presentation: {
                toast: true,
              },
            });
          }

          return intents;
        } catch (error) {
          this.logger.warn(
            `Failed to resolve authorized recipients for ${AUTH_EVENTS.USER_PROVISIONED}: ${error}`,
          );
          return [];
        }
      },
    });

    this.logger.log(
      `Registered auth notification rule for "${AUTH_EVENTS.USER_PROVISIONED}"`,
    );
  }
}
