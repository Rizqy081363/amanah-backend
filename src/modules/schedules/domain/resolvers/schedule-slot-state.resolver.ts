import {
  ScheduleSlotFactory,
  SessionShiftType,
  ShiftDefinition,
  TheoreticalSlot,
} from '../factories/schedule-slot.factory';
import { parseClockTime } from '../schedule-projection';

export type TemporalState = 'PAST' | 'CURRENT' | 'FUTURE';
export type AvailabilityState =
  | 'UNSCHEDULED'
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'CLOSED';
export type ClosureCategory = 'LEAVE' | 'OTHER';
export type EffectiveSlotStatus =
  | 'EXPIRED'
  | 'CLOSED'
  | 'OCCUPIED'
  | 'AVAILABLE'
  | 'UNSCHEDULED';

export type SlotUiStatus =
  | 'UNSCHEDULED_PAST'
  | 'UNSCHEDULED'
  | 'COMPLETED'
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'RESCHEDULED'
  | 'CLOSED_LEAVE'
  | 'CLOSED_CLINIC';

export type SlotUiVariant =
  | 'neutral_disabled'
  | 'dashed_border'
  | 'muted_gray'
  | 'success_green'
  | 'info_blue'
  | 'warning_amber'
  | 'sky_badge'
  | 'danger_red';

export type SlotActionType =
  | 'NONE'
  | 'ADD_SESSION'
  | 'VIEW_SESSION'
  | 'VIEW_PATIENTS';

