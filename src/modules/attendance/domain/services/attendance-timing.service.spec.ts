import { describe, expect, it } from 'bun:test';
import { AttendanceTimingService } from './attendance-timing.service';

describe('AttendanceTimingService - CheckOut Timing & Fair Credit Rounding', () => {
  const mockClinicConfig: any = {
    getAttendanceConfig: async () => ({
      checkInWindowMinutesBefore: 30,
      checkInWindowMinutesAfter: 60,
      lateToleranceMinutes: 15,
      checkOutWindowMinutesBefore: 30,
      earlyCheckoutRequiresNotes: true,
      qrRotationSeconds: 30,
      overtimeEnabled: true,
    }),
  };

  const service = new AttendanceTimingService(mockClinicConfig);

  it('Scenario 1: Checkout at 17:45 inside normal window (17:30 - 18:30) receives full 6.00 hours credit without notes', async () => {
    const checkIn = new Date('2026-10-19T12:00:00');
    const checkOut = new Date('2026-10-19T17:45:00'); // 15 mins before end

    const result = await service.evaluateCheckOutTiming({
      checkInTime: checkIn,
      checkOutTime: checkOut,
      scheduledEndTime: '18:00',
      scheduledShiftDurationHours: 6,
    });

    expect(result.isEarlyDeparture).toBe(false);
    expect(result.requiresNotes).toBe(false);
    expect(result.validatedDurationHours).toBe(6);
    expect(result.earlyMinutes).toBe(0);
  });

  it('Scenario 2: Checkout at 17:30 right when window opens receives full credit without notes', async () => {
    const checkIn = new Date('2026-10-19T12:00:00');
    const checkOut = new Date('2026-10-19T17:30:00'); // 30 mins before end

    const result = await service.evaluateCheckOutTiming({
      checkInTime: checkIn,
      checkOutTime: checkOut,
      scheduledEndTime: '18:00',
      scheduledShiftDurationHours: 6,
    });

    expect(result.isEarlyDeparture).toBe(false);
    expect(result.requiresNotes).toBe(false);
    expect(result.validatedDurationHours).toBe(6);
  });

  it('Scenario 3: Early checkout at 15:00 (outside window) marks early departure and requires notes with actual 3.00 hours', async () => {
    const checkIn = new Date('2026-10-19T12:00:00');
    const checkOut = new Date('2026-10-19T15:00:00'); // 3 hours before end

    const result = await service.evaluateCheckOutTiming({
      checkInTime: checkIn,
      checkOutTime: checkOut,
      scheduledEndTime: '18:00',
      scheduledShiftDurationHours: 6,
    });

    expect(result.isEarlyDeparture).toBe(true);
    expect(result.requiresNotes).toBe(true);
    expect(result.validatedDurationHours).toBe(3);
    expect(result.earlyMinutes).toBe(180);
  });

  it('Scenario 4: Early checkout at 15:45 marks early departure and validates exactly 3.75 hours', async () => {
    const checkIn = new Date('2026-10-19T12:00:00');
    const checkOut = new Date('2026-10-19T15:45:00');

    const result = await service.evaluateCheckOutTiming({
      checkInTime: checkIn,
      checkOutTime: checkOut,
      scheduledEndTime: '18:00',
      scheduledShiftDurationHours: 6,
    });

    expect(result.isEarlyDeparture).toBe(true);
    expect(result.requiresNotes).toBe(true);
    expect(result.validatedDurationHours).toBe(3.75);
    expect(result.earlyMinutes).toBe(135);
  });

  it('Scenario 5: Night shift (18:00 to 00:00) checkout at 23:35 inside window receives full credit', async () => {
    const checkIn = new Date('2026-10-19T18:00:00');
    const checkOut = new Date('2026-10-19T23:35:00'); // 25 mins before midnight

    const result = await service.evaluateCheckOutTiming({
      checkInTime: checkIn,
      checkOutTime: checkOut,
      scheduledEndTime: '00:00',
      scheduledShiftDurationHours: 6,
    });

    expect(result.isEarlyDeparture).toBe(false);
    expect(result.requiresNotes).toBe(false);
    expect(result.validatedDurationHours).toBe(6);
  });

  it('Scenario 6: Night shift early checkout at 21:00 marks early departure with 3.00 hours', async () => {
    const checkIn = new Date('2026-10-19T18:00:00');
    const checkOut = new Date('2026-10-19T21:00:00');

    const result = await service.evaluateCheckOutTiming({
      checkInTime: checkIn,
      checkOutTime: checkOut,
      scheduledEndTime: '00:00',
      scheduledShiftDurationHours: 6,
    });

    expect(result.isEarlyDeparture).toBe(true);
    expect(result.requiresNotes).toBe(true);
    expect(result.validatedDurationHours).toBe(3);
  });
});
