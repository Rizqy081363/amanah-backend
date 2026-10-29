import { parseTimeToMinutes } from './shift-duration.helper';

export interface ChronologicalSessionCandidate {
  id?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  defaultStartsAt?: string | null;
  defaultEndsAt?: string | null;
  code?: string | null;
  label?: string | null;
  sortOrder?: number | null;
}

/**
 * Mengonversi waktu selesai shift ke menit sejak 00:00.
 * Menangani format 24:00 atau 00:00 (pergantian hari) sebagai 1440 menit jika shift mulai setelah siang.
 */
export function parseSessionEndToMinutes(
  timeStr?: string | null,
  startsAtMinutes = 0,
): number {
  if (!timeStr) return 0;
  const trimmed = timeStr.trim();
  if (trimmed.startsWith('24:')) {
    return 1440;
  }
  const min = parseTimeToMinutes(trimmed);
  if (min === 0 && startsAtMinutes >= 12 * 60) {
    return 1440;
  }
  return min;
}

/**
 * Pembanding kronologis deterministik murni untuk dua sesi/shift operasional.
 * Mengurutkan berdasarkan:
 * 1. Jam mulai (paling awal = lebih dulu)
 * 2. Jam selesai (paling cepat = lebih dulu jika jam mulai identik)
 * 3. Kode / Label alfabetis sebagai tie-breaker penentu
 */
export function compareSessionChronology(
  a: ChronologicalSessionCandidate,
  b: ChronologicalSessionCandidate,
): number {
  const aStartRaw = a.startsAt || a.defaultStartsAt || '';
  const bStartRaw = b.startsAt || b.defaultStartsAt || '';

  const aStartMin = parseTimeToMinutes(aStartRaw);
  const bStartMin = parseTimeToMinutes(bStartRaw);

  if (aStartMin !== bStartMin) {
    return aStartMin - bStartMin;
  }

  const aEndRaw = a.endsAt || a.defaultEndsAt || '';
  const bEndRaw = b.endsAt || b.defaultEndsAt || '';

  const aEndMin = parseSessionEndToMinutes(aEndRaw, aStartMin);
  const bEndMin = parseSessionEndToMinutes(bEndRaw, bStartMin);

  if (aEndMin !== bEndMin) {
    return aEndMin - bEndMin;
  }

  const aIdentifier = (a.code || a.label || '').toLowerCase();
  const bIdentifier = (b.code || b.label || '').toLowerCase();
  return aIdentifier.localeCompare(bIdentifier);
}

/**
 * Mengurutkan koleksi sesi secara kronologis murni.
 */
export function sortSessionsChronologically<
  T extends ChronologicalSessionCandidate,
>(sessions: T[]): T[] {
  return [...sessions].sort(compareSessionChronology);
}

/**
 * Menata ulang dan menormalisasi urutan sortOrder (1, 2, 3...)
 * sesuai dengan urutan kronologis waktu operasional sebenarnya.
 */
export function reassignChronologicalSortOrders<
  T extends ChronologicalSessionCandidate,
>(sessions: T[]): (T & { sortOrder: number })[] {
  const sorted = sortSessionsChronologically(sessions);
  return sorted.map((session, index) => ({
    ...session,
    sortOrder: index + 1,
  }));
}
