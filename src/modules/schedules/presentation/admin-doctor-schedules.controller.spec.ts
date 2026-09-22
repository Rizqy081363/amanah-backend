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
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { AdminDoctorSchedulesController } from './admin-doctor-schedules.controller';

describe('AdminDoctorSchedulesController', () => {
  let controller: AdminDoctorSchedulesController;
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
      findAdminDoctorSchedules: jest.fn(),
      findAdminDoctorScheduleDetail: jest.fn(),
      updateAdminDoctorSchedule: jest.fn(),
      updateAdminDayStatus: jest.fn(),
      createAdminDoctorSession: jest.fn(),
      findClinicalPractitioners: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminDoctorSchedulesController],
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

    controller = module.get<AdminDoctorSchedulesController>(
      AdminDoctorSchedulesController,
    );
  });

  describe('getDoctorSchedules', () => {
    it('should return paginated doctor schedules list', async () => {
      const mockResponse = {
        success: true,
        data: {
          doctors: [
            {
              id: 'doc-1',
              practitioner_id: 'doc-1',
              nama_dokter: 'dr. Sarah Putri, Sp.PD',
              spesialisasi: 'Penyakit Dalam',
              status_dokter: 'Buka',
              email: 'sarah@amanah.test',
              nomor_telepon: '081234567890',
              ruang_praktik: 'Poli Penyakit Dalam, Room 201',
              tanggal_praktik: 'Selasa, 22 Sep 2026',
              avatar: '',
              slot_tersedia: 18,
              kapasitas_per_hari: 30,
              jadwal_hari_ini: '07:30 - 11:30',
              status_jadwal: 'Buka',
              bulan_jadwal: 'September 2026',
              is_cuti: false,
              cuti_reason: null,
              cuti_start: null,
              cuti_end: null,
              sesi_harian: [],
            },
          ],
          meta: {
            page: 1,
            limit: 6,
            total_doctors: 1,
            total_pages: 1,
          },
        },
      };

      mockScheduleRepo.findAdminDoctorSchedules.mockResolvedValue(
        mockResponse as any,
      );

      const query = {
        page: 1,
        limit: 6,
        search: 'Sarah',
        poli: 'Penyakit Dalam',
      };
      const result = await controller.getDoctorSchedules(query);

      expect(mockScheduleRepo.findAdminDoctorSchedules).toHaveBeenCalledWith(
        query,
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getDoctorScheduleDetail', () => {
    it('should return doctor schedule detail with monthly calendar and sessions', async () => {
      const mockDetail = {
        success: true,
        data: {
          id: 'doc-1',
          practitioner_id: 'doc-1',
          nama_dokter: 'dr. Sarah Putri, Sp.PD',
          spesialisasi: 'Penyakit Dalam',
          status_dokter: 'Buka',
          email: 'sarah@amanah.test',
          nomor_telepon: '081234567890',
          ruang_praktik: 'Poli Penyakit Dalam, Room 201',
          avatar: '',
          slot_tersedia: 18,
          kapasitas_per_hari: 30,
          bulan_jadwal: 'September 2026',
          is_cuti: false,
          cuti_reason: null,
          cuti_start: null,
          cuti_end: null,
          monthly_schedule: [
            {
              day: 1,
              date: '2026-09-01',
              status: 'Buka' as const,
              notes: null,
            },
          ],
          sesi_harian: [],
        },
      };

      mockScheduleRepo.findAdminDoctorScheduleDetail.mockResolvedValue(
        mockDetail as any,
      );

      const query = { month: '2026-09', year: 2026 };
      const result = await controller.getDoctorScheduleDetail('doc-1', query);

      expect(
        mockScheduleRepo.findAdminDoctorScheduleDetail,
      ).toHaveBeenCalledWith('doc-1', query);
      expect(result).toEqual(mockDetail);
    });
  });

  describe('updateDoctorSchedule', () => {
    it('should update operational schedule and cuti status', async () => {
      const mockResult = {
        success: true,
        data: {
          id: 'doc-1',
          is_cuti: true,
          cuti_reason: 'Cuti Tahunan',
        },
      };

      mockScheduleRepo.updateAdminDoctorSchedule.mockResolvedValue(mockResult);

      const body = {
        is_cuti: true,
        cuti_reason: 'Cuti Tahunan',
        cuti_start: '2026-09-25',
        cuti_end: '2026-09-30',
        status_jadwal: 'Cuti',
      };
      const result = await controller.updateDoctorSchedule('doc-1', body);

      expect(mockScheduleRepo.updateAdminDoctorSchedule).toHaveBeenCalledWith(
        'doc-1',
        body,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateDayStatus', () => {
    it('should override status for a specific calendar date', async () => {
      const mockResult = {
        success: true,
        message: 'Status hari berhasil diperbarui',
        data: {
          date: '2026-09-22',
          status: 'Cuti',
          notes: 'Izin Dinas Luar Kota',
        },
      };

      mockScheduleRepo.updateAdminDayStatus.mockResolvedValue(mockResult);

      const body = { status: 'Cuti', notes: 'Izin Dinas Luar Kota' };
      const result = await controller.updateDayStatus(
        'doc-1',
        '2026-09-22',
        body,
      );

      expect(mockScheduleRepo.updateAdminDayStatus).toHaveBeenCalledWith(
        'doc-1',
        '2026-09-22',
        'Cuti',
        'Izin Dinas Luar Kota',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('createSession', () => {
    it('should append a new clinical session for the doctor', async () => {
      const mockResult = {
        success: true,
        message: 'Sesi jadwal berhasil ditambahkan',
        data: {
          id: 'sess-101',
          scheduleDate: '2026-09-22',
          sessionLabel: 'Sesi Malam',
          startTime: '19:00:00',
          endTime: '22:00:00',
          capacity: 10,
        },
      };

      mockScheduleRepo.createAdminDoctorSession.mockResolvedValue(mockResult);

      const body = {
        schedule_date: '2026-09-22',
        nama_sesi: 'Sesi Malam',
        jam_mulai: '19:00',
        jam_selesai: '22:00',
        kuota_pasien: 10,
        slot_tersedia: 10,
        status_sesi: 'Buka',
        ruang: 'Poli Penyakit Dalam, Room 201',
      };
      const result = await controller.createSession('doc-1', body);

      expect(mockScheduleRepo.createAdminDoctorSession).toHaveBeenCalledWith(
        'doc-1',
        body,
      );
      expect(result).toEqual(mockResult);
    });
  });
});
