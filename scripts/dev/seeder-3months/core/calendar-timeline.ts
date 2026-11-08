import type { TimelineDay } from '../types';

export function generate90DayTimeline(endDate: Date = new Date(), futureDays = 14): TimelineDay[] {
  const days: TimelineDay[] = [];
  const start = new Date(endDate);
  start.setDate(start.getDate() - 89); // 90 days inclusive (Day 0 to Day 89)

  const todayStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
  const totalDays = 90 + futureDays;

  for (let i = 0; i < totalDays; i++) {
    const cur = new Date(start);
    cur.setDate(start.getDate() + i);

    const year = cur.getFullYear();
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const dayOfWeek = cur.getDay(); // 0 is Sunday

    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const isFuture = dateStr > todayStr;

    days.push({
      date: dateStr,
      dayOfWeek,
      isWorkday: dayOfWeek !== 0, // Monday through Saturday
      dayIndex: i,
      isPast,
      isToday,
      isFuture,
    });
  }

  return days;
}

export interface PayrollPeriodSpan {
  name: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  status: 'finalized' | 'calculated';
}

export function generate3PayrollPeriods(endDate: Date = new Date()): PayrollPeriodSpan[] {
  // Generate 3 consecutive calendar months
  const periods: PayrollPeriodSpan[] = [];
  const curYear = endDate.getFullYear();
  const curMonth = endDate.getMonth(); // 0-based

  // Month -2, Month -1, Current Month
  const monthOffsets = [-2, -1, 0];
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  for (const offset of monthOffsets) {
    const targetDate = new Date(curYear, curMonth + offset, 1);
    const y = targetDate.getFullYear();
    const m = targetDate.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();

    const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const name = `Gaji Periode ${monthNames[m]} ${y}`;
    const status: 'finalized' | 'calculated' = offset < 0 ? 'finalized' : 'calculated';

    periods.push({
      name,
      start: startStr,
      end: endStr,
      status,
    });
  }

  return periods;
}
