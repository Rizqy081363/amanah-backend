import { OutboxStatus } from '../../../../common/outbox/outbox.constants';

export const QUEUE_TICKET_STATUS = {
  WAITING: 'waiting',
  CALLED: 'called',
  IN_SERVICE: 'in_service',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  EXPIRED: 'expired',
} as const;

export type QueueTicketStatusType =
  (typeof QUEUE_TICKET_STATUS)[keyof typeof QUEUE_TICKET_STATUS];

export const QUEUE_TICKET_EVENTS = {
  CREATED: 'ticket.created',
  CALLED: 'ticket.called',
  REQUEUED: 'ticket.requeued',
  IN_SERVICE: 'ticket.in_service',
  COMPLETED: 'ticket.completed',
  CANCELLED: 'ticket.cancelled',
  RESCHEDULED: 'ticket.rescheduled',
  NO_SHOW: 'ticket.no_show',
} as const;

export type QueueTicketEventType =
  (typeof QUEUE_TICKET_EVENTS)[keyof typeof QUEUE_TICKET_EVENTS];

export const QUEUE_OUTBOX_KINDS = {
  TICKET_CREATED: 'queue.ticket.created',
  TICKET_CALLED: 'queue.ticket.called',
  TICKET_RESCHEDULED: 'queue.ticket.rescheduled',
  TICKET_CANCELLED: 'queue.ticket.cancelled',
} as const;

export type QueueOutboxKindType =
  (typeof QUEUE_OUTBOX_KINDS)[keyof typeof QUEUE_OUTBOX_KINDS];

export const QUEUE_TICKET_SOURCE = {
  ONLINE: 'online',
  WALK_IN: 'walk_in',
} as const;

export type QueueTicketSourceType =
  (typeof QUEUE_TICKET_SOURCE)[keyof typeof QUEUE_TICKET_SOURCE];

export const QUEUE_PRIORITY = {
  REGULAR: 'regular',
  PRIORITY: 'priority',
  EMERGENCY: 'emergency',
} as const;

export type QueuePriorityType =
  (typeof QUEUE_PRIORITY)[keyof typeof QUEUE_PRIORITY];

export const QUEUE_CONFIG_KEYS = {
  PRIOR_MINUTES: 'duration.prior_minutes',
  PRIOR_WEIGHT: 'duration.prior_weight',
  VALID_MIN_MINUTES: 'duration.valid_min_minutes',
  VALID_MAX_MINUTES: 'duration.valid_max_minutes',
} as const;

export const PATIENT_QUEUE_STATUS_LABELS: Record<QueueTicketStatusType, string> = {
  [QUEUE_TICKET_STATUS.WAITING]: 'Menunggu Antrean',
  [QUEUE_TICKET_STATUS.CALLED]: 'Dipanggil ke Ruangan',
  [QUEUE_TICKET_STATUS.IN_SERVICE]: 'Sedang Dilayani',
  [QUEUE_TICKET_STATUS.COMPLETED]: 'Selesai',
  [QUEUE_TICKET_STATUS.CANCELLED]: 'Dibatalkan',
  [QUEUE_TICKET_STATUS.NO_SHOW]: 'Tidak Hadir',
  [QUEUE_TICKET_STATUS.EXPIRED]: 'Kedaluwarsa',
};

export { OutboxStatus };
