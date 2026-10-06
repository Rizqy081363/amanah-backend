import { describe, expect, it } from 'bun:test';
import { planSlot } from './appointment-slot.planner';

describe('planSlot', () => {
  it('should plan first slot at day start', () => {
    const dayStart = new Date('2026-10-06T08:00:00.000Z');
    const result = planSlot({
      dayStart,
      queueNumber: 1,
      slotMinutes: 30,
    });

    expect(result.estimatedStartAt.toISOString()).toBe('2026-10-06T08:00:00.000Z');
    expect(result.estimatedEndAt.toISOString()).toBe('2026-10-06T08:30:00.000Z');
  });

  it('should plan second slot offset by slot duration', () => {
    const dayStart = new Date('2026-10-06T08:00:00.000Z');
    const result = planSlot({
      dayStart,
      queueNumber: 2,
      slotMinutes: 30,
    });

    expect(result.estimatedStartAt.toISOString()).toBe('2026-10-06T08:30:00.000Z');
    expect(result.estimatedEndAt.toISOString()).toBe('2026-10-06T09:00:00.000Z');
  });

  it('should handle custom slot durations', () => {
    const dayStart = new Date('2026-10-06T09:00:00.000Z');
    const result = planSlot({
      dayStart,
      queueNumber: 3,
      slotMinutes: 20,
    });

    expect(result.estimatedStartAt.toISOString()).toBe('2026-10-06T09:40:00.000Z');
    expect(result.estimatedEndAt.toISOString()).toBe('2026-10-06T10:00:00.000Z');
  });
});
