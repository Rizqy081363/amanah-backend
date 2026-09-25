import { ScheduleDrizzleRepository } from '@modules/schedules/infrastructure/drizzle/schedule.drizzle-repository';
import { createMockDb } from '@modules/schedules/infrastructure/drizzle/testing/schedule-test-mock';

describe('ScheduleDrizzleRepository - Form Bootstrap & Slot Availability', () => {
  const doctorId = '3cb62e10-450b-43e5-aba9-49ec37079ebb';
  const otherDoctorId = '4db73e20-561c-54e6-bca0-50fd48080fcc';
  const roomId1 = 'b77d141b-2fa5-4481-9f47-a5a040faf57a';
  const roomId2 = '590be133-107b-476e-bab3-a3ccd2d875dd';
  const poliId1 = 'a11d141b-1fa5-4481-9f47-a5a040faf11a';

  describe('getFormBootstrap (1 Roundtrip)', () => {
    it('returns consolidated form initialization context with room occupancy and 4 shifts', async () => {
      const db = createMockDb();

      // Doctor profile
      db.query.practitioners.findFirst.mockResolvedValue({
        id: doctorId,
        displayName: 'dr. Fadhiilah Ahmad Zikri, Sp.A',
        defaultRoomId: roomId1,
        consultationDurationMinutes: 30,
        staffProfile: {
          fullName: 'dr. Fadhiilah Ahmad Zikri, Sp.A',
        },
      });

      // Rooms
      db.query.clinicRooms.findMany.mockResolvedValue([
        {
          id: roomId1,
          name: 'Ruang Poli Umum 1',
          code: 'RPU-01',
          floor: 1,
          isActive: true,
          clinicUnit: { id: poliId1, name: 'Poli Umum' },
        },
        {
          id: roomId2,
          name: 'Ruang KIA 1',
          code: 'KIA-01',
          floor: 1,
          isActive: true,
          clinicUnit: { id: poliId1, name: 'Poli Umum' },
        },
      ]);

      // Polikliniks
      db.query.clinicUnits.findMany.mockResolvedValue([
        {
          id: poliId1,
          name: 'Poli Umum',
          code: 'POLI-UMUM',
          isActive: true,
        },
      ]);

      // Day sessions: Doctor B is occupying room 1
      db.query.practitionerScheduleSessions.findMany.mockResolvedValue([
        {
          id: 'session-other-1',
          practitionerId: otherDoctorId,
          scheduleDate: '2026-10-15',
          startTime: '08:00:00',
          endTime: '12:00:00',
          roomId: roomId1,
          status: 'open',
          sessionShift: 'morning',
          practitioner: {
            displayName: 'dr. Ahmad Santoso',
            staffProfile: { fullName: 'dr. Ahmad Santoso' },
          },
          clinicRoom: { id: roomId1, name: 'Ruang Poli Umum 1' },
        },
        {
          id: 'session-self-1',
          practitionerId: doctorId,
          scheduleDate: '2026-10-15',
          startTime: '13:00:00',
          endTime: '17:00:00',
          roomId: roomId2,
          status: 'open',
          sessionShift: 'afternoon',
          capacity: 8,
          availableSlots: 6,
          notes: 'Praktek sore',
          practitioner: {
            displayName: 'dr. Fadhiilah Ahmad Zikri, Sp.A',
            staffProfile: { fullName: 'dr. Fadhiilah Ahmad Zikri, Sp.A' },
          },
          clinicRoom: { id: roomId2, name: 'Ruang KIA 1' },
        },
      ]);

      const repo = new ScheduleDrizzleRepository(db as never);
      const res = await repo.getFormBootstrap(doctorId, {
        date: '2026-10-15',
      });

      // Doctor
      expect(res.doctor.id).toBe(doctorId);
      expect(res.doctor.name).toBe('dr. Fadhiilah Ahmad Zikri, Sp.A');
      expect(res.doctor.defaultRoomId).toBe(roomId1);
      expect(res.doctor.defaultRoomName).toBe('Ruang Poli Umum 1');
      expect(res.doctor.defaultPoliklinikId).toBe(poliId1);
      expect(res.doctor.defaultPoliklinikName).toBe('Poli Umum');
      expect(res.doctor.consultationDurationMinutes).toBe(30);

      // Rooms
      expect(res.rooms).toHaveLength(2);
      expect(res.rooms[0].id).toBe(roomId1);
      expect(res.rooms[0].isOccupied).toBe(true);
      expect(res.rooms[0].occupiedBy).toBe('dr. Ahmad Santoso');

      expect(res.rooms[1].id).toBe(roomId2);
      expect(res.rooms[1].isOccupied).toBe(true);
      expect(res.rooms[1].occupiedBy).toBe('dr. Fadhiilah Ahmad Zikri, Sp.A');

      // Polikliniks
      expect(res.polikliniks).toHaveLength(1);
      expect(res.polikliniks[0].name).toBe('Poli Umum');

      // Shifts
      expect(res.shifts).toHaveLength(4);
      expect(res.shifts.map((s) => s.code)).toEqual([
        'early_morning',
        'morning',
        'afternoon',
        'night',
      ]);

      // Afternoon shift should have existing schedule for this doctor
      const afternoonShift = res.shifts.find((s) => s.code === 'afternoon');
      expect(afternoonShift?.existingSchedule).not.toBeNull();
      expect(afternoonShift?.existingSchedule?.id).toBe('session-self-1');
      expect(afternoonShift?.existingSchedule?.startTime).toBe('13:00');
      expect(afternoonShift?.existingSchedule?.endTime).toBe('17:00');
    });
  });

  describe('getSlotAvailability (SSOT Anti-Collision Grid)', () => {
    it('evaluates temporal past, room occupancy by other doctor, and self doctor overlap', async () => {
      const db = createMockDb();

      db.query.practitioners.findFirst.mockResolvedValue({
        id: doctorId,
        displayName: 'dr. Fadhiilah Ahmad Zikri, Sp.A',
        consultationDurationMinutes: 30,
        staffProfile: { fullName: 'dr. Fadhiilah Ahmad Zikri, Sp.A' },
      });

      db.query.clinicRooms.findFirst.mockResolvedValue({
        id: roomId1,
        name: 'Ruang Poli Umum 1',
      });

      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
      db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);

      // Sesi malam (18:00 - 24:00):
      // 1. Doctor B (other) in room 1 from 21:00 to 23:00
      // 2. Doctor A (self) in room 2 from 18:30 to 19:30
      db.query.practitionerScheduleSessions.findMany.mockResolvedValue([
        {
          id: 'session-other-night',
          practitionerId: otherDoctorId,
          scheduleDate: '2026-10-20', // future date so not PAST
          startTime: '21:00:00',
          endTime: '23:00:00',
          roomId: roomId1,
          status: 'open',
          sessionShift: 'night',
          practitioner: {
            displayName: 'dr. Ahmad Santoso',
            staffProfile: { fullName: 'dr. Ahmad Santoso' },
          },
          clinicRoom: { id: roomId1, name: 'Ruang Poli Umum 1' },
        },
        {
          id: 'session-self-night',
          practitionerId: doctorId,
          scheduleDate: '2026-10-20',
          startTime: '18:30:00',
          endTime: '19:30:00',
          roomId: roomId2,
          status: 'open',
          sessionShift: 'night',
          practitioner: {
            displayName: 'dr. Fadhiilah Ahmad Zikri, Sp.A',
            staffProfile: { fullName: 'dr. Fadhiilah Ahmad Zikri, Sp.A' },
          },
          clinicRoom: { id: roomId2, name: 'Ruang KIA 1' },
        },
      ]);

      const repo = new ScheduleDrizzleRepository(db as never);
      const res = await repo.getSlotAvailability(doctorId, {
        date: '2026-10-20',
        shift: 'night',
        roomId: roomId1,
      });

      expect(res.shift).toBe('night');
      expect(res.boundary.startTime).toBe('18:00');
      expect(res.boundary.endTime).toBe('24:00');
      expect(res.intervalMinutes).toBe(30);
      expect(res.slots).toHaveLength(12);

      // Slot 0: 18:00 - 18:30 -> Available
      expect(res.slots[0].time).toBe('18:00');
      expect(res.slots[0].isAvailable).toBe(true);
      expect(res.slots[0].status).toBe('AVAILABLE');
      expect(res.slots[0].displayLabel).toBe('Tersedia');

      // Slot 1: 18:30 - 19:00 -> Overlap with self in Room 2
      expect(res.slots[1].time).toBe('18:30');
      expect(res.slots[1].isAvailable).toBe(false);
      expect(res.slots[1].status).toBe('OCCUPIED_BY_SELF');
      expect(res.slots[1].displayLabel).toBe('Jadwal Anda');
      expect(res.slots[1].conflict?.type).toBe('PRACTITIONER_OVERLAP');

      // Slot 2: 19:00 - 19:30 -> Overlap with self in Room 2
      expect(res.slots[2].time).toBe('19:00');
      expect(res.slots[2].isAvailable).toBe(false);
      expect(res.slots[2].status).toBe('OCCUPIED_BY_SELF');

      // Slot 3: 19:30 - 20:00 -> Available
      expect(res.slots[3].time).toBe('19:30');
      expect(res.slots[3].isAvailable).toBe(true);

      // Slot 6: 21:00 - 21:30 -> Occupied by other (dr. Ahmad Santoso) in room 1
      expect(res.slots[6].time).toBe('21:00');
      expect(res.slots[6].isAvailable).toBe(false);
      expect(res.slots[6].status).toBe('OCCUPIED_BY_OTHER');
      expect(res.slots[6].displayLabel).toBe('dr. Ahmad Santoso');
      expect(res.slots[6].conflict?.type).toBe('ROOM_OCCUPIED');
      expect(res.slots[6].conflict?.occupantName).toBe('dr. Ahmad Santoso');

      // Slot 7: 21:30 - 22:00 -> Occupied by other (dr. Ahmad Santoso)
      expect(res.slots[7].time).toBe('21:30');
      expect(res.slots[7].isAvailable).toBe(false);
      expect(res.slots[7].status).toBe('OCCUPIED_BY_OTHER');

      // Slot 10: 23:00 - 23:30 -> Available
      expect(res.slots[10].time).toBe('23:00');
      expect(res.slots[10].isAvailable).toBe(true);
    });

    it('marks all slots as PAST when date is in the past', async () => {
      const db = createMockDb();

      db.query.practitioners.findFirst.mockResolvedValue({
        id: doctorId,
        displayName: 'dr. Fadhiilah Ahmad Zikri, Sp.A',
        consultationDurationMinutes: 30,
      });

      db.query.clinicRooms.findFirst.mockResolvedValue({
        id: roomId1,
        name: 'Ruang Poli Umum 1',
      });

      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue(null);
      db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
      db.query.practitionerScheduleSessions.findMany.mockResolvedValue([]);

      const repo = new ScheduleDrizzleRepository(db as never);
      const res = await repo.getSlotAvailability(doctorId, {
        date: '2020-01-01',
        shift: 'morning',
        roomId: roomId1,
      });

      expect(res.slots).toHaveLength(12);
      expect(res.slots.every((s) => s.status === 'PAST')).toBe(true);
      expect(res.slots.every((s) => !s.isAvailable)).toBe(true);
      expect(res.slots[0].displayLabel).toBe('Sudah Selesai');
      expect(res.summary.availableSlots).toBe(0);
      expect(res.summary.occupiedSlots).toBe(12);
    });

    it('marks all slots as CLOSED_LEAVE when doctor is on leave', async () => {
      const db = createMockDb();

      db.query.practitioners.findFirst.mockResolvedValue({
        id: doctorId,
        displayName: 'dr. Fadhiilah Ahmad Zikri, Sp.A',
        consultationDurationMinutes: 30,
      });

      db.query.clinicRooms.findFirst.mockResolvedValue({
        id: roomId1,
        name: 'Ruang Poli Umum 1',
      });

      db.query.practitionerScheduleDaySettings.findFirst.mockResolvedValue({
        isLeave: true,
        leaveReason: 'Cuti Tahunan',
      });
      db.query.practitionerLeavePeriods.findFirst.mockResolvedValue(null);
      db.query.practitionerScheduleSessions.findMany.mockResolvedValue([]);

      const repo = new ScheduleDrizzleRepository(db as never);
      const res = await repo.getSlotAvailability(doctorId, {
        date: '2026-11-10', // future date
        shift: 'morning',
        roomId: roomId1,
      });

      expect(res.slots.every((s) => s.status === 'CLOSED_LEAVE')).toBe(true);
      expect(res.slots.every((s) => !s.isAvailable)).toBe(true);
      expect(res.slots[0].displayLabel).toBe('Cuti');
      expect(res.slots[0].conflict?.type).toBe('LEAVE');
      expect(res.slots[0].conflict?.reason).toBe('Cuti Tahunan');
    });
  });
});
