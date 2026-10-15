import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  conversations,
  messages,
  patientProfiles,
} from '../../../../database/schema';
import { ChatMessageEntity } from '../../domain/entities/chat-message.entity';
import { ConversationEntity } from '../../domain/entities/conversation.entity';
import {
  AdminConversationQueryParams,
  ChatRepositoryInterface,
  CreateChatMessageParams,
  CreateConversationParams,
  MessageQueryParams,
  PaginatedResult,
} from '../../domain/repositories/chat.repository.interface';

@Injectable()
export class ChatDrizzleRepository implements ChatRepositoryInterface {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  async findOpenConversationByUserId(
    userId: string,
  ): Promise<ConversationEntity | null> {
    const record = await this.db.query.conversations.findFirst({
      where: and(
        eq(conversations.userId, userId),
        eq(conversations.status, 'open'),
      ),
      with: {
        user: true,
        patientProfile: true,
        staffProfile: true,
      },
    });

    return record ? this.mapConversation(record) : null;
  }

  async findOpenConversationByGuestId(
    guestId: string,
  ): Promise<ConversationEntity | null> {
    const record = await this.db.query.conversations.findFirst({
      where: and(
        eq(conversations.guestId, guestId),
        eq(conversations.status, 'open'),
      ),
      with: {
        staffProfile: true,
      },
    });

    return record ? this.mapConversation(record) : null;
  }

