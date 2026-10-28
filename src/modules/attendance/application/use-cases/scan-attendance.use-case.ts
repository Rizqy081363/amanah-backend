import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  ATTENDANCE_ACTIONS,
  AttendanceMethod,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceEligibilityService } from '../../domain/services/attendance-eligibility.service';
import { AttendanceTimingService } from '../../domain/services/attendance-timing.service';
import { AttendanceNotificationService } from '../services/attendance-notification.service';

export interface ScanAttendanceInput {
  staffId: string;
  qrToken: string;
  method?: AttendanceMethod;
  shift?: string;
  sessionId?: string;
  deviceInfo?: string;
  status?: string;
}

@Injectable()
export class ScanAttendanceUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly eligibilityService: AttendanceEligibilityService,
    private readonly timingService: AttendanceTimingService,
    private readonly notificationService: AttendanceNotificationService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  async execute(input: ScanAttendanceInput): Promise<AttendanceEntity> {
    const now = this.clinicTimeService?.nowDate() ?? new Date();
    const nowIso = now.toISOString();
    const todayStr = this.clinicTimeService?.today() ?? nowIso.split('T')[0];
    const targetDateObj = new Date(todayStr + 'T12:00:00Z');
    const dow = targetDateObj.getDay();

    const method = input.method || 'qr_scan';

    // 1. Authoritative Core Eligibility & State Check (SSOT)
    // Enforces Defense Hierarchy: Credential -> Leave -> Roster Priority / Weekly Template -> State Machine
    const eligibility = await this.eligibilityService.verifyCheckInEligibility({
      staffId: input.staffId,
      targetDate: todayStr,
      dow,
      resolvedSessionId: input.sessionId,
      shift: input.shift,
      qrToken: input.qrToken,
      method,
      isAdministrativeEntry: false,
    });

    // 2. Determine Timing Status ('present' vs 'late')
    const timing = await this.timingService.calculateTimingStatus({
      checkInTime: now,
      scheduledStartTime: eligibility.resolvedSession.startsAt,
      explicitStatus: input.status,
    });

    // 3. Persist Attendance Record
    const record = await this.repo.saveAttendanceRecord({
      staffProfileId: input.staffId,
      attendanceDate: todayStr,
      shift: eligibility.resolvedSession.shift,
      status: timing.status,
      checkInAt: nowIso,
      lateMinutes: timing.lateMinutes > 0 ? timing.lateMinutes : null,
      recordedMethod: method,
      sessionId: eligibility.resolvedSession.sessionId,
      qrSessionId: eligibility.qrSessionId,
      isReplacement: eligibility.isReplacement,
      replacementOpportunityId: eligibility.replacementOpportunityId,
      notes: input.deviceInfo || null,
    });

    // 4. Asynchronously Dispatch Realtime Socket & In-App Notification (Role-Scoped)
    const staff = await this.repo.resolveStaffByIdOrCode(input.staffId);
    if (staff) {
      void this.notificationService.dispatchNotification(
        record,
        ATTENDANCE_ACTIONS.CHECK_IN,
        {
          fullName: staff.fullName,
          staffCode: staff.staffCode,
          userId: staff.userId,
          staffType: staff.staffType,
          positionTitle: staff.positionTitle,
          avatarUrl: staff.avatarUrl,
        },
      );
    }

    return record;
  }
}
