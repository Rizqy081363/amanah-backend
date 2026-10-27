import {
  LoadRatioThresholds,
  QueueLoadStatus,
  resolveQueueLoadStatus,
} from '../constants/queue-load.constants';
import { TimeInterval } from '../types/calendar.types';

export type LoadStatus = QueueLoadStatus;

interface TicketProjection {
  ticketId: string;
  projectedStart: Date;
  projectedEnd: Date;
  position: number;
  aheadCount: number;
}

export interface SimulationResult {
  projections: Map<string, TicketProjection>;
  nominalCapacity: number;
  loadStatus: LoadStatus;
  loadRatio: number;
}

export interface SimulationTicketItem {
  id: string;
  status?: string;
  actualStart?: Date | null;
  priority?: boolean | string;
  carriedOver?: boolean;
}

export class SimulatorService {
  /**
   * Calculates total nominal capacity = (lanes * minutes in segments) / avg_duration
   */
  calculateNominalCapacity(params: {
    lanes: number;
    effectiveSegments: TimeInterval[];
    estimatedDurationMinutes: number;
  }): number {
    const { lanes, effectiveSegments, estimatedDurationMinutes } = params;
    const effectiveLanes = Math.max(1, lanes);
    const duration = Math.max(5, estimatedDurationMinutes);

    let totalMinutes = 0;
    for (const seg of effectiveSegments) {
      const diffMs = seg.end.getTime() - seg.start.getTime();
      if (diffMs > 0) {
        totalMinutes += diffMs / 60_000;
      }
    }

    if (totalMinutes <= 0) return 0;
    return Math.max(1, Math.floor((effectiveLanes * totalMinutes) / duration));
  }

  /**
   * Resolves human-readable clinic load classification
   */
  resolveLoadStatus(
    ticketsCount: number,
    nominalCapacity: number,
    thresholds?: LoadRatioThresholds,
  ): LoadStatus {
    if (nominalCapacity <= 0) return resolveQueueLoadStatus(999, thresholds);
    const ratio = ticketsCount / nominalCapacity;
    return resolveQueueLoadStatus(ratio, thresholds);
  }

  /**
   * Simulates multi-lane queue progression and computes dynamic projected start and end times
   */
  simulateQueue(params: {
    lanes: number;
    effectiveSegments: TimeInterval[];
    tickets: SimulationTicketItem[];
    estimatedDurationMinutes: number;
    currentTime?: Date;
    minRemainingMinutes?: number;
  }): SimulationResult {
    const {
      lanes,
      effectiveSegments,
      tickets,
      estimatedDurationMinutes,
      currentTime,
      minRemainingMinutes = 5,
    } = params;
    const effectiveLanes = Math.max(1, lanes);
    const durationMs = Math.max(5, estimatedDurationMinutes) * 60_000;
    const minRemainingMs = Math.max(1, minRemainingMinutes) * 60_000;
    const nowMs = (currentTime ?? new Date()).getTime();

    const nominalCapacity = this.calculateNominalCapacity({
      lanes: effectiveLanes,
      effectiveSegments,
      estimatedDurationMinutes,
    });
    const loadStatus = this.resolveLoadStatus(tickets.length, nominalCapacity);
    const loadRatio =
      nominalCapacity > 0
        ? Number((tickets.length / nominalCapacity).toFixed(2))
        : 1.0;

    const projections = new Map<string, TicketProjection>();
    if (!tickets.length || !effectiveSegments.length) {
      return { projections, nominalCapacity, loadStatus, loadRatio };
    }

    // Initialize lane availability pool: each lane starts at max(now, firstSegmentStart)
    const firstSegmentStartMs = effectiveSegments[0].start.getTime();
    const initialLaneMs = Math.max(nowMs, firstSegmentStartMs);
    const laneAvailableAt: number[] = new Array(effectiveLanes).fill(
      initialLaneMs,
    );

    // Group active tickets: in_service / called first, then waiting
    const inServiceTickets: SimulationTicketItem[] = [];
    const waitingTickets: SimulationTicketItem[] = [];

    for (const t of tickets) {
      if (t.status === 'in_service' || t.status === 'called') {
        inServiceTickets.push(t);
      } else {
        waitingTickets.push(t);
      }
    }

    let globalPosition = 1;

    // 1. Process in-service / called tickets (they occupy lanes currently)
    for (let i = 0; i < inServiceTickets.length; i++) {
      const ticket = inServiceTickets[i];
      const laneIdx = i % effectiveLanes;

      let finishMs: number;
      const startMs = ticket.actualStart ? ticket.actualStart.getTime() : nowMs;

      if (ticket.actualStart) {
        const elapsedMs = Math.max(0, nowMs - ticket.actualStart.getTime());
        const remainingMs = Math.max(durationMs - elapsedMs, minRemainingMs);
        finishMs = nowMs + remainingMs;
      } else {
        finishMs = nowMs + durationMs;
      }

      laneAvailableAt[laneIdx] = Math.max(laneAvailableAt[laneIdx], finishMs);

      projections.set(ticket.id, {
        ticketId: ticket.id,
        projectedStart: new Date(startMs),
        projectedEnd: new Date(finishMs),
        position: globalPosition++,
        aheadCount: 0,
      });
    }

    // 2. Process waiting tickets sequentially
    for (let i = 0; i < waitingTickets.length; i++) {
      const ticket = waitingTickets[i];

      // Find earliest available lane
      let earliestLaneIdx = 0;
      for (let l = 1; l < effectiveLanes; l++) {
        if (laneAvailableAt[l] < laneAvailableAt[earliestLaneIdx]) {
          earliestLaneIdx = l;
        }
      }

      let startMs = Math.max(
        laneAvailableAt[earliestLaneIdx],
        firstSegmentStartMs,
      );

      // Verify start falls within effective open segments; if in closure gap, advance
      let fits = false;
      for (const seg of effectiveSegments) {
        const segStartMs = seg.start.getTime();
        const segEndMs = seg.end.getTime();

        if (startMs < segStartMs) {
          startMs = segStartMs;
        }

        if (startMs >= segStartMs && startMs < segEndMs) {
          fits = true;
          break;
        }
      }

      if (!fits && effectiveSegments.length > 0) {
        // Fall back to end of last segment
        startMs = effectiveSegments[effectiveSegments.length - 1].end.getTime();
      }

      const endMs = startMs + durationMs;
      laneAvailableAt[earliestLaneIdx] = endMs;

      projections.set(ticket.id, {
        ticketId: ticket.id,
        projectedStart: new Date(startMs),
        projectedEnd: new Date(endMs),
        position: globalPosition++,
        aheadCount: inServiceTickets.length + i,
      });
    }

    return {
      projections,
      nominalCapacity,
      loadStatus,
      loadRatio,
    };
  }
}
