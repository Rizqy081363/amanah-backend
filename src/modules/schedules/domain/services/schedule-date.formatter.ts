import { Temporal } from '@js-temporal/polyfill';
import {
  INDO_DAYS,
  INDO_MONTHS,
  INDO_MONTHS_SHORT,
} from '../constants/schedule.constants';
import {
  type AdminDoctorDailySession,
  ScheduleOperationalStatus,
} from '../entities/schedule.entity';
import { SHIFT_DISPLAY_LABELS } from '../constants/schedule-shift.constants';

export type DateDisplayFormatStyle = 'human_full' | 'human_medium' | 'human_short' | 'iso';

export function formatIndoDate(
  dateStr: string,
  style: DateDisplayFormatStyle = 'human_full',
): string {
  if (!dateStr) return '';
  if (style === 'iso') return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(dt.getTime())) return dateStr;

  if (style === 'human_medium') {
    return dt.toLocaleDateString('id-ID', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
  if (style === 'human_short') {
    return dt.toLocaleDateString('id-ID', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return dt.toLocaleDateString('id-ID', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatIndoMonthYear(
  year: number,
  month1Indexed: number,
): string {
  const mName = INDO_MONTHS[month1Indexed - 1] || '';
  return `${mName} ${year}`;
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatClock(minutes: number): string {
  const h = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function formatSessionTiming(session: AdminDoctorDailySession): string {
  return `${session.nama_sesi} (${session.jam_mulai} - ${session.jam_selesai})`;
}

export function getNextDate(dateStr: string): string {
  return Temporal.PlainDate.from(dateStr).add({ days: 1 }).toString();
}

function resolveTomorrowSchedule(
  tomorrowSesiHarian: AdminDoctorDailySession[] | null | undefined,
): string {
  if (!tomorrowSesiHarian || tomorrowSesiHarian.length === 0) {
    return 'Selesai';
  }
  const openTomorrow = tomorrowSesiHarian
    .filter((s) => s.status_sesi !== ScheduleOperationalStatus.CLOSED)
    .sort((a, b) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai));

  if (openTomorrow.length === 0) {
    return 'Selesai';
  }
  return `Besok, ${formatSessionTiming(openTomorrow[0])}`;
}

export function computeUpcomingSchedule(
  targetDate: string,
  todayStr: string,
  sesiHarian: AdminDoctorDailySession[],
  isOnLeave: boolean,
  _durationMinutes?: number,
  tomorrowSesiHarian?: AdminDoctorDailySession[] | null,
  refDate?: Date,
): string {
  if (isOnLeave) return 'Dokter Cuti';
  if (!sesiHarian || sesiHarian.length === 0) return 'Tidak Ada Jadwal';
  const openSessions = sesiHarian
    .filter((s) => s.status_sesi !== ScheduleOperationalStatus.CLOSED)
    .sort((a, b) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai));

  if (openSessions.length === 0) return 'Praktik Ditutup';

  if (targetDate > todayStr) {
    return formatSessionTiming(openSessions[0]);
  }

  if (targetDate < todayStr) {
    return 'Selesai';
  }

  const { currentMinutes } = getClinicNow(refDate);

  const activeIndex = openSessions.findIndex((s) => {
    const startM = toMinutes(s.jam_mulai);
    const endM = toMinutes(s.jam_selesai);
    return startM <= currentMinutes && currentMinutes < endM;
  });

  if (activeIndex !== -1) {
    const activeSession = openSessions[activeIndex];
    return formatSessionTiming(activeSession);
  }

  const upcomingSession = openSessions.find(
    (s) => toMinutes(s.jam_mulai) > currentMinutes,
  );

  if (upcomingSession) {
    return formatSessionTiming(upcomingSession);
  }

  return resolveTomorrowSchedule(tomorrowSesiHarian);
}

export function getClinicNow(
  refDate?: Date,
  timeZone = process.env.CLINIC_TIMEZONE || 'UTC',
): {
  date: string;
  time: string;
  currentMinutes: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(refDate || new Date());
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  let hour = parts.find((p) => p.type === 'hour')?.value || '00';
  if (hour === '24') hour = '00';
  const minute = parts.find((p) => p.type === 'minute')?.value || '00';

  const date = `${year}-${month}-${day}`;
  const time = `${hour}:${minute}`;
  const currentMinutes = parseInt(hour, 10) * 60 + parseInt(minute, 10);
  return { date, time, currentMinutes };
}
