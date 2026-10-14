import {
  PATIENT_QUEUE_STATUS_LABELS,
  QUEUE_TICKET_STATUS,
} from '../constants/queue-engine.constants';
import {
  DomainQueueTicket,
  PatientTicketView,
  QueueTicketStatus,
} from '../types/queue.types';

export class QueueEngineService {
  /**
   * Format monotonic ticket number with category prefix and 3-digit sequence
   */
  formatTicketNumber(prefix: string, seq: number): string {
    const cleanPrefix = (prefix || 'Q').trim().toUpperCase();
    return `${cleanPrefix}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * Transitions ticket from waiting to called
   */
  callTicket(params: {
    ticket: DomainQueueTicket;
    roomId: string;
    doctorId: string;
    calledAt?: Date;
  }): DomainQueueTicket {
    const { ticket, roomId, doctorId, calledAt } = params;

    if (ticket.status !== QUEUE_TICKET_STATUS.WAITING) {
      throw new Error(
        `Cannot call ticket ${ticket.id}: invalid status '${ticket.status}'. Only '${QUEUE_TICKET_STATUS.WAITING}' tickets can be called.`,
      );
    }

    if (!roomId) throw new Error('Cannot call ticket without assigned roomId.');
    if (!doctorId)
      throw new Error('Cannot call ticket without assigned doctorId.');

    return {
      ...ticket,
      status: QUEUE_TICKET_STATUS.CALLED,
      roomId,
      doctorId,
      calledAt: calledAt ?? new Date(),
    };
  }

  /**
   * Transitions ticket from called to in_service
   */
  startService(params: {
    ticket: DomainQueueTicket;
    startedAt?: Date;
  }): DomainQueueTicket {
    const { ticket, startedAt } = params;

    if (
      ticket.status !== QUEUE_TICKET_STATUS.CALLED &&
      ticket.status !== QUEUE_TICKET_STATUS.WAITING
    ) {
      throw new Error(
        `Cannot start service for ticket ${ticket.id}: status is '${ticket.status}'.`,
      );
    }

    return {
      ...ticket,
      status: QUEUE_TICKET_STATUS.IN_SERVICE,
      startedAt: startedAt ?? new Date(),
    };
  }

  /**
   * Transitions ticket from in_service to completed
   */
  completeService(params: {
    ticket: DomainQueueTicket;
    completedAt?: Date;
  }): DomainQueueTicket {
    const { ticket, completedAt } = params;

    if (ticket.status !== QUEUE_TICKET_STATUS.IN_SERVICE) {
      throw new Error(
        `Cannot complete ticket ${ticket.id}: status is '${ticket.status}'. Ticket must be '${QUEUE_TICKET_STATUS.IN_SERVICE}'.`,
      );
    }

    return {
      ...ticket,
      status: QUEUE_TICKET_STATUS.COMPLETED,
      completedAt: completedAt ?? new Date(),
    };
  }

  /**
   * Cancels ticket
   */
  cancelTicket(params: { ticket: DomainQueueTicket }): DomainQueueTicket {
    const { ticket } = params;

    if (
      ticket.status === QUEUE_TICKET_STATUS.COMPLETED ||
      ticket.status === QUEUE_TICKET_STATUS.IN_SERVICE ||
      ticket.status === QUEUE_TICKET_STATUS.CANCELLED
    ) {
      throw new Error(
        `Cannot cancel ticket ${ticket.id}: status is '${ticket.status}'.`,
      );
    }

    return {
      ...ticket,
      status: QUEUE_TICKET_STATUS.CANCELLED,
    };
  }

  /**
   * Converts status to Indonesian patient label
   */
  getPatientStatusLabel(status: QueueTicketStatus): string {
    return PATIENT_QUEUE_STATUS_LABELS[status] || status;
  }

  /**
   * Segregated patient view (Enforces Rule P7: Room & Doctor hidden until called)
   */
  buildPatientView(params: {
    ticket: DomainQueueTicket;
    categoryName: string;
    sessionLabel: string;
    aheadCount: number;
    etaRange: string;
    resolvedRoomName?: string | null;
    resolvedDoctorName?: string | null;
  }): PatientTicketView {
    const {
      ticket,
      categoryName,
      sessionLabel,
      aheadCount,
      etaRange,
      resolvedRoomName,
      resolvedDoctorName,
    } = params;

    // RULE P7 & Section 2: Room and Doctor are NEVER visible while waiting
    const isCalledOrActive =
      ticket.status === QUEUE_TICKET_STATUS.CALLED ||
      ticket.status === QUEUE_TICKET_STATUS.IN_SERVICE ||
      ticket.status === QUEUE_TICKET_STATUS.COMPLETED;

    return {
      ticketCode: ticket.queueNumber,
      serviceCategoryName: categoryName,
      serviceDate: ticket.serviceDate,
      sessionLabel,
      status: ticket.status,
      statusLabel: this.getPatientStatusLabel(ticket.status),
      aheadCount: Math.max(0, aheadCount),
      etaWindowDisplay: etaRange,
      roomName: isCalledOrActive ? (resolvedRoomName ?? null) : null,
      doctorName: isCalledOrActive ? (resolvedDoctorName ?? null) : null,
    };
  }
}
