import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { AttendanceEntity } from '../../domain/entities/attendance.entity';
import {
  AttendanceAlreadyCheckedOutException,
  AttendanceRecordNotFoundException,
  InvalidQrTokenException,
} from '../../domain/errors/attendance-domain.errors';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';
import { AttendanceNotificationService } from '../services/attendance-notification.service';

export interface CheckOutAttendanceInput {
  staffId: string;
  attendanceDate?: string;
  qrToken?: string;
}

@Injectable()
export class CheckOutAttendanceUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly notificationService: AttendanceNotificationService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  async execute(input: CheckOutAttendanceInput): Promise<AttendanceEntity> {
    // 0. Verify dynamic QR session token if provided (Proximity Proof)
    if (input.qrToken) {
      const qrSession = await this.repo.findQrSessionByToken(input.qrToken);
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

    // Calculate validated duration hours (min 0.5h, max 12h)
    const diffMs = Math.max(0, checkOutDate.getTime() - checkInDate.getTime());
    const hours = Math.min(
      12,
      Math.max(0.5, Number((diffMs / (1000 * 60 * 60)).toFixed(2))),
    );

    const updated = await this.repo.updateAttendanceRecord(existing.id, {
      checkOutAt: checkOutDate.toISOString(),
      validatedDurationHours: hours.toString(),
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
      });
    }

    return updated;
  }
}
