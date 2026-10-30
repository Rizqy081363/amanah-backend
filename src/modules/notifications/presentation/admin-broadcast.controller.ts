import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { PermissionsGuard } from '../../../common/auth/permissions.guard';
import { RequirePermissions } from '../../../common/auth/permissions.decorator';
import { zodPipe } from '../../../common/validation';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  patientProfiles,
  roles,
  staffProfiles,
  userRoles,
  users,
} from '../../../database/schema/amanah.schema';
import { NotificationGatewayService } from '../application/services/notification-gateway.service';
import { NotificationDispatchCommand } from '../contracts/notification-dispatch.contract';
import {
  AdminBroadcastInput,
  AdminBroadcastSchema,
  resolveAudienceTarget,
} from './schemas/admin-broadcast.schema';

@ApiTags('Admin Notifications Broadcast')
@ApiBearerAuth()
@UseGuards(HybridAuthGuard, PermissionsGuard)
@Controller({ path: 'admin/notifications', version: '1' })
export class AdminBroadcastController {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly notificationGateway: NotificationGatewayService,
  ) {}

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('notifications:broadcast')
  @ApiOperation({
    summary: 'Menyiarkan notifikasi massal ke seluruh pengguna, internal staf, pasien, atau peran tertentu',
    description:
      'Memungkinkan Admin mengirimkan pengumuman dinamis ke pengguna yang ditargetkan tanpa keterikatan pada peran statis.',
  })
  async broadcastNotification(
    @Body(zodPipe(AdminBroadcastSchema)) dto: AdminBroadcastInput,
    @CurrentUser() adminUser: any,
  ) {
    let recipientUserIds: string[] = [];
    let targetRoleAudience: any = null;

    switch (dto.targetScope) {
      case 'all': {
        const activeUsers = await this.db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.status, 'active'));
        recipientUserIds = activeUsers.map((u) => u.id);
        break;
      }

      case 'internal': {
        const activeStaff = await this.db
          .select({ userId: staffProfiles.userId })
          .from(staffProfiles)
          .where(
            and(
              eq(staffProfiles.status, 'active'),
              sql`${staffProfiles.userId} IS NOT NULL`,
            ),
          );
        recipientUserIds = [
          ...new Set(
            activeStaff
              .map((s) => s.userId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        break;
      }

      case 'external': {
        const activePatients = await this.db
          .select({ userId: patientProfiles.userId })
          .from(patientProfiles)
          .where(
            and(
              eq(patientProfiles.status, 'active'),
              sql`${patientProfiles.userId} IS NOT NULL`,
            ),
          );
        recipientUserIds = [
          ...new Set(
            activePatients
              .map((p) => p.userId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        break;
      }

      case 'roles': {
        const targetRoleIds = dto.targetRoleIds || [];
        if (targetRoleIds.length === 0) {
          recipientUserIds = [];
          break;
        }

        const roleRecords = await this.db
          .select({ audience: roles.audience })
          .from(roles)
          .where(inArray(roles.id, targetRoleIds))
          .limit(1);
        targetRoleAudience = roleRecords[0]?.audience ?? null;

        const staffWithRoles = await this.db
          .select({ userId: staffProfiles.userId })
          .from(staffProfiles)
          .where(
            and(
              inArray(staffProfiles.roleId, targetRoleIds),
              eq(staffProfiles.status, 'active'),
              sql`${staffProfiles.userId} IS NOT NULL`,
            ),
          );

        const usersWithRoles = await this.db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(
            and(
              inArray(userRoles.roleId, targetRoleIds),
              sql`${userRoles.revokedAt} IS NULL`,
            ),
          );

        const combined = [
          ...staffWithRoles.map((s) => s.userId),
          ...usersWithRoles.map((u) => u.userId),
        ].filter((id): id is string => Boolean(id));

        recipientUserIds = [...new Set(combined)];
        break;
      }
    }

    if (recipientUserIds.length === 0) {
      return {
        success: true,
        commandId: null,
        targetScope: dto.targetScope,
        recipientsCount: 0,
        message: 'Tidak ada penerima aktif yang memenuhi kriteria target.',
      };
    }

    const audienceTarget = resolveAudienceTarget(
      dto.targetScope,
      targetRoleAudience,
      dto.targetRoleIds?.length === 1 ? dto.targetRoleIds[0] : null,
    );

    const command: NotificationDispatchCommand = {
      commandId: randomUUID(),
      sourceDomain: 'admin_broadcast',
      audience: audienceTarget.audience,
      targetRoleId: audienceTarget.targetRoleId,
      target: {
        type: 'user',
        recipientUserIds,
      },
      category: dto.category as any,
      content: {
        title: dto.title,
        body: dto.body,
        data: {
          broadcastBy: adminUser?.id,
          targetScope: dto.targetScope,
        },
      },
      channels: dto.channels as Array<'push' | 'in_app' | 'email'>,
      priority: dto.priority,
    };

    const dispatched = await this.notificationGateway.dispatch(command);

    return {
      success: dispatched,
      commandId: command.commandId,
      targetScope: dto.targetScope,
      recipientsCount: recipientUserIds.length,
    };
  }
}
