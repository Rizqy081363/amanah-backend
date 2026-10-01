import {
  ScheduleSlotFactory,
  SessionShiftType,
  ShiftDefinition,
} from '../factories/schedule-slot.factory';
import { parseClockTime } from '../schedule-projection';

export const TEMPORAL_STATE = {
  PAST: 'PAST',
  CURRENT: 'CURRENT',
  FUTURE: 'FUTURE',
} as const;
export type TemporalState =
  (typeof TEMPORAL_STATE)[keyof typeof TEMPORAL_STATE];

export const AVAILABILITY_STATE = {
  UNSCHEDULED: 'UNSCHEDULED',
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  CLOSED: 'CLOSED',
} as const;
export type AvailabilityState =
  (typeof AVAILABILITY_STATE)[keyof typeof AVAILABILITY_STATE];

export const CLOSURE_CATEGORY = {
  LEAVE: 'LEAVE',
  OTHER: 'OTHER',
} as const;
export type ClosureCategory =
  (typeof CLOSURE_CATEGORY)[keyof typeof CLOSURE_CATEGORY];

export const EFFECTIVE_SLOT_STATUS = {
  EXPIRED: 'EXPIRED',
  CLOSED: 'CLOSED',
  OCCUPIED: 'OCCUPIED',
  AVAILABLE: 'AVAILABLE',
  UNSCHEDULED: 'UNSCHEDULED',
} as const;
export type EffectiveSlotStatus =
  (typeof EFFECTIVE_SLOT_STATUS)[keyof typeof EFFECTIVE_SLOT_STATUS];

export const SLOT_UI_STATUS = {
  UNSCHEDULED_PAST: 'UNSCHEDULED_PAST',
  UNSCHEDULED: 'UNSCHEDULED',
  COMPLETED: 'COMPLETED',
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  OCCUPIED_BY_OTHER: 'OCCUPIED_BY_OTHER',
  RESCHEDULED: 'RESCHEDULED',
  CLOSED_LEAVE: 'CLOSED_LEAVE',
  CLOSED_CLINIC: 'CLOSED_CLINIC',
} as const;
export type SlotUiStatus =
  (typeof SLOT_UI_STATUS)[keyof typeof SLOT_UI_STATUS];

export const SLOT_UI_VARIANT = {
  NEUTRAL_DISABLED: 'neutral_disabled',
  DASHED_BORDER: 'dashed_border',
  MUTED_GRAY: 'muted_gray',
  SUCCESS_GREEN: 'success_green',
  INFO_BLUE: 'info_blue',
  PURPLE_OTHER: 'purple_other',
  WARNING_AMBER: 'warning_amber',
  SKY_BADGE: 'sky_badge',
  DANGER_RED: 'danger_red',
} as const;
export type SlotUiVariant =
  (typeof SLOT_UI_VARIANT)[keyof typeof SLOT_UI_VARIANT];

export const SLOT_ACTION_TYPE = {
  NONE: 'NONE',
  ADD_SESSION: 'ADD_SESSION',
  VIEW_SESSION: 'VIEW_SESSION',
  VIEW_PATIENTS: 'VIEW_PATIENTS',
  VIEW_OCCUPANCY_CONFLICT: 'VIEW_OCCUPANCY_CONFLICT',
} as const;
export type SlotActionType =
  (typeof SLOT_ACTION_TYPE)[keyof typeof SLOT_ACTION_TYPE];

export const SHIFT_OPERATIONAL_STATUS = {
  ACTIVE: 'ACTIVE',
  NO_PRACTICE: 'NO_PRACTICE',
  CLOSED: 'CLOSED',
  CUTI: 'CUTI',
} as const;
export type ShiftOperationalStatus =
  (typeof SHIFT_OPERATIONAL_STATUS)[keyof typeof SHIFT_OPERATIONAL_STATUS];

export interface ClosureState {
  category: ClosureCategory;
  reasonCode?: string;
  reasonText?: string;
  sourceType:
    | 'leave_period'
    | 'schedule_closure'
    | 'session_closure'
    | 'manual';
  sourceId?: string;
}

