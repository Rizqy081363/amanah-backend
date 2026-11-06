import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../../../../common/exceptions/domain.exceptions';

/**
 * Thrown when staff exceeds monthly leave limit configured by clinic policy.
 */
export class LeaveQuotaExceededException extends DomainException {
  constructor(
    limit: number,
    used: number,
    unit: 'kali' | 'sesi',
    message?: string,
  ) {
    const defaultMsg = `Batas kuota cuti tercapai (${limit} ${unit}/bulan). Anda sudah menggunakan ${used} ${unit}.`;
    super(
      'LEAVE_QUOTA_EXCEEDED',
      message || defaultMsg,
      HttpStatus.BAD_REQUEST,
      {
        limit,
        used,
        unit,
      },
    );
  }
}

/**
 * Thrown when staff submits leave earlier than minimum lead time (notice days) required by clinic policy.
 */
export class LeaveNoticeDaysRequiredException extends DomainException {
  constructor(
    noticeDaysRequired: number,
    minAllowedDate: string,
    message?: string,
  ) {
    const defaultMsg = `Izin harus diajukan minimal H-${noticeDaysRequired} hari sebelum tanggal dinas (paling cepat ${minAllowedDate}).`;
    super(
      'LEAVE_NOTICE_DAYS_REQUIRED',
      message || defaultMsg,
      HttpStatus.BAD_REQUEST,
      {
        noticeDaysRequired,
        minAllowedDate,
      },
    );
  }
}

/**
 * Thrown when previous leave period has not finished under 'previous_period_must_finish' policy.
 */
export class LeavePreviousPeriodActiveException extends DomainException {
  constructor(activePeriodRange: string, message?: string) {
    const defaultMsg = `Izin sebelumnya (${activePeriodRange}) masih berjalan. Selesaikan periode tersebut sebelum mengajukan izin baru.`;
    super(
      'LEAVE_PREVIOUS_PERIOD_ACTIVE',
      message || defaultMsg,
      HttpStatus.BAD_REQUEST,
      {
        activePeriodRange,
      },
    );
  }
}

/**
 * Thrown when requested leave interval overlaps with existing pending or approved leave request.
 */
export class LeaveOverlappingConflictException extends DomainException {
  constructor(
    conflictingRange: string,
    status: 'pending' | 'approved',
    message?: string,
  ) {
    const defaultMsg = `Jadwal izin bentrok dengan permohonan yang ada (${conflictingRange}).`;
    super(
      'LEAVE_OVERLAPPING_CONFLICT',
      message || defaultMsg,
      HttpStatus.BAD_REQUEST,
      {
        conflictingRange,
        status,
      },
    );
  }
}

/**
 * Thrown when clinic is closed across the requested date range.
 */
export class LeaveClinicClosedException extends DomainException {
  constructor(
    message = 'Klinik libur/tutup pada tanggal yang dipilih.',
  ) {
    super('LEAVE_CLINIC_CLOSED', message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * Thrown when requested date has no active or eligible duty sessions for the staff.
 */
export class LeaveScheduleUnavailableException extends DomainException {
  constructor(message: string, reasonCode?: string) {
    super(
      'LEAVE_SCHEDULE_UNAVAILABLE',
      message,
      HttpStatus.BAD_REQUEST,
      reasonCode ? { reasonCode } : undefined,
    );
  }
}
