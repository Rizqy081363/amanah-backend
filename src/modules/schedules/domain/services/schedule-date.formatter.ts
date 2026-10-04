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

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function formatClock(minutes: number): string {
  const h = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function formatSessionSlot(
  session: AdminDoctorDailySession,
  slotDurationMinutes: number,
): string {
  const startMin = toMinutes(session.jam_mulai);
  const endMin = Math.min(
    startMin + slotDurationMinutes,
    toMinutes(session.jam_selesai),
  );
  return `${session.nama_sesi} (${formatClock(startMin)} - ${formatClock(endMin)})`;
}

export function getNextDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10);
}

function resolveTomorrowSchedule(
  tomorrowSesiHarian: AdminDoctorDailySession[] | null | undefined,
  slotDurationMinutes: number,
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
  return `Besok, ${formatSessionSlot(openTomorrow[0], slotDurationMinutes)}`;
}

export function computeUpcomingSchedule(
  targetDate: string,
  todayStr: string,
  sesiHarian: AdminDoctorDailySession[],
  isCuti: boolean,
  slotDurationMinutes: number,
  tomorrowSesiHarian?: AdminDoctorDailySession[] | null,
  refDate?: Date,
): string {
  if (isCuti) return 'Cuti Dokter';
  if (!sesiHarian || sesiHarian.length === 0) return 'Tidak Ada Jadwal';
  const openSessions = sesiHarian
    .filter((s) => s.status_sesi !== ScheduleOperationalStatus.CLOSED)
    .sort((a, b) => toMinutes(a.jam_mulai) - toMinutes(b.jam_mulai));

  if (openSessions.length === 0) return 'Praktik Ditutup';

  if (targetDate > todayStr) {
    return formatSessionSlot(openSessions[0], slotDurationMinutes);
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
    const startM = toMinutes(activeSession.jam_mulai);
    const endM = toMinutes(activeSession.jam_selesai);
    const currentSlotIndex = Math.floor(
      (currentMinutes - startM) / slotDurationMinutes,
    );
    const nextSlotStartMin =
      startM + (currentSlotIndex + 1) * slotDurationMinutes;

    if (nextSlotStartMin < endM) {
      const nextSlotEndMin = Math.min(
        nextSlotStartMin + slotDurationMinutes,
        endM,
      );
      return `${activeSession.nama_sesi} (${formatClock(nextSlotStartMin)} - ${formatClock(nextSlotEndMin)})`;
    }

    const nextSession = openSessions[activeIndex + 1];
    if (nextSession) {
      return formatSessionSlot(nextSession, slotDurationMinutes);
    }
    return resolveTomorrowSchedule(tomorrowSesiHarian, slotDurationMinutes);
  }

  const upcomingSession = openSessions.find(
    (s) => toMinutes(s.jam_mulai) > currentMinutes,
  );

  if (upcomingSession) {
    return formatSessionSlot(upcomingSession, slotDurationMinutes);
  }

  return resolveTomorrowSchedule(tomorrowSesiHarian, slotDurationMinutes);
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
