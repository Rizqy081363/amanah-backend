import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import {
  ATTENDANCE_ACTIONS,
  AttendanceMethod,
  normalizeShift,
} from '../../domain/constants/attendance.constants';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import {
  InvalidManualCodeException,
  InvalidQrTokenException,
} from '../../domain/errors/attendance-domain.errors';
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

    const method = input.method === 'manual_pin' ? 'manual_pin' : 'qr_scan';
    let shift = normalizeShift(input.shift);
    let resolvedSessionId: string | null = input.sessionId || null;
    let qrSessionId: string | null = null;

    // 0. Verify dynamic QR session token if provided
    if (input.qrToken) {
      let tokenToVerify = input.qrToken.trim();
      if (tokenToVerify.startsWith('{') && tokenToVerify.endsWith('}')) {
        try {
          const parsed = JSON.parse(tokenToVerify);
          if (parsed && typeof parsed.token === 'string') {
            tokenToVerify = parsed.token.trim();
          }
        } catch {
          // Keep raw token if not valid JSON
        }
      }

      const qrSession = await this.repo.findQrSessionByToken(tokenToVerify);
      if (!qrSession) {
        if (method === 'manual_pin') {
          throw new InvalidManualCodeException();
        }
        throw new InvalidQrTokenException();
      }
      qrSessionId = qrSession.id;
      if (qrSession.shift) {
        shift = normalizeShift(qrSession.shift);
      }
    }

    // 1. Resolve matching session definition from time if not supplied
    let sessionDef: { id: string; code: string; defaultStartsAt: string | null } | null = null;
    if (resolvedSessionId) {
      sessionDef = await this.repo.resolveSessionDefById(resolvedSessionId);
    } else {
      sessionDef = await this.repo.resolveSessionDefByTime(now.getHours());
      if (sessionDef) {
        resolvedSessionId = sessionDef.id;
        shift = normalizeShift(sessionDef.code);
      }
    }

    // 2. Authoritative Core Eligibility & State Check (Leave, Already Checked-Out, Duplicate, Roster)
    const eligibility = await this.eligibilityService.verifyCheckInEligibility({
      staffId: input.staffId,
      targetDate: todayStr,
      dow,
      resolvedSessionId,
      shift,
      isAdministrativeEntry: false,
    });

    // 3. Determine Timing Status ('present' vs 'late')
    const timing = await this.timingService.calculateTimingStatus({
      checkInTime: now,
      scheduledStartTime: sessionDef?.defaultStartsAt,
      explicitStatus: input.status,
    });

    // 4. Persist Attendance Record
    const record = await this.repo.saveAttendanceRecord({
      staffProfileId: input.staffId,
      attendanceDate: todayStr,
      shift,
      status: timing.status,
      checkInAt: nowIso,
      lateMinutes: timing.lateMinutes > 0 ? timing.lateMinutes : null,
      recordedMethod: method,
      sessionId: resolvedSessionId,
      qrSessionId,
      isReplacement: eligibility.isReplacement,
      replacementOpportunityId: eligibility.replacementOpportunityId,
      notes: input.deviceInfo || null,
    });

    // 5. Asynchronously Dispatch Realtime Socket & In-App Notification (Role-Scoped)
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
