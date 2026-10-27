/**
 * Helper utilitas murni domain untuk kalkulasi durasi shift, waktu istirahat,
 * dan jam kerja bersih (net billable hours) untuk scheduling dan penggajian.
 *
 * Menganut prinsip Functional Core: Murni matematis, bebas dependensi I/O,
 * dan deterministik. Nilai konfigurasi istirahat diinjeksikan secara dinamis
 * dari ClinicConfigService (tabel clinic_setting) oleh service pemanggil.
 */

/**
 * Batas minimum rasional durasi shift bersih (0.5 jam = 30 menit).
 * Mencegah hasil nol atau negatif apabila durasi istirahat melampaui jam dinas kotor.
 */
const MINIMUM_SESSION_NET_HOURS = 0.5;

const DEFAULT_SHIFT_GROSS_HOURS = 6.0;

const MINUTES_IN_AN_HOUR = 60;
const MIDDAY_MINUTES = 12 * MINUTES_IN_AN_HOUR;
const MIDNIGHT_MINUTES = 24 * MINUTES_IN_AN_HOUR;

export interface SessionNetHoursParams {
  startsAt: string;
  endsAt: string;
  breakMinutes?: number;
  isBreakPaid?: boolean;
}

/**
 * Mengonversi format waktu 'HH:mm' atau 'HH:mm:ss' ke total menit sejak 00:00.
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const hours = Number(parts[0]) || 0;
  const minutes = Number(parts[1]) || 0;
  return hours * MINUTES_IN_AN_HOUR + minutes;
}

/**
 * Menghitung durasi kotor (gross hours) dari dua penanda waktu shift.
 * Menangani kasus pergantian hari (midnight crossing) dan format 24:00.
 */
function calculateGrossHours(startsAt: string, endsAt: string): number {
  if (!startsAt || !endsAt) {
    return DEFAULT_SHIFT_GROSS_HOURS;
  }

  const startMin = parseTimeToMinutes(startsAt);
  let endMin = parseTimeToMinutes(endsAt);

  // Khusus shift malam yang berakhir pada tengah malam: '24:00' atau '00:00'
  if (
    (endsAt.startsWith('24:') || endsAt.startsWith('00:')) &&
    startMin >= MIDDAY_MINUTES
  ) {
    endMin = MIDNIGHT_MINUTES;
  } else if (endMin <= startMin) {
    // Penanganan midnight crossing (contoh: shift malam mulai 22:00, selesai 06:00)
    endMin += MIDNIGHT_MINUTES;
  }

  const diffMinutes = Math.max(0, endMin - startMin);
  return Number((diffMinutes / MINUTES_IN_AN_HOUR).toFixed(2));
}

/**
 * Menghitung jam dinas bersih (net billable hours) yang diakui dan digaji
 * setelah dikurangi alokasi waktu istirahat yang tidak dibayar (unpaid break).
 */
export function calculateSessionNetHours(params: SessionNetHoursParams): number {
  const {
    startsAt,
    endsAt,
    breakMinutes = 0,
    isBreakPaid = false,
  } = params;

  const grossHours = calculateGrossHours(startsAt, endsAt);

  // Jika istirahat tetap dibayar (paid break) atau tidak ada alokasi istirahat
  if (isBreakPaid || breakMinutes <= 0) {
    return grossHours;
  }

  const breakHours = breakMinutes / MINUTES_IN_AN_HOUR;
  const netHours = Math.max(
    MINIMUM_SESSION_NET_HOURS,
    grossHours - breakHours,
  );

  return Number(netHours.toFixed(2));
}
