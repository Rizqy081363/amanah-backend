export interface ExportSource {
  readonly type: string;
  getTitle(params: Record<string, any>): string;
  getSubtitle?(params: Record<string, any>): string;
  getHeaders(params: Record<string, any>): string[];
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
}
