import { ScheduleDrizzleRepository } from './schedule.drizzle-repository';
import {
  createMockDb,
  practitionerWithoutAvatar,
} from './testing/schedule-test-mock';

describe('ScheduleDrizzleRepository presentation contracts', () => {
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
});
