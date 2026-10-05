import { describe, expect, it } from 'bun:test';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
  DoctorCollisionException,
  RoomOccupiedException,
} from './appointment-assignment.errors';

describe('AppointmentAssignmentErrors', () => {
  it('should create AppointmentNotFoundException with 404 status', () => {
    const error = new AppointmentNotFoundException('apt-123');
    expect(error.getStatus()).toBe(404);
    expect(error.message).toContain('apt-123');
  });

  it('should create AppointmentTerminalStateException with 400 status', () => {
    const error = new AppointmentTerminalStateException('completed');
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      code: 'APPOINTMENT_TERMINAL_STATE',
    });
  });

  it('should create DoctorCollisionException with 409 status and metadata', () => {
    const error = new DoctorCollisionException('Dr. B', '08:30 - 09:00 WIB');
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      code: 'DOCTOR_COLLISION',
      doctorName: 'Dr. B',
      timeSlot: '08:30 - 09:00 WIB',
    });
  });

  it('should create RoomOccupiedException with 409 status', () => {
    const error = new RoomOccupiedException(
      'Ruang Poli 1',
      '08:30 - 09:00 WIB',
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'ROOM_OCCUPIED' });
  });
});
