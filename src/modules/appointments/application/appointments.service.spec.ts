import { describe, expect, it, mock } from 'bun:test';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RedisService } from '../../../common/redis/redis.service';
import type { NotificationPublisher } from '../../notifications/contracts/domain-event.interface';
import { APPOINTMENT_EVENTS } from '../domain/constants/appointment-lifecycle.constants';
import type { AppointmentRepository } from '../domain/repositories/appointment.repository';
import { AppointmentNotificationPublisher } from './appointment-notification.publisher';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService - Event Publishing', () => {
  it('should publish APPOINTMENT_EVENTS.CREATED domain event on appointment creation', async () => {
    const mockRepo: Partial<AppointmentRepository> = {
      getNextQueueIndex: mock(async () => 1),
      create: mock(async (data: any) => ({
        id: 'apt-created-1',
        patientId: data.patientId,
        poliklinikId: data.poliklinikId,
        layananId: data.layananId,
        staffId: data.staffId,
        appointmentDate: data.appointmentDate,
        session: data.session,
        queueNumber: data.queueNumber,
        status: data.status,
        visitType: data.visitType,
        complaint: data.complaint,
        createdAt: new Date('2026-09-29T10:00:00.000Z'),
        updatedAt: new Date('2026-09-29T10:00:00.000Z'),
      } as any)),
    };

    const mockRawPublisher: NotificationPublisher = {
      publish: mock(async () => {}),
    };
    const mockPublisher = new AppointmentNotificationPublisher(
      mockRawPublisher,
    );

    const mockEventEmitter = {
      emit: mock(() => true),
    } as unknown as EventEmitter2;

    const mockRedis = {
      del: mock(async () => 1),
      keys: mock(async () => []),
    } as unknown as RedisService;

    const service = new AppointmentsService(
      mockRepo as AppointmentRepository,
      mockRedis,
      mockEventEmitter,
      undefined,
      undefined,
      mockPublisher,
    );

    const dto = {
      patientId: 'patient-uuid-1',
      poliklinikId: 'poli-uuid-1',
      layananId: 'layanan-uuid-1',
      appointmentDate: '2026-09-30',
      session: 'PAGI',
    };

    const user = {
      id: 'usr-patient-1',
      role: 'PATIENT',
    };

    const created = await service.createAppointment(dto, user);

    expect(created.id).toBe('apt-created-1');
    expect(created.queueNumber).toBe('1');

    expect(mockRawPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: APPOINTMENT_EVENTS.CREATED,
        module: 'appointments',
        payload: expect.objectContaining({
          appointmentId: 'apt-created-1',
          patientId: 'patient-uuid-1',
          patientUserId: 'usr-patient-1',
          queueNumber: '1',
        }),
      }),
    );
  });
});
