import { describe, expect, it } from 'bun:test';
import { isAppointmentLate } from './appointment-lateness.predicate';

describe('isAppointmentLate', () => {
  it('should return false when appointment estimated start is in future', () => {
    const estimated = new Date('2026-10-06T10:00:00.000Z');
    const now = new Date('2026-10-06T08:00:00.000Z');
    expect(isAppointmentLate(estimated, now)).toBe(false);
  });

  it('should return false when elapsed time is less than 24 hours', () => {
    const estimated = new Date('2026-10-05T10:00:00.000Z');
    const now = new Date('2026-10-06T09:59:59.000Z');
    expect(isAppointmentLate(estimated, now)).toBe(false);
  });

  it('should return true when elapsed time is exactly 24 hours', () => {
    const estimated = new Date('2026-10-05T10:00:00.000Z');
    const now = new Date('2026-10-06T10:00:00.000Z');
    expect(isAppointmentLate(estimated, now)).toBe(true);
  });

  it('should return true when elapsed time exceeds 24 hours', () => {
    const estimated = new Date('2026-10-04T10:00:00.000Z');
    const now = new Date('2026-10-06T10:00:00.000Z');
    expect(isAppointmentLate(estimated, now)).toBe(true);
  });
});
