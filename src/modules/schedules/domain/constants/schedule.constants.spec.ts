import {
  ACTIVE_APPOINTMENT_STATUSES,
  isUuid,
} from './schedule.constants';

describe('schedule constants', () => {
  it('keeps canonical scheduling runtime constants stable', () => {
    expect(ACTIVE_APPOINTMENT_STATUSES).toEqual([
      'booked',
      'checked_in',
      'waiting',
      'in_service',
    ]);
  });

  it('validates UUID-shaped identifiers consistently', () => {
    expect(isUuid('4b9d6b54-cc1a-4b20-b1c8-08b936dcb0a5')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
