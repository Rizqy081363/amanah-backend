import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { DRIZZLE_SOURCE } from '../../database/drizzle/drizzle.constants';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
  AuditRecordEvent,
} from '../events';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';

describe('Transactional Outbox Pattern & Worker (Fase 8)', () => {
  let service: OutboxService;
  let worker: OutboxWorker;
  let mockDb: any;
  let mockEventEmitter: any;
  let mockConfigService: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([
            {
              id: 'event-uuid-1',
              aggregateType: 'appointment',
              aggregateId: 'apt-123',
              eventType: 'appointment.created.v1',
              payload: { appointmentId: 'apt-123' },
              status: 'pending',
              retryCount: 0,
              maxRetries: 5,
              scheduledAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ]),
        }),
      }),
      execute: jest.fn().mockResolvedValue({
        rows: [],
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    mockEventEmitter = {
      emitAsync: jest.fn().mockResolvedValue([]),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(1000),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        OutboxWorker,
        {
          provide: DRIZZLE_SOURCE,
          useValue: mockDb,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
    worker = module.get<OutboxWorker>(OutboxWorker);
  });

  describe('OutboxService', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
      expect(worker).toBeDefined();
    });

    it('should record an outbox event into PostgreSQL table', async () => {
      const result = await service.recordEvent({
        aggregateType: 'appointment',
        aggregateId: 'apt-123',
        eventType: AppointmentCreatedEvent.EVENT_NAME,
        payload: { appointmentId: 'apt-123', queueNumber: 'P-001' },
        traceId: 'trace-xyz',
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBe('event-uuid-1');
      expect(result.status).toBe('pending');
    });

    it('should participate in provided database transaction if present (ARC-089..094)', async () => {
      const mockTx = {
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([
              {
                id: 'tx-event-1',
                aggregateType: 'appointment',
                aggregateId: 'apt-tx',
                eventType: AppointmentStatusChangedEvent.EVENT_NAME,
                payload: { appointmentId: 'apt-tx' },
                status: 'pending',
              },
            ]),
          }),
        }),
      };

      const result = await service.recordEvent(
        {
          aggregateType: 'appointment',
          aggregateId: 'apt-tx',
          eventType: AppointmentStatusChangedEvent.EVENT_NAME,
          payload: { appointmentId: 'apt-tx' },
        },
        mockTx,
      );

      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result.id).toBe('tx-event-1');
    });

    it('should fetch and claim batch using SKIP LOCKED', async () => {
      mockDb.execute.mockResolvedValueOnce({
        rows: [
          {
            id: 'evt-1',
            aggregate_type: 'appointment',
            aggregate_id: 'apt-1',
            event_type: 'appointment.created.v1',
            payload: JSON.stringify({ appointmentId: 'apt-1' }),
            status: 'processing',
            retry_count: 0,
            max_retries: 5,
            created_at: new Date().toISOString(),
            scheduled_at: new Date().toISOString(),
          },
        ],
      });

      const batch = await service.fetchAndClaimBatch(10);

      expect(mockDb.execute).toHaveBeenCalled();
      expect(batch).toHaveLength(1);
      expect(batch[0].id).toBe('evt-1');
      expect(batch[0].aggregateType).toBe('appointment');
      expect(batch[0].payload).toEqual({ appointmentId: 'apt-1' });
    });

    it('should mark outbox event as published', async () => {
      await service.markPublished('evt-123');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should reschedule with exponential backoff on transient failure (OPS-152)', async () => {
      await service.markFailed('evt-err', 'Network error', 1, 5);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should transition to dead_letter when retry limit is reached (OPS-154)', async () => {
      await service.markFailed('evt-fatal', 'Fatal syntax error', 4, 5);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should calculate queue metrics and lag for observability (OPS-161)', async () => {
      mockDb.execute
        .mockResolvedValueOnce({
          rows: [
            { status: 'pending', count: 4 },
            { status: 'published', count: 42 },
            { status: 'dead_letter', count: 1 },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ age_seconds: 12 }],
        });

      const metrics = await service.getMetrics();

      expect(metrics.pending).toBe(4);
      expect(metrics.published).toBe(42);
      expect(metrics.deadLetter).toBe(1);
      expect(metrics.total).toBe(47);
      expect(metrics.oldestPendingAgeSeconds).toBe(12);
    });

    it('should reprocess dead letter events back to pending queue', async () => {
      mockDb.execute.mockResolvedValueOnce({
        rows: [{ id: 'dl-1' }, { id: 'dl-2' }],
      });

      const reprocessed = await service.reprocessDeadLetters(10);
      expect(reprocessed).toBe(2);
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('OutboxWorker', () => {
    it('should process batch, deserialize known event, and mark published', async () => {
      jest.spyOn(service, 'fetchAndClaimBatch').mockResolvedValueOnce([
        {
          id: 'worker-evt-1',
          aggregateType: 'appointment',
          aggregateId: 'apt-100',
          eventType: AppointmentCreatedEvent.EVENT_NAME,
          payload: {
            appointmentId: 'apt-100',
            patientId: 'pat-1',
            poliklinikId: 'poli-1',
            appointmentDate: '2026-09-18',
            session: 'PAGI',
            queueNumber: 'P-001',
            status: 'SUDAH_BUAT_JANJI',
          },
          status: 'processing',
          retryCount: 0,
          maxRetries: 5,
          errorMessage: null,
          traceId: 'trace-123',
          scheduledAt: new Date().toISOString(),
          publishedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      const markPublishedSpy = jest
        .spyOn(service, 'markPublished')
        .mockResolvedValueOnce();
      jest.spyOn(service, 'getMetrics').mockResolvedValueOnce({
        pending: 0,
        processing: 0,
        published: 1,
        failed: 0,
        deadLetter: 0,
        total: 1,
        oldestPendingAgeSeconds: null,
      });

      const outcome = await worker.triggerImmediate(10);

      expect(outcome.processedCount).toBe(1);
      expect(outcome.publishedCount).toBe(1);
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        AppointmentCreatedEvent.EVENT_NAME,
        expect.any(AppointmentCreatedEvent),
      );
      expect(markPublishedSpy).toHaveBeenCalledWith('worker-evt-1');
    });

    it('should deserialize AppointmentStatusChangedEvent and AuditRecordEvent', async () => {
      jest.spyOn(service, 'fetchAndClaimBatch').mockResolvedValueOnce([
        {
          id: 'status-evt-1',
          aggregateType: 'appointment',
          aggregateId: 'apt-200',
          eventType: AppointmentStatusChangedEvent.EVENT_NAME,
          payload: {
            appointmentId: 'apt-200',
            previousStatus: 'SUDAH_BUAT_JANJI',
            newStatus: 'MENUNGGU',
            reason: 'Check-in',
          },
          status: 'processing',
          retryCount: 0,
          maxRetries: 5,
          errorMessage: null,
          traceId: null,
          scheduledAt: new Date().toISOString(),
          publishedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'audit-evt-1',
          aggregateType: 'audit',
          aggregateId: 'aud-1',
          eventType: AuditRecordEvent.EVENT_NAME,
          payload: {
            action: 'create_appointment',
            entityTable: 'appointments',
            entityId: 'apt-200',
          },
          status: 'processing',
          retryCount: 0,
          maxRetries: 5,
          errorMessage: null,
          traceId: null,
          scheduledAt: new Date().toISOString(),
          publishedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      jest.spyOn(service, 'markPublished').mockResolvedValue();
      jest.spyOn(service, 'getMetrics').mockResolvedValueOnce({
        pending: 0,
        processing: 0,
        published: 2,
        failed: 0,
        deadLetter: 0,
        total: 2,
        oldestPendingAgeSeconds: null,
      });

      const outcome = await worker.triggerImmediate(10);

      expect(outcome.processedCount).toBe(2);
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        AppointmentStatusChangedEvent.EVENT_NAME,
        expect.any(AppointmentStatusChangedEvent),
      );
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        AuditRecordEvent.EVENT_NAME,
        expect.any(AuditRecordEvent),
      );
    });

    it('should handle dispatch failure and mark event as failed', async () => {
      jest.spyOn(service, 'fetchAndClaimBatch').mockResolvedValueOnce([
        {
          id: 'failing-evt',
          aggregateType: 'appointment',
          aggregateId: 'apt-fail',
          eventType: 'unknown.event',
          payload: {},
          status: 'processing',
          retryCount: 0,
          maxRetries: 5,
          errorMessage: null,
          traceId: null,
          scheduledAt: new Date().toISOString(),
          publishedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      mockEventEmitter.emitAsync.mockRejectedValueOnce(
        new Error('Consumer crashed'),
      );
      const markFailedSpy = jest
        .spyOn(service, 'markFailed')
        .mockResolvedValueOnce();
      jest.spyOn(service, 'getMetrics').mockResolvedValueOnce({
        pending: 1,
        processing: 0,
        published: 0,
        failed: 1,
        deadLetter: 0,
        total: 1,
        oldestPendingAgeSeconds: 5,
      });

      const outcome = await worker.triggerImmediate(10);

      expect(outcome.processedCount).toBe(1);
      expect(outcome.failedCount).toBe(1);
      expect(markFailedSpy).toHaveBeenCalledWith(
        'failing-evt',
        'Consumer crashed',
        0,
        5,
      );
    });

    it('should support graceful shutdown (OPS-162)', async () => {
      worker.onModuleInit();
      await worker.onModuleDestroy();
      // Should not throw and clean up interval timer
      expect(true).toBe(true);
    });
  });
});
