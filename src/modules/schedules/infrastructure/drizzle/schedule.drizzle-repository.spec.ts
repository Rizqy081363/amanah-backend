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
        },
      },
    };
  }

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

  it('uses the linked user image as the admin schedule avatar when the staff profile avatar is empty', async () => {
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

    expect(response.data.doctors[0].avatar).toBe(
      '/api/v1/users/user-1/avatar?v=20260922',
    );
  });

  it('uses the linked user image as the clinical practitioner avatar when the staff profile avatar is empty', async () => {
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

    expect(practitioners[0].avatar).toBe(
      '/api/v1/users/user-1/avatar?v=20260922',
    );
  });
});
