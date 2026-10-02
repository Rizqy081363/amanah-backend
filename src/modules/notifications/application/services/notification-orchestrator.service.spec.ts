import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { DomainEvent } from '../../contracts/domain-event.interface';
import { NotificationEntity } from '../../domain/entities/notification.entity';
import { NotificationRulesRegistry } from '../../registry/notification-rules-registry';
import { NotificationOrchestratorService } from './notification-orchestrator.service';

describe('NotificationOrchestratorService', () => {
  let orchestrator: NotificationOrchestratorService;
  let mockNotificationRepo: any;
  let registry: NotificationRulesRegistry;
  let mockInAppAdapter: any;

  beforeEach(() => {
    mockNotificationRepo = {
      createIfNotExists: mock(),
    };
    registry = new NotificationRulesRegistry();
    mockInAppAdapter = {
      channel: 'in_app',
      deliver: mock().mockResolvedValue({
        channel: 'in_app',
        status: 'delivered',
      }),
    };

    orchestrator = new NotificationOrchestratorService(
      mockNotificationRepo,
      registry,
      [mockInAppAdapter],
    );
  });

  it('should ignore event when no rule is registered', async () => {
    const event: DomainEvent = {
      eventId: 'evt-1',
      eventType: 'unknown.event',
      version: 1,
      occurredAt: '2026-09-27T00:00:00Z',
      module: 'test',
      payload: {},
    };

    await orchestrator.processEvent(event);

    expect(mockNotificationRepo.createIfNotExists).not.toHaveBeenCalled();
    expect(mockInAppAdapter.deliver).not.toHaveBeenCalled();
  });

  it('should process event, create notification with deterministic idempotencyKey, and deliver via adapter', async () => {
    registry.registerRule({
      eventType: 'appointment.patient_called.v1',
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Panggilan Antrian',
      bodyTemplate: (payload: any) =>
        `Nomor antrian ${payload.ticketNumber} dipanggil ke Poli Umum.`,
      isUrgent: true,
    });

    const mockPersistedEntity: NotificationEntity = {
      id: 'notif-uuid-1',
      category: 'appointment',
      title: 'Panggilan Antrian',
      body: 'Nomor antrian A-01 dipanggil ke Poli Umum.',
      isUrgent: true,
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
      isRead: false,
    };

    mockNotificationRepo.createIfNotExists.mockResolvedValue(
      mockPersistedEntity,
    );

    const event: DomainEvent = {
      eventId: 'evt-call-1',
      eventType: 'appointment.patient_called.v1',
      version: 1,
      occurredAt: '2026-09-27T00:00:00Z',
      module: 'appointments',
      payload: {
        patientUserId: 'user-patient-99',
        ticketNumber: 'A-01',
      },
      actor: {
        userId: 'doctor-1',
        roleCode: 'Dokter Umum',
      },
    };

    await orchestrator.processEvent(event);

    expect(mockNotificationRepo.createIfNotExists).toHaveBeenCalledTimes(1);
    const createCallArgs =
      mockNotificationRepo.createIfNotExists.mock.calls[0][0];

    expect(createCallArgs.idempotencyKey).toBe(
      'evt-call-1:user-patient-99:appointment.patient_called.v1',
    );
    expect(createCallArgs.category).toBe('appointment');
    expect(createCallArgs.title).toBe('Panggilan Antrian');
    expect(createCallArgs.body).toBe(
      'Nomor antrian A-01 dipanggil ke Poli Umum.',
    );
    expect(createCallArgs.recipientUserIds).toEqual(['user-patient-99']);

    expect(mockInAppAdapter.deliver).toHaveBeenCalledWith(
      mockPersistedEntity,
      'user-patient-99',
    );
  });

  it('should skip channel delivery if notification is duplicate (createIfNotExists returns null)', async () => {
    registry.registerRule({
      eventType: 'appointment.patient_called.v1',
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveRecipients: (payload: any) => payload.patientUserId,
      titleTemplate: 'Panggilan Antrian',
      bodyTemplate: 'Silakan masuk.',
    });

    mockNotificationRepo.createIfNotExists.mockResolvedValue(null);

    const event: DomainEvent = {
      eventId: 'evt-dup-1',
      eventType: 'appointment.patient_called.v1',
      version: 1,
      occurredAt: '2026-09-27T00:00:00Z',
      module: 'appointments',
      payload: { patientUserId: 'user-patient-99' },
    };

    await orchestrator.processEvent(event);

    expect(mockNotificationRepo.createIfNotExists).toHaveBeenCalledTimes(1);
    expect(mockInAppAdapter.deliver).not.toHaveBeenCalled();
  });

  it('should support async resolveRecipients and deliver to all resolved recipients', async () => {
    registry.registerRule({
      eventType: 'appointment.created.v1',
      category: 'appointment',
      defaultChannels: ['in_app'],
      resolveRecipients: async (payload: any) => [
        payload.patientUserId,
        'admin-user-1',
        'staff-user-2',
      ],
      titleTemplate: 'Pendaftaran Berhasil',
      bodyTemplate: 'Antrean telah tercatat.',
    });

    mockNotificationRepo.createIfNotExists.mockImplementation(
      async (data: any) => ({
        id: `notif-${data.idempotencyKey}`,
        category: data.category,
        title: data.title,
        body: data.body,
        isUrgent: false,
        createdAt: '2026-09-29T00:00:00Z',
        updatedAt: '2026-09-29T00:00:00Z',
        isRead: false,
      }),
    );

    const event: DomainEvent = {
      eventId: 'evt-async-1',
      eventType: 'appointment.created.v1',
      version: 1,
      occurredAt: '2026-09-29T00:00:00Z',
      module: 'appointments',
      payload: { patientUserId: 'patient-456' },
    };

    await orchestrator.processEvent(event);

    expect(mockNotificationRepo.createIfNotExists).toHaveBeenCalledTimes(3);
    expect(mockInAppAdapter.deliver).toHaveBeenCalledTimes(3);
    expect(mockInAppAdapter.deliver).toHaveBeenCalledWith(
      expect.anything(),
      'patient-456',
    );
    expect(mockInAppAdapter.deliver).toHaveBeenCalledWith(
      expect.anything(),
      'admin-user-1',
    );
    expect(mockInAppAdapter.deliver).toHaveBeenCalledWith(
      expect.anything(),
      'staff-user-2',
    );
  });
});
