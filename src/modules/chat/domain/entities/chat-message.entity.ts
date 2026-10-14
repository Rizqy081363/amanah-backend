export type ChatSenderRole = 'customer' | 'admin';

export class ChatMessageEntity {
  id!: string;
  conversationId!: string;
  senderRole!: ChatSenderRole;
  senderUserId?: string | null;
  senderName!: string;
  clientMessageId!: string;
  body!: string;
  createdAt!: string;
  updatedAt?: string;

  constructor(partial?: Partial<ChatMessageEntity>) {
    if (partial) {
      Object.assign(this, partial);
    }
  }
}
