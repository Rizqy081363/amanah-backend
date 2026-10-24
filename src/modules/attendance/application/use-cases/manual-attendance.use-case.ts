import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  ATTENDANCE_ACTIONS,
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
    const nowIso = now.toISOString();
    const todayStr = input.attendanceDate
      ? this.clinicTimeService
        ? this.clinicTimeService.normalizeDate(input.attendanceDate)
        : input.attendanceDate
      : this.clinicTimeService?.today() ?? nowIso.split('T')[0];

    const targetDateObj = new Date(todayStr + 'T12:00:00Z');
    const dow = targetDateObj.getDay();

    // 1. Resolve Session Definition & Shift from current time if not explicitly provided
    let shift = input.shift ? normalizeShift(input.shift) : null;
    let resolvedSessionId: string | null = null;

    if (!shift) {
      const sessionDef = await this.repo.resolveSessionDefByTime(now.getHours());
      if (sessionDef) {
        resolvedSessionId = sessionDef.id;
        shift = normalizeShift(sessionDef.code);
      } else {
        shift = 'morning';
      }
    } else {
      const sessionDef = await this.repo.resolveSessionDefByCode(shift);
      if (sessionDef) {
        resolvedSessionId = sessionDef.id;
      }
    }

    const status = normalizeStatus(input.status);

    // 2. Authoritative Core Eligibility & State Check (SSOT)
    // Strictly enforces that staff cannot check in again if already checked out or already checked in today
    const eligibility = await this.eligibilityService.verifyCheckInEligibility({
      staffId: staff.id,
      targetDate: todayStr,
      dow,
      resolvedSessionId,
      shift,
      isAdministrativeEntry: true,
    });

    // 3. Persist Attendance Record
    const record = await this.repo.saveAttendanceRecord({
      staffProfileId: staff.id,
      attendanceDate: todayStr,
      shift,
      status,
      checkInAt: nowIso,
      recordedMethod: 'manual_pin',
      recordedBy: input.recordedBy || null,
      sessionId: resolvedSessionId,
      isReplacement: eligibility.isReplacement,
      replacementOpportunityId: eligibility.replacementOpportunityId,
      notes: input.notes || 'Presensi manual dicatat oleh sistem / staf',
    });

    // 4. Asynchronously Dispatch Realtime Socket & In-App Notification (Role-Scoped)
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
