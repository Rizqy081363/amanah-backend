import { ScheduleOperationalStatus } from './entities/schedule.entity';
import {
  AdminScheduleStatusRequest,
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
  SchedulePersistenceStatus,
  toAdminScheduleStatusRequest,
} from './schedule-status';

describe('schedule status domain model', () => {
  it('maps persisted closed session status to CLOSED operational status', () => {
    expect(
      resolveSessionOperationalStatus({
        isClosedForLeave: false,
        availableSlots: 4,
        persistedStatus: SchedulePersistenceStatus.CLOSED,
      }),
    ).toBe(ScheduleOperationalStatus.CLOSED);
  });

  it('derives occupied session status from capacity availability instead of client labels', () => {
    expect(
      resolveSessionOperationalStatus({
        isClosedForLeave: false,
        availableSlots: 0,
        persistedStatus: SchedulePersistenceStatus.OPEN,
      }),
    ).toBe(ScheduleOperationalStatus.OCCUPIED);
  });

  it('treats full days as OCCUPIED and all-closed days as CLOSED', () => {
    expect(
      resolveAggregateOperationalStatus({
        isClosedForLeave: false,
        sessionStatuses: [ScheduleOperationalStatus.OCCUPIED],
      }),
    ).toBe(ScheduleOperationalStatus.OCCUPIED);

    expect(
      resolveAggregateOperationalStatus({
        isClosedForLeave: false,
        sessionStatuses: [ScheduleOperationalStatus.CLOSED],
      }),
    ).toBe(ScheduleOperationalStatus.CLOSED);
  });

  it('accepts only canonical admin status commands', () => {
    expect(toAdminScheduleStatusRequest('OPEN')).toBe(
      AdminScheduleStatusRequest.OPEN,
    );
    expect(toAdminScheduleStatusRequest('CLOSED')).toBe(
      AdminScheduleStatusRequest.CLOSED,
    );
    expect(toAdminScheduleStatusRequest('Buka')).toBeNull();
    expect(toAdminScheduleStatusRequest('Cuti')).toBeNull();
    expect(toAdminScheduleStatusRequest('Penuh')).toBeNull();
    expect(toAdminScheduleStatusRequest('Tutup')).toBeNull();
  });
});
