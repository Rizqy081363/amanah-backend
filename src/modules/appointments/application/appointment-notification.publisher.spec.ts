import { describe, expect, it, mock } from 'bun:test';
import { AppointmentNotificationPublisher } from './appointment-notification.publisher';
import { APPOINTMENT_EVENTS } from '../domain/constants/appointment-lifecycle.constants';

describe('AppointmentNotificationPublisher', () => {
  it('should publish rescheduled event with correct duplex role and payload', async () => {
    let capturedEvent: any = null;
    const mockPublisher = {
      publish: mock(async (event: any) => {
        capturedEvent = event;
      }),
    };

    const publisher = new AppointmentNotificationPublisher(mockPublisher as any);

    const mockAppointment: any = {
      id: 'apt-resched-1',
      patientId: 'patient-uuid',
      patientUserId: 'patient-user-uuid',
      patientName: 'Lexguard Didier',
      patientAvatarUrl: 'https://cdn.amanah.com/avatars/lex.png',
      doctorName: 'dr. Siti Rahma',
      doctorAvatarUrl: 'https://cdn.amanah.com/avatars/siti.png',
      practitionerId: 'prac-siti-uuid',
      poliklinikId: 'poli-umum-uuid',
      poliklinikName: 'Poli Umum',
      layananId: 'srv-umum-uuid',
      layananName: 'Pemeriksaan Umum',
      roomName: 'Ruang 102',
      appointmentDate: '2026-10-01',
      session: 'MALAM',
      queueNumber: 'M-001',
      status: 'SUDAH_BUAT_JANJI',
      scheduledStartTime: '18:00:00',
      scheduledEndTime: '18:30:00',
    };

    await publisher.publishRescheduled(
      mockAppointment,
      {
        targetDate: '2026-10-01',
        targetStartTime: '18:00:00',
        targetEndTime: '18:30:00',
        reason: 'Pindah shift malam',
      },
      { id: 'patient-user-uuid', role: 'PATIENT' },
    );

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.eventType).toBe(APPOINTMENT_EVENTS.RESCHEDULED);
    expect(capturedEvent.payload.appointmentId).toBe('apt-resched-1');
    expect(capturedEvent.payload.patientName).toBe('Lexguard Didier');
    expect(capturedEvent.payload.doctorName).toBe('dr. Siti Rahma');
    expect(capturedEvent.payload.targetDate).toBe('2026-10-01');
    expect(capturedEvent.payload.targetStartTime).toBe('18:00:00');
    expect(capturedEvent.payload.rescheduledByRole).toBe('patient');
    expect(capturedEvent.actor.userId).toBe('patient-user-uuid');
    expect(capturedEvent.actor.roleCode).toBe('PATIENT');
  });

  it('should mark rescheduledByRole as admin when actor is admin', async () => {
    let capturedEvent: any = null;
    const mockPublisher = {
      publish: mock(async (event: any) => {
        capturedEvent = event;
      }),
    };

    const publisher = new AppointmentNotificationPublisher(mockPublisher as any);

    const mockAppointment: any = {
      id: 'apt-resched-2',
      patientId: 'patient-uuid',
      patientUserId: 'patient-user-uuid',
      patientName: 'Lexguard Didier',
      appointmentDate: '2026-10-02',
      session: 'PAGI',
      status: 'SUDAH_BUAT_JANJI',
    };

    await publisher.publishRescheduled(
      mockAppointment,
      {
        targetDate: '2026-10-02',
        targetStartTime: '09:00:00',
        targetEndTime: '09:30:00',
        reason: 'Dokter bertugas di RSUD',
        rescheduledByRole: 'admin',
      },
      { id: 'admin-user-uuid', role: 'ADMIN' },
    );

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.payload.rescheduledByRole).toBe('admin');
    expect(capturedEvent.actor.userId).toBe('admin-user-uuid');
    expect(capturedEvent.actor.roleCode).toBe('ADMIN');
  });
});
