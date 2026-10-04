import { describe, expect, it } from 'bun:test';
import {
  type AdminDoctorDailySession,
  ScheduleOperationalStatus,
} from '../entities/schedule.entity';
import {
  computeUpcomingSchedule,
  formatIndoDate,
  formatIndoMonthYear,
  getNextDate,
} from './schedule-date.formatter';

function makeSession(
  nama_sesi: string,
  jam_mulai: string,
  jam_selesai: string,
  status_sesi = ScheduleOperationalStatus.OPEN,
): AdminDoctorDailySession {
  return {
    nama_sesi,
    jam_mulai,
    jam_selesai,
    waktu: `${jam_mulai} - ${jam_selesai}`,
    kuota_pasien: 10,
    slot_tersedia: 5,
    pasien_terdaftar: 5,
    display_slot: '5 / 10',
    status_sesi,
    ruang: 'Ruang 1',
    is_reschedule_eligible: true,
    reschedule_ineligibility_reason: null,
  };
}

describe('schedule-date.formatter', () => {
  const today = '2026-10-04';

  it('formats indonesian dates correctly', () => {
    expect(formatIndoDate('2026-10-04')).toBe('Minggu, 4 Okt 2026');
    expect(formatIndoMonthYear(2026, 10)).toBe('Oktober 2026');
    expect(getNextDate('2026-10-04')).toBe('2026-10-05');
  });

  it('returns Cuti Dokter when isCuti is true', () => {
    const result = computeUpcomingSchedule(
      today,
      today,
      [makeSession('Siang', '12:00', '18:00')],
      true,
      30,
    );
    expect(result).toBe('Cuti Dokter');
  });

  it('returns Tidak Ada Jadwal when sesiHarian is empty', () => {
    const result = computeUpcomingSchedule(today, today, [], false, 30);
    expect(result).toBe('Tidak Ada Jadwal');
  });

  it('returns Praktik Ditutup when all sessions are closed', () => {
    const closed = makeSession(
      'Siang',
      '12:00',
      '18:00',
      ScheduleOperationalStatus.CLOSED,
    );
    const result = computeUpcomingSchedule(today, today, [closed], false, 30);
    expect(result).toBe('Praktik Ditutup');
  });

  it('returns next slot within active session when currently in session', () => {
    const sessions = [makeSession('Siang', '12:00', '18:00')];
    const at1445 = new Date('2026-10-04T14:45:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      30,
      null,
      at1445,
    );
    expect(result).toBe('Siang (15:00 - 15:30)');
  });

  it('computes next slot with custom policy duration without hardcoded values', () => {
    const sessions = [makeSession('Pagi', '08:00', '12:00')];
    const at0835 = new Date('2026-10-04T08:35:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      20,
      null,
      at0835,
    );
    expect(result).toBe('Pagi (08:40 - 09:00)');
  });

  it('returns next session when active session is on its last slot', () => {
    const sessions = [
      makeSession('Siang', '12:00', '18:00'),
      makeSession('Malam', '18:30', '21:00'),
    ];
    const at1745 = new Date('2026-10-04T17:45:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      30,
      null,
      at1745,
    );
    expect(result).toBe('Malam (18:30 - 19:00)');
  });

  it('returns tomorrow schedule when active session is on its last slot and no next session today', () => {
    const sessions = [makeSession('Siang', '12:00', '18:00')];
    const tomorrowSessions = [makeSession('Pagi', '08:00', '12:00')];
    const at1745 = new Date('2026-10-04T17:45:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      30,
      tomorrowSessions,
      at1745,
    );
    expect(result).toBe('Besok, Pagi (08:00 - 08:30)');
  });

  it('returns Selesai when active session is on its last slot and tomorrow has no schedule', () => {
    const sessions = [makeSession('Siang', '12:00', '18:00')];
    const at1745 = new Date('2026-10-04T17:45:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      30,
      null,
      at1745,
    );
    expect(result).toBe('Selesai');
  });

  it('returns first slot of first session before practice starts today', () => {
    const sessions = [makeSession('Pagi', '08:00', '12:00')];
    const at0715 = new Date('2026-10-04T07:15:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      30,
      null,
      at0715,
    );
    expect(result).toBe('Pagi (08:00 - 08:30)');
  });

  it('returns next session when between two sessions today', () => {
    const sessions = [
      makeSession('Pagi', '08:00', '11:00'),
      makeSession('Siang', '13:00', '16:00'),
    ];
    const at1130 = new Date('2026-10-04T11:30:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      30,
      null,
      at1130,
    );
    expect(result).toBe('Siang (13:00 - 13:30)');
  });

  it('returns tomorrow when after all sessions today', () => {
    const sessions = [makeSession('Pagi', '08:00', '11:00')];
    const tomorrowSessions = [makeSession('Pagi', '08:00', '11:00')];
    const at1200 = new Date('2026-10-04T12:00:00+07:00');
    const result = computeUpcomingSchedule(
      today,
      today,
      sessions,
      false,
      30,
      tomorrowSessions,
      at1200,
    );
    expect(result).toBe('Besok, Pagi (08:00 - 08:30)');
  });

  it('returns Selesai for past target dates', () => {
    const sessions = [makeSession('Pagi', '08:00', '12:00')];
    const result = computeUpcomingSchedule(
      '2026-10-01',
      today,
      sessions,
      false,
      30,
    );
    expect(result).toBe('Selesai');
  });

  it('returns first slot for future target dates', () => {
    const sessions = [makeSession('Pagi', '08:00', '12:00')];
    const result = computeUpcomingSchedule(
      '2026-10-10',
      today,
      sessions,
      false,
      30,
    );
    expect(result).toBe('Pagi (08:00 - 08:30)');
  });
});
