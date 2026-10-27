import { Inject, Injectable, Optional } from '@nestjs/common';
import { ClinicConfigService } from '../../../../common/clinic-config/clinic-config.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { calculateSessionNetHours } from '../../../schedules/domain/services/shift-duration.helper';
import { AttendanceMethod } from '../constants/attendance.constants';
import { AttendanceEntity } from '../entities/attendance.entity';
import {
  AttendanceAlreadyCheckedOutException,
  AttendanceRecordNotFoundException,
  DuplicateAttendanceException,
  EarlyDepartureNotesRequiredException,
  InvalidManualCodeException,
  InvalidQrTokenException,
  SessionMismatchException,
  StaffNotRosteredException,
  StaffOnLeaveException,
} from '../errors/attendance-domain.errors';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../repositories/attendance.repository';
import { AttendanceTimingService } from './attendance-timing.service';
import { CheckoutTicketService } from './checkout-ticket.service';

export interface CheckInEligibilityParams {
  staffId: string;
  targetDate: string;
  dow: number;
  resolvedSessionId?: string | null;
  shift?: string;
  isAdministrativeEntry?: boolean;
}

export interface CheckInEligibilityResult {
  isEligible: boolean;
  isReplacement: boolean;
  replacementOpportunityId: string | null;
}

export interface CheckOutEligibilityParams {
  staffId: string;
  targetDate: string;
  isAdministrativeEntry?: boolean;
  qrToken?: string;
  method?: AttendanceMethod;
  checkoutTicket?: string;
  notes?: string;
}

export interface CheckOutEligibilityResult {
  existingRecord: AttendanceEntity;
  timingEval: {
    isEarlyDeparture: boolean;
    validatedDurationHours: number;
    requiresNotes: boolean;
    earlyMinutes: number;
  };
  notes: string | null;
}

