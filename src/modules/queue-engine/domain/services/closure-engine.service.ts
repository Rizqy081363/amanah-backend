import { TimeInterval } from '../types/calendar.types';
import { DomainQueueTicket } from '../types/queue.types';
import { CalendarService } from './calendar.service';

export interface ClosureImpactEvaluation {
  inServiceUntouched: DomainQueueTicket[];
  waitingFitting: DomainQueueTicket[];
  waitingToMove: DomainQueueTicket[];
  totalAffected: number;
}

export class ClosureEngineService {
  constructor(private readonly calendarService: CalendarService) {}

  /**
   * Evaluates impact of a closure on existing active tickets
   */
  evaluateClosureImpact(params: {
    closure: {
      startsAt: Date;
      endsAt: Date;
      categoryId?: string | null;
      doctorId?: string | null;
      roomId?: string | null;
    };
    tickets: DomainQueueTicket[];
    effectiveSegmentsAfterClosure: TimeInterval[];
  }): ClosureImpactEvaluation {
    const { closure, tickets, effectiveSegmentsAfterClosure } = params;

    const inServiceUntouched: DomainQueueTicket[] = [];
    const waitingFitting: DomainQueueTicket[] = [];
    const waitingToMove: DomainQueueTicket[] = [];

    const closureStartMs = closure.startsAt.getTime();
    const closureEndMs = closure.endsAt.getTime();

    for (const ticket of tickets) {
      // 1. In-service tickets are NEVER interrupted (Rule 3.2 in penutupan-hari-sesi-jam.md)
      if (ticket.status === 'in_service') {
        inServiceUntouched.push(ticket);
        continue;
      }

      if (ticket.status === 'waiting' || ticket.status === 'called') {
        const ticketStartMs = ticket.projectedStart
          ? ticket.projectedStart.getTime()
          : closureStartMs;
        const ticketEndMs = ticket.projectedEnd
          ? ticket.projectedEnd.getTime()
          : ticketStartMs + 30 * 60_000;

        // Check if ticket overlaps with closure interval
        const overlaps =
          ticketStartMs < closureEndMs && ticketEndMs > closureStartMs;

        if (!overlaps) {
          waitingFitting.push(ticket);
          continue;
        }

        // If it overlaps, check if it can still fit in any remaining open segment
        const fitsInRemaining = effectiveSegmentsAfterClosure.some(
          (seg) =>
            ticketStartMs >= seg.start.getTime() &&
            ticketEndMs <= seg.end.getTime(),
        );

        if (fitsInRemaining) {
          waitingFitting.push(ticket);
        } else {
          waitingToMove.push(ticket);
        }
      }
    }

    return {
      inServiceUntouched,
      waitingFitting,
      waitingToMove,
      totalAffected: waitingToMove.length,
    };
  }
}
