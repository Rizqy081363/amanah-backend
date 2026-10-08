import { beforeEach, describe, expect, it, mock } from 'bun:test';

mock.module('better-auth/node', () => ({
  fromNodeHeaders: mock(),
  toNodeHandler: mock(),
}));

mock.module('../../../auth/better-auth/auth', () => ({
  auth: {
    api: {
      getSession: mock(),
    },
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HybridAuthGuard } from '../../../common/auth/hybrid-auth.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AppointmentsService } from '../application/appointments.service';
import { AppointmentCandidateResolver } from '../application/resolvers/appointment-candidate.resolver';
import { AppointmentAssignmentService } from '../application/services/appointment-assignment.service';
import { AdminAppointmentsController } from './admin-appointments.controller';

describe('AdminAppointmentsController', () => {
  let controller: AdminAppointmentsController;
  let mockAppointmentsService: any;
  let mockCandidateResolver: any;
  let mockAssignmentService: any;

  beforeEach(async () => {
    mockAppointmentsService = {
      cancelAdminAppointment: mock(),
      updateAdminAppointmentStatus: mock(),
    };

    mockCandidateResolver = {
      resolveDoctorCandidates: mock(),
      resolveRoomCandidates: mock(),
    };

    mockAssignmentService = {
      changeDoctor: mock(),
      changeRoom: mock(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: mockAppointmentsService,
        },
        {
          provide: AppointmentCandidateResolver,
          useValue: mockCandidateResolver,
        },
        {
          provide: AppointmentAssignmentService,
          useValue: mockAssignmentService,
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
        message: 'Janji temu berhasil dibatalkan',
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

      mockAppointmentsService.cancelAdminAppointment.mockResolvedValue(
        mockResult,
      );

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

      mockAppointmentsService.updateAdminAppointmentStatus.mockResolvedValue(
        mockResult,
      );

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

  describe('candidate resolution', () => {
    it('should delegate getDoctorCandidates to candidateResolver', async () => {
      const mockResult = { groups: [] };
      mockCandidateResolver.resolveDoctorCandidates.mockResolvedValue(
        mockResult,
      );

      const result = await controller.getDoctorCandidates('apt-uuid-1');
      expect(
        mockCandidateResolver.resolveDoctorCandidates,
      ).toHaveBeenCalledWith('apt-uuid-1');
      expect(result).toEqual(mockResult as any);
    });

    it('should delegate getRoomCandidates to candidateResolver', async () => {
      const mockResult: any[] = [];
      mockCandidateResolver.resolveRoomCandidates.mockResolvedValue(mockResult);

      const result = await controller.getRoomCandidates('apt-uuid-1');
      expect(mockCandidateResolver.resolveRoomCandidates).toHaveBeenCalledWith(
        'apt-uuid-1',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('appointment reassignment', () => {
    it('should delegate changeDoctor to assignmentService', async () => {
      const mockResult = { id: 'apt-uuid-1', practitionerId: 'doc-new' };
      mockAssignmentService.changeDoctor.mockResolvedValue(mockResult);

      const user = { id: 'admin-1', role: 'ADMIN' };
      const result = await controller.changeDoctor(
        'apt-uuid-1',
        { doctorId: 'doc-new' },
        user,
      );

      expect(mockAssignmentService.changeDoctor).toHaveBeenCalledWith(
        'apt-uuid-1',
        'doc-new',
        { closeOldSchedule: undefined, reason: undefined },
        user,
      );

      expect(result).toEqual({
        message: 'Dokter berhasil dialihkan',
        data: mockResult,
      } as any);
    });

    it('should delegate changeDoctor with closeOldSchedule and reason options', async () => {
      const mockResult = { id: 'apt-uuid-1', practitionerId: 'doc-new' };
      mockAssignmentService.changeDoctor.mockResolvedValue(mockResult);

      const user = { id: 'admin-1', role: 'ADMIN' };
      const result = await controller.changeDoctor(
        'apt-uuid-1',
        {
          doctorId: 'doc-new',
          closeOldSchedule: true,
          reason: 'Dokter berhalangan hadir',
        },
        user,
      );

      expect(mockAssignmentService.changeDoctor).toHaveBeenCalledWith(
        'apt-uuid-1',
        'doc-new',
        { closeOldSchedule: true, reason: 'Dokter berhalangan hadir' },
        user,
      );
      expect(result).toEqual({
        message: 'Dokter berhasil dialihkan',
        data: mockResult,
      } as any);
    });

    it('should delegate changeRoom to assignmentService', async () => {
      const mockResult = { id: 'apt-uuid-1', roomId: 'room-new' };
      mockAssignmentService.changeRoom.mockResolvedValue(mockResult);

      const user = { id: 'admin-1', role: 'ADMIN' };
      const result = await controller.changeRoom(
        'apt-uuid-1',
        { roomId: 'room-new' },
        user,
      );

      expect(mockAssignmentService.changeRoom).toHaveBeenCalledWith(
        'apt-uuid-1',
        'room-new',
        user,
      );
      expect(result).toEqual({
        message: 'Ruangan berhasil dialihkan',
        data: mockResult,
      } as any);
    });
  });
});
