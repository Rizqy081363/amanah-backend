import { projectScheduleIntervals } from './schedule-projection';

describe('projectScheduleIntervals', () => {
  it('anchors intervals to an arbitrary start time without hourly rounding', () => {
    const projection = projectScheduleIntervals({
      scheduleId: 'session-1',
      selectedStartTime: '08:45',
      boundaryEndTime: '10:15',
      durationMinutes: 30,
      appointments: [],
    });

    expect(projection.capacity).toBe(3);
    expect(projection.projectedEndTime).toBe('10:15');
    expect(projection.intervals.map((interval) => interval.startTime)).toEqual([
      '08:45',
      '09:15',
      '09:45',
    ]);
    expect(projection.intervals.map((interval) => interval.endTime)).toEqual([
      '09:15',
      '09:45',
      '10:15',
    ]);
  });

  it('keeps only full intervals when duration does not divide the remaining boundary', () => {
    const projection = projectScheduleIntervals({
      scheduleId: 'session-1',
      selectedStartTime: '09:40',
      boundaryEndTime: '12:00',
      durationMinutes: 30,
      appointments: [],
    });

    expect(projection.capacity).toBe(4);
    expect(projection.projectedEndTime).toBe('11:40');
    expect(projection.intervals.map((interval) => interval.startTime)).toEqual([
      '09:40',
      '10:10',
      '10:40',
      '11:10',
    ]);
  });

  it('marks intervals containing active appointments as occupied', () => {
    const projection = projectScheduleIntervals({
      scheduleId: 'session-1',
      selectedStartTime: '08:45',
      boundaryEndTime: '10:15',
      durationMinutes: 30,
      appointments: [
        {
          appointmentId: 'appointment-1',
          startTime: '09:20',
          endTime: '09:50',
          queueNumber: 'P-001',
          status: 'booked',
        },
      ],
    });

    expect(projection.intervals.map((interval) => interval.status)).toEqual([
      'OPEN',
      'OCCUPIED',
      'OCCUPIED',
    ]);
    expect(projection.intervals[1].displayLabel).toBe('Terisi');
    expect(projection.intervals[1].appointmentRef).toEqual({
      appointmentId: 'appointment-1',
      queueNumber: 'P-001',
      status: 'booked',
    });
  });

  it('represents leave as closed intervals with a leave reason', () => {
    const projection = projectScheduleIntervals({
      scheduleId: 'session-1',
      selectedStartTime: '08:00',
      boundaryEndTime: '09:00',
      durationMinutes: 30,
      appointments: [],
      closedReason: 'LEAVE',
    });

    expect(projection.intervals.map((interval) => interval.status)).toEqual([
      'CLOSED',
      'CLOSED',
    ]);
    expect(projection.intervals[0].displayLabel).toBe('Tutup');
    expect(projection.intervals[0].closedReason).toBe('LEAVE');
  });
});
