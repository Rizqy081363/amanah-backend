import { DEFAULT_CONSULTATION_DURATION_MINUTES } from '../../../domain/constants/schedule.constants';
import {
  type AdminDoctorDailySession,
  type AdminDoctorMonthlyDayEntity,
  ScheduleOperationalStatus,
} from '../../../domain/entities/schedule.entity';
import { ScheduleSlotFactory } from '../../../domain/factories/schedule-slot.factory';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '../../../domain/schedule-status';

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

      const metrics = ScheduleSlotFactory.calculateSessionMetrics({
        startTime: s.startTime ? s.startTime.slice(0, 5) : '08:00',
        endTime: s.endTime ? s.endTime.slice(0, 5) : '12:00',
        durationMinutes:
          consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES,
        persistedCapacity: s.capacity,
        bookedCount: matchingAppts.length,
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
    const dayBookedPatients = dayAppts.length;

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
  } = ctx;

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
      durationMinutes:
        consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES,
      persistedCapacity: s.capacity,
      persistedAvailableSlots: s.availableSlots,
      bookedCount: matchingAppts.length,
      isCuti: isEvalCuti,
      isClosed: s.status === 'closed',
    });

    const roomName = s.clinicRoom
      ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
      : defaultRoomName;

    const sessionOpStatus = resolveSessionOperationalStatus({
      isClosedForLeave: isEvalCuti,
      availableSlots: metrics.availableSlots,
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
      slot_tersedia: metrics.availableSlots,
      pasien_terdaftar: metrics.bookedCount,
      display_slot: metrics.displaySlot,
      status_sesi: sessionOpStatus,
      ruang: roomName,
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
        status: (slot.effectiveStatus === 'AVAILABLE'
          ? 'OPEN'
          : slot.effectiveStatus === 'OCCUPIED'
            ? 'OCCUPIED'
            : 'CLOSED') as 'OPEN' | 'OCCUPIED' | 'CLOSED',
        displayLabel: (slot.effectiveStatus === 'AVAILABLE'
          ? 'Buka'
          : slot.effectiveStatus === 'OCCUPIED'
            ? 'Terisi'
            : slot.effectiveStatus === 'EXPIRED'
              ? 'Kadaluarsa'
              : slot.effectiveStatus === 'CLOSED'
                ? 'Tutup'
                : 'Belum Terisi') as 'Buka' | 'Terisi' | 'Tutup',
        isOccupied: slot.availabilityState === 'OCCUPIED',
        appointmentRef: slot.appointment
          ? {
              appointmentId: slot.appointment.id,
              queueNumber: slot.appointment.queueNumber ?? null,
              status: slot.appointment.status ?? null,
            }
          : undefined,
        closedReason: slot.closure
          ? slot.closure.category === 'LEAVE'
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
  const totalDayUnscheduledSlots = contextProjections.reduce(
    (acc, cp) => acc + (cp.metrics?.unscheduledSlots ?? cp.counts.unscheduled),
    0,
  );
  const totalDayAvailableSlots = contextProjections.reduce(
    (acc, cp) => acc + (cp.metrics?.availableSlots ?? cp.counts.available),
    0,
  );
  const totalDayCompletedSlots = timelineIntervals.filter(
    (s: any) => s.uiStatus === 'COMPLETED',
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
    unscheduledNotice: `${totalDayUnscheduledSlots} slot belum dijadwalkan`,
  };

  return { timelineIntervals, dayMetrics };
}
