import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import type { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  staffAttendanceRecords,
  staffLeaveRequests,
  staffProfiles,
} from '../../../../database/schema/amanah.schema';
import {
  payrollEntries,
  payrollPeriods,
} from '../../../../database/schema/leave-payroll.schema';
import { ExportColumnDef, ExportSource } from '../../domain/export-source.interface';
import {
  DailyMatrixItem,
  LeaveDeductionItem,
  OvertimeAdditionItem,
  PayrollReportAggregation,
  ReportSummaryItem,
  ReportTotals,
} from '../../domain/payroll-report.contract';

export const PAYROLL_COMPONENT_MAP: Record<string, string> = {
  attendance: 'Kehadiran',
  leave_request: 'Pengajuan Cuti',
  replacement_claim: 'Klaim Penggantian',
  roster: 'Jadwal Roster',
  manual: 'Penyesuaian Manual',
};

export const PAYROLL_ENTRY_TYPE_MAP: Record<string, string> = {
  base_scheduled: 'Upah Pelayanan',
  replacement_addition: 'Insentif Dinas Pengganti',
  overtime_addition: 'Upah Lembur',
  leave_deduction: 'Potongan Cuti',
};

export const LEAVE_REQUEST_TYPE_MAP: Record<string, string> = {
  annual_leave: 'Cuti Tahunan',
  sick_leave: 'Izin Sakit',
  maternity_leave: 'Cuti Melahirkan',
  unpaid_leave: 'Cuti di Luar Tanggungan',
  special_leave: 'Izin Khusus',
};

const ID_MONTH_NAMES = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const ID_DAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

@Injectable()
export class PayrollExportSource implements ExportSource {
  readonly type = 'payroll';

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  getTitle(_params: Record<string, any>): string {
    return 'Laporan Rekapitulasi Rincian Penggajian dan Insentif';
  }

  getSubtitle(params: Record<string, any>): string {
    return params.periodName ? `Periode: ${params.periodName}` : '';
  }

  getDetailsTitle(): string {
    return 'RINCIAN TRANSAKSI PENGGAJIAN HARIAN';
  }

  getColumnDefs(): ExportColumnDef[] {
    return [
      { header: 'No', width: 'auto', align: 'center' },
      { header: 'Kode Pegawai', width: 'auto', align: 'center' },
      { header: 'Nama Pegawai', width: '*', align: 'left' },
      { header: 'Tanggal', width: 'auto', align: 'center' },
      { header: 'Bulan', width: 'auto', align: 'center' },
      { header: 'Tahun', width: 'auto', align: 'center' },
      { header: 'Komponen Transaksi', width: 'auto', align: 'left' },
      { header: 'Jenis Transaksi', width: 'auto', align: 'left' },
      { header: 'Kuantitas (Jam)', width: 'auto', align: 'right', format: 'decimal' },
      { header: 'Tarif Satuan (Rp)', width: 'auto', align: 'right', format: 'currency' },
      { header: 'Total Nominal (Rp)', width: 'auto', align: 'right', format: 'currency' },
    ];
  }

  getHeaders(_params?: Record<string, any>): string[] {
    return this.getColumnDefs().map((c) => c.header);
  }

