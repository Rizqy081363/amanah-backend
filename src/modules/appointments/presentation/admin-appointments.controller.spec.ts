jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
  toNodeHandler: jest.fn(),
}));

jest.mock('../../../auth/better-auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AppointmentsService } from '../application/appointments.service';
import { AdminAppointmentsController } from './admin-appointments.controller';

describe('AdminAppointmentsController', () => {
  let controller: AdminAppointmentsController;
  let mockAppointmentsService: jest.Mocked<Partial<AppointmentsService>>;

  beforeEach(async () => {
    mockAppointmentsService = {
      cancelAdminAppointment: jest.fn(),
      updateAdminAppointmentStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: mockAppointmentsService,
        },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminAppointmentsController>(
      AdminAppointmentsController,
    );
  });

  describe('cancelAppointment', () => {
    it('should cancel an appointment and recover session slot', async () => {
      const mockResult = {
        success: true,
        message:
          'Janji temu berhasil dibatalkan dan 1 slot kuota sesi telah dipulihkan',
        data: {
          appointmentId: 'apt-uuid-1',
          previousStatus: 'waiting',
          newStatus: 'cancelled',
          cancelledAt: '2026-09-24T08:00:00.000Z',
          cancelReason: 'Pasien berhalangan hadir',
          scheduleSession: {
            sessionId: 'sess-uuid-1',
            restoredAvailableSlots: 5,
            totalCapacity: 12,
            sessionStatus: 'open',
          },
        },
      };

      (
        mockAppointmentsService.cancelAdminAppointment as jest.Mock
      ).mockResolvedValue(mockResult);

      const body = {
        reason: 'Pasien berhalangan hadir',
        isNoShow: false,
      };
      const user = { id: 'admin-1', role: 'ADMIN' };

      const result = await controller.cancelAppointment(
        'apt-uuid-1',
        body,
        user,
      );

      expect(
        mockAppointmentsService.cancelAdminAppointment,
      ).toHaveBeenCalledWith('apt-uuid-1', body, user);
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateStatus', () => {
    it('should transition appointment status and log reason', async () => {
      const mockResult = {
        success: true,
        message: 'Status janji temu berhasil diubah menjadi in_service',
        data: {
          appointmentId: 'apt-uuid-1',
          previousStatus: 'waiting',
          newStatus: 'in_service',
          updatedAt: '2026-09-24T08:15:00.000Z',
          reason: 'Pasien dipanggil',
          scheduleSession: null,
        },
      };

      (
        mockAppointmentsService.updateAdminAppointmentStatus as jest.Mock
      ).mockResolvedValue(mockResult);

      const body = {
        status: 'in_service',
        reason: 'Pasien dipanggil',
      };
      const user = { id: 'admin-1', role: 'ADMIN' };

      const result = await controller.updateStatus('apt-uuid-1', body, user);

      expect(
        mockAppointmentsService.updateAdminAppointmentStatus,
      ).toHaveBeenCalledWith('apt-uuid-1', body, user);
      expect(result).toEqual(mockResult);
    });
  });
});
