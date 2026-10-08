import { UnprocessableEntityException } from '@nestjs/common';
import { formatClockTime, parseClockTime } from '../schedule-projection';

export type SessionShiftType =
  | 'early_morning'
  | 'morning'
  | 'afternoon'
  | 'night';

export interface ShiftDefinition {
  shift: SessionShiftType;
  sessionShift: SessionShiftType;
  contextId: string;
  label: string;
  contextLabel: string;
  boundaryStartMinutes: number;
  boundaryEndMinutes: number;
  boundaryStartTime: string;
  boundaryEndTime: string;
  aliases: string[];
}

/**
 * 24-Hour Cycle divided cleanly into 4 equal shifts of 6 hours (360 minutes) each.
 * Dini Hari: 00:00 - 06:00
 * Pagi:      06:00 - 12:00
 * Siang:     12:00 - 18:00
 * Malam:     18:00 - 24:00
 */
export const SHIFT_DEFINITIONS: ShiftDefinition[] = [
  {
    shift: 'early_morning',
    sessionShift: 'early_morning',
    contextId: 'early_morning',
    label: 'Dini Hari',
    contextLabel: 'Dini Hari',
    boundaryStartMinutes: 0,
    boundaryEndMinutes: 360,
    boundaryStartTime: '00:00',
    boundaryEndTime: '06:00',
    aliases: ['dini_hari', 'dini hari', 'early_morning'],
  },
  {
    shift: 'morning',
    sessionShift: 'morning',
    contextId: 'morning',
    label: 'Pagi',
    contextLabel: 'Pagi',
    boundaryStartMinutes: 360,
    boundaryEndMinutes: 720,
    boundaryStartTime: '06:00',
    boundaryEndTime: '12:00',
    aliases: ['pagi', 'morning'],
  },
  {
    shift: 'afternoon',
    sessionShift: 'afternoon',
    contextId: 'afternoon',
    label: 'Siang',
    contextLabel: 'Siang',
    boundaryStartMinutes: 720,
    boundaryEndMinutes: 1080,
    boundaryStartTime: '12:00',
    boundaryEndTime: '18:00',
    aliases: ['siang', 'sore', 'afternoon'],
  },
  {
    shift: 'night',
    sessionShift: 'night',
    contextId: 'night',
    label: 'Malam',
    contextLabel: 'Malam',
    boundaryStartMinutes: 1080,
    boundaryEndMinutes: 1440,
    boundaryStartTime: '18:00',
    boundaryEndTime: '24:00',
    aliases: ['malam', 'night'],
  },
];

export class ScheduleSessionFactory {
  /**
   * Resolves a shift definition by contextId, shift name, or alias.
   */
  static resolveShiftDefinition(shiftOrContextId: string): ShiftDefinition {
    const normalized = (shiftOrContextId || '').trim().toLowerCase();
    const found = SHIFT_DEFINITIONS.find(
      (def) =>
        def.shift === normalized ||
        def.contextId === normalized ||
        def.aliases.includes(normalized),
    );

    if (!found) {
      throw new UnprocessableEntityException({
        code: 'SCHEDULE_CONTEXT_NOT_FOUND',
        message: 'Konteks jadwal yang dipilih tidak tersedia.',
        metadata: {
          scheduleContextId: shiftOrContextId,
          supportedContextIds: SHIFT_DEFINITIONS.map((def) => def.contextId),
        },
      });
    }

    return found;
  }

  /**
   * Resolves the corresponding shift dynamically from a clock time (HH:mm).
   */
  static resolveShiftFromClockTime(clockTime: string): ShiftDefinition {
    const minutes = parseClockTime(clockTime);
    const found = SHIFT_DEFINITIONS.find(
      (def) =>
        minutes >= def.boundaryStartMinutes && minutes < def.boundaryEndMinutes,
    );
    return found || SHIFT_DEFINITIONS[0];
  }

