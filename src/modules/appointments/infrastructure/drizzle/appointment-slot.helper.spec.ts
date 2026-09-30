import { describe, expect, it } from 'bun:test';
import { allocateSlotTiming } from './appointment-slot.helper';

describe('allocateSlotTiming', () => {
  it('should skip elapsed slots when appointmentDate is today and current time is in the middle of session', () => {
    // Current date is 2026-09-30 (today)
    // Night session: 18:00 to 24:00
    // Current time at test execution is > 21:00
    const result = allocateSlotTiming(
      '18:00',
      '24:00',
      [],
      30,
      '2026-09-30',
    );

    expect(result).not.toBeNull();
    // Start time must NOT be 18:00 because 18:00 has already elapsed today!
    expect(result!.startTime).not.toBe('18:00:00');
    // Result start time must be in the future (e.g. >= 22:00:00)
    const [h, m] = result!.startTime.split(':').map(Number);
    const startMinutes = h * 60 + m;
    expect(startMinutes).toBeGreaterThanOrEqual(21 * 60 + 40);
  });

  it('should skip occupied future slots and pick next available slot', () => {
    const resultFirst = allocateSlotTiming(
      '18:00',
      '24:00',
      [],
      30,
      '2026-09-30',
    );
    expect(resultFirst).not.toBeNull();
    const firstAvailable = resultFirst!.startTime;

    // Now mark the first available slot as occupied
    const resultSecond = allocateSlotTiming(
      '18:00',
      '24:00',
      [firstAvailable],
      30,
      '2026-09-30',
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