export type ShiftOperationalStatus =
  | 'ACTIVE'
  | 'NO_PRACTICE'
  | 'CLOSED'
  | 'CUTI';

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
    const isToday = input.scheduleDate === currentDate;

    // Check day-level leave
    const activeLeave = (input.leavePeriods || []).find(
      (lp) =>
        lp.startDate <= input.scheduleDate && lp.endDate >= input.scheduleDate,
    );

    // Filter closures applicable to this day/context
    const dayClosures = (input.closures || []).filter(
      (c) => c.scheduleDate === input.scheduleDate,
    );

    // Active appointments on this date
    const activeAppts = (input.appointments || []).filter(
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
        temporalState = 'PAST';
        pastCount++;
      } else if (isFutureDate) {
        temporalState = 'FUTURE';
        futureCount++;
      } else {
        // Today: compare clock minutes
        if (slot.endMinutes <= currentMinutes) {
          temporalState = 'PAST';
          pastCount++;
        } else if (
          slot.startMinutes <= currentMinutes &&
          currentMinutes < slot.endMinutes
        ) {
          temporalState = 'CURRENT';
          currentCount++;
        } else {
          temporalState = 'FUTURE';
          futureCount++;
        }
      }

      // 2. Closure Detection
      let closure: ClosureState | undefined;
      if (activeLeave) {
        closure = {
          category: 'LEAVE',
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
            category: 'OTHER',
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
        availabilityState = 'CLOSED';
        closedCount++;
      } else {
        if (!coveringRange) {
          availabilityState = 'UNSCHEDULED';
          unscheduledCount++;
        } else if (coveringRange.status === 'closed') {
          closure = {
            category: 'OTHER',
            reasonCode: 'SESSION_CLOSED',
            reasonText: coveringRange.notes || 'Sesi dinonaktifkan',
            sourceType: 'session_closure',
            sourceId: coveringRange.id,
          };
          availabilityState = 'CLOSED';
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
            availabilityState = 'OCCUPIED';
            occupiedCount++;
          } else {
            availabilityState = 'AVAILABLE';
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
      if (availabilityState === 'UNSCHEDULED') {
        effectiveStatus = 'UNSCHEDULED';
      } else if (availabilityState === 'CLOSED') {
        effectiveStatus = 'CLOSED';
      } else if (temporalState === 'PAST') {
        effectiveStatus = 'EXPIRED';
      } else {
        effectiveStatus = availabilityState;
      }

      // 6. UI-Ready Canonical Mapping (Zero-Intervention Plug & Play for Frontend)
      let uiStatus: SlotUiStatus;
      let uiLabel: string;
      let uiVariant: SlotUiVariant;
      let isClickable: boolean;
      let actionType: SlotActionType;

      if (closure?.category === 'LEAVE') {
        uiStatus = 'CLOSED_LEAVE';
        uiLabel = 'Cuti';
        uiVariant = 'sky_badge';
        isClickable = false;
        actionType = 'NONE';
      } else if (closure) {
        uiStatus = 'CLOSED_CLINIC';
        uiLabel = closure.reasonText
          ? `Ditutup: ${closure.reasonText}`
          : 'Ditutup';
        uiVariant = 'danger_red';
        isClickable = true;
        actionType = 'VIEW_SESSION';
      } else if (availabilityState === 'UNSCHEDULED') {
        if (temporalState === 'PAST') {
          uiStatus = 'UNSCHEDULED_PAST';
          uiLabel = 'Belum Terjadwal';
          uiVariant = 'neutral_disabled';
          isClickable = false;
          actionType = 'NONE';
        } else {
          uiStatus = 'UNSCHEDULED';
          uiLabel = 'Belum Terjadwal';
          uiVariant = 'dashed_border';
          isClickable = true;
          actionType = 'ADD_SESSION';
        }
      } else if (availabilityState === 'OCCUPIED') {
        if (temporalState === 'PAST') {
          uiStatus = 'COMPLETED';
          uiLabel = matchedAppt?.patientName
            ? `Selesai: ${matchedAppt.patientName}`
            : 'Selesai';
          uiVariant = 'muted_gray';
          isClickable = true;
          actionType = 'VIEW_SESSION';
        } else {
          uiStatus = 'OCCUPIED';
          uiLabel = matchedAppt?.patientName
            ? `Terisi: ${matchedAppt.patientName}`
            : 'Terisi';
          uiVariant = 'info_blue';
          isClickable = true;
          actionType = 'VIEW_PATIENTS';
        }
      } else if (reschedule?.isRescheduled) {
        if (temporalState === 'PAST') {
          uiStatus = 'COMPLETED';
          uiLabel = 'Selesai';
          uiVariant = 'muted_gray';
          isClickable = true;
          actionType = 'VIEW_SESSION';
        } else {
          uiStatus = 'RESCHEDULED';
          uiLabel = 'Dijadwalkan Ulang';
          uiVariant = 'warning_amber';
          isClickable = true;
          actionType = 'VIEW_SESSION';
        }
      } else {
        // AVAILABLE
        if (temporalState === 'PAST') {
          uiStatus = 'COMPLETED';
          uiLabel = 'Selesai';
          uiVariant = 'muted_gray';
          isClickable = true;
          actionType = 'VIEW_SESSION';
        } else {
          uiStatus = 'AVAILABLE';
          uiLabel = 'Tersedia';
          uiVariant = 'success_green';
          isClickable = true;
          actionType = 'VIEW_SESSION';
        }
      }

      const isSelectable =
        effectiveStatus === 'AVAILABLE' && temporalState !== 'PAST';

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
        uiSubLabel: slot.endTime,
        uiVariant,
        isClickable,
        actionType,
        sessionId: coveringRange?.id || null,
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
      (s) => s.uiStatus === 'COMPLETED',
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
      operationalStatus = 'CUTI';
      operationalLabel = 'Cuti Dokter';
    } else if (scheduledCount === 0) {
      operationalStatus = 'NO_PRACTICE';
      operationalLabel = 'Tidak Ada Praktik';
    } else if (closedCount === theoreticalSlots.length) {
      operationalStatus = 'CLOSED';
      operationalLabel = 'Praktik Ditutup';
    } else {
      operationalStatus = 'ACTIVE';
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
      unscheduledNotice: `${unscheduledCount} slot belum dijadwalkan`,
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
      registeredPatientsCount: occupiedCount,
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
