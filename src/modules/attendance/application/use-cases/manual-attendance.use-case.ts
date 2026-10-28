import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  ATTENDANCE_ACTIONS,
  AttendanceStatus,
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
  status?: AttendanceStatus;
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
    const nowIso = now.toISOString();
    const todayStr = input.attendanceDate
      ? this.clinicTimeService
        ? this.clinicTimeService.normalizeDate(input.attendanceDate)
        : input.attendanceDate
      : this.clinicTimeService?.today() ?? nowIso.split('T')[0];

    const targetDateObj = new Date(todayStr + 'T12:00:00Z');
    const dow = targetDateObj.getDay();

    // 1. Authoritative Core Eligibility & State Check (SSOT)
    // Enforces Defense Hierarchy: Leave -> Roster Priority / Weekly Template -> State Machine
    const eligibility = await this.eligibilityService.verifyCheckInEligibility({
      staffId: staff.id,
      targetDate: todayStr,
      dow,
      shift: input.shift,
      isAdministrativeEntry: true,
    });

    const status: AttendanceStatus = input.status ?? 'present';

    // 2. Persist Attendance Record
    const record = await this.repo.saveAttendanceRecord({
      staffProfileId: staff.id,
      attendanceDate: todayStr,
      shift: eligibility.resolvedSession.shift,
      status,
      checkInAt: nowIso,
      recordedMethod: 'manual_pin',
      recordedBy: input.recordedBy || null,
      sessionId: eligibility.resolvedSession.sessionId,
      isReplacement: eligibility.isReplacement,
      replacementOpportunityId: eligibility.replacementOpportunityId,
      notes: input.notes || 'Presensi manual dicatat oleh admin / staf',
    });

    // 3. Asynchronously Dispatch Realtime Socket & In-App Notification (Role-Scoped)
    void this.notificationService.dispatchNotification(
      record,
      ATTENDANCE_ACTIONS.MANUAL_CHECK_IN,
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
