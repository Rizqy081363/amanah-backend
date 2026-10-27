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

export const QUEUE_OUTBOX_KINDS = {
  TICKET_CREATED: 'queue.ticket.created',
  TICKET_CALLED: 'queue.ticket.called',
  TICKET_RESCHEDULED: 'queue.ticket.rescheduled',
  TICKET_CANCELLED: 'queue.ticket.cancelled',
} as const;

export const QUEUE_TICKET_SOURCE = {
  ONLINE: 'online',
  WALK_IN: 'walk_in',
} as const;

export const QUEUE_PRIORITY = {
  REGULAR: 'regular',
  PRIORITY: 'priority',
  EMERGENCY: 'emergency',
} as const;

export const PATIENT_QUEUE_STATUS_LABELS: Record<
  QueueTicketStatusType,
  string
> = {
  [QUEUE_TICKET_STATUS.WAITING]: 'Menunggu Antrean',
  [QUEUE_TICKET_STATUS.CALLED]: 'Dipanggil ke Ruangan',
  [QUEUE_TICKET_STATUS.IN_SERVICE]: 'Sedang Dilayani',
  [QUEUE_TICKET_STATUS.COMPLETED]: 'Selesai',
  [QUEUE_TICKET_STATUS.CANCELLED]: 'Dibatalkan',
  [QUEUE_TICKET_STATUS.NO_SHOW]: 'Tidak Hadir',
  [QUEUE_TICKET_STATUS.EXPIRED]: 'Kedaluwarsa',
};

export const QUEUE_ENGINE_REPOSITORY = 'QUEUE_ENGINE_REPOSITORY';

export { OutboxStatus };
