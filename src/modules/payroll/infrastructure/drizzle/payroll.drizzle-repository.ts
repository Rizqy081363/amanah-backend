import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  doctorAssignments,
  practitioners,
  sessionDefs,
  staffAttendanceRecords,
  staffLeaveRequests,
  staffProfiles,
  staffRosters,
} from '../../../../database/schema';
import {
  compensationRates,
  payrollEntries,
  payrollPeriods,
} from '../../../../database/schema/leave-payroll.schema';
import { calculateSessionNetHours } from '../../../schedules/domain/services/shift-duration.helper';
import { PAYROLL_PERIOD_STATUS } from '../../domain/constants/payroll.constants';
import { PayrollEntryEntity } from '../../domain/entities/payroll-entry.entity';
import { PayrollPeriodEntity } from '../../domain/entities/payroll-period.entity';
import {
  MonthlyPayrollGroup,
  PayrollFilterOptions,
  PayrollRepository,
  PayrollSummary,
  RecordAttendanceShiftInput,
} from '../../domain/repositories/payroll.repository';

function formatHours(h: number): string {
  return h % 1 === 0 ? `${h} jam` : `${Number(h.toFixed(1))} jam`;
}

@Injectable()
export class PayrollDrizzleRepository implements PayrollRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfigService?: ClinicConfigService,
  ) {}

  private mapPeriod(r: any): PayrollPeriodEntity {
    return {
      id: r.id,
      periodName: r.periodName,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      status: r.status,
      totalPayout: Number(r.totalPayout),
      calculatedAt: r.calculatedAt ? new Date(r.calculatedAt) : null,
      calculatedBy: r.calculatedBy || null,
      ruleVersion: r.ruleVersion || null,
      notes: r.notes || null,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    };
  }

  private mapEntry(
    r: any,
    attRecord?: {
      checkInAt?: string | null;
      checkOutAt?: string | null;
      isEarlyDeparture?: boolean;
      notes?: string | null;
    },
  ): PayrollEntryEntity {
    return {
      id: r.id,
      payrollPeriodId: r.payrollPeriodId,
      staffProfileId: r.staffProfileId,
      practitionerId: r.practitionerId || null,
      entryType: r.entryType,
      sourceType: r.sourceType,
      sourceId: r.sourceId || null,
      quantityHours: Number(r.quantityHours),
      hourlyRate: Number(r.hourlyRate),
      amount: Number(r.amount),
      description: r.description || null,
      checkInAt: attRecord?.checkInAt ? String(attRecord.checkInAt) : null,
      checkOutAt: attRecord?.checkOutAt ? String(attRecord.checkOutAt) : null,
      isEarlyDeparture: Boolean(attRecord?.isEarlyDeparture),
      notes: attRecord?.notes || null,
      createdAt: new Date(r.createdAt),
    };
  }

  private async getAttendanceRecordsMap(
    sourceIds: (string | null | undefined)[],
  ): Promise<
    Map<
      string,
      {
        checkInAt: string | null;
        checkOutAt: string | null;
        isEarlyDeparture: boolean;
        notes: string | null;
      }
    >
  > {
    const validIds = Array.from(
      new Set(sourceIds.filter((id): id is string => Boolean(id))),
    );
    const map = new Map<
      string,
      {
        checkInAt: string | null;
        checkOutAt: string | null;
        isEarlyDeparture: boolean;
        notes: string | null;
      }
    >();
    if (validIds.length === 0) return map;

    const records = await this.db
      .select({
        id: staffAttendanceRecords.id,
        checkInAt: staffAttendanceRecords.checkInAt,
        checkOutAt: staffAttendanceRecords.checkOutAt,
        isEarlyDeparture: staffAttendanceRecords.isEarlyDeparture,
        notes: staffAttendanceRecords.notes,
      })
      .from(staffAttendanceRecords)
      .where(inArray(staffAttendanceRecords.id, validIds));

    for (const r of records) {
      map.set(r.id, r);
    }
    return map;
  }

  async findPeriods(): Promise<PayrollPeriodEntity[]> {
    const records = await this.db
      .select()
      .from(payrollPeriods)
      .orderBy(desc(payrollPeriods.periodStart));

    return records.map((r) => this.mapPeriod(r));
  }

  async findPeriodById(id: string): Promise<PayrollPeriodEntity | null> {
    const [period] = await this.db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.id, id))
      .limit(1);

    return period ? this.mapPeriod(period) : null;
  }

  async findPeriodWithSummaries(id: string): Promise<{
    period: PayrollPeriodEntity;
    summaries: PayrollSummary[];
  } | null> {
    const [period] = await this.db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.id, id))
      .limit(1);

    if (!period) return null;

    const entries = await this.db
      .select()
      .from(payrollEntries)
      .where(eq(payrollEntries.payrollPeriodId, id));

    const attIds = entries
      .filter((e) => e.sourceType === 'attendance' && e.sourceId)
      .map((e) => e.sourceId);
    const attMap = await this.getAttendanceRecordsMap(attIds);

    const staffList = await this.db.query.staffProfiles.findMany({
      with: {
        practitioners: true,
      },
    });
    const staffMap = new Map(staffList.map((s) => [s.id, s]));

    const entriesByStaff = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = entriesByStaff.get(entry.staffProfileId) || [];
      list.push(entry);
      entriesByStaff.set(entry.staffProfileId, list);
    }

    const summaries: PayrollSummary[] = [];
    const locale = this.clinicConfigService
      ? await this.clinicConfigService.getLocale().catch(() => 'id-ID')
      : 'id-ID';
    const monthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const monthLabel = period.periodStart
      ? monthFormatter.format(new Date(`${period.periodStart}T00:00:00Z`))
      : undefined;

    for (const [staffId, staffEntries] of entriesByStaff.entries()) {
      const staff = staffMap.get(staffId);
      if (!staff) continue;

      let baseEarnings = 0;
      let baseHours = 0;
      let deductionHours = 0;
      let additionHours = 0;
      let leaveDeductions = 0;
      let replacementAdditions = 0;

      for (const e of staffEntries) {
        const amt = Number(e.amount);
        const hrs = Number(e.quantityHours);
        if (e.entryType === 'base_scheduled') {
          baseEarnings += amt;
          baseHours += hrs;
        } else if (e.entryType === 'leave_deduction') {
          leaveDeductions += amt;
          deductionHours += hrs;
        } else if (
          e.entryType === 'replacement_addition' ||
          e.entryType === 'overtime_addition'
        ) {
          replacementAdditions += amt;
          additionHours += hrs;
        }
      }

      const grossEarnings = baseEarnings + replacementAdditions;
      const netPayroll = grossEarnings - leaveDeductions;

      summaries.push({
        staffId: staff.id,
        staffCode: staff.staffCode || undefined,
        fullName: staff.fullName,
        avatarUrl: staff.avatarUrl || null,
        staffType: staff.staffType,
        positionTitle: staff.positionTitle || undefined,
        departmentName: staff.departmentName || undefined,
        practitionerId: staff.practitioners?.[0]?.id || null,
        periodId: period.id,
        periodName: period.periodName,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        periodStatus: period.status,
        monthLabel,
        calculatedAt: period.calculatedAt
          ? new Date(period.calculatedAt)
          : null,
        baseHours,
        deductionHours: Number(deductionHours.toFixed(2)),
        additionHours: Number(additionHours.toFixed(2)),
        baseEarnings,
        grossEarnings,
        leaveDeductions,
        replacementAdditions,
        netPayroll,
        entries: staffEntries.map((e) =>
          this.mapEntry(e, e.sourceId ? attMap.get(e.sourceId) : undefined),
        ),
      });
    }

    return {
      period: this.mapPeriod(period),
      summaries,
    };
  }

  async calculatePeriod(
    periodStart: string,
    periodEnd: string,
    periodName: string,
    calculatedBy: string,
  ): Promise<{
    period: PayrollPeriodEntity;
    summaries: PayrollSummary[];
  }> {
    // 1. Fetch active compensation rates
    const rates = await this.db
      .select()
      .from(compensationRates)
      .where(eq(compensationRates.isActive, true));

    const rateMap = new Map<string, { hourly: number; overtime: number }>();
    for (const r of rates) {
      rateMap.set(r.category, {
        hourly: Number(r.hourlyRate),
        overtime: Number(r.overtimeHourlyRate),
      });
    }

    // 2. Create or find payroll_period record
    const [existingPeriod] = await this.db
      .select()
      .from(payrollPeriods)
      .where(
        and(
          eq(payrollPeriods.periodStart, periodStart),
          eq(payrollPeriods.periodEnd, periodEnd),
        ),
      )
      .limit(1);

    let periodId = existingPeriod?.id;
    if (existingPeriod) {
      if (existingPeriod.status === PAYROLL_PERIOD_STATUS.FINALIZED) {
        throw new BadRequestException(
          'Periode penggajian ini sudah DITUTUP BUKU (FINALIZED) dan terkunci permanen. Nilai historis tidak dapat dihitung ulang.',
        );
      }
      // Clear old entries for recalculation
      await this.db
        .delete(payrollEntries)
        .where(eq(payrollEntries.payrollPeriodId, periodId));
    } else {
      const [newPeriod] = await this.db
        .insert(payrollPeriods)
        .values({
          periodName,
          periodStart,
          periodEnd,
          status: PAYROLL_PERIOD_STATUS.CALCULATED,
          calculatedBy: calculatedBy || null,
          calculatedAt: new Date().toISOString(),
        })
        .returning();
      periodId = newPeriod.id;
    }

    // 3. Fetch active staff, roster break config, and master session definitions
    const [activeStaff, breakConfig, allSessionDefs] = await Promise.all([
      this.db.query.staffProfiles.findMany({
        where: eq(staffProfiles.status, 'active'),
        with: {
          practitioners: true,
        },
      }),
      this.clinicConfigService
        ? this.clinicConfigService.getRosterBreakConfig()
        : Promise.resolve({ breakDurationMinutes: 30, isBreakPaid: false }),
      this.db.select().from(sessionDefs),
    ]);

    // Build session duration cache (gross hours minus break)
    const sessionNetMap = new Map<string, number>();
    for (const sd of allSessionDefs) {
      const net = calculateSessionNetHours({
        startsAt: sd.defaultStartsAt,
        endsAt: sd.defaultEndsAt,
        breakMinutes: breakConfig.breakDurationMinutes,
        isBreakPaid: breakConfig.isBreakPaid,
      });
      sessionNetMap.set(sd.id, net);
    }
    const defaultShiftNet = sessionNetMap.get(allSessionDefs[0]?.id) ?? 5.5;
    const getSessionNet = (sessionId?: string | null): number => {
      if (!sessionId) return defaultShiftNet;
      return sessionNetMap.get(sessionId) ?? defaultShiftNet;
    };

    const summaries: PayrollSummary[] = [];
    let totalClinicPayout = 0;

    // Estimate days in period (e.g. 30 days = ~4.3 weeks)
    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    const dayDiff = Math.max(
      1,
      Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1,
    );
    const weeksInPeriod = Math.max(1, dayDiff / 7);

    const locale = this.clinicConfigService
      ? await this.clinicConfigService.getLocale().catch(() => 'id-ID')
      : 'id-ID';
    const monthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const calculatedMonthLabel = monthFormatter.format(
      new Date(`${periodStart}T00:00:00Z`),
    );

    for (const staff of activeStaff) {
      const staffType = (staff.staffType || 'worker').toLowerCase();
      const rates = rateMap.get(staffType) ?? { hourly: 0, overtime: 0 };

      const practitionerId = staff.practitioners?.[0]?.id || null;
      const entriesToInsert: any[] = [];

      // A. Populate atomic shift attendance records for this period
      const attendances = await this.db
        .select()
        .from(staffAttendanceRecords)
        .where(
          and(
            eq(staffAttendanceRecords.staffProfileId, staff.id),
            gte(staffAttendanceRecords.attendanceDate, periodStart),
            lte(staffAttendanceRecords.attendanceDate, periodEnd),
          ),
        );

      for (const att of attendances) {
        const validatedHours = Number(att.validatedDurationHours) || 0;
        if (!att.isReplacement && validatedHours > 0) {
          const shiftEarnings = validatedHours * rates.hourly;
          entriesToInsert.push({
            payrollPeriodId: periodId,
            staffProfileId: staff.id,
            practitionerId,
            entryType: 'base_scheduled',
            sourceType: 'attendance',
            sourceId: att.id,
            quantityHours: validatedHours.toFixed(2),
            hourlyRate: rates.hourly.toString(),
            amount: shiftEarnings.toFixed(2),
            description: `Pelayanan Klinis Terjadwal (${formatHours(validatedHours)} jam @ Rp${rates.hourly.toLocaleString('id-ID')}/jam)`,
          });
        }
      }

      // B. Calculate Approved Leave Deductions (1 shift net per leave day)
      const leaves = await this.db
        .select()
        .from(staffLeaveRequests)
        .where(
          and(
            eq(staffLeaveRequests.staffProfileId, staff.id),
            eq(staffLeaveRequests.status, 'approved'),
            gte(staffLeaveRequests.startDate, periodStart),
            lte(staffLeaveRequests.endDate, periodEnd),
          ),
        );

      for (const l of leaves) {
        const leaveDays = l.durationDays || 1;
        const deductionHours = Number((leaveDays * defaultShiftNet).toFixed(2));
        const deductionAmount = deductionHours * rates.hourly;
        entriesToInsert.push({
          payrollPeriodId: periodId,
          staffProfileId: staff.id,
          practitionerId,
          entryType: 'leave_deduction',
          sourceType: 'leave_request',
          sourceId: l.id,
          quantityHours: deductionHours.toFixed(2),
          hourlyRate: rates.hourly.toString(),
          amount: deductionAmount.toFixed(2),
          description: `Gaji di potong - Izin/cuti (${formatHours(deductionHours)})`,
        });
      }

      // B.2 Calculate Early Departure Attendance Deductions
      const earlyDepartures = attendances.filter(
        (a) => !a.isReplacement && a.isEarlyDeparture,
      );
      for (const ed of earlyDepartures) {
        const validated = Number(ed.validatedDurationHours) || 0;
        const expectedHours = getSessionNet(ed.sessionId);
        const deficit = Math.max(0, expectedHours - validated);
        if (deficit > 0) {
          const deductionAmount = deficit * rates.hourly;
          entriesToInsert.push({
            payrollPeriodId: periodId,
            staffProfileId: staff.id,
            practitionerId,
            entryType: 'leave_deduction',
            sourceType: 'attendance',
            sourceId: ed.id,
            quantityHours: deficit.toFixed(2),
            hourlyRate: rates.hourly.toString(),
            amount: deductionAmount.toFixed(2),
            description: `Gaji di potong - Pulang lebih awal (${formatHours(deficit)})`,
          });
        }
      }

      // C. Calculate Replacement / Overtime Additions
      const replacements = attendances.filter((a) => a.isReplacement);
      for (const rep of replacements) {
        const repHours =
          Number(rep.validatedDurationHours) || getSessionNet(rep.sessionId);
        if (repHours > 0) {
          const repAmount = repHours * rates.overtime;
          entriesToInsert.push({
            payrollPeriodId: periodId,
            staffProfileId: staff.id,
            practitionerId,
            entryType: 'replacement_addition',
            sourceType: 'attendance',
            sourceId: rep.id,
            quantityHours: repHours.toFixed(2),
            hourlyRate: rates.overtime.toString(),
            amount: repAmount.toFixed(2),
            description: `Upah pengganti - Dinas pengganti/lembur (${formatHours(repHours)} x Rp ${rates.overtime.toLocaleString('id-ID')})`,
          });
        }
      }

      // Insert all atomic entries for this staff in this period
      let insertedEntries: any[] = [];
      if (entriesToInsert.length > 0) {
        insertedEntries = await this.db
          .insert(payrollEntries)
          .values(entriesToInsert)
          .returning();
      }

      let baseHours = 0;
      let baseEarnings = 0;
      let deductionHours = 0;
      let leaveDeductions = 0;
      let additionHours = 0;
      let replacementAdditions = 0;

      for (const e of insertedEntries) {
        const amt = Number(e.amount);
        const hrs = Number(e.quantityHours);
        if (e.entryType === 'base_scheduled') {
          baseEarnings += amt;
          baseHours += hrs;
        } else if (e.entryType === 'leave_deduction') {
          leaveDeductions += amt;
          deductionHours += hrs;
        } else if (
          e.entryType === 'replacement_addition' ||
          e.entryType === 'overtime_addition'
        ) {
          replacementAdditions += amt;
          additionHours += hrs;
        }
      }

      const grossEarnings = baseEarnings + replacementAdditions;
      const netPayroll = grossEarnings - leaveDeductions;
      totalClinicPayout += netPayroll;

      const attMap = new Map<string, any>(attendances.map((a) => [a.id, a]));

      summaries.push({
        staffId: staff.id,
        staffCode: staff.staffCode || undefined,
        fullName: staff.fullName,
        avatarUrl: staff.avatarUrl || null,
        staffType: staff.staffType,
        positionTitle: staff.positionTitle || undefined,
        departmentName: staff.departmentName || undefined,
        practitionerId,
        periodId,
        periodName,
        periodStart,
        periodEnd,
        periodStatus: PAYROLL_PERIOD_STATUS.CALCULATED,
        monthLabel: calculatedMonthLabel,
        calculatedAt: new Date(),
        baseHours: Number(baseHours.toFixed(2)),
        deductionHours: Number(deductionHours.toFixed(2)),
        additionHours: Number(additionHours.toFixed(2)),
        baseEarnings,
        grossEarnings,
        leaveDeductions,
        replacementAdditions,
        netPayroll,
        entries: insertedEntries.map((e) =>
          this.mapEntry(e, e.sourceId ? attMap.get(e.sourceId) : undefined),
        ),
      });
    }

    // 4. Update total payout on payroll_periods
    const [finalPeriod] = await this.db
      .update(payrollPeriods)
      .set({
        totalPayout: totalClinicPayout.toString(),
        calculatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(payrollPeriods.id, periodId))
      .returning();

    return {
      period: this.mapPeriod(finalPeriod),
      summaries,
    };
  }

  async getStaffPayroll(
    staffId: string,
    periodId?: string,
  ): Promise<PayrollSummary | null> {
    const [staff] = await this.db.query.staffProfiles.findMany({
      where: eq(staffProfiles.id, staffId),
      with: {
        practitioners: true,
      },
      limit: 1,
    });

    if (!staff) return null;

    let targetPeriodId = periodId;
    let targetPeriod: any = null;
    if (!targetPeriodId) {
      const [latestPeriod] = await this.db
        .select()
        .from(payrollPeriods)
        .orderBy(desc(payrollPeriods.periodStart))
        .limit(1);

      if (!latestPeriod) return null;
      targetPeriodId = latestPeriod.id;
      targetPeriod = latestPeriod;
    } else {
      const [p] = await this.db
        .select()
        .from(payrollPeriods)
        .where(eq(payrollPeriods.id, targetPeriodId))
        .limit(1);
      targetPeriod = p;
    }

    const entries = await this.db
      .select()
      .from(payrollEntries)
      .where(
        and(
          eq(payrollEntries.payrollPeriodId, targetPeriodId),
          eq(payrollEntries.staffProfileId, staffId),
        ),
      )
      .orderBy(desc(payrollEntries.createdAt));

    const attIds = entries
      .filter((e) => e.sourceType === 'attendance' && e.sourceId)
      .map((e) => e.sourceId);
    const attMap = await this.getAttendanceRecordsMap(attIds);

    let baseEarnings = 0;
    let baseHours = 0;
    let deductionHours = 0;
    let additionHours = 0;
    let leaveDeductions = 0;
    let replacementAdditions = 0;

    for (const e of entries) {
      const amt = Number(e.amount);
      const hrs = Number(e.quantityHours);
      if (e.entryType === 'base_scheduled') {
        baseEarnings += amt;
        baseHours += hrs;
      } else if (e.entryType === 'leave_deduction') {
        leaveDeductions += amt;
        deductionHours += hrs;
      } else if (
        e.entryType === 'replacement_addition' ||
        e.entryType === 'overtime_addition'
      ) {
        replacementAdditions += amt;
        additionHours += hrs;
      }
    }

    const grossEarnings = baseEarnings + replacementAdditions;
    const netPayroll = grossEarnings - leaveDeductions;

    const locale = this.clinicConfigService
      ? await this.clinicConfigService.getLocale().catch(() => 'id-ID')
      : 'id-ID';

    const monthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const monthLabel = targetPeriod?.periodStart
      ? monthFormatter.format(new Date(`${targetPeriod.periodStart}T00:00:00Z`))
      : undefined;

    return {
      staffId: staff.id,
      staffCode: staff.staffCode || undefined,
      fullName: staff.fullName,
      avatarUrl: staff.avatarUrl || null,
      staffType: staff.staffType,
      positionTitle: staff.positionTitle || undefined,
      departmentName: staff.departmentName || undefined,
      practitionerId: staff.practitioners?.[0]?.id || null,
      periodId: targetPeriod?.id,
      periodName: targetPeriod?.periodName,
      periodStart: targetPeriod?.periodStart,
      periodEnd: targetPeriod?.periodEnd,
      periodStatus: targetPeriod?.status,
      monthLabel,
      calculatedAt: targetPeriod?.calculatedAt
        ? new Date(targetPeriod.calculatedAt)
        : null,
      baseHours,
      deductionHours: Number(deductionHours.toFixed(2)),
      additionHours: Number(additionHours.toFixed(2)),
      baseEarnings,
      grossEarnings,
      leaveDeductions,
      replacementAdditions,
      netPayroll,
      entries: entries.map((e) =>
        this.mapEntry(e, e.sourceId ? attMap.get(e.sourceId) : undefined),
      ),
    };
  }

  async getStaffPayrollHistory(
    staffId: string,
  ): Promise<MonthlyPayrollGroup[]> {
    const periods = await this.db
      .select()
      .from(payrollPeriods)
      .orderBy(desc(payrollPeriods.periodStart));

    const locale = this.clinicConfigService
      ? await this.clinicConfigService.getLocale().catch(() => 'id-ID')
      : 'id-ID';

    const monthFormatter = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    const result: MonthlyPayrollGroup[] = [];

    for (const period of periods) {
      const entries = await this.db
        .select()
        .from(payrollEntries)
        .where(
          and(
            eq(payrollEntries.payrollPeriodId, period.id),
            eq(payrollEntries.staffProfileId, staffId),
          ),
        )
        .orderBy(desc(payrollEntries.createdAt));

      const attIds = entries
        .filter((e) => e.sourceType === 'attendance' && e.sourceId)
        .map((e) => e.sourceId);
      const attMap = await this.getAttendanceRecordsMap(attIds);

      let baseEarnings = 0;
      let additionEarnings = 0;
      let leaveDeductions = 0;
      let totalHours = 0;

      for (const e of entries) {
        const amt = Number(e.amount);
        const hrs = Number(e.quantityHours);
        if (e.entryType === 'base_scheduled') {
          baseEarnings += amt;
          totalHours += hrs;
        } else if (e.entryType === 'leave_deduction') {
          leaveDeductions += amt;
        } else if (
          e.entryType === 'replacement_addition' ||
          e.entryType === 'overtime_addition'
        ) {
          additionEarnings += amt;
          totalHours += hrs;
        }
      }

      const totalGross = baseEarnings + additionEarnings;
      const totalNet = totalGross - leaveDeductions;

      // Hanya sertakan periode yang memiliki catatan penggajian untuk staf ini
      if (entries.length === 0 && totalGross === 0 && totalNet === 0) {
        continue;
      }

      const dateObj = new Date(`${period.periodStart}T00:00:00Z`);
      const monthLabel = monthFormatter.format(dateObj);

      result.push({
        periodId: period.id,
        periodName: period.periodName,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        periodStatus: period.status,
        monthLabel,
        totalNet,
        totalGross,
        totalDeductions: leaveDeductions,
        totalHours: Number(totalHours.toFixed(2)),
        entries: entries.map((e) =>
          this.mapEntry(e, e.sourceId ? attMap.get(e.sourceId) : undefined),
        ),
      });
    }

    return result;
  }

  async finalizePeriod(
    id: string,
    finalizedBy: string,
  ): Promise<PayrollPeriodEntity> {
    const [period] = await this.db
      .select()
      .from(payrollPeriods)
      .where(eq(payrollPeriods.id, id))
      .limit(1);

    if (!period) {
      throw new NotFoundException(
        `Periode payroll dengan ID ${id} tidak ditemukan`,
      );
    }

    if (period.status === PAYROLL_PERIOD_STATUS.FINALIZED) {
      return this.mapPeriod(period);
    }

    const [updated] = await this.db
      .update(payrollPeriods)
      .set({
        status: PAYROLL_PERIOD_STATUS.FINALIZED,
        notes: period.notes
          ? `${period.notes} [Ditutup buku oleh ${finalizedBy}]`
          : `Ditutup buku oleh ${finalizedBy}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(payrollPeriods.id, id))
      .returning();

    return this.mapPeriod(updated);
  }

  async recordAttendanceShift(
    input: RecordAttendanceShiftInput,
  ): Promise<PayrollEntryEntity> {
    // 1. Locate open active payroll period that covers input.attendanceDate
    let [activePeriod] = await this.db
      .select()
      .from(payrollPeriods)
      .where(
        and(
          lte(payrollPeriods.periodStart, input.attendanceDate),
          gte(payrollPeriods.periodEnd, input.attendanceDate),
          ne(payrollPeriods.status, PAYROLL_PERIOD_STATUS.FINALIZED),
        ),
      )
      .limit(1);

    // If no exact date match, look for latest non-finalized period
    if (!activePeriod) {
      const [latestOpen] = await this.db
        .select()
        .from(payrollPeriods)
        .where(ne(payrollPeriods.status, PAYROLL_PERIOD_STATUS.FINALIZED))
        .orderBy(desc(payrollPeriods.periodStart))
        .limit(1);
      activePeriod = latestOpen;
    }

    // If still no open period, create an active period for the month
    if (!activePeriod) {
      const dateObj = new Date(input.attendanceDate);
      const year = dateObj.getFullYear();
      const month = dateObj.getMonth();
      const locale = this.clinicConfigService
        ? await this.clinicConfigService.getLocale().catch(() => 'id-ID')
        : 'id-ID';
      const monthName = new Intl.DateTimeFormat(locale, {
        month: 'long',
      }).format(dateObj);
      const startOfMonth = new Date(year, month, 1).toISOString().split('T')[0];
      const endOfMonth = new Date(year, month + 1, 0)
        .toISOString()
        .split('T')[0];
      const periodName = `Payroll Periode ${monthName} ${year}`;

      const [created] = await this.db
        .insert(payrollPeriods)
        .values({
          periodStart: startOfMonth,
          periodEnd: endOfMonth,
          periodName,
          status: PAYROLL_PERIOD_STATUS.CALCULATED,
          calculatedAt: new Date().toISOString(),
          notes: 'Periode aktif dibuat otomatis oleh sistem presensi',
        })
        .returning();
      activePeriod = created;
    }

    // 2. Fetch staff profile & active compensation rate
    const [staff] = await this.db
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.id, input.staffProfileId))
      .limit(1);

    const staffType = staff?.staffType?.toLowerCase() || 'worker';
    const rates = await this.db
      .select()
      .from(compensationRates)
      .where(eq(compensationRates.isActive, true));

    const rateRow = rates.find((r) => r.category.toLowerCase() === staffType);
    const standardHourlyRate = Number(rateRow?.hourlyRate ?? 0);
    const overtimeHourlyRate = Number(rateRow?.overtimeHourlyRate ?? 0);

    const isReplacement = Boolean(input.isReplacement);
    const effectiveHourlyRate = isReplacement
      ? overtimeHourlyRate
      : standardHourlyRate;

    const entryType = isReplacement ? 'replacement_addition' : 'base_scheduled';

    const validatedHours = Number(input.validatedDurationHours || 0);
    const amount = Number((validatedHours * effectiveHourlyRate).toFixed(2));
    const description = isReplacement
      ? `Pelayanan Dinas Pengganti (${formatHours(validatedHours)} jam @ Rp${effectiveHourlyRate.toLocaleString('id-ID')}/jam)`
      : `Pelayanan Klinis Terjadwal (${formatHours(validatedHours)} jam @ Rp${standardHourlyRate.toLocaleString('id-ID')}/jam)`;

    // 3. Delete existing entry for this attendance record (idempotency)
    await this.db
      .delete(payrollEntries)
      .where(
        and(
          eq(payrollEntries.sourceType, 'attendance'),
          eq(payrollEntries.sourceId, input.attendanceRecordId),
        ),
      );

    // 4. Insert shift earnings entry (Zero double-penalty: Early checkout paid strictly pro-rata for actual hours worked)
    const [insertedEntry] = await this.db
      .insert(payrollEntries)
      .values({
        payrollPeriodId: activePeriod.id,
        staffProfileId: input.staffProfileId,
        practitionerId: input.practitionerId || null,
        entryType,
        sourceType: 'attendance',
        sourceId: input.attendanceRecordId,
        quantityHours: validatedHours.toFixed(2),
        hourlyRate: effectiveHourlyRate.toFixed(2),
        amount: amount.toFixed(2),
        description,
      })
      .returning();

    const attMap = await this.getAttendanceRecordsMap([
      input.attendanceRecordId,
    ]);
    return this.mapEntry(insertedEntry, attMap.get(input.attendanceRecordId));
  }

  async getPayrollFilterOptions(): Promise<PayrollFilterOptions> {
    const periods = await this.db
      .select({
        id: payrollPeriods.id,
        name: payrollPeriods.periodName,
        status: payrollPeriods.status,
        periodStart: payrollPeriods.periodStart,
        periodEnd: payrollPeriods.periodEnd,
      })
      .from(payrollPeriods)
      .orderBy(desc(payrollPeriods.periodStart));

    return {
      categories: ['doctor', 'midwife', 'worker'],
      periods: periods.map((p) => ({
        ...p,
        status: p.status as any,
      })),
      statuses: [
        PAYROLL_PERIOD_STATUS.DRAFT,
        PAYROLL_PERIOD_STATUS.CALCULATED,
        PAYROLL_PERIOD_STATUS.FINALIZED,
      ],
    };
  }
}
