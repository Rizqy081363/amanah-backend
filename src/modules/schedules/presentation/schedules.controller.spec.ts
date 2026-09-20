import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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

import { SCHEDULE_REPOSITORY, ScheduleRepository } from '../domain/repositories/schedule.repository';
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
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        {
          provide: SCHEDULE_REPOSITORY,
          useValue: mockScheduleRepo,
        },
      ],
    }).compile();

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
      await expect(
        controller.getMySchedules(mockPatientUser),
      ).rejects.toThrow(ForbiddenException);
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
    it('should return booked patients for specific session id', async () => {
      const mockPatients: any = [
        { id: 'patient-1', fullName: 'Siti Rahma', queueNumber: '#01' },
      ];
      mockScheduleRepo.getBookedPatients.mockResolvedValue(mockPatients);

      const result = await controller.getBookedPatientsForSession('session-1');

      expect(mockScheduleRepo.getBookedPatients).toHaveBeenCalledWith('session-1');
      expect(result).toEqual(mockPatients);
    });
  });

  describe('deleteSchedule', () => {
    it('should delete schedule successfully', async () => {
      mockScheduleRepo.delete.mockResolvedValue(true);

      await expect(controller.deleteSchedule('session-1')).resolves.toBeUndefined();
      expect(mockScheduleRepo.delete).toHaveBeenCalledWith('session-1');
    });

    it('should throw NotFoundException if schedule does not exist', async () => {
      mockScheduleRepo.delete.mockResolvedValue(false);

      await expect(controller.deleteSchedule('session-missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
