import {
  ScheduleSessionFactory,
  SHIFT_DEFINITIONS,
} from './schedule-session.factory';

describe('ScheduleSessionFactory', () => {
  describe('24-Hour Cycle and Shift Definitions', () => {
    it('should cleanly divide 24 hours into 4 equal 6-hour shifts', () => {
      expect(SHIFT_DEFINITIONS).toHaveLength(4);

      const [early, morning, afternoon, night] = SHIFT_DEFINITIONS;

      expect(early.boundaryStartTime).toBe('00:00');
      expect(early.boundaryEndTime).toBe('06:00');
      expect(early.boundaryEndMinutes - early.boundaryStartMinutes).toBe(360);

      expect(morning.boundaryStartTime).toBe('06:00');
      expect(morning.boundaryEndTime).toBe('12:00');
      expect(morning.boundaryEndMinutes - morning.boundaryStartMinutes).toBe(
        360,
      );

      expect(afternoon.boundaryStartTime).toBe('12:00');
      expect(afternoon.boundaryEndTime).toBe('18:00');
      expect(
        afternoon.boundaryEndMinutes - afternoon.boundaryStartMinutes,
      ).toBe(360);

      expect(night.boundaryStartTime).toBe('18:00');
      expect(night.boundaryEndTime).toBe('24:00');
      expect(night.boundaryEndMinutes - night.boundaryStartMinutes).toBe(360);
    });
  });

  describe('Session Timing and Dynamic Interval Calculation', () => {
    it('should dynamically calculate 14:00 -> 14:30 (1 session) by default when duration is 30m', () => {
      const afternoon = ScheduleSessionFactory.resolveShiftDefinition('afternoon');
      const timing = ScheduleSessionFactory.calculateSessionTiming(
        afternoon,
        '14:00',
        { durationMinutes: 30, startPrecisionMinutes: 1 },
      );

      expect(timing.startMinutes).toBe(840);
      expect(timing.endMinutes).toBe(870);
      expect(timing.endTime).toBe('14:30');
      expect(timing.capacity).toBe(1);
      expect(timing.remainingShiftSlots).toBe(7);
    });

    it('should fill remaining shift only when fillShift is explicitly true', () => {
      const afternoon = ScheduleSessionFactory.resolveShiftDefinition('afternoon');
      const timing = ScheduleSessionFactory.calculateSessionTiming(
        afternoon,
        '14:00',
        { durationMinutes: 30 },
        { fillShift: true },
      );

      expect(timing.capacity).toBe(8);
      expect(timing.endTime).toBe('18:00');
      expect(timing.remainingShiftSlots).toBe(0);
    });

    it('should resolve shift from clock time dynamically', () => {
      expect(ScheduleSessionFactory.resolveShiftFromClockTime('02:00').shift).toBe(
        'early_morning',
      );
      expect(ScheduleSessionFactory.resolveShiftFromClockTime('09:15').shift).toBe(
        'morning',
      );
      expect(ScheduleSessionFactory.resolveShiftFromClockTime('14:00').shift).toBe(
        'afternoon',
      );
      expect(ScheduleSessionFactory.resolveShiftFromClockTime('19:30').shift).toBe(
        'night',
      );
    });
  });

  describe('Session Capacity and Templates', () => {
    it('should create template sessions dynamically for seeders or automation', () => {
      const template = ScheduleSessionFactory.createSessionTemplate('morning', 30);
      expect(template.label).toBe('Pagi');
      expect(template.shift).toBe('morning');
      expect(template.startTime).toBe('06:00');
      expect(template.endTime).toBe('12:00');
      expect(template.capacity).toBe(12);
      expect(template.availableSlots).toBe(12);
    });

    it('should calculate capacity from time range and duration', () => {
      expect(ScheduleSessionFactory.calculateCapacity('08:00', '12:00', 30)).toBe(
        8,
      );
      expect(ScheduleSessionFactory.calculateCapacity('06:00', '12:00', 30)).toBe(
        12,
      );
      expect(ScheduleSessionFactory.calculateCapacity('00:00', '00:30', 30)).toBe(
        1,
      );
    });

    it('should calculate canonical session metrics accurately', () => {
      const metrics = ScheduleSessionFactory.calculateSessionMetrics({
        startTime: '08:00',
        endTime: '12:00',
        durationMinutes: 30,
        bookedCount: 1,
      });

      expect(metrics.shift).toBe('morning');
      expect(metrics.sessionLabel).toBe('Pagi');
      expect(metrics.capacity).toBe(8);
      expect(metrics.bookedCount).toBe(1);
      expect(metrics.availableSlots).toBe(7);
      expect(metrics.displaySlot).toBe('1 / 8');
    });

    it('should correctly assign early_morning shift to 00:00 start time', () => {
      const metrics = ScheduleSessionFactory.calculateSessionMetrics({
        startTime: '00:00',
        endTime: '00:30',
        durationMinutes: 30,
        bookedCount: 0,
      });

      expect(metrics.shift).toBe('early_morning');
      expect(metrics.sessionLabel).toBe('Dini Hari');
      expect(metrics.capacity).toBe(1);
      expect(metrics.availableSlots).toBe(1);
      expect(metrics.displaySlot).toBe('0 / 1');
    });
  });
});
