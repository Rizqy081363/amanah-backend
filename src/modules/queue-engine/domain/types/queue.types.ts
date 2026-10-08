export type QueueTicketStatus =
  | 'waiting'
  | 'called'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'expired';

export interface DomainQueueTicket {
  id: string;
  categoryId: string;
  sessionId: string;
  serviceDate: string; // YYYY-MM-DD
  queueNumber: string;
  patientId: string;
  roomId?: string | null;
  doctorId?: string | null;
  status: QueueTicketStatus;
  waitingPosition?: number | null;
  projectedStart?: Date | null;
  projectedEnd?: Date | null;
  calledAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  carriedOver: boolean;
  movedTo?: string | null;
  source: string;
}

export interface PatientTicketView {
  ticketCode: string;
  serviceCategoryName: string;
  serviceDate: string;
  sessionLabel: string;
  status: QueueTicketStatus;
  statusLabel: string;
  aheadCount: number;
  etaWindowDisplay: string;
  roomName: string | null; // NULL if status === 'waiting'
  doctorName: string | null; // NULL if status === 'waiting'
}

export interface StaffTicketView extends DomainQueueTicket {
  patientName: string;
  patientNik?: string | null;
  roomName?: string | null;
  doctorName?: string | null;
}