  /**
   * Calculates session capacity dynamically from time range and duration.
   */
  static calculateCapacity(
    startTime: string,
    endTime: string,
    durationMinutes: number,
  ): number {
    const startMin = parseClockTime(startTime);
    const endMin = parseClockTime(endTime);
    const validDuration = durationMinutes > 0 ? durationMinutes : 30;
    const available = endMin - startMin;
    if (available <= 0) return 0;
    return Math.floor(available / validDuration);
  }

  /**
   * Factory calculation for session timing and capacity.
   */
  static calculateSessionTiming(
    context: ShiftDefinition,
    selectedStartTime: string,
    policy: { durationMinutes: number; startPrecisionMinutes?: number },
    options?: {
      endTime?: string;
      slotsCount?: number;
      fillShift?: boolean;
    },
  ): {
    startMinutes: number;
    endMinutes: number;
    endTime: string;
    capacity: number;
    remainingShiftSlots: number;
  } {
    const startMinutes = parseClockTime(selectedStartTime);
    const boundaryStart = context.boundaryStartMinutes;
    const boundaryEnd = context.boundaryEndMinutes;
    const durationMinutes =
      policy.durationMinutes > 0 ? policy.durationMinutes : 30;
    const precisionMinutes = policy.startPrecisionMinutes || 1;

    if (startMinutes < boundaryStart || startMinutes >= boundaryEnd) {
      throw new UnprocessableEntityException({
        code: 'START_OUTSIDE_BOUNDARY',
        message: 'Jam mulai berada di luar batas konteks jadwal yang dipilih.',
        metadata: {
          selectedStartTime,
          boundaryStartTime: context.boundaryStartTime,
          boundaryEndTime: context.boundaryEndTime,
        },
      });
    }

    if ((startMinutes - boundaryStart) % precisionMinutes !== 0) {
      throw new UnprocessableEntityException({
        code: 'INVALID_START_PRECISION',
        message: 'Jam mulai tidak sesuai presisi menit yang diizinkan backend.',
        metadata: {
          selectedStartTime,
          allowedStartPrecisionMinutes: precisionMinutes,
        },
      });
    }

    let endMinutes: number;
    let capacity: number;

    if (options?.endTime) {
      const parsedEnd = parseClockTime(options.endTime);
      if (parsedEnd <= startMinutes || parsedEnd > boundaryEnd) {
        throw new UnprocessableEntityException({
          code: 'END_OUTSIDE_BOUNDARY',
          message:
            'Jam selesai harus lebih besar dari jam mulai dan tidak melebihi batas shift.',
          metadata: {
            selectedStartTime,
            endTime: options.endTime,
            boundaryEndTime: context.boundaryEndTime,
          },
        });
      }
      endMinutes = parsedEnd;
      capacity = Math.floor((endMinutes - startMinutes) / durationMinutes);
    } else if (options?.slotsCount && options.slotsCount > 0) {
      endMinutes = startMinutes + options.slotsCount * durationMinutes;
      if (endMinutes > boundaryEnd) {
        throw new UnprocessableEntityException({
          code: 'SLOTS_EXCEED_BOUNDARY',
          message: 'Jumlah kuota yang diminta melebihi batas waktu shift.',
          metadata: {
            slotsCount: options.slotsCount,
            boundaryEndTime: context.boundaryEndTime,
          },
        });
      }
      capacity = options.slotsCount;
    } else if (options?.fillShift === true) {
      capacity = Math.floor((boundaryEnd - startMinutes) / durationMinutes);
      endMinutes = startMinutes + capacity * durationMinutes;
    } else {
      endMinutes = startMinutes + durationMinutes;
      if (endMinutes > boundaryEnd) {
        throw new UnprocessableEntityException({
          code: 'DURATION_LEAVES_NO_CAPACITY',
          message:
            'Jam mulai terlalu dekat dengan akhir shift untuk satu sesi konsultasi.',
          metadata: {
            selectedStartTime,
            boundaryEndTime: context.boundaryEndTime,
            effectiveConsultationDurationMinutes: durationMinutes,
          },
        });
      }
      capacity = 1;
    }

    if (capacity < 1) {
      throw new UnprocessableEntityException({
        code: 'DURATION_LEAVES_NO_CAPACITY',
        message:
          'Jam mulai dan durasi konsultasi tidak menyisakan kapasitas interval.',
        metadata: {
          selectedStartTime,
          boundaryEndTime: context.boundaryEndTime,
          effectiveConsultationDurationMinutes: durationMinutes,
        },
      });
    }

    const remainingShiftSlots = Math.max(
      0,
      Math.floor((boundaryEnd - endMinutes) / durationMinutes),
    );

    return {
      startMinutes,
      endMinutes,
      endTime: formatClockTime(endMinutes),
      capacity,
      remainingShiftSlots,
    };
  }

