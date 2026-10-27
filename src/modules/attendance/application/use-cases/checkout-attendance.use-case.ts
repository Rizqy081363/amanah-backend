import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  PAYROLL_REPOSITORY,
  PayrollRepository,
} from '../../../payroll/domain/repositories/payroll.repository';
import {
  ATTENDANCE_ACTIONS,
  AttendanceMethod,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import { StaffNotFoundException } from '../../domain/errors/attendance-domain.errors';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceEligibilityService } from '../../domain/services/attendance-eligibility.service';
import { AttendanceNotificationService } from '../services/attendance-notification.service';

export interface CheckOutAttendanceInput {
  staffId: string;
  attendanceDate?: string;
  qrToken?: string;
  method?: AttendanceMethod;
  checkoutTicket?: string;
  notes?: string;
  isAdministrativeEntry?: boolean;
}

@Injectable()
export class CheckOutAttendanceUseCase {
  private readonly logger = new Logger(CheckOutAttendanceUseCase.name);

  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly eligibilityService: AttendanceEligibilityService,
    private readonly notificationService: AttendanceNotificationService,
    @Optional()
    @Inject(PAYROLL_REPOSITORY)
    private readonly payrollRepo?: PayrollRepository,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  async execute(input: CheckOutAttendanceInput): Promise<AttendanceEntity> {
    const targetIdentifier = input.staffId.trim();
    const staff = await this.repo.resolveStaffByIdOrCode(targetIdentifier);
    if (!staff) {
      throw new StaffNotFoundException(targetIdentifier);
    }
    const resolvedStaffId = staff.id;

    const todayStr = input.attendanceDate
      ? this.clinicTimeService
        ? this.clinicTimeService.normalizeDate(input.attendanceDate)
        : input.attendanceDate
      : this.clinicTimeService?.today() ?? new Date().toISOString().split('T')[0];

    // 1. Authoritative Core Check-Out Eligibility & Verification (SSOT)
    // Validates existence, duplicate checkout, proximity proof, and early departure notes
    const { existingRecord, timingEval, notes } =
      await this.eligibilityService.verifyCheckOutEligibility({
        staffId: resolvedStaffId,
        targetDate: todayStr,
        isAdministrativeEntry: input.isAdministrativeEntry,
        qrToken: input.qrToken,
        method: input.method,
        checkoutTicket: input.checkoutTicket,
        notes: input.notes,
      });

    const checkOutDate = this.clinicTimeService?.nowDate() ?? new Date();

    // 2. Persist Check-Out State Mutation
    const updated = await this.repo.updateAttendanceRecord(existingRecord.id, {
      checkOutAt: checkOutDate.toISOString(),
      validatedDurationHours: timingEval.validatedDurationHours.toFixed(2),
      isEarlyDeparture: timingEval.isEarlyDeparture,
      notes: notes ?? existingRecord.notes,
      updatedAt: checkOutDate.toISOString(),
    });

    // 3. If this was an approved replacement, mark opportunity as completed
    if (existingRecord.replacementOpportunityId) {
      await this.repo.markReplacementCompleted(
        existingRecord.replacementOpportunityId,
      );
    }

    // 4. Atomically record shift earnings into active payroll period
    let earnedAmount = 0;
    if (this.payrollRepo && timingEval.validatedDurationHours > 0) {
      try {
        const isReplacementShift = existingRecord.isReplacement;

        const shiftEntry = await this.payrollRepo.recordAttendanceShift({
          attendanceRecordId: updated.id,
          staffProfileId: resolvedStaffId,
          practitionerId: (staff as any)?.practitioners?.[0]?.id || null,
          attendanceDate: todayStr,
          validatedDurationHours: timingEval.validatedDurationHours,
          isEarlyDeparture: timingEval.isEarlyDeparture,
          isReplacement: isReplacementShift,
        });
        earnedAmount = Number(shiftEntry.amount || 0);
      } catch (payrollErr) {
        this.logger.error(
          `Failed to record attendance shift payroll entry: ${String(payrollErr)}`,
        );
      }
    }

    // 5. Asynchronously Dispatch Realtime Socket & In-App Notification (Role-Scoped)
    void this.notificationService.dispatchNotification(
      updated,
      ATTENDANCE_ACTIONS.CHECK_OUT,
      {
        fullName: staff.fullName,
        staffCode: staff.staffCode,
        userId: staff.userId,
        staffType: staff.staffType,
        positionTitle: staff.positionTitle,
        avatarUrl: staff.avatarUrl,
        earnedAmount,
      },
    );

    return updated;
  }
}
