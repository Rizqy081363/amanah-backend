import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CHAT_SUPPORT_ROLE_CODES } from '../../domain/constants/chat-lifecycle.constants';
import { RealtimeGatewayPort } from '../../../notifications/contracts/realtime-gateway.interface';
import { REALTIME_GATEWAY_PORT } from '../../../notifications/notifications.constants';
import { ChatNotificationPublisher } from '../publishers/chat-notification.publisher';
import { ChatMessageEntity } from '../../domain/entities/chat-message.entity';
import { ConversationEntity } from '../../domain/entities/conversation.entity';
import {
  AdminConversationQueryParams,
  CHAT_REPOSITORY,
  ChatRepositoryInterface,
  MessageQueryParams,
  PaginatedResult,
} from '../../domain/repositories/chat.repository.interface';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(CHAT_REPOSITORY)
    private readonly chatRepo: ChatRepositoryInterface,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: RealtimeGatewayPort,
    @Optional()
    private readonly notificationPublisher?: ChatNotificationPublisher,
  ) {}

  async getOrCreateCustomerConversation(params: {
    userId?: string;
    guestId?: string;
    name?: string;
    email?: string;
  }): Promise<ConversationEntity> {
    if (params.userId) {
      return this.chatRepo.createConversation({
        userId: params.userId,
      });
    }

    if (!params.email || !params.email.includes('@')) {
      throw new BadRequestException(
        'Email tamu wajib diisi dengan format valid untuk memulai percakapan',
      );
    }

    const guestId = params.guestId || randomUUID();
    return this.chatRepo.createConversation({
      guestId,
      guestName: params.name?.trim() || 'Tamu',
      guestEmail: params.email.trim(),
    });
  }

  async getActiveConversation(
    userId?: string,
    guestId?: string,
  ): Promise<ConversationEntity | null> {
    if (userId) {
      return this.chatRepo.findOpenConversationByUserId(userId);
    }
    if (guestId) {
      return this.chatRepo.findOpenConversationByGuestId(guestId);
    }
    return null;
  }

  async getConversationMessages(
    conversationId: string,
    params: MessageQueryParams,
    caller?: { userId?: string; guestId?: string; isAdmin?: boolean },
  ): Promise<PaginatedResult<ChatMessageEntity>> {
    const conversation =
      await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    if (!caller?.isAdmin) {
      if (conversation.userId && caller?.userId !== conversation.userId) {
        throw new ForbiddenException('Access denied to this conversation');
      }
      if (conversation.guestId && caller?.guestId !== conversation.guestId) {
        throw new ForbiddenException('Access denied to this conversation');
      }
    }

    return this.chatRepo.findMessagesByConversationId(conversationId, params);
  }

  async sendCustomerMessage(
    conversationId: string,
    body: string,
    clientMessageId?: string,
    caller?: { userId?: string; guestId?: string; userName?: string },
  ): Promise<ChatMessageEntity> {
    const conversation =
      await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    if (conversation.status === 'closed') {
      throw new BadRequestException(
        'Cannot send message to a closed conversation',
      );
    }

    const trimmedBody = body?.trim() || '';
    if (!trimmedBody) {
      throw new BadRequestException(
        'Pesan tidak boleh kosong / Message body cannot be empty',
      );
    }
    if (trimmedBody.length > 4000) {
      throw new BadRequestException(
        'Pesan melebihi batas maksimal 4000 karakter',
      );
    }

    if (conversation.userId) {
      if (!caller?.userId || caller.userId !== conversation.userId) {
        throw new ForbiddenException('Access denied to this conversation');
      }
    } else if (conversation.guestId) {
      if (!caller?.guestId || caller.guestId !== conversation.guestId) {
        throw new ForbiddenException('Access denied to this conversation');
      }
    }

    const senderName =
      caller?.userName ||
      conversation.customerName ||
      (conversation.guestName ? conversation.guestName : 'Pasien');

    const message = await this.chatRepo.createMessage({
      conversationId,
      senderRole: 'customer',
      senderUserId: caller?.userId || null,
      clientMessageId: clientMessageId || randomUUID(),
      body: body.trim(),
      authorSnapshot: senderName,
    });

    // 1. Publish EDA domain event for persistent notification & toast pipeline
    if (this.notificationPublisher) {
      void this.notificationPublisher.publishMessageCreated({
        conversation,
        message,
        senderName,
        actor: {
          userId: caller?.userId,
          roleCode: 'patient',
        },
      });
    }

    // 2. Real-time in-app socket distribution for active chat thread
    if (this.realtimeGateway) {
      try {
        await this.realtimeGateway.emitToRoom?.(
          `chat:${conversationId}`,
          'chat:message',
          message,
        );
        await this.realtimeGateway.emitToRole?.(
          'admin',
          'chat:message',
          message,
        );
        await this.realtimeGateway.emitToRole?.(
          'staff_worker',
          'chat:message',
          message,
        );
      } catch (err) {
        this.logger.warn(`Failed to broadcast customer chat message: ${err}`);
      }
    }

    return message;
  }

  async sendAdminMessage(
    conversationId: string,
    adminUserId: string,
    adminName: string,
    body: string,
    clientMessageId?: string,
  ): Promise<ChatMessageEntity> {
    const conversation =
      await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    if (conversation.status === 'closed') {
      throw new BadRequestException(
        'Cannot send message to a closed conversation',
      );
    }

    const trimmedBody = body?.trim() || '';
    if (!trimmedBody) {
      throw new BadRequestException(
        'Pesan tidak boleh kosong / Message body cannot be empty',
      );
    }
    if (trimmedBody.length > 4000) {
      throw new BadRequestException(
        'Pesan melebihi batas maksimal 4000 karakter',
      );
    }

    const message = await this.chatRepo.createMessage({
      conversationId,
      senderRole: 'admin',
      senderUserId: adminUserId,
      clientMessageId: clientMessageId || randomUUID(),
      body: trimmedBody,
      authorSnapshot: adminName || 'Admin Klinik',
    });

    // 1. Publish EDA domain event for registered patient if applicable
    if (this.notificationPublisher && conversation.userId) {
      void this.notificationPublisher.publishMessageCreated({
        conversation,
        message,
        senderName: adminName || 'Admin Klinik',
        actor: {
          userId: adminUserId,
          roleCode: 'admin',
        },
      });
    }

    // 2. Real-time distribution
    if (this.realtimeGateway) {
      try {
        await this.realtimeGateway.emitToRoom?.(
          `chat:${conversationId}`,
          'chat:message',
          message,
        );
        if (conversation.userId) {
          await this.realtimeGateway.emitToUser(
            conversation.userId,
            'chat:message',
            message,
          );
        } else if (conversation.guestId) {
          await this.realtimeGateway.emitToUser(
            conversation.guestId,
            'chat:message',
            message,
          );
        }
        await this.realtimeGateway.emitToRole?.(
          'admin',
          'chat:message',
          message,
        );
        await this.realtimeGateway.emitToRole?.(
          'staff_worker',
          'chat:message',
          message,
        );
      } catch (err) {
        this.logger.warn(`Failed to broadcast admin chat message: ${err}`);
      }
    }

    return message;
  }

  async closeConversation(conversationId: string): Promise<ConversationEntity> {
    const conversation =
      await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    const closed = await this.chatRepo.closeConversation(conversationId);

    // Notify real-time participants
    if (this.realtimeGateway) {
      const payload = { conversationId, status: 'closed' };
      if (conversation.userId) {
        await this.realtimeGateway.emitToUser(
          conversation.userId,
          'chat:conversation_closed',
          payload,
        );
      } else if (conversation.guestId) {
        await this.realtimeGateway.emitToUser(
          conversation.guestId,
          'chat:conversation_closed',
          payload,
        );
      }
      await this.realtimeGateway.emitToRole?.(
        'admin',
        'chat:conversation_closed',
        payload,
      );
      await this.realtimeGateway.emitToRole?.(
        'staff_worker',
        'chat:conversation_closed',
        payload,
      );
    }

    return closed;
  }

  async getAdminConversations(
    params: AdminConversationQueryParams,
  ): Promise<PaginatedResult<ConversationEntity>> {
    return this.chatRepo.findAdminConversations(params);
  }

  isAdminOnline(): boolean {
    if (
      !this.realtimeGateway ||
      typeof this.realtimeGateway.isRoleOnline !== 'function'
    ) {
      return false;
    }
    return CHAT_SUPPORT_ROLE_CODES.some((role: string) =>
      this.realtimeGateway!.isRoleOnline!(role),
    );
  }
}
