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
import {
  CLINIC_LOGO_BASE64,
  CLINIC_WATERMARK_SVG,
} from '../assets/clinic-logo.asset';

function formatRupiah(amount: number): string {
  return `Rp${Math.round(amount).toLocaleString('id-ID')}`;
}

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
    const aggregation = source.getAggregation
      ? await source.getAggregation(ctx.params, ctx.userId)
      : null;

    const tableBody: any[][] = [];

    // Header row for main transaction details table
    tableBody.push(
      headers.map((h) => ({
        text: h,
        bold: true,
        fillColor: '#1E3A8A',
        color: '#FFFFFF',
        fontSize: 7.5,
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
          rowValues.map((val, colIdx) => {
            const isNum = typeof val === 'number';
            const isPayroll = source.type === 'payroll' || headers.length === 11;
            const isCurrency = isPayroll && (colIdx === 9 || colIdx === 10);
            const strVal =
              val === null || val === undefined
                ? '-'
                : isCurrency && isNum
                  ? Math.round(val).toLocaleString('id-ID')
                  : typeof val === 'number' && colIdx === 6 && !isPayroll
                    ? val.toFixed(2)
                    : String(val);

            let alignment = 'left';
            if (isPayroll) {
              alignment =
                colIdx === 0 || colIdx === 3 || colIdx === 4 || colIdx === 5
                  ? 'center'
                  : isNum
                    ? 'right'
                    : 'left';
            } else {
              alignment =
                colIdx === 0 || colIdx === 1 || colIdx === 2 || colIdx === 3 || colIdx === 4 || colIdx === 7
                  ? 'center'
                  : isNum
                    ? 'right'
                    : 'left';
            }

            return {
              text: strVal,
              fontSize: 7.5,
              fillColor: isEven ? '#F8FAFC' : null,
              alignment,
            };
          }),
        );
      }

      totalExported += batch.length;
      await progress.advance(batch.length);
    }

    const title = source.getTitle(ctx.params);
    const isLandscape = headers.length > 6;

    const isAttendance = source.type === 'attendance' || headers.length === 9;
    const detailsTitle = isAttendance
      ? 'RIWAYAT PRESENSI & KEHADIRAN PEGAWAI'
      : 'RINCIAN TRANSAKSI PENGGAJIAN HARIAN';

    const detailTableWidths = isAttendance
      ? [24, 65, 65, 55, 55, 75, 75, 75, '*']
      : headers.length === 11
        ? [20, 62, '*', 58, 50, 32, 72, '*', 46, 70, 78]
        : headers.map((_, i) => (i === 0 ? 24 : '*'));

    // 1. Component Summary (Pivot) Table
    const componentBody: any[][] = [];
    if (aggregation?.components && aggregation.components.length > 0) {
      componentBody.push([
        {
          text: 'Komponen Transaksi',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 8,
        },
        {
          text: 'Kategori',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 8,
          alignment: 'center',
        },
        {
          text: 'Kuantitas (Jam)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 8,
          alignment: 'right',
        },
        {
          text: 'Tarif Satuan (Rp)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 8,
          alignment: 'right',
        },
        {
          text: 'Total Nominal (Rp)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 8,
          alignment: 'right',
        },
      ]);

      for (const c of aggregation.components) {
        const isDeduction = c.category === 'deduction';
        componentBody.push([
          { text: c.componentLabel, fontSize: 8 },
          {
            text: isDeduction ? 'Potongan' : 'Penghasilan',
            fontSize: 7.5,
            alignment: 'center',
            color: isDeduction ? '#DC2626' : '#16A34A',
          },
          {
            text: c.quantityHours > 0 ? c.quantityHours.toFixed(2) : '-',
            fontSize: 8,
            alignment: 'right',
          },
          {
            text: c.rate > 0 ? c.rate.toLocaleString('id-ID') : '-',
            fontSize: 8,
            alignment: 'right',
          },
          {
            text: formatRupiah(c.amount),
            fontSize: 8,
            bold: true,
            alignment: 'right',
            color: isDeduction ? '#DC2626' : '#0F172A',
          },
        ]);
      }
    }

    // 2. Transparent Leave Deductions Table
    const leaveBody: any[][] = [];
    if (
      aggregation?.leaveDeductionsList &&
      aggregation.leaveDeductionsList.length > 0
    ) {
      leaveBody.push([
        {
          text: 'No',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'center',
        },
        {
          text: 'Jenis Permohonan',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
        },
        {
          text: 'Rentang Tanggal Cuti',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'center',
        },
        {
          text: 'Durasi',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'center',
        },
        {
          text: 'Jam/Hari',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'right',
        },
        {
          text: 'Tarif/Jam (Rp)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'right',
        },
        {
          text: 'Potongan/Hari (Rp)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'right',
        },
        {
          text: 'Total Potongan (Rp)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'right',
        },
      ]);

      aggregation.leaveDeductionsList.forEach((item, idx) => {
        leaveBody.push([
          { text: idx + 1, fontSize: 7.5, alignment: 'center' },
          { text: item.requestTypeLabel, fontSize: 7.5 },
          { text: item.dateRange, fontSize: 7.5, alignment: 'center' },
          { text: `${item.durationDays} Hari`, fontSize: 7.5, alignment: 'center' },
          {
            text: `${item.hoursPerDay.toFixed(2)} Jam`,
            fontSize: 7.5,
            alignment: 'right',
          },
          {
            text: item.hourlyRate.toLocaleString('id-ID'),
            fontSize: 7.5,
            alignment: 'right',
          },
          {
            text: item.dailyDeduction.toLocaleString('id-ID'),
            fontSize: 7.5,
            alignment: 'right',
            color: '#DC2626',
          },
          {
            text: formatRupiah(item.totalDeduction),
            fontSize: 7.5,
            bold: true,
            alignment: 'right',
            color: '#DC2626',
          },
        ]);
      });
    }

    // 3. Transparent Overtime / Replacement Table
    const overtimeBody: any[][] = [];
    if (
      aggregation?.overtimeAdditionsList &&
      aggregation.overtimeAdditionsList.length > 0
    ) {
      overtimeBody.push([
        {
          text: 'No',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'center',
        },
        {
          text: 'Tanggal Dinas',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'center',
        },
        {
          text: 'Hari',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'center',
        },
        {
          text: 'Kategori Transaksi',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
        },
        {
          text: 'Jam Kerja',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'right',
        },
        {
          text: 'Tarif Lembur/Jam (Rp)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'right',
        },
        {
          text: 'Total Upah (Rp)',
          bold: true,
          fillColor: '#1E3A8A',
          color: '#FFFFFF',
          fontSize: 7.5,
          alignment: 'right',
        },
      ]);

      aggregation.overtimeAdditionsList.forEach((item, idx) => {
        overtimeBody.push([
          { text: idx + 1, fontSize: 7.5, alignment: 'center' },
          { text: item.date, fontSize: 7.5, alignment: 'center' },
          { text: item.dayName, fontSize: 7.5, alignment: 'center' },
          { text: item.categoryLabel, fontSize: 7.5 },
          {
            text: `${item.hours.toFixed(2)} Jam`,
            fontSize: 7.5,
            alignment: 'right',
          },
          {
            text: item.hourlyRate.toLocaleString('id-ID'),
            fontSize: 7.5,
            alignment: 'right',
          },
          {
            text: formatRupiah(item.totalAmount),
            fontSize: 7.5,
            bold: true,
            alignment: 'right',
            color: '#1E3A8A',
          },
        ]);
      });
    }

    const docDefinition: any = {
      pageOrientation: isLandscape ? 'landscape' : 'portrait',
      pageSize: 'A4',
      pageMargins: [28, 28, 28, 28],
      defaultStyle: {
        font: 'Helvetica',
      },
      background: (_currentPage: number, pageSize: { width: number; height: number }) => [
        {
          svg: CLINIC_WATERMARK_SVG,
          width: 320,
          absolutePosition: { x: -50, y: pageSize.height - 260 },
        },
      ],
      footer: (currentPage: number, pageCount: number) => ({
        margin: [28, 0, 28, 12],
        columns: [
          {
            text: 'Klinik Amanah Healthcare',
            fontSize: 7.5,
            color: '#94A3B8',
          },
          {
            text: `Halaman ${currentPage} dari ${pageCount}`,
            alignment: 'right',
            fontSize: 7.5,
            color: '#94A3B8',
          },
        ],
      }),
      content: [
        // 1. Clinic Header with Logo and Address
        {
          columns: [
            {
              width: 58,
              stack: [
                {
                  image: CLINIC_LOGO_BASE64,
                  width: 34,
                  height: 34,
                  margin: [0, 0, 0, 0],
                },
              ],
            },
            {
              width: 350,
              stack: [
                {
                  text: 'KLINIK AMANAH HEALTHCARE',
                  fontSize: 13,
                  bold: true,
                  color: '#1E3A8A',
                  letterSpacing: 0.5,
                },
                {
                  text: 'Jl. Anyelir 1 No.243, Perumnas Condong Catur, Condongcatur, Kec. Depok, Kabupaten Sleman, Daerah Istimewa Yogyakarta 55281',
                  fontSize: 7.5,
                  color: '#475569',
                  lineHeight: 1.25,
                  margin: [0, 3, 0, 0],
                },
              ],
            },
            {
              width: '*',
              stack: [
                {
                  text: aggregation
                    ? `Periode: ${aggregation.periodMonth} ${aggregation.periodYear}`
                    : source.getSubtitle
                      ? source.getSubtitle(ctx.params)
                      : '',
                  fontSize: 8.5,
                  bold: true,
                  alignment: 'right',
                  color: '#0F172A',
                },
                {
                  text: `Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}`,
                  fontSize: 7.5,
                  alignment: 'right',
                  color: '#64748B',
                  margin: [0, 2, 0, 0],
                },
              ],
            },
          ],
        },
        // Separator rule
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 6,
              x2: isLandscape ? 786 : 538,
              y2: 6,
              lineWidth: 1.2,
              lineColor: '#1E3A8A',
            },
          ],
          margin: [0, 4, 0, 8],
        },
        // 2. Centered Report Title
        {
          text: title.toUpperCase(),
          fontSize: 10.5,
          bold: true,
          alignment: 'center',
          color: '#0F172A',
          margin: [0, 2, 0, 8],
        },
        // 3. Staff Information (No Bloated Labels)
        aggregation
          ? {
              margin: [0, 0, 0, 8],
              columns: [
                {
                  text: `${aggregation.staffName} (${aggregation.staffCode})`,
                  fontSize: 8.5,
                  bold: true,
                  color: '#0F172A',
                },
                {
                  text: `${aggregation.positionTitle || '-'}`,
                  fontSize: 8.5,
                  bold: true,
                  color: '#0F172A',
                  alignment: 'right',
                },
              ],
            }
          : { text: '', margin: [0, 0, 0, 0] },
        // 4. Component Summary (Pivot) Section
        componentBody.length > 0
          ? [
              {
                text: 'REKAPITULASI KOMPONEN PENGGAJIAN',
                fontSize: 8.5,
                bold: true,
                color: '#1E3A8A',
                margin: [0, 4, 0, 4],
              },
              {
                table: {
                  headerRows: 1,
                  widths: ['*', 100, 90, 100, 120],
                  body: componentBody,
                },
                layout: {
                  hLineWidth: () => 0.4,
                  vLineWidth: () => 0.4,
                  hLineColor: () => '#CBD5E1',
                  vLineColor: () => '#E2E8F0',
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                },
                margin: [0, 0, 0, 10],
              },
            ]
          : [],
        // 5. Transparent Leave Deductions Section (Conditional)
        leaveBody.length > 0
          ? [
              {
                text: 'RINCIAN POTONGAN CUTI & PERIZINAN',
                fontSize: 8.5,
                bold: true,
                color: '#DC2626',
                margin: [0, 4, 0, 4],
              },
              {
                table: {
                  headerRows: 1,
                  widths: [20, 110, '*', 55, 60, 75, 85, 95],
                  body: leaveBody,
                },
                layout: {
                  hLineWidth: () => 0.4,
                  vLineWidth: () => 0.4,
                  hLineColor: () => '#CBD5E1',
                  vLineColor: () => '#E2E8F0',
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                },
                margin: [0, 0, 0, 10],
              },
            ]
          : [],
        // 6. Transparent Overtime Additions Section (Conditional)
        overtimeBody.length > 0
          ? [
              {
                text: 'RINCIAN DINAS PENGGANTI & LEMBUR',
                fontSize: 8.5,
                bold: true,
                color: '#1E3A8A',
                margin: [0, 4, 0, 4],
              },
              {
                table: {
                  headerRows: 1,
                  widths: [20, 80, 60, '*', 70, 85, 95],
                  body: overtimeBody,
                },
                layout: {
                  hLineWidth: () => 0.4,
                  vLineWidth: () => 0.4,
                  hLineColor: () => '#CBD5E1',
                  vLineColor: () => '#E2E8F0',
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                },
                margin: [0, 0, 0, 10],
              },
            ]
          : [],
        // 7. Transaction Details Section (Flush 100% Margin Alignment)
        {
          text: detailsTitle,
          fontSize: 8.5,
          bold: true,
          color: '#1E3A8A',
          margin: [0, 4, 0, 4],
        },
        {
          table: {
            headerRows: 1,
            widths: detailTableWidths,
            body: tableBody,
          },
          layout: {
            hLineWidth: (i: number, node: any) =>
              i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4,
            vLineWidth: () => 0.4,
            hLineColor: (i: number) => (i === 1 ? '#0F172A' : '#CBD5E1'),
            vLineColor: () => '#E2E8F0',
            paddingLeft: () => 3,
            paddingRight: () => 3,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
          margin: [0, 0, 0, 12],
        },
        // 8. Grand Totals Minimalist Clean Lines
        aggregation
          ? {
              columns: [
                { width: '*', text: '' },
                {
                  width: 280,
                  table: {
                    widths: ['*', 120],
                    body: [
                      [
                        {
                          text: 'Total Penghasilan Bruto:',
                          fontSize: 8.5,
                          color: '#334155',
                        },
                        {
                          text: formatRupiah(aggregation.totals.grossEarnings),
                          fontSize: 8.5,
                          bold: true,
                          alignment: 'right',
                          color: '#0F172A',
                        },
                      ],
                      [
                        {
                          text: 'Total Potongan Cuti:',
                          fontSize: 8.5,
                          color: '#DC2626',
                        },
                        {
                          text: formatRupiah(aggregation.totals.totalDeductions),
                          fontSize: 8.5,
                          bold: true,
                          alignment: 'right',
                          color: '#DC2626',
                        },
                      ],
                      [
                        {
                          text: 'Total Gaji Bersih:',
                          fontSize: 9.5,
                          bold: true,
                          color: '#1E3A8A',
                        },
                        {
                          text: formatRupiah(aggregation.totals.netPayroll),
                          fontSize: 10.5,
                          bold: true,
                          alignment: 'right',
                          color: '#1E3A8A',
                        },
                      ],
                    ],
                  },
                  layout: {
                    hLineWidth: (i: number) => (i === 2 ? 1 : 0),
                    vLineWidth: () => 0,
                    hLineColor: () => '#1E3A8A',
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                    paddingTop: () => 3,
                    paddingBottom: () => 3,
                  },
                },
              ],
            }
          : [],
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
