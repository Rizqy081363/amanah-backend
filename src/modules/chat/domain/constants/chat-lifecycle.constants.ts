export const CHAT_EVENTS = {
  MESSAGE_CREATED: 'chat.message.created.v1',
  CONVERSATION_CLOSED: 'chat.conversation.closed.v1',
} as const;

/**
 * Roles responsible for handling live chat & online consultations.
 * Excludes clinical practitioners (doctors & midwives) who operate on clinical queues.
 */
export const CHAT_SUPPORT_ROLE_CODES = [
  'admin',
  'staff_worker',
] as const;
