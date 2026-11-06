import { ChatMessageEntity } from '../entities/chat-message.entity';
import type { ChatSenderRole } from '../constants/chat-lifecycle.constants';
import {
  ConversationEntity,
  ConversationStatus,
} from '../entities/conversation.entity';

export const CHAT_REPOSITORY = Symbol('CHAT_REPOSITORY');

export interface CreateConversationParams {
  userId?: string | null;
  guestId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  patientId?: string | null;
}

export interface AdminConversationQueryParams {
  status?: ConversationStatus;
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

export interface ChatRepositoryInterface {
  findOpenConversationByUserId(
    userId: string,
  ): Promise<ConversationEntity | null>;
  findOpenConversationByGuestId(
    guestId: string,
  ): Promise<ConversationEntity | null>;
  findOpenConversationByGuestEmail(
    email: string,
  ): Promise<ConversationEntity | null>;
  findConversationById(id: string): Promise<ConversationEntity | null>;
  createConversation(
    params: CreateConversationParams,
  ): Promise<ConversationEntity>;
  closeConversation(id: string): Promise<ConversationEntity>;
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
}
