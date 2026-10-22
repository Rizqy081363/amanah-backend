import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { AppointmentRecipientResolver } from '../../../appointments/infrastructure/resolvers/appointment-recipient.resolver';
import { NotificationIntent } from '../../../notifications/domain/entities/notification-rule.entity';
import { NotificationRulesRegistry } from '../../../notifications/registry/notification-rules-registry';
import { CHAT_EVENTS } from '../../domain/constants/chat-lifecycle.constants';

@Injectable()
export class ChatNotificationRules implements OnModuleInit {
  private readonly logger = new Logger(ChatNotificationRules.name);

  constructor(
    private readonly registry: NotificationRulesRegistry,
    @Optional()
    private readonly recipientResolver?: AppointmentRecipientResolver,
  ) {
    this.onModuleInit();
  }

  onModuleInit(): void {
    this.registry.registerRule({
      eventType: CHAT_EVENTS.MESSAGE_CREATED,
      category: 'support',
      defaultChannels: ['in_app', 'push'],
      resolveIntents: async (
        payload: any,
        actor?: any,
      ): Promise<NotificationIntent[]> => {
        const intents: NotificationIntent[] = [];

        // 1. Customer Message Alert for Clinic Staff (Audience: 'clinic')
        if (payload.senderRole === 'customer') {
          const staffUserIds = this.recipientResolver
            ? await this.recipientResolver.resolveScopedClinicRecipients(
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
              audience: 'clinic',
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
                label: 'Buka Chat',
              },
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

        // 2. Admin Reply Alert for Registered Patient (Audience: 'patient')
        if (payload.senderRole === 'admin' && payload.patientUserId) {
          if (!actor?.userId || actor.userId !== payload.patientUserId) {
            intents.push({
              recipientUserId: payload.patientUserId,
              audience: 'patient',
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
                label: 'Buka Chat',
              },
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
