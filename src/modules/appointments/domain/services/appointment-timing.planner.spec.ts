import { describe, expect, it } from 'bun:test';
import { planAppointmentTiming } from './appointment-timing.planner';

describe('planAppointmentTiming', () => {
  it('should plan first ticket timing at session start', () => {
    const dayStart = new Date('2026-10-06T08:00:00.000Z');
    const result = planAppointmentTiming({
      dayStart,
      queueNumber: 1,
      durationMinutes: 30,
    });

    expect(result.estimatedStartAt.toISOString()).toBe(
      '2026-10-06T08:00:00.000Z',
    );
    expect(result.estimatedEndAt.toISOString()).toBe(
      '2026-10-06T08:30:00.000Z',
    );
  });

  it('should plan second ticket offset by consultation duration', () => {
    const dayStart = new Date('2026-10-06T08:00:00.000Z');
    const result = planAppointmentTiming({
      dayStart,
      queueNumber: 2,
      durationMinutes: 30,
    });

    expect(result.estimatedStartAt.toISOString()).toBe(
      '2026-10-06T08:30:00.000Z',
    );
    expect(result.estimatedEndAt.toISOString()).toBe(
      '2026-10-06T09:00:00.000Z',
    );
  });

  it('should handle custom consultation durations', () => {
    const dayStart = new Date('2026-10-06T09:00:00.000Z');
    const result = planAppointmentTiming({
      dayStart,
      queueNumber: 3,
      durationMinutes: 20,
    });

    expect(result.estimatedStartAt.toISOString()).toBe(
      '2026-10-06T09:40:00.000Z',
    );
    expect(result.estimatedEndAt.toISOString()).toBe(
      '2026-10-06T10:00:00.000Z',
    );
  });
});
