import { describe, expect, it } from 'bun:test';
import { AppointmentCandidateResolver } from './appointment-candidate.resolver';

describe('AppointmentCandidateResolver', () => {
  it('should filter out the current doctor from candidate set and categorize dynamically', async () => {
    const mockDb = {
      query: {
        appointments: {
          findFirst: async () => ({
            id: 'apt-1',
            practitionerId: 'doc-current',
            scheduledDate: '2026-10-06',
            scheduledStartTime: '08:30:00',
            scheduledEndTime: '09:00:00',
            status: 'booked',
          }),
          findMany: async () => [],
        },
        practitioners: {
          findMany: async () => [
            {
              id: 'doc-current',
              displayName: 'Dr. Current',
              isAcceptingAppointments: true,
              staffProfile: { fullName: 'Dr. Current', staffType: 'doctor' },
              medicalSpecialty: { name: 'Dokter Umum' },
            },
            {
              id: 'doc-target',
              displayName: 'Dr. Target',
              isAcceptingAppointments: true,
              staffProfile: { fullName: 'Dr. Target', staffType: 'doctor' },
              medicalSpecialty: { name: 'Dokter Umum' },
            },
            {
              id: 'doc-midwife',
              displayName: 'Bdn. Siti',
              isAcceptingAppointments: true,
              staffProfile: { fullName: 'Bdn. Siti', staffType: 'midwife' },
              medicalSpecialty: { name: 'Kesehatan Ibu dan Anak' },
            },
          ],
        },
        practitionerScheduleSessions: {
          findMany: async () => [
            {
              id: 'sess-1',
              practitionerId: 'doc-target',
              scheduleDate: '2026-10-06',
              startTime: '08:00:00',
              endTime: '12:00:00',
              status: 'open',
            },
          ],
        },
      },
    } as any;

    const resolver = new AppointmentCandidateResolver(mockDb);
    const result = await resolver.resolveDoctorCandidates('apt-1');

    expect(result.currentDoctorId).toBe('doc-current');
    expect(result.groups.length).toBe(2);

    const allDoctors = result.groups.flatMap((g) => g.doctors);
    expect(allDoctors.some((d) => d.id === 'doc-current')).toBe(false);

    const targetDoc = allDoctors.find((d) => d.id === 'doc-target');
    expect(targetDoc).toBeDefined();
    expect(targetDoc?.availability).toBe('AVAILABLE');
    expect(targetDoc?.existingSessionId).toBe('sess-1');

    const midwifeDoc = allDoctors.find((d) => d.id === 'doc-midwife');
    expect(midwifeDoc).toBeDefined();
    expect(midwifeDoc?.availability).toBe('SCHEDULE_REQUIRED');
  });

  it('should identify occupied and available rooms correctly', async () => {
    const mockDb = {
      query: {
        appointments: {
          findFirst: async () => ({
            id: 'apt-1',
            roomId: 'room-1',
            scheduledDate: '2026-10-06',
            scheduledStartTime: '08:30:00',
            scheduledEndTime: '09:00:00',
            status: 'booked',
          }),
          findMany: async () => [
            {
              id: 'apt-2',
              roomId: 'room-2',
              bookingCode: 'BOOK-OCCUPIED',
              scheduledDate: '2026-10-06',
              scheduledStartTime: '08:30:00',
              status: 'waiting',
              practitioner: {
                displayName: 'Dr. Occupant',
                staffProfile: { fullName: 'Dr. Occupant' },
              },
            },
          ],
        },
        clinicRooms: {
          findMany: async () => [
            {
              id: 'room-1',
              name: 'Ruang Poli 1',
              code: 'R1',
              location: 'Gedung A',
              isActive: true,
            },
            {
              id: 'room-2',
              name: 'Ruang Poli 2',
              code: 'R2',
              location: 'Gedung A',
              isActive: true,
            },
            {
              id: 'room-3',
              name: 'Ruang KIA 1',
              code: 'RK1',
              location: 'Gedung B',
              isActive: true,
            },
          ],
        },
      },
    } as any;

    const resolver = new AppointmentCandidateResolver(mockDb);
    const rooms = await resolver.resolveRoomCandidates('apt-1');

    expect(rooms.length).toBe(3);
    const room2 = rooms.find((r) => r.id === 'room-2');
    expect(room2?.isAvailable).toBe(false);
    expect(room2?.occupantDetails?.doctorName).toBe('Dr. Occupant');

    const room3 = rooms.find((r) => r.id === 'room-3');
    expect(room3?.isAvailable).toBe(true);
  });
});
