import { CalendarService } from './calendar.service';

describe('CalendarService', () => {
  const service = new CalendarService();

  const d = (timeStr: string) => new Date(`2026-10-08T${timeStr}:00.000Z`);

  describe('subtractIntervals', () => {
    it('returns unmodified interval when no closures exist', () => {
      const base = [{ start: d('06:00'), end: d('12:00') }];
      const result = service.subtractIntervals(base, []);
      expect(result).toHaveLength(1);
      expect(result[0].start).toEqual(d('06:00'));
      expect(result[0].end).toEqual(d('12:00'));
    });

    it('splits interval when closure is entirely inside', () => {
      const base = [{ start: d('06:00'), end: d('12:00') }];
      const closures = [{ start: d('08:00'), end: d('09:00') }];
      const result = service.subtractIntervals(base, closures);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ start: d('06:00'), end: d('08:00') });
      expect(result[1]).toEqual({ start: d('09:00'), end: d('12:00') });
    });

    it('chops start of interval when closure covers start', () => {
      const base = [{ start: d('06:00'), end: d('12:00') }];
      const closures = [{ start: d('05:00'), end: d('08:00') }];
      const result = service.subtractIntervals(base, closures);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: d('08:00'), end: d('12:00') });
    });

    it('chops end of interval when closure covers end', () => {
      const base = [{ start: d('06:00'), end: d('12:00') }];
      const closures = [{ start: d('11:00'), end: d('13:00') }];
      const result = service.subtractIntervals(base, closures);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ start: d('06:00'), end: d('11:00') });
    });

    it('removes interval entirely if closure engulfs it', () => {
      const base = [{ start: d('06:00'), end: d('12:00') }];
      const closures = [{ start: d('05:00'), end: d('13:00') }];
      const result = service.subtractIntervals(base, closures);

      expect(result).toHaveLength(0);
    });
  });

  describe('isOpen', () => {
    const segments = [
      { start: d('06:00'), end: d('08:00') },
      { start: d('09:00'), end: d('12:00') },
    ];

    it('returns true when timestamp is inside an open segment [start, end)', () => {
      expect(service.isOpen(d('06:00'), segments)).toBe(true);
      expect(service.isOpen(d('07:30'), segments)).toBe(true);
      expect(service.isOpen(d('10:00'), segments)).toBe(true);
    });

    it('returns false when timestamp is inside a closure gap or past end', () => {
      expect(service.isOpen(d('08:00'), segments)).toBe(false); // boundary: half-open [start, end)
      expect(service.isOpen(d('08:30'), segments)).toBe(false);
      expect(service.isOpen(d('12:00'), segments)).toBe(false);
      expect(service.isOpen(d('13:00'), segments)).toBe(false);
    });
  });

  describe('nextOpen', () => {
    const segments = [
      { start: d('06:00'), end: d('08:00') },
      { start: d('09:00'), end: d('12:00') },
    ];

    it('returns first open segment if before start', () => {
      const next = service.nextOpen(d('05:00'), segments);
      expect(next).toEqual(segments[0]);
    });

    it('returns next segment if currently in closure gap', () => {
      const next = service.nextOpen(d('08:15'), segments);
      expect(next).toEqual(segments[1]);
    });

    it('returns null if past all open segments', () => {
      const next = service.nextOpen(d('13:00'), segments);
      expect(next).toBeNull();
    });
  });
});