  async findConversationById(id: string): Promise<ConversationEntity | null> {
    const record = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, id),
      with: {
        user: true,
        patientProfile: true,
        staffProfile: true,
      },
    });

    return record ? this.mapConversation(record) : null;
  }

  async createConversation(
    params: CreateConversationParams,
  ): Promise<ConversationEntity> {
    if (params.userId) {
      const existing = await this.findOpenConversationByUserId(params.userId);
      if (existing) {
        return existing;
      }

      let patientId = params.patientId;
      if (!patientId) {
        const patient = await this.db.query.patientProfiles.findFirst({
          where: eq(patientProfiles.userId, params.userId),
        });
        patientId = patient?.id;
      }

      const [inserted] = await this.db
        .insert(conversations)
        .values({
          status: 'open',
          userId: params.userId,
          patientId: patientId || null,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted) {
        return (await this.findConversationById(inserted.id))!;
      }

      const openFallback = await this.findOpenConversationByUserId(
        params.userId,
      );
      if (openFallback) return openFallback;
    }

    if (params.guestId) {
      const existing = await this.findOpenConversationByGuestId(params.guestId);
      if (existing) {
        return existing;
      }

      if (!params.guestEmail) {
        throw new Error('Guest email is required to create a guest conversation');
      }

      const [inserted] = await this.db
        .insert(conversations)
        .values({
          status: 'open',
          guestId: params.guestId,
          guestName: params.guestName || 'Tamu',
          guestEmail: params.guestEmail,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted) {
        return (await this.findConversationById(inserted.id))!;
      }

      const openFallback = await this.findOpenConversationByGuestId(
        params.guestId,
      );
      if (openFallback) return openFallback;
    }

    throw new Error(
      'Either userId or guestId must be provided to create a conversation',
    );
  }

  async closeConversation(id: string): Promise<ConversationEntity> {
    const nowIso = new Date().toISOString();
    await this.db
      .update(conversations)
      .set({
        status: 'closed',
        closedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(conversations.id, id));

    const updated = await this.findConversationById(id);
    if (!updated) {
      throw new Error(`Conversation ${id} not found`);
    }
    return updated;
  }

  async findAdminConversations(
    params: AdminConversationQueryParams,
  ): Promise<PaginatedResult<ConversationEntity>> {
    const limit = Math.min(Math.max(params.limit || 20, 1), 100);
    const conditions = [];

    if (params.status) {
      conditions.push(eq(conversations.status, params.status));
    }

    if (params.awaitingReply !== undefined) {
      conditions.push(eq(conversations.awaitingReply, params.awaitingReply));
    }

    if (params.cursor) {
      conditions.push(lt(conversations.lastMessageAt, params.cursor));
    }

    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(conversations.guestName, term),
          ilike(conversations.guestEmail, term),
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const records = await this.db.query.conversations.findMany({
      where: whereClause,
      orderBy: [desc(conversations.lastMessageAt), desc(conversations.id)],
      limit: limit + 1,
      with: {
        user: true,
        patientProfile: true,
        staffProfile: true,
      },
    });

    const hasMore = records.length > limit;
    const pageRecords = hasMore ? records.slice(0, limit) : records;
    const nextCursor =
      hasMore && pageRecords.length > 0
        ? pageRecords[pageRecords.length - 1].lastMessageAt
        : null;

    // Fetch last message preview for each conversation
    const conversationIds = pageRecords.map((r) => r.id);
    const previews = new Map<string, string>();

    if (conversationIds.length > 0) {
      for (const convId of conversationIds) {
        const lastMsg = await this.db.query.messages.findFirst({
          where: eq(messages.conversationId, convId),
          orderBy: [desc(messages.createdAt)],
          columns: {
            body: true,
          },
        });
        if (lastMsg) {
          previews.set(convId, lastMsg.body);
        }
      }
    }

    const items = pageRecords.map((r) =>
      this.mapConversation(r, previews.get(r.id)),
    );

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async findMessagesByConversationId(
    conversationId: string,
    params: MessageQueryParams,
  ): Promise<PaginatedResult<ChatMessageEntity>> {
    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    const conditions = [eq(messages.conversationId, conversationId)];

    if (params.cursor) {
      conditions.push(lt(messages.createdAt, params.cursor));
    }

    const records = await this.db.query.messages.findMany({
      where: and(...conditions),
      orderBy: [desc(messages.createdAt)],
      limit: limit + 1,
      with: {
        user: true,
      },
    });

    const hasMore = records.length > limit;
    const pageRecords = hasMore ? records.slice(0, limit) : records;
    const nextCursor =
      hasMore && pageRecords.length > 0
        ? pageRecords[pageRecords.length - 1].createdAt
        : null;

    // Return chronological order (oldest to newest) for chat display
    const items = pageRecords.map((r) => this.mapMessage(r)).reverse();

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async createMessage(
    params: CreateChatMessageParams,
  ): Promise<ChatMessageEntity> {
    const [inserted] = await this.db
      .insert(messages)
      .values({
        conversationId: params.conversationId,
        senderRole: params.senderRole,
        senderUserId: params.senderUserId || null,
        clientMessageId: params.clientMessageId,
        body: params.body,
        authorSnapshot: params.authorSnapshot || '',
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return this.mapMessage(inserted, params.authorSnapshot);
    }

    // Idempotent retry: return existing message with same (conversationId, clientMessageId)
    const existing = await this.db.query.messages.findFirst({
      where: and(
        eq(messages.conversationId, params.conversationId),
        eq(messages.clientMessageId, params.clientMessageId),
      ),
      with: {
        user: true,
      },
    });

    if (existing) {
      return this.mapMessage(existing);
    }

    throw new Error('Failed to create or retrieve chat message');
  }

  private mapConversation(
    record: any,
    lastMessagePreview?: string | null,
  ): ConversationEntity {
    const isGuest = !record.userId && !!record.guestId;
    const customerName = isGuest
      ? record.guestName || 'Tamu'
      : record.patientProfile?.fullName || record.user?.name || 'Pasien';
    const customerEmail = isGuest
      ? record.guestEmail || ''
      : record.user?.email || '';
    const customerPhone = isGuest ? null : record.patientProfile?.phone || null;
    const medicalRecordNumber = isGuest
      ? null
      : record.patientProfile?.medicalRecordNumber || null;

    return new ConversationEntity({
      id: record.id,
      status: record.status,
      userId: record.userId,
      patientId: record.patientId,
      guestId: record.guestId,
      guestName: record.guestName,
      guestEmail: record.guestEmail,
      customerName,
      customerEmail,
      customerPhone,
      medicalRecordNumber,
      assignedPractitionerId: record.assignedPractitionerId,
      assignedStaffId: record.assignedStaffId,
      lastMessageAt: record.lastMessageAt,
      lastCustomerMessageAt: record.lastCustomerMessageAt,
      lastAdminMessageAt: record.lastAdminMessageAt,
      firstAdminReplyAt: record.firstAdminReplyAt,
      awaitingReply: Boolean(record.awaitingReply),
      createdAt: record.createdAt,
      closedAt: record.closedAt,
      updatedAt: record.updatedAt,
      lastMessagePreview: lastMessagePreview ?? null,
    });
  }

  private mapMessage(record: any, fallbackName?: string): ChatMessageEntity {
    let senderName = record.authorSnapshot || fallbackName || '';
    if (!senderName) {
      if (record.senderRole === 'admin') {
        senderName = record.user?.name || 'Admin Klinik';
      } else {
        senderName = record.user?.name || 'Pasien';
      }
    }

    return new ChatMessageEntity({
      id: record.id,
      conversationId: record.conversationId,
      senderRole: record.senderRole,
      senderUserId: record.senderUserId,
      senderName,
      clientMessageId: record.clientMessageId,
      body: record.body,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
