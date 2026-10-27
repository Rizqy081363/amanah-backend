import { SHIFT_EXCEPTION_TYPE } from '@modules/appointments/domain/constants/appointment-lifecycle.constants';
import { ScheduleClosureReason } from '../entities/schedule.entity';
import {
  type SessionShiftType,
  SHIFT_DEFINITIONS,
} from '../factories/schedule-session.factory';

interface DoctorSessionAssignmentContext {
  id: string;
  doctorId: string;
  sessionId: string;
  dow: number | null;
  isActive: boolean;
  preferredRoomId?: string | null;
  preferredRoom?: any;
  sessionDef?: {
    id: string;
    code: string;
    labelKey?: string | null;
    isActive: boolean;
    defaultStartsAt?: string | null;
    defaultEndsAt?: string | null;
    schedules?: Array<{
      dow: number;
      isActive: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    }>;
  } | null;
}

interface DoctorSessionShiftExceptionContext {
  doctorId: string;
  serviceDate: string;
  sessionId?: string | null;
  type: string;
  note?: string | null;
}

export interface ResolveDoctorSessionOperabilityParams {
  targetDow: number;
  targetDate: string;
  doctorAssignment: DoctorSessionAssignmentContext;
  shiftExceptions?: DoctorSessionShiftExceptionContext[];
  isDayActive?: boolean;
}

export interface DoctorSessionOperabilityResult {
  isOperable: boolean;
  isOpen: boolean;
  status: 'open' | 'closed';
  closureReason: ScheduleClosureReason | null;
  notes: string | null;
  startTime: string;
  endTime: string;
  sessionShift: SessionShiftType;
  sessionLabel?: string | null;
}

/**
 * Filter doctor assignments for a given day-of-week.
 * If an explicit assignment (dow === targetDow) exists for a session,
 * it takes precedence over and shadows the generic assignment (dow === null).
 */
export function filterEffectiveDoctorAssignments<
  T extends {
    sessionId: string;
    dow: number | null;
    doctorId?: string;
    sessionDef?: { isActive?: boolean } | null;
  },
>(assignments: T[], targetDow: number): T[] {
  const explicit = assignments.filter((da) => da.dow === targetDow);
  const explicitKeys = new Set(
    explicit.map((da) =>
      da.doctorId ? `${da.doctorId}:${da.sessionId}` : da.sessionId,
    ),
  );

  const generic = assignments.filter((da) => {
    if (da.dow !== null) return false;
    const key = da.doctorId ? `${da.doctorId}:${da.sessionId}` : da.sessionId;
    return !explicitKeys.has(key);
  });

  return [...explicit, ...generic];
}

/**
 * Resolves doctor session operability based on the priority hierarchy:
 * 1. Master Shift Definition (sessionDef.isActive)
 * 2. Doctor Leave Exception (shiftExceptions)
 * 3. Explicit Doctor Roster Override (da.dow === targetDow)
 * 4. Clinic Day Operating Status (isDayActive === true)
 * 5. Generic Weekly Operational Template (da.dow === null -> sessionSchedules)
 */
export function resolveDoctorSessionOperability(
  params: ResolveDoctorSessionOperabilityParams,
): DoctorSessionOperabilityResult {
  const {
    targetDow,
    targetDate,
    doctorAssignment: da,
    shiftExceptions = [],
    isDayActive = true,
  } = params;

  const sessionDef = da.sessionDef;
  const isMasterDefActive = Boolean(sessionDef && sessionDef.isActive);

  const shiftCode = (sessionDef?.code || 'morning') as SessionShiftType;
  const shiftDef =
    SHIFT_DEFINITIONS.find((sd) => sd.shift === shiftCode) ||
    SHIFT_DEFINITIONS[1];

  const sched = sessionDef?.schedules?.find((s) => s.dow === targetDow);

  // Time resolution: weekly template schedule -> def default time -> shift boundary
  const rawStartTime =
    sched?.startsAt ||
    sessionDef?.defaultStartsAt ||
    shiftDef.boundaryStartTime;
  const rawEndTime =
    sched?.endsAt || sessionDef?.defaultEndsAt || shiftDef.boundaryEndTime;
  const startTime = rawStartTime.slice(0, 5);
  const endTime = rawEndTime.slice(0, 5);

  // Label resolution
  const sessionLabel = sessionDef?.labelKey;

  // 1. Master definition inactive: Shift does not operate anywhere in the clinic
  if (!isMasterDefActive) {
    return {
      isOperable: false,
      isOpen: false,
      status: 'closed',
      closureReason: ScheduleClosureReason.CLINIC_CLOSED,
      notes: 'Klinik Tutup',
      startTime,
      endTime,
      sessionShift: shiftCode,
      sessionLabel,
    };
  }

  // 2. Doctor Leave exception
  const exception = shiftExceptions.find(
    (se) =>
      se.doctorId === da.doctorId &&
      se.serviceDate === targetDate &&
      (!se.sessionId || se.sessionId === da.sessionId),
  );
  const isLeave = exception?.type === SHIFT_EXCEPTION_TYPE.LEAVE;

  if (isLeave) {
    return {
      isOperable: true,
      isOpen: false,
      status: 'closed',
      closureReason: ScheduleClosureReason.DOCTOR_LEAVE,
      notes: exception?.note || null,
      startTime,
      endTime,
      sessionShift: shiftCode,
      sessionLabel,
    };
  }

  // 3. Priority Resolution: Explicit Doctor Roster Override
  // If doctor has explicit assignment for this day of week (da.dow === targetDow),
  // the roster assignment OVERRIDES global day deactivation and weekly template!
  if (da.dow !== null && da.dow === targetDow) {
    if (da.isActive) {
      return {
        isOperable: true,
        isOpen: true,
        status: 'open',
        closureReason: null,
        notes: null,
        startTime,
        endTime,
        sessionShift: shiftCode,
        sessionLabel,
      };
    } else {
      return {
        isOperable: true,
        isOpen: false,
        status: 'closed',
        closureReason: ScheduleClosureReason.ADMIN_OVERRIDE,
        notes: 'Tidak Bertugas',
        startTime,
        endTime,
        sessionShift: shiftCode,
        sessionLabel,
      };
    }
  }

  // 4. Clinic Day Operating Status:
  // If clinic operating day is deactivated globally, doctors without explicit override cannot operate.
  if (!isDayActive) {
    return {
      isOperable: false,
      isOpen: false,
      status: 'closed',
      closureReason: ScheduleClosureReason.CLINIC_CLOSED,
      notes: 'Hari Operasional Tutup',
      startTime,
      endTime,
      sessionShift: shiftCode,
      sessionLabel,
    };
  }

  // 5. Fallback to clinic weekly template for generic assignment (da.dow === null)
  const isTemplateActive = Boolean(sched && sched.isActive);
  if (isTemplateActive) {
    return {
      isOperable: true,
      isOpen: true,
      status: 'open',
      closureReason: null,
      notes: null,
      startTime,
      endTime,
      sessionShift: shiftCode,
      sessionLabel,
    };
  }

  // Template is inactive (clinic closed for this shift on this day)
  return {
    isOperable: true,
    isOpen: false,
    status: 'closed',
    closureReason: ScheduleClosureReason.CLINIC_CLOSED,
    notes: 'Klinik Tutup',
    startTime,
    endTime,
    sessionShift: shiftCode,
    sessionLabel,
  };
}
