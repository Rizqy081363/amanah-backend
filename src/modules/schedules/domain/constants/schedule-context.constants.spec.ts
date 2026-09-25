import { SHIFT_DEFINITIONS } from '../factories/schedule-slot.factory';
import { SCHEDULE_CONTEXT_DEFINITIONS } from './schedule-context.constants';

describe('schedule context constants', () => {
  it('uses shift definitions as the single source of truth for schedule contexts', () => {
    expect(SCHEDULE_CONTEXT_DEFINITIONS).toBe(SHIFT_DEFINITIONS);
    expect(
      SCHEDULE_CONTEXT_DEFINITIONS.map((context) => context.contextId),
    ).toEqual(['early_morning', 'morning', 'afternoon', 'night']);
  });
});