export interface RescheduleState {
  isRescheduled: boolean;
  sourceDate?: string;
  sourceStartTime?: string;
  sourceEndTime?: string;
  sourceRoomId?: string | null;
  targetDate?: string;
  targetStartTime?: string;
  targetEndTime?: string;
  reasonCode?: string | null;
  reasonText?: string | null;
}

export interface AppointmentSlotRef {
  id: string;
  bookingCode?: string;
  patientId?: string;
  patientName?: string;
  queueNumber?: string | null;
  status?: string | null;
}

export interface MultiDimensionalSlotProjection {
  intervalId: string;
  slotId: string;
  slotIndex: number;
  timeStart: string;
  timeEnd: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number;
  timeRange: string;
  temporalState: TemporalState;
  availabilityState: AvailabilityState;
  effectiveStatus: EffectiveSlotStatus;
  isSelectable: boolean;

  // UI-Ready Attributes (Plug & Play)
  uiStatus: SlotUiStatus;
  uiLabel: string;
  uiSubLabel: string;
  uiVariant: SlotUiVariant;
  isClickable: boolean;
  actionType: SlotActionType;
  sessionId: string | null;

  closure?: ClosureState;
  appointment?: AppointmentSlotRef;
  reschedule?: RescheduleState;

  // Metadata Audit for modals/tooltips
  patientInfo?: any | null;
  rescheduleInfo?: any | null;
  closureInfo?: any | null;
  conflictInfo?: SlotConflictInfo | null;
}

export interface SlotOccupancyMetric {
  occupied: number;
  capacity: number;
  percentage: number;
  displayText?: string;
}

export interface SlotScheduleCoverageMetric {
  scheduled: number;
  total: number;
  percentage: number;
  displayText?: string;
}

export interface SlotProjectionMetrics {
  totalSlots: number;
  totalDaySlots?: number;
  scheduledSlots: number;
  unscheduledSlots: number;
  availableSlots: number;
  completedSlots?: number;
  occupiedSlots: number;
  closedSlots: number;
  activeBookableSlots: number;
  occupancy: SlotOccupancyMetric;
  patientOccupancy?: SlotOccupancyMetric;
  scheduleCoverage: SlotScheduleCoverageMetric;
  unscheduledNotice?: string;
}

export interface SlotProjectionCounts {
  total: number;
  unscheduled: number;
  available: number;
  occupied: number;
  closed: number;
  past: number;
  current: number;
  future: number;
  scheduled?: number;
  activeBookable?: number;
}

export interface ContextProjectionResult {
  contextId: string;
  contextLabel: string;
  boundaryStartTime: string;
  boundaryEndTime: string;
  intervalMinutes: number;

  // Shift Operational Summary
  shiftId: string;
  shiftName: string;
  timeRange: string;
  operationalStatus: ShiftOperationalStatus;
  operationalLabel: string;
  activeSessionsCount: number;
  registeredPatientsCount: number;
  availableSlotsCount: number;
  totalShiftSlots: number;

  counts: SlotProjectionCounts;
  metrics: SlotProjectionMetrics;
  summary: SlotProjectionMetrics;
  slots: MultiDimensionalSlotProjection[];
}

export interface OpenedAvailabilityRange {
  id: string;
  startTime: string;
  endTime: string;
  status: string; // 'open' | 'closed'
  sessionShift?: string | null;
  notes?: string | null;
}

export interface ActiveAppointmentFact {
  id: string;
  bookingCode?: string;
  patientId?: string;
  patientName?: string;
  startTime: string;
  endTime?: string | null;
  status: string; // 'booked', 'confirmed', 'waiting', etc.
  queueNumber?: string | null;
}

export interface LeavePeriodFact {
  id: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}

export interface ScheduleClosureFact {
  id: string;
  scheduleDate: string;
  scope: 'DAY' | 'CONTEXT' | 'INTERVAL';
  contextCode?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  category: 'OTHER';
  reasonCode?: string | null;
  reasonText?: string | null;
}

export interface RescheduleEventFact {
  id: string;
  scheduleSessionId?: string | null;
  sourceDate: string;
  sourceStartTime: string;
  sourceEndTime: string;
  sourceRoomId?: string | null;
  targetDate: string;
  targetStartTime: string;
  targetEndTime: string;
  targetRoomId?: string | null;
  reasonCode?: string | null;
  reasonText?: string | null;
}

