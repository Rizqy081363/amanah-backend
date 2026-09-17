import { Test, TestingModule } from '@nestjs/testing';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
  AuditRecordEvent,
} from '../../../../common/events';
import { AuditService } from '../../application/audit.service';
import { AuditEventListener } from './audit-event.listener';

describe('AuditEventListener', () => {
  let listener: AuditEventListener;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const mockAuditService = {
      recordLog: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditEventListener,
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    listener = module.get<AuditEventListener>(AuditEventListener);
    auditService = module.get(AuditService);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('should handle AppointmentCreatedEvent and delegate to AuditService', async () => {
    const event = new AppointmentCreatedEvent(
      'apt-123',
      'pat-456',
      'poli-789',
      '2026-09-18',
      'PAGI',
      'P-001',
      'SUDAH_BUAT_JANJI',
      'corr-1',
      {
        userId: 'user-admin',
        roleCode: 'ADMIN',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      },
    );

    await listener.handleAppointmentCreated(event);

    expect(auditService.recordLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create_appointment',
        entityTable: 'appointments',
        entityId: 'apt-123',
        actorUserId: 'user-admin',
        actorRoleCode: 'ADMIN',
      }),
    );
  });

  it('should handle AppointmentStatusChangedEvent with previous and new status', async () => {
    const event = new AppointmentStatusChangedEvent(
      'apt-123',
      'MENUNGGU',
      'SEDANG_DIPERIKSA',
      'Panggilan dokter',
      'corr-2',
      {
        userId: 'staff-1',
        roleCode: 'STAF',
      },
    );

    await listener.handleAppointmentStatusChanged(event);

    expect(auditService.recordLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_appointment_status',
        entityTable: 'appointments',
        entityId: 'apt-123',
        oldValues: { status: 'MENUNGGU' },
        newValues: { status: 'SEDANG_DIPERIKSA', reason: 'Panggilan dokter' },
        actorUserId: 'staff-1',
      }),
    );
  });

  it('should handle generic AuditRecordEvent', async () => {
    const event = new AuditRecordEvent(
      'update_clinic_profile',
      'clinic_profiles',
      'clinic-1',
      { name: 'Old Clinic' },
      { name: 'New Clinic' },
      'corr-3',
      { userId: 'admin-1' },
    );

    await listener.handleGenericAuditRecord(event);

    expect(auditService.recordLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_clinic_profile',
        entityTable: 'clinic_profiles',
        entityId: 'clinic-1',
      }),
    );
  });
});
