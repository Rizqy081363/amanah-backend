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

import { HybridAuthGuard } from '@common/auth/hybrid-auth.guard';
import { RolesGuard } from '@common/auth/roles.guard';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SCHEDULE_REPOSITORY,
  ScheduleRepository,
} from '../domain/repositories/schedule.repository';
import { AdminScheduleStatusRequest } from '../domain/schedule-status';
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
      getSlotAvailability: jest.fn(),
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
          status: AdminScheduleStatusRequest.CLOSED,
          notes: 'Izin Dinas Luar Kota',
        },
      };

      mockScheduleRepo.updateAdminDayStatus.mockResolvedValue(mockResult);

      const body = {
        status: AdminScheduleStatusRequest.CLOSED,
        notes: 'Izin Dinas Luar Kota',
      };
      const result = await controller.updateDayStatus(
        'doc-1',
        '2026-09-22',
        body,
      );

      expect(mockScheduleRepo.updateAdminDayStatus).toHaveBeenCalledWith(
        'doc-1',
        '2026-09-22',
        AdminScheduleStatusRequest.CLOSED,
        'Izin Dinas Luar Kota',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('updatePractitionerSchedulePolicy', () => {
    it('should let admin update practitioner consultation duration', async () => {
      const mockContexts: any = [
        {
          contextId: 'morning',
          effectiveConsultationDurationMinutes: 20,
          allowedStartPrecisionMinutes: 1,
        },
      ];
      mockScheduleRepo.updatePractitionerSchedulePolicy.mockResolvedValue(
        mockContexts,
      );

      const body = {
        consultationDurationMinutes: 20,
        startPrecisionMinutes: 1,
      };
      const result = await controller.updateSchedulePolicy('doc-1', body);

      expect(
        mockScheduleRepo.updatePractitionerSchedulePolicy,
      ).toHaveBeenCalledWith('doc-1', body);
      expect(result).toEqual(mockContexts);
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
        status_sesi: AdminScheduleStatusRequest.OPEN,
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

  describe('rescheduleSession', () => {
    it('should reschedule a session to a new date and time', async () => {
      const mockResult = {
        success: true,
        message: 'Jadwal dokter berhasil dijadwalkan ulang (rescheduled)',
        data: {
          sessionId: 'sess-101',
          practitionerId: 'doc-1',
          previousSchedule: {
            date: '2026-09-22',
            startTime: '08:00',
            endTime: '11:00',
            roomId: 'room-1',
          },
          rescheduledSchedule: {
            id: 'sess-101',
            scheduleDate: '2026-10-15',
            startTime: '09:00',
            endTime: '12:00',
            capacity: 6,
          },
          rescheduledAppointmentsCount: 1,
        },
      };

      mockScheduleRepo.rescheduleAdminDoctorSession.mockResolvedValue(
        mockResult,
      );

      const body = {
        targetDate: '2026-10-15',
        targetStartTime: '09:00',
        reason: 'Dokter berhalangan hadir',
      };
      const result = await controller.rescheduleSession(
        'doc-1',
        'sess-101',
        body,
      );

      expect(
        mockScheduleRepo.rescheduleAdminDoctorSession,
      ).toHaveBeenCalledWith('doc-1', 'sess-101', body);
      expect(result).toEqual(mockResult);
    });
  });

  describe('checkRescheduleEligibility', () => {
    it('should pre-validate reschedule eligibility for a doctor session', async () => {
      const mockResult: any = {
        sessionId: 'sess-101',
        practitionerId: 'doc-1',
        practitionerName: 'dr. Sarah Putri, Sp.PD',
        isEligible: true,
        sourceSession: {
          id: 'sess-101',
          scheduleDate: '2026-09-22',
          startTime: '08:00',
          endTime: '11:00',
          timeRange: '08:00 - 11:00 WIB',
          status: 'open',
          statusLabel: 'Buka',
          sessionLabel: 'Sesi Pagi',
          sessionShift: 'morning',
          roomName: 'Poli Penyakit Dalam, Room 201',
          activeAppointmentsCount: 1,
          isSourceEligible: true,
          rejectionReason: null,
        },
        targetValidation: {
          evaluated: true,
          targetDate: '2026-10-15',
          targetStartTime: '09:00',
          projectedEndTime: '12:00',
          targetRoomId: 'room-1',
          targetRoomName: 'Ruang Poli 1',
          isTargetEligible: true,
          conflictCode: null,
          conflictMessage: null,
          conflictMetadata: null,
        },
        actionableGuidance:
          'Sesi dan target waktu memenuhi syarat untuk di-reschedule. Silakan lanjutkan konfirmasi.',
      };

      mockScheduleRepo.checkRescheduleEligibility.mockResolvedValue(mockResult);

      const query = {
        targetDate: '2026-10-15',
        targetStartTime: '09:00',
        targetRoomId: 'room-1',
      };
      const result = await controller.checkRescheduleEligibility(
        'doc-1',
        'sess-101',
        query,
      );

      expect(mockScheduleRepo.checkRescheduleEligibility).toHaveBeenCalledWith(
        'doc-1',
        'sess-101',
        query,
      );
      expect(result).toEqual({
        success: true,
        data: mockResult,
      });
    });
  });

  describe('getSessionPatients', () => {
    it('should return session patients roster with demographics and metadata', async () => {
      const mockResult: any = {
        success: true,
        data: {
          sessionId: 'sess-101',
          sessionLabel: 'Pagi',
          shift: 'Pagi',
          scheduleDate: '2026-09-24',
          startTime: '08:00',
          endTime: '11:30',
          capacity: 12,
          availableSlots: 4,
          bookedCount: 8,
          clinicRoom: {
            id: 'room-1',
            name: 'Ruang Poli Umum 1',
            floor: 'Lantai 1',
          },
          patients: [
            {
              appointmentId: 'apt-1',
              queueTicketId: 'ticket-1',
              queueNumber: 'P-001',
              timeSlot: '08:00 - 08:30 WIB',
              status: 'waiting',
              statusBadge: 'Menunggu',
              chiefComplaint: 'Demam tinggi',
              clinicRoomName: 'Ruang Poli Umum 1',
              isCancellable: true,
              patient: {
                id: 'pat-1',
                fullName: 'Ahmad Dahlan',
                medicalRecordNumber: 'RM-001',
                nik: '3201234567890001',
                gender: 'Laki-laki',
                birthDate: '1994-05-14',
                age: '32 Thn',
                phoneNumber: '081234567890',
                email: 'ahmad@example.com',
                address: 'Jl. Merdeka No. 45',
                guardianName: 'Siti',
                avatarUrl: null,
              },
              bookingMetadata: {
                bookedAt: '2026-09-23T14:20:00.000Z',
                checkedInAt: '2026-09-24T07:45:00.000Z',
                startedAt: null,
                completedAt: null,
                cancelledAt: null,
                cancelReason: null,
              },
            },
          ],
        },
      };

      mockScheduleRepo.getAdminSessionPatients.mockResolvedValue(mockResult);

      const query = { status: 'waiting', search: 'Ahmad' };
      const result = await controller.getSessionPatients(
        'doc-1',
        'sess-101',
        query,
      );

      expect(mockScheduleRepo.getAdminSessionPatients).toHaveBeenCalledWith(
        'doc-1',
        'sess-101',
        query,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDoctorPatientsByDate', () => {
    it('should return accumulated doctor patients for a specific date', async () => {
      const mockResult: any = {
        success: true,
        data: {
          doctorId: 'doc-1',
          doctorName: 'dr. Sarah Putri, Sp.PD',
          date: '2026-09-24',
          accumulatedCapacity: 24,
          accumulatedBookedCount: 8,
          accumulatedAvailableSlots: 16,
          sessions: [],
        },
      };

      mockScheduleRepo.getAdminDoctorPatientsByDate.mockResolvedValue(
        mockResult,
      );

      const query = { date: '2026-09-24' };
      const result = await controller.getDoctorPatientsByDate('doc-1', query);

      expect(
        mockScheduleRepo.getAdminDoctorPatientsByDate,
      ).toHaveBeenCalledWith('doc-1', '2026-09-24', query);
      expect(result).toEqual(mockResult);
    });
  });
});
