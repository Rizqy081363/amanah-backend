import { describe, expect, it } from 'bun:test';
import {
  CLINIC_POLICY_FALLBACK_CONFIG,
  DEFAULT_CONSULTATION_DURATION_MINUTES,
} from './schedule.constants';
import {
  ScheduleShiftRegistry,
  SESSION_TO_SHIFT_MAP,
  resolveCanonicalShift,
} from './schedule-shift.constants';

describe('ScheduleShiftRegistry', () => {
  it('resolves night shift across case variations and synonyms', () => {
    expect(ScheduleShiftRegistry.resolve('MALAM').shift).toBe('night');
    expect(ScheduleShiftRegistry.resolve('malam').shift).toBe('night');
    expect(ScheduleShiftRegistry.resolve('NIGHT').shift).toBe('night');
    expect(ScheduleShiftRegistry.resolve('night').shift).toBe('night');
    expect(ScheduleShiftRegistry.resolve('Malam').session).toBe('MALAM');
    expect(ScheduleShiftRegistry.resolve('night').defaultEndTime).toBe('24:00');
  });

  it('resolves other shifts cleanly', () => {
    expect(ScheduleShiftRegistry.resolve('DINI_HARI').shift).toBe('early_morning');
    expect(ScheduleShiftRegistry.resolve('dini hari').shift).toBe('early_morning');
    expect(ScheduleShiftRegistry.resolve('PAGI').shift).toBe('morning');
    expect(ScheduleShiftRegistry.resolve('pagi').shift).toBe('morning');
    expect(ScheduleShiftRegistry.resolve('SIANG').shift).toBe('afternoon');
    expect(ScheduleShiftRegistry.resolve('siang').shift).toBe('afternoon');
    expect(ScheduleShiftRegistry.resolve('sore').shift).toBe('afternoon');
  });

  it('provides backwards compatibility via SESSION_TO_SHIFT_MAP proxy', () => {
    expect(SESSION_TO_SHIFT_MAP['MALAM']).toBe('night');
    expect(SESSION_TO_SHIFT_MAP['malam']).toBe('night');
    expect(SESSION_TO_SHIFT_MAP['NIGHT']).toBe('night');
    expect(SESSION_TO_SHIFT_MAP['night']).toBe('night');
    expect(SESSION_TO_SHIFT_MAP['PAGI']).toBe('morning');
    expect(SESSION_TO_SHIFT_MAP['SIANG']).toBe('afternoon');
    expect(SESSION_TO_SHIFT_MAP['DINI_HARI']).toBe('early_morning');
  });

  it('resolves canonical shift without redundant casing lookups', () => {
    expect(resolveCanonicalShift({ session: 'MALAM' })).toEqual({
      shift: 'night',
      session: 'MALAM',
      label: 'Malam',
    });
    expect(resolveCanonicalShift({ sessionShift: 'pagi' })).toEqual({
      shift: 'morning',
      session: 'PAGI',
      label: 'Pagi',
    });
  });

  it('aligns fallback consultation duration with policy config', () => {
    expect(DEFAULT_CONSULTATION_DURATION_MINUTES).toBe(
      CLINIC_POLICY_FALLBACK_CONFIG.consultationDurationMinutes,
    );
    expect(CLINIC_POLICY_FALLBACK_CONFIG.consultationDurationMinutes).toBe(30);
  });
});
