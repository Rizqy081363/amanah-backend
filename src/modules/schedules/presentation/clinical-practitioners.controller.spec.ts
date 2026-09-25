import { Test, TestingModule } from '@nestjs/testing';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { ClinicalPractitionersController } from './clinical-practitioners.controller';

describe('ClinicalPractitionersController', () => {
  let controller: ClinicalPractitionersController;
  let mockScheduleRepo: jest.Mocked<ScheduleRepository>;

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
      getAdminSessionPatients: jest.fn(),
      getAdminDoctorPatientsByDate: jest.fn(),
      getFormBootstrap: jest.fn(),
      getSlotAvailability: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClinicalPractitionersController],
      providers: [
        {
          provide: SCHEDULE_REPOSITORY,
          useValue: mockScheduleRepo,
        },
      ],
    }).compile();

    controller = module.get<ClinicalPractitionersController>(
      ClinicalPractitionersController,
    );
  });

  describe('getPractitioners', () => {
    it('should return clinical practitioners list with availability', async () => {
      const mockPractitioners = [
        {
          id: 'prac-1',
          name: 'dr. Sarah Putri, Sp.PD',
          spec: 'Penyakit Dalam',
          avatar: '',
          location: 'Poli Penyakit Dalam, Room 201',
          rating: '5.0',
          tags: ['Penyakit Dalam'],
          schedule: 'Senin - Sabtu (07:30 - 17:30)',
          is_available: true,
        },
      ];

      mockScheduleRepo.findClinicalPractitioners.mockResolvedValue(
        mockPractitioners,
      );

      const query = { service: 'Penyakit Dalam', date: '2026-09-22' };
      const result = await controller.getPractitioners(query);

      expect(mockScheduleRepo.findClinicalPractitioners).toHaveBeenCalledWith(
        query,
      );
      expect(result).toEqual({
        success: true,
        data: mockPractitioners,
      });
    });
  });
});
