import {
  CLINIC_TIMEZONE,
  INDO_DAYS,
  INDO_MONTHS,
  INDO_MONTHS_SHORT,
} from '../constants/schedule.constants';
import {
  type AdminDoctorDailySession,
  ScheduleOperationalStatus,
} from '../entities/schedule.entity';

export function formatIndoDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = INDO_DAYS[dt.getUTCDay()];
  const monthName = INDO_MONTHS_SHORT[m - 1] || '';
  return `${dayName}, ${d} ${monthName} ${y}`;
}

export function formatIndoMonthYear(
  year: number,
  month1Indexed: number,
): string {
  const mName = INDO_MONTHS[month1Indexed - 1] || '';
  return `${mName} ${year}`;
}

export function computeUpcomingSchedule(
  targetDate: string,
  todayStr: string,
  sesiHarian: AdminDoctorDailySession[],
  isCuti: boolean,
): string {
  if (isCuti) return 'Cuti Dokter';
  if (!sesiHarian || sesiHarian.length === 0) return 'Tidak Ada Jadwal';
  const anyOpen = sesiHarian.some(
    (s) => s.status_sesi !== ScheduleOperationalStatus.CLOSED,
  );
  if (!anyOpen) return 'Praktik Ditutup';

  if (targetDate > todayStr) {
    const first = sesiHarian[0];
    return `${first.nama_sesi} (${first.waktu})`;
  }

  if (targetDate < todayStr) {
    const last = sesiHarian[sesiHarian.length - 1];
    return `${last.nama_sesi} (${last.waktu}) - Selesai`;
  }

  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = currentHours * 60 + now.getMinutes();

  const toMinutes = (timeStr: string) => {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const activeSession = sesiHarian.find((s) => {
    const startM = toMinutes(s.jam_mulai);
    const endM = toMinutes(s.jam_selesai);
    return (
      s.status_sesi !== ScheduleOperationalStatus.CLOSED &&
      startM <= currentMinutes &&
      currentMinutes <= endM
    );
  });
  if (activeSession) {
    return `${activeSession.nama_sesi} (${activeSession.waktu}) - Sedang Berlangsung`;
  }

  const upcomingSessions = sesiHarian
    .filter(
      (s) =>
        s.status_sesi !== ScheduleOperationalStatus.CLOSED &&
        toMinutes(s.jam_mulai) > currentMinutes,
    )
    .sort((a, b) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai));

  if (upcomingSessions.length > 0) {
    const next = upcomingSessions[0];
    return `${next.nama_sesi} (${next.waktu})`;
  }

  const lastSession = sesiHarian[sesiHarian.length - 1];
  return `${lastSession.nama_sesi} (${lastSession.waktu}) - Selesai`;
}

export function getClinicNow(refDate?: Date): {
  date: string;
  time: string;
  currentMinutes: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
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
