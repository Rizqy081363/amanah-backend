import { describe, expect, it } from 'bun:test';
import { AppointmentRecordMapper } from './appointment-record.mapper';

describe('AppointmentRecordMapper - Polyclinic Resolution and Durations', () => {
  it('resolves polyclinic when poliklinikOverride object is provided', () => {
    const raw = {
      id: 'apt-1',
      patientId: 'patient-1',
      serviceId: 'service-1',
      status: 'booked',
      scheduledDate: '2026-10-10',
      scheduledStartTime: '08:00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clinicRoom: null,
      clinicService: {
        id: 'service-1',
        name: 'Pengobatan Keluhan Ringan',
      },
    };

    const entity = AppointmentRecordMapper.toEntity(raw, null, {
      poliklinikId: 'unit-1',
      poliklinikName: 'Poli Umum',
    });
    expect(entity.poliklinikId).toBe('unit-1');
    expect(entity.poliklinikName).toBe('Poli Umum');
    expect(entity.layananName).toBe('Pengobatan Keluhan Ringan');
  });

  it('resolves room clinicUnit name when room is assigned', () => {
    const raw = {
      id: 'apt-2',
      patientId: 'patient-2',
      serviceId: 'service-2',
      status: 'waiting',
      scheduledDate: '2026-10-10',
      scheduledStartTime: '10:00',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clinicRoom: {
        id: 'room-1',
        name: 'Ruang KIA 1',
        clinicUnit: { id: 'unit-2', name: 'Poli KIA' },
      },
      clinicService: {
        id: 'service-2',
        name: 'Pemeriksaan Kehamilan & ANC',
      },
    };

    const entity = AppointmentRecordMapper.toEntity(raw);
    expect(entity.poliklinikId).toBe('unit-2');
    expect(entity.poliklinikName).toBe('Poli KIA');
    expect(entity.layananName).toBe('Pemeriksaan Kehamilan & ANC');
  });

  it('formats consultation duration when started and completed', () => {
    const raw = {
      id: 'apt-3',
      patientId: 'patient-3',
      serviceId: 'service-1',
      status: 'completed',
      scheduledDate: '2026-10-10',
      scheduledStartTime: '10:00',
      actualStartedAt: '2026-10-10T10:00:00.000Z',
      actualCompletedAt: '2026-10-10T10:15:30.000Z',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      clinicService: { name: 'Pengobatan Keluhan Ringan' },
    };

    const entity = AppointmentRecordMapper.toEntity(raw);
    expect(entity.actualStartedAt).toEqual(
      new Date('2026-10-10T10:00:00.000Z'),
    );
    expect(entity.actualCompletedAt).toEqual(
      new Date('2026-10-10T10:15:30.000Z'),
    );
    expect(entity.consultationDurationFormatted).toBe('15 Menit 30 Dtk');
  });
});