@Injectable()
export class AttendanceEligibilityService {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly timingService: AttendanceTimingService,
    private readonly ticketService: CheckoutTicketService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
    @Optional()
    private readonly clinicConfigService?: ClinicConfigService,
  ) {}

  /**
   * Single Source of Truth for Check-In eligibility and state verification.
   * Enforced equally across Mobile QR Scanning and Admin Web Manual Entry.
   */
  async verifyCheckInEligibility(
    params: CheckInEligibilityParams,
  ): Promise<CheckInEligibilityResult> {
    const {
      staffId,
      targetDate,
      dow,
      resolvedSessionId,
      isAdministrativeEntry = false,
    } = params;

    // 1. Leave Check: Staff must not be on an approved leave
    const onLeave = await this.repo.findApprovedLeave(staffId, targetDate);
    if (onLeave) {
      throw new StaffOnLeaveException();
    }

    // 2. State Machine Check: Must not already be checked in or checked out today
    const existing = await this.repo.findStaffAttendanceForDate(
      staffId,
      targetDate,
    );
    if (existing) {
      if (existing.checkOutAt) {
        throw new AttendanceAlreadyCheckedOutException(
          'Staf sudah melakukan presensi pulang (checkout) pada hari ini. Tidak dapat melakukan presensi masuk kembali.',
        );
      }
      if (existing.checkInAt) {
        throw new DuplicateAttendanceException(
          'Staf sudah melakukan presensi masuk untuk tanggal ini.',
        );
      }
    }

    // 3. Replacement Check: Check if staff claimed an approved replacement shift for today
    const claimedReplacement = await this.repo.findClaimedReplacement(
      staffId,
      targetDate,
    );

    if (claimedReplacement) {
      return {
        isEligible: true,
        isReplacement: true,
        replacementOpportunityId: claimedReplacement.id,
      };
    }

    // 4. Regular Roster Schedule Check
    const [staffRosters, doctorAssignments] = await Promise.all([
      this.repo.findStaffRostersForDow(staffId, dow),
      this.repo.findDoctorAssignmentsForDow(staffId, dow),
    ]);

    const hasRosterToday =
      staffRosters.length > 0 || doctorAssignments.length > 0;

    if (!isAdministrativeEntry && !hasRosterToday) {
      throw new StaffNotRosteredException();
    }

    // 5. Session Def Match (if session is resolved)
    if (resolvedSessionId && !isAdministrativeEntry) {
      const matchesSession =
        staffRosters.some((r) => r.sessionId === resolvedSessionId) ||
        doctorAssignments.some((d) => d.sessionId === resolvedSessionId);

      if (!matchesSession) {
        throw new SessionMismatchException();
      }
    }

    return {
      isEligible: true,
      isReplacement: false,
      replacementOpportunityId: null,
    };
  }

  /**
   * Backward-compatible alias for existing callers.
   */
  async verifyEligibility(
    params: CheckInEligibilityParams,
  ): Promise<CheckInEligibilityResult> {
    return this.verifyCheckInEligibility(params);
  }

  /**
   * Single Source of Truth for Check-Out eligibility and proximity verification.
   * Handles Mobile QR scans, Bounded Tickets, and Administrative Panel checkouts.
   */
  async verifyCheckOutEligibility(
    params: CheckOutEligibilityParams,
  ): Promise<CheckOutEligibilityResult> {
    const {
      staffId,
      targetDate,
      isAdministrativeEntry = false,
      qrToken,
      checkoutTicket,
      notes,
    } = params;

    // 1. Record Existence Check
    const existing = await this.repo.findStaffAttendanceForDate(
      staffId,
      targetDate,
    );

    if (!existing || !existing.checkInAt) {
      throw new AttendanceRecordNotFoundException(
        'Data presensi masuk untuk tanggal ini tidak ditemukan. Silakan lakukan check-in terlebih dahulu.',
      );
    }

    // 2. Duplicate Check-Out Guard
    if (existing.checkOutAt) {
      throw new AttendanceAlreadyCheckedOutException(
        'Presensi pulang dinas sudah tercatat sebelumnya pada tanggal ini.',
      );
    }

    // 3. Proximity Proof Verification (Bypassed ONLY for authenticated administrative entry)
    let proximityVerified = Boolean(isAdministrativeEntry);

    if (!proximityVerified && checkoutTicket) {
      const ticketCheck = this.ticketService.verifyTicket(
        checkoutTicket,
        staffId,
        existing.id,
      );

      if (ticketCheck.isExpired) {
        throw new InvalidQrTokenException(
          'Tiket presensi pulang kedaluwarsa (melebihi 3 menit). Silakan scan ulang QR code di terminal klinik.',
        );
      }

      if (!ticketCheck.isValid) {
        throw new InvalidQrTokenException(
          'Tiket presensi pulang tidak valid.',
        );
      }

      proximityVerified = true;
    }

    if (!proximityVerified && qrToken) {
      let tokenToVerify = qrToken.trim();
      if (tokenToVerify.startsWith('{') && tokenToVerify.endsWith('}')) {
        try {
          const parsed = JSON.parse(tokenToVerify);
          if (parsed && typeof parsed.token === 'string') {
            tokenToVerify = parsed.token.trim();
          }
        } catch {
          // Keep raw token
        }
      }

      const qrSession = await this.repo.findQrSessionByToken(tokenToVerify);
      if (!qrSession) {
        if (params.method === 'manual_pin') {
          throw new InvalidManualCodeException();
        }
        throw new InvalidQrTokenException();
      }
      proximityVerified = true;
    }

    if (!proximityVerified) {
      if (params.method === 'manual_pin') {
        throw new InvalidManualCodeException(
          'Kode presensi dinas klinik wajib disertakan.',
        );
      }
      throw new InvalidQrTokenException(
        'Token QR atau tiket presensi pulang wajib disertakan.',
      );
    }

    // 4. Resolve Scheduled End Time & Net Hours
    let scheduledEndTime: string | null = null;
    let scheduledShiftDurationHours = 6;
    if (existing.sessionId) {
      const sessionDef = await this.repo.resolveSessionDefById(
        existing.sessionId,
      );
      if (sessionDef?.defaultEndsAt) {
        scheduledEndTime = sessionDef.defaultEndsAt;
      }
      if (sessionDef?.defaultStartsAt && sessionDef?.defaultEndsAt) {
        const breakConfig =
          await this.clinicConfigService?.getRosterBreakConfig();
        scheduledShiftDurationHours = calculateSessionNetHours({
          startsAt: sessionDef.defaultStartsAt,
          endsAt: sessionDef.defaultEndsAt,
          breakMinutes: breakConfig?.breakDurationMinutes ?? 30,
          isBreakPaid: breakConfig?.isBreakPaid ?? false,
        });
      }
    }

    if (!scheduledEndTime && existing.shift) {
      const sessionDef = await this.repo.resolveSessionDefByCode(existing.shift);
      if (sessionDef?.defaultEndsAt) {
        scheduledEndTime = sessionDef.defaultEndsAt;
      }
      if (sessionDef?.defaultStartsAt && sessionDef?.defaultEndsAt) {
        const breakConfig =
          await this.clinicConfigService?.getRosterBreakConfig();
        scheduledShiftDurationHours = calculateSessionNetHours({
          startsAt: sessionDef.defaultStartsAt,
          endsAt: sessionDef.defaultEndsAt,
          breakMinutes: breakConfig?.breakDurationMinutes ?? 30,
          isBreakPaid: breakConfig?.isBreakPaid ?? false,
        });
      }
    }

    const checkOutDate = this.clinicTimeService?.nowDate() ?? new Date();
    const checkInDate = existing.checkInAt ?? checkOutDate;

    // 5. Timing & Early Departure Evaluation
    const timingEval = await this.timingService.evaluateCheckOutTiming({
      checkInTime: checkInDate,
      checkOutTime: checkOutDate,
      scheduledEndTime,
      scheduledShiftDurationHours,
    });

    // 6. Enforce Notes Requirement for Early Departure (Mobile self-service only)
    const notesTrimmed = notes?.trim() || null;
    if (!isAdministrativeEntry && timingEval.requiresNotes && !notesTrimmed) {
      const ticket = this.ticketService.issueTicket(
        staffId,
        existing.id,
        180,
      );
      throw new EarlyDepartureNotesRequiredException({
        checkoutTicket: ticket.ticket,
        expiresAt: ticket.expiresAt,
        message:
          'Catatan alasan kepulangan lebih awal wajib diisi karena presensi pulang dilakukan sebelum jendela kepulangan normal.',
      });
    }

    return {
      existingRecord: existing,
      timingEval,
      notes: notesTrimmed,
    };
  }
}
