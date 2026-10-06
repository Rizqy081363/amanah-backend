import { describe, expect, it } from 'bun:test';
import { Temporal } from '@js-temporal/polyfill';
import {
  ClinicTimeService,
  parseBusinessDate,
} from './clinic-time.service';
import { FixedClock } from './clock';

describe('ClinicTimeService - Time Contract Matrix', () => {
  const makeService = (iso: string, timezone = 'Asia/Jakarta') => {
    const fixedClock = new FixedClock(Temporal.Instant.from(iso));
    const mockConfig = {
      getOrThrow: (key: string) => {
        if (key === 'time.clinicTimezone') {
          return timezone;
        }
        throw new Error(`Missing ${key}`);
      },
    } as any;
    return new ClinicTimeService(fixedClock, mockConfig);
  };

  const cases = [
    ['2026-10-06T16:59:59Z', '2026-10-06'],
    ['2026-10-06T17:00:00Z', '2026-10-07'],
    ['2026-10-06T17:23:00Z', '2026-10-07'],
    ['2026-10-07T16:59:59Z', '2026-10-07'],
  ] as const;

  for (const [iso, expected] of cases) {
    it(`determines today correctly across midnight: ${iso} -> ${expected}`, () => {
      const service = makeService(iso, 'Asia/Jakarta');
      expect(service.today()).toBe(expected);
    });
  }

  it('parses valid business dates strictly', () => {
    expect(parseBusinessDate('2026-10-07')).toBe('2026-10-07');
  });

  it('rejects invalid leap or month dates', () => {
    expect(() => parseBusinessDate('2026-02-30')).toThrow();
  });

  it('rejects non-calendar strings', () => {
    expect(() => parseBusinessDate('not-a-date')).toThrow();
    expect(() => parseBusinessDate('')).toThrow();
    expect(() => parseBusinessDate('2026-13-01')).toThrow();
  });

  it('computes half-open UTC range for clinic calendar day', () => {
    const service = makeService('2026-10-06T17:23:00Z', 'Asia/Jakarta');
    const range = service.rangeOf(parseBusinessDate('2026-10-07'));
    expect(range.from.toString()).toBe('2026-10-06T17:00:00Z');
    expect(range.to.toString()).toBe('2026-10-07T17:00:00Z');
  });

  it('formats time and date deterministically with explicit timezone', () => {
    const service = makeService('2026-10-06T17:23:00Z', 'Asia/Jakarta');
    expect(service.getCurrentTimeString()).toBe('00:23:00');
    expect(service.formatDate('2026-12-31T23:59:59Z')).toBe('2027-01-01');
    expect(service.formatTime('2026-12-31T23:59:59Z')).toBe('06:59:59');
  });
});
