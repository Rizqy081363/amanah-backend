/**
 * Helper utilitas murni untuk kalkulasi durasi shift, waktu istirahat,
 * dan jam kerja bersih (net billable hours) untuk scheduling dan payroll.
 */

/**
 * Mengonversi format waktu 'HH:mm' atau 'HH:mm:ss' ke total menit sejak 00:00.
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

/**
 * Menghitung durasi kotor (gross hours) dari dua penanda waktu shift.
 * Menangani kasus pergantian hari (midnight crossing) dan format 24:00.
 */
export function calculateGrossHours(startsAt: string, endsAt: string): number {
  if (!startsAt || !endsAt) return 6.0; // Standard fallback jika data parsial

  const startMin = parseTimeToMinutes(startsAt);
  let endMin = parseTimeToMinutes(endsAt);

  // Khusus shift malam yang berakhir pada tengah malam: '24:00' atau '00:00'
  if (
    (endsAt.startsWith('24:') || endsAt.startsWith('00:')) &&
    startMin >= 12 * 60
  ) {
    endMin = 24 * 60;
  } else if (endMin <= startMin) {
    // Midnight cross (misal: mulai 22:00, selesai 06:00)
    endMin += 24 * 60;
  }

  const diffMin = Math.max(0, endMin - startMin);
  return Number((diffMin / 60).toFixed(2));
}

/**
 * Menghitung jam dinas bersih (net hours) yang diakui dan digaji setelah dikurangi istirahat.
 */
export function calculateSessionNetHours(params: {
  startsAt: string;
  endsAt: string;
  breakMinutes?: number;
  isBreakPaid?: boolean;
}): number {
  const { startsAt, endsAt, breakMinutes = 30, isBreakPaid = false } = params;

  const grossHours = calculateGrossHours(startsAt, endsAt);
  if (isBreakPaid || breakMinutes <= 0) {
    return grossHours;
  }

  const breakHours = breakMinutes / 60;
  // Menjamin batas minimal rasional jam dinas bersih 0.5 jam
  const netHours = Math.max(0.5, grossHours - breakHours);
  return Number(netHours.toFixed(2));
}
