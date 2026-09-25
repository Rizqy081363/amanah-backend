import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { RolesGuard } from '@common/auth/roles.guard';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
  toNodeHandler: jest.fn(),
}));

jest.mock('@/auth/better-auth/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { SchedulesController } from './schedules.controller';

describe('SchedulesController', () => {
  let controller: SchedulesController;
  let mockScheduleRepo: jest.Mocked<ScheduleRepository>;

  const mockStaffUser = {
    id: 'user-uuid-1',
    systemRole: 'STAF',
    staff: {
      id: 'staff-uuid-1',
      practitionerId: 'practitioner-uuid-1',
      fullName: 'dr. Sarah Jenkins, Sp.A',
    },
  };

  const _mockOtherDoctorUser = {
    id: 'user-uuid-3',
    systemRole: 'STAF',
    staff: {
      id: 'staff-uuid-2',
      practitionerId: 'practitioner-uuid-2',
      fullName: 'dr. Rayhan Pratama, Sp.A',
    },
  };

  const mockPatientUser = {
    id: 'user-uuid-2',
    systemRole: 'PATIENT',
    patient: {
      id: 'patient-uuid-1',
    },
  };

  beforeEach(async () => {
    mockScheduleRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findByStaffId: jest.fn(),
      findMySchedules: jest.fn(),
      findByPoliAndDate: jest.fn(),
      update: jest.fn(),
      toggleAvailability: jest.fn(),
      delete: jest.fn(),
      getCalendarSummary: jest.fn(),
      getDaySettings: jest.fn(),
      upsertDaySettings: jest.fn(),
      getBookedPatients: jest.fn(),
      getRooms: jest.fn(),
      getPolikliniks: jest.fn(),
      getScheduleOptions: jest.fn(),
      getScheduleContexts: jest.fn(),
      projectAvailability: jest.fn(),
      createAvailability: jest.fn(),
      updatePractitionerSchedulePolicy: jest.fn(),
      findAdminDoctorSchedules: jest.fn(),
      findAdminDoctorScheduleDetail: jest.fn(),
      updateAdminDoctorSchedule: jest.fn(),
      updateAdminDayStatus: jest.fn(),
      createAdminDoctorSession: jest.fn(),
      deleteAdminDoctorSession: jest.fn(),
      updateAdminDoctorSession: jest.fn(),
      rescheduleAdminDoctorSession: jest.fn(),
      checkRescheduleEligibility: jest.fn(),
      getAdminDoctorScheduleFilterOptions: jest.fn(),
      findClinicalPractitioners: jest.fn(),
      getOccupancyOverview: jest.fn(),
      getFormBootstrap: jest.fn(),
      getSlotAvailability: jest.fn(),
      getAdminSessionPatients: jest.fn(),
      getAdminDoctorPatientsByDate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        {
          provide: SCHEDULE_REPOSITORY,
          useValue: mockScheduleRepo,
        },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SchedulesController>(SchedulesController);
  });

  describe('createSchedule', () => {
    it('should create schedule using authenticated practitionerId if staffId omitted', async () => {
      const mockResult: any = {
        id: 'session-1',
        staffId: 'practitioner-uuid-1',
        scheduleDate: '2026-08-26',
        startTime: '07:00',
        endTime: '11:00',
      };
      mockScheduleRepo.create.mockResolvedValue(mockResult);

      const result = await controller.createSchedule(
        {
          date: '2026-08-26',
          sessionType: 'Pagi',
          startTime: '07:00',
          endTime: '11:00',
          capacity: 8,
        },
        mockStaffUser,
      );

      expect(mockScheduleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          staffId: 'practitioner-uuid-1',
          scheduleDate: '2026-08-26',
          startTime: '07:00',
          endTime: '11:00',
          capacity: 8,
          session: 'PAGI',
          sessionLabel: 'Pagi',
        }),
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw ForbiddenException if user is not staff and staffId omitted', async () => {
      await expect(
        controller.createSchedule(
          {
            date: '2026-08-26',
            startTime: '07:00',
            endTime: '11:00',
          },
          mockPatientUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMySchedules', () => {
    it('should return schedules for authenticated doctor', async () => {
      const mockList: any = [{ id: 'sess-1' }];
      mockScheduleRepo.findMySchedules.mockResolvedValue(mockList);

      const result = await controller.getMySchedules(
        mockStaffUser,
        '2026-08-26',
      );

      expect(mockScheduleRepo.findMySchedules).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        {
          date: '2026-08-26',
          startDate: undefined,
          endDate: undefined,
        },
      );
      expect(result).toEqual(mockList);
    });

    it('should throw ForbiddenException if user has no staff profile', async () => {
      await expect(controller.getMySchedules(mockPatientUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getCalendarSummary', () => {
    it('should return monthly summary for authenticated doctor', async () => {
      const mockSummary: any = {
        month: '2026-08',
        days: [{ date: '2026-08-26', hasSchedule: true }],
      };
      mockScheduleRepo.getCalendarSummary.mockResolvedValue(mockSummary);

      const result = await controller.getCalendarSummary(
        { month: '2026-08' },
        mockStaffUser,
      );

      expect(mockScheduleRepo.getCalendarSummary).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        '2026-08',
      );
      expect(result).toEqual(mockSummary);
    });
  });

  describe('getDaySettings and updateDaySettings', () => {
    it('should fetch day settings for doctor', async () => {
      const mockSetting: any = {
        practitionerId: 'practitioner-uuid-1',
        scheduleDate: '2026-08-26',
        targetQuota: 8,
        isCuti: false,
      };
      mockScheduleRepo.getDaySettings.mockResolvedValue(mockSetting);

      const result = await controller.getDaySettings(
        { date: '2026-08-26' },
        mockStaffUser,
      );

      expect(mockScheduleRepo.getDaySettings).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        '2026-08-26',
      );
      expect(result).toEqual(mockSetting);
    });

    it('should upsert day settings for doctor', async () => {
      const mockSetting: any = {
        practitionerId: 'practitioner-uuid-1',
        scheduleDate: '2026-08-26',
        targetQuota: 10,
        isCuti: true,
        cutiReason: 'Cuti Praktik',
      };
      mockScheduleRepo.upsertDaySettings.mockResolvedValue(mockSetting);

      const result = await controller.updateDaySettings(
        {
          date: '2026-08-26',
          targetQuota: 10,
          isCuti: true,
          cutiReason: 'Cuti Praktik',
        },
        mockStaffUser,
      );

      expect(mockScheduleRepo.upsertDaySettings).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        '2026-08-26',
        {
          targetQuota: 10,
          isCuti: true,
          cutiReason: 'Cuti Praktik',
          userId: 'user-uuid-1',
        },
      );
      expect(result).toEqual(mockSetting);
    });

    it('should update day status (close/open whole day) for doctor', async () => {
      const mockResult: any = {
        success: true,
        data: {
          date: '2026-10-24',
          status: 'Tutup',
          affectedSessionsCount: 2,
        },
      };
      mockScheduleRepo.updateAdminDayStatus.mockResolvedValue(mockResult);

      const result = await controller.updateDayStatus(
        '2026-10-24',
        'Tutup',
        'Cuti darurat',
        mockStaffUser,
      );

      expect(mockScheduleRepo.updateAdminDayStatus).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        '2026-10-24',
        'Tutup',
        'Cuti darurat',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getRooms', () => {
    it('should return rooms reference with occupancy check', async () => {
      const mockRooms: any = [
        { id: 'room-1', name: 'Ruang 101', isOccupied: false },
      ];
      mockScheduleRepo.getRooms.mockResolvedValue(mockRooms);

      const result = await controller.getRooms({
        date: '2026-08-26',
        startTime: '07:00',
        endTime: '11:00',
      });

      expect(mockScheduleRepo.getRooms).toHaveBeenCalledWith(
        '2026-08-26',
        '07:00',
        '11:00',
      );
      expect(result).toEqual(mockRooms);
    });
  });

  describe('getBookedPatientsForSession', () => {
    it('should return booked patients for specific session id if user is owner', async () => {
      const mockSchedule: any = {
        id: 'session-1',
        staffId: 'practitioner-uuid-1',
      };
      const mockPatients: any = [
        { id: 'patient-1', fullName: 'Siti Rahma', queueNumber: '#01' },
      ];
      mockScheduleRepo.findById.mockResolvedValue(mockSchedule);
      mockScheduleRepo.getBookedPatients.mockResolvedValue(mockPatients);

      const result = await controller.getBookedPatientsForSession(
        'session-1',
        mockStaffUser,
      );

      expect(mockScheduleRepo.findById).toHaveBeenCalledWith('session-1');
      expect(mockScheduleRepo.getBookedPatients).toHaveBeenCalledWith(
        'session-1',
      );
      expect(result).toEqual(mockPatients);
    });

    it('should throw ForbiddenException if session belongs to another doctor', async () => {
      const mockSchedule: any = {
        id: 'session-1',
        staffId: 'practitioner-uuid-2',
      };
      mockScheduleRepo.findById.mockResolvedValue(mockSchedule);

      await expect(
        controller.getBookedPatientsForSession('session-1', mockStaffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if schedule does not exist', async () => {
      mockScheduleRepo.findById.mockResolvedValue(null);

      await expect(
        controller.getBookedPatientsForSession(
          'session-missing',
          mockStaffUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSchedule', () => {
    it('should delete schedule successfully if user is owner', async () => {
      const mockSchedule: any = {
        id: 'session-1',
        staffId: 'practitioner-uuid-1',
      };
      mockScheduleRepo.findById.mockResolvedValue(mockSchedule);
      mockScheduleRepo.delete.mockResolvedValue(true);

      await expect(
        controller.deleteSchedule('session-1', mockStaffUser),
      ).resolves.toBeUndefined();
      expect(mockScheduleRepo.delete).toHaveBeenCalledWith('session-1');
    });

    it('should throw ForbiddenException if schedule belongs to another doctor', async () => {
      const mockSchedule: any = {
        id: 'session-1',
        staffId: 'practitioner-uuid-2',
      };
      mockScheduleRepo.findById.mockResolvedValue(mockSchedule);

      await expect(
        controller.deleteSchedule('session-1', mockStaffUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if schedule does not exist', async () => {
      mockScheduleRepo.findById.mockResolvedValue(null);

      await expect(
        controller.deleteSchedule('session-missing', mockStaffUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPolikliniks', () => {
    it('should return active polikliniks reference', async () => {
      const mockPolis = [
        { id: 'poli-1', code: 'POLI-UMUM', name: 'Poli Umum' },
      ];
      mockScheduleRepo.getPolikliniks.mockResolvedValue(mockPolis);

      const result = await controller.getPolikliniks();
      expect(result).toEqual(mockPolis);
    });
  });

  describe('getScheduleOptions', () => {
    it('should return master shifts, statuses, and time intervals', async () => {
      const mockOptions = {
        shifts: [
          {
            id: 'PAGI' as const,
            label: 'Pagi',
            shift: 'morning' as const,
            startTime: '07:00',
            endTime: '12:00',
          },
        ],
        statuses: [{ id: 'open', label: 'Buka' }],
        timeSlotIntervals: [15, 30, 45, 60],
      };
      mockScheduleRepo.getScheduleOptions.mockResolvedValue(mockOptions);

      const result = await controller.getScheduleOptions();
      expect(result).toEqual(mockOptions);
    });
  });

  describe('schedule v2 projection contract', () => {
    it('returns backend-owned contexts and effective duration for the authenticated practitioner', async () => {
      const contexts: any = [
        {
          contextId: 'morning',
          contextLabel: 'Pagi',
          boundaryStartTime: '06:00',
          boundaryEndTime: '12:00',
          effectiveConsultationDurationMinutes: 30,
          durationEditableByCurrentUser: false,
        },
      ];
      mockScheduleRepo.getScheduleContexts.mockResolvedValue(contexts);

      const result = await controller.getScheduleContexts(
        { date: '2026-09-23' },
        mockStaffUser,
      );

      expect(mockScheduleRepo.getScheduleContexts).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        '2026-09-23',
        false,
      );
      expect(result).toEqual(contexts);
    });

    it('previews projection without rounding arbitrary start times', async () => {
      const projection: any = {
        selectedStartTime: '08:45',
        effectiveConsultationDurationMinutes: 30,
        intervals: [{ startTime: '08:45', endTime: '09:15', status: 'OPEN' }],
      };
      mockScheduleRepo.projectAvailability.mockResolvedValue(projection);

      const result = await controller.previewScheduleProjection(
        {
          date: '2026-09-23',
          scheduleContextId: 'morning',
          startTime: '08:45',
        },
        mockStaffUser,
      );

      expect(mockScheduleRepo.projectAvailability).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        {
          date: '2026-09-23',
          scheduleContextId: 'morning',
          startTime: '08:45',
        },
        false,
      );
      expect(result).toEqual(projection);
    });

    it('creates availability without client-supplied endTime', async () => {
      const response: any = {
        schedule: {
          id: 'schedule-1',
          startTime: '08:45',
          endTime: '12:00',
        },
        projection: {
          selectedStartTime: '08:45',
          intervals: [],
        },
      };
      mockScheduleRepo.createAvailability.mockResolvedValue(response);

      const result = await controller.createAvailability(
        {
          date: '2026-09-23',
          scheduleContextId: 'morning',
          startTime: '08:45',
        },
        mockStaffUser,
      );

      expect(mockScheduleRepo.createAvailability).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        {
          date: '2026-09-23',
          scheduleContextId: 'morning',
          startTime: '08:45',
        },
        {
          userId: 'user-uuid-1',
          durationEditableByCurrentUser: false,
        },
      );
      expect(result).toEqual(response);
    });

    it('returns occupancy overview for the authenticated practitioner with anti-collision grid', async () => {
      const mockOverview: any = {
        date: '2026-09-25',
        practitionerId: 'practitioner-uuid-1',
        practitionerName: 'dr. Sarah Jenkins, Sp.A',
        effectiveConsultationDurationMinutes: 30,
        summary: {
          totalShifts: 4,
          totalSlots: 42,
          availableSlots: 40,
          occupiedSlots: 2,
        },
        shifts: [],
      };
      mockScheduleRepo.getOccupancyOverview.mockResolvedValue(mockOverview);

      const result = await controller.getOccupancyOverview(
        { date: '2026-09-25', roomId: 'room-uuid-1' },
        mockStaffUser,
      );

      expect(mockScheduleRepo.getOccupancyOverview).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        { date: '2026-09-25', roomId: 'room-uuid-1' },
      );
      expect(result).toEqual({
        success: true,
        data: mockOverview,
      });
    });

    it('returns form bootstrap data for authenticated practitioner', async () => {
      const mockBootstrap: any = {
        doctor: {
          id: 'practitioner-uuid-1',
          name: 'dr. Sarah Jenkins, Sp.A',
          defaultRoomId: 'room-1',
          defaultRoomName: 'Ruang Poli Umum 1',
          defaultPoliklinikId: 'poli-1',
          defaultPoliklinikName: 'Poli Umum',
          consultationDurationMinutes: 30,
        },
        rooms: [],
        polikliniks: [],
        shifts: [],
      };
      mockScheduleRepo.getFormBootstrap.mockResolvedValue(mockBootstrap);

      const result = await controller.getFormBootstrap(
        { date: '2026-09-25' },
        mockStaffUser,
      );

      expect(mockScheduleRepo.getFormBootstrap).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        { date: '2026-09-25' },
      );
      expect(result).toEqual({
        success: true,
        statusCode: 200,
        message: 'Form bootstrap data berhasil dimuat',
        data: mockBootstrap,
      });
    });

    it('returns slot availability anti-collision grid for authenticated practitioner', async () => {
      const mockAvailability: any = {
        date: '2026-09-25',
        shift: 'night',
        shiftLabel: 'Sesi Malam',
        roomId: 'room-1',
        roomName: 'Ruang Poli Umum 1',
        boundary: { startTime: '18:00', endTime: '24:00' },
        intervalMinutes: 30,
        summary: { totalSlots: 12, availableSlots: 10, occupiedSlots: 2 },
        slots: [],
      };
      mockScheduleRepo.getSlotAvailability.mockResolvedValue(mockAvailability);

      const result = await controller.getSlotAvailability(
        { date: '2026-09-25', shift: 'night', roomId: 'room-1' },
        mockStaffUser,
      );

      expect(mockScheduleRepo.getSlotAvailability).toHaveBeenCalledWith(
        'practitioner-uuid-1',
        { date: '2026-09-25', shift: 'night', roomId: 'room-1' },
      );
      expect(result).toEqual({
        success: true,
        statusCode: 200,
        message: 'Ketersediaan slot berhasil dihitung',
        data: mockAvailability,
      });
    });
  });
});
