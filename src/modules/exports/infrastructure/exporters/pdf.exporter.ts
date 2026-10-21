import { Writable } from 'node:stream';
import { Injectable, Logger } from '@nestjs/common';
import pdfmake from 'pdfmake';
import { ExportFormat } from '../../domain/export-job.entity';
import { ExportSource } from '../../domain/export-source.interface';
import {
  ExportContext,
  Exporter,
  IProgressReporter,
} from '../../domain/exporter.interface';

@Injectable()
export class PdfExporter implements Exporter {
  readonly format: ExportFormat = 'pdf';
  readonly contentType = 'application/pdf';
  readonly extension = 'pdf';
  private readonly logger = new Logger(PdfExporter.name);

  constructor() {
    pdfmake.setFonts({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });
  }

  async run(
    ctx: ExportContext,
    source: ExportSource,
    sink: Writable,
    progress: IProgressReporter,
  ): Promise<{ parts: number; rowCount: number }> {
    const headers = source.getHeaders(ctx.params);
    const tableBody: any[][] = [];

    // Header row
    tableBody.push(
      headers.map((h) => ({
        text: h,
        bold: true,
        fillColor: '#1E3A8A',
        color: '#FFFFFF',
        fontSize: 8.5,
        alignment: 'center',
      })),
    );

    let totalExported = 0;
    let rowIndex = 1;

    for await (const batch of source.read(ctx.params, ctx.userId)) {
      if (await ctx.isCancelled()) {
        throw new Error('Export job cancelled by user');
      }

      for (const item of batch) {
        const rowValues = source.formatRow(item, rowIndex++);
        const isEven = rowIndex % 2 === 0;

        tableBody.push(
          rowValues.map((val) => {
            const strVal = val === null || val === undefined ? '-' : String(val);
            const isNum = typeof val === 'number';
            return {
              text: strVal,
              fontSize: 8,
              fillColor: isEven ? '#F8FAFC' : null,
              alignment: isNum ? 'right' : 'left',
            };
          }),
        );
      }

      totalExported += batch.length;
      await progress.advance(batch.length);
    }

    const title = source.getTitle(ctx.params);
    const subtitle = source.getSubtitle ? source.getSubtitle(ctx.params) : '';
    const isLandscape = headers.length > 6;

    const docDefinition: any = {
      pageOrientation: isLandscape ? 'landscape' : 'portrait',
      pageSize: 'A4',
      pageMargins: [28, 36, 28, 36],
      defaultStyle: {
        font: 'Helvetica',
      },
      header: (currentPage: number, pageCount: number) => {
        return {
          margin: [28, 14, 28, 0],
          columns: [
            {
              text: 'Amanah Healthcare System — Dokumen Resmi',
              fontSize: 7.5,
              color: '#94A3B8',
            },
            {
              text: `Hal ${currentPage} / ${pageCount}`,
              alignment: 'right',
              fontSize: 7.5,
              color: '#94A3B8',
            },
          ],
        };
      },
      content: [
        // Clinic Header
        {
          columns: [
            {
              width: '*',
              stack: [
                {
                  text: 'KLINIK AMANAH HEALTHCARE',
                  fontSize: 14,
                  bold: true,
                  color: '#1E3A8A',
                  letterSpacing: 0.5,
                },
                {
                  text: 'Layanan Kesehatan & Operasional Klinis Terpadu',
                  fontSize: 8.5,
                  color: '#64748B',
                  margin: [0, 2, 0, 0],
                },
              ],
            },
            {
              width: 'auto',
              stack: [
                {
                  text: `Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`,
                  fontSize: 8,
                  alignment: 'right',
                  color: '#475569',
                },
                {
                  text: `Status: Terverifikasi Sistem`,
                  fontSize: 7.5,
                  alignment: 'right',
                  color: '#16A34A',
                  margin: [0, 2, 0, 0],
                },
              ],
            },
          ],
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 8,
              x2: isLandscape ? 786 : 538,
              y2: 8,
              lineWidth: 1.5,
              lineColor: '#1E3A8A',
            },
          ],
          margin: [0, 4, 0, 14],
        },
        // Document Title Banner
        {
          text: title.toUpperCase(),
          fontSize: 11,
          bold: true,
          color: '#0F172A',
          margin: [0, 0, 0, 2],
        },
        subtitle
          ? {
              text: subtitle,
              fontSize: 8.5,
              color: '#64748B',
              margin: [0, 0, 0, 10],
            }
          : { text: '', margin: [0, 0, 0, 8] },
        // Main Tabular Content
        {
          table: {
            headerRows: 1,
            widths: Array(headers.length).fill('*'),
            body: tableBody,
          },
          layout: {
            hLineWidth: (i: number, node: any) =>
              i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
            vLineWidth: () => 0.4,
            hLineColor: (i: number) => (i === 1 ? '#0F172A' : '#CBD5E1'),
            vLineColor: () => '#E2E8F0',
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
      ],
    };

    const doc = pdfmake.createPdf(docDefinition);
    const pdfBuffer = await doc.getBuffer();

    return new Promise((resolve, reject) => {
      sink.write(pdfBuffer, (err) => {
        if (err) return reject(err);
        sink.end();
        resolve({ parts: 1, rowCount: totalExported });
      });
    });
  }
}