  /**
   * Factory function to dynamically create showcase or default session parameters
   * for seeders or automated scheduling, avoiding hardcoded time literals.
   */
  static createSessionTemplate(
    shift: SessionShiftType,
    durationMinutes: number,
    slotsCount?: number,
  ): {
    label: string;
    shift: SessionShiftType;
    startTime: string;
    endTime: string;
    capacity: number;
    availableSlots: number;
  } {
    const def = ScheduleSessionFactory.resolveShiftDefinition(shift);
    const validDuration = durationMinutes > 0 ? durationMinutes : 30;
    const maxCapacity = Math.floor(
      (def.boundaryEndMinutes - def.boundaryStartMinutes) / validDuration,
    );
    const capacity = Math.min(slotsCount || maxCapacity, maxCapacity);
    const endMinutes = def.boundaryStartMinutes + capacity * validDuration;

    return {
      label: def.label,
      shift: def.shift,
      startTime: def.boundaryStartTime,
      endTime: formatClockTime(endMinutes),
      capacity,
      availableSlots: capacity,
    };
  }

  /**
   * Calculates canonical capacity and load metrics for a session using pure math and domain rules.
   */
  static calculateSessionMetrics(params: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
    persistedCapacity?: number | null;
    persistedAvailableSlots?: number | null;
    bookedCount: number;
    isCuti?: boolean;
    isClosed?: boolean;
  }): {
    shift: SessionShiftType;
    sessionLabel: string;
    capacity: number;
    availableSlots: number;
    bookedCount: number;
    displaySlot: string;
  } {
    const shiftDef = ScheduleSessionFactory.resolveShiftFromClockTime(
      params.startTime,
    );
    const validDuration =
      params.durationMinutes > 0 ? params.durationMinutes : 30;
    const calculatedCapacity = ScheduleSessionFactory.calculateCapacity(
      params.startTime,
      params.endTime,
      validDuration,
    );
    const capacity =
      calculatedCapacity > 0
        ? calculatedCapacity
        : params.persistedCapacity && params.persistedCapacity > 0
          ? params.persistedCapacity
          : 1;

    const bookedCount =
      params.bookedCount > 0
        ? params.bookedCount
        : params.persistedAvailableSlots !== undefined &&
            params.persistedAvailableSlots !== null
          ? Math.max(0, capacity - params.persistedAvailableSlots)
          : 0;
    const availableSlots =
      params.isCuti || params.isClosed
        ? 0
        : params.persistedAvailableSlots !== undefined &&
            params.persistedAvailableSlots !== null &&
            params.bookedCount === 0
          ? params.persistedAvailableSlots
          : Math.max(0, capacity - bookedCount);
    const displaySlot = `${bookedCount} / ${capacity}`;

    return {
      shift: shiftDef.shift,
      sessionLabel: shiftDef.label,
      capacity,
      availableSlots,
      bookedCount,
      displaySlot,
    };
  }
}
