import { ScheduleDrizzleRepository } from './schedule.drizzle-repository';

describe('ScheduleDrizzleRepository presentation contracts', () => {
  const practitionerWithoutAvatar = {
    id: 'practitioner-1',
    displayName: 'dr. Amanah',
    rating: null,
    tags: [],
    staffProfile: {
      fullName: 'dr. Amanah',
      email: 'doctor@amanah.test',
      phone: null,
      avatarUrl: null,
      user: {
        imageUrl: null,
      },
      clinicUnit: {
        name: 'Poli Umum',
      },
    },
    medicalSpecialty: null,
    clinicRoom: {
      name: 'Ruang 101',
      location: 'Lantai 1',
    },
  };

  function createMockDb() {
    return {
      query: {
        practitioners: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
        },
        practitionerScheduleDaySettings: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        practitionerLeavePeriods: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
        practitionerScheduleSessions: {
          findMany: jest.fn(),
          findFirst: jest.fn(),
        },
        appointments: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        clinicRooms: {
          findFirst: jest.fn(),
          findMany: jest.fn(),
        },
      },
    };
  }

  it('returns canonical closed schedule card without active slot metrics when all sessions are closed', async () => {
    const db = createMockDb();
    db.query.practitioners.findMany.mockResolvedValue([
      practitionerWithoutAvatar,
    ]);
    db.query.practitionerScheduleDaySettings.findMany.mockResolvedValue([]);
    db.query.practitionerLeavePeriods.findMany.mockResolvedValue([]);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([
      {
        id: 'session-closed-1',
        practitionerId: practitionerWithoutAvatar.id,
        scheduleDate: '2026-09-24',
        sessionLabel: 'Dini Hari',
        sessionShift: 'early_morning',
        startTime: '00:00:00',
        endTime: '00:30:00',
        capacity: 1,
        availableSlots: 0,
        status: 'closed',
        clinicRoom: null,
      },
      {
        id: 'session-closed-2',
        practitionerId: practitionerWithoutAvatar.id,
        scheduleDate: '2026-09-24',
        sessionLabel: 'Pagi',
        sessionShift: 'morning',
        startTime: '06:00:00',
        endTime: '06:30:00',
        capacity: 1,
        availableSlots: 0,
        status: 'closed',
        clinicRoom: null,
      },
    ]);

    const repository = new ScheduleDrizzleRepository(db as never);

    const response = await repository.findAdminDoctorSchedules({
      page: 1,
      limit: 6,
      date: '2026-09-24',
    });

    const card = response.data.doctors[0];
    expect(card.status_dokter).toBe('CLOSED');
    expect(card.slot_tersedia).toBe(0);
    expect(card.kapasitas_per_hari).toBe(0);
    expect(card.jadwal_hari_ini).toBe('-');
    expect(card.jadwal_praktik_mendatang).toBe('Praktik Ditutup');
    expect(card.slot_terisi_akumulasi).toBe(0);
    expect(card.slot_kapasitas_akumulasi).toBe(0);
    expect(card.display_akumulasi_slot).toBe('-');
  });

  it('returns OCCUPIED instead of CLOSED when sessions are operationally open but fully occupied', async () => {
    const db = createMockDb();
    db.query.practitioners.findMany.mockResolvedValue([
      practitionerWithoutAvatar,
    ]);
    db.query.practitionerScheduleDaySettings.findMany.mockResolvedValue([]);
    db.query.practitionerLeavePeriods.findMany.mockResolvedValue([]);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([
      {
        id: 'session-full-1',
        practitionerId: practitionerWithoutAvatar.id,
        scheduleDate: '2026-09-24',
        sessionLabel: 'Pagi',
        sessionShift: 'morning',
        startTime: '08:00:00',
        endTime: '08:30:00',
        capacity: 1,
        availableSlots: 0,
        status: 'open',
        clinicRoom: null,
      },
    ]);

    const repository = new ScheduleDrizzleRepository(db as never);

    const response = await repository.findAdminDoctorSchedules({
      page: 1,
      limit: 6,
      date: '2026-09-24',
    });

    const card = response.data.doctors[0];
    expect(card.status_dokter).toBe('OCCUPIED');
    expect(card.slot_tersedia).toBe(0);
    expect(card.kapasitas_per_hari).toBe(1);
    expect(card.slot_terisi_akumulasi).toBe(1);
    expect(card.slot_kapasitas_akumulasi).toBe(1);
    expect(card.display_akumulasi_slot).toBe('1 / 1');
  });

  it('returns an empty avatar string in admin doctor schedule cards when no avatar is stored', async () => {
    const db = createMockDb();
    db.query.practitioners.findMany.mockResolvedValue([
      practitionerWithoutAvatar,
    ]);
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerScheduleDaySettings.findMany.mockResolvedValue([]);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findMany.mockResolvedValue([]);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([]);

    const repository = new ScheduleDrizzleRepository(db as never);

    const response = await repository.findAdminDoctorSchedules({
      page: 1,
      limit: 6,
      date: '2026-09-22',
    });

    expect(response.data.doctors[0].avatar).toBe('');
  });

  it('returns an empty avatar string in clinical practitioner cards when no avatar is stored', async () => {
    const db = createMockDb();
    db.query.practitioners.findMany.mockResolvedValue([
      practitionerWithoutAvatar,
    ]);
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([]);

    const repository = new ScheduleDrizzleRepository(db as never);

    const practitioners = await repository.findClinicalPractitioners({
      date: '2026-09-22',
    });

    expect(practitioners[0].avatar).toBe('');
  });

  it('does not fall back to linked user image for admin schedule avatar when the staff profile avatar is empty', async () => {
    const db = createMockDb();
    db.query.practitioners.findMany.mockResolvedValue([
      {
        ...practitionerWithoutAvatar,
        staffProfile: {
          ...practitionerWithoutAvatar.staffProfile,
          user: {
            imageUrl: '/api/v1/users/user-1/avatar?v=20260922',
          },
        },
      },
    ]);
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerScheduleDaySettings.findMany.mockResolvedValue([]);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findMany.mockResolvedValue([]);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([]);

    const repository = new ScheduleDrizzleRepository(db as never);

    const response = await repository.findAdminDoctorSchedules({
      page: 1,
      limit: 6,
      date: '2026-09-22',
    });

    expect(response.data.doctors[0].avatar).toBe('');
  });

  it('does not fall back to linked user image for clinical practitioner avatar when the staff profile avatar is empty', async () => {
    const db = createMockDb();
    db.query.practitioners.findMany.mockResolvedValue([
      {
        ...practitionerWithoutAvatar,
        staffProfile: {
          ...practitionerWithoutAvatar.staffProfile,
          user: {
            imageUrl: '/api/v1/users/user-1/avatar?v=20260922',
          },
        },
      },
    ]);
    db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
    db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
    db.query.practitionerScheduleSessions.findMany.mockResolvedValue([]);

    const repository = new ScheduleDrizzleRepository(db as never);

    const practitioners = await repository.findClinicalPractitioners({
      date: '2026-09-22',
    });

    expect(practitioners[0].avatar).toBe('');
  });

  describe('Session timing & conflict metadata', () => {
    it('calculates 30-minute end time and capacity 1 by default when doctor starts at 02:00 in early morning', async () => {
      const practitionerId = '3cb62e10-450b-43e5-aba9-49ec37079ebb';
      const db = createMockDb();
      db.query.practitioners.findFirst.mockResolvedValue({
        id: practitionerId,
        consultationDurationMinutes: 30,
        startPrecisionMinutes: 1,
      });
      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(
        null,
      );
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
      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(
        null,
      );
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

  describe('getOccupancyOverview', () => {
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
      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(
        null,
      );
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
      expect(overview.shifts.map((s) => s.contextId)).toEqual([
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
      const selfSlot = earlyMorning.slots.find((s) => s.startTime === '02:00');
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
      const otherSlot = morning.slots.find((s) => s.startTime === '06:00');
      expect(otherSlot).toBeDefined();
      expect(otherSlot?.isAvailable).toBe(false);
      expect(otherSlot?.status).toBe('OCCUPIED_BY_OTHER');
      expect(otherSlot?.displayLabel).toContain('Bdn. Siti Rahmawati');
      expect(otherSlot?.conflictInfo?.type).toBe('OTHER');
      expect(otherSlot?.conflictInfo?.practitionerName).toBe(
        'Bdn. Siti Rahmawati',
      );

      // An unbooked slot should be AVAILABLE
      const openSlot = morning.slots.find((s) => s.startTime === '06:30');
      expect(openSlot).toBeDefined();
      expect(openSlot?.isAvailable).toBe(true);
      expect(openSlot?.status).toBe('AVAILABLE');
      expect(openSlot?.displayLabel).toBe('Tersedia');
      expect(openSlot?.conflictInfo).toBeNull();
    });
  });

  describe('checkRescheduleEligibility and reschedule guard', () => {
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
      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(
        null,
      );
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
      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(
        null,
      );
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
});
