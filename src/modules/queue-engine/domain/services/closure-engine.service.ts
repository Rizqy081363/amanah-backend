import { Injectable, Optional } from '@nestjs/common';
import { ClinicSettingService } from '../../infrastructure/config/clinic-setting.service';
import { QUEUE_TICKET_STATUS } from '../constants/queue-engine.constants';
import { TimeInterval } from '../types/calendar.types';
import { DomainQueueTicket } from '../types/queue.types';
import { CalendarService } from './calendar.service';
import { ScopeQuery } from './clinic-setting.reader';

interface TicketShiftPlan {
  ticket: DomainQueueTicket;
  newProjectedStart: Date;
  newProjectedEnd: Date;
}

export interface ClosureImpactEvaluation {
  unaffected: DomainQueueTicket[];
  shifted: TicketShiftPlan[];
  moved: DomainQueueTicket[];
  needsDecision: DomainQueueTicket[];
  inServiceProtected: DomainQueueTicket[];
  totalAffected: number;
}

@Injectable()
export class ClosureEngineService {
  constructor(
    private readonly calendarService: CalendarService,
    @Optional() private readonly settingReader?: ClinicSettingService,
  ) {}

  /**
   * Retrieves default consultation duration dynamically from PostgreSQL clinic_setting (duration.prior_minutes)
   */
  async getDefaultDurationMinutes(scope?: ScopeQuery): Promise<number> {
    if (this.settingReader) {
      try {
        return await this.settingReader.getNumber(
          'duration.prior_minutes',
          scope,
        );
      } catch {
        // Fallback
      }
    }
    return 30;
  }

  /**
   * Retrieves default last call buffer dynamically from PostgreSQL clinic_setting (closure.last_call_buffer_minutes)
   */
  async getDefaultLastCallBufferMinutes(scope?: ScopeQuery): Promise<number> {
    if (this.settingReader) {
      try {
        return await this.settingReader.getNumber(
          'closure.last_call_buffer_minutes',
          scope,
        );
      } catch {
        // Fallback
      }
    }
    return 0;
  }

  /**
   * Retrieves default search horizon days dynamically from PostgreSQL clinic_setting (queue.search_horizon_days)
   */
  async getSearchHorizonDays(scope?: ScopeQuery): Promise<number> {
    if (this.settingReader) {
      try {
        return await this.settingReader.getNumber(
          'queue.search_horizon_days',
          scope,
        );
      } catch {
        // Fallback
      }
    }
    return 14;
  }

