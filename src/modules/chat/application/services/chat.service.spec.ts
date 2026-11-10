import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatMessageEntity } from '../../domain/entities/chat-message.entity';
import { ConversationEntity } from '../../domain/entities/conversation.entity';
import { CHAT_SENDER_ROLE } from '../../domain/constants/chat-lifecycle.constants';
import type {
  AdminConversationQueryParams,
  ChatCandidateUser,
  ChatRepositoryInterface,
  CreateChatMessageParams,
  CreateConversationParams,
  CustomerConversationQueryParams,
  MessageQueryParams,
  PaginatedResult,
} from '../../domain/repositories/chat.repository.interface';
import type { RealtimeGatewayPort } from '../../../notifications/contracts/realtime-gateway.interface';

/**
 * In-memory test double representing the authoritative Chat persistence layer.
 * Mirrors the canonical WhatsApp-model constraints (1 continuous room per contact).
 */
class InMemoryChatRepository implements ChatRepositoryInterface {
  public conversations: ConversationEntity[] = [];
  public messages: ChatMessageEntity[] = [];

  async findConversationByUserId(userId: string): Promise<ConversationEntity | null> {
    return this.conversations.find((c) => c.userId === userId) ?? null;
  }

  async findConversationByGuestId(guestId: string): Promise<ConversationEntity | null> {
    return this.conversations.find((c) => c.guestId === guestId) ?? null;
  }

  async findConversationByGuestEmail(email: string): Promise<ConversationEntity | null> {
    return (
      this.conversations.find(
        (c) => c.guestEmail?.toLowerCase() === email.toLowerCase(),
      ) ?? null
    );
  }

  async findConversationById(id: string): Promise<ConversationEntity | null> {
    return this.conversations.find((c) => c.id === id) ?? null;
  }

  async createConversation(params: CreateConversationParams): Promise<ConversationEntity> {
    if (params.userId) {
      const existing = await this.findConversationByUserId(params.userId);
      if (existing) return existing;
    }
    if (params.guestId) {
      const existing = await this.findConversationByGuestId(params.guestId);
      if (existing) return existing;
    }

    const conv = new ConversationEntity({
      id: `conv-${this.conversations.length + 1}`,
      userId: params.userId,
      guestId: params.guestId,
      guestName: params.guestName,
      guestEmail: params.guestEmail,
      customerName: params.guestName || (params.userId ? 'Pasien Terdaftar' : 'Tamu'),
      customerEmail: params.guestEmail || 'patient@example.com',
      lastMessageAt: new Date().toISOString(),
      awaitingReply: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    this.conversations.push(conv);
    return conv;
  }

  async findAdminConversations(
    params: AdminConversationQueryParams,
  ): Promise<PaginatedResult<ConversationEntity>> {
    let items = [...this.conversations].filter((c) => Boolean(c.lastMessageAt));
    if (params.awaitingReply !== undefined) {
      items = items.filter((c) => c.awaitingReply === params.awaitingReply);
    }
    return {
      items,
      nextCursor: null,
      hasMore: false,
      total: items.length,
    };
  }

  async findCustomerConversations(
    params: CustomerConversationQueryParams,
  ): Promise<ConversationEntity[]> {
    return this.conversations.filter((c) => {
      if (params.userId && c.userId === params.userId) return true;
      if (params.guestId && c.guestId === params.guestId) return true;
      return false;
    });
  }

  async findMessagesByConversationId(
    conversationId: string,
    _params: MessageQueryParams,
  ): Promise<PaginatedResult<ChatMessageEntity>> {
    const items = this.messages.filter((m) => m.conversationId === conversationId);
    return {
      items,
      nextCursor: null,
      hasMore: false,
      total: items.length,
    };
  }

  async createMessage(params: CreateChatMessageParams): Promise<ChatMessageEntity> {
    const msg = new ChatMessageEntity({
      id: `msg-${this.messages.length + 1}`,
      conversationId: params.conversationId,
      senderRole: params.senderRole,
      senderUserId: params.senderUserId,
      clientMessageId: params.clientMessageId,
      body: params.body,
      senderName: params.authorSnapshot || 'Unknown',
      createdAt: new Date().toISOString(),
    });
    this.messages.push(msg);

    const conv = this.conversations.find((c) => c.id === params.conversationId);
    if (conv) {
      conv.lastMessageAt = msg.createdAt;
      conv.lastMessagePreview = msg.body;
      conv.awaitingReply = params.senderRole === CHAT_SENDER_ROLE.EXTERNAL;
    }

    return msg;
  }

  async findChatCandidates(
    _search?: string,
    _limit?: number,
    _currentUserId?: string,
  ): Promise<ChatCandidateUser[]> {
    return [];
  }

  async countAdminUnreadSummary(): Promise<{
    totalUnread: number;
    awaitingReplyCount: number;
  }> {
    const awaiting = this.conversations.filter((c) => c.awaitingReply);
    return {
      totalUnread: awaiting.length,
      awaitingReplyCount: awaiting.length,
    };
  }

  async markAdminConversationAsRead(conversationId: string): Promise<void> {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.adminLastReadAt = new Date().toISOString();
      conv.unreadCount = 0;
    }
  }

  async markCustomerConversationAsRead(conversationId: string): Promise<void> {
    const conv = this.conversations.find((c) => c.id === conversationId);
    if (conv) {
      conv.customerLastReadAt = new Date().toISOString();
    }
  }
}

/**
 * Real-time Gateway stub verifying live WebSocket presence tracking.
 */
class StubRealtimeGateway implements Partial<RealtimeGatewayPort> {
  private onlineUsers = new Set<string>();

