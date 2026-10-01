import { describe, expect, it } from 'bun:test';
import { allocateSlotTiming } from './appointment-slot.helper';
import { getClinicNow } from '../../../schedules/domain/services/schedule-date.formatter';

describe('allocateSlotTiming', () => {
  it('should skip elapsed slots when appointmentDate is today and current time is in the middle of session', () => {
    const clinicNow = getClinicNow();
    const nowMinutes = clinicNow.currentMinutes;
    const startH = Math.max(0, Math.floor((nowMinutes - 30) / 60));
    const startM = (nowMinutes - 30) % 60;
    const sessionStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const sessionEnd = '24:00';

    const result = allocateSlotTiming(
      sessionStart,
      sessionEnd,
      [],
      30,
      clinicNow.date,
    );

    expect(result).not.toBeNull();
    const [h, m] = result!.startTime.split(':').map(Number);
    const startMinutes = h * 60 + m;
    expect(startMinutes).toBeGreaterThan(nowMinutes);
  });

  it('should skip occupied future slots and pick next available slot', () => {
    const clinicNow = getClinicNow();
    const resultFirst = allocateSlotTiming(
      '18:00',
      '24:00',
      [],
      30,
      clinicNow.date,
    );
    expect(resultFirst).not.toBeNull();
    const firstAvailable = resultFirst!.startTime;

    const resultSecond = allocateSlotTiming(
      '18:00',
      '24:00',
      [firstAvailable],
      30,
      clinicNow.date,
    );
    expect(resultSecond).not.toBeNull();
    expect(resultSecond!.startTime).not.toBe(firstAvailable);

    const [h1, m1] = firstAvailable.split(':').map(Number);
    const [h2, m2] = resultSecond!.startTime.split(':').map(Number);
    expect(h2 * 60 + m2).toBe(h1 * 60 + m1 + 30);
  });

  it('should allocate from session start for future dates', () => {
    const result = allocateSlotTiming(
      '18:00',
      '24:00',
      [],
      30,
      '2026-10-05',
    );
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('18:00:00');
    expect(result!.endTime).toBe('18:30:00');
  });

  it('should return null when date is in the past', () => {
    const result = allocateSlotTiming(
      '18:00',
      '24:00',
      [],
      30,
      '2026-09-01',
    );
    expect(result).toBeNull();
  });
});
