import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  APPOINTMENT_CALL_STATUS,
  APPOINTMENT_EVENTS,
  MAX_PATIENT_CALL_ATTEMPTS,
} from '../domain/constants/appointment-lifecycle.constants';
import { AppointmentCallLifecycleService } from './appointment-call-lifecycle.service';

describe('AppointmentCallLifecycleService', () => {
  let service: AppointmentCallLifecycleService;
  let mockCallRepo: any;
  let mockPublisher: any;

  beforeEach(() => {
    mockCallRepo = {
      getAppointmentWithDetails: mock().mockResolvedValue({
        id: 'apt-1',
        status: 'confirmed',
        bookingCode: 'BK-001',
        patientId: 'patient-prof-1',
        patientUserId: 'user-patient-1',
        patientName: 'Ahmad Dahlan',
        ticketId: 'ticket-1',
        ticketNumber: 'A-01',
        ticketStatus: 'waiting',
        poliklinikName: 'Poli Umum',
      }),
      getLatestAttempt: mock().mockResolvedValue(null),
      recordCallAttempt: mock().mockResolvedValue({
        id: 'att-1',
        appointmentId: 'apt-1',
        attemptNumber: 1,
        status: APPOINTMENT_CALL_STATUS.CALLED,
      }),
      updateAttemptStatus: mock().mockResolvedValue(undefined),
      updateAppointmentAndTicketStatus: mock().mockResolvedValue(undefined),
      requeueTicket: mock().mockResolvedValue(undefined),
    };

    mockPublisher = {
      publish: mock().mockResolvedValue(undefined),
    };

    service = new AppointmentCallLifecycleService(mockCallRepo, mockPublisher);
  });

  it('should successfully make the 1st call attempt and publish domain event', async () => {
    const result = await service.callPatient('apt-1', 'staff-user-1');

    expect(result.attemptNumber).toBe(1);
    expect(result.maxAttempts).toBe(MAX_PATIENT_CALL_ATTEMPTS);
    expect(result.status).toBe(APPOINTMENT_CALL_STATUS.CALLED);

    expect(mockCallRepo.recordCallAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: 'apt-1',
        attemptNumber: 1,
        status: APPOINTMENT_CALL_STATUS.CALLED,
        calledBy: 'staff-user-1',
      }),
    );

    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: APPOINTMENT_EVENTS.PATIENT_CALLED,
        payload: expect.objectContaining({
          appointmentId: 'apt-1',
          attemptNumber: 1,
          ticketNumber: 'A-01',
          patientUserId: 'user-patient-1',
        }),
      }),
    );
  });

  it('should allow call beyond attempt 3 without artificial limit', async () => {
    mockCallRepo.getLatestAttempt.mockResolvedValue({
      id: 'att-3',
      appointmentId: 'apt-1',
      attemptNumber: 3,
      status: APPOINTMENT_CALL_STATUS.NO_RESPONSE,
    });

    const result = await service.callPatient('apt-1', 'staff-user-1');
    expect(result.attemptNumber).toBe(4);
    expect(result.status).toBe(APPOINTMENT_CALL_STATUS.CALLED);
  });

  it('should mark previous call as no_response if a new call is made before response', async () => {
    mockCallRepo.getLatestAttempt.mockResolvedValue({
      id: 'att-1',
      appointmentId: 'apt-1',
      attemptNumber: 1,
      status: APPOINTMENT_CALL_STATUS.CALLED,
    });

    await service.callPatient('apt-1', 'staff-user-1');

    expect(mockCallRepo.updateAttemptStatus).toHaveBeenCalledWith(
      'att-1',
      APPOINTMENT_CALL_STATUS.NO_RESPONSE,
    );
  });

  it('should handle patient response and update statuses', async () => {
    mockCallRepo.getLatestAttempt.mockResolvedValue({
      id: 'att-1',
      appointmentId: 'apt-1',
      attemptNumber: 1,
      status: APPOINTMENT_CALL_STATUS.CALLED,
    });

    const result = await service.patientResponded('apt-1', 'staff-user-1');

    expect(result.status).toBe(APPOINTMENT_CALL_STATUS.RESPONDED);
    expect(mockCallRepo.updateAttemptStatus).toHaveBeenCalledWith(
      'att-1',
      APPOINTMENT_CALL_STATUS.RESPONDED,
      expect.any(String),
    );
    expect(mockCallRepo.updateAppointmentAndTicketStatus).toHaveBeenCalledWith(
      'apt-1',
      'in_service',
      'ticket-1',
      'in_service',
    );
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: APPOINTMENT_EVENTS.PATIENT_RESPONDED,
      }),
    );
  });

  it('should requeue patient when no-show occurs on attempt 1 or 2', async () => {
    mockCallRepo.getLatestAttempt.mockResolvedValue({
      id: 'att-2',
      appointmentId: 'apt-1',
      attemptNumber: 2,
      status: APPOINTMENT_CALL_STATUS.CALLED,
    });

    const result = await service.patientNoShow('apt-1', 'staff-user-1');

    expect(result.requeued).toBe(true);
    expect(result.remainingAttempts).toBe(1);
    expect(mockCallRepo.requeueTicket).toHaveBeenCalledWith('ticket-1', 3);
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: APPOINTMENT_EVENTS.PATIENT_REQUEUED,
        payload: expect.objectContaining({
          attemptNumber: 2,
          remainingAttempts: 1,
        }),
      }),
    );
  });

  it('should transition to NO_SHOW when no-show occurs on 3rd attempt', async () => {
    mockCallRepo.getLatestAttempt.mockResolvedValue({
      id: 'att-3',
      appointmentId: 'apt-1',
      attemptNumber: 3,
      status: APPOINTMENT_CALL_STATUS.CALLED,
    });

    const result = await service.patientNoShow('apt-1', 'staff-user-1');

    expect(result.noShow).toBe(true);
    expect(result.status).toBe('no_show');
    expect(mockCallRepo.updateAppointmentAndTicketStatus).toHaveBeenCalledWith(
      'apt-1',
      'no_show',
      'ticket-1',
      'skipped',
    );
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: APPOINTMENT_EVENTS.NO_SHOW,
        payload: expect.objectContaining({
          totalAttempts: 3,
        }),
      }),
    );
  });
});
