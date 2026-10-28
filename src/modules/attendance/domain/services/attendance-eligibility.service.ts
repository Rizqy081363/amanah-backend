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
  StaffNotRosteredException,
  StaffOnLeaveException,
} from '../errors/attendance-domain.errors';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../repositories/attendance.repository';
import { AttendanceCredentialValidator } from './attendance-credential.validator';
import { AttendanceRosterCandidateResolver } from './attendance-roster-candidate.resolver';
import {
  CandidateScheduledSession,
  resolveActiveSessionForCheckIn,
} from './attendance-session.resolver';
import { AttendanceTimingService } from './attendance-timing.service';
import { CheckoutTicketService } from './checkout-ticket.service';

export interface CheckInEligibilityParams {
  staffId: string;
  targetDate: string;
  dow: number;
  resolvedSessionId?: string | null;
  shift?: string;
  qrToken?: string;
  method?: AttendanceMethod;
  isAdministrativeEntry?: boolean;
}

export interface CheckInEligibilityResult {
  isEligible: boolean;
  isReplacement: boolean;
  replacementOpportunityId: string | null;
  resolvedSession: CandidateScheduledSession;
  qrSessionId: string | null;
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

/**
 * Single Source of Truth for Check-In and Check-Out eligibility orchestration.
 * Enforces the strict 5-layer defense hierarchy across mobile and web entry points.
 */
@Injectable()
export class AttendanceEligibilityService {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
    private readonly timingService: AttendanceTimingService,
    private readonly ticketService: CheckoutTicketService,
    private readonly credentialValidator: AttendanceCredentialValidator,
    private readonly candidateResolver: AttendanceRosterCandidateResolver,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
    @Optional()
    private readonly clinicConfigService?: ClinicConfigService,
  ) {}

