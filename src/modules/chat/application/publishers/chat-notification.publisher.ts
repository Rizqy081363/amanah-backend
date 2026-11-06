import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  permissions,
  rolePermissions,
  roles,
  staffProfiles,
  userRoles,
  users,
} from '../../../../database/schema';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import {
  type DomainEvent,
  type NotificationPublisher,
} from '../../../notifications/contracts/domain-event.interface';
import { NOTIFICATION_AUDIENCE } from '../../../../common/constants/notification-audience.constants';
import { NOTIFICATION_PUBLISHER } from '../../../notifications/notifications.constants';
import {
  CHAT_EVENTS,
  CHAT_SENDER_ROLE,
} from '../../domain/constants/chat-lifecycle.constants';
import { ChatMessageEntity } from '../../domain/entities/chat-message.entity';
import { ConversationEntity } from '../../domain/entities/conversation.entity';

@Injectable()
export class ChatNotificationPublisher {
  private readonly logger = new Logger(ChatNotificationPublisher.name);

  constructor(
    @Optional()
    @Inject(NOTIFICATION_PUBLISHER)
    private readonly notificationPublisher?: NotificationPublisher,
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    @Inject(DRIZZLE_SOURCE)
    private readonly db?: DrizzleDatabase,
  ) {
    this.logger.log(
      `ChatNotificationPublisher initialized: hasPublisher=${Boolean(this.notificationPublisher)} hasGateway=${Boolean(this.notificationGateway)}`,
    );
  }

  async publishMessageCreated(params: {
    conversation: ConversationEntity;
    message: ChatMessageEntity;
    senderName: string;
    actor?: { userId?: string; roleCode?: string };
  }): Promise<void> {
    const { conversation, message, senderName, actor } = params;

    // 1. Publish Domain Event via Redis Streams (for In-App DB persistence & navbar notification center)
    if (this.notificationPublisher) {
      try {
        const domainEvent: DomainEvent = {
          eventId: randomUUID(),
          eventType: CHAT_EVENTS.MESSAGE_CREATED,
          version: 1,
          occurredAt: new Date().toISOString(),
          module: 'chat',
          payload: {
            conversationId: message.conversationId,
            messageId: message.id,
            senderRole: message.senderRole,
            senderUserId: message.senderUserId,
            senderName,
            body: message.body,
            clientMessageId: message.clientMessageId,
            guestId: conversation.guestId || null,
            guestEmail: conversation.guestEmail || null,
            patientUserId: conversation.userId || null,
            assignedStaffId: conversation.assignedStaffId || null,
          },
          actor: {
            userId: actor?.userId || message.senderUserId || undefined,
            roleCode: actor?.roleCode || undefined,
          },
        };

        await this.notificationPublisher.publish(domainEvent);
        this.logger.debug(
          `Published ${CHAT_EVENTS.MESSAGE_CREATED} domain event [id: ${domainEvent.eventId}]`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to publish chat message created event: ${error}`,
        );
      }
    }

    // 2. Dispatch via RabbitMQ Notification Gateway (Push Notification with strict Access Control)
    if (this.notificationGateway) {
      try {
        const senderActorUserId =
          actor?.userId || message.senderUserId || undefined;
        const excludedUserIds = senderActorUserId ? [senderActorUserId] : [];

        // KASUS A: Balasan Admin ke Pasien Terdaftar / Email Terdaftar (Internal -> External)
        if (message.senderRole === CHAT_SENDER_ROLE.INTERNAL) {
          let targetPatientUserId = conversation.userId;
          if (!targetPatientUserId && conversation.guestEmail && this.db) {
            const [matched] = await this.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, conversation.guestEmail))
              .limit(1);
            if (matched?.id) {
              targetPatientUserId = matched.id;
            }
          }

          if (targetPatientUserId) {
            await this.notificationGateway.dispatch({
              commandId: `chat-reply-${message.id}-${Date.now()}`,
              sourceDomain: 'chat',
              target: {
                type: 'user',
                recipientUserIds: [targetPatientUserId],
                excludedUserIds,
              },
              audience: NOTIFICATION_AUDIENCE.EXTERNAL,
              category: 'support',
              content: {
                title: 'Pesan Baru dari Klinik Amanah',
                body: message.body,
                actionUrl: `/klinik/chat?conversationId=${conversation.id}`,
                data: {
                  conversationId: conversation.id,
                  messageId: message.id,
                },
              },
              channels: ['push'],
            });
          }
        }

        // KASUS B: Pesan Pasien Masuk untuk Staf/Admin Klinik (External -> Internal)
        // Access Control Ketat: HANYA kirim push ke staf yang ditugaskan (assigned staff) atau Administrator yang berwenang
        if (message.senderRole === CHAT_SENDER_ROLE.EXTERNAL) {
          const authorizedStaffIds = await this.resolveAuthorizedChatStaffUserIds(
            conversation.assignedStaffId,
          );

          if (authorizedStaffIds.length > 0) {
            await this.notificationGateway.dispatch({
              commandId: `chat-${message.id}-${Date.now()}`,
              sourceDomain: 'chat',
              target: {
                type: 'user',
                recipientUserIds: authorizedStaffIds,
                excludedUserIds,
              },
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              category: 'support',
              content: {
                title: `Pesan Chat: ${senderName}`,
                body: message.body,
                actionUrl: `/admin/chat?conversationId=${conversation.id}`,
                data: {
                  conversationId: conversation.id,
                  messageId: message.id,
                },
              },
              channels: ['push'],
            });
          }
        }
      } catch (gatewayError) {
        this.logger.warn(
          `Failed to dispatch chat push command: ${gatewayError}`,
        );
      }
    }
  }

  private async resolveAuthorizedChatStaffUserIds(
    assignedStaffId?: string | null,
  ): Promise<string[]> {
    if (!this.db) {
      return [];
    }

    try {
      // 1. Jika ada staf spesifik yang ditugaskan pada percakapan ini
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

      // 2. Jika tidak ada staf spesifik, ambil pengguna internal aktif yang memiliki izin chat (RBAC dinamis)
      const authorizedStaff = await this.db
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
            inArray(permissions.code, ['chat:read', 'chat:send']),
            eq(roles.audience, NOTIFICATION_AUDIENCE.INTERNAL),
            isNull(userRoles.revokedAt),
          ),
        );

      return [
        ...new Set(
          authorizedStaff
            .map((r) => r.userId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
    } catch (err) {
      this.logger.warn(
        `Failed to resolve authorized chat staff user IDs: ${err}`,
      );
      return [];
    }
  }
}
