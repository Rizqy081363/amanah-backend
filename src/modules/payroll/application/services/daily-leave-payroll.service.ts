import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  ne,
  or,
} from 'drizzle-orm';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../database/drizzle/drizzle.provider';
import {
  compensationRates,
  doctorAssignments,
  leaveRequestSessions,
  payrollEntries,
  payrollPeriods,
  sessionDefs,
  staffLeaveRequests,
  staffProfiles,
  staffRosters,
} from '../../../../database/schema';
import { NotificationGatewayService } from '../../../notifications/application/services/notification-gateway.service';
import { SocketIoRealtimeGateway } from '../../../notifications/infrastructure/realtime/socket-io-realtime.gateway';
import { NOTIFICATION_SOURCE_DOMAINS } from '../../../notifications/notifications.constants';
import { REALTIME_GATEWAY_PORT } from '../../../notifications/notifications.constants';
import { calculateSessionNetHours } from '../../../schedules/domain/services/shift-duration.helper';

export interface DailyLeaveProcessOptions {
  targetDate?: string;
  startDate?: string;
  endDate?: string;
  forceAllShifts?: boolean;
}

export interface DailyLeaveProcessResult {
  targetDate: string;
  processedCount: number;
  totalDeductionsAmount: number;
  staffProcessed: string[];
}

