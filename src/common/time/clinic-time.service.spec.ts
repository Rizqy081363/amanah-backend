import { describe, expect, it } from 'bun:test';
import { ClinicTimeService } from './clinic-time.service';

describe('ClinicTimeService', () => {
  it('should default to Asia/Jakarta timezone when no config provided', () => {
    const service = new ClinicTimeService();
    expect(service.getTimezone()).toBe('Asia/Jakarta');
  });

  it('should format today date string in Asia/Jakarta correctly across midnight', () => {
    const service = new ClinicTimeService();
    const utcMidnightDate = new Date('2026-10-06T17:30:00.000Z');
    expect(service.getTodayDateString(utcMidnightDate)).toBe('2026-10-07');
    expect(service.getCurrentTimeString(utcMidnightDate)).toBe('00:30:00');
  });

  it('should format arbitrary date and time strings deterministically', () => {
    const service = new ClinicTimeService();
    const targetDate = new Date('2026-12-31T23:59:59.000Z');
    expect(service.formatDate(targetDate)).toBe('2027-01-01');
    expect(service.formatTime(targetDate)).toBe('06:59:59');
  });

  it('should accept custom timezone from config service mock', () => {
    const mockConfig = {
      get: (key: string) =>
        key === 'app.timezone' ? 'Asia/Makassar' : undefined,
    } as any;
    const service = new ClinicTimeService(mockConfig);
    expect(service.getTimezone()).toBe('Asia/Makassar');
    const utcMidnightDate = new Date('2026-10-06T17:30:00.000Z');
    expect(service.getTodayDateString(utcMidnightDate)).toBe('2026-10-07');
    expect(service.getCurrentTimeString(utcMidnightDate)).toBe('01:30:00');
  });
});
