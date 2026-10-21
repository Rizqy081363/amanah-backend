import { Writable } from 'node:stream';
import { ExportFormat } from './export-job.entity';
import { ExportSource } from './export-source.interface';

export interface ExportContext {
  jobId: string;
  userId: string;
  exportType: string;
  format: ExportFormat;
  params: Record<string, any>;
  total: number;
  isCancelled(): Promise<boolean>;
}

export interface IProgressReporter {
  advance(count: number): Promise<void>;
  flush(phase: string): Promise<void>;
}

export interface Exporter {
  readonly format: ExportFormat;
  readonly contentType: string;
  readonly extension: string;
  run(
    ctx: ExportContext,
    source: ExportSource,
    sink: Writable,
    progress: IProgressReporter,
  ): Promise<{ parts: number; rowCount: number }>;
}
