import { HttpStatus } from '@nestjs/common';
import {
  DomainConflictException,
  DomainException,
  DomainForbiddenException,
  DomainValidationException,
  EntityNotFoundException,
} from '../../../../common/exceptions';

export class StaffOnLeaveException extends DomainForbiddenException {
  constructor() {
    super(
      'Staf sedang dalam masa cuti / izin resmi yang telah disetujui pada tanggal ini',
      'STAFF_ON_LEAVE',
    );
  }
}

export class StaffNotRosteredException extends DomainForbiddenException {
  constructor() {
    super(
      'Staf tidak memiliki jadwal dinas (roster) pada hari ini. Presensi hanya diizinkan bagi staf yang memiliki jadwal dinas atau mengambil jadwal pengganti (replacement).',
      'STAFF_NOT_ROSTERED',
    );
  }
}

export class SessionMismatchException extends DomainForbiddenException {
  constructor() {
    super(
      'Staf tidak memiliki jadwal dinas pada sesi waktu ini. Silakan melakukan presensi pada jam sesi dinas yang telah dijadwalkan.',
      'SESSION_MISMATCH',
    );
  }
}

export class InvalidQrTokenException extends DomainValidationException {
  constructor(message: string = 'Token QR tidak valid atau sudah kedaluwarsa') {
    super(message, [
      { name: 'qrToken', reason: message, code: 'INVALID_QR_TOKEN' },
    ]);
  }
}

export class InvalidManualCodeException extends DomainValidationException {
  constructor(
    message: string = 'Kode presensi tidak valid atau sudah kedaluwarsa',
  ) {
    super(message, [
      { name: 'qrToken', reason: message, code: 'INVALID_MANUAL_CODE' },
    ]);
  }
}

export class StaffNotFoundException extends EntityNotFoundException {
  constructor(identifier: string) {
    super('Staf', identifier);
  }
}

export class AttendanceRecordNotFoundException extends EntityNotFoundException {
  constructor(
    message: string = 'Data presensi masuk untuk tanggal ini tidak ditemukan. Silakan lakukan check-in terlebih dahulu.',
  ) {
    super('Presensi', message);
  }
}

export class DuplicateAttendanceException extends DomainConflictException {
  constructor(
    message: string = 'Staf sudah melakukan presensi masuk untuk tanggal ini.',
  ) {
    super('DUPLICATE_CHECK_IN', message);
  }
}

export class AttendanceAlreadyCheckedOutException extends DomainConflictException {
  constructor(
    message: string = 'Presensi pulang dinas sudah tercatat sebelumnya pada tanggal ini.',
  ) {
    super('ALREADY_CHECKED_OUT', message);
  }
}

export class EarlyDepartureNotesRequiredException extends DomainException {
  constructor(payload?: {
    checkoutTicket?: string;
    expiresAt?: string;
    message?: string;
  }) {
    super(
      'EARLY_DEPARTURE_NOTES_REQUIRED',
      payload?.message ||
        'Catatan alasan kepulangan lebih awal wajib diisi karena presensi pulang dilakukan sebelum jendela kepulangan normal.',
      HttpStatus.BAD_REQUEST,
      {
        requiresNotes: true,
        checkoutTicket: payload?.checkoutTicket,
        expiresAt: payload?.expiresAt,
      },
    );
  }
}
