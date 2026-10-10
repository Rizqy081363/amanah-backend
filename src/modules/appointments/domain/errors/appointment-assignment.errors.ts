import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class AppointmentNotFoundException extends NotFoundException {
  constructor(appointmentId: string) {
    super({
      code: 'APPOINTMENT_NOT_FOUND',
      message: `Janji temu dengan ID ${appointmentId} tidak ditemukan.`,
    });
  }
}

export class AppointmentTerminalStateException extends BadRequestException {
  constructor(status: string) {
    super({
      code: 'APPOINTMENT_TERMINAL_STATE',
      message: `Janji temu tidak dapat dialihkan karena berstatus "${status}".`,
    });
  }
}

export class DoctorCollisionException extends ConflictException {
  constructor(doctorName: string, scheduledTime: string) {
    super({
      code: 'DOCTOR_COLLISION',
      message: `Dokter ${doctorName} sudah memiliki janji temu aktif pada jam ${scheduledTime}.`,
      doctorName,
      scheduledTime,
    });
  }
}

export class RoomOccupiedException extends ConflictException {
  constructor(roomName: string, scheduledTime: string) {
    super({
      code: 'ROOM_OCCUPIED',
      message: `${roomName} sudah terisi oleh jadwal/janji temu lain pada jam ${scheduledTime}.`,
      roomName,
      scheduledTime,
    });
  }
}