  setUserOnline(userId: string, isOnline: boolean) {
    if (isOnline) {
      this.onlineUsers.add(userId);
    } else {
      this.onlineUsers.delete(userId);
    }
  }

  isUserOnline(userId: string): boolean {
    return this.onlineUsers.has(userId);
  }

  getConnectedUserCount(): number {
    return this.onlineUsers.size;
  }

  async emitToUser(): Promise<boolean> {
    return true;
  }

  async emitToRoom(): Promise<boolean> {
    return true;
  }
}

describe('ChatService - WhatsApp-Model Domain & Security Architecture', () => {
  let chatRepo: InMemoryChatRepository;
  let realtimeGateway: StubRealtimeGateway;
  let service: ChatService;

  const PATIENT_A_ID = 'patient-uuid-001';
  const PATIENT_B_ID = 'patient-uuid-002';
  const GUEST_A_ID = 'guest-uuid-001';

  beforeEach(() => {
    chatRepo = new InMemoryChatRepository();
    realtimeGateway = new StubRealtimeGateway();
    service = new ChatService(chatRepo, realtimeGateway as unknown as RealtimeGatewayPort);
  });

  describe('1. Security Boundary & Anti-IDOR Verification', () => {
    it('strictly forbids Patient B from reading messages belonging to Patient A', async () => {
      const convA = await chatRepo.createConversation({ userId: PATIENT_A_ID });

      const attempt = service.getConversationMessages(
        convA.id,
        {},
        { userId: PATIENT_B_ID, audience: CHAT_SENDER_ROLE.EXTERNAL },
      );

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('permits Patient A to read their own conversation messages', async () => {
      const convA = await chatRepo.createConversation({ userId: PATIENT_A_ID });
      await chatRepo.createMessage({
        conversationId: convA.id,
        senderRole: CHAT_SENDER_ROLE.EXTERNAL,
        senderUserId: PATIENT_A_ID,
        clientMessageId: 'client-1',
        body: 'Halo dokter',
      });

      const result = await service.getConversationMessages(
        convA.id,
        {},
        { userId: PATIENT_A_ID, audience: CHAT_SENDER_ROLE.EXTERNAL },
      );

      expect(result.items.length).toBe(1);
      expect(result.items[0].body).toBe('Halo dokter');
    });

    it('strictly forbids Patient B from sending a message into Patient A conversation thread', async () => {
      const convA = await chatRepo.createConversation({ userId: PATIENT_A_ID });

      const attempt = service.sendCustomerMessage(
        convA.id,
        'Pesan penyusup',
        'spoof-1',
        { userId: PATIENT_B_ID, userName: 'Patient B' },
      );

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      expect(chatRepo.messages.length).toBe(0);
    });

    it('permits internal clinical staff or admin to access any patient conversation without IDOR restriction', async () => {
      const convA = await chatRepo.createConversation({ userId: PATIENT_A_ID });

      const result = await service.getConversationMessages(
        convA.id,
        {},
        { userId: 'admin-uuid-001', audience: CHAT_SENDER_ROLE.INTERNAL },
      );

      expect(result).toBeDefined();
      expect(result.items).toEqual([]);
    });
  });

  describe('2. Message Integrity & Boundary Invariants', () => {
    it('rejects empty or whitespace-only messages with BadRequestException', async () => {
      const conv = await chatRepo.createConversation({ userId: PATIENT_A_ID });

      await expect(
        service.sendCustomerMessage(conv.id, '   ', 'msg-blank', { userId: PATIENT_A_ID }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.sendAdminMessage(conv.id, 'admin-1', 'Admin Klinik', '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects message exceeding 4000 character maximum limit', async () => {
      const conv = await chatRepo.createConversation({ userId: PATIENT_A_ID });
      const oversizedBody = 'a'.repeat(4001);

      await expect(
        service.sendCustomerMessage(conv.id, oversizedBody, 'msg-oversized', {
          userId: PATIENT_A_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('3. Real-Time Presence & Anti-Fake-Online Verification', () => {
    it('decorates user as isOnline: true only when actively connected via WebSocket gateway', async () => {
      await chatRepo.createConversation({ userId: PATIENT_A_ID });
      await chatRepo.createConversation({ userId: PATIENT_B_ID });

      // Simulate: Patient A opens web and connects socket; Patient B is offline
      realtimeGateway.setUserOnline(PATIENT_A_ID, true);
      realtimeGateway.setUserOnline(PATIENT_B_ID, false);

      const response = await service.getAdminConversations({});
      const convA = response.items.find((c) => c.userId === PATIENT_A_ID);
      const convB = response.items.find((c) => c.userId === PATIENT_B_ID);

      expect(convA?.isOnline).toBe(true);
      expect(convB?.isOnline).toBe(false);
    });

    it('guarantees guests without user accounts are flagged as isOnline: false', async () => {
      await chatRepo.createConversation({
        guestId: GUEST_A_ID,
        guestName: 'Tamu Budi',
        guestEmail: 'tamu@example.com',
      });

      const response = await service.getAdminConversations({});
      const guestConv = response.items.find((c) => c.guestId === GUEST_A_ID);

      expect(guestConv?.isOnline).toBe(false);
    });
  });

  describe('4. WhatsApp Single Continuous Room Invariant', () => {
    it('idempotently returns existing conversation room rather than creating duplicate threads', async () => {
      const first = await service.createAdminConversation(PATIENT_A_ID);
      const second = await service.createAdminConversation(PATIENT_A_ID);

      expect(first.id).toBe(second.id);
      expect(chatRepo.conversations.length).toBe(1);
    });

    it('permits continuous message streaming back and forth without artificial locking states', async () => {
      const conv = await service.createAdminConversation(PATIENT_A_ID);

      // 1. Patient sends message
      const m1 = await service.sendCustomerMessage(conv.id, 'Keluhan saya demam', 'c-1', {
        userId: PATIENT_A_ID,
      });
      expect(m1.body).toBe('Keluhan saya demam');

      // 2. Admin replies
      const m2 = await service.sendAdminMessage(
        conv.id,
        'staff-1',
        'Dokter Umum',
        'Baik, silakan minum paracetamol',
        'a-1',
      );
      expect(m2.body).toBe('Baik, silakan minum paracetamol');

      // 3. Patient can immediately reply again anytime (continuous stream, no closed blocking)
      const m3 = await service.sendCustomerMessage(conv.id, 'Terima kasih dokter', 'c-2', {
        userId: PATIENT_A_ID,
      });
      expect(m3.body).toBe('Terima kasih dokter');

      expect(chatRepo.messages.length).toBe(3);
    });
  });

  describe('5. WhatsApp Read Receipts & Immediate Badge Dismissal Invariant', () => {
    it('marks conversation as read immediately when admin retrieves messages', async () => {
      const conv = await service.createAdminConversation(PATIENT_A_ID);
      await service.sendCustomerMessage(conv.id, 'Halo admin', 'c-read-1', {
        userId: PATIENT_A_ID,
      });

      expect(conv.adminLastReadAt).toBeUndefined();

      // Admin opens the conversation to read messages
      await service.getConversationMessages(
        conv.id,
        {},
        { audience: CHAT_SENDER_ROLE.INTERNAL },
      );

      const target = chatRepo.conversations.find((c) => c.id === conv.id);
      expect(target?.adminLastReadAt).toBeDefined();
    });

    it('explicitly marks conversation as read via markAdminConversationAsRead', async () => {
      const conv = await service.createAdminConversation(PATIENT_A_ID);
      const res = await service.markAdminConversationAsRead(conv.id);

      expect(res.success).toBe(true);
      const target = chatRepo.conversations.find((c) => c.id === conv.id);
      expect(target?.adminLastReadAt).toBeDefined();
    });
  });
});
