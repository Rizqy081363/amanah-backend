import { ScheduleDrizzleRepository } from '@modules/schedules/infrastructure/drizzle/schedule.drizzle-repository';
import { createMockDb } from '@modules/schedules/infrastructure/drizzle/testing/schedule-test-mock';

describe('ScheduleDrizzleRepository - getOccupancyOverview', () => {
  it('returns anti-collision grid across 4 shifts distinguishing self vs other doctor room occupation', async () => {
    const practitionerId = '3cb62e10-450b-43e5-aba9-49ec37079ebb';
    const otherPractitionerId = '4db73e20-561c-54e6-bca0-50fd48080fcc';
    const roomId = 'room-101-uuid';

    const db = createMockDb();
    db.query.practitioners.findFirst.mockResolvedValue({
      id: practitionerId,
      consultationDurationMinutes: 30,
      startPrecisionMinutes: 1,
      displayName: 'dr. Ahmad Santoso',
    });
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.clinicRooms.findFirst.mockResolvedValue({
      id: roomId,
      name: 'Ruang Poli 1',
    });

    // Active sessions on that date:
    // 1. Doctor A (self) at 02:00 - 02:30 in room 1
    // 2. Doctor B (other) at 06:00 - 06:30 in room 1
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([
      {
        id: 'session-self-1',
        practitionerId,
        scheduleDate: '2026-09-25',
        startTime: '02:00:00',
        endTime: '02:30:00',
        roomId,
        status: 'open',
        clinicRoom: { name: 'Ruang Poli 1' },
        practitioner: {
          displayName: 'dr. Ahmad Santoso',
          staffProfile: { fullName: 'dr. Ahmad Santoso' },
        },
      },
      {
        id: 'session-other-1',
        practitionerId: otherPractitionerId,
        scheduleDate: '2026-09-25',
        startTime: '06:00:00',
        endTime: '06:30:00',
        roomId,
        status: 'open',
        clinicRoom: { name: 'Ruang Poli 1' },
        practitioner: {
          displayName: 'Bdn. Siti Rahmawati',
          staffProfile: { fullName: 'Bdn. Siti Rahmawati' },
        },
      },
    ]);

    const repository = new ScheduleDrizzleRepository(db as never);

    const overview = await repository.getOccupancyOverview(practitionerId, {
      date: '2026-09-25',
      roomId,
    });

    expect(overview.date).toBe('2026-09-25');
    expect(overview.practitionerId).toBe(practitionerId);
    expect(overview.practitionerName).toBe('dr. Ahmad Santoso');
    expect(overview.effectiveConsultationDurationMinutes).toBe(30);
    expect(overview.isCuti).toBe(false);

    // Verify shifts structure
    expect(overview.shifts).toHaveLength(4);
    expect(overview.shifts.map((s: any) => s.contextId)).toEqual([
      'early_morning',
      'morning',
      'afternoon',
      'night',
    ]);

    // Shift 1: early_morning (00:00 - 06:00, 12 slots)
    const earlyMorning = overview.shifts[0];
    expect(earlyMorning.totalSlots).toBe(12);
    expect(earlyMorning.availableSlotsCount).toBe(11);
    expect(earlyMorning.occupiedSlotsCount).toBe(1);

    // Check slot at 02:00 (slotIndex 5): OCCUPIED_BY_SELF
    const selfSlot = earlyMorning.slots.find(
      (s: any) => s.startTime === '02:00',
    );
    expect(selfSlot).toBeDefined();
    expect(selfSlot?.isAvailable).toBe(false);
    expect(selfSlot?.status).toBe('OCCUPIED_BY_SELF');
    expect(selfSlot?.displayLabel).toContain('Jadwal Anda');
    expect(selfSlot?.conflictInfo?.type).toBe('SELF');
    expect(selfSlot?.conflictInfo?.sessionId).toBe('session-self-1');

    // Shift 2: morning (06:00 - 12:00, 12 slots)
    const morning = overview.shifts[1];
    expect(morning.totalSlots).toBe(12);
    expect(morning.availableSlotsCount).toBe(11);
    expect(morning.occupiedSlotsCount).toBe(1);

    // Check slot at 06:00 (slotIndex 1): OCCUPIED_BY_OTHER
    const otherSlot = morning.slots.find((s: any) => s.startTime === '06:00');
    expect(otherSlot).toBeDefined();
    expect(otherSlot?.isAvailable).toBe(false);
    expect(otherSlot?.status).toBe('OCCUPIED_BY_OTHER');
    expect(otherSlot?.displayLabel).toContain('Bdn. Siti Rahmawati');
    expect(otherSlot?.conflictInfo?.type).toBe('OTHER');
    expect(otherSlot?.conflictInfo?.practitionerName).toBe(
      'Bdn. Siti Rahmawati',
    );

    // An unbooked slot should be AVAILABLE
    const openSlot = morning.slots.find((s: any) => s.startTime === '06:30');
    expect(openSlot).toBeDefined();
    expect(openSlot?.isAvailable).toBe(true);
    expect(openSlot?.status).toBe('AVAILABLE');
    expect(openSlot?.displayLabel).toBe('Tersedia');
    expect(openSlot?.conflictInfo).toBeNull();
  });
});
