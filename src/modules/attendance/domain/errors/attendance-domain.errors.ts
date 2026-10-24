import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class StaffOnLeaveException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: 'STAFF_ON_LEAVE',
      message:
        'Staf sedang dalam masa cuti / izin resmi yang telah disetujui pada tanggal ini',
    });
  }
}

export class StaffNotRosteredException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: 'STAFF_NOT_ROSTERED',
      message:
        'Staf tidak memiliki jadwal dinas (roster) pada hari ini. Presensi hanya diizinkan bagi staf yang memiliki jadwal dinas atau mengambil jadwal pengganti (replacement).',
    });
  }
}

export class SessionMismatchException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      code: 'SESSION_MISMATCH',
      message:
        'Staf tidak memiliki jadwal dinas pada sesi waktu ini. Silakan melakukan presensi pada jam sesi dinas yang telah dijadwalkan.',
    });
  }
}

export class InvalidQrTokenException extends BadRequestException {
  constructor(message: string = 'Token QR tidak valid atau sudah kedaluwarsa') {
    super({
      statusCode: 400,
      code: 'INVALID_QR_TOKEN',
      message,
    });
  }
}

export class InvalidManualCodeException extends BadRequestException {
  constructor(
    message: string = 'Kode presensi tidak valid atau sudah kedaluwarsa',
  ) {
    super({
      statusCode: 400,
      code: 'INVALID_MANUAL_CODE',
      message,
    });
  }
}

export class StaffNotFoundException extends NotFoundException {
  constructor(identifier: string) {
    super({
      statusCode: 404,
      code: 'STAFF_NOT_FOUND',
      message: `Staf dengan identifikasi "${identifier}" tidak ditemukan`,
    });
  }
}

export class AttendanceRecordNotFoundException extends NotFoundException {
  constructor(
    message: string = 'Data presensi masuk untuk tanggal ini tidak ditemukan. Silakan lakukan check-in terlebih dahulu.',
  ) {
    super({
      statusCode: 404,
      code: 'ATTENDANCE_NOT_FOUND',
      message,
    });
  }
}

export class DuplicateAttendanceException extends ConflictException {
  constructor(
    message: string = 'Staf sudah melakukan presensi masuk untuk tanggal ini.',
  ) {
    super({
      statusCode: 409,
      code: 'DUPLICATE_CHECK_IN',
      message,
    });
  }
}

export class AttendanceAlreadyCheckedOutException extends ConflictException {
  constructor(
    message: string = 'Presensi pulang dinas sudah tercatat sebelumnya pada tanggal ini.',
  ) {
    super({
      statusCode: 409,
      code: 'ALREADY_CHECKED_OUT',
      message,
    });
  }
}

export class EarlyDepartureNotesRequiredException extends BadRequestException {
  constructor(payload?: {
    checkoutTicket?: string;
    expiresAt?: string;
    message?: string;
  }) {
    super({
      statusCode: 400,
      code: 'EARLY_DEPARTURE_NOTES_REQUIRED',
      message:
        payload?.message ||
        'Catatan alasan kepulangan lebih awal wajib diisi karena presensi pulang dilakukan sebelum jendela kepulangan normal.',
      requiresNotes: true,
      checkoutTicket: payload?.checkoutTicket,
      expiresAt: payload?.expiresAt,
    });
  }
}
