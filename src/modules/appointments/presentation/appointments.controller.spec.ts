import { describe, expect, it, mock } from 'bun:test';
import {
  BusinessDate,
  ClinicTimeService,
} from '../../../common/time/clinic-time.service';
import { AppointmentsService } from '../application/appointments.service';
import { AppointmentsController } from './appointments.controller';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

describe('AppointmentsController', () => {
  const mockClinicTime = {
    today: () => '2026-10-07' as BusinessDate,
    getTimezone: () => 'Asia/Jakarta',
    nowInstant: () => ({ toString: () => '2026-10-06T17:23:00.000Z' }),
  } as unknown as ClinicTimeService;

  it('getMyAppointments should call findByUserId with user id', async () => {
    const mockService = {
      findByUserId: mock(async (userId: string) => [
        {
          id: 'apt-1',
          patientName: 'Ahmadamikom Zikri',
          status: 'SUDAH_BUAT_JANJI',
        },
      ]),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    const result = await controller.getMyAppointments({
      id: 'usr-1',
      sub: 'usr-1',
    });

    expect(mockService.findByUserId).toHaveBeenCalledWith('usr-1');
    expect(result.length).toBe(1);
    expect(result[0].patientName).toBe('Ahmadamikom Zikri');
  });

  it('getMyAppointments should return empty array if no user id', async () => {
    const mockService = {
      findByUserId: mock(async () => []),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    const result = await controller.getMyAppointments({});

    expect(mockService.findByUserId).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('getDailyQueue should require valid date and call findDailyQueue', async () => {
    const mockService = {
      findDailyQueue: mock(async (poliId: string, date: BusinessDate) => ({
        businessDate: date,
        clinicTimezone: 'Asia/Jakarta',
        generatedAt: '2026-10-06T17:23:00.000Z',
        items: [],
      })),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    const res = await controller.getDailyQueue('poli-1', '2026-10-07', 'PAGI');

    expect(mockService.findDailyQueue).toHaveBeenCalledWith(
      'poli-1',
      '2026-10-07' as BusinessDate,
      'PAGI',
    );
    expect(res.businessDate).toBe('2026-10-07' as BusinessDate);
  });

  it('getDailyQueue should throw BadRequestException on missing or invalid date', async () => {
    const mockService = {
      findDailyQueue: mock(async () => ({})),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    expect(() => controller.getDailyQueue('poli-1', '')).toThrow();
    expect(() => controller.getDailyQueue('poli-1', '2026-02-30')).toThrow();
    expect(() => controller.getDailyQueue('poli-1', 'not-a-date')).toThrow();
  });

  it('getMyQueue should query patient queue using server today', async () => {
    const mockService = {
      findMyQueue: mock(async (userId: string, today: BusinessDate) => ({
        businessDate: today,
        clinicTimezone: 'Asia/Jakarta',
        generatedAt: '2026-10-06T17:23:00.000Z',
        items: [],
      })),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    const res = await controller.getMyQueue(
      { id: 'usr-patient', patient: { id: 'patient-uuid' } },
      'poli-1',
    );

    expect(mockService.findMyQueue).toHaveBeenCalledWith(
      'patient-uuid',
      '2026-10-07' as BusinessDate,
      'poli-1',
    );
    expect(res.businessDate).toBe('2026-10-07' as BusinessDate);
  });

  it('getDisplayQueue should query display queue using server today', async () => {
    const mockService = {
      findDisplayQueue: mock(async (today: BusinessDate, poliId?: string) => ({
        businessDate: today,
        clinicTimezone: 'Asia/Jakarta',
        generatedAt: '2026-10-06T17:23:00.000Z',
        poliklinikId: poliId,
      })),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    const res = await controller.getDisplayQueue('poli-1');

    expect(mockService.findDisplayQueue).toHaveBeenCalledWith(
      '2026-10-07' as BusinessDate,
      'poli-1',
    );
    expect(res.businessDate).toBe('2026-10-07' as BusinessDate);
  });

  it('getRescheduleOptions should call getRescheduleOptions with id and userId', async () => {
    const mockService = {
      getRescheduleOptions: mock(async (id: string, userId: string) => ({
        appointmentId: id,
        currentDate: '2026-09-28',
        availableDates: [],
      })),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    const result = await controller.getRescheduleOptions('apt-123', {
      id: 'usr-1',
    });

    expect(mockService.getRescheduleOptions).toHaveBeenCalledWith(
      'apt-123',
      'usr-1',
    );
    expect(result.appointmentId).toBe('apt-123');
  });

  it('rescheduleAppointment should call reschedule with id, dto, and userId', async () => {
    const dto: RescheduleAppointmentDto = {
      newDate: '2026-09-29',
      newSessionId: 'sess-target-456',
      reason: 'Ganti hari periksa',
    };

    const mockService = {
      reschedule: mock(
        async (
          id: string,
          dtoParam: RescheduleAppointmentDto,
          userId: string,
        ) => ({
          id,
          appointmentDate: dtoParam.newDate,
          status: 'SUDAH_BUAT_JANJI',
        }),
      ),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService, mockClinicTime);
    const result = await controller.rescheduleAppointment('apt-123', dto, {
      id: 'usr-1',
    });

    expect(mockService.reschedule).toHaveBeenCalledWith(
      'apt-123',
      dto,
      'usr-1',
      { id: 'usr-1' },
    );
    expect(result.id).toBe('apt-123');
    expect(result.appointmentDate).toBe('2026-09-29');
  });
});
