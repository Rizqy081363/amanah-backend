import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  normalizeShift,
  normalizeStatus,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import { StaffNotFoundException } from '../../domain/errors/attendance-domain.errors';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceEligibilityService } from '../../domain/services/attendance-eligibility.service';
import { AttendanceNotificationService } from '../services/attendance-notification.service';

export interface ManualAttendanceInput {
  staffIdOrCode: string;
  shift?: string;
  status?: string;
  attendanceDate?: string;
  notes?: string;
  recordedBy?: string;
}

@Injectable()
export class ManualAttendanceUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly eligibilityService: AttendanceEligibilityService,
    private readonly notificationService: AttendanceNotificationService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  async execute(input: ManualAttendanceInput): Promise<AttendanceEntity> {
    const staff = await this.repo.resolveStaffByIdOrCode(
      input.staffIdOrCode.trim(),
    );
    if (!staff) {
      throw new StaffNotFoundException(input.staffIdOrCode);
    }

    const now = this.clinicTimeService?.nowDate() ?? new Date();
    const todayStr = input.attendanceDate
      ? this.clinicTimeService
        ? this.clinicTimeService.normalizeDate(input.attendanceDate)
        : input.attendanceDate
      : this.clinicTimeService?.today() ?? now.toISOString().split('T')[0];

    const targetDateObj = new Date(todayStr + 'T12:00:00Z');
    const dow = targetDateObj.getDay();

    const shift = normalizeShift(input.shift);
    const status = normalizeStatus(input.status);

    // 1. Verify Roster Eligibility & Leave Status
    const eligibility = await this.eligibilityService.verifyEligibility({
      staffId: staff.id,
      targetDate: todayStr,
      dow,
      isAdministrativeEntry: true,
    });

    // 2. Persist Attendance Record
    const record = await this.repo.saveAttendanceRecord({
      staffProfileId: staff.id,
      attendanceDate: todayStr,
      shift,
      status,
      checkInAt: now.toISOString(),
      recordedMethod: 'manual_pin',
      recordedBy: input.recordedBy || null,
      isReplacement: eligibility.isReplacement,
      replacementOpportunityId: eligibility.replacementOpportunityId,
      notes: input.notes || 'Presensi manual dicatat oleh sistem / staf',
    });

    // 3. Asynchronously Dispatch Realtime Socket & In-App Notification
    void this.notificationService.dispatchNotification(
      record,
      'manual_check_in',
      {
        fullName: staff.fullName,
        staffCode: staff.staffCode,
        userId: staff.userId,
        staffType: staff.staffType,
        positionTitle: staff.positionTitle,
        avatarUrl: staff.avatarUrl,
      },
    );

    return record;
  }
}
