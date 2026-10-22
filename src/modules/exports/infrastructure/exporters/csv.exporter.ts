import { Writable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import * as csv from 'fast-csv';
import { ExportFormat } from '../../domain/export-job.entity';
import { ExportSource } from '../../domain/export-source.interface';
import {
  ExportContext,
  Exporter,
  IProgressReporter,
} from '../../domain/exporter.interface';

@Injectable()
export class CsvExporter implements Exporter {
  readonly format: ExportFormat = 'csv';
  readonly contentType = 'text/csv; charset=utf-8';
  readonly extension = 'csv';
  private readonly logger = new Logger(CsvExporter.name);

  async run(
    ctx: ExportContext,
    source: ExportSource,
    sink: Writable,
    progress: IProgressReporter,
  ): Promise<{ parts: number; rowCount: number }> {
    return new Promise((resolve, reject) => {
      let totalExported = 0;
      // Prepend UTF-8 BOM so Microsoft Excel on Windows automatically detects UTF-8 encoding
      sink.write('\ufeff');

      const csvStream = csv.format({ headers: false, delimiter: ',' });

      csvStream.pipe(sink);

      (async () => {
        try {
          const headers = source.getHeaders(ctx.params);
          csvStream.write(headers);

          let rowIndex = 1;
          for await (const batch of source.read(ctx.params, ctx.userId)) {
            if (await ctx.isCancelled()) {
              throw new Error('Export job cancelled by user');
            }

            for (const item of batch) {
              const formattedRow = source.formatRow(item, rowIndex++);
              csvStream.write(formattedRow);
            }

            totalExported += batch.length;
            await progress.advance(batch.length);
          }

          csvStream.end();
          sink.on('finish', () => {
            resolve({ parts: 1, rowCount: totalExported });
          });
        } catch (err) {
          csvStream.destroy(err as Error);
          reject(err);
        }
      })();
    });
  }
}