export interface OtherDoctorRoomOccupancyFact {
  sessionId: string;
  practitionerId: string;
  practitionerName: string;
  specialty?: string;
  roomId: string;
  roomName: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface SlotConflictInfo {
  type: string;
  sessionId?: string;
  practitionerId?: string;
  practitionerName?: string;
  practitionerSpecialty?: string;
  roomId?: string;
  roomName?: string;
  startTime?: string;
  endTime?: string;
  message?: string;
}

export interface SlotStateResolverInput {
  scheduleDate: string; // 'YYYY-MM-DD'
  context: ShiftDefinition | SessionShiftType | string;
  intervalMinutes: number;
  currentDate?: string; // default today 'YYYY-MM-DD'
  currentTime?: string; // default now 'HH:mm'
  openedRanges?: OpenedAvailabilityRange[];
  appointments?: ActiveAppointmentFact[];
  leavePeriods?: LeavePeriodFact[];
  closures?: ScheduleClosureFact[];
  rescheduleEvents?: RescheduleEventFact[];
  otherDoctorRoomOccupancies?: OtherDoctorRoomOccupancyFact[];
}

export class ScheduleSlotStateResolver {
  /**
   * Overlays persisted facts onto theoretical slots, producing authoritative
   * multi-dimensional slot projections without loss of underlying truth.
   */
  static resolveContextProjection(
    input: SlotStateResolverInput,
  ): ContextProjectionResult {
    const shiftDef = ScheduleSlotFactory.resolveShiftDefinition(
      typeof input.context === 'string' ? input.context : input.context.shift,
    );

    const theoreticalSlots = ScheduleSlotFactory.generateTheoreticalSlots(
      shiftDef,
      input.intervalMinutes,
    );

    const now = new Date();
    const currentDate = input.currentDate || now.toISOString().slice(0, 10);
    const currentTime =
      input.currentTime ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentMinutes = parseClockTime(currentTime);

    const isPastDate = input.scheduleDate < currentDate;
    const isFutureDate = input.scheduleDate > currentDate;

    // Check day-level leave
    const activeLeave = (input.leavePeriods || []).find(
      (lp) =>
        lp.startDate <= input.scheduleDate && lp.endDate >= input.scheduleDate,
    );

    // Filter closures applicable to this day/context
    const dayClosures = (input.closures || []).filter(
      (c) => c.scheduleDate === input.scheduleDate,
    );

    // All appointments (including cancelled/no_show) — used for registeredPatientsCount
    const allAppts = input.appointments || [];

    // Active appointments only — used for slot occupancy calculation
    const activeAppts = allAppts.filter(
      (a) => !['cancelled', 'no_show'].includes(a.status?.toLowerCase() || ''),
    );

    const projectedSlots: MultiDimensionalSlotProjection[] = [];

    let unscheduledCount = 0;
    let availableCount = 0;
    let occupiedCount = 0;
    let closedCount = 0;
    let pastCount = 0;
    let currentCount = 0;
    let futureCount = 0;

    for (const slot of theoreticalSlots) {
      // 1. Temporal State (calculated purely from clock time)
      let temporalState: TemporalState;
      if (isPastDate) {
        temporalState = TEMPORAL_STATE.PAST;
        pastCount++;
      } else if (isFutureDate) {
        temporalState = TEMPORAL_STATE.FUTURE;
        futureCount++;
      } else {
        // Today: compare clock minutes
        if (slot.endMinutes <= currentMinutes) {
          temporalState = TEMPORAL_STATE.PAST;
          pastCount++;
        } else if (
          slot.startMinutes <= currentMinutes &&
          currentMinutes < slot.endMinutes
        ) {
          temporalState = TEMPORAL_STATE.CURRENT;
          currentCount++;
        } else {
          temporalState = TEMPORAL_STATE.FUTURE;
          futureCount++;
        }
      }

      // 2. Closure Detection
      let closure: ClosureState | undefined;
      if (activeLeave) {
        closure = {
          category: CLOSURE_CATEGORY.LEAVE,
          reasonCode: 'LEAVE',
          reasonText: activeLeave.reason || 'Cuti Dokter',
          sourceType: 'leave_period',
          sourceId: activeLeave.id,
        };
      } else {
        const matchingClosure = dayClosures.find((c) => {
          if (c.scope === 'DAY') return true;
          if (c.scope === 'CONTEXT' && c.contextCode === shiftDef.shift)
            return true;
          if (c.scope === 'INTERVAL' && c.startTime && c.endTime) {
            const cStart = parseClockTime(c.startTime);
            const cEnd = parseClockTime(c.endTime);
            return slot.startMinutes < cEnd && slot.endMinutes > cStart;
          }
          return false;
        });

        if (matchingClosure) {
          closure = {
            category: CLOSURE_CATEGORY.OTHER,
            reasonCode: matchingClosure.reasonCode || 'MANUAL',
            reasonText: matchingClosure.reasonText || 'Ditutup oleh klinik',
            sourceType: 'schedule_closure',
            sourceId: matchingClosure.id,
          };
        }
      }

      // 3. Availability State & Occupancy
      let availabilityState: AvailabilityState;
      let matchedAppt: ActiveAppointmentFact | undefined;

      // Check if an opened practitioner range covers this slot
      const coveringRange = (input.openedRanges || []).find((range) => {
        const rangeStart = parseClockTime(range.startTime);
        const rangeEnd = parseClockTime(range.endTime);
        return rangeStart <= slot.startMinutes && rangeEnd >= slot.endMinutes;
      });

      if (closure) {
        availabilityState = AVAILABILITY_STATE.CLOSED;
        closedCount++;
      } else {
        if (!coveringRange) {
          availabilityState = AVAILABILITY_STATE.UNSCHEDULED;
          unscheduledCount++;
        } else if (coveringRange.status === 'closed') {
          closure = {
            category: CLOSURE_CATEGORY.OTHER,
            reasonCode: 'SESSION_CLOSED',
            reasonText: coveringRange.notes || 'Sesi dinonaktifkan',
            sourceType: 'session_closure',
            sourceId: coveringRange.id,
          };
          availabilityState = AVAILABILITY_STATE.CLOSED;
          closedCount++;
        } else {
          // Practitioner opened range exists -> check appointment occupancy
          matchedAppt = activeAppts.find((a) => {
            const aStart = parseClockTime(a.startTime);
            const aEnd = a.endTime
              ? parseClockTime(a.endTime)
              : aStart + input.intervalMinutes;
            return aStart < slot.endMinutes && aEnd > slot.startMinutes;
          });

          if (matchedAppt) {
            availabilityState = AVAILABILITY_STATE.OCCUPIED;
            occupiedCount++;
          } else {
            availabilityState = AVAILABILITY_STATE.AVAILABLE;
            availableCount++;
          }
        }
      }

      // 4. Reschedule Metadata
      let reschedule: RescheduleState | undefined;
      const matchedReschedule = (input.rescheduleEvents || []).find((re) => {
        if (re.targetDate === input.scheduleDate) {
          const reStart = parseClockTime(re.targetStartTime);
          const reEnd = parseClockTime(re.targetEndTime);
          return slot.startMinutes < reEnd && slot.endMinutes > reStart;
        }
        if (re.sourceDate === input.scheduleDate) {
          const reStart = parseClockTime(re.sourceStartTime);
          const reEnd = parseClockTime(re.sourceEndTime);
          return slot.startMinutes < reEnd && slot.endMinutes > reStart;
        }
        return false;
      });
      if (matchedReschedule) {
        reschedule = {
          isRescheduled: true,
          sourceDate: matchedReschedule.sourceDate,
          sourceStartTime: matchedReschedule.sourceStartTime,
          sourceEndTime: matchedReschedule.sourceEndTime,
          sourceRoomId: matchedReschedule.sourceRoomId,
          targetDate: matchedReschedule.targetDate,
          targetStartTime: matchedReschedule.targetStartTime,
          targetEndTime: matchedReschedule.targetEndTime,
          reasonCode: matchedReschedule.reasonCode,
          reasonText: matchedReschedule.reasonText,
        };
      }

      // 5. Effective Status & isSelectable (derived for frontend convenience)
      // FIX: UNSCHEDULED slots must remain UNSCHEDULED even if temporalState is PAST!
      // 'EXPIRED / Selesai' only applies to sessions that were actually scheduled by practitioner.
      let effectiveStatus: EffectiveSlotStatus;
      if (availabilityState === AVAILABILITY_STATE.UNSCHEDULED) {
        effectiveStatus = EFFECTIVE_SLOT_STATUS.UNSCHEDULED;
      } else if (availabilityState === AVAILABILITY_STATE.CLOSED) {
        effectiveStatus = EFFECTIVE_SLOT_STATUS.CLOSED;
      } else if (temporalState === TEMPORAL_STATE.PAST) {
        effectiveStatus = EFFECTIVE_SLOT_STATUS.EXPIRED;
      } else {
        effectiveStatus = availabilityState as EffectiveSlotStatus;
      }

      // 6. UI-Ready Canonical Mapping (Zero-Intervention Plug & Play for Frontend)
      let uiStatus: SlotUiStatus;
      let uiLabel: string;
      let uiSubLabel: string = slot.endTime;
      let uiVariant: SlotUiVariant;
      let isClickable: boolean;
      let actionType: SlotActionType;
      let conflictInfo: SlotConflictInfo | null = null;

      const otherDoctorOccupancy = (
        input.otherDoctorRoomOccupancies || []
      ).find((occ) => {
        const occStart = parseClockTime(occ.startTime);
        const occEnd = parseClockTime(occ.endTime);
        return occStart < slot.endMinutes && occEnd > slot.startMinutes;
      });

      if (closure?.category === CLOSURE_CATEGORY.LEAVE) {
        uiStatus = SLOT_UI_STATUS.CLOSED_LEAVE;
        uiLabel = 'Cuti';
        uiVariant = SLOT_UI_VARIANT.SKY_BADGE;
        isClickable = false;
        actionType = SLOT_ACTION_TYPE.NONE;
      } else if (closure) {
        uiStatus = SLOT_UI_STATUS.CLOSED_CLINIC;
        uiLabel = closure.reasonText
          ? `Ditutup: ${closure.reasonText}`
          : 'Ditutup';
        uiVariant = SLOT_UI_VARIANT.DANGER_RED;
        isClickable = true;
        actionType = SLOT_ACTION_TYPE.VIEW_SESSION;
      } else if (availabilityState === AVAILABILITY_STATE.UNSCHEDULED) {
        if (otherDoctorOccupancy) {
          uiStatus = SLOT_UI_STATUS.OCCUPIED_BY_OTHER;
          uiLabel = otherDoctorOccupancy.practitionerName;
          uiSubLabel = otherDoctorOccupancy.roomName;
          uiVariant = SLOT_UI_VARIANT.PURPLE_OTHER;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.VIEW_OCCUPANCY_CONFLICT;
          conflictInfo = {
            type: 'ROOM_COLLISION_OTHER_DOCTOR',
            sessionId: otherDoctorOccupancy.sessionId,
            practitionerId: otherDoctorOccupancy.practitionerId,
            practitionerName: otherDoctorOccupancy.practitionerName,
            practitionerSpecialty: otherDoctorOccupancy.specialty,
            roomId: otherDoctorOccupancy.roomId,
            roomName: otherDoctorOccupancy.roomName,
            startTime: otherDoctorOccupancy.startTime,
            endTime: otherDoctorOccupancy.endTime,
            message: `Ruangan ${otherDoctorOccupancy.roomName} sedang digunakan oleh ${otherDoctorOccupancy.practitionerName} (${otherDoctorOccupancy.specialty || 'Dokter'}) pada ${otherDoctorOccupancy.startTime} - ${otherDoctorOccupancy.endTime} WIB.`,
          };
        } else if (temporalState === TEMPORAL_STATE.PAST) {
          uiStatus = SLOT_UI_STATUS.UNSCHEDULED_PAST;
          uiLabel = 'Belum Terjadwal';
          uiVariant = SLOT_UI_VARIANT.NEUTRAL_DISABLED;
          isClickable = false;
          actionType = SLOT_ACTION_TYPE.NONE;
        } else {
          uiStatus = SLOT_UI_STATUS.UNSCHEDULED;
          uiLabel = 'Belum Terjadwal';
          uiVariant = SLOT_UI_VARIANT.DASHED_BORDER;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.ADD_SESSION;
        }
      } else if (availabilityState === AVAILABILITY_STATE.OCCUPIED) {
        if (temporalState === TEMPORAL_STATE.PAST) {
          uiStatus = SLOT_UI_STATUS.COMPLETED;
          uiLabel = matchedAppt?.patientName
            ? `Selesai: ${matchedAppt.patientName}`
            : 'Selesai';
          uiVariant = SLOT_UI_VARIANT.MUTED_GRAY;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.VIEW_SESSION;
        } else {
          uiStatus = SLOT_UI_STATUS.OCCUPIED;
          uiLabel = matchedAppt?.patientName
            ? `Terisi: ${matchedAppt.patientName}`
            : 'Terisi';
          uiVariant = SLOT_UI_VARIANT.INFO_BLUE;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.VIEW_PATIENTS;
        }
      } else if (reschedule?.isRescheduled) {
        if (temporalState === TEMPORAL_STATE.PAST) {
          uiStatus = SLOT_UI_STATUS.COMPLETED;
          uiLabel = 'Selesai';
          uiVariant = SLOT_UI_VARIANT.MUTED_GRAY;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.VIEW_SESSION;
        } else {
          uiStatus = SLOT_UI_STATUS.RESCHEDULED;
          uiLabel = 'Dijadwalkan Ulang';
          uiVariant = SLOT_UI_VARIANT.WARNING_AMBER;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.VIEW_SESSION;
        }
      } else {
        // AVAILABLE
        if (temporalState === TEMPORAL_STATE.PAST) {
          uiStatus = SLOT_UI_STATUS.COMPLETED;
          uiLabel = 'Selesai';
          uiVariant = SLOT_UI_VARIANT.MUTED_GRAY;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.VIEW_SESSION;
        } else {
          uiStatus = SLOT_UI_STATUS.AVAILABLE;
          uiLabel = 'Tersedia';
          uiVariant = SLOT_UI_VARIANT.SUCCESS_GREEN;
          isClickable = true;
          actionType = SLOT_ACTION_TYPE.VIEW_SESSION;
        }
      }

      const isSelectable =
        effectiveStatus === EFFECTIVE_SLOT_STATUS.AVAILABLE &&
        temporalState !== TEMPORAL_STATE.PAST;

      projectedSlots.push({
        intervalId: `${shiftDef.shift}:${slot.startTime}-${slot.endTime}`,
        slotId: `${shiftDef.shift}:${slot.startTime}-${slot.endTime}`,
        slotIndex: slot.slotIndex,
        timeStart: slot.startTime,
        timeEnd: slot.endTime,
        startTime: slot.startTime,
        endTime: slot.endTime,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        timeRange: slot.timeRange,
        temporalState,
        availabilityState,
        effectiveStatus,
        isSelectable,
        uiStatus,
        uiLabel,
        uiSubLabel,
        uiVariant,
        isClickable,
        actionType,
        sessionId: coveringRange?.id || null,
        conflictInfo: conflictInfo || null,
        ...(closure
          ? { closure, closureInfo: closure }
          : { closureInfo: null }),
        ...(matchedAppt
          ? {
              appointment: {
                id: matchedAppt.id,
                bookingCode: matchedAppt.bookingCode,
                patientId: matchedAppt.patientId,
                patientName: matchedAppt.patientName,
                queueNumber: matchedAppt.queueNumber,
                status: matchedAppt.status,
              },
              patientInfo: {
                id: matchedAppt.id,
                bookingCode: matchedAppt.bookingCode,
                patientId: matchedAppt.patientId,
                patientName: matchedAppt.patientName,
                queueNumber: matchedAppt.queueNumber,
                status: matchedAppt.status,
              },
            }
          : { patientInfo: null }),
        ...(reschedule
          ? { reschedule, rescheduleInfo: reschedule }
          : { rescheduleInfo: null }),
      });
    }

    const scheduledCount = availableCount + occupiedCount + closedCount;
    const activeBookableCount = availableCount + occupiedCount;
    const completedCount = projectedSlots.filter(
      (s) => s.uiStatus === SLOT_UI_STATUS.COMPLETED,
    ).length;
    const occupancyPercentage =
      activeBookableCount > 0
        ? Number(((occupiedCount / activeBookableCount) * 100).toFixed(2))
        : 0;
    const coveragePercentage =
      theoreticalSlots.length > 0
        ? Number(((scheduledCount / theoreticalSlots.length) * 100).toFixed(2))
        : 0;

    const isShiftCuti = Boolean(activeLeave);
    let operationalStatus: ShiftOperationalStatus;
    let operationalLabel: string;

    if (isShiftCuti) {
      operationalStatus = SHIFT_OPERATIONAL_STATUS.CUTI;
      operationalLabel = 'Cuti Dokter';
    } else if (scheduledCount === 0) {
      operationalStatus = SHIFT_OPERATIONAL_STATUS.NO_PRACTICE;
      operationalLabel = 'Tidak Ada Praktik';
    } else if (closedCount === theoreticalSlots.length) {
      operationalStatus = SHIFT_OPERATIONAL_STATUS.CLOSED;
      operationalLabel = 'Praktik Ditutup';
    } else {
      operationalStatus = SHIFT_OPERATIONAL_STATUS.ACTIVE;
      operationalLabel = `${availableCount} slot tersedia`;
    }

    const metrics: SlotProjectionMetrics = {
      totalSlots: theoreticalSlots.length,
      totalDaySlots: theoreticalSlots.length,
      scheduledSlots: scheduledCount,
      unscheduledSlots: unscheduledCount,
      availableSlots: availableCount,
      completedSlots: completedCount,
      occupiedSlots: occupiedCount,
      closedSlots: closedCount,
      activeBookableSlots: activeBookableCount,
      occupancy: {
        occupied: occupiedCount,
        capacity: activeBookableCount,
        percentage: occupancyPercentage,
        displayText: `Okupansi Pasien: ${occupiedCount}/${activeBookableCount} Slot (${occupancyPercentage}%)`,
      },
      patientOccupancy: {
        occupied: occupiedCount,
        capacity: activeBookableCount,
        percentage: occupancyPercentage,
        displayText: `Okupansi Pasien: ${occupiedCount}/${activeBookableCount} Slot (${occupancyPercentage}%)`,
      },
      scheduleCoverage: {
        scheduled: scheduledCount,
        total: theoreticalSlots.length,
        percentage: coveragePercentage,
        displayText: `Cakupan Jadwal: ${scheduledCount}/${theoreticalSlots.length} Slot (${coveragePercentage}%)`,
      },
      unscheduledNotice:
        unscheduledCount > 0
          ? `${unscheduledCount} slot belum dijadwalkan`
          : 'Semua slot telah terjadwal',
    };

    return {
      contextId: shiftDef.contextId,
      contextLabel: shiftDef.contextLabel,
      shiftId: shiftDef.shift,
      shiftName: shiftDef.contextLabel,
      timeRange: `${shiftDef.boundaryStartTime} - ${shiftDef.boundaryEndTime} WIB`,
      boundaryStartTime: shiftDef.boundaryStartTime,
      boundaryEndTime: shiftDef.boundaryEndTime,
      intervalMinutes: input.intervalMinutes,
      operationalStatus,
      operationalLabel,
      activeSessionsCount: (input.openedRanges || []).filter((r) => {
        const rStart = parseClockTime(r.startTime);
        const rEnd = parseClockTime(r.endTime);
        const bStart = parseClockTime(shiftDef.boundaryStartTime);
        const bEnd = parseClockTime(shiftDef.boundaryEndTime);
        return rStart < bEnd && rEnd > bStart;
      }).length,
      // Count ALL appointments (including cancelled) that fall within this shift's time window
      // so the header badge is consistent with what the session patients modal shows.
      registeredPatientsCount: allAppts.filter((a) => {
        const aStart = parseClockTime(a.startTime);
        const bStart = parseClockTime(shiftDef.boundaryStartTime);
        const bEnd = parseClockTime(shiftDef.boundaryEndTime);
        return aStart >= bStart && aStart < bEnd;
      }).length,
      availableSlotsCount: availableCount,
      totalShiftSlots: theoreticalSlots.length,
      counts: {
        total: theoreticalSlots.length,
        unscheduled: unscheduledCount,
        available: availableCount,
        occupied: occupiedCount,
        closed: closedCount,
        scheduled: scheduledCount,
        activeBookable: activeBookableCount,
        past: pastCount,
        current: currentCount,
        future: futureCount,
      },
      metrics,
      summary: metrics,
      slots: projectedSlots,
    };
  }
}
