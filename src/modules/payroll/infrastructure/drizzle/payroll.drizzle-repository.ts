import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
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
import { PayrollEntryEntity } from '../../domain/entities/payroll-entry.entity';
import { PayrollPeriodEntity } from '../../domain/entities/payroll-period.entity';
import {
  PayrollRepository,
  PayrollSummary,
} from '../../domain/repositories/payroll.repository';

@Injectable()
export class PayrollDrizzleRepository implements PayrollRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
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

  private mapEntry(r: any): PayrollEntryEntity {
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
      createdAt: new Date(r.createdAt),
    };
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
    for (const [staffId, staffEntries] of entriesByStaff.entries()) {
      const staff = staffMap.get(staffId);
      if (!staff) continue;

      let baseEarnings = 0;
      let baseHours = 0;
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
        } else if (
          e.entryType === 'replacement_addition' ||
          e.entryType === 'overtime_addition'
        ) {
          replacementAdditions += amt;
        }
      }

      const netPayroll = baseEarnings - leaveDeductions + replacementAdditions;

      summaries.push({
        staffId: staff.id,
        fullName: staff.fullName,
        staffType: staff.staffType,
        positionTitle: staff.positionTitle || undefined,
        practitionerId: staff.practitioners?.[0]?.id || null,
        baseHours,
        baseEarnings,
        leaveDeductions,
        replacementAdditions,
        netPayroll,
        entries: staffEntries.map((e) => this.mapEntry(e)),
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

    const rateMap = new Map<
      string,
      { hourly: number; overtime: number }
    >();
    for (const r of rates) {
      rateMap.set(r.category, {
        hourly: Number(r.hourlyRate),
        overtime: Number(r.overtimeHourlyRate),
      });
    }

    // Default fallbacks if rates table was empty
    const defaultDoctorRate = rateMap.get('doctor') || {
      hourly: 150000,
      overtime: 200000,
    };
    const defaultMidwifeRate = rateMap.get('midwife') || {
      hourly: 150000,
      overtime: 200000,
    };
    const defaultWorkerRate = rateMap.get('worker') || {
      hourly: 75000,
      overtime: 100000,
    };

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
      if (existingPeriod.status === 'finalized') {
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
          status: 'calculated',
          calculatedBy: calculatedBy || null,
          calculatedAt: new Date().toISOString(),
        })
        .returning();
      periodId = newPeriod.id;
    }

    // 3. Fetch active staff
    const activeStaff = await this.db.query.staffProfiles.findMany({
      where: eq(staffProfiles.status, 'active'),
      with: {
        practitioners: true,
      },
    });

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

    for (const staff of activeStaff) {
      const rates =
        staff.staffType === 'doctor'
          ? defaultDoctorRate
          : staff.staffType === 'midwife'
            ? defaultMidwifeRate
            : defaultWorkerRate;

      const practitionerId = staff.practitioners?.[0]?.id || null;
      const entriesToInsert: any[] = [];

      // A. Calculate Base Roster Hours
      let weeklyScheduledHours = 0;
      if (practitionerId) {
        // Doctor / Midwife schedule assignments
        const assignments = await this.db
          .select()
          .from(doctorAssignments)
          .where(
            and(
              eq(doctorAssignments.doctorId, practitionerId),
              eq(doctorAssignments.isActive, true),
            ),
          );
        // Each session is nominally 6 hours
        weeklyScheduledHours = assignments.length * 6;
      } else {
        // Operational Worker schedule
        const rosters = await this.db
          .select()
          .from(staffRosters)
          .where(
            and(
              eq(staffRosters.staffProfileId, staff.id),
              eq(staffRosters.isActive, true),
            ),
          );
        weeklyScheduledHours = rosters.length * 6;
      }

      // Default minimal baseline if not assigned yet: 20 hours/week
      const totalBaseHours = Math.round(
        (weeklyScheduledHours > 0 ? weeklyScheduledHours : 20) *
          weeksInPeriod,
      );
      const baseEarnings = totalBaseHours * rates.hourly;

      entriesToInsert.push({
        payrollPeriodId: periodId,
        staffProfileId: staff.id,
        practitionerId,
        entryType: 'base_scheduled',
        sourceType: 'roster',
        quantityHours: totalBaseHours.toString(),
        hourlyRate: rates.hourly.toString(),
        amount: baseEarnings.toString(),
        description: `Gaji pokok dinas terjadwal (${totalBaseHours} jam @ Rp ${rates.hourly.toLocaleString('id-ID')})`,
      });

      // B. Calculate Approved Leave Deductions
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

      let leaveDeductionHours = 0;
      for (const l of leaves) {
        const leaveDays = l.durationDays || 1;
        // 1 day leave = 6 scheduled hours
        leaveDeductionHours += leaveDays * 6;
      }

      const totalLeaveDeductions = leaveDeductionHours * rates.hourly;
      if (leaveDeductionHours > 0) {
        entriesToInsert.push({
          payrollPeriodId: periodId,
          staffProfileId: staff.id,
          practitionerId,
          entryType: 'leave_deduction',
          sourceType: 'leave_request',
          quantityHours: leaveDeductionHours.toString(),
          hourlyRate: rates.hourly.toString(),
          amount: totalLeaveDeductions.toString(),
          description: `Pemotongan ketidakhadiran izin/cuti (${leaveDeductionHours} jam)`,
        });
      }

      // B.2 Calculate Early Departure Attendance Deductions (Regular Shift under-hours)
      const earlyDepartures = await this.db
        .select()
        .from(staffAttendanceRecords)
        .where(
          and(
            eq(staffAttendanceRecords.staffProfileId, staff.id),
            eq(staffAttendanceRecords.isReplacement, false),
            eq(staffAttendanceRecords.isEarlyDeparture, true),
            gte(staffAttendanceRecords.attendanceDate, periodStart),
            lte(staffAttendanceRecords.attendanceDate, periodEnd),
          ),
        );

      let earlyDepartureDeductionHours = 0;
      for (const ed of earlyDepartures) {
        const validated = Number(ed.validatedDurationHours) || 0;
        const deficit = Math.max(0, 6 - validated);
        earlyDepartureDeductionHours += deficit;
      }

      const totalEarlyDepartureDeductions =
        earlyDepartureDeductionHours * rates.hourly;
      if (earlyDepartureDeductionHours > 0) {
        entriesToInsert.push({
          payrollPeriodId: periodId,
          staffProfileId: staff.id,
          practitionerId,
          entryType: 'leave_deduction',
          sourceType: 'attendance',
          quantityHours: earlyDepartureDeductionHours.toFixed(2),
          hourlyRate: rates.hourly.toString(),
          amount: totalEarlyDepartureDeductions.toFixed(2),
          description: `Penyesuaian jam dinas kepulangan lebih awal / early departure (${earlyDepartureDeductionHours.toFixed(2)} jam)`,
        });
      }

      // C. Calculate Replacement / Overtime Additions
      const attendanceAdditions = await this.db
        .select()
        .from(staffAttendanceRecords)
        .where(
          and(
            eq(staffAttendanceRecords.staffProfileId, staff.id),
            eq(staffAttendanceRecords.isReplacement, true),
            gte(staffAttendanceRecords.attendanceDate, periodStart),
            lte(staffAttendanceRecords.attendanceDate, periodEnd),
          ),
        );

      let replacementHours = 0;
      for (const a of attendanceAdditions) {
        replacementHours += Number(a.validatedDurationHours) || 6;
      }

      const totalReplacementAdditions = replacementHours * rates.overtime;
      if (replacementHours > 0) {
        entriesToInsert.push({
          payrollPeriodId: periodId,
          staffProfileId: staff.id,
          practitionerId,
          entryType: 'replacement_addition',
          sourceType: 'attendance',
          quantityHours: replacementHours.toString(),
          hourlyRate: rates.overtime.toString(),
          amount: totalReplacementAdditions.toString(),
          description: `Insentif jadwal dinas pengganti/lembur (${replacementHours} jam)`,
        });
      }

      // Insert all entries for this staff
      const insertedEntries = await this.db
        .insert(payrollEntries)
        .values(entriesToInsert)
        .returning();

      const netPayroll =
        baseEarnings -
        totalLeaveDeductions -
        totalEarlyDepartureDeductions +
        totalReplacementAdditions;
      totalClinicPayout += netPayroll;

      summaries.push({
        staffId: staff.id,
        fullName: staff.fullName,
        staffType: staff.staffType,
        positionTitle: staff.positionTitle || undefined,
        practitionerId,
        baseHours: totalBaseHours,
        baseEarnings,
        leaveDeductions: totalLeaveDeductions,
        replacementAdditions: totalReplacementAdditions,
        netPayroll,
        entries: insertedEntries.map((e) => this.mapEntry(e)),
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
    if (!targetPeriodId) {
      const [latestPeriod] = await this.db
        .select()
        .from(payrollPeriods)
        .orderBy(desc(payrollPeriods.periodStart))
        .limit(1);

      if (!latestPeriod) return null;
      targetPeriodId = latestPeriod.id;
    }

    const entries = await this.db
      .select()
      .from(payrollEntries)
      .where(
        and(
          eq(payrollEntries.payrollPeriodId, targetPeriodId),
          eq(payrollEntries.staffProfileId, staffId),
        ),
      );

    let baseEarnings = 0;
    let baseHours = 0;
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
      } else if (
        e.entryType === 'replacement_addition' ||
        e.entryType === 'overtime_addition'
      ) {
        replacementAdditions += amt;
      }
    }

    const netPayroll = baseEarnings - leaveDeductions + replacementAdditions;

    return {
      staffId: staff.id,
      fullName: staff.fullName,
      staffType: staff.staffType,
      positionTitle: staff.positionTitle || undefined,
      practitionerId: staff.practitioners?.[0]?.id || null,
      baseHours,
      baseEarnings,
      leaveDeductions,
      replacementAdditions,
      netPayroll,
      entries: entries.map((e) => this.mapEntry(e)),
    };
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
      throw new NotFoundException(`Periode payroll dengan ID ${id} tidak ditemukan`);
    }

    if (period.status === 'finalized') {
      return this.mapPeriod(period);
    }

    const [updated] = await this.db
      .update(payrollPeriods)
      .set({
        status: 'finalized',
        notes: period.notes
          ? `${period.notes} [Ditutup buku oleh ${finalizedBy}]`
          : `Ditutup buku oleh ${finalizedBy}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(payrollPeriods.id, id))
      .returning();

    return this.mapPeriod(updated);
  }
}
