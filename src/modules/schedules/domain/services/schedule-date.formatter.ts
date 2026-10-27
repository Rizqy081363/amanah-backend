export type DateDisplayFormatStyle =
  | 'human_full'
  | 'human_medium'
  | 'human_short'
  | 'iso';

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
