import { ScheduleDrizzleRepository } from '@modules/schedules/infrastructure/drizzle/schedule.drizzle-repository';
import { createMockDb } from '@modules/schedules/infrastructure/drizzle/testing/schedule-test-mock';

describe('ScheduleDrizzleRepository - checkRescheduleEligibility and reschedule guard', () => {
  const practitionerId = '8489be4c-7c05-4c07-b352-7bf579b29cb1';
  const sessionId = '3cb62e10-450b-43e5-aba9-49ec37079ebb';

  it('returns isSourceEligible false when source session is closed', async () => {
    const db = createMockDb();
    db.query.practitioners.findFirst.mockResolvedValue({
      id: practitionerId,
      displayName: 'dr. Ahmad Santoso',
    });
    db.query.practitionerScheduleSessions.findFirst.mockResolvedValue({
      id: sessionId,
      practitionerId,
      scheduleDate: '2026-09-24',
      startTime: '08:00:00',
      endTime: '12:00:00',
      status: 'closed',
      capacity: 8,
      availableSlots: 0,
      sessionLabel: 'Sesi Pagi',
      sessionShift: 'morning',
    });
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.appointments.findMany.mockResolvedValue([]);

    const repository = new ScheduleDrizzleRepository(db as never);
    const result = await repository.checkRescheduleEligibility(
      practitionerId,
      sessionId,
      {},
    );

    expect(result.isEligible).toBe(false);
    expect(result.sourceSession.isSourceEligible).toBe(false);
    expect(result.sourceSession.rejectionReason).toContain(
      'Sesi berstatus Tutup',
    );
    expect(result.actionableGuidance).toContain('Sesi berstatus Tutup');
  });

  it('returns isSourceEligible true when source session is open', async () => {
    const db = createMockDb();
    db.query.practitioners.findFirst.mockResolvedValue({
      id: practitionerId,
      displayName: 'dr. Ahmad Santoso',
    });
    db.query.practitionerScheduleSessions.findFirst.mockResolvedValue({
      id: sessionId,
      practitionerId,
      scheduleDate: '2026-09-24',
      startTime: '08:00:00',
      endTime: '12:00:00',
      status: 'open',
      capacity: 8,
      availableSlots: 8,
      sessionLabel: 'Sesi Pagi',
      sessionShift: 'morning',
    });
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.appointments.findMany.mockResolvedValue([]);

    const repository = new ScheduleDrizzleRepository(db as never);
    const result = await repository.checkRescheduleEligibility(
      practitionerId,
      sessionId,
      {},
    );

    expect(result.isEligible).toBe(true);
    expect(result.sourceSession.isSourceEligible).toBe(true);
    expect(result.sourceSession.rejectionReason).toBeNull();
    expect(result.targetValidation.evaluated).toBe(false);
  });

  it('throws 422 when attempting to reschedule a closed session', async () => {
    const db = createMockDb();
    db.query.practitioners.findFirst.mockResolvedValue({
      id: practitionerId,
      displayName: 'dr. Ahmad Santoso',
    });
    db.query.practitionerScheduleSessions.findFirst.mockResolvedValue({
      id: sessionId,
      practitionerId,
      scheduleDate: '2026-09-24',
      startTime: '08:00:00',
      endTime: '12:00:00',
      status: 'closed',
    });

    const repository = new ScheduleDrizzleRepository(db as never);

    await expect(
      repository.rescheduleAdminDoctorSession(practitionerId, sessionId, {
        targetDate: '2026-10-15',
        targetStartTime: '09:00',
      }),
    ).rejects.toThrow('Sesi berstatus Tutup');
  });
});
