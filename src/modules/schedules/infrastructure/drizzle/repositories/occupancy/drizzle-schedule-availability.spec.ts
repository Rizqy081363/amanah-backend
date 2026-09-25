import { ScheduleDrizzleRepository } from '@modules/schedules/infrastructure/drizzle/schedule.drizzle-repository';
import { createMockDb } from '@modules/schedules/infrastructure/drizzle/testing/schedule-test-mock';

describe('ScheduleDrizzleRepository - Session timing & conflict metadata', () => {
  it('calculates 30-minute end time and capacity 1 by default when doctor starts at 02:00 in early morning', async () => {
    const practitionerId = '3cb62e10-450b-43e5-aba9-49ec37079ebb';
    const db = createMockDb();
    db.query.practitioners.findFirst.mockResolvedValue({
      id: practitionerId,
      consultationDurationMinutes: 30,
      startPrecisionMinutes: 1,
    });
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([]);
    (db as any).insert = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: jest.fn().mockResolvedValue([
          {
            id: 'session-new-1',
            practitionerId,
            scheduleDate: '2026-09-25',
            startTime: '02:00:00',
            endTime: '02:30:00',
            capacity: 1,
            availableSlots: 1,
            status: 'open',
            updatedAt: new Date().toISOString(),
          },
        ]),
      }),
    });
    db.query.practitionerScheduleSessions.findFirst = jest
      .fn()
      .mockResolvedValue({
        id: 'session-new-1',
        practitionerId,
        scheduleDate: '2026-09-25',
        sessionShift: 'early_morning',
        startTime: '02:00:00',
        endTime: '02:30:00',
        capacity: 1,
        availableSlots: 1,
        status: 'open',
        practitioner: {
          consultationDurationMinutes: 30,
          startPrecisionMinutes: 1,
        },
        clinicRoom: null,
        clinicService: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    (db.query as any).appointments = {
      findMany: jest.fn().mockResolvedValue([]),
    };

    const repository = new ScheduleDrizzleRepository(db as never);

    const result = await repository.createAvailability(
      practitionerId,
      {
        date: '2026-09-25',
        scheduleContextId: 'early_morning',
        startTime: '02:00',
      },
      {
        userId: 'user-1',
        durationEditableByCurrentUser: false,
      },
    );

    // Sesi 30 menit: 02:00 s/d 02:30, kapasitas 1, sisa slot menuju jam 06:00 = 7
    expect(result.schedule.startTime).toBe('02:00');
    expect(result.schedule.endTime).toBe('02:30');
    expect(result.schedule.capacity).toBe(1);
    expect(result.projection.projectedEndTime).toBe('02:30');
    expect(result.projection.capacity).toBe(1);
    expect(result.projection.remainingShiftSlots).toBe(7);
    expect(result.projection.intervals).toHaveLength(1);
    expect(result.projection.intervals[0].startTime).toBe('02:00');
    expect(result.projection.intervals[0].endTime).toBe('02:30');
  });

  it('throws ConflictException with structured metadata when doctor has overlapping session', async () => {
    const practitionerId = '3cb62e10-450b-43e5-aba9-49ec37079ebb';
    const db = createMockDb();
    db.query.practitioners.findFirst.mockResolvedValue({
      id: practitionerId,
      consultationDurationMinutes: 30,
      startPrecisionMinutes: 1,
    });
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([
      {
        id: 'existing-session-1',
        practitionerId,
        scheduleDate: '2026-09-25',
        sessionLabel: 'Dini Hari',
        sessionShift: 'early_morning',
        startTime: '02:00:00',
        endTime: '02:30:00',
        roomId: 'room-1',
      },
    ]);

    const repository = new ScheduleDrizzleRepository(db as never);

    await expect(
      repository.createAvailability(
        practitionerId,
        {
          date: '2026-09-25',
          scheduleContextId: 'early_morning',
          startTime: '02:00',
        },
        {
          userId: 'user-1',
          durationEditableByCurrentUser: false,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PRACTITIONER_ALREADY_SCHEDULED',
        metadata: {
          conflictingSessionId: 'existing-session-1',
          scheduleDate: '2026-09-25',
          startTime: '02:00',
          endTime: '02:30',
          timeRange: '02:00 - 02:30 WIB',
          roomId: 'room-1',
          sessionShift: 'early_morning',
          sessionLabel: 'Dini Hari',
        },
      },
    });
  });
});