@Injectable()
export class DailyLeavePayrollService {
  private readonly logger = new Logger(DailyLeavePayrollService.name);

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
    @Optional()
    private readonly clinicConfigService?: ClinicConfigService,
    @Optional()
    private readonly notificationGateway?: NotificationGatewayService,
    @Optional()
    @Inject(REALTIME_GATEWAY_PORT)
    private readonly realtimeGateway?: SocketIoRealtimeGateway,
  ) {}

  async processDailyLeave(
    targetDateOrOptions?: string | DailyLeaveProcessOptions,
  ): Promise<DailyLeaveProcessResult> {
    const options: DailyLeaveProcessOptions =
      typeof targetDateOrOptions === 'string'
        ? { targetDate: targetDateOrOptions, forceAllShifts: true }
        : targetDateOrOptions || {};

    if (options.startDate && options.endDate) {
      return this.processDateRange(
        options.startDate,
        options.endDate,
        options.forceAllShifts ?? false,
      );
    }

    const targetDate =
      options.targetDate ||
      this.clinicTimeService?.today() ||
      new Date().toISOString().split('T')[0];

    const forceAllShifts = options.forceAllShifts ?? false;
    return this.processSingleDate(targetDate, forceAllShifts);
  }

  private async processDateRange(
    startDate: string,
    endDate: string,
    forceAllShifts: boolean,
  ): Promise<DailyLeaveProcessResult> {
    this.logger.log(
      `[DailyLeavePayroll] Initiating dynamic range reconciliation from ${startDate} to ${endDate} (forceAllShifts=${forceAllShifts})`,
    );

    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    let totalProcessed = 0;
    let totalDeductions = 0;
    const allStaffProcessed = new Set<string>();

    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const curDateStr = d.toISOString().split('T')[0];
      const res = await this.processSingleDate(curDateStr, forceAllShifts);
      totalProcessed += res.processedCount;
      totalDeductions += res.totalDeductionsAmount;
      for (const s of res.staffProcessed) {
        allStaffProcessed.add(s);
      }
    }

    return {
      targetDate: `${startDate} s/d ${endDate}`,
      processedCount: totalProcessed,
      totalDeductionsAmount: totalDeductions,
      staffProcessed: Array.from(allStaffProcessed),
    };
  }

  private async processSingleDate(
    targetDate: string,
    forceAllShifts: boolean,
  ): Promise<DailyLeaveProcessResult> {
    this.logger.log(
      `[DailyLeavePayroll] Initiating dynamic roster-aware leave reconciliation for date: ${targetDate} (forceAllShifts=${forceAllShifts})`,
    );

    // 1. Locate or create active payroll period covering targetDate
    const activePeriod = await this.resolveActivePeriod(targetDate);

    // 2. Query approved leave requests active on targetDate
    const approvedLeaves = await this.db
      .select()
      .from(staffLeaveRequests)
      .where(
        and(
          eq(staffLeaveRequests.status, 'approved'),
          lte(staffLeaveRequests.startDate, targetDate),
          gte(staffLeaveRequests.endDate, targetDate),
        ),
      );

    if (!approvedLeaves || approvedLeaves.length === 0) {
      this.logger.log(
        `[DailyLeavePayroll] No approved leave requests found for date: ${targetDate}.`,
      );
      return {
        targetDate,
        processedCount: 0,
        totalDeductionsAmount: 0,
        staffProcessed: [],
      };
    }

    // 3. Group leaves by staff profile for consolidated single-notification processing
    const leavesByStaff = new Map<string, typeof approvedLeaves>();
    for (const leave of approvedLeaves) {
      const list = leavesByStaff.get(leave.staffProfileId) || [];
      list.push(leave);
      leavesByStaff.set(leave.staffProfileId, list);
    }

    // Fetch compensation rates, break config, and clinic locale
    const [rates, breakConfig, locale] = await Promise.all([
      this.db
        .select()
        .from(compensationRates)
        .where(eq(compensationRates.isActive, true)),
      this.clinicConfigService
        ? this.clinicConfigService.getRosterBreakConfig()
        : Promise.resolve({ breakDurationMinutes: 30, isBreakPaid: false }),
      this.clinicConfigService
        ? this.clinicConfigService.getLocale().catch(() => 'id-ID')
        : Promise.resolve('id-ID'),
    ]);

    // Parse targetDate DOW (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const dateObj = new Date(`${targetDate}T00:00:00Z`);
    const targetDow = dateObj.getUTCDay();

    // Respect clinic time and locale configuration for description date formatting
    const formattedTargetDate = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dateObj);

    // Check if targetDate is today to evaluate shift-end condition
    const todayStr =
      this.clinicTimeService?.today() || new Date().toISOString().split('T')[0];
    const isToday = targetDate === todayStr;

    // Current time in minutes from 00:00
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let processedCount = 0;
    let totalDeductionsAmount = 0;
    const staffProcessed: string[] = [];

    for (const [staffProfileId, staffLeaves] of leavesByStaff) {
      try {
        // Fetch staff profile with practitioner relation
        const [staff] = await this.db.query.staffProfiles.findMany({
          where: eq(staffProfiles.id, staffProfileId),
          with: {
            practitioners: true,
          },
          limit: 1,
        });

        if (!staff) {
          continue;
        }

        const staffType = staff.staffType?.toLowerCase() || 'worker';
        const rateRow = rates.find(
          (r) => r.category.toLowerCase() === staffType,
        );
        const hourlyRate = Number(rateRow?.hourlyRate ?? 0);

        // Calculate consolidated scheduled shift sessions for targetDate
        let totalLeaveHours = 0;
        let latestShiftEndMinutes = 0;
        const leaveRequestIds: string[] = [];
        const sessionMap = new Map<
          string,
          { startsAt: string; endsAt: string }
        >();

        for (const leave of staffLeaves) {
          leaveRequestIds.push(leave.id);

          if (leave.scope === 'session') {
            const specificSessions = await this.db
              .select({
                startsAt: sessionDefs.defaultStartsAt,
                endsAt: sessionDefs.defaultEndsAt,
              })
              .from(leaveRequestSessions)
              .innerJoin(
                sessionDefs,
                eq(leaveRequestSessions.sessionId, sessionDefs.id),
              )
              .where(
                and(
                  eq(leaveRequestSessions.leaveRequestId, leave.id),
                  eq(leaveRequestSessions.workDate, targetDate),
                ),
              );

            for (const s of specificSessions) {
              sessionMap.set(`${s.startsAt}-${s.endsAt}`, s);
            }
          } else {
            // Full-day leave: resolve from staff_roster and doctor_assignment for this staff on targetDow
            const rosterSessions = await this.db
              .select({
                startsAt: sessionDefs.defaultStartsAt,
                endsAt: sessionDefs.defaultEndsAt,
              })
              .from(staffRosters)
              .innerJoin(
                sessionDefs,
                eq(staffRosters.sessionId, sessionDefs.id),
              )
              .where(
                and(
                  eq(staffRosters.staffProfileId, staffProfileId),
                  eq(staffRosters.dow, targetDow),
                  eq(staffRosters.isActive, true),
                ),
              );

            let doctorSessions: Array<{ startsAt: string; endsAt: string }> =
              [];
            const practitionerId = staff.practitioners?.[0]?.id;
            if (practitionerId) {
              const explicitSessions = await this.db
                .select({
                  startsAt: sessionDefs.defaultStartsAt,
                  endsAt: sessionDefs.defaultEndsAt,
                })
                .from(doctorAssignments)
                .innerJoin(
                  sessionDefs,
                  eq(doctorAssignments.sessionId, sessionDefs.id),
                )
                .where(
                  and(
                    eq(doctorAssignments.doctorId, practitionerId),
                    eq(doctorAssignments.dow, targetDow),
                    eq(doctorAssignments.isActive, true),
                  ),
                );

              if (explicitSessions.length > 0) {
                doctorSessions = explicitSessions;
              } else {
                doctorSessions = await this.db
                  .select({
                    startsAt: sessionDefs.defaultStartsAt,
                    endsAt: sessionDefs.defaultEndsAt,
                  })
                  .from(doctorAssignments)
                  .innerJoin(
                    sessionDefs,
                    eq(doctorAssignments.sessionId, sessionDefs.id),
                  )
                  .where(
                    and(
                      eq(doctorAssignments.doctorId, practitionerId),
                      isNull(doctorAssignments.dow),
                      eq(doctorAssignments.isActive, true),
                    ),
                  );
              }
            }

            for (const s of [...rosterSessions, ...doctorSessions]) {
              sessionMap.set(`${s.startsAt}-${s.endsAt}`, s);
            }
          }
        }

        const scheduledSessions = Array.from(sessionMap.values());

        // Zero Hardcode / Zero Assumption: If staff has NO scheduled shift on this day, it's an off-day (Rp 0 deduction)
        if (scheduledSessions.length === 0) {
          this.logger.log(
            `[DailyLeavePayroll] Staff "${staff.fullName}" has no active scheduled shift on ${targetDate} (DOW=${targetDow}). Off day recognized (0 hours, Rp 0 deduction).`,
          );
          continue;
        }

        // Calculate exact net hours and determine latest shift end time
        for (const s of scheduledSessions) {
          const netHrs = calculateSessionNetHours({
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            breakMinutes: breakConfig.breakDurationMinutes,
            isBreakPaid: breakConfig.isBreakPaid,
          });
          totalLeaveHours += netHrs;

          const [endH, endM] = s.endsAt.split(':').map(Number);
          let endMinutes = endH * 60 + endM;
          if (endMinutes === 0) endMinutes = 24 * 60; // 24:00 midnight
          if (endMinutes > latestShiftEndMinutes) {
            latestShiftEndMinutes = endMinutes;
          }
        }

        if (totalLeaveHours <= 0) {
          continue;
        }

        // Dynamic Shift-End Condition:
        // For today's automated sweeper runs (not forced), only process if the staff's shift has already finished
        if (
          !forceAllShifts &&
          isToday &&
          currentMinutes < latestShiftEndMinutes
        ) {
          const endHH = String(Math.floor(latestShiftEndMinutes / 60)).padStart(
            2,
            '0',
          );
          const endMM = String(latestShiftEndMinutes % 60).padStart(2, '0');
          this.logger.log(
            `[DailyLeavePayroll] Staff "${staff.fullName}" shift ends at ${endHH}:${endMM}. Current time is ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}. Skipping until shift completion.`,
          );
          continue;
        }

        // Idempotency Guard: Check if deduction has already been recorded for this staff on this specific target date
        const existingEntries = await this.db
          .select()
          .from(payrollEntries)
          .where(
            and(
              eq(payrollEntries.payrollPeriodId, activePeriod.id),
              eq(payrollEntries.staffProfileId, staffProfileId),
              eq(payrollEntries.entryType, 'leave_deduction'),
              eq(payrollEntries.sourceType, 'leave_request'),
              inArray(payrollEntries.sourceId, leaveRequestIds),
              or(
                like(payrollEntries.description, `%(${targetDate})%`),
                like(payrollEntries.description, `%(${formattedTargetDate})%`),
              ),
            ),
          );

        if (existingEntries && existingEntries.length > 0) {
          this.logger.log(
            `[DailyLeavePayroll] Leave deduction already recorded for staff "${staff.fullName}" on ${targetDate}. Skipping duplicate entry.`,
          );
          continue;
        }

        const deductionAmount = Number(
          (totalLeaveHours * hourlyRate).toFixed(2),
        );
        const primaryLeaveId = leaveRequestIds[0];

        // 4. Insert consolidated atomic deduction entry
        await this.db.insert(payrollEntries).values({
          payrollPeriodId: activePeriod.id,
          staffProfileId,
          practitionerId: staff.practitioners?.[0]?.id || null,
          entryType: 'leave_deduction',
          sourceType: 'leave_request',
          sourceId: primaryLeaveId,
          quantityHours: totalLeaveHours.toFixed(2),
          hourlyRate: hourlyRate.toFixed(2),
          amount: deductionAmount.toFixed(2),
          description: `Gaji di potong - Izin/cuti (${formattedTargetDate})`,
        });

        processedCount++;
        totalDeductionsAmount += deductionAmount;
        staffProcessed.push(staff.fullName);

        // 5. Send EXACTLY 1 MINIMALIST NOTIFICATION per staff at shift completion
        await this.dispatchConsolidatedNotification(
          staff,
          targetDate,
          totalLeaveHours,
          deductionAmount,
        );
      } catch (err) {
        this.logger.error(
          `[DailyLeavePayroll] Failed to process leave payroll for staffProfileId=${staffProfileId}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `[DailyLeavePayroll] Finished processing ${targetDate}. Total staff processed: ${processedCount}, Total deduction: Rp ${totalDeductionsAmount.toLocaleString('id-ID')}.`,
    );

    return {
      targetDate,
      processedCount,
      totalDeductionsAmount,
      staffProcessed,
    };
  }

  private async resolveActivePeriod(targetDate: string) {
    let [activePeriod] = await this.db
      .select()
      .from(payrollPeriods)
      .where(
        and(
          lte(payrollPeriods.periodStart, targetDate),
          gte(payrollPeriods.periodEnd, targetDate),
          ne(payrollPeriods.status, 'finalized'),
        ),
      )
      .limit(1);

    if (!activePeriod) {
      const [latestOpen] = await this.db
        .select()
        .from(payrollPeriods)
        .where(ne(payrollPeriods.status, 'finalized'))
        .orderBy(desc(payrollPeriods.periodStart))
        .limit(1);
      activePeriod = latestOpen;
    }

    if (!activePeriod) {
      const dateObj = new Date(targetDate);
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
          status: 'calculated',
          calculatedAt: new Date().toISOString(),
          notes: 'Periode aktif dibuat otomatis oleh sistem scheduler',
        })
        .returning();
      activePeriod = created;
    }

    return activePeriod;
  }

  private async dispatchConsolidatedNotification(
    staff: any,
    targetDate: string,
    hours: number,
    deductionAmount: number,
  ): Promise<void> {
    const staffName = staff.fullName || 'Staf';
    const staffUserId = staff.userId;

    const dateObj = new Date(`${targetDate}T00:00:00Z`);
    const locale = this.clinicConfigService
      ? await this.clinicConfigService.getLocale().catch(() => 'id-ID')
      : 'id-ID';
    const formattedDate = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dateObj);

    // Minimalist copywriting: zero "dinas", zero bureaucratic complexity
    const title = 'Pembaruan Gaji';
    const body = `Gaji dan perizinan tanggal ${formattedDate} telah diperbarui.`;

    // 1. Direct Realtime WebSocket Broadcast
    if (this.realtimeGateway) {
      const payload = {
        staffId: staff.id,
        staffName,
        targetDate,
        leaveHours: hours,
        deductionAmount,
        type: 'leave_deduction',
      };

      if (staffUserId) {
        void this.realtimeGateway.emitToUser(
          staffUserId,
          'payroll:leave_deduction_applied',
          payload,
        );
      }
      void this.realtimeGateway.emitToRole?.(
        'admin',
        'payroll:leave_deduction_applied',
        payload,
      );
      void this.realtimeGateway.emitToRole?.(
        'ADMIN',
        'payroll:leave_deduction_applied',
        payload,
      );
      void this.realtimeGateway.emitToRoom?.('role:admin', 'payroll:refresh', {
        date: targetDate,
      });
    }

    // 2. In-App and Push Notification Center
    if (this.notificationGateway && staffUserId) {
      await this.notificationGateway.dispatch({
        commandId: `leave-payroll-${staff.id}-${targetDate}`,
        sourceDomain: NOTIFICATION_SOURCE_DOMAINS.PAYROLL,
        channels: ['in_app', 'push'],
        target: {
          type: 'user',
          recipientUserIds: [staffUserId],
        },
        category: 'shift',
        content: {
          title,
          body,
          actionUrl: '/dashboard/penggajian',
          data: {
            staffId: staff.id,
            targetDate,
            hours,
            deductionAmount,
          },
        },
        priority: 'normal',
      });
    }
  }
}
