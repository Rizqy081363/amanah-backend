import {
  ScheduleSlotFactory,
  SHIFT_DEFINITIONS,
} from './schedule-slot.factory';

describe('ScheduleSlotFactory', () => {
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

    it('should calculate 12 slots default per shift when consultation duration is 30 minutes', () => {
      expect(ScheduleSlotFactory.calculateShiftTotalSlots(30)).toBe(12);
    });

    it('should support dynamic consultation durations mathematically', () => {
      expect(ScheduleSlotFactory.calculateShiftTotalSlots(15)).toBe(24);
      expect(ScheduleSlotFactory.calculateShiftTotalSlots(20)).toBe(18);
      expect(ScheduleSlotFactory.calculateShiftTotalSlots(45)).toBe(8);
      expect(ScheduleSlotFactory.calculateShiftTotalSlots(60)).toBe(6);
    });
  });

  describe('Session Timing and Dynamic Interval Calculation', () => {
    it('should dynamically calculate 14:00 -> 14:30 (1 session) by default when duration is 30m', () => {
      const afternoon = ScheduleSlotFactory.resolveShiftDefinition('afternoon');
      const timing = ScheduleSlotFactory.calculateSessionTiming(
        afternoon,
        '14:00',
        { durationMinutes: 30, startPrecisionMinutes: 1 },
      );

      expect(timing.startMinutes).toBe(840); // 14 * 60
      expect(timing.endMinutes).toBe(870); // 14:30
      expect(timing.endTime).toBe('14:30');
      expect(timing.capacity).toBe(1);
      // From 14:30 to 18:00 (1080m - 870m = 210m -> 7 slots)
      expect(timing.remainingShiftSlots).toBe(7);
    });

    it('should dynamically calculate remaining slots if doctor starts at 09:00 in morning shift', () => {
      const morning = ScheduleSlotFactory.resolveShiftDefinition('morning');
      // Total remaining slots from 09:00 to 12:00:
      const totalRemaining =
        ScheduleSlotFactory.calculateRemainingSlotsFromTime(
          morning.boundaryEndMinutes,
          540, // 09:00
          30,
        );
      expect(totalRemaining).toBe(6);

      const timing = ScheduleSlotFactory.calculateSessionTiming(
        morning,
        '09:00',
        { durationMinutes: 30, startPrecisionMinutes: 1 },
      );
      expect(timing.endTime).toBe('09:30');
      expect(timing.capacity).toBe(1);
      expect(timing.remainingShiftSlots).toBe(5);
    });

    it('should fill remaining shift only when fillShift is explicitly true', () => {
      const afternoon = ScheduleSlotFactory.resolveShiftDefinition('afternoon');
      const timing = ScheduleSlotFactory.calculateSessionTiming(
        afternoon,
        '14:00',
        { durationMinutes: 30 },
        { fillShift: true },
      );

      // From 14:00 to 18:00 = 4 hours = 240 mins = 8 slots
      expect(timing.capacity).toBe(8);
      expect(timing.endTime).toBe('18:00');
      expect(timing.remainingShiftSlots).toBe(0);
    });

    it('should resolve shift from clock time dynamically', () => {
      expect(ScheduleSlotFactory.resolveShiftFromClockTime('02:00').shift).toBe(
        'early_morning',
      );
      expect(ScheduleSlotFactory.resolveShiftFromClockTime('09:15').shift).toBe(
        'morning',
      );
      expect(ScheduleSlotFactory.resolveShiftFromClockTime('14:00').shift).toBe(
        'afternoon',
      );
      expect(ScheduleSlotFactory.resolveShiftFromClockTime('19:30').shift).toBe(
        'night',
      );
    });
  });

  describe('Slot Generation and Templates', () => {
    it('should generate discrete shift slots dynamically using pure math', () => {
      const morningSlots = ScheduleSlotFactory.generateShiftSlots(
        'morning',
        30,
      );
      expect(morningSlots).toHaveLength(12);
      expect(morningSlots[0]).toEqual({
        slotIndex: 1,
        startTime: '06:00',
        endTime: '06:30',
        timeRange: '06:00 - 06:30 WIB',
      });
      expect(morningSlots[11]).toEqual({
        slotIndex: 12,
        startTime: '11:30',
        endTime: '12:00',
        timeRange: '11:30 - 12:00 WIB',
      });
    });

    it('should create template sessions dynamically for seeders or automation', () => {
      const template = ScheduleSlotFactory.createSessionTemplate('morning', 30);
      expect(template.label).toBe('Pagi');
      expect(template.shift).toBe('morning');
      expect(template.startTime).toBe('06:00');
      expect(template.endTime).toBe('12:00');
      expect(template.capacity).toBe(12);
      expect(template.availableSlots).toBe(12);
    });

    it('should calculate capacity from time range and duration', () => {
      // 08:00 - 12:00 = 4 hours = 240 mins / 30 = 8 slots
      expect(ScheduleSlotFactory.calculateCapacity('08:00', '12:00', 30)).toBe(
        8,
      );
      // 06:00 - 12:00 = 6 hours = 360 mins / 30 = 12 slots
      expect(ScheduleSlotFactory.calculateCapacity('06:00', '12:00', 30)).toBe(
        12,
      );
      // 00:00 - 00:30 = 30 mins / 30 = 1 slot
      expect(ScheduleSlotFactory.calculateCapacity('00:00', '00:30', 30)).toBe(
        1,
      );
    });

    it('should calculate canonical session metrics and displaySlot accurately', () => {
      const metrics = ScheduleSlotFactory.calculateSessionMetrics({
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
      const metrics = ScheduleSlotFactory.calculateSessionMetrics({
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
