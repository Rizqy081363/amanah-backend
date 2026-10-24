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
import { CLINIC_LOGO_BASE64 } from '../assets/clinic-logo.asset';

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
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Klinik Amanah Healthcare';
    workbook.created = new Date();

    const aggregation = source.getAggregation
      ? await source.getAggregation(ctx.params, ctx.userId)
      : null;

    let totalExported = 0;

    if (aggregation) {
      totalExported = await this.renderPayrollSingleSheet(
        workbook,
        source,
        ctx,
        aggregation,
        progress,
      );
    } else {
      totalExported = await this.renderGenericSingleSheet(
        workbook,
        source,
        ctx,
        progress,
      );
    }

    await new Promise<void>((resolve, reject) => {
      sink.on('finish', resolve);
      sink.on('error', reject);
      workbook.xlsx
        .write(sink)
        .then(() => {
          sink.end();
        })
        .catch(reject);
    });

    return { parts: 1, rowCount: totalExported };
  }

  // =========================================================================
  // 1. PAYROLL UNIFIED SINGLE SHEET (1:1 PARITY DENGAN PDF)
  // =========================================================================
  private async renderPayrollSingleSheet(
    workbook: ExcelJS.Workbook,
    source: ExportSource,
    ctx: ExportContext,
    aggregation: NonNullable<
      Awaited<ReturnType<NonNullable<ExportSource['getAggregation']>>>
    >,
    progress: IProgressReporter,
  ): Promise<number> {
    const sheet = workbook.addWorksheet('Slip Gaji', {
      views: [{ showGridLines: true }],
    });

    // 11 Columns definition (Col A to K)
    sheet.columns = [
      { key: 'colA', width: 6 }, // No
      { key: 'colB', width: 16 }, // Kode Staf / Tanggal
      { key: 'colC', width: 26 }, // Nama Staf
      { key: 'colD', width: 14 }, // Tanggal
      { key: 'colE', width: 12 }, // Bulan
      { key: 'colF', width: 10 }, // Tahun
      { key: 'colG', width: 26 }, // Komponen Transaksi
      { key: 'colH', width: 24 }, // Jenis Entri / Kategori
      { key: 'colI', width: 16 }, // Jam Kerja / Kuantitas
      { key: 'colJ', width: 20 }, // Tarif Satuan (Rp)
      { key: 'colK', width: 24 }, // Total Nominal (Rp)
    ];

    // Official Clinic Logo (Top Left)
    try {
      const logoId = workbook.addImage({
        base64: CLINIC_LOGO_BASE64,
        extension: 'png',
      });
      sheet.addImage(logoId, {
        tl: { col: 0.15, row: 0.2 },
        ext: { width: 44, height: 44 },
      });
    } catch (e) {
      this.logger.warn(`Failed to embed clinic logo in XLSX: ${e}`);
    }

    // Row 1: Clinic Name & Periode
    const r1 = sheet.addRow([
      '',
      'KLINIK AMANAH HEALTHCARE',
      '',
      '',
      '',
      '',
      '',
      '',
      `Periode: ${aggregation.periodMonth} ${aggregation.periodYear}`,
      '',
      '',
    ]);
    sheet.mergeCells('B1:F1');
    sheet.mergeCells('I1:K1');
    r1.getCell(2).font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };
    r1.getCell(9).font = { bold: true, size: 9.5, color: { argb: 'FF0F172A' } };
    r1.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

    // Row 2: Clinic Address & Print Date
    const printDate = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const r2 = sheet.addRow([
      '',
      'Jl. Anyelir 1 No.243, Condongcatur, Depok, Sleman, D.I. Yogyakarta 55281',
      '',
      '',
      '',
      '',
      '',
      '',
      `Tanggal Cetak: ${printDate}`,
      '',
      '',
    ]);
    sheet.mergeCells('B2:F2');
    sheet.mergeCells('I2:K2');
    r2.getCell(2).font = { size: 8.5, color: { argb: 'FF475569' } };
    r2.getCell(9).font = { size: 8.5, color: { argb: 'FF64748B' } };
    r2.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

    // Row 3: Blank Spacer
    sheet.addRow([]);

    // Row 4: Solid Navy Separator Rule (Col A to K)
    const r4 = sheet.addRow([]);
    r4.height = 4;
    for (let c = 1; c <= 11; c++) {
      r4.getCell(c).border = {
        bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
      };
    }

    // Row 5: Blank Spacer
    sheet.addRow([]);

    // Row 6: Document Title (Centered)
    const titleText = (await Promise.resolve(source.getTitle(ctx.params, ctx.userId))).toUpperCase();
    const r6 = sheet.addRow([titleText]);
    sheet.mergeCells('A6:K6');
    r6.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
    r6.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 7: Staff Info
    const r7 = sheet.addRow([
      `${aggregation.staffName} (${aggregation.staffCode})`,
      '',
      '',
      '',
      '',
      '',
      '',
      `${aggregation.positionTitle || '-'}`,
      '',
      '',
      '',
    ]);
    sheet.mergeCells('A7:E7');
    sheet.mergeCells('H7:K7');
    r7.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
    r7.getCell(8).font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
    r7.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

    // Row 8: Blank Spacer
    sheet.addRow([]);

    // -----------------------------------------------------------------------
    // Section 1: REKAPITULASI KOMPONEN PENGGAJIAN (Pivot Table)
    // -----------------------------------------------------------------------
    if (aggregation.components && aggregation.components.length > 0) {
      const compTitle = sheet.addRow(['REKAPITULASI KOMPONEN PENGGAJIAN']);
      compTitle.font = { bold: true, size: 9.5, color: { argb: 'FF1E3A8A' } };

      const compHead = sheet.addRow([
        'No',
        'Komponen Transaksi',
        '',
        '',
        'Kategori',
        'Kuantitas (Jam)',
        '',
        'Tarif Satuan (Rp)',
        '',
        'Total Nominal (Rp)',
        '',
      ]);
      const chIdx = compHead.number;
      sheet.mergeCells(`B${chIdx}:D${chIdx}`);
      sheet.mergeCells(`F${chIdx}:G${chIdx}`);
      sheet.mergeCells(`H${chIdx}:I${chIdx}`);
      sheet.mergeCells(`J${chIdx}:K${chIdx}`);
      compHead.height = 22;
      compHead.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      let cIdx = 1;
      for (const comp of aggregation.components) {
        const isDeduction = comp.category === 'deduction';
        const cr = sheet.addRow([
          cIdx++,
          comp.componentLabel,
          '',
          '',
          isDeduction ? 'Potongan' : 'Penghasilan',
          comp.quantityHours > 0 ? comp.quantityHours : '-',
          '',
          comp.rate > 0 ? comp.rate : '-',
          '',
          comp.amount,
          '',
        ]);
        const crIdx = cr.number;
        sheet.mergeCells(`B${crIdx}:D${crIdx}`);
        sheet.mergeCells(`F${crIdx}:G${crIdx}`);
        sheet.mergeCells(`H${crIdx}:I${crIdx}`);
        sheet.mergeCells(`J${crIdx}:K${crIdx}`);
        cr.height = 20;
        cr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        cr.getCell(2).alignment = { vertical: 'middle' };
        cr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        cr.getCell(5).font = {
          color: { argb: isDeduction ? 'FFDC2626' : 'FF16A34A' },
          bold: true,
        };
        if (typeof comp.quantityHours === 'number' && comp.quantityHours > 0) {
          cr.getCell(6).numFmt = '0.00';
          cr.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          cr.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        }
        if (typeof comp.rate === 'number' && comp.rate > 0) {
          cr.getCell(8).numFmt = '#,##0';
          cr.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          cr.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
        }
        cr.getCell(10).numFmt = '#,##0';
        cr.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
        cr.getCell(10).font = {
          bold: true,
          color: { argb: isDeduction ? 'FFDC2626' : 'FF0F172A' },
        };
      }
      sheet.addRow([]); // Blank line
    }

    // -----------------------------------------------------------------------
    // Section 2: RINCIAN POTONGAN CUTI & PERIZINAN (Conditional)
    // -----------------------------------------------------------------------
    if (
      aggregation.leaveDeductionsList &&
      aggregation.leaveDeductionsList.length > 0
    ) {
      const leaveTitle = sheet.addRow(['RINCIAN POTONGAN CUTI & PERIZINAN']);
      leaveTitle.font = { bold: true, size: 9.5, color: { argb: 'FFDC2626' } };

      const lHead = sheet.addRow([
        'No',
        'Jenis Permohonan',
        '',
        'Rentang Tanggal Cuti',
        '',
        'Durasi',
        'Jam/Hari',
        'Tarif/Jam (Rp)',
        '',
        'Total Potongan (Rp)',
        '',
      ]);
      const lhIdx = lHead.number;
      sheet.mergeCells(`B${lhIdx}:C${lhIdx}`);
      sheet.mergeCells(`D${lhIdx}:E${lhIdx}`);
      sheet.mergeCells(`H${lhIdx}:I${lhIdx}`);
      sheet.mergeCells(`J${lhIdx}:K${lhIdx}`);
      lHead.height = 22;
      lHead.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      let lIdx = 1;
      for (const item of aggregation.leaveDeductionsList) {
        const lr = sheet.addRow([
          lIdx++,
          item.requestTypeLabel,
          '',
          item.dateRange,
          '',
          `${item.durationDays} Hari`,
          item.hoursPerDay,
          item.hourlyRate,
          '',
          item.totalDeduction,
          '',
        ]);
        const lrIdx = lr.number;
        sheet.mergeCells(`B${lrIdx}:C${lrIdx}`);
        sheet.mergeCells(`D${lrIdx}:E${lrIdx}`);
        sheet.mergeCells(`H${lrIdx}:I${lrIdx}`);
        sheet.mergeCells(`J${lrIdx}:K${lrIdx}`);
        lr.height = 20;
        lr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        lr.getCell(2).alignment = { vertical: 'middle' };
        lr.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
        lr.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
        lr.getCell(7).numFmt = '0.00';
        lr.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
        lr.getCell(8).numFmt = '#,##0';
        lr.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        lr.getCell(10).numFmt = '#,##0';
        lr.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
        lr.getCell(10).font = { bold: true, color: { argb: 'FFDC2626' } };
      }
      sheet.addRow([]); // Blank line
    }

    // -----------------------------------------------------------------------
    // Section 3: RINCIAN DINAS PENGGANTI & LEMBUR (Conditional)
    // -----------------------------------------------------------------------
    if (
      aggregation.overtimeAdditionsList &&
      aggregation.overtimeAdditionsList.length > 0
    ) {
      const otTitle = sheet.addRow(['RINCIAN DINAS PENGGANTI & LEMBUR']);
      otTitle.font = { bold: true, size: 9.5, color: { argb: 'FF1E3A8A' } };

      const otHead = sheet.addRow([
        'No',
        'Tanggal Dinas',
        'Hari',
        'Kategori Transaksi',
        '',
        '',
        '',
        'Jam Kerja',
        'Tarif Lembur (Rp)',
        'Total Upah (Rp)',
        '',
      ]);
      const othIdx = otHead.number;
      sheet.mergeCells(`D${othIdx}:G${othIdx}`);
      sheet.mergeCells(`J${othIdx}:K${othIdx}`);
      otHead.height = 22;
      otHead.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1E3A8A' },
        };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      let otIdx = 1;
      for (const item of aggregation.overtimeAdditionsList) {
        const otr = sheet.addRow([
          otIdx++,
          item.date,
          item.dayName,
          item.categoryLabel,
          '',
          '',
          '',
          item.hours,
          item.hourlyRate,
          item.totalAmount,
          '',
        ]);
        const otrIdx = otr.number;
        sheet.mergeCells(`D${otrIdx}:G${otrIdx}`);
        sheet.mergeCells(`J${otrIdx}:K${otrIdx}`);
        otr.height = 20;
        otr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        otr.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
        otr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        otr.getCell(4).alignment = { vertical: 'middle' };
        otr.getCell(8).numFmt = '0.00';
        otr.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
        otr.getCell(9).numFmt = '#,##0';
        otr.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
        otr.getCell(10).numFmt = '#,##0';
        otr.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
        otr.getCell(10).font = { bold: true, color: { argb: 'FF1E3A8A' } };
      }
      sheet.addRow([]); // Blank line
    }

    // -----------------------------------------------------------------------
    // Section 4: RINCIAN TRANSAKSI PENGGAJIAN HARIAN (11 Kolom)
    // -----------------------------------------------------------------------
    const transTitle = sheet.addRow(['RINCIAN TRANSAKSI PENGGAJIAN HARIAN']);
    transTitle.font = { bold: true, size: 9.5, color: { argb: 'FF1E3A8A' } };

    const headers = source.getHeaders(ctx.params);
    const headerRow = sheet.addRow(headers);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    let totalExported = 0;
    let rowIndex = 1;
    const startDataRow = headerRow.number + 1;

    for await (const batch of source.read(ctx.params, ctx.userId)) {
      if (await ctx.isCancelled()) {
        throw new Error('Export job cancelled by user');
      }

      for (const item of batch) {
        const values = source.formatRow(item, rowIndex++);
        const row = sheet.addRow(values);
        row.height = 20;

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

          if (colNumber === 1 || colNumber === 4 || colNumber === 5 || colNumber === 6) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          } else if (colNumber === 9) {
            cell.numFmt = '0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else if (colNumber === 10 || colNumber === 11) {
            cell.numFmt = '#,##0';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        });
      }

      totalExported += batch.length;
      await progress.advance(batch.length);
    }

    // Formula Total Row
    if (totalExported > 0) {
      const endDataRow = startDataRow + totalExported - 1;
      const totalRow = sheet.addRow([
        '',
        '',
        '',
        '',
        '',
        '',
        'TOTAL PENGGAJIAN',
        '',
        { formula: `SUM(I${startDataRow}:I${endDataRow})`, result: aggregation.totals.totalHours || 0 },
        '',
        { formula: `SUM(K${startDataRow}:K${endDataRow})`, result: aggregation.totals.grossEarnings || 0 },
      ]);
      totalRow.height = 24;
      totalRow.font = { bold: true, size: 10, color: { argb: 'FF1E3A8A' } };
      totalRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow.getCell(9).numFmt = '0.00';
      totalRow.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow.getCell(11).numFmt = '#,##0';
      totalRow.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
      totalRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFF6FF' },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1E3A8A' } },
          bottom: { style: 'double', color: { argb: 'FF1E3A8A' } },
        };
      });
    }

    sheet.addRow([]); // Blank spacer

    // -----------------------------------------------------------------------
    // Section 5: RINGKASAN GRAND TOTALS (Financial Summary)
    // -----------------------------------------------------------------------
    const gt1 = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Total Penghasilan Bruto:',
      '',
      '',
      aggregation.totals.grossEarnings,
    ]);
    const gt1Idx = gt1.number;
    sheet.mergeCells(`H${gt1Idx}:J${gt1Idx}`);
    gt1.font = { bold: true, size: 9.5, color: { argb: 'FF1E293B' } };
    gt1.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    gt1.getCell(11).numFmt = '#,##0';
    gt1.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };

    const gt2 = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Total Potongan Cuti:',
      '',
      '',
      aggregation.totals.totalDeductions,
    ]);
    const gt2Idx = gt2.number;
    sheet.mergeCells(`H${gt2Idx}:J${gt2Idx}`);
    gt2.font = { bold: true, size: 9.5, color: { argb: 'FFDC2626' } };
    gt2.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    gt2.getCell(11).numFmt = '#,##0';
    gt2.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };

    const gt3 = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Total Gaji Bersih:',
      '',
      '',
      aggregation.totals.netPayroll,
    ]);
    const gt3Idx = gt3.number;
    sheet.mergeCells(`H${gt3Idx}:J${gt3Idx}`);
    gt3.height = 24;
    gt3.font = { bold: true, size: 10.5, color: { argb: 'FF1E3A8A' } };
    gt3.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    gt3.getCell(8).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFF6FF' },
    };
    gt3.getCell(11).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFF6FF' },
    };
    gt3.getCell(8).border = {
      top: { style: 'thin', color: { argb: 'FF1E3A8A' } },
      bottom: { style: 'double', color: { argb: 'FF1E3A8A' } },
    };
    gt3.getCell(11).border = {
      top: { style: 'thin', color: { argb: 'FF1E3A8A' } },
      bottom: { style: 'double', color: { argb: 'FF1E3A8A' } },
    };
    gt3.getCell(11).numFmt = '#,##0';
    gt3.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };

    sheet.addRow([]); // Blank spacer
    sheet.addRow([]); // Blank spacer

    // -----------------------------------------------------------------------
    // Section 6: BLOK TANDA TANGAN & OTORISASI RESMI
    // -----------------------------------------------------------------------
    const signLocRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      `Sleman, ${printDate}`,
      '',
      '',
      '',
    ]);
    sheet.mergeCells(`H${signLocRow.number}:K${signLocRow.number}`);
    signLocRow.getCell(8).alignment = { horizontal: 'center' };
    signLocRow.getCell(8).font = { size: 9, color: { argb: 'FF334155' } };

    const signTitleRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Direktur Klinik Amanah Healthcare',
      '',
      '',
      '',
    ]);
    sheet.mergeCells(`H${signTitleRow.number}:K${signTitleRow.number}`);
    signTitleRow.getCell(8).alignment = { horizontal: 'center' };
    signTitleRow.getCell(8).font = { size: 9, bold: true, color: { argb: 'FF0F172A' } };

    // Space for signature
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([]);

    const signNameRow = sheet.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '( dr. H. Ahmad Zulfikar )',
      '',
      '',
      '',
    ]);
    sheet.mergeCells(`H${signNameRow.number}:K${signNameRow.number}`);
    signNameRow.getCell(8).alignment = { horizontal: 'center' };
    signNameRow.getCell(8).font = { size: 9.5, bold: true, color: { argb: 'FF0F172A' } };

    sheet.addRow([]);
    const disclaimerRow = sheet.addRow([
      '* Dokumen ini di-generate otomatis oleh Sistem Informasi Amanah Healthcare dan sah sebagai bukti rekapitulasi resmi.',
    ]);
    sheet.mergeCells(`A${disclaimerRow.number}:K${disclaimerRow.number}`);
    disclaimerRow.getCell(1).font = { size: 8, italic: true, color: { argb: 'FF94A3B8' } };

    return totalExported;
  }

  // =========================================================================
  // 2. ATTENDANCE & GENERIC UNIFIED SINGLE SHEET
  // =========================================================================
  private async renderGenericSingleSheet(
    workbook: ExcelJS.Workbook,
    source: ExportSource,
    ctx: ExportContext,
    progress: IProgressReporter,
  ): Promise<number> {
    const columnDefs = source.getColumnDefs ? source.getColumnDefs(ctx.params) : null;
    const headers = columnDefs ? columnDefs.map((c) => c.header) : source.getHeaders(ctx.params);

    const rawSheetTitle = source.getDetailsTitle
      ? await Promise.resolve(source.getDetailsTitle(ctx.params, ctx.userId))
      : 'Laporan Data';
    const sheetTitle = rawSheetTitle.replace(/[\\/*?:[\]]/g, '').slice(0, 31);

    const sheet = workbook.addWorksheet(sheetTitle, {
      views: [{ showGridLines: true }],
    });

    sheet.columns = headers.map((_, i) => {
      const colDef = columnDefs?.[i];
      let width = 20;
      if (typeof colDef?.width === 'number') {
        width = Math.max(8, Math.round(colDef.width / 4.5));
      } else if (i === 0) {
        width = 6;
      }
      return {
        key: `col_${i}`,
        width,
      };
    });

    const colCount = headers.length;

    // Logo Klinik
    try {
      const logoId = workbook.addImage({
        base64: CLINIC_LOGO_BASE64,
        extension: 'png',
      });
      sheet.addImage(logoId, {
        tl: { col: 0.15, row: 0.2 },
        ext: { width: 44, height: 44 },
      });
    } catch (e) {
      this.logger.warn(`Failed to embed clinic logo in XLSX: ${e}`);
    }

    // Row 1: Clinic Name
    const r1 = sheet.addRow([
      '',
      'KLINIK AMANAH HEALTHCARE',
      ...new Array(Math.max(0, colCount - 2)).fill(''),
    ]);
    sheet.mergeCells(1, 2, 1, Math.min(5, colCount));
    r1.getCell(2).font = { bold: true, size: 13, color: { argb: 'FF1E3A8A' } };

    // Row 2: Clinic Address
    const r2 = sheet.addRow([
      '',
      'Jl. Anyelir 1 No.243, Condongcatur, Depok, Sleman, D.I. Yogyakarta 55281',
      ...new Array(Math.max(0, colCount - 2)).fill(''),
    ]);
    sheet.mergeCells(2, 2, 2, Math.min(6, colCount));
    r2.getCell(2).font = { size: 8.5, color: { argb: 'FF475569' } };

    // Row 3: Spacer
    sheet.addRow([]);

    // Row 4: Separator Line
    const r4 = sheet.addRow([]);
    r4.height = 4;
    for (let c = 1; c <= colCount; c++) {
      r4.getCell(c).border = {
        bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
      };
    }

    // Row 5: Spacer
    sheet.addRow([]);

    // Row 6: Report Title (Centered)
    const title = (await Promise.resolve(source.getTitle(ctx.params, ctx.userId))).toUpperCase();
    const r6 = sheet.addRow([title, ...new Array(colCount - 1).fill('')]);
    sheet.mergeCells(6, 1, 6, colCount);
    r6.font = { bold: true, size: 11, color: { argb: 'FF0F172A' } };
    r6.alignment = { horizontal: 'center', vertical: 'middle' };

    // Row 7: Subtitle
    const subtitle = source.getSubtitle ? await Promise.resolve(source.getSubtitle(ctx.params, ctx.userId)) : '';
    if (subtitle) {
      const r7 = sheet.addRow([subtitle, ...new Array(colCount - 1).fill('')]);
      sheet.mergeCells(7, 1, 7, colCount);
      r7.font = { size: 9, color: { argb: 'FF64748B' } };
      r7.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    sheet.addRow([]); // Blank spacer

    // Header Table Row
    const headerRow = sheet.addRow(headers);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    let totalExported = 0;
    let rowIndex = 1;

    for await (const batch of source.read(ctx.params, ctx.userId)) {
      if (await ctx.isCancelled()) {
        throw new Error('Export job cancelled by user');
      }

      for (const item of batch) {
        const values = source.formatRow(item, rowIndex++);
        const row = sheet.addRow(values);
        row.height = 20;

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

          const colDef = columnDefs?.[colNumber - 1];
          if (colDef?.align) {
            cell.alignment = { vertical: 'middle', horizontal: colDef.align };
          } else if (colNumber === 1) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
          if (colDef?.format === 'currency' || colDef?.format === 'number') {
            cell.numFmt = '#,##0';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else if (colDef?.format === 'decimal') {
            cell.numFmt = '0.00';
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          }
        });
      }

      totalExported += batch.length;
      await progress.advance(batch.length);
    }

    sheet.addRow([]);
    const footerCountRow = sheet.addRow([
      `Total Data: ${totalExported} catatan`,
    ]);
    sheet.mergeCells(footerCountRow.number, 1, footerCountRow.number, colCount);
    footerCountRow.getCell(1).font = { size: 9, bold: true, color: { argb: 'FF475569' } };

    return totalExported;
  }
}
