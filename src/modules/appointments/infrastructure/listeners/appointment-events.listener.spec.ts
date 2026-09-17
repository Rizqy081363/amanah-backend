import { Test, TestingModule } from '@nestjs/testing';
import {
  AppointmentCreatedEvent,
  AppointmentStatusChangedEvent,
} from '../../../../common/events';
import { RedisService } from '../../../../common/redis/redis.service';
import { DRIZZLE_SOURCE } from '../../../../database/drizzle/drizzle.constants';
import { AppointmentEventsListener } from './appointment-events.listener';

describe('AppointmentEventsListener', () => {
  let listener: AppointmentEventsListener;
  let mockDb: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockResolvedValue([]),
      }),
    };

    mockRedis = {
      deleteByPrefix: jest.fn().mockResolvedValue(1),
      invalidateTags: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentEventsListener,
        {
          provide: DRIZZLE_SOURCE,
          useValue: mockDb,
        },
        {
          provide: RedisService,
          useValue: mockRedis,
        },
      ],
    }).compile();

    listener = module.get<AppointmentEventsListener>(AppointmentEventsListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('should record initial status and invalidate cache on AppointmentCreatedEvent', async () => {
    const event = new AppointmentCreatedEvent(
      'apt-123',
      'pat-456',
      'poli-789',
      '2026-09-18',
      'PAGI',
      'P-001',
      'SUDAH_BUAT_JANJI',
      'corr-1',
      { userId: 'user-admin' },
    );

    await listener.handleAppointmentCreated(event);

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockRedis.invalidateTags).toHaveBeenCalledWith(
      'queue',
      'display',
      'daily',
      'analytics',
    );
  });

  it('should record status transition on AppointmentStatusChangedEvent', async () => {
    const event = new AppointmentStatusChangedEvent(
      'apt-123',
      'SUDAH_BUAT_JANJI',
      'MENUNGGU',
      'Check in',
      'corr-2',
      { userId: 'staff-1' },
    );

    await listener.handleAppointmentStatusChanged(event);

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockRedis.invalidateTags).toHaveBeenCalledWith(
      'queue',
      'display',
      'daily',
      'analytics',
    );
  });

  it('should catch and isolate DB insert errors without throwing (ARC-122)', async () => {
    mockDb.insert.mockReturnValueOnce({
      values: jest.fn().mockRejectedValueOnce(new Error('Insert error')),
    });

    const event = new AppointmentCreatedEvent(
      'apt-123',
      'pat-456',
      'poli-789',
      '2026-09-18',
      'PAGI',
      'P-001',
      'SUDAH_BUAT_JANJI',
    );

    await expect(
      listener.handleAppointmentCreated(event),
    ).resolves.not.toThrow();
  });
});
