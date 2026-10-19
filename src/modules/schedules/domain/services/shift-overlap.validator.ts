import { BadRequestException } from '@nestjs/common';
import { parseTimeToMinutes } from './shift-duration.helper';

export interface ShiftTimeInterval {
  id?: string;
  code?: string;
  label?: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  sortOrder?: number;
}

/**
 * Mengonversi waktu selesai shift ke menit sejak 00:00.
 * Menangani format 24:00 atau 00:00 (tengah malam pergantian hari) sebagai 1440 menit.
 */
export function parseTimeEndToMinutes(endsAt: string, startsAtMinutes = 0): number {
  if (!endsAt) return 0;
  const trimmed = endsAt.trim();
  if (trimmed.startsWith('24:')) {
    return 1440;
  }
  const min = parseTimeToMinutes(trimmed);
  // Jika berakhir di 00:00 dan shift mulai setelah siang (misal 18:00), maka 00:00 adalah midnight (1440 menit)
  if (min === 0 && startsAtMinutes >= 12 * 60) {
    return 1440;
  }
  return min;
}

/**
 * Memvalidasi konsistensi interval waktu dan memastikan tidak ada dua shift aktif
 * yang saling bertabrakan / tumpang tindih (overlap).
 *
 * Catatan Domain:
 * - Tabrakan (Overlap): DILARANG. max(startA, startB) < min(endA, endB)
 * - Jeda/Tutup Sementara (Gap): DIIZINKAN. endA <= startB (misal Pagi selesai 10:00, Siang mulai 12:00)
 */
export function validateSessionDefsNonOverlap(defs: ShiftTimeInterval[]): void {
  const activeDefs = defs
    .filter((d) => d.isActive)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // 1. Validasi internal setiap shift (startsAt < endsAt)
  for (const def of activeDefs) {
    const startMin = parseTimeToMinutes(def.startsAt);
    const endMin = parseTimeEndToMinutes(def.endsAt, startMin);
    const shiftLabel = def.label || def.code || 'Shift Operasional';

    if (startMin >= endMin) {
      throw new BadRequestException({
        code: 'INVALID_SHIFT_TIME_RANGE',
        message: `Shift '${shiftLabel}' memiliki jam mulai (${def.startsAt.slice(0, 5)}) yang sama atau lebih lambat dari jam selesai (${def.endsAt.slice(0, 5)}).`,
        metadata: {
          id: def.id,
          code: def.code,
          startsAt: def.startsAt,
          endsAt: def.endsAt,
        },
      });
    }
  }

  if (activeDefs.length <= 1) return;

  // 2. Validasi tabrakan antar-shift aktif (Pairwise interval overlap)
  for (let i = 0; i < activeDefs.length; i++) {
    for (let j = i + 1; j < activeDefs.length; j++) {
      const a = activeDefs[i];
      const b = activeDefs[j];

      const aStart = parseTimeToMinutes(a.startsAt);
      const aEnd = parseTimeEndToMinutes(a.endsAt, aStart);

      const bStart = parseTimeToMinutes(b.startsAt);
      const bEnd = parseTimeEndToMinutes(b.endsAt, bStart);

      const overlapStart = Math.max(aStart, bStart);
      const overlapEnd = Math.min(aEnd, bEnd);

      if (overlapStart < overlapEnd) {
        const overlapMinutes = overlapEnd - overlapStart;
        const labelA = a.label || a.code || 'Shift A';
        const labelB = b.label || b.code || 'Shift B';

        throw new BadRequestException({
          code: 'SHIFT_OVERLAP_CONFLICT',
          message: `Shift '${labelA}' (${a.startsAt.slice(0, 5)} - ${a.endsAt.slice(0, 5)}) bertabrakan dengan Shift '${labelB}' (${b.startsAt.slice(0, 5)} - ${b.endsAt.slice(0, 5)}). Jam shift operasional tidak boleh saling tumpang tindih.`,
          metadata: {
            shiftA: { id: a.id, code: a.code, label: labelA, startsAt: a.startsAt, endsAt: a.endsAt },
            shiftB: { id: b.id, code: b.code, label: labelB, startsAt: b.startsAt, endsAt: b.endsAt },
            overlapMinutes,
          },
        });
      }
    }
  }
}

/**
 * Memvalidasi bahwa pada hari yang sama (DOW), template jadwal mingguan yang aktif
 * tidak saling tumpang tindih (overlap).
 */
export function validateWeeklyTemplatesNonOverlap(
  templates: Array<{
    sessionId: string;
    dow: number;
    startsAt: string;
    endsAt: string;
    isActive: boolean;
  }>,
): void {
  // Kelompokkan per DOW (0..6)
  const byDow = new Map<number, typeof templates>();
  for (const t of templates) {
    if (!t.isActive) continue;
    const list = byDow.get(t.dow) || [];
    list.push(t);
    byDow.set(t.dow, list);
  }

  for (const [dow, dayTemplates] of byDow.entries()) {
    if (dayTemplates.length <= 1) continue;

    for (let i = 0; i < dayTemplates.length; i++) {
      for (let j = i + 1; j < dayTemplates.length; j++) {
        const a = dayTemplates[i];
        const b = dayTemplates[j];

        const aStart = parseTimeToMinutes(a.startsAt);
        const aEnd = parseTimeEndToMinutes(a.endsAt, aStart);
        const bStart = parseTimeToMinutes(b.startsAt);
        const bEnd = parseTimeEndToMinutes(b.endsAt, bStart);

        if (Math.max(aStart, bStart) < Math.min(aEnd, bEnd)) {
          throw new BadRequestException({
            code: 'WEEKLY_TEMPLATE_OVERLAP_CONFLICT',
            message: `Jadwal mingguan pada hari ke-${dow} memiliki shift yang saling bertabrakan (${a.startsAt.slice(0, 5)} - ${a.endsAt.slice(0, 5)} dan ${b.startsAt.slice(0, 5)} - ${b.endsAt.slice(0, 5)}).`,
            metadata: {
              dow,
              sessionIdA: a.sessionId,
              sessionIdB: b.sessionId,
            },
          });
        }
      }
    }
  }
}
