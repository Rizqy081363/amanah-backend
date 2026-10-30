export const CHAT_EVENTS = {
  MESSAGE_CREATED: 'chat.message.created.v1',
  CONVERSATION_CLOSED: 'chat.conversation.closed.v1',
} as const;

export const CHAT_SENDER_ROLE = {
  INTERNAL: 'internal',
  EXTERNAL: 'external',
} as const;

export type ChatSenderRole = (typeof CHAT_SENDER_ROLE)[keyof typeof CHAT_SENDER_ROLE];

