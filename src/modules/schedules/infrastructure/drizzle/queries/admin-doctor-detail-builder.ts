import { DEFAULT_CONSULTATION_DURATION_MINUTES } from '@modules/schedules/domain/constants/schedule.constants';
import {
  type AdminDoctorDailySession,
  type AdminDoctorMonthlyDayEntity,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSlotFactory } from '@modules/schedules/domain/factories/schedule-slot.factory';
import {
  AVAILABILITY_STATE,
  CLOSURE_CATEGORY,
  EFFECTIVE_SLOT_STATUS,
  SHIFT_OPERATIONAL_STATUS,
  SLOT_UI_STATUS,
  TEMPORAL_STATE,
} from '@modules/schedules/domain/resolvers/schedule-slot-state.resolver';
import { parseClockTime } from '@modules/schedules/domain/schedule-projection';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';

export interface MonthlyScheduleBuildContext {
  targetYear: number;
  targetMonth: number;
  daysInMonth: number;
  monthSettings: any[];
  monthLeaves: any[];
  monthSessions: any[];
  monthAppointments: any[];
  consultationDurationMinutes: number;
}

export function buildMonthlySchedule(
  ctx: MonthlyScheduleBuildContext,
): AdminDoctorMonthlyDayEntity[] {
  const {
    targetYear,
    targetMonth,
    daysInMonth,
    monthSettings,
    monthLeaves,
    monthSessions,
    monthAppointments,
    consultationDurationMinutes,
  } = ctx;

  const monthlySchedule: AdminDoctorMonthlyDayEntity[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const daySetting = monthSettings.find((s) => s.scheduleDate === dateStr);
    const leave = monthLeaves.find(
      (l) => l.startDate <= dateStr && l.endDate >= dateStr,
    );
    const daySessions = monthSessions.filter((s) => s.scheduleDate === dateStr);
    const dayAppts = monthAppointments.filter(
      (a) => a.scheduledDate === dateStr,
    );

    const isCuti = Boolean(daySetting?.isLeave || leave);
    let dayNotes: string | null = null;

    const daySessionStatuses = daySessions.map((s) => {
      const sessStart = s.startTime
        ? s.startTime.length === 5
          ? `${s.startTime}:00`
          : s.startTime
        : '08:00:00';
      const sessEnd = s.endTime
        ? s.endTime.length === 5
          ? `${s.endTime}:00`
          : s.endTime
        : '12:00:00';

      const matchingAppts = dayAppts.filter((a) => {
        if (a.scheduleSessionId && a.scheduleSessionId === s.id) return true;
        if (a.practitionerId !== s.practitionerId) return false;
        const aStart =
          a.scheduledStartTime?.length === 5
            ? `${a.scheduledStartTime}:00`
            : a.scheduledStartTime || '08:00:00';
        return aStart >= sessStart && aStart < sessEnd;
      });

      // For slot occupancy/capacity calculations: only active appointments
      const activeMatchingAppts = matchingAppts.filter(
        (a) =>
          !['cancelled', 'no_show'].includes(a.status?.toLowerCase() || ''),
      );

      const metrics = ScheduleSlotFactory.calculateSessionMetrics({
        startTime: s.startTime ? s.startTime.slice(0, 5) : '08:00',
        endTime: s.endTime ? s.endTime.slice(0, 5) : '12:00',
        durationMinutes:
          consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES,
        persistedCapacity: s.capacity,
        bookedCount: activeMatchingAppts.length,
        isCuti,
        isClosed: s.status === 'closed',
      });

      return resolveSessionOperationalStatus({
        isClosedForLeave: isCuti,
        availableSlots: metrics.availableSlots,
        persistedStatus: s.status,
      });
    });

    const dayOpStatus = resolveAggregateOperationalStatus({
      isClosedForLeave: isCuti,
      sessionStatuses: daySessionStatuses,
    });

    let dayStatus: 'OPEN' | 'CLOSED' | 'CUTI' | 'EMPTY';
    let statusLabel: string;
    let badgeVariant: 'success' | 'danger' | 'warning' | 'neutral';

    if (isCuti) {
      dayStatus = 'CUTI';
      statusLabel = 'Cuti';
      badgeVariant = 'warning';
      dayNotes = daySetting?.leaveReason || leave?.reason || 'Cuti Dokter';
    } else if (daySessions.length === 0) {
      dayStatus = 'EMPTY';
      statusLabel = 'Kosong';
      badgeVariant = 'neutral';
      dayNotes = null;
    } else if (dayOpStatus === ScheduleOperationalStatus.CLOSED) {
      dayStatus = 'CLOSED';
      statusLabel = 'Tutup';
      badgeVariant = 'danger';
      dayNotes = daySetting?.leaveReason || 'Jadwal ditutup oleh admin';
    } else {
      dayStatus = 'OPEN';
      statusLabel = 'Buka';
      badgeVariant = 'success';
      if (dayOpStatus === ScheduleOperationalStatus.OCCUPIED) {
        dayNotes = 'Interval terisi oleh pasien reservasi';
      }
    }

    const dayActiveSessions = daySessions.filter(
      (s) => s.status !== 'closed',
    ).length;
    const dayTotalCapacity = daySessions.reduce(
      (acc, s) => acc + (s.capacity ?? 0),
      0,
    );
    const dayBookedPatients = dayAppts.filter(
      (a) => !['cancelled', 'no_show'].includes(a.status?.toLowerCase() || ''),
    ).length;

    monthlySchedule.push({
      day: d,
      date: dateStr,
      status: dayOpStatus,
      notes: dayNotes,
      dayStatus,
      statusLabel,
      badgeVariant,
      activeSessions: dayActiveSessions,
      totalCapacity: dayTotalCapacity,
      bookedPatients: dayBookedPatients,
      isClickable: true,
    });
  }

  return monthlySchedule;
}

