type ExportJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

class ExportJobEntity {
  id: string;
  requestedBy: string;
  exportType: string;
  format: ExportFormat;
  parameters: Record<string, any>;
  parametersHash?: string | null;
  status: ExportJobStatus;
  totalRows?: number | null;
  processedRows: number;
  attempt: number;
  maxAttempts: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  fileId?: string | null;
  objectKey?: string | null;
  fileSize?: number | null;
  parts: number;
  idempotencyKey?: string | null;
  heartbeatAt?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  expiresAt?: string | null;

  static isValidTransition(
    current: ExportJobStatus,
    target: ExportJobStatus,
  ): boolean {
    const transitions: Record<ExportJobStatus, ExportJobStatus[]> = {
      queued: ['running', 'cancelled'],
      running: ['completed', 'failed', 'cancelled'],
      completed: ['expired'],
      failed: [],
      cancelled: [],
      expired: [],
    };
    return transitions[current]?.includes(target) ?? false;
  }
}
