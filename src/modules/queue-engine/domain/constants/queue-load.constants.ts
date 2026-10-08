export const DEFAULT_FALLBACK_CAPACITY = 20;

export const QUEUE_LOAD_STATUS = {
  SENGGANG: 'Senggang',
  NORMAL: 'Normal',
  PADAT: 'Padat',
  SANGAT_PADAT: 'Sangat Padat',
} as const;

export type QueueLoadStatus =
  (typeof QUEUE_LOAD_STATUS)[keyof typeof QUEUE_LOAD_STATUS];

export const QUEUE_LOAD_THRESHOLDS = {
  SENGGANG_MAX_RATIO: 0.6,
  NORMAL_MAX_RATIO: 0.9,
  PADAT_MAX_RATIO: 1.2,
} as const;

/**
 * Resolves load status label dynamically based on load ratio
 */
export function resolveQueueLoadStatus(loadRatio: number): QueueLoadStatus {
  if (loadRatio < QUEUE_LOAD_THRESHOLDS.SENGGANG_MAX_RATIO) {
    return QUEUE_LOAD_STATUS.SENGGANG;
  }
  if (loadRatio <= QUEUE_LOAD_THRESHOLDS.NORMAL_MAX_RATIO) {
    return QUEUE_LOAD_STATUS.NORMAL;
  }
  if (loadRatio <= QUEUE_LOAD_THRESHOLDS.PADAT_MAX_RATIO) {
    return QUEUE_LOAD_STATUS.PADAT;
  }
  return QUEUE_LOAD_STATUS.SANGAT_PADAT;
}
