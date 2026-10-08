import { TimeInterval } from '../types/calendar.types';
import {
  QueueLoadStatus,
  resolveQueueLoadStatus,
} from '../constants/queue-load.constants';

export type LoadStatus = QueueLoadStatus;

export interface TicketProjection {
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
  ): LoadStatus {
    if (nominalCapacity <= 0) return resolveQueueLoadStatus(999);
    const ratio = ticketsCount / nominalCapacity;
    return resolveQueueLoadStatus(ratio);
  }

  /**
   * Simulates multi-lane queue progression and computes projected start and end times
   */
  simulateQueue(params: {
    lanes: number;
    effectiveSegments: TimeInterval[];
    tickets: { id: string }[];
    estimatedDurationMinutes: number;
  }): SimulationResult {
    const { lanes, effectiveSegments, tickets, estimatedDurationMinutes } =
      params;
    const effectiveLanes = Math.max(1, lanes);
    const durationMs = Math.max(5, estimatedDurationMinutes) * 60_000;

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

    // Initialize lane availability pool
    const firstSegmentStart = effectiveSegments[0].start;
    const laneAvailableAt: number[] = new Array(effectiveLanes).fill(
      firstSegmentStart.getTime(),
    );

    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];

      // Find earliest available lane
      let earliestLaneIdx = 0;
      for (let l = 1; l < effectiveLanes; l++) {
        if (laneAvailableAt[l] < laneAvailableAt[earliestLaneIdx]) {
          earliestLaneIdx = l;
        }
      }

      let startMs = Math.max(
        laneAvailableAt[earliestLaneIdx],
        firstSegmentStart.getTime(),
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
        position: i + 1,
        aheadCount: i,
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
