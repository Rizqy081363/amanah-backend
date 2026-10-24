import { PayrollReportAggregation } from './payroll-report.contract';

export type ColumnAlignment = 'left' | 'center' | 'right';
export type ColumnFormat = 'text' | 'number' | 'currency' | 'date' | 'time' | 'decimal';

export interface ExportColumnDef {
  header: string;
  width?: number | 'auto' | '*';
  align?: ColumnAlignment;
  format?: ColumnFormat;
}

export interface ExportSource {
  readonly type: string;
  getTitle(params: Record<string, any>, userId?: string): string | Promise<string>;
  getSubtitle?(params: Record<string, any>, userId?: string): string | Promise<string>;
  getDetailsTitle?(params: Record<string, any>, userId?: string): string | Promise<string>;
  getHeaders(params: Record<string, any>): string[];
  getColumnDefs?(params: Record<string, any>): ExportColumnDef[];
  count(params: Record<string, any>, userId: string): Promise<number>;
  read(
    params: Record<string, any>,
    userId: string,
    batchSize?: number,
  ): AsyncGenerator<any[]>;
  formatRow(row: any, index: number): (string | number | boolean | null)[];
  getMetadata?(
    params: Record<string, any>,
    userId: string,
  ): Promise<Record<string, string>>;
  getAggregation?(
    params: Record<string, any>,
    userId: string,
  ): Promise<PayrollReportAggregation | null>;
}
