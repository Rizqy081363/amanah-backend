import { describe, expect, it } from 'bun:test';
import {
  calculateGrossHours,
  calculateSessionNetHours,
  parseTimeToMinutes,
} from './shift-duration.helper';

describe('Shift Duration & Break Helper Tests', () => {
  it('parseTimeToMinutes converts HH:mm:ss correctly', () => {
    expect(parseTimeToMinutes('06:00:00')).toBe(360);
    expect(parseTimeToMinutes('12:30:00')).toBe(750);
    expect(parseTimeToMinutes('24:00:00')).toBe(1440);
  });

  it('calculateGrossHours calculates standard morning shift (06:00 to 12:00) as 6.0 hours', () => {
    expect(calculateGrossHours('06:00:00', '12:00:00')).toBe(6);
  });

  it('calculateGrossHours calculates night shift (18:00 to 24:00) as 6.0 hours', () => {
    expect(calculateGrossHours('18:00:00', '24:00:00')).toBe(6);
    expect(calculateGrossHours('18:00:00', '00:00:00')).toBe(6);
  });

  it('calculateGrossHours calculates custom shift (07:00 to 17:30) as 10.5 hours', () => {
    expect(calculateGrossHours('07:00:00', '17:30:00')).toBe(10.5);
  });

  it('calculateSessionNetHours subtracts 30-minute unpaid break from standard 6-hour shift to yield 5.5 hours', () => {
    const net = calculateSessionNetHours({
      startsAt: '06:00:00',
      endsAt: '12:00:00',
      breakMinutes: 30,
      isBreakPaid: false,
    });
    expect(net).toBe(5.5);
  });

  it('calculateSessionNetHours preserves full 6.0 hours when isBreakPaid is true', () => {
    const net = calculateSessionNetHours({
      startsAt: '06:00:00',
      endsAt: '12:00:00',
      breakMinutes: 30,
      isBreakPaid: true,
    });
    expect(net).toBe(6);
  });

  it('calculateSessionNetHours handles custom 4-hour shift with 15-minute break', () => {
    const net = calculateSessionNetHours({
      startsAt: '08:00:00',
      endsAt: '12:00:00',
      breakMinutes: 15,
      isBreakPaid: false,
    });
    expect(net).toBe(3.75);
  });
});
