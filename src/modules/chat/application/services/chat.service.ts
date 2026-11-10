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
import { RealtimeGatewayPort } from '../../../notifications/contracts/realtime-gateway.interface';
import {
  REALTIME_GATEWAY_PORT,
  REALTIME_ROOMS,
} from '../../../notifications/notifications.constants';
import { ChatNotificationPublisher } from '../publishers/chat-notification.publisher';
import { ChatMessageEntity } from '../../domain/entities/chat-message.entity';
import { ConversationEntity } from '../../domain/entities/conversation.entity';
import {
  CHAT_SENDER_ROLE,
  type ChatSenderRole,
} from '../../domain/constants/chat-lifecycle.constants';
import { CHAT_REPOSITORY } from '../../domain/repositories/chat.repository.interface';
import type {
  AdminConversationQueryParams,
  ChatCandidateUser,
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

    const normalizedEmail = params.email.trim();

    // Idempotensi tamu: cegah pembuatan percakapan baru jika tamu dengan email sama sudah memiliki percakapan terbuka
    const existingByEmail =
      await this.chatRepo.findConversationByGuestEmail(normalizedEmail);
    if (existingByEmail) {
      return existingByEmail;
    }

    if (params.guestId) {
      const existingByGuestId =
        await this.chatRepo.findConversationByGuestId(params.guestId);
      if (existingByGuestId) {
        return existingByGuestId;
      }
    }

    const guestId = params.guestId || randomUUID();
    return this.chatRepo.createConversation({
      guestId,
      guestName: params.name?.trim() || 'Tamu',
      guestEmail: normalizedEmail,
    });
  }

  async getActiveConversation(
    userId?: string,
    guestId?: string,
  ): Promise<ConversationEntity | null> {
    if (userId) {
      return this.chatRepo.findConversationByUserId(userId);
    }
    if (guestId) {
      return this.chatRepo.findConversationByGuestId(guestId);
    }
    return null;
  }

  async getCustomerConversations(caller: {
    userId?: string;
    guestId?: string;
    limit?: number;
  }): Promise<ConversationEntity[]> {
    if (!caller.userId && !caller.guestId) {
      throw new BadRequestException(
        'Either authenticated user or guestId is required',
      );
    }
    return this.chatRepo.findCustomerConversations({
      userId: caller.userId,
      guestId: caller.guestId,
      limit: caller.limit,
    });
  }

  async getConversationMessages(
    conversationId: string,
    params: MessageQueryParams,
    caller?: { userId?: string; guestId?: string; audience?: ChatSenderRole },
  ): Promise<PaginatedResult<ChatMessageEntity>> {
    const conversation =
      await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }

    if (caller?.audience !== CHAT_SENDER_ROLE.INTERNAL) {
      const isOwnerUser = Boolean(
        conversation.userId && caller?.userId && caller.userId === conversation.userId,
      );
      const isOwnerGuest = Boolean(
        conversation.guestId && caller?.guestId && caller.guestId === conversation.guestId,
      );
      if (!isOwnerUser && !isOwnerGuest) {
        throw new ForbiddenException('Access denied to this conversation');
      }
    }

    if (caller?.audience === CHAT_SENDER_ROLE.INTERNAL) {
      void this.chatRepo.markAdminConversationAsRead(conversationId);
    } else if (caller?.audience === CHAT_SENDER_ROLE.EXTERNAL) {
      void this.chatRepo.markCustomerConversationAsRead(conversationId);
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

    const isOwnerUser = Boolean(
      conversation.userId && caller?.userId && caller.userId === conversation.userId,
    );
    const isOwnerGuest = Boolean(
      conversation.guestId && caller?.guestId && caller.guestId === conversation.guestId,
    );
    if (!isOwnerUser && !isOwnerGuest) {
      throw new ForbiddenException('Access denied to this conversation');
    }

    const senderName =
      caller?.userName ||
      conversation.customerName ||
      (conversation.guestName ? conversation.guestName : 'Pasien');

    const message = await this.chatRepo.createMessage({
      conversationId,
      senderRole: CHAT_SENDER_ROLE.EXTERNAL,
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
        await this.realtimeGateway.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'chat:message',
          message,
        );
        const recipient = caller?.userId || caller?.guestId;
        if (recipient) {
          await this.realtimeGateway.emitToUser(
            recipient,
            'chat:message',
            message,
          );
        }
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
      senderRole: CHAT_SENDER_ROLE.INTERNAL,
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
        await this.realtimeGateway.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'chat:message',
          message,
        );
      } catch (err) {
        this.logger.warn(`Failed to broadcast admin chat message: ${err}`);
      }
    }

    return message;
  }

  async getAdminConversations(
    params: AdminConversationQueryParams,
  ): Promise<PaginatedResult<ConversationEntity>> {
    const result = await this.chatRepo.findAdminConversations(params);
    if (this.realtimeGateway) {
      result.items = result.items.map((conv) => {
        const isOnline = conv.userId
          ? (this.realtimeGateway?.isUserOnline?.(conv.userId) ?? false)
          : false;
        return new ConversationEntity({
          ...conv,
          isOnline,
        });
      });
    }
    return result;
  }

  async getAdminUnreadSummary(): Promise<{
    totalUnread: number;
    awaitingReplyCount: number;
  }> {
    return this.chatRepo.countAdminUnreadSummary();
  }

  async getChatCandidates(
    search?: string,
    limit?: number,
    currentUserId?: string,
  ): Promise<ChatCandidateUser[]> {
    return this.chatRepo.findChatCandidates(search, limit, currentUserId);
  }

  async createAdminConversation(
    targetUserId: string,
  ): Promise<ConversationEntity> {
    const existing =
      await this.chatRepo.findConversationByUserId(targetUserId);
    if (existing) {
      return existing;
    }
    return this.chatRepo.createConversation({ userId: targetUserId });
  }

  async markAdminConversationAsRead(
    conversationId: string,
  ): Promise<{ success: boolean }> {
    const conversation =
      await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }
    await this.chatRepo.markAdminConversationAsRead(conversationId);
    if (this.realtimeGateway) {
      try {
        await this.realtimeGateway.emitToRoom?.(
          REALTIME_ROOMS.clinic,
          'chat:conversation_read',
          { conversationId, readerRole: CHAT_SENDER_ROLE.INTERNAL },
        );
      } catch (err) {
        this.logger.warn(`Failed to broadcast conversation read event: ${err}`);
      }
    }
    return { success: true };
  }

  async markCustomerConversationAsRead(
    conversationId: string,
    caller?: { userId?: string; guestId?: string },
  ): Promise<{ success: boolean }> {
    const conversation =
      await this.chatRepo.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException(
        `Conversation with ID ${conversationId} not found`,
      );
    }
    const isOwnerUser = Boolean(
      conversation.userId &&
        caller?.userId &&
        caller.userId === conversation.userId,
    );
    const isOwnerGuest = Boolean(
      conversation.guestId &&
        caller?.guestId &&
        caller.guestId === conversation.guestId,
    );
    if (!isOwnerUser && !isOwnerGuest) {
      throw new ForbiddenException('Access denied to this conversation');
    }
    await this.chatRepo.markCustomerConversationAsRead(conversationId);
    return { success: true };
  }

  isAdminOnline(): boolean {
    if (
      !this.realtimeGateway ||
      typeof this.realtimeGateway.isRoomOnline !== 'function'
    ) {
      return false;
    }
    return this.realtimeGateway.isRoomOnline(REALTIME_ROOMS.clinic);
  }
}
