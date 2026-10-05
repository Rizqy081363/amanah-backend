import { describe, expect, it } from 'bun:test';
import { BOOKING_SESSION_DISABLED_REASONS } from '../constants/schedule-shift.constants';
import {
  calculateDoctorSessionAvailableSlots,
  evaluateSessionTemporalAvailability,
  parseSessionEndMinutes,
  resolveEffectiveEndMinutes,
} from './schedule-temporal-availability.service';

describe('ScheduleTemporalAvailabilityService', () => {
  it('correctly calculates session end minutes including midnight-crossing intervals', () => {
    expect(parseSessionEndMinutes('08:00', '12:00')).toBe(720);
    expect(parseSessionEndMinutes('18:00', '00:00')).toBe(1440);
    expect(parseSessionEndMinutes('18:00', '24:00')).toBe(1440);
    expect(parseSessionEndMinutes('22:00', '02:00')).toBe(1560);
    expect(parseSessionEndMinutes('00:00', '06:00')).toBe(360);
  });

  it('resolves effective end minutes by taking latest end time among practitioners', () => {
    const defaultTiming = { startTime: '08:00', endTime: '12:00' };
    const sessions = [
      { startTime: '08:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '13:00' },
    ];
    expect(resolveEffectiveEndMinutes(defaultTiming, sessions)).toBe(780);
    expect(resolveEffectiveEndMinutes(defaultTiming, [])).toBe(720);
  });

  it('marks any session as isPast and disabled when schedule date is in the past', () => {
    const refDate = new Date('2026-10-03T12:00:00Z');
    const result = evaluateSessionTemporalAvailability({
      scheduleDate: '2026-10-02',
      defaultTiming: { startTime: '08:00', endTime: '12:00' },
      practitionerSessions: [{ startTime: '08:00', endTime: '12:00' }],
      totalAvailableSlots: 10,
      referenceDate: refDate,
    });

    expect(result.isPast).toBe(true);
    expect(result.isDisabled).toBe(true);
    expect(result.disabledReason).toBe(
      BOOKING_SESSION_DISABLED_REASONS.ELAPSED,
    );
    expect(result.effectiveAvailableSlots).toBe(0);
  });

  it('marks sessions whose end time has passed today as isPast and disabled', () => {
    const refDate = new Date('2026-10-03T13:30:00+07:00');
    const pagiResult = evaluateSessionTemporalAvailability({
      scheduleDate: '2026-10-03',
      defaultTiming: { startTime: '06:00', endTime: '12:00' },
      practitionerSessions: [{ startTime: '08:00', endTime: '12:00' }],
      totalAvailableSlots: 5,
      referenceDate: refDate,
    });

    expect(pagiResult.isPast).toBe(true);
    expect(pagiResult.isDisabled).toBe(true);
    expect(pagiResult.disabledReason).toBe(
      BOOKING_SESSION_DISABLED_REASONS.ELAPSED,
    );
    expect(pagiResult.effectiveAvailableSlots).toBe(0);

    const siangResult = evaluateSessionTemporalAvailability({
      scheduleDate: '2026-10-03',
      defaultTiming: { startTime: '12:00', endTime: '18:00' },
      practitionerSessions: [{ startTime: '13:00', endTime: '17:00' }],
      totalAvailableSlots: 5,
      referenceDate: refDate,
    });

    expect(siangResult.isPast).toBe(false);
    expect(siangResult.isDisabled).toBe(false);
    expect(siangResult.disabledReason).toBeNull();
    expect(siangResult.effectiveAvailableSlots).toBe(5);
  });

  it('marks session as disabled when no practitioner is scheduled on future date', () => {
    const refDate = new Date('2026-10-03T12:00:00Z');
    const result = evaluateSessionTemporalAvailability({
      scheduleDate: '2028-10-15',
      defaultTiming: { startTime: '08:00', endTime: '12:00' },
      practitionerSessions: [],
      totalAvailableSlots: 0,
      referenceDate: refDate,
    });

    expect(result.isPast).toBe(false);
    expect(result.isDisabled).toBe(true);
    expect(result.disabledReason).toBe(
      BOOKING_SESSION_DISABLED_REASONS.NO_SCHEDULE,
    );
  });

  it('marks session as disabled when quota is full on future date', () => {
    const refDate = new Date('2026-10-03T12:00:00Z');
    const result = evaluateSessionTemporalAvailability({
      scheduleDate: '2028-10-15',
      defaultTiming: { startTime: '08:00', endTime: '12:00' },
      practitionerSessions: [{ startTime: '08:00', endTime: '12:00' }],
      totalAvailableSlots: 0,
      referenceDate: refDate,
    });

    expect(result.isPast).toBe(false);
    expect(result.isDisabled).toBe(true);
    expect(result.disabledReason).toBe(
      BOOKING_SESSION_DISABLED_REASONS.QUOTA_FULL,
    );
  });

  describe('calculateDoctorSessionAvailableSlots', () => {
    it('returns only remaining unelapsed slots for today session', () => {
      // 17:33 WIB on 2026-10-05. Shift is 12:00 to 18:00 (12 slots of 30m).
      // Only 17:30 - 18:00 remains unelapsed.
      const refDate = new Date('2026-10-05T17:33:00+07:00');
      const available = calculateDoctorSessionAvailableSlots({
        scheduleDate: '2026-10-05',
        startTime: '12:00:00',
        endTime: '18:00:00',
        capacity: 12,
        availableSlots: 12,
        durationMinutes: 30,
        referenceDate: refDate,
      });

      expect(available).toBe(1);
    });

    it('returns 0 when all slots have elapsed today', () => {
      // 18:01 WIB on 2026-10-05. Shift 12:00 - 18:00.
      const refDate = new Date('2026-10-05T18:01:00+07:00');
      const available = calculateDoctorSessionAvailableSlots({
        scheduleDate: '2026-10-05',
        startTime: '12:00:00',
        endTime: '18:00:00',
        capacity: 12,
        availableSlots: 12,
        durationMinutes: 30,
        referenceDate: refDate,
      });

      expect(available).toBe(0);
    });

    it('excludes booked slot intervals from available count', () => {
      // 17:33 WIB. Last slot 17:30 is booked.
      const refDate = new Date('2026-10-05T17:33:00+07:00');
      const available = calculateDoctorSessionAvailableSlots({
        scheduleDate: '2026-10-05',
        startTime: '12:00:00',
        endTime: '18:00:00',
        capacity: 12,
        availableSlots: 12,
        durationMinutes: 30,
        bookedStartTimes: new Set(['17:30']),
        referenceDate: refDate,
      });

      expect(available).toBe(0);
    });

    it('returns all available slots for future date', () => {
      const refDate = new Date('2026-10-05T17:33:00+07:00');
      const available = calculateDoctorSessionAvailableSlots({
        scheduleDate: '2026-10-06',
        startTime: '12:00:00',
        endTime: '18:00:00',
        capacity: 12,
        availableSlots: 12,
        durationMinutes: 30,
        referenceDate: refDate,
      });

      expect(available).toBe(12);
    });
  });
});