export interface DailySessionBuildContext {
  evalSessions: any[];
  evalAppts: any[];
  consultationDurationMinutes: number;
  isEvalCuti: boolean;
  defaultRoomName: string;
  scheduleDate?: string;
  currentDate?: string;
  currentTime?: string;
}

export function buildDailySessions(
  ctx: DailySessionBuildContext,
): AdminDoctorDailySession[] {
  const {
    evalSessions,
    evalAppts,
    consultationDurationMinutes,
    isEvalCuti,
    defaultRoomName,
    scheduleDate,
    currentDate,
    currentTime,
  } = ctx;

  const now = new Date();
  const curDate = currentDate || now.toISOString().slice(0, 10);
  const curTime =
    currentTime ||
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const curMinutes = parseClockTime(curTime);
  const isPastDate = scheduleDate ? scheduleDate < curDate : false;
  const isToday = scheduleDate ? scheduleDate === curDate : true;
  const validDuration =
    consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES;

  return evalSessions.map((s) => {
    const jamMulai = s.startTime ? s.startTime.slice(0, 5) : '08:00';
    const jamSelesai = s.endTime ? s.endTime.slice(0, 5) : '12:00';
    const sessStart = s.startTime
      ? s.startTime.length === 5
        ? `${s.startTime}:00`
        : s.startTime
      : '08:00:00';
    const sessEnd = s.endTime
      ? s.endTime.length === 5
        ? `${s.endTime}:00`
        : s.endTime
      : '12:00:00';

    const matchingAppts = evalAppts.filter((a) => {
      if (a.scheduleSessionId && a.scheduleSessionId === s.id) return true;
      if (a.practitionerId !== s.practitionerId) return false;
      const aStart =
        a.scheduledStartTime?.length === 5
          ? `${a.scheduledStartTime}:00`
          : a.scheduledStartTime || '08:00:00';
      return aStart >= sessStart && aStart < sessEnd;
    });

    const metrics = ScheduleSlotFactory.calculateSessionMetrics({
      startTime: jamMulai,
      endTime: jamSelesai,
      durationMinutes: validDuration,
      persistedCapacity: s.capacity,
      persistedAvailableSlots: s.availableSlots,
      bookedCount: matchingAppts.filter(
        (a) =>
          !['cancelled', 'no_show'].includes(a.status?.toLowerCase() || ''),
      ).length,
      isCuti: isEvalCuti,
      isClosed: s.status === 'closed',
    });

    const sStartMin = parseClockTime(jamMulai);
    const sEndMin = parseClockTime(jamSelesai);
    let pastUnbookedSlots = 0;

    if (isPastDate) {
      pastUnbookedSlots = metrics.availableSlots;
    } else if (isToday) {
      for (let m = sStartMin; m < sEndMin; m += validDuration) {
        const slotEnd = m + validDuration;
        if (slotEnd <= curMinutes) {
          const hasAppt = matchingAppts.some((a) => {
            const aStart = parseClockTime(
              a.scheduledStartTime?.length === 5
                ? a.scheduledStartTime
                : a.scheduledStartTime?.slice(0, 5) || '08:00',
            );
            const aEnd = a.scheduledEndTime
              ? parseClockTime(a.scheduledEndTime.slice(0, 5))
              : aStart + validDuration;
            return aStart < slotEnd && aEnd > m;
          });
          if (!hasAppt) {
            pastUnbookedSlots++;
          }
        }
      }
    }

    const activeAvailable = Math.max(
      0,
      metrics.availableSlots - pastUnbookedSlots,
    );

    const roomName = s.clinicRoom
      ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
      : defaultRoomName;

    const sessionOpStatus = resolveSessionOperationalStatus({
      isClosedForLeave: isEvalCuti,
      availableSlots: activeAvailable,
      persistedStatus: s.status,
    });

    const isRescheduleEligible =
      !isEvalCuti && sessionOpStatus !== ScheduleOperationalStatus.CLOSED;
    const rescheduleIneligibilityReason = isEvalCuti
      ? 'Sesi tidak dapat di-reschedule karena dokter sedang cuti.'
      : sessionOpStatus === ScheduleOperationalStatus.CLOSED
        ? 'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.'
        : null;

    return {
      id: s.id,
      nama_sesi: s.sessionLabel || metrics.sessionLabel,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai,
      waktu: `${jamMulai} - ${jamSelesai}`,
      kuota_pasien: metrics.capacity,
      slot_tersedia: activeAvailable,
      pasien_terdaftar: metrics.bookedCount,
      display_slot: metrics.displaySlot,
      status_sesi: sessionOpStatus,
      ruang: roomName,
      ruang_id: s.roomId || null,
      roomId: s.roomId || null,
      is_reschedule_eligible: isRescheduleEligible,
      reschedule_ineligibility_reason: rescheduleIneligibilityReason,
    };
  });
}

