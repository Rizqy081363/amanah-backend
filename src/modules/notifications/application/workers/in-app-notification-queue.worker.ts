import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { NOTIFICATIONS_IN_APP_QUEUE } from '../../../../common/rabbitmq/rabbitmq.constants';
import { RabbitMQService } from '../../../../common/rabbitmq/rabbitmq.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { roles, userRoles } from '../../../../database/schema';
import { NotificationDispatchCommand } from '../../contracts/notification-dispatch.contract';
import { NotificationRepository } from '../../domain/repositories/notification.repository';
import { SocketIoRealtimeGateway } from '../../infrastructure/realtime/socket-io-realtime.gateway';
import {
  NOTIFICATION_REPOSITORY,
  NOTIFICATION_SOURCE_DOMAINS,
  NotificationEnvelopeV2,
  REALTIME_EVENTS,
  REALTIME_GATEWAY_PORT,
} from '../../notifications.constants';

@Injectable()
export class InAppNotificationQueueWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(InAppNotificationQueueWorker.name);
  private isConsuming = false;

  constructor(
    private readonly rabbitmqService: RabbitMQService,
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly notificationRepo: NotificationRepository,
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway: SocketIoRealtimeGateway,
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    this.isConsuming = false;
  }

  private async startConsumer(): Promise<void> {
    if (this.isConsuming) {
      return;
    }
    const channel = this.rabbitmqService.getChannel();
    if (!channel) {
      this.logger.warn(
        'RabbitMQ channel not ready; retrying in-app consumer in 3 seconds',
      );
      setTimeout(() => void this.startConsumer(), 3000);
      return;
    }

    try {
      await channel.prefetch(10);
      await channel.consume(
        NOTIFICATIONS_IN_APP_QUEUE,
        async (msg) => {
          if (!msg) return;
          try {
            const content = JSON.parse(
              msg.content.toString(),
            ) as NotificationDispatchCommand;
            await this.processInAppCommand(content);
            channel.ack(msg);
          } catch (err) {
            this.logger.error(
              `Error processing in-app message: ${String(err)}`,
            );
            channel.nack(msg, false, false);
          }
        },
        { noAck: false },
      );

      this.isConsuming = true;
      this.logger.log('In-app notification queue consumer started');
    } catch (err) {
      this.logger.error(
        `Failed to start in-app queue consumer: ${String(err)}`,
      );
    }
  }

  private async processInAppCommand(
    command: NotificationDispatchCommand,
  ): Promise<void> {
    const targetUserIds = await this.resolveTargetUserIds(command);
    const { target, content } = command;

    // 1. Broadcast domain-specific event to role rooms if target is role
    if (target.type === 'role' && target.roles && target.roles.length > 0) {
      for (const role of target.roles) {
        await this.realtimeGateway.emitToRole(
          role.toLowerCase(),
          `${command.sourceDomain}:updated`,
          content.data || {},
        );
      }
    }

    // 2. Broadcast domain-specific event directly to target user sockets
    for (const userId of targetUserIds) {
      await this.realtimeGateway.emitToUser(
        userId,
        `${command.sourceDomain}:updated`,
        content.data || {},
      );
    }

    // 3. For each recipient, persist notification in database and emit envelope
    for (const userId of targetUserIds) {
      const idempotencyKey = `${command.commandId}:${userId}:in_app`;

      const badgeIcon =
        command.sourceDomain === NOTIFICATION_SOURCE_DOMAINS.ATTENDANCE
          ? 'clock'
          : command.sourceDomain === NOTIFICATION_SOURCE_DOMAINS.PAYROLL
            ? 'wallet'
            : 'calendar';

      const audience = (content.data?.audience as any) || 'clinic';

      const persisted = await this.notificationRepo.createIfNotExists({
        idempotencyKey,
        category: command.category || 'shift',
        audience,
        title: content.title,
        body: content.body,
        senderName: 'Sistem Klinik',
        senderRole: 'Klinik Amanah',
        badgeIcon,
        visualKey: command.sourceDomain || 'shift',
        isUrgent: command.priority === 'high',
        sourceType: command.sourceDomain,
        sourceId:
          (content.data?.opportunityId as string) ||
          (content.data?.leaveRequestId as string) ||
          (content.data?.attendanceId as string) ||
          (content.data?.sourceId as string) ||
          null,
        metadata: {
          commandId: command.commandId,
          sourceDomain: command.sourceDomain,
          actionUrl: content.actionUrl,
          ...(content.data || {}),
        },
        recipientUserIds: [userId],
        actions: content.actionUrl
          ? [
              {
                label: 'Lihat',
                actionKey: `view_${command.sourceDomain}`,
                actionType: 'primary',
                url: content.actionUrl,
              },
            ]
          : [],
      });

      const notifId = persisted?.id || command.commandId;
      const envelope: NotificationEnvelopeV2 = {
        schemaVersion: 2,
        id: notifId,
        eventId: command.commandId,
        audience,
        recipientUserId: userId,
        type: command.category || command.sourceDomain,
        title: content.title,
        body: content.body,
        severity: command.priority === 'high' ? 'warning' : 'info',
        actions: content.actionUrl
          ? [
              {
                label: 'Lihat',
                actionKey: `view_${command.sourceDomain}`,
                actionType: 'primary',
                url: content.actionUrl,
              },
            ]
          : undefined,
        presentation: {
          toast: true,
        },
        createdAt: new Date().toISOString(),
        badgeIcon,
        senderName: 'Sistem Klinik',
        senderRole: 'Klinik Amanah',
      };

      await this.realtimeGateway.emitToUser(
        userId,
        REALTIME_EVENTS.NOTIFICATION_NEW,
        envelope,
      );
    }

    this.logger.log(
      `Dispatched in-app notification [cmd=${command.commandId}, domain=${command.sourceDomain}, recipients=${targetUserIds.length}]`,
    );
  }

  private async resolveTargetUserIds(
    command: NotificationDispatchCommand,
  ): Promise<string[]> {
    const { target } = command;
    if (target.type === 'user') {
      return target.recipientUserIds || [];
    }

    if (
      target.type === 'role' &&
      target.roles &&
      target.roles.length > 0 &&
      this.db
    ) {
      const normalizedRoles = target.roles.map((r) => r.toLowerCase());
      const rows = await this.db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
        .where(inArray(sql`lower(${roles.code})`, normalizedRoles));

      return [...new Set(rows.map((r) => r.userId))];
    }

    return [];
  }
}