  /**
   * Evaluates impact of a closure on existing active tickets
   * adhering strictly to Rules R9 to R20 in penutupan-hari-sesi-jam.md
   */
  async evaluateClosureImpact(params: {
    closure: {
      startsAt: Date;
      endsAt: Date;
      categoryId?: string | null;
      doctorId?: string | null;
      roomId?: string | null;
      lastCallBufferMin?: number;
    };
    tickets: DomainQueueTicket[];
    effectiveSegmentsAfterClosure: TimeInterval[];
    defaultDurationMinutes?: number;
  }): Promise<ClosureImpactEvaluation> {
    const {
      closure,
      tickets,
      effectiveSegmentsAfterClosure,
      defaultDurationMinutes,
    } = params;

    const durationMin =
      defaultDurationMinutes ??
      (await this.getDefaultDurationMinutes({
        categoryId: closure.categoryId || undefined,
        doctorId: closure.doctorId || undefined,
      }));

    const bufferMin =
      closure.lastCallBufferMin ??
      (await this.getDefaultLastCallBufferMinutes({
        categoryId: closure.categoryId || undefined,
        doctorId: closure.doctorId || undefined,
      }));

    const unaffected: DomainQueueTicket[] = [];
    const shifted: TicketShiftPlan[] = [];
    const moved: DomainQueueTicket[] = [];
    const needsDecision: DomainQueueTicket[] = [];
    const inServiceProtected: DomainQueueTicket[] = [];

    const closureStartMs = closure.startsAt.getTime();
    const closureEndMs = closure.endsAt.getTime();
    const bufferMs = bufferMin * 60_000;
    const durationMs = durationMin * 60_000;

    // Sort tickets deterministically according to Rule R16:
    // priority DESC, carriedOver DESC, queueNumber ASC
    const sortedTickets = [...tickets].sort((a, b) => {
      const aPrio = a.priority === 'urgent' || a.priority === true ? 1 : 0;
      const bPrio = b.priority === 'urgent' || b.priority === true ? 1 : 0;
      if (aPrio !== bPrio) return bPrio - aPrio;
      if (a.carriedOver !== b.carriedOver) return a.carriedOver ? -1 : 1;
      return a.queueNumber.localeCompare(b.queueNumber, undefined, {
        numeric: true,
      });
    });

    for (const ticket of sortedTickets) {
      // 1. In-service and called tickets are NEVER cut or moved (Rule R9)
      if (
        ticket.status === QUEUE_TICKET_STATUS.IN_SERVICE ||
        ticket.status === QUEUE_TICKET_STATUS.CALLED
      ) {
        inServiceProtected.push(ticket);
        continue;
      }

      if (ticket.status !== QUEUE_TICKET_STATUS.WAITING) {
        continue;
      }

      const originalStart = ticket.projectedStart
        ? ticket.projectedStart.getTime()
        : closureStartMs;
      const originalEnd = ticket.projectedEnd
        ? ticket.projectedEnd.getTime()
        : originalStart + durationMs;

      // Check if original ticket overlaps closure interval [closureStartMs, closureEndMs)
      const overlapsClosure =
        originalStart < closureEndMs && originalEnd > closureStartMs;

      let fits = false;
      let shiftedStart: Date | null = null;
      let shiftedEnd: Date | null = null;

      for (const seg of effectiveSegmentsAfterClosure) {
        const segStartMs = seg.start.getTime();
        const segEndMs = seg.end.getTime();

        // If the ticket was originally within this segment and doesn't overlap closure:
        if (
          !overlapsClosure &&
          originalStart >= segStartMs &&
          originalEnd <= segEndMs
        ) {
          fits = true;
          break;
        }

        // Try fitting in open segment with shift
        const candidateStartMs = Math.max(originalStart, segStartMs);
        const candidateEndMs = candidateStartMs + durationMs;
        const maxAllowedStartMs = segEndMs - bufferMs;

        if (
          candidateStartMs <= maxAllowedStartMs &&
          candidateEndMs <= segEndMs
        ) {
          fits = true;
          if (
            candidateStartMs !== originalStart ||
            candidateEndMs !== originalEnd
          ) {
            shiftedStart = new Date(candidateStartMs);
            shiftedEnd = new Date(candidateEndMs);
          }
          break;
        }
      }

      if (fits) {
        if (shiftedStart && shiftedEnd) {
          shifted.push({
            ticket,
            newProjectedStart: shiftedStart,
            newProjectedEnd: shiftedEnd,
          });
        } else {
          unaffected.push(ticket);
        }
      } else {
        // Ticket does not fit in remaining open segments (Rule R14 & R15)
        const isAlreadyCheckedIn = Boolean(
          ticket.checkedInAt || ticket.calledAt || ticket.startedAt,
        );
        if (isAlreadyCheckedIn) {
          needsDecision.push(ticket);
        } else {
          moved.push(ticket);
        }
      }
    }

    return {
      unaffected,
      shifted,
      moved,
      needsDecision,
      inServiceProtected,
      totalAffected: shifted.length + moved.length + needsDecision.length,
    };
  }

  /**
   * Reconciles waiting tickets against active closures (Section 5.3 safety net).
   * Ensures no unserved waiting ticket remains within an active closed interval.
   * Idempotent operation: running repeatedly produces consistent state.
   */
  async reconcileClosureTickets(params: {
    tickets: DomainQueueTicket[];
    activeClosures: Array<{
      startsAt: Date;
      endsAt: Date;
      categoryId?: string | null;
      doctorId?: string | null;
      roomId?: string | null;
      lastCallBufferMin?: number;
    }>;
    effectiveSegments: TimeInterval[];
  }): Promise<ClosureImpactEvaluation> {
    const { tickets, activeClosures, effectiveSegments } = params;

    if (!activeClosures.length) {
      return {
        unaffected: tickets.filter(
          (t) => t.status === QUEUE_TICKET_STATUS.WAITING,
        ),
        shifted: [],
        moved: [],
        needsDecision: [],
        inServiceProtected: tickets.filter(
          (t) =>
            t.status === QUEUE_TICKET_STATUS.IN_SERVICE ||
            t.status === QUEUE_TICKET_STATUS.CALLED,
        ),
        totalAffected: 0,
      };
    }

    // Merge closures into an enclosing or representative period for evaluation
    const earliestStart = new Date(
      Math.min(...activeClosures.map((c) => c.startsAt.getTime())),
    );
    const latestEnd = new Date(
      Math.max(...activeClosures.map((c) => c.endsAt.getTime())),
    );

    return this.evaluateClosureImpact({
      closure: {
        startsAt: earliestStart,
        endsAt: latestEnd,
      },
      tickets,
      effectiveSegmentsAfterClosure: effectiveSegments,
    });
  }
}
