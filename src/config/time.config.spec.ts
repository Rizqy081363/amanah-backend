import { describe, expect, it } from 'bun:test';
import { assertIanaTimezone } from './time.config';

describe('time.config - assertIanaTimezone', () => {
  it('accepts valid IANA timezones', () => {
    expect(assertIanaTimezone('Asia/Jakarta', 'CLINIC_TIMEZONE')).toBe(
      'Asia/Jakarta',
    );
    expect(assertIanaTimezone('UTC', 'PROCESS_TZ')).toBe('UTC');
    expect(assertIanaTimezone('America/New_York', 'TEST_TZ')).toBe(
      'America/New_York',
    );
    expect(assertIanaTimezone('Asia/Makassar', 'TEST_TZ')).toBe(
      'Asia/Makassar',
    );
  });

  it('rejects fixed offsets and abbreviations', () => {
    expect(() => assertIanaTimezone('WIB', 'CLINIC_TIMEZONE')).toThrow();
    expect(() => assertIanaTimezone('+07:00', 'CLINIC_TIMEZONE')).toThrow();
    expect(() => assertIanaTimezone('UTC+7', 'CLINIC_TIMEZONE')).toThrow();
    expect(() => assertIanaTimezone('GMT', 'CLINIC_TIMEZONE')).toThrow();
  });

  it('rejects empty or nonexistent timezones', () => {
    expect(() => assertIanaTimezone('', 'CLINIC_TIMEZONE')).toThrow();
    expect(() =>
      assertIanaTimezone('Mars/Olympus', 'CLINIC_TIMEZONE'),
    ).toThrow();
  });
});
