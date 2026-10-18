import { Inject, Injectable } from '@nestjs/common';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';

export interface CalculatedMetrics {
  totalStaffCount: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendanceRate: number;
  sparklineTotal: Array<{ label: string; value: number }>;
  sparklinePresent: Array<{ label: string; value: number }>;
  sparklineAbsent: Array<{ label: string; value: number }>;
  sparklineRate: Array<{ label: string; value: number }>;
}

@Injectable()
export class AttendanceMetricsCalculator {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
  ) {}

  async calculateMetrics(params: {
    targetDate: string;
    dow: number;
    attendanceList: any[];
  }): Promise<CalculatedMetrics> {
    const { targetDate, dow, attendanceList } = params;

    // 1. Expected rostered staff count from database for this DOW
    const scheduledStaffCount =
      await this.repo.findScheduledStaffCountByDow(dow);

    const totalStaffCount =
      scheduledStaffCount > 0
        ? Math.max(scheduledStaffCount, attendanceList.length)
        : attendanceList.length;

    // 2. Count actual attendees
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;

    for (const rec of attendanceList) {
      if (rec.status === 'present') {
        presentCount++;
      } else if (rec.status === 'late') {
        presentCount++;
        lateCount++;
      } else {
        absentCount++;
      }
    }

    const expectedAbsentCount = Math.max(0, totalStaffCount - presentCount);
    const attendanceRate =
      totalStaffCount > 0
        ? Math.round((presentCount / totalStaffCount) * 100)
        : 0;

    // 3. 7-Day Trend Sparklines: Fetch master_day from DB & actual historical records
    const masterDays = await this.repo.getMasterDays();
    // Sort Monday (sort_order: 1) to Sunday (sort_order: 7)
    masterDays.sort((a, b) => a.sortOrder - b.sortOrder);

    // Calculate start date (Monday of the target week)
    const targetObj = new Date(targetDate + 'T12:00:00Z');
    const dayOfWeek = targetObj.getDay(); // 0 (Sun) .. 6 (Sat)
    const distanceToMonday = (dayOfWeek + 6) % 7; // Monday = 0, Sun = 6
    const mondayObj = new Date(targetObj);
    mondayObj.setDate(mondayObj.getDate() - distanceToMonday);

    const sundayObj = new Date(mondayObj);
    sundayObj.setDate(sundayObj.getDate() + 6);

    const startDateStr = mondayObj.toISOString().split('T')[0];
    const endDateStr = sundayObj.toISOString().split('T')[0];

    const weeklyCounts = await this.repo.findWeeklyAttendanceCounts(
      startDateStr,
      endDateStr,
    );

    const sparklinePresent: Array<{ label: string; value: number }> = [];
    const sparklineTotal: Array<{ label: string; value: number }> = [];
    const sparklineAbsent: Array<{ label: string; value: number }> = [];
    const sparklineRate: Array<{ label: string; value: number }> = [];

    for (let i = 0; i < 7; i++) {
      const curDate = new Date(mondayObj);
      curDate.setDate(curDate.getDate() + i);
      const curDateStr = curDate.toISOString().split('T')[0];
      const curDow = curDate.getDay();

      const masterDay = masterDays.find((m) => m.dow === curDow);
      const label = masterDay?.shortNameId || `H-${i + 1}`;

      const counts = weeklyCounts.get(curDateStr) || {
        presentCount: curDateStr === targetDate ? presentCount : 0,
        lateCount: curDateStr === targetDate ? lateCount : 0,
      };

      const dayPresent = counts.presentCount + counts.lateCount;
      const dayTotal = totalStaffCount;
      const dayAbsent = Math.max(0, dayTotal - dayPresent);
      const dayRate =
        dayTotal > 0 ? Math.round((dayPresent / dayTotal) * 100) : 0;

      sparklinePresent.push({ label, value: dayPresent });
      sparklineTotal.push({ label, value: dayTotal });
      sparklineAbsent.push({ label, value: dayAbsent });
      sparklineRate.push({ label, value: dayRate });
    }

    return {
      totalStaffCount,
      presentCount,
      absentCount: expectedAbsentCount,
      lateCount,
      attendanceRate,
      sparklineTotal,
      sparklinePresent,
      sparklineAbsent,
      sparklineRate,
    };
  }
}
