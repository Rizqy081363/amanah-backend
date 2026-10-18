import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class StaffOnLeaveException extends ForbiddenException {
  constructor() {
    super(
      'Staf sedang dalam masa cuti / izin resmi yang telah disetujui pada tanggal ini',
    );
  }
}

export class StaffNotRosteredException extends ForbiddenException {
  constructor() {
    super(
      'Staf tidak memiliki jadwal dinas (roster) pada hari ini. Presensi hanya diizinkan bagi staf yang memiliki jadwal dinas atau mengambil jadwal pengganti (replacement).',
    );
  }
}

export class SessionMismatchException extends ForbiddenException {
  constructor() {
    super(
      'Staf tidak memiliki jadwal dinas pada sesi waktu ini. Silakan melakukan presensi pada jam sesi dinas yang telah dijadwalkan.',
    );
  }
}

export class InvalidQrTokenException extends BadRequestException {
  constructor(message: string = 'Token QR tidak valid atau sudah kedaluwarsa') {
    super(message);
  }
}

export class StaffNotFoundException extends NotFoundException {
  constructor(identifier: string) {
    super(`Staf dengan identifikasi "${identifier}" tidak ditemukan`);
  }
}

export class AttendanceRecordNotFoundException extends NotFoundException {
  constructor(
    message: string = 'Data presensi masuk untuk tanggal ini tidak ditemukan. Silakan lakukan check-in terlebih dahulu.',
  ) {
    super(message);
  }
}

export class DuplicateAttendanceException extends ConflictException {
  constructor(
    message: string = 'Staf sudah melakukan presensi masuk untuk tanggal ini.',
  ) {
    super(message);
  }
}

export class AttendanceAlreadyCheckedOutException extends ConflictException {
  constructor(
    message: string = 'Presensi pulang dinas sudah tercatat sebelumnya pada tanggal ini.',
  ) {
    super(message);
  }
}
