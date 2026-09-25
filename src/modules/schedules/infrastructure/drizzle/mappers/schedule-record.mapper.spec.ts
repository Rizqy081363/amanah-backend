import { generateEntityVersion } from '@common/occ';
import { ScheduleOperationalStatus } from '@modules/schedules/domain/entities/schedule.entity';
import { mapScheduleRecordToEntity } from './schedule-record.mapper';

describe('mapScheduleRecordToEntity', () => {
  it('maps a schedule persistence record into the current schedule entity contract', () => {
    const updatedAt = '2026-09-24T08:30:00.000Z';

    const entity = mapScheduleRecordToEntity({
      id: 'session-1',
      practitionerId: 'practitioner-1',
      scheduleDate: '2026-09-24',
      sessionLabel: null,
      sessionShift: 'afternoon',
      startTime: '14:00:00',
      endTime: '14:30:00',
      roomId: 'room-1',
      serviceId: 'service-1',
      capacity: 2,
      availableSlots: 1,
      status: 'open',
      notes: null,
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt,
      practitioner: {
        id: 'practitioner-1',
        displayName: 'dr. Fallback',
        staffProfileId: 'staff-1',
        staffProfile: {
          fullName: 'dr. Amanah',
          positionTitle: 'Dokter Spesialis',
          primaryUnitId: 'unit-from-profile',
          clinicUnit: {
            name: 'Poli Profil',
          },
        },
      },
      clinicRoom: {
        name: 'Ruang A',
        unitId: 'unit-from-room',
        clinicUnit: {
          name: 'Poli Umum',
        },
      },
      clinicService: {
        name: 'Konsultasi',
      },
    });

    expect(entity).toMatchObject({
      id: 'session-1',
      staffId: 'staff-1',
      staffName: 'dr. Amanah',
      profession: 'Dokter Spesialis',
      scheduleDate: '2026-09-24',
      specificDate: '2026-09-24',
      poliklinikId: 'unit-from-room',
      poliklinikName: 'Poli Umum',
      serviceId: 'service-1',
      serviceName: 'Konsultasi',
      session: 'SIANG',
      sessionLabel: 'Siang',
      sessionShift: 'afternoon',
      startTime: '14:00',
      endTime: '14:30',
      timeRange: '14:00 - 14:30 WIB',
      roomId: 'room-1',
      roomName: 'Ruang A',
      capacity: 2,
      availableSlots: 1,
      bookedPatientCount: 1,
      status: ScheduleOperationalStatus.OPEN,
      rawStatus: 'open',
      isAvailable: true,
      doctorId: 'practitioner-1',
      practitionerId: 'practitioner-1',
      isRescheduleEligible: true,
      is_reschedule_eligible: true,
      version: generateEntityVersion(updatedAt),
    });
    expect(entity.createdAt).toEqual(new Date('2026-09-24T08:00:00.000Z'));
    expect(entity.updatedAt).toEqual(new Date(updatedAt));
  });

  it('preserves closed-session reschedule ineligibility fields', () => {
    const entity = mapScheduleRecordToEntity({
      id: 'session-closed',
      practitionerId: 'practitioner-1',
      scheduleDate: '2026-09-24',
      sessionLabel: null,
      sessionShift: 'morning',
      startTime: '08:00:00',
      endTime: '08:30:00',
      roomId: null,
      serviceId: null,
      capacity: 1,
      availableSlots: 1,
      status: 'closed',
      notes: null,
      createdAt: '2026-09-24T08:00:00.000Z',
      updatedAt: '2026-09-24T08:30:00.000Z',
      practitioner: null,
      clinicRoom: null,
      clinicService: null,
    });

    expect(entity.status).toBe(ScheduleOperationalStatus.CLOSED);
    expect(entity.isAvailable).toBe(false);
    expect(entity.isRescheduleEligible).toBe(false);
    expect(entity.rescheduleIneligibilityReason).toBe(
      'Sesi ini berstatus Tutup. Silakan aktifkan sesi terlebih dahulu melalui menu Ubah Sesi sebelum melakukan reschedule.',
    );
    expect(entity.reschedule_ineligibility_reason).toBe(
      entity.rescheduleIneligibilityReason,
    );
  });
});
