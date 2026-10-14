import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { CLINIC_ADMIN_STAFF_ROLE_CODES } from '../../../appointments/domain/constants/appointment-lifecycle.constants';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import {
  type DomainEvent,
  type NotificationPublisher,
} from '../../../notifications/contracts/domain-event.interface';
import { NOTIFICATION_PUBLISHER } from '../../../notifications/notifications.constants';
import { CHAT_EVENTS } from '../../domain/constants/chat-lifecycle.constants';
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
          },
          actor: {
            userId: actor?.userId || message.senderUserId || undefined,
            roleCode:
              actor?.roleCode ||
              (message.senderRole === 'customer' ? 'patient' : 'admin'),
          },
        };

        await this.notificationPublisher.publish(domainEvent);
        this.logger.debug(
          `Published ${CHAT_EVENTS.MESSAGE_CREATED} domain event [id: ${domainEvent.eventId}]`,
        );
      } catch (error) {
        this.logger.error(`Failed to publish chat message created event: ${error}`);
      }
    }

    // 2. Dispatch via RabbitMQ Notification Gateway (for mobile / browser Web Push)
    if (this.notificationGateway) {
      try {
        if (message.senderRole === 'customer') {
          await this.notificationGateway.dispatch({
            commandId: `chat-${message.id}-${Date.now()}`,
            sourceDomain: 'chat',
            target: {
              type: 'role',
              roles: Array.from(CLINIC_ADMIN_STAFF_ROLE_CODES),
            },
            category: 'support',
            content: {
              title: `Pesan Chat: ${senderName}`,
              body: message.body,
              actionUrl: `/dashboard/chat?conversationId=${conversation.id}`,
              data: {
                conversationId: conversation.id,
                messageId: message.id,
              },
            },
            channels: ['push'],
          });
        } else if (message.senderRole === 'admin' && conversation.userId) {
          await this.notificationGateway.dispatch({
            commandId: `chat-reply-${message.id}-${Date.now()}`,
            sourceDomain: 'chat',
            target: {
              type: 'user',
              recipientUserIds: [conversation.userId],
            },
            category: 'support',
            content: {
              title: 'Pesan Baru dari Klinik Amanah',
              body: message.body,
              actionUrl: `/dashboard/klinik/chat?conversationId=${conversation.id}`,
              data: {
                conversationId: conversation.id,
                messageId: message.id,
              },
            },
            channels: ['push'],
          });
        }
      } catch (gatewayError) {
        this.logger.warn(`Failed to dispatch chat push command: ${gatewayError}`);
      }
    }
  }
}