  /**
   * Single Source of Truth for Check-In eligibility and state verification.
   *
   * Hierarki Pertahanan:
   * 1. Validasi Kredensial / Bukti Kehadiran Fisik (QR Token / PIN Manual)
   * 2. Validasi Cuti / Izin Resmi Aktif
   * 3. Resolusi Kandidat Sesi Terjadwal (Replacement > Staf > Dokter > Template)
   * 4. Resolusi Sesi Dinamis & Jendela Waktu Dinas
   * 5. Validasi State Machine Presensi (Shift-Aware)
   */
  async verifyCheckInEligibility(
    params: CheckInEligibilityParams,
  ): Promise<CheckInEligibilityResult> {
    const {
      staffId,
      targetDate,
      dow,
      resolvedSessionId,
      shift,
      qrToken,
      method,
      isAdministrativeEntry = false,
    } = params;

    let qrSessionId: string | null = null;
    let tokenShift: string | undefined;

    // 1. Layer 1: Validasi Kredensial / Token QR / PIN Manual
    if (!isAdministrativeEntry && qrToken) {
      const verified = await this.credentialValidator.verifyProximityToken(
        this.repo,
        qrToken,
        method,
      );
      qrSessionId = verified.qrSessionId;
      tokenShift = verified.shift;
    } else if (!isAdministrativeEntry && !qrToken) {
      if (method === 'manual_pin') {
        throw new InvalidManualCodeException(
          'Kode presensi dinas klinik wajib disertakan.',
        );
      }
      throw new InvalidQrTokenException(
        'Token QR presensi wajib disertakan.',
      );
    }

    // 2. Layer 2: Validasi Cuti / Izin Resmi
    const onLeave = await this.repo.findApprovedLeave(staffId, targetDate);
    if (onLeave) {
      throw new StaffOnLeaveException();
    }

    // 3. Layer 3: Kumpulkan Sesi Terjadwal Berdasarkan Prioritas Roster
    const now = this.clinicTimeService?.nowDate() ?? new Date();
    // Only explicit user request (e.g. from admin body) sets requestedShift.
    // tokenShift from QR terminal is physical proof & hint, not an explicit restriction.
    const requestedShift = shift;

    const { candidateSessions, claimedReplacementId } =
      await this.candidateResolver.resolveCandidates(this.repo, {
        staffId,
        targetDate,
        dow,
        isAdministrativeEntry,
        requestedShift,
        requestedSessionId: resolvedSessionId,
        nowTime: now,
      });

    if (!isAdministrativeEntry && candidateSessions.length === 0) {
      throw new StaffNotRosteredException();
    }

    // 4. Layer 4: Resolusi Sesi Dinamis & Jendela Waktu
    const config = await this.clinicConfigService?.getAttendanceConfig();
    const checkInWindowMinutesBefore =
      config?.checkInWindowMinutesBefore ?? 30;

    const activeResolution = resolveActiveSessionForCheckIn({
      candidateSessions,
      currentTime: now,
      checkInWindowMinutesBefore: isAdministrativeEntry
        ? 1440 // Admin entry tidak dibatasi jendela jam
        : checkInWindowMinutesBefore,
      requestedShift,
      requestedSessionId: resolvedSessionId,
      shiftHint: tokenShift,
      isAdministrativeEntry,
    });

    const targetShift = activeResolution.session.shift;

    // 5. Layer 5: Validasi State Machine Presensi (Shift-Aware)
    const existing = await this.repo.findStaffAttendanceForDateAndShift(
      staffId,
      targetDate,
      targetShift,
    );

    if (existing) {
      if (existing.checkOutAt) {
        throw new AttendanceAlreadyCheckedOutException(
          `Staf sudah melakukan presensi pulang (checkout) pada sesi shift '${targetShift}' hari ini.`,
        );
      }
      if (existing.checkInAt) {
        throw new DuplicateAttendanceException(
          `Staf sudah melakukan presensi masuk untuk sesi shift '${targetShift}' tanggal ini.`,
        );
      }
    }

    const isReplacement = Boolean(
      activeResolution.session.isReplacement ||
        (claimedReplacementId &&
          activeResolution.session.id === claimedReplacementId),
    );

    const replacementOpportunityId = isReplacement
      ? activeResolution.session.replacementOpportunityId || claimedReplacementId
      : null;

    return {
      isEligible: true,
      isReplacement,
      replacementOpportunityId: isReplacement ? claimedReplacementId : null,
      resolvedSession: activeResolution.session,
      qrSessionId,
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
   *
   * Hierarki Pertahanan:
   * 1. Validasi Kredensial / Bukti Kehadiran Pulang (QR Token / PIN Manual / Ticket / Admin)
   * 2. Validasi State Machine (Harus ada catatan masuk terbuka yang belum checkout)
   * 3. Evaluasi Timing & Kepulangan Lebih Awal (Early Departure)
   * 4. Validasi Catatan Alasan Kepulangan Lebih Awal (Wajib jika early departure pada mobile)
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

    // 1. Layer 1: Validasi Kredensial / Bukti Kehadiran Pulang (PRIORITAS PERTAMA)
    let proximityVerified = Boolean(isAdministrativeEntry);

    if (!proximityVerified && checkoutTicket) {
      const openRecord = await this.repo.findOpenAttendanceRecord(
        staffId,
        targetDate,
      );
      const targetRecordId = openRecord?.id || 'pending';
      const ticketResult = this.credentialValidator.verifyCheckoutTicket(
        checkoutTicket,
        staffId,
        targetRecordId,
      );
      proximityVerified = ticketResult.proximityVerified;
    }

    if (!proximityVerified && qrToken) {
      const verified = await this.credentialValidator.verifyProximityToken(
        this.repo,
        qrToken,
        params.method,
      );
      proximityVerified = verified.proximityVerified;
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

    // 2. Layer 2: Validasi State Machine (Cari Catatan Terbuka)
    const existing = await this.repo.findOpenAttendanceRecord(
      staffId,
      targetDate,
    );

    if (!existing || !existing.checkInAt) {
      const anyRecordToday = await this.repo.findStaffAttendanceForDate(
        staffId,
        targetDate,
      );
      if (anyRecordToday && anyRecordToday.checkOutAt) {
        throw new AttendanceAlreadyCheckedOutException(
          'Presensi pulang dinas sudah tercatat sebelumnya pada tanggal ini. Tidak ada sesi dinas terbuka yang perlu ditutup.',
        );
      }
      throw new AttendanceRecordNotFoundException(
        'Data presensi masuk untuk tanggal ini tidak ditemukan. Silakan lakukan check-in terlebih dahulu.',
      );
    }

    // 3. Layer 3: Resolusi Jam Selesai Terjadwal & Evaluasi Timing
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

    const timingEval = await this.timingService.evaluateCheckOutTiming({
      checkInTime: checkInDate,
      checkOutTime: checkOutDate,
      scheduledEndTime,
      scheduledShiftDurationHours,
    });

    // 4. Layer 4: Penegakan Kewajiban Catatan Alasan untuk Kepulangan Lebih Awal (Semua Aktor)
    const notesTrimmed = notes?.trim() || null;
    if (timingEval.requiresNotes && !notesTrimmed) {
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
