import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  PAYROLL_REPOSITORY,
  PayrollRepository,
} from '../../../payroll/domain/repositories/payroll.repository';
import { parseTimeToMinutes } from '../../../schedules/domain/services/shift-duration.helper';
import {
  ATTENDANCE_ACTIONS,
  ATTENDANCE_METHOD,
  ATTENDANCE_STATUS,
} from '../../domain/constants/attendance.constants';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceNotificationService } from '../services/attendance-notification.service';

export interface ProcessShiftEndAbsenceOptions {
  targetDate?: string;
  sessionId?: string;
  targetTime?: string;
  forceAllShifts?: boolean;
  deductPayroll?: boolean;
}

export interface ProcessShiftEndAbsenceResult {
  targetDate: string;
  processedShiftsCount: number;
  totalAbsentRecordsCreated: number;
  staffMarkedAbsent: string[];
}

@Injectable()
export class ProcessShiftEndAbsenceUseCase {
  private readonly logger = new Logger(ProcessShiftEndAbsenceUseCase.name);

  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    @Inject(PAYROLL_REPOSITORY)
    private readonly payrollRepo: PayrollRepository,
    private readonly notificationService: AttendanceNotificationService,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  async execute(
    options: ProcessShiftEndAbsenceOptions = {},
  ): Promise<ProcessShiftEndAbsenceResult> {
    const todayStr = this.clinicTimeService.today();

    const targetDate = options.targetDate
      ? this.clinicTimeService.normalizeDate(options.targetDate)
      : todayStr;

    const dateObj = new Date(targetDate + 'T12:00:00Z');
    const dow = dateObj.getDay();

    const currentTimeStr =
      options.targetTime || this.clinicTimeService.getCurrentTimeString();
    const nowMinutes = parseTimeToMinutes(currentTimeStr);

    this.logger.log(
      `[ShiftEndAbsenceEngine] Processing shift-end absence evaluation for date=${targetDate} (DOW=${dow}, currentTime=${currentTimeStr}, sessionId=${options.sessionId || 'all'})`,
    );

    // 1. Fetch active sessions to evaluate
    let candidateSessions: Array<{
      id: string;
      code: string;
      label: string;
      defaultStartsAt: string;
      defaultEndsAt: string;
      sortOrder: number;
    }> = [];

    if (options.sessionId) {
      const single = await this.repo.resolveSessionDefById(options.sessionId);
      if (single) {
        candidateSessions = [
          {
            id: single.id,
            code: single.code,
            label: single.label,
            defaultStartsAt: single.defaultStartsAt,
            defaultEndsAt: single.defaultEndsAt,
            sortOrder: 1,
          },
        ];
      }
    } else {
      candidateSessions = await this.repo.findAllActiveSessions();
    }

    if (candidateSessions.length === 0) {
      this.logger.log('[ShiftEndAbsenceEngine] No active sessions found.');
      return {
        targetDate,
        processedShiftsCount: 0,
        totalAbsentRecordsCreated: 0,
        staffMarkedAbsent: [],
      };
    }

    let processedShiftsCount = 0;
    let totalAbsentRecordsCreated = 0;
    const staffMarkedAbsent: string[] = [];

    for (const session of candidateSessions) {
      const endsAt = session.defaultEndsAt;
      const endMinutes =
        endsAt === '24:00:00' || endsAt === '24:00'
          ? 1440
          : parseTimeToMinutes(endsAt);

      const startsAt = session.defaultStartsAt;
      const startMinutes = parseTimeToMinutes(startsAt);

      // Determine if this shift has ended
      const isPastDate = targetDate < todayStr;
      const isShiftEndedToday =
        targetDate === todayStr && nowMinutes >= endMinutes;
      const isEnded = options.forceAllShifts || isPastDate || isShiftEndedToday;

      if (!isEnded) {
        continue;
      }

      processedShiftsCount++;

      // Shift duration in hours
      const rawMinutes =
        endMinutes > startMinutes
          ? endMinutes - startMinutes
          : 1440 - startMinutes + endMinutes;
      const shiftHours = Math.max(0.5, Number((rawMinutes / 60).toFixed(2)));

      // 2. Resolve all scheduled staff for this session & DOW
      const scheduledStaff = await this.repo.findScheduledStaffForSessionAndDow(
        session.id,
        dow,
      );

      this.logger.log(
        `[ShiftEndAbsenceEngine] Shift "${session.label}" (${session.code}, ${startsAt}-${endsAt}) ended. Evaluating ${scheduledStaff.length} scheduled staff.`,
      );

      const sessionAbsentStaffNames: string[] = [];

      for (const staff of scheduledStaff) {
        try {
          // Check if on approved leave
          const isOnLeave = await this.repo.findApprovedLeave(
            staff.id,
            targetDate,
          );
          if (isOnLeave) {
            // Already handled by daily leave payroll
            continue;
          }

          // Check if attendance record already exists
          const existingRecord =
            await this.repo.findStaffAttendanceForDateAndShift(
              staff.id,
              targetDate,
              session.code,
            );

          if (existingRecord) {
            // Already attended (present/late) or already marked absent
            continue;
          }

          // 3. Mark ABSENT in staff_attendance_records
          const absentRecord = await this.repo.saveAttendanceRecord({
            staffProfileId: staff.id,
            attendanceDate: targetDate,
            shift: session.code,
            sessionId: session.id,
            status: ATTENDANCE_STATUS.ABSENT,
            checkInAt: null,
            recordedMethod: ATTENDANCE_METHOD.SYSTEM,
            notes: `Tidak hadir - Tercatat otomatis oleh sistem pada akhir shift ${session.label}`,
            isReplacement: false,
          });
          absentRecord.shiftLabel = session.label;

          // 4. Optional Payroll deduction engine (Model A: Roster-based deduction. Default Model B: false / pay-per-presence)
          if (options.deductPayroll) {
            try {
              await this.payrollRepo.recordAbsenceDeduction({
                attendanceRecordId: absentRecord.id,
                staffProfileId: staff.id,
                practitionerId: staff.practitionerId,
                attendanceDate: targetDate,
                shiftHours,
                shiftLabel: session.label,
              });
            } catch (payrollErr) {
              this.logger.error(
                `[ShiftEndAbsenceEngine] Failed to record absence deduction for staff "${staff.fullName}": ${String(payrollErr)}`,
              );
            }
          }

          // 5. Real-time & FCM Push Notification strictly isolated to staff.userId (Skip individual admin broadcast during sweep)
          await this.notificationService.dispatchNotification(
            absentRecord,
            ATTENDANCE_ACTIONS.ABSENCE_FINALIZED,
            {
              fullName: staff.fullName,
              staffCode: staff.staffCode,
              userId: staff.userId,
              roleId: staff.roleId,
              shiftLabel: session.label,
              skipAdminBroadcast: true,
            },
          );

          // 6. Local Event Emitter
          try {
            this.eventEmitter?.emit('attendance.absence_finalized', {
              recordId: absentRecord.id,
              staffProfileId: staff.id,
              userId: staff.userId,
              shiftCode: session.code,
              attendanceDate: targetDate,
            });
          } catch {
            // ignore
          }

          totalAbsentRecordsCreated++;
          staffMarkedAbsent.push(staff.fullName);
          sessionAbsentStaffNames.push(staff.fullName);

          this.logger.log(
            `[ShiftEndAbsenceEngine] Staf "${staff.fullName}" (${staff.staffCode}) successfully finalized as ABSENT on shift "${session.label}"`,
          );
        } catch (staffErr) {
          this.logger.error(
            `[ShiftEndAbsenceEngine] Error processing absence for staff "${staff.fullName}": ${String(staffErr)}`,
          );
        }
      }

      // 7. Dispatch single aggregate absence notification for this ended shift to clinic administration
      if (sessionAbsentStaffNames.length > 0) {
        await this.notificationService.dispatchAggregateShiftAbsence({
          shiftLabel: session.label,
          shiftCode: session.code,
          attendanceDate: targetDate,
          absentCount: sessionAbsentStaffNames.length,
          absentStaffNames: sessionAbsentStaffNames,
        });
      }
    }

    return {
      targetDate,
      processedShiftsCount,
      totalAbsentRecordsCreated,
      staffMarkedAbsent,
    };
  }
}
