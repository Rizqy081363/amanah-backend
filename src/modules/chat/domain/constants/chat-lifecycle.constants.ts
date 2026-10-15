export const CHAT_EVENTS = {
  MESSAGE_CREATED: 'chat.message.created.v1',
  CONVERSATION_CLOSED: 'chat.conversation.closed.v1',
} as const;

export type ChatEventType =
  (typeof CHAT_EVENTS)[keyof typeof CHAT_EVENTS];
