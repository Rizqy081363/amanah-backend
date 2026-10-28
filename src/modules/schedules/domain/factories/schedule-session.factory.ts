import { UnprocessableEntityException } from '@nestjs/common';
import { formatClockTime, parseClockTime } from '../schedule-projection';

export type SessionShiftType = string;

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

export class ScheduleSessionFactory {
  /**
   * Resolves a shift definition by contextId, shift name, or alias.
   * Driven dynamically by definitions passed from DB session_def.
   */
  static resolveShiftDefinition(
    shiftOrContextId: string,
    customDefs?: ShiftDefinition[],
  ): ShiftDefinition {
    const list = customDefs || [];
    const normalized = (shiftOrContextId || '').trim().toLowerCase();
    const found = list.find(
      (def) =>
        def.shift.toLowerCase() === normalized ||
        def.contextId.toLowerCase() === normalized ||
        def.aliases.some((a) => a.toLowerCase() === normalized),
    );

    if (!found) {
      if (list.length > 0) return list[0];
      // Cold-start fallback: return a dynamic single-shift container when no definitions exist in DB
      return {
        shift: shiftOrContextId || 'default',
        sessionShift: shiftOrContextId || 'default',
        contextId: shiftOrContextId || 'default',
        label: shiftOrContextId || 'Sesi',
        contextLabel: shiftOrContextId || 'Sesi',
        boundaryStartMinutes: 0,
        boundaryEndMinutes: 1440,
        boundaryStartTime: '00:00',
        boundaryEndTime: '24:00',
        aliases: [shiftOrContextId],
      };
    }

    return found;
  }

  /**
   * Resolves the corresponding shift dynamically from a clock time (HH:mm).
   */
  static resolveShiftFromClockTime(
    clockTime: string,
    customDefs?: ShiftDefinition[],
  ): ShiftDefinition {
    const list = customDefs || [];
    const minutes = parseClockTime(clockTime);
    const found = list.find(
      (def) =>
        minutes >= def.boundaryStartMinutes && minutes < def.boundaryEndMinutes,
    );
    if (found) return found;
    if (list.length > 0) return list[0];
    return {
      shift: 'default',
      sessionShift: 'default',
      contextId: 'default',
      label: 'Sesi',
      contextLabel: 'Sesi',
      boundaryStartMinutes: 0,
      boundaryEndMinutes: 1440,
      boundaryStartTime: '00:00',
      boundaryEndTime: '24:00',
      aliases: [],
    };
  }

  /**
   * Factory calculation for session timing.
   */
  static calculateSessionTiming(
    context: ShiftDefinition,
    selectedStartTime: string,
    policy: { durationMinutes: number; startPrecisionMinutes?: number },
    options?: {
      endTime?: string;
      fillShift?: boolean;
    },
  ): {
    startMinutes: number;
    endMinutes: number;
    endTime: string;
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
    } else if (options?.fillShift === true) {
      endMinutes = boundaryEnd;
    } else {
      endMinutes = Math.min(boundaryEnd, startMinutes + durationMinutes);
    }

    return {
      startMinutes,
      endMinutes,
      endTime: formatClockTime(endMinutes),
    };
  }

  /**
   * Factory function to dynamically create showcase or default session parameters
   * for seeders or automated scheduling, avoiding hardcoded time literals.
   */
  static createSessionTemplate(
    shift: SessionShiftType,
    customDefs?: ShiftDefinition[],
  ): {
    label: string;
    shift: SessionShiftType;
    startTime: string;
    endTime: string;
  } {
    const def = ScheduleSessionFactory.resolveShiftDefinition(shift, customDefs);

    return {
      label: def.label,
      shift: def.shift,
      startTime: def.boundaryStartTime,
      endTime: def.boundaryEndTime,
    };
  }

  /**
   * Calculates canonical session metadata and booked metrics using pure math and domain rules.
   */
  static calculateSessionMetrics(params: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
    bookedCount: number;
    isOnLeave?: boolean;
    isClosed?: boolean;
    customDefs?: ShiftDefinition[];
  }): {
    shift: SessionShiftType;
    sessionLabel: string;
    bookedCount: number;
  } {
    const shiftDef = ScheduleSessionFactory.resolveShiftFromClockTime(
      params.startTime,
      params.customDefs,
    );

    return {
      shift: shiftDef.shift,
      sessionLabel: shiftDef.label,
      bookedCount: params.bookedCount || 0,
    };
  }
}
