import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { NOTIFICATION_AUDIENCE } from '../../../../common/constants/notification-audience.constants';
import { NotificationIntent } from '../../../notifications/domain/entities/notification-rule.entity';
import { NotificationRulesRegistry } from '../../../notifications/registry/notification-rules-registry';
import {
  CHAT_EVENTS,
  CHAT_SENDER_ROLE,
} from '../../domain/constants/chat-lifecycle.constants';
import { ChatRecipientResolver } from '../resolvers/chat-recipient.resolver';

@Injectable()
export class ChatNotificationRules implements OnModuleInit {
  private readonly logger = new Logger(ChatNotificationRules.name);

  constructor(
    private readonly registry: NotificationRulesRegistry,
    @Optional()
    private readonly recipientResolver?: ChatRecipientResolver,
  ) {
    this.onModuleInit();
  }

  onModuleInit(): void {
    this.registry.registerRule({
      eventType: CHAT_EVENTS.MESSAGE_CREATED,
      category: 'support',
      defaultChannels: ['in_app'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];

        // 1. Customer Message Alert for Administrative Desk (Audience: NOTIFICATION_AUDIENCE.INTERNAL)
        // Strict Invariant: Delivered ONLY to assigned staff or non-clinical administrative desk (Admin & CS)
        if (payload.senderRole === CHAT_SENDER_ROLE.EXTERNAL) {
          const staffUserIds = this.recipientResolver
            ? await this.recipientResolver.resolveAdminChatRecipients(
                payload.assignedStaffId,
              )
            : [];

          for (const staffUserId of staffUserIds) {
            // Never notify the actor if the actor was the staff themselves
            if (actor?.userId && actor.userId === staffUserId) {
              continue;
            }

            intents.push({
              recipientUserId: staffUserId,
              audience: NOTIFICATION_AUDIENCE.INTERNAL,
              title: `Pesan Chat: ${payload.senderName || 'Pasien'}`,
              body:
                payload.body && payload.body.length > 120
                  ? `${payload.body.slice(0, 120)}...`
                  : payload.body || 'Pesan baru diterima.',
              severity: 'info',
              action: {
                type: 'view_chat',
                params: {
                  conversationId: payload.conversationId || '',
                },
                label: 'Balas',
              },
              actions: [
                {
                  label: 'Balas',
                  actionKey: 'view_chat',
                  actionType: 'primary',
                  url: `/admin/chat?conversationId=${payload.conversationId || ''}`,
                },
              ],
              badgeIcon: 'message-square',
              senderName: payload.senderName || 'Pasien',
              senderRole: 'Pasien / Tamu',
              isUrgent: false,
              presentation: {
                toast: true,
              },
            });
          }
        }

        // 2. Admin Reply Alert for Registered Patient (Audience: NOTIFICATION_AUDIENCE.EXTERNAL)
        if (
          payload.senderRole === CHAT_SENDER_ROLE.INTERNAL &&
          payload.patientUserId
        ) {
          if (!actor?.userId || actor.userId !== payload.patientUserId) {
            intents.push({
              recipientUserId: payload.patientUserId,
              audience: NOTIFICATION_AUDIENCE.EXTERNAL,
              title: 'Pesan Baru dari Klinik Amanah',
              body:
                payload.body && payload.body.length > 120
                  ? `${payload.body.slice(0, 120)}...`
                  : payload.body || 'Balasan pesan baru diterima.',
              severity: 'info',
              action: {
                type: 'view_chat',
                params: {
                  conversationId: payload.conversationId || '',
                },
                label: 'Balas',
              },
              actions: [
                {
                  label: 'Balas',
                  actionKey: 'view_chat',
                  actionType: 'primary',
                  url: '/klinik/chat',
                },
              ],
              badgeIcon: 'message-square',
              senderName: payload.senderName || 'Admin Klinik',
              senderRole: 'Klinik Amanah',
              isUrgent: false,
              presentation: {
                toast: true,
              },
            });
          }
        }

        return intents;
      },
    });

    this.logger.log(
      `Registered chat notification rule for "${CHAT_EVENTS.MESSAGE_CREATED}"`,
    );
  }
}
