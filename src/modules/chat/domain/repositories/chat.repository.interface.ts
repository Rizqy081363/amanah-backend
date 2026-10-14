import { ChatMessageEntity } from '../entities/chat-message.entity';
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
  senderRole: 'customer' | 'admin';
  senderUserId?: string | null;
  clientMessageId: string;
  body: string;
  authorSnapshot?: string;
}

export interface ChatRepositoryInterface {
  findOpenConversationByUserId(
    userId: string,
  ): Promise<ConversationEntity | null>;
  findOpenConversationByGuestId(
    guestId: string,
  ): Promise<ConversationEntity | null>;
  findConversationById(id: string): Promise<ConversationEntity | null>;
  createConversation(
    params: CreateConversationParams,
  ): Promise<ConversationEntity>;
  closeConversation(id: string): Promise<ConversationEntity>;
  findAdminConversations(
    params: AdminConversationQueryParams,
  ): Promise<PaginatedResult<ConversationEntity>>;
  findMessagesByConversationId(
    conversationId: string,
    params: MessageQueryParams,
  ): Promise<PaginatedResult<ChatMessageEntity>>;
  createMessage(params: CreateChatMessageParams): Promise<ChatMessageEntity>;
}