export function buildTimelineAndMetrics(contextProjections: any[]) {
  const timelineIntervals = contextProjections
    .flatMap((cp) =>
      cp.slots.map((slot: any) => ({
        intervalId: slot.intervalId,
        slotId: slot.slotId,
        intervalIndex: slot.slotIndex,
        slotIndex: slot.slotIndex,
        timeStart: slot.startTime,
        timeEnd: slot.endTime,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: (slot.effectiveStatus === EFFECTIVE_SLOT_STATUS.AVAILABLE
          ? ScheduleOperationalStatus.OPEN
          : slot.effectiveStatus === EFFECTIVE_SLOT_STATUS.OCCUPIED
            ? ScheduleOperationalStatus.OCCUPIED
            : ScheduleOperationalStatus.CLOSED) as
          | 'OPEN'
          | 'OCCUPIED'
          | 'CLOSED',
        displayLabel: (slot.effectiveStatus === EFFECTIVE_SLOT_STATUS.AVAILABLE
          ? 'Buka'
          : slot.effectiveStatus === EFFECTIVE_SLOT_STATUS.OCCUPIED
            ? 'Terisi'
            : slot.effectiveStatus === EFFECTIVE_SLOT_STATUS.EXPIRED
              ? 'Kadaluarsa'
              : slot.effectiveStatus === EFFECTIVE_SLOT_STATUS.CLOSED
                ? 'Tutup'
                : 'Belum Terisi') as 'Buka' | 'Terisi' | 'Tutup',
        isOccupied: slot.availabilityState === AVAILABILITY_STATE.OCCUPIED,
        appointmentRef: slot.appointment
          ? {
              appointmentId: slot.appointment.id,
              queueNumber: slot.appointment.queueNumber ?? null,
              status: slot.appointment.status ?? null,
            }
          : undefined,
        closedReason: slot.closure
          ? slot.closure.category === CLOSURE_CATEGORY.LEAVE
            ? ('LEAVE' as const)
            : ('SCHEDULE_CLOSED' as const)
          : undefined,
        temporalState: slot.temporalState,
        availabilityState: slot.availabilityState,
        effectiveStatus: slot.effectiveStatus,
        isSelectable: slot.isSelectable,
        timeRange: slot.timeRange,
        uiStatus: slot.uiStatus,
        uiLabel: slot.uiLabel,
        uiSubLabel: slot.uiSubLabel,
        uiVariant: slot.uiVariant,
        isClickable: slot.isClickable,
        actionType: slot.actionType,
        sessionId: slot.sessionId,
        patientInfo: slot.patientInfo,
        rescheduleInfo: slot.rescheduleInfo,
        closureInfo: slot.closureInfo,
        closure: slot.closure,
        appointment: slot.appointment,
        reschedule: slot.reschedule,
      })),
    )
    .sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));

  const totalDayTheoreticalSlots = contextProjections.reduce(
    (acc, cp) => acc + (cp.metrics?.totalSlots ?? cp.counts.total),
    0,
  );
  const totalDayScheduledSlots = contextProjections.reduce(
    (acc, cp) =>
      acc +
      (cp.metrics?.scheduledSlots ??
        cp.counts.available + cp.counts.occupied + cp.counts.closed),
    0,
  );
  const totalDayUnscheduledSlots = contextProjections.reduce((acc, cp) => {
    if (cp.operationalStatus === SHIFT_OPERATIONAL_STATUS.NO_PRACTICE)
      return acc;
    const futureUnscheduled = (cp.slots || []).filter(
      (s: any) =>
        s.availabilityState === AVAILABILITY_STATE.UNSCHEDULED &&
        s.temporalState !== TEMPORAL_STATE.PAST,
    ).length;
    return acc + futureUnscheduled;
  }, 0);
  const totalDayAvailableSlots = contextProjections.reduce(
    (acc, cp) => acc + (cp.metrics?.availableSlots ?? cp.counts.available),
    0,
  );
  const totalDayCompletedSlots = timelineIntervals.filter(
    (s: any) => s.uiStatus === SLOT_UI_STATUS.COMPLETED,
  ).length;
  const totalDayOccupiedSlots = contextProjections.reduce(
    (acc, cp) => acc + (cp.metrics?.occupiedSlots ?? cp.counts.occupied),
    0,
  );
  const totalDayClosedSlots = contextProjections.reduce(
    (acc, cp) => acc + (cp.metrics?.closedSlots ?? cp.counts.closed),
    0,
  );
  const totalDayActiveBookableSlots =
    totalDayAvailableSlots + totalDayOccupiedSlots;
  const dayOccupancyPercentage =
    totalDayActiveBookableSlots > 0
      ? Number(
          ((totalDayOccupiedSlots / totalDayActiveBookableSlots) * 100).toFixed(
            2,
          ),
        )
      : 0;
  const dayCoveragePercentage =
    totalDayTheoreticalSlots > 0
      ? Number(
          ((totalDayScheduledSlots / totalDayTheoreticalSlots) * 100).toFixed(
            2,
          ),
        )
      : 0;

  const dayMetrics = {
    totalSlots: totalDayTheoreticalSlots,
    totalDaySlots: totalDayTheoreticalSlots,
    scheduledSlots: totalDayScheduledSlots,
    unscheduledSlots: totalDayUnscheduledSlots,
    availableSlots: totalDayAvailableSlots,
    completedSlots: totalDayCompletedSlots,
    occupiedSlots: totalDayOccupiedSlots,
    closedSlots: totalDayClosedSlots,
    activeBookableSlots: totalDayActiveBookableSlots,
    occupancy: {
      occupied: totalDayOccupiedSlots,
      capacity: totalDayActiveBookableSlots,
      percentage: dayOccupancyPercentage,
      displayText: `Okupansi Pasien: ${totalDayOccupiedSlots}/${totalDayActiveBookableSlots} Slot (${dayOccupancyPercentage}%)`,
    },
    patientOccupancy: {
      occupied: totalDayOccupiedSlots,
      capacity: totalDayActiveBookableSlots,
      percentage: dayOccupancyPercentage,
      displayText: `Okupansi Pasien: ${totalDayOccupiedSlots}/${totalDayActiveBookableSlots} Slot (${dayOccupancyPercentage}%)`,
    },
    scheduleCoverage: {
      scheduled: totalDayScheduledSlots,
      total: totalDayTheoreticalSlots,
      percentage: dayCoveragePercentage,
      displayText: `Cakupan Jadwal: ${totalDayScheduledSlots}/${totalDayTheoreticalSlots} Slot (${dayCoveragePercentage}%)`,
    },
    unscheduledNotice:
      totalDayUnscheduledSlots > 0
        ? `${totalDayUnscheduledSlots} slot belum dijadwalkan`
        : 'Semua slot telah terjadwal',
  };

  return { timelineIntervals, dayMetrics };
}
