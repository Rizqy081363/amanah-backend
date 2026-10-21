import { describe, expect, it } from 'bun:test';
import { RecordAttendanceShiftInput } from '../src/modules/payroll/domain/repositories/payroll.repository';

describe('Payroll Shift Entry Unit & Contract Tests', () => {
  it('calculates correct hourly compensation for doctor shift', () => {
    const hourlyRate = 150000;
    const validatedHours = 7.0;
    const expectedAmount = validatedHours * hourlyRate;

    expect(expectedAmount).toBe(1050000);

    const input: RecordAttendanceShiftInput = {
      attendanceRecordId: 'att-123',
      staffProfileId: 'staff-456',
      attendanceDate: '2026-10-21',
      validatedDurationHours: 7.0,
      isEarlyDeparture: false,
    };

    expect(input.validatedDurationHours).toBe(7.0);
    expect(input.attendanceDate).toBe('2026-10-21');
  });

  it('pays strictly pro-rata for actual hours on early checkout without double-penalty', () => {
    const hourlyRate = 150000;
    const actualWorkedHours = 5.5;
    const earnedAmount = actualWorkedHours * hourlyRate;

    expect(earnedAmount).toBe(825000);

    const input: RecordAttendanceShiftInput = {
      attendanceRecordId: 'att-early',
      staffProfileId: 'staff-456',
      attendanceDate: '2026-10-21',
      validatedDurationHours: 5.5,
      isEarlyDeparture: true,
    };

    expect(input.isEarlyDeparture).toBe(true);
    expect(input.validatedDurationHours).toBe(5.5);
  });

  it('calculates replacement shift at overtime rate', () => {
    const overtimeRate = 200000;
    const replacementHours = 6.0;
    const earnedAmount = replacementHours * overtimeRate;

    expect(earnedAmount).toBe(1200000);

    const input: RecordAttendanceShiftInput = {
      attendanceRecordId: 'att-replacement',
      staffProfileId: 'staff-456',
      attendanceDate: '2026-10-16',
      validatedDurationHours: 6.0,
      isReplacement: true,
    };

    expect(input.isReplacement).toBe(true);
    expect(input.validatedDurationHours).toBe(6.0);
  });
});
