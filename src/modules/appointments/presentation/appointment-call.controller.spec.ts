import { describe, expect, it, jest } from 'bun:test';
import { AppointmentCallController } from './appointment-call.controller';

describe('AppointmentCallController', () => {
  const mockCallService = {
    callPatient: jest.fn().mockResolvedValue({
      attemptNumber: 1,
      maxAttempts: 3,
      status: 'called',
    }),
    patientResponded: jest.fn().mockResolvedValue({
      status: 'responded',
    }),
    patientNoShow: jest.fn().mockResolvedValue({
      requeued: true,
      attemptNumber: 1,
      remainingAttempts: 2,
      status: 'waiting',
    }),
  };

  const mockCallRepo = {
    findAttemptsByAppointmentId: jest.fn().mockResolvedValue([
      {
        id: 'attempt-1',
        attemptNumber: 1,
        status: 'called',
      },
    ]),
  };

  const controller = new AppointmentCallController(
    mockCallService as any,
    mockCallRepo as any,
  );

  it('should call patient and return attempt info', async () => {
    const res = await controller.callPatient(
      '00000000-0000-0000-0000-000000000001',
      { notes: 'Panggilan pertama' },
      { id: 'user-staff-1' },
    );

    expect(res).toEqual({
      attemptNumber: 1,
      maxAttempts: 3,
      status: 'called',
    });
    expect(mockCallService.callPatient).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'user-staff-1',
      'Panggilan pertama',
    );
  });

  it('should confirm patient response', async () => {
    const res = await controller.patientResponded(
      '00000000-0000-0000-0000-000000000001',
      { id: 'user-staff-1' },
    );

    expect(res).toEqual({ status: 'responded' });
    expect(mockCallService.patientResponded).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'user-staff-1',
    );
  });

  it('should handle patient no show', async () => {
    const res = await controller.patientNoShow(
      '00000000-0000-0000-0000-000000000001',
      { notes: 'Tidak merespons' },
      { id: 'user-staff-1' },
    );

    expect(res.status).toBe('waiting');
    expect(mockCallService.patientNoShow).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      'user-staff-1',
      'Tidak merespons',
    );
  });

  it('should retrieve call attempts', async () => {
    const res = await controller.getCallAttempts(
      '00000000-0000-0000-0000-000000000001',
    );

    expect(res).toHaveLength(1);
    expect(mockCallRepo.findAttemptsByAppointmentId).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
    );
  });
});
