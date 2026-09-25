export const practitionerWithoutAvatar = {
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

export function createMockDb() {
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
      practitionerScheduleClosures: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      scheduleRescheduleEvents: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      clinicRooms: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    },
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    }),
  };
}