  private async resolveStaffProfileId(
    userId: string,
    explicitStaffId?: string,
  ): Promise<string | null> {
    if (explicitStaffId) return explicitStaffId;

    const [staff] = await this.db
      .select({ id: staffProfiles.id })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, userId))
      .limit(1);

    return staff?.id ?? null;
  }

  private async resolvePeriod(explicitPeriodId?: string): Promise<{
    id: string;
    periodName: string;
    periodStart: string;
    periodEnd: string;
    status: string;
  } | null> {
    if (explicitPeriodId) {
      const [period] = await this.db
        .select({
          id: payrollPeriods.id,
          periodName: payrollPeriods.periodName,
          periodStart: payrollPeriods.periodStart,
          periodEnd: payrollPeriods.periodEnd,
          status: payrollPeriods.status,
        })
        .from(payrollPeriods)
        .where(eq(payrollPeriods.id, explicitPeriodId))
        .limit(1);
      return period ?? null;
    }

    const [latest] = await this.db
      .select({
        id: payrollPeriods.id,
        periodName: payrollPeriods.periodName,
        periodStart: payrollPeriods.periodStart,
        periodEnd: payrollPeriods.periodEnd,
        status: payrollPeriods.status,
      })
      .from(payrollPeriods)
      .orderBy(desc(payrollPeriods.periodStart))
      .limit(1);

    return latest ?? null;
  }

  async count(params: Record<string, any>, userId: string): Promise<number> {
    const period = await this.resolvePeriod(params.periodId);
    if (!period) return 0;

    const staffId = await this.resolveStaffProfileId(
      userId,
      params.staffProfileId,
    );

    const conditions = [eq(payrollEntries.payrollPeriodId, period.id)];
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
    const period = await this.resolvePeriod(params.periodId);
    if (!period) return;

    const staffId = await this.resolveStaffProfileId(
      userId,
      params.staffProfileId,
    );

    let offset = 0;
    for (;;) {
      const conditions = [eq(payrollEntries.payrollPeriodId, period.id)];
      if (staffId) {
        conditions.push(eq(payrollEntries.staffProfileId, staffId));
      }

      const rows = await this.db
        .select({
          id: payrollEntries.id,
          staffCode: staffProfiles.staffCode,
          staffName: staffProfiles.fullName,
          periodName: payrollPeriods.periodName,
          periodStart: payrollPeriods.periodStart,
          periodEnd: payrollPeriods.periodEnd,
          sourceType: payrollEntries.sourceType,
          entryType: payrollEntries.entryType,
          quantityHours: payrollEntries.quantityHours,
          hourlyRate: payrollEntries.hourlyRate,
          amount: payrollEntries.amount,
          createdAt: payrollEntries.createdAt,
          attendanceDate: staffAttendanceRecords.attendanceDate,
        })
        .from(payrollEntries)
        .innerJoin(
          staffProfiles,
          eq(payrollEntries.staffProfileId, staffProfiles.id),
        )
        .innerJoin(
          payrollPeriods,
          eq(payrollEntries.payrollPeriodId, payrollPeriods.id),
        )
        .leftJoin(
          staffAttendanceRecords,
          eq(payrollEntries.sourceId, staffAttendanceRecords.id),
        )
        .where(and(...conditions))
        .orderBy(
          asc(staffProfiles.staffCode),
          asc(
            sql`COALESCE(${staffAttendanceRecords.attendanceDate}, ${payrollEntries.createdAt}::date)`,
          ),
          asc(payrollEntries.id),
        )
        .limit(batchSize)
        .offset(offset);

      if (rows.length === 0) return;

      const mappedRows = rows.map((r) => {
        const rawDate =
          r.attendanceDate ||
          (r.createdAt
            ? new Date(r.createdAt).toISOString().split('T')[0]
            : r.periodStart);
        const dateObj = new Date(`${rawDate}T00:00:00Z`);
        const monthNum = !isNaN(dateObj.getMonth())
          ? dateObj.getMonth() + 1
          : 10;
        const yearNum = !isNaN(dateObj.getFullYear())
          ? dateObj.getFullYear()
          : 2026;

        return {
          ...r,
          entryDate: rawDate,
          periodMonth: ID_MONTH_NAMES[monthNum] || 'Oktober',
          periodYear: yearNum,
        };
      });

      yield mappedRows;
      offset += rows.length;
    }
  }

  formatRow(row: any, index: number): (string | number | boolean | null)[] {
    const componentLabel =
      PAYROLL_COMPONENT_MAP[row.sourceType] ?? 'Kehadiran';
    const entryTypeLabel =
      PAYROLL_ENTRY_TYPE_MAP[row.entryType] ?? 'Upah Pelayanan';
    const dateStr = row.entryDate ?? '-';
    const monthStr = row.periodMonth ?? '-';
    const yearNum = row.periodYear ?? 2026;

    return [
      index,
      row.staffCode ?? '-',
      row.staffName ?? '-',
      dateStr,
      monthStr,
      yearNum,
      componentLabel,
      entryTypeLabel,
      Number(row.quantityHours ?? 0),
      Number(row.hourlyRate ?? 0),
      Number(row.amount ?? 0),
    ];
  }

  async getAggregation(
    params: Record<string, any>,
    userId: string,
  ): Promise<PayrollReportAggregation | null> {
    const period = await this.resolvePeriod(params.periodId);
    if (!period) return null;

    const staffId = await this.resolveStaffProfileId(
      userId,
      params.staffProfileId,
    );

    // Fetch primary staff info
    let targetStaff: any = null;
    if (staffId) {
      const [s] = await this.db
        .select({
          staffCode: staffProfiles.staffCode,
          fullName: staffProfiles.fullName,
          positionTitle: staffProfiles.positionTitle,
          departmentName: staffProfiles.departmentName,
        })
        .from(staffProfiles)
        .where(eq(staffProfiles.id, staffId))
        .limit(1);
      targetStaff = s;
    }

    // Fetch all entries for this period and staff
    const conditions = [eq(payrollEntries.payrollPeriodId, period.id)];
    if (staffId) {
      conditions.push(eq(payrollEntries.staffProfileId, staffId));
    }

    const entries = await this.db
      .select({
        id: payrollEntries.id,
        sourceId: payrollEntries.sourceId,
        staffCode: staffProfiles.staffCode,
        fullName: staffProfiles.fullName,
        positionTitle: staffProfiles.positionTitle,
        departmentName: staffProfiles.departmentName,
        sourceType: payrollEntries.sourceType,
        entryType: payrollEntries.entryType,
        quantityHours: payrollEntries.quantityHours,
        hourlyRate: payrollEntries.hourlyRate,
        amount: payrollEntries.amount,
        description: payrollEntries.description,
        createdAt: payrollEntries.createdAt,
        attendanceDate: staffAttendanceRecords.attendanceDate,
        isReplacement: staffAttendanceRecords.isReplacement,
        leaveRequestType: staffLeaveRequests.requestType,
        leaveStartDate: staffLeaveRequests.startDate,
        leaveEndDate: staffLeaveRequests.endDate,
        leaveDurationDays: staffLeaveRequests.durationDays,
        leaveReason: staffLeaveRequests.reason,
      })
      .from(payrollEntries)
      .innerJoin(
        staffProfiles,
        eq(payrollEntries.staffProfileId, staffProfiles.id),
      )
      .leftJoin(
        staffAttendanceRecords,
        eq(payrollEntries.sourceId, staffAttendanceRecords.id),
      )
      .leftJoin(
        staffLeaveRequests,
        eq(payrollEntries.sourceId, staffLeaveRequests.id),
      )
      .where(and(...conditions))
      .orderBy(
        asc(
          sql`COALESCE(${staffAttendanceRecords.attendanceDate}, ${payrollEntries.createdAt}::date)`,
        ),
      );

    if (!targetStaff && entries.length > 0) {
      targetStaff = {
        staffCode: entries[0].staffCode,
        fullName: entries[0].fullName,
        positionTitle: entries[0].positionTitle,
        departmentName: entries[0].departmentName,
      };
    }

    // 1. Grouping by component type
    const componentAggMap = new Map<
      string,
      {
        hours: number;
        amount: number;
        rateSum: number;
        count: number;
        category: 'earning' | 'deduction' | 'adjustment' | 'info';
        label: string;
      }
    >();

    // Seed standard canonical components with zero baseline (P6 & P7)
    componentAggMap.set('base_scheduled', {
      hours: 0,
      amount: 0,
      rateSum: 0,
      count: 0,
      category: 'earning',
      label: PAYROLL_ENTRY_TYPE_MAP.base_scheduled,
    });
    componentAggMap.set('replacement_addition', {
      hours: 0,
      amount: 0,
      rateSum: 0,
      count: 0,
      category: 'earning',
      label: PAYROLL_ENTRY_TYPE_MAP.replacement_addition,
    });
    componentAggMap.set('overtime_addition', {
      hours: 0,
      amount: 0,
      rateSum: 0,
      count: 0,
      category: 'earning',
      label: PAYROLL_ENTRY_TYPE_MAP.overtime_addition,
    });
    componentAggMap.set('leave_deduction', {
      hours: 0,
      amount: 0,
      rateSum: 0,
      count: 0,
      category: 'deduction',
      label: PAYROLL_ENTRY_TYPE_MAP.leave_deduction,
    });

    let totalGross = 0;
    let totalDeductions = 0;
    let totalHours = 0;

    // Daily matrix map
    const dailyMap = new Map<
      string,
      {
        shiftHours: number;
        replacementHours: number;
        leaveHours: number;
        amount: number;
      }
    >();

    const leaveDeductionsList: LeaveDeductionItem[] = [];
    const overtimeAdditionsList: OvertimeAdditionItem[] = [];

    for (const e of entries) {
      const amt = Number(e.amount || 0);
      const hrs = Number(e.quantityHours || 0);
      const rate = Number(e.hourlyRate || 0);

      const comp = componentAggMap.get(e.entryType);
      if (comp) {
        comp.hours += hrs;
        comp.amount += amt;
        comp.rateSum += rate;
        comp.count++;
      } else {
        const isDeduction = e.entryType.includes('deduction');
        componentAggMap.set(e.entryType, {
          hours: hrs,
          amount: amt,
          rateSum: rate,
          count: 1,
          category: isDeduction ? 'deduction' : 'earning',
          label: PAYROLL_ENTRY_TYPE_MAP[e.entryType] || e.entryType,
        });
      }

      if (e.entryType === 'leave_deduction') {
        totalDeductions += amt;

        // Populate transparent leave deduction item
        const durationDays = Number(e.leaveDurationDays) || 1;
        const totalDeduction = Math.round(amt);
        const dailyDeduction = Math.round(totalDeduction / Math.max(1, durationDays));
        const hoursPerDay = Number((hrs / Math.max(1, durationDays)).toFixed(2));

        let dateRange = '-';
        if (e.leaveStartDate) {
          const sObj = new Date(`${e.leaveStartDate}T00:00:00Z`);
          const sFormatted = `${sObj.getUTCDate()} ${ID_MONTH_NAMES[sObj.getUTCMonth() + 1]} ${sObj.getUTCFullYear()}`;
          if (e.leaveEndDate && e.leaveEndDate !== e.leaveStartDate) {
            const eObj = new Date(`${e.leaveEndDate}T00:00:00Z`);
            const eFormatted = `${eObj.getUTCDate()} ${ID_MONTH_NAMES[eObj.getUTCMonth() + 1]} ${eObj.getUTCFullYear()}`;
            dateRange = `${sFormatted} s/d ${eFormatted} (${durationDays} Hari)`;
          } else {
            dateRange = `${sFormatted} (${durationDays} Hari)`;
          }
        }

        const typeLabel = e.leaveRequestType
          ? LEAVE_REQUEST_TYPE_MAP[e.leaveRequestType] || e.leaveRequestType
          : 'Izin / Cuti';

        leaveDeductionsList.push({
          leaveRequestId: e.sourceId || e.id,
          requestTypeLabel: typeLabel,
          dateRange,
          durationDays,
          hoursPerDay,
          hourlyRate: Math.round(rate),
          dailyDeduction,
          totalDeduction,
          reason: e.leaveReason || 'Perizinan Dinas',
        });
      } else {
        totalGross += amt;
        totalHours += hrs;

        if (
          e.entryType === 'replacement_addition' ||
          e.entryType === 'overtime_addition'
        ) {
          const rawDate =
            e.attendanceDate ||
            (e.createdAt
              ? new Date(e.createdAt).toISOString().split('T')[0]
              : period.periodStart);
          const dateObj = new Date(`${rawDate}T00:00:00Z`);
          const dayName = ID_DAY_NAMES[dateObj.getUTCDay()] || '';
          const categoryLabel =
            e.entryType === 'replacement_addition'
              ? 'Dinas Pengganti'
              : 'Upah Lembur';

          overtimeAdditionsList.push({
            attendanceId: e.sourceId || e.id,
            categoryLabel,
            date: rawDate,
            dayName,
            hours: Number(hrs.toFixed(2)),
            hourlyRate: Math.round(rate),
            totalAmount: Math.round(amt),
            notes: e.description || undefined,
          });
        }
      }

      // Record daily breakdown
      const rawDate =
        e.attendanceDate ||
        (e.createdAt
          ? new Date(e.createdAt).toISOString().split('T')[0]
          : period.periodStart);
      const dayEntry = dailyMap.get(rawDate) || {
        shiftHours: 0,
        replacementHours: 0,
        leaveHours: 0,
        amount: 0,
      };

      if (e.entryType === 'base_scheduled') {
        dayEntry.shiftHours += hrs;
        dayEntry.amount += amt;
      } else if (
        e.entryType === 'replacement_addition' ||
        e.entryType === 'overtime_addition'
      ) {
        dayEntry.replacementHours += hrs;
        dayEntry.amount += amt;
      } else if (e.entryType === 'leave_deduction') {
        dayEntry.leaveHours += hrs;
        dayEntry.amount -= amt;
      }
      dailyMap.set(rawDate, dayEntry);
    }

    const netPayroll = totalGross - totalDeductions;

    // Convert component map to array
    const components: ReportSummaryItem[] = [];
    for (const [code, data] of componentAggMap.entries()) {
      const avgRate = data.count > 0 ? Math.round(data.rateSum / data.count) : 0;
      components.push({
        componentCode: code,
        componentLabel: data.label,
        category: data.category,
        quantityHours: Number(data.hours.toFixed(2)),
        rate: avgRate,
        amount: Math.round(data.amount),
      });
    }

    // Sort components: earnings first, deductions last
    components.sort((a, b) => {
      if (a.category === 'earning' && b.category === 'deduction') return -1;
      if (a.category === 'deduction' && b.category === 'earning') return 1;
      return 0;
    });

    // Build chronological daily matrix
    const dailyMatrix: DailyMatrixItem[] = [];
    const sortedDates = Array.from(dailyMap.keys()).sort();
    for (const d of sortedDates) {
      const val = dailyMap.get(d)!;
      const dateObj = new Date(`${d}T00:00:00Z`);
      const dayName = ID_DAY_NAMES[dateObj.getUTCDay()] || '';
      dailyMatrix.push({
        date: d,
        dayName,
        shiftHours: Number(val.shiftHours.toFixed(2)),
        replacementHours: Number(val.replacementHours.toFixed(2)),
        leaveHours: Number(val.leaveHours.toFixed(2)),
        totalAmount: Math.round(val.amount),
      });
    }

    const startObj = new Date(`${period.periodStart}T00:00:00Z`);
    const monthNum = !isNaN(startObj.getMonth()) ? startObj.getMonth() + 1 : 10;
    const yearNum = !isNaN(startObj.getFullYear())
      ? startObj.getFullYear()
      : 2026;
    const periodMonth = ID_MONTH_NAMES[monthNum] || 'Oktober';

    const totals: ReportTotals = {
      grossEarnings: Math.round(totalGross),
      totalDeductions: Math.round(totalDeductions),
      totalAdjustments: 0,
      netPayroll: Math.round(netPayroll),
      totalHours: Number(totalHours.toFixed(2)),
    };

    return {
      staffCode: targetStaff?.staffCode || '-',
      staffName: targetStaff?.fullName || 'Seluruh Staf / Dokter',
      positionTitle: targetStaff?.positionTitle || undefined,
      departmentName: targetStaff?.departmentName || undefined,
      periodName: period.periodName,
      periodMonth,
      periodYear: yearNum,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      components,
      totals,
      dailyMatrix,
      leaveDeductionsList,
      overtimeAdditionsList,
    };
  }
}
