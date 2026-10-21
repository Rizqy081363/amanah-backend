import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import { staffProfiles } from '../../../../database/schema/amanah.schema';
import { payrollEntries, payrollPeriods } from '../../../../database/schema/leave-payroll.schema';
import { ExportSource } from '../../domain/export-source.interface';

@Injectable()
export class PayrollExportSource implements ExportSource {
  readonly type = 'payroll';

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  getTitle(params: Record<string, any>): string {
    return 'Laporan Rekapitulasi Rincian Penggajian & Insentif';
  }

  getSubtitle(params: Record<string, any>): string {
    return params.periodName ? `Periode: ${params.periodName}` : 'Buku Besar Penggajian Terkalkulasi';
  }

  getHeaders(): string[] {
    return [
      'No',
      'Kode Staff',
      'Nama Pegawai',
      'Periode Penggajian',
      'Komponen Transaksi',
      'Tipe Transaksi',
      'Kuantitas (Jam)',
      'Tarif Satuan (Rp)',
      'Total Nominal (Rp)',
      'Keterangan',
    ];
  }

  private async resolveStaffProfileId(userId: string, explicitStaffId?: string): Promise<string | null> {
    if (explicitStaffId) return explicitStaffId;

    const [staff] = await this.db
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, userId))
      .limit(1);

    return staff?.id ?? null;
  }

  private async resolvePeriodId(explicitPeriodId?: string): Promise<string | null> {
    if (explicitPeriodId) return explicitPeriodId;

    const [latest] = await this.db
      .select({ id: payrollPeriods.id })
      .from(payrollPeriods)
      .orderBy(desc(payrollPeriods.periodStart))
      .limit(1);

    return latest?.id ?? null;
  }

  async count(params: Record<string, any>, userId: string): Promise<number> {
    const periodId = await this.resolvePeriodId(params.periodId);
    if (!periodId) return 0;

    const staffId = await this.resolveStaffProfileId(userId, params.staffProfileId);

    const conditions = [eq(payrollEntries.payrollPeriodId, periodId)];
    if (staffId) {
      conditions.push(eq(payrollEntries.staffProfileId, staffId));
    }

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(payrollEntries)
      .where(and(...conditions));

    return result?.count ?? 0;
  }

  async *read(
    params: Record<string, any>,
    userId: string,
    batchSize: number = 500,
  ): AsyncGenerator<any[]> {
    const periodId = await this.resolvePeriodId(params.periodId);
    if (!periodId) return;

    const staffId = await this.resolveStaffProfileId(userId, params.staffProfileId);

    let offset = 0;
    for (;;) {
      const conditions = [eq(payrollEntries.payrollPeriodId, periodId)];
      if (staffId) {
        conditions.push(eq(payrollEntries.staffProfileId, staffId));
      }

      const rows = await this.db
        .select({
          id: payrollEntries.id,
          staffCode: staffProfiles.staffCode,
          staffName: staffProfiles.fullName,
          periodName: payrollPeriods.periodName,
          sourceType: payrollEntries.sourceType,
          entryType: payrollEntries.entryType,
          quantityHours: payrollEntries.quantityHours,
          hourlyRate: payrollEntries.hourlyRate,
          amount: payrollEntries.amount,
          description: payrollEntries.description,
        })
        .from(payrollEntries)
        .innerJoin(staffProfiles, eq(payrollEntries.staffProfileId, staffProfiles.id))
        .innerJoin(payrollPeriods, eq(payrollEntries.payrollPeriodId, payrollPeriods.id))
        .where(and(...conditions))
        .orderBy(asc(staffProfiles.staffCode), asc(payrollEntries.id))
        .limit(batchSize)
        .offset(offset);

      if (rows.length === 0) return;
      yield rows;
      offset += rows.length;
    }
  }

  formatRow(row: any, index: number): (string | number | boolean | null)[] {
    return [
      index,
      row.staffCode ?? '-',
      row.staffName ?? '-',
      row.periodName ?? '-',
      row.sourceType ?? '-',
      row.entryType ?? '-',
      Number(row.quantityHours ?? 0),
      Number(row.hourlyRate ?? 0),
      Number(row.amount ?? 0),
      row.description ?? '-',
    ];
  }
}
