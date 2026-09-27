import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import { PatientScheduleBookingController } from './patient-schedule-booking.controller';

describe('PatientScheduleBookingController', () => {
  let controller: PatientScheduleBookingController;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: {
        clinicSchedulePolicies: {
          findFirst: mock().mockResolvedValue({
            code: 'default',
            defaultConsultationDurationMinutes: 30,
          }),
        },
        clinicUnits: {
          findFirst: mock().mockResolvedValue({
            id: 'unit-1',
            name: 'Poli Umum',
          }),
        },
        practitionerScheduleSessions: {
          findMany: mock().mockResolvedValue([
            {
              id: 'sess-pagi-1',
              scheduleDate: '2026-09-28',
              sessionLabel: 'Shift Pagi (08:00 - 12:00)',
              sessionShift: 'morning',
              startTime: '08:00:00',
              endTime: '12:00:00',
              capacity: 8,
              availableSlots: 5,
              status: 'open',
              practitionerId: 'prac-1',
              practitioner: {
                displayName: 'dr. Andi',
                staffProfileId: 'staff-1',
                staffProfile: { avatarUrl: 'http://img.test/andi.jpg' },
                medicalSpecialty: { name: 'Dokter Umum' },
              },
              clinicRoom: { name: 'Ruang Poli 1' },
            },
          ]),
        },
      },
    };

    controller = new PatientScheduleBookingController(mockDb);
  });

  it('should throw BadRequestException if date format is invalid', async () => {
    expect(controller.getBookingOptions('28-09-2026')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should return 4 standard sessions with correct availability and isDisabled flags', async () => {
    const res = await controller.getBookingOptions('2026-09-28', 'unit-1');
    expect(res.success).toBe(true);
    expect(res.data.date).toBe('2026-09-28');
    expect(res.data.dayName).toBe('Senin');
    expect(res.data.estimatedDurationMinutes).toBe(30);
    expect(res.data.sessions).toHaveLength(4);

    // Pagi has active session
    const pagi = res.data.sessions.find((s) => s.session === 'PAGI');
    expect(pagi).toBeDefined();
    expect(pagi?.isDisabled).toBe(false);
    expect(pagi?.availableSlots).toBe(5);
    expect(pagi?.capacity).toBe(8);
    expect(pagi?.bookedSlots).toBe(3);
    expect(pagi?.practitioners).toHaveLength(1);
    expect(pagi?.practitioners[0].name).toBe('dr. Andi');

    // Siang has no sessions -> isDisabled: true
    const siang = res.data.sessions.find((s) => s.session === 'SIANG');
    expect(siang).toBeDefined();
    expect(siang?.isDisabled).toBe(true);
    expect(siang?.availableSlots).toBe(0);
    expect(siang?.disabledReason).toBe(
      'Dokter tidak ada jadwal praktik pada sesi ini',
    );
  });

  it('should mark session as disabled if availableSlots is 0', async () => {
    mockDb.query.practitionerScheduleSessions.findMany.mockResolvedValueOnce([
      {
        id: 'sess-pagi-full',
        scheduleDate: '2026-09-28',
        sessionLabel: 'Shift Pagi (08:00 - 12:00)',
        sessionShift: 'morning',
        startTime: '08:00:00',
        endTime: '12:00:00',
        capacity: 8,
        availableSlots: 0,
        status: 'open',
        practitionerId: 'prac-1',
        practitioner: {
          displayName: 'dr. Andi',
          staffProfileId: 'staff-1',
          staffProfile: { avatarUrl: null },
          medicalSpecialty: { name: 'Dokter Umum' },
        },
        clinicRoom: { name: 'Ruang Poli 1' },
      },
    ]);

    const res = await controller.getBookingOptions('2026-09-28');
    const pagi = res.data.sessions.find((s) => s.session === 'PAGI');
    expect(pagi?.isDisabled).toBe(true);
    expect(pagi?.disabledReason).toBe(
      'Kuota antrean pada sesi ini sudah penuh',
    );
  });
});
