import { describe, expect, it } from 'bun:test';
import { getClinicNow } from '../../../schedules/domain/services/schedule-date.formatter';
import { allocateSlotTiming } from './appointment-slot.helper';

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
    expect(startMinutes + 30).toBeGreaterThan(nowMinutes);
  });

  it('should allocate current active slot when booking during the last slot of an active session', () => {
    const clinicNow = getClinicNow();
    const nowMinutes = clinicNow.currentMinutes;
    // Session that ends 15 minutes from now (so current time is in the middle of the last 30-min slot)
    const sessionEndMin = nowMinutes + 15;
    const sessionStartMin = sessionEndMin - 60;
    const startH = Math.floor(sessionStartMin / 60);
    const startM = sessionStartMin % 60;
    const endH = Math.floor(sessionEndMin / 60);
    const endM = sessionEndMin % 60;

    const sessionStart = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const sessionEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const result = allocateSlotTiming(
      sessionStart,
      sessionEnd,
      [],
      30,
      clinicNow.date,
    );

    expect(result).not.toBeNull();
    const [eh, em] = result!.endTime.split(':').map(Number);
    const endMinutes = eh * 60 + em;
    expect(endMinutes).toBeGreaterThan(nowMinutes);
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
    const result = allocateSlotTiming('18:00', '24:00', [], 30, '2099-12-31');
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('18:00:00');
    expect(result!.endTime).toBe('18:30:00');
  });

  it('should return null when date is in the past', () => {
    const result = allocateSlotTiming('18:00', '24:00', [], 30, '2026-09-01');
    expect(result).toBeNull();
  });

  it('should allocate midnight end time as 24:00:00 for slot ending at 24:00', () => {
    const existingUntil2330: string[] = [];
    let curMinutes = 18 * 60;
    while (curMinutes < 23 * 60 + 30) {
      const hh = String(Math.floor(curMinutes / 60)).padStart(2, '0');
      const mm = String(curMinutes % 60).padStart(2, '0');
      existingUntil2330.push(`${hh}:${mm}:00`);
      curMinutes += 30;
    }
    const result = allocateSlotTiming(
      '18:00',
      '24:00',
      existingUntil2330,
      30,
      '2099-12-31',
    );
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe('23:30:00');
    expect(result!.endTime).toBe('24:00:00');
  });
});
