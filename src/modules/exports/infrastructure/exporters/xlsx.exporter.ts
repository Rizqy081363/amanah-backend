import { Writable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ExportFormat } from '../../domain/export-job.entity';
import { ExportSource } from '../../domain/export-source.interface';
import {
  ExportContext,
  Exporter,
  IProgressReporter,
} from '../../domain/exporter.interface';

const MAX_ROWS_PER_SHEET = 1_000_000;

@Injectable()
export class XlsxExporter implements Exporter {
  readonly format: ExportFormat = 'xlsx';
  readonly contentType =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  readonly extension = 'xlsx';
  private readonly logger = new Logger(XlsxExporter.name);

  async run(
    ctx: ExportContext,
    source: ExportSource,
    sink: Writable,
    progress: IProgressReporter,
  ): Promise<{ parts: number; rowCount: number }> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: sink,
      useStyles: true,
      useSharedStrings: false,
    });

    const headers = source.getHeaders(ctx.params);
    let sheetNumber = 1;
    let sheetName = `${source.type.charAt(0).toUpperCase() + source.type.slice(1)}`;
    let currentSheet = workbook.addWorksheet(
      sheetNumber === 1 ? sheetName : `${sheetName} (${sheetNumber})`,
      {
        views: [{ showGridLines: true }],
      },
    );

    // Apply header row
    const headerRow = currentSheet.addRow(headers);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }, // Navy blue
      };
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11,
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
    headerRow.commit();

    let totalExported = 0;
    let rowsInSheet = 0;
    let rowIndex = 1;

    for await (const batch of source.read(ctx.params, ctx.userId)) {
      if (await ctx.isCancelled()) {
        throw new Error('Export job cancelled by user');
      }

      for (const item of batch) {
        if (rowsInSheet >= MAX_ROWS_PER_SHEET) {
          currentSheet.commit();
          sheetNumber++;
          currentSheet = workbook.addWorksheet(`${sheetName} (${sheetNumber})`, {
            views: [{ showGridLines: true }],
          });
          const nextHeaderRow = currentSheet.addRow(headers);
          nextHeaderRow.height = 24;
          nextHeaderRow.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF1E3A8A' },
            };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
          });
          nextHeaderRow.commit();
          rowsInSheet = 0;
        }

        const values = source.formatRow(item, rowIndex++);
        const row = currentSheet.addRow(values);
        row.height = 20;

        // Striping
        const isEven = rowIndex % 2 === 0;
        row.eachCell((cell, colNumber) => {
          if (isEven) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' },
            };
          }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
          cell.alignment = { vertical: 'middle' };

          // Format numbers and currency if appropriate
          if (typeof cell.value === 'number') {
            if (cell.value > 1000) {
              cell.numFmt = '#,##0';
            }
          }
        });
        row.commit();
        rowsInSheet++;
      }

      totalExported += batch.length;
      await progress.advance(batch.length);
    }

    currentSheet.commit();
    await workbook.commit();

    return { parts: sheetNumber, rowCount: totalExported };
  }
}
