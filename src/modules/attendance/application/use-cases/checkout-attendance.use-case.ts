import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import {
  AttendanceAlreadyCheckedOutException,
  AttendanceRecordNotFoundException,
  EarlyDepartureNotesRequiredException,
  InvalidQrTokenException,
} from '../../domain/errors/attendance-domain.errors';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceTimingService } from '../../domain/services/attendance-timing.service';
import { AttendanceNotificationService } from '../services/attendance-notification.service';

export interface CheckOutAttendanceInput {
  staffId: string;
  attendanceDate?: string;
  qrToken?: string;
  notes?: string;
}

@Injectable()
export class CheckOutAttendanceUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly timingService: AttendanceTimingService,
    private readonly notificationService: AttendanceNotificationService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  async execute(input: CheckOutAttendanceInput): Promise<AttendanceEntity> {
    // 0. Verify dynamic QR session token if provided (Proximity Proof)
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
        throw new InvalidQrTokenException();
      }
    }

    const staff = await this.repo.resolveStaffByIdOrCode(input.staffId);
    const resolvedStaffId = staff ? staff.id : input.staffId;

    const todayStr = input.attendanceDate
      ? this.clinicTimeService
        ? this.clinicTimeService.normalizeDate(input.attendanceDate)
        : input.attendanceDate
      : this.clinicTimeService?.today() ?? new Date().toISOString().split('T')[0];

    const existing = await this.repo.findStaffAttendanceForDate(
      resolvedStaffId,
      todayStr,
    );

    if (!existing) {
      throw new AttendanceRecordNotFoundException();
    }

    // Duplicate Check-Out Guard
    if (existing.checkOutAt) {
      throw new AttendanceAlreadyCheckedOutException(
        'Presensi pulang dinas sudah tercatat sebelumnya pada tanggal ini.',
      );
    }

    const checkOutDate = this.clinicTimeService?.nowDate() ?? new Date();
    const checkInDate = existing.checkInAt ?? checkOutDate;

    // Resolve scheduled end time from session or shift definition
    let scheduledEndTime: string | null = null;
    if (existing.sessionId) {
      const sessionDef = await this.repo.resolveSessionDefById(existing.sessionId);
      if (sessionDef?.defaultEndsAt) {
        scheduledEndTime = sessionDef.defaultEndsAt;
      }
    }

    // Fallback standard shift end times if session def did not supply defaultEndsAt
    if (!scheduledEndTime && existing.shift) {
      const shiftLower = existing.shift.toLowerCase();
      if (shiftLower === 'morning') scheduledEndTime = '12:00';
      else if (shiftLower === 'afternoon') scheduledEndTime = '18:00';
      else if (shiftLower === 'night') scheduledEndTime = '00:00';
      else if (shiftLower === 'early_morning') scheduledEndTime = '06:00';
    }

    // Evaluate Check-Out timing (Window, Early Departure & Fair Credit Rounding)
    const timingEval = await this.timingService.evaluateCheckOutTiming({
      checkInTime: checkInDate,
      checkOutTime: checkOutDate,
      scheduledEndTime,
      scheduledShiftDurationHours: 6,
    });

    // Enforce notes requirement on early departure
    const notesTrimmed = input.notes?.trim();
    if (timingEval.requiresNotes && (!notesTrimmed || notesTrimmed.length === 0)) {
      throw new EarlyDepartureNotesRequiredException();
    }

    const updated = await this.repo.updateAttendanceRecord(existing.id, {
      checkOutAt: checkOutDate.toISOString(),
      validatedDurationHours: timingEval.validatedDurationHours.toFixed(2),
      isEarlyDeparture: timingEval.isEarlyDeparture,
      notes: notesTrimmed || existing.notes || null,
      updatedAt: checkOutDate.toISOString(),
    });

    // If this was an approved replacement, mark opportunity as completed
    if (existing.replacementOpportunityId) {
      await this.repo.markReplacementCompleted(
        existing.replacementOpportunityId,
      );
    }

    if (staff) {
      void this.notificationService.dispatchNotification(updated, 'check_out', {
        fullName: staff.fullName,
        staffCode: staff.staffCode,
        userId: staff.userId,
        staffType: staff.staffType,
        avatarUrl: staff.avatarUrl,
      });
    }

    return updated;
  }
}
