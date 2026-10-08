import { describe, expect, it } from 'bun:test';
import { allocateAppointmentTiming } from './appointment-timing.helper';

describe('allocateAppointmentTiming', () => {
  it('should find first available slot in empty session', () => {
    const result = allocateAppointmentTiming('08:00', '12:00', [], 30);
    expect(result).not.toBeNull();
    expect(result?.startTime).toBe('08:00:00');
    expect(result?.endTime).toBe('08:30:00');
  });

  it('should skip already occupied times', () => {
    const result = allocateAppointmentTiming(
      '08:00',
      '12:00',
      ['08:00:00', '08:30:00'],
      30,
    );
    expect(result).not.toBeNull();
    expect(result?.startTime).toBe('09:00:00');
    expect(result?.endTime).toBe('09:30:00');
  });

  it('should return null when session is completely full', () => {
    const full = ['08:00', '08:30', '09:00', '09:30'];
    const result = allocateAppointmentTiming('08:00', '10:00', full, 30);
    expect(result).toBeNull();
  });

  it('should reject past appointment dates', () => {
    const result = allocateAppointmentTiming(
      '18:00',
      '24:00',
      [],
      30,
      '2020-01-01',
    );
    expect(result).toBeNull();
  });
});
