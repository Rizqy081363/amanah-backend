import { Injectable, Optional } from '@nestjs/common';
import { ClinicSettingService } from '../../infrastructure/config/clinic-setting.service';
import {
  ClosureInterval,
  ExtraOpeningInterval,
  ScheduledShift,
  TimeInterval,
} from '../types/calendar.types';

@Injectable()
export class CalendarService {
  constructor(
    @Optional() private readonly settingReader?: ClinicSettingService,
  ) {}

  /**
   * Retrieves dynamic minimum open segment duration from PostgreSQL clinic_setting
   */
  async getMinSegmentMinutes(scope?: { categoryId?: string }): Promise<number> {
    if (this.settingReader) {
      try {
        return await this.settingReader.getNumber(
          'closure.min_open_segment_minutes',
          scope,
        );
      } catch {
        // Fallback if key missing
      }
    }
    return 15;
  }

  /**
   * Subtract closures from base intervals using half-open semantics [start, end).
   * Rule R7: Any remaining segment < minSegmentMinutes is considered closed.
   */
  subtractIntervals(
    base: TimeInterval[],
    closures: TimeInterval[],
    minSegmentMinutes: number = 15,
  ): TimeInterval[] {
    if (!closures.length) return [...base];

    let current = [...base];
    const minSegmentMs = minSegmentMinutes * 60_000;

    for (const c of closures) {
      const next: TimeInterval[] = [];
      const cStart = c.start.getTime();
      const cEnd = c.end.getTime();

      for (const b of current) {
        const bStart = b.start.getTime();
        const bEnd = b.end.getTime();

        // No overlap
        if (cEnd <= bStart || cStart >= bEnd) {
          next.push(b);
          continue;
        }

        // Left remainder [bStart, cStart)
        if (cStart > bStart) {
          next.push({
            start: new Date(bStart),
            end: new Date(Math.min(cStart, bEnd)),
          });
        }

        // Right remainder [cEnd, bEnd)
        if (cEnd < bEnd) {
          next.push({
            start: new Date(Math.max(cEnd, bStart)),
            end: new Date(bEnd),
          });
        }
      }

      current = next;
    }

    return current.filter(
      (i) => i.end.getTime() - i.start.getTime() >= minSegmentMs,
    );
  }

  /**
   * Merge overlapping or adjacent intervals
   */
  unionIntervals(intervals: TimeInterval[]): TimeInterval[] {
    if (!intervals.length) return [];

    const sorted = [...intervals].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );
    const result: TimeInterval[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const last = result[result.length - 1];
      const current = sorted[i];

      if (current.start.getTime() <= last.end.getTime()) {
        if (current.end.getTime() > last.end.getTime()) {
          last.end = current.end;
        }
      } else {
        result.push(current);
      }
    }

    return result;
  }

  /**
   * Checks if a timestamp falls within any open segment [start, end)
   */
  isOpen(timestamp: Date, effectiveSegments: TimeInterval[]): boolean {
    const t = timestamp.getTime();
    return effectiveSegments.some(
      (seg) => t >= seg.start.getTime() && t < seg.end.getTime(),
    );
  }

  /**
   * Returns the currently open or next upcoming open segment
   */
  nextOpen(
    timestamp: Date,
    effectiveSegments: TimeInterval[],
  ): TimeInterval | null {
    const t = timestamp.getTime();
    const sorted = [...effectiveSegments].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    for (const seg of sorted) {
      if (t < seg.end.getTime()) {
        return seg;
      }
    }

    return null;
  }

  /**
   * Returns the exact next open timestamp (Rule 2.2):
   * - If already open at timestamp, returns timestamp.
   * - If closed, returns the start of the next open segment.
   * - If no further open segments exist on that day, returns null.
   */
  nextOpenDate(
    timestamp: Date,
    effectiveSegments: TimeInterval[],
  ): Date | null {
    const t = timestamp.getTime();
    const sorted = [...effectiveSegments].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    for (const seg of sorted) {
      if (t >= seg.start.getTime() && t < seg.end.getTime()) {
        return timestamp;
      }
      if (t < seg.start.getTime()) {
        return seg.start;
      }
    }

    return null;
  }

  /**
   * Computes effective open segments for a specific date and category
   */
  async effectiveOpenSegments(params: {
    dateStr: string; // YYYY-MM-DD
    categoryId?: string | null;
    doctorId?: string | null;
    roomId?: string | null;
    schedules: ScheduledShift[];
    closures: ClosureInterval[];
    extras: ExtraOpeningInterval[];
    minSegmentMinutes?: number;
  }): Promise<TimeInterval[]> {
    const {
      dateStr,
      categoryId,
      doctorId,
      roomId,
      schedules,
      closures,
      extras,
      minSegmentMinutes,
    } = params;

    const minSeg =
      minSegmentMinutes ??
      (await this.getMinSegmentMinutes({
        categoryId: categoryId || undefined,
      }));

    // 1. Convert active schedules for this day-of-week to TimeIntervals
    const targetDate = new Date(`${dateStr}T00:00:00.000Z`);
    const dow = targetDate.getUTCDay();

    const daySchedules = schedules.filter((s) => s.dow === dow && s.isActive);
    const baseIntervals: TimeInterval[] = daySchedules.map((s) => {
      const [sH, sM] = s.startsAt.split(':').map(Number);
      const [eH, eM] = s.endsAt.split(':').map(Number);

      const start = new Date(targetDate);
      start.setUTCHours(sH, sM, 0, 0);

      const end = new Date(targetDate);
      end.setUTCHours(eH, eM, 0, 0);

      return { start, end };
    });

    // 2. Filter closures affecting this scope
    const activeClosures = closures
      .filter((c) => !c.cancelledAt)
      .filter((c) => {
        if (c.scope === 'clinic') return true;
        if (c.scope === 'category' && categoryId && c.categoryId === categoryId)
          return true;
        if (c.scope === 'doctor' && doctorId && c.doctorId === doctorId)
          return true;
        if (c.scope === 'room' && roomId && c.roomId === roomId) return true;
        return false;
      })
      .map((c) => ({ start: c.startsAt, end: c.endsAt }));

    // 3. Subtract closures
    const remaining = this.subtractIntervals(
      baseIntervals,
      activeClosures,
      minSeg,
    );

    // 4. Add extra openings matching scope
    const matchingExtras = extras
      .filter(
        (e) => !e.categoryId || (categoryId && e.categoryId === categoryId),
      )
      .map((e) => ({ start: e.startsAt, end: e.endsAt }));

    // 5. Merge union
    return this.unionIntervals([...remaining, ...matchingExtras]);
  }
}
