import { describe, expect, it, mock } from 'bun:test';
import { AppointmentsService } from '../application/appointments.service';
import { AppointmentsController } from './appointments.controller';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

describe('AppointmentsController', () => {
  it('getMyAppointments should call findByUserId with user id', async () => {
    const mockService = {
      findByUserId: mock(async (userId: string) => [
        {
          id: 'apt-1',
          patientName: 'Ahmadamikom Zikri',
          status: 'SUDAH_BUAT_JANJI',
        },
        {
          id: 'apt-2',
          patientName: 'Siti Aminah',
          status: 'SUDAH_BUAT_JANJI',
        },
      ]),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService);
    const result = await controller.getMyAppointments({
      id: 'usr-1',
      sub: 'usr-1',
    });

    expect(mockService.findByUserId).toHaveBeenCalledWith('usr-1');
    expect(result.length).toBe(2);
    expect(result[0].patientName).toBe('Ahmadamikom Zikri');
    expect(result[1].patientName).toBe('Siti Aminah');
  });

  it('getMyAppointments should return empty array if no user id', async () => {
    const mockService = {
      findByUserId: mock(async () => []),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService);
    const result = await controller.getMyAppointments({});

    expect(mockService.findByUserId).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('getRescheduleOptions should call getRescheduleOptions with id and userId', async () => {
    const mockService = {
      getRescheduleOptions: mock(async (id: string, userId: string) => ({
        appointmentId: id,
        currentDate: '2026-09-28',
        availableDates: [],
      })),
    } as unknown as AppointmentsService;

    const controller = new AppointmentsController(mockService);
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

    const controller = new AppointmentsController(mockService);
    const result = await controller.rescheduleAppointment('apt-123', dto, {
      id: 'usr-1',
    });

    expect(mockService.reschedule).toHaveBeenCalledWith(
      'apt-123',
      dto,
      'usr-1',
    );
    expect(result.id).toBe('apt-123');
    expect(result.appointmentDate).toBe('2026-09-29');
  });
});
