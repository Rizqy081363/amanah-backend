const DEFAULT_FALLBACK_CAPACITY = 20;

const QUEUE_LOAD_STATUS = {
  SMOOTH: 'Lancar',
  BUSY: 'Ramai',
  OVERLOADED: 'Melebihi Kapasitas',
} as const;

export type QueueLoadStatus =
  (typeof QUEUE_LOAD_STATUS)[keyof typeof QUEUE_LOAD_STATUS];

export interface LoadRatioThresholds {
  okMax: number;
  busyMax: number;
}

const DEFAULT_LOAD_RATIO_THRESHOLDS: LoadRatioThresholds = {
  okMax: 0.9,
  busyMax: 1.1,
};

/**
 * Resolves load status label dynamically based on load ratio and configured thresholds from clinic_setting
 * Aligned with feature-spec/queue-base-ticketing/antrian-tanpa-slot-30-menit.md Section 7
 */
export function resolveQueueLoadStatus(
  loadRatio: number,
  thresholds: LoadRatioThresholds = DEFAULT_LOAD_RATIO_THRESHOLDS,
): QueueLoadStatus {
  if (loadRatio < thresholds.okMax) {
    return QUEUE_LOAD_STATUS.SMOOTH;
  }
  if (loadRatio <= thresholds.busyMax) {
    return QUEUE_LOAD_STATUS.BUSY;
  }
  return QUEUE_LOAD_STATUS.OVERLOADED;
}
