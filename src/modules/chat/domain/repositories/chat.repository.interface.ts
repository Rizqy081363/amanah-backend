import { ChatMessageEntity } from '../entities/chat-message.entity';
import type { ChatSenderRole } from '../constants/chat-lifecycle.constants';
import { ConversationEntity } from '../entities/conversation.entity';

export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

export interface CreateConversationParams {
  userId?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  patientId?: string | null;
}

export interface AdminConversationQueryParams {
  awaitingReply?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface MessageQueryParams {
  cursor?: string;
  limit?: number;
}

export interface CreateChatMessageParams {
  conversationId: string;
  senderRole: ChatSenderRole;
  senderUserId?: string | null;
  clientMessageId: string;
  body: string;
  authorSnapshot?: string;
}

export interface CustomerConversationQueryParams {
  userId?: string;
  guestId?: string;
  limit?: number;
}

export interface ChatCandidateUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  medicalRecordNumber: string | null;
  existingConversationId: string | null;
}

export interface ChatRepositoryInterface {
  findConversationByUserId(
    userId: string,
  ): Promise<ConversationEntity | null>;
  findConversationByGuestId(
    guestId: string,
  ): Promise<ConversationEntity | null>;
  findConversationByGuestEmail(
    email: string,
  ): Promise<ConversationEntity | null>;
  findConversationById(id: string): Promise<ConversationEntity | null>;
  createConversation(
    params: CreateConversationParams,
  ): Promise<ConversationEntity>;
  findAdminConversations(
    params: AdminConversationQueryParams,
  ): Promise<PaginatedResult<ConversationEntity>>;
  findCustomerConversations(
    params: CustomerConversationQueryParams,
  ): Promise<ConversationEntity[]>;
  findMessagesByConversationId(
    conversationId: string,
    params: MessageQueryParams,
  ): Promise<PaginatedResult<ChatMessageEntity>>;
  createMessage(params: CreateChatMessageParams): Promise<ChatMessageEntity>;
  findChatCandidates(
    search?: string,
    limit?: number,
    currentUserId?: string,
  ): Promise<ChatCandidateUser[]>;
  countAdminUnreadSummary(): Promise<{
    totalUnread: number;
    awaitingReplyCount: number;
  }>;
  markAdminConversationAsRead(conversationId: string): Promise<void>;
  markCustomerConversationAsRead(conversationId: string): Promise<void>;
}
