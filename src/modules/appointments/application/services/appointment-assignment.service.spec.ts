import { describe, expect, it } from 'bun:test';
import { AppointmentAssignmentService } from './appointment-assignment.service';

describe('AppointmentAssignmentService', () => {
  it('should reject reassignment if target doctor already has conflicting appointment', async () => {
    const mockDb = {
      transaction: async (cb: any) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => ({
                for: async () => [
                  {
                    id: 'apt-1',
                    status: 'booked',
                    scheduledDate: '2026-10-06',
                    scheduledStartTime: '08:30:00',
                    scheduledEndTime: '09:00:00',
                  },
                ],
              }),
            }),
          }),
          query: {
            practitioners: {
              findFirst: async () => ({
                id: 'doc-target',
                displayName: 'Dr. Target',
                isAcceptingAppointments: true,
              }),
            },
            appointments: {
              findFirst: async () => ({
                id: 'apt-conflict',
                practitionerId: 'doc-target',
              }),
            },
          },
        };
        return cb(tx);
      },
    } as any;

    const mockRedis = {
      deleteByPrefix: async () => {},
      invalidateTags: async () => {},
    } as any;
    const mockNotification = {
      publishAssignmentChanged: async () => {},
    } as any;
    const mockFindById = async () => null;

    const service = new AppointmentAssignmentService(
      mockDb,
      mockRedis,
      mockNotification,
      mockFindById,
    );

    expect(
      service.changeDoctor('apt-1', 'doc-target', {
        id: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toThrow();
  });

  it('should successfully reassign doctor when no collision exists', async () => {
    let updatedAptPayload: any = null;

    const mockDb = {
      transaction: async (cb: any) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => ({
                for: async () => [
                  {
                    id: 'apt-1',
                    practitionerId: 'doc-old',
                    scheduleSessionId: 'sess-old',
                    status: 'booked',
                    scheduledDate: '2026-10-06',
                    scheduledStartTime: '08:30:00',
                    scheduledEndTime: '09:00:00',
                    roomId: 'room-1',
                  },
                ],
              }),
            }),
          }),
          query: {
            practitioners: {
              findFirst: async () => ({
                id: 'doc-target',
                displayName: 'Dr. Target',
                isAcceptingAppointments: true,
                defaultRoomId: 'room-2',
              }),
            },
            appointments: {
              findFirst: async () => null, // No conflict
            },
            practitionerScheduleSessions: {
              findFirst: async () => ({
                id: 'sess-target',
                practitionerId: 'doc-target',
                roomId: 'room-2',
              }),
            },
          },
          update: () => ({
            set: (payload: any) => ({
              where: async () => {
                updatedAptPayload = payload;
              },
            }),
          }),
          insert: () => ({
            values: (val: any) =>
              Object.assign(Promise.resolve([val]), {
                returning: async () => [val],
              }),
          }),
        };
        return cb(tx);
      },
    } as any;

    const mockRedis = {
      deleteByPrefix: async () => {},
      invalidateTags: async () => {},
    } as any;
    const mockNotification = {
      publishAssignmentChanged: async () => {},
    } as any;
    const mockFindById = async (id: string) =>
      ({
        id,
        practitionerId: 'doc-target',
        roomId: 'room-2',
      }) as any;

    const service = new AppointmentAssignmentService(
      mockDb,
      mockRedis,
      mockNotification,
      mockFindById,
    );

    const result = await service.changeDoctor('apt-1', 'doc-target', {
      id: 'admin-1',
      role: 'ADMIN',
    });

    expect(result.practitionerId).toBe('doc-target');
    expect(updatedAptPayload.practitionerId).toBe('doc-target');
    expect(updatedAptPayload.scheduleSessionId).toBe('sess-target');
  });

  it('should successfully change room when room is available', async () => {
    let updatedRoomPayload: any = null;

    const mockDb = {
      transaction: async (cb: any) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => ({
                for: async () => [
                  {
                    id: 'apt-1',
                    practitionerId: 'doc-1',
                    roomId: 'room-old',
                    status: 'booked',
                    scheduledDate: '2026-10-06',
                    scheduledStartTime: '08:30:00',
                  },
                ],
              }),
            }),
          }),
          query: {
            appointments: {
              findFirst: async () => null, // No room conflict
            },
          },
          update: () => ({
            set: (payload: any) => ({
              where: async () => {
                updatedRoomPayload = payload;
              },
            }),
          }),
          insert: () => ({
            values: () => Promise.resolve([]),
          }),
        };
        return cb(tx);
      },
    } as any;

    const mockRedis = {
      deleteByPrefix: async () => {},
      invalidateTags: async () => {},
    } as any;
    const mockNotification = {
      publishAssignmentChanged: async () => {},
    } as any;
    const mockFindById = async (id: string) =>
      ({
        id,
        roomId: 'room-target',
      }) as any;

    const service = new AppointmentAssignmentService(
      mockDb,
      mockRedis,
      mockNotification,
      mockFindById,
    );

    const result = await service.changeRoom('apt-1', 'room-target', {
      id: 'admin-1',
      role: 'ADMIN',
    });

    expect(result.roomId).toBe('room-target');
    expect(updatedRoomPayload.roomId).toBe('room-target');
  });

  it('should close old doctor schedule session when closeOldSchedule is requested (Edge Case 5/6)', async () => {
    let updatedOldSessionPayload: any = null;
    let insertedAuditReason = '';

    const mockDb = {
      transaction: async (cb: any) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => ({
                for: async () => [
                  {
                    id: 'apt-1',
                    practitionerId: 'doc-old',
                    scheduleSessionId: 'sess-old',
                    status: 'booked',
                    scheduledDate: '2026-10-06',
                    scheduledStartTime: '08:30:00',
                    scheduledEndTime: '09:00:00',
                    roomId: 'room-1',
                  },
                ],
              }),
            }),
          }),
          query: {
            practitioners: {
              findFirst: async () => ({
                id: 'doc-target',
                displayName: 'Dr. Target',
                isAcceptingAppointments: true,
                defaultRoomId: 'room-2',
              }),
            },
            appointments: {
              findFirst: async () => null,
            },
            practitionerScheduleSessions: {
              findFirst: async () => ({
                id: 'sess-target',
                practitionerId: 'doc-target',
                roomId: 'room-2',
              }),
            },
          },
          update: () => ({
            set: (payload: any) => ({
              where: async () => {
                if (payload.status === 'closed') {
                  updatedOldSessionPayload = payload;
                }
              },
            }),
          }),
          insert: () => ({
            values: (val: any) => {
              if (val.reason) insertedAuditReason = val.reason;
              return Object.assign(Promise.resolve([val]), {
                returning: async () => [val],
              });
            },
          }),
        };
        return cb(tx);
      },
    } as any;

    const mockRedis = {
      deleteByPrefix: async () => {},
      invalidateTags: async () => {},
    } as any;
    const mockNotification = {
      publishAssignmentChanged: async () => {},
    } as any;
    const mockFindById = async (id: string) =>
      ({
        id,
        practitionerId: 'doc-target',
        roomId: 'room-2',
      }) as any;

    const service = new AppointmentAssignmentService(
      mockDb,
      mockRedis,
      mockNotification,
      mockFindById,
    );

    await service.changeDoctor(
      'apt-1',
      'doc-target',
      { closeOldSchedule: true, reason: 'Dokter berhalangan hadir mendadak' },
      { id: 'admin-1', role: 'ADMIN' },
    );

    expect(updatedOldSessionPayload).not.toBeNull();
    expect(updatedOldSessionPayload.status).toBe('closed');
    expect(updatedOldSessionPayload.availableSlots).toBe(0);
    expect(insertedAuditReason).toContain('Sesi dokter sebelumnya ditutup');
  });
});
