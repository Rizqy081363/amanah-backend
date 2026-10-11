import { parseClockTime } from '../../../../schedules/domain/schedule-projection';

export interface SessionDefLike {
  id: string;
  code: string;
  defaultStartsAt: string;
  defaultEndsAt: string;
}

export class SessionResolutionHelper {
  /**
   * Resolves the matching operational session ID for an appointment.
   * Prioritizes queueTicket.sessionId, falling back to time-range matching against session definitions.
   * Uses domain utility parseClockTime instead of manual parsing.
   */
  static resolveSessionId(
    scheduledStartTime: string,
    existingSessionId: string | null | undefined,
    sessionDefs: SessionDefLike[],
  ): string | null {
    if (existingSessionId) {
      const found = sessionDefs.find((s) => s.id === existingSessionId);
      if (found) return found.id;
    }

    if (!sessionDefs || sessionDefs.length === 0) {
      return existingSessionId || null;
    }

    const aptMinutes = parseClockTime(scheduledStartTime.slice(0, 5));

    for (const def of sessionDefs) {
      const startMin = parseClockTime(def.defaultStartsAt.slice(0, 5));
      const endMin = parseClockTime(def.defaultEndsAt.slice(0, 5));

      if (startMin < endMin) {
        if (aptMinutes >= startMin && aptMinutes < endMin) {
          return def.id;
        }
      } else {
        // Over midnight boundary (e.g., 18:00 - 24:00 or 22:00 - 06:00)
        if (aptMinutes >= startMin || aptMinutes < endMin) {
          return def.id;
        }
      }
    }

    // Fallback: match by closest start time
    let closestDef: SessionDefLike | null = null;
    let minDiff = Number.POSITIVE_INFINITY;

    for (const def of sessionDefs) {
      const startMin = parseClockTime(def.defaultStartsAt.slice(0, 5));
      const diff = Math.abs(aptMinutes - startMin);
      if (diff < minDiff) {
        minDiff = diff;
        closestDef = def;
      }
    }

    return closestDef ? closestDef.id : sessionDefs[0].id;
  }
}
