export interface EstimateDurationParams {
  durationsMinutes: number[];
  priorMinutes?: number;
  priorWeight?: number;
  minMinutes?: number;
  maxMinutes?: number;
}

export interface EtaWindow {
  start: Date;
  end: Date;
  startFormatted: string;
  endFormatted: string;
  displayRange: string;
}

export class EstimatorService {
  /**
   * Bayesian estimated service duration calculation
   */
  estimateDuration(params: EstimateDurationParams): number {
    const prior = params.priorMinutes ?? 30;
    const weight = params.priorWeight ?? 5;
    const minBound = params.minMinutes ?? 5;
    const maxBound = params.maxMinutes ?? 60;

    const samples = params.durationsMinutes;
    const n = samples.length;

    let estimated: number;
    if (n === 0) {
      estimated = prior;
    } else {
      const sum = samples.reduce((acc, v) => acc + v, 0);
      estimated = (weight * prior + sum) / (weight + n);
    }

    return Math.max(minBound, Math.min(maxBound, Math.round(estimated)));
  }

  /**
   * Dampen ETA updates so the patient doesn't experience jitter
   */
  applyHysteresis(params: {
    oldEta: Date | null | undefined;
    newEta: Date;
    hysteresisMinutes?: number;
  }): Date {
    const { oldEta, newEta } = params;
    const thresholdMs = (params.hysteresisMinutes ?? 5) * 60_000;

    if (!oldEta) return newEta;

    const diff = Math.abs(newEta.getTime() - oldEta.getTime());
    if (diff < thresholdMs) {
      return oldEta;
    }

    return newEta;
  }

  /**
   * Format ETA window into rounded readable time range
   */
  formatEtaWindow(
    projectedStart: Date,
    durationMinutes: number,
    roundingMinutes = 5,
  ): EtaWindow {
    const ms = projectedStart.getTime();
    const roundMs = roundingMinutes * 60_000;
    const roundedStartMs = Math.round(ms / roundMs) * roundMs;

    const start = new Date(roundedStartMs);
    const end = new Date(roundedStartMs + durationMinutes * 60_000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const startFormatted = `${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}`;
    const endFormatted = `${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}`;

    return {
      start,
      end,
      startFormatted,
      endFormatted,
      displayRange: `${startFormatted} - ${endFormatted} WIB`,
    };
  }
}
