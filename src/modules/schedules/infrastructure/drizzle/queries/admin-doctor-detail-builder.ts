import {
  DEFAULT_CONSULTATION_DURATION_MINUTES,
  INACTIVE_APPOINTMENT_STATUSES,
} from '@modules/schedules/domain/constants/schedule.constants';
import {
  type AdminDoctorDailySession,
  type AdminDoctorMonthlyDayEntity,
  ScheduleClosureReason,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import {
  ScheduleSessionFactory,
  SHIFT_DEFINITIONS,
} from '@modules/schedules/domain/factories/schedule-session.factory';

import { parseClockTime } from '@modules/schedules/domain/schedule-projection';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';
import { ScheduleShiftRegistry } from '@modules/schedules/domain/constants/schedule-shift.constants';

export interface MonthlyScheduleBuildContext {
  targetYear: number;
  targetMonth: number;
  daysInMonth: number;
  monthSettings: any[];
  monthLeaves: any[];
  monthSessions: any[];
  monthAppointments: any[];
  consultationDurationMinutes: number;
  doctorAssignments?: any[];
  shiftExceptions?: any[];
  clinicPolicy?: any;
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
    doctorAssignments,
    shiftExceptions,
    clinicPolicy,
  } = ctx;

  const monthlySchedule: AdminDoctorMonthlyDayEntity[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const daySetting = monthSettings.find((s) => s.scheduleDate === dateStr);
    const leave = monthLeaves.find(
      (l) => l.startDate <= dateStr && l.endDate >= dateStr,
    );
    let daySessions = monthSessions.filter((s) => s.scheduleDate === dateStr);

    if (
      daySessions.length === 0 &&
      doctorAssignments &&
      doctorAssignments.length > 0
    ) {
      const dayDow = new Date(Date.UTC(targetYear, targetMonth - 1, d)).getUTCDay();
      const assignments = doctorAssignments.filter(
        (da) => da.dow === null || da.dow === dayDow,
      );

      daySessions = assignments
        .filter((da) => da.sessionDef && da.sessionDef.isActive)
        .map((da) => {
          const sched = da.sessionDef.schedules?.find(
            (s: any) => s.dow === dayDow,
          );
          const isMasterActive = Boolean(sched && sched.isActive);

          const exception = (shiftExceptions || []).find(
            (se: any) =>
              se.serviceDate === dateStr &&
              (!se.sessionId || se.sessionId === da.sessionId),
          );
          const isLeave = exception?.type === 'leave';

          const shiftCode = da.sessionDef.code;
          const shiftDef =
            SHIFT_DEFINITIONS.find((sd) => sd.shift === shiftCode) ||
            SHIFT_DEFINITIONS[1];
          const startTime = (
            sched?.startsAt || shiftDef.boundaryStartTime
          ).slice(0, 5);
          const endTime = (
            sched?.endsAt || shiftDef.boundaryEndTime
          ).slice(0, 5);

          const isClosed = !isMasterActive || isLeave;
          let closureReason: ScheduleClosureReason | null = null;
          if (isLeave) {
            closureReason = ScheduleClosureReason.DOCTOR_LEAVE;
          } else if (!isMasterActive) {
            closureReason = ScheduleClosureReason.CLINIC_CLOSED;
          }

          return {
            id: `recurring-${da.id}-${dateStr}`,
            practitionerId: da.doctorId,
            scheduleDate: dateStr,
            startTime,
            endTime,
            sessionShift: shiftCode,
            sessionLabel: shiftDef.label,
            status: isClosed ? 'closed' : 'open',
            clinicRoom: da.preferredRoom,
            notes: isLeave ? 'Dokter Cuti' : !isMasterActive ? 'Klinik Tutup' : null,
            closureReason,
          };
        });
    }

    const dayAppts = monthAppointments.filter(
      (a) => a.scheduledDate === dateStr,
    );

    const isOnLeave = Boolean(daySetting?.isLeave || leave);
    let dayNotes: string | null = null;

    const daySessionStatuses = daySessions.map((s) => {
      const descriptor = ScheduleShiftRegistry.find(s.sessionShift || s.sessionLabel);
      const defaultStart = descriptor ? `${descriptor.defaultStartTime}:00` : '';
      const defaultEnd = descriptor ? `${descriptor.defaultEndTime}:00` : '';
      const sessStart = s.startTime
        ? s.startTime.length === 5
          ? `${s.startTime}:00`
          : s.startTime
        : defaultStart;
      const sessEnd = s.endTime
        ? s.endTime.length === 5
          ? `${s.endTime}:00`
          : s.endTime
        : defaultEnd;

      const matchingAppts = dayAppts.filter((a) => {
        if (a.practitionerId !== s.practitionerId) return false;
        const aStart =
          a.scheduledStartTime?.length === 5
            ? `${a.scheduledStartTime}:00`
            : a.scheduledStartTime || sessStart;
        return aStart >= sessStart && aStart < sessEnd;
      });

      // Only active appointments counted for booked metrics
      const activeMatchingAppts = matchingAppts.filter(
        (a) =>
          !INACTIVE_APPOINTMENT_STATUSES.includes(
            (a.status?.toLowerCase() || '') as any,
          ),
      );

      const shiftDef = SHIFT_DEFINITIONS.find((d) => d.shift === s.sessionShift);
      const boundaryStart = shiftDef?.boundaryStartTime || SHIFT_DEFINITIONS[1].boundaryStartTime;
      const boundaryEnd = shiftDef?.boundaryEndTime || SHIFT_DEFINITIONS[1].boundaryEndTime;

      const metrics = ScheduleSessionFactory.calculateSessionMetrics({
        startTime: s.startTime ? s.startTime.slice(0, 5) : boundaryStart,
        endTime: s.endTime ? s.endTime.slice(0, 5) : boundaryEnd,
        durationMinutes:
          consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES,
        bookedCount: activeMatchingAppts.length,
        isOnLeave,
        isClosed: s.status === 'closed',
      });

      return resolveSessionOperationalStatus({
        isClosedForLeave: isOnLeave,
        persistedStatus: s.status,
      });
    });

    const dayOpStatus = resolveAggregateOperationalStatus({
      isClosedForLeave: isOnLeave,
      sessionStatuses: daySessionStatuses,
    });

    let dayStatus: 'OPEN' | 'CLOSED' | 'LEAVE' | 'EMPTY';
    let statusLabel: string;
    let badgeVariant: 'success' | 'danger' | 'warning' | 'neutral';

    if (isOnLeave) {
      dayStatus = 'LEAVE';
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
    }

    const dayActiveSessions = daySessions.filter(
      (s) => s.status !== 'closed',
    ).length;
    const dayBookedPatients = dayAppts.filter(
      (a) =>
        !INACTIVE_APPOINTMENT_STATUSES.includes(
          (a.status?.toLowerCase() || '') as any,
        ),
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
  isOnLeave?: boolean;
  isEvalOnLeave?: boolean;
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
    defaultRoomName,
    scheduleDate,
    currentDate,
    currentTime,
  } = ctx;
  const isEvalOnLeave = ctx.isEvalOnLeave ?? ctx.isOnLeave ?? false;

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
    const descriptor = ScheduleShiftRegistry.find(s.sessionShift || s.sessionLabel);
    const defaultStart = descriptor?.defaultStartTime ?? '';
    const defaultEnd = descriptor?.defaultEndTime ?? '';
    const jamMulai = s.startTime ? s.startTime.slice(0, 5) : defaultStart;
    const jamSelesai = s.endTime ? s.endTime.slice(0, 5) : defaultEnd;
    const sessStart = s.startTime
      ? s.startTime.length === 5
        ? `${s.startTime}:00`
        : s.startTime
      : (defaultStart ? `${defaultStart}:00` : '');
    const sessEnd = s.endTime
      ? s.endTime.length === 5
        ? `${s.endTime}:00`
        : s.endTime
      : (defaultEnd ? `${defaultEnd}:00` : '');

    const matchingAppts = evalAppts.filter((a) => {
      if (a.practitionerId !== s.practitionerId) return false;
      const aStart =
        a.scheduledStartTime?.length === 5
          ? `${a.scheduledStartTime}:00`
          : a.scheduledStartTime || sessStart;
      return aStart >= sessStart && aStart < sessEnd;
    });

    const metrics = ScheduleSessionFactory.calculateSessionMetrics({
      startTime: jamMulai,
      endTime: jamSelesai,
      durationMinutes: validDuration,
      bookedCount: matchingAppts.filter(
        (a) =>
          !INACTIVE_APPOINTMENT_STATUSES.includes(
            (a.status?.toLowerCase() || '') as any,
          ),
      ).length,
      isOnLeave: isEvalOnLeave,
      isClosed: s.status === 'closed',
    });

    const roomName = s.clinicRoom
      ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
      : defaultRoomName;

    const sessionOpStatus = resolveSessionOperationalStatus({
      isClosedForLeave: isEvalOnLeave,
      persistedStatus: s.status,
    });

    const isRescheduleEligible =
      !isEvalOnLeave && sessionOpStatus !== ScheduleOperationalStatus.CLOSED;
    const rescheduleIneligibilityReason = isEvalOnLeave
      ? 'Sesi tidak dapat di-reschedule karena dokter sedang cuti.'
      : sessionOpStatus === ScheduleOperationalStatus.CLOSED
        ? 'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.'
        : null;
    const sessionTitle = descriptor?.label || s.sessionLabel || metrics.sessionLabel;

    let closureReason: ScheduleClosureReason | null = null;
    if (sessionOpStatus === ScheduleOperationalStatus.CLOSED) {
      if (isEvalOnLeave || s.isLeave) {
        closureReason = ScheduleClosureReason.DOCTOR_LEAVE;
      } else if (s.closureReason) {
        closureReason = s.closureReason;
      } else {
        closureReason = ScheduleClosureReason.ADMIN_OVERRIDE;
      }
    }

    return {
      id: s.id,
      nama_sesi: sessionTitle,
      jam_mulai: jamMulai,
      jam_selesai: jamSelesai,
      waktu: `${jamMulai} - ${jamSelesai}`,
      pasien_terdaftar: metrics.bookedCount,
      status_sesi: sessionOpStatus,
      closure_reason: closureReason,
      ruang: roomName,
      ruang_id: s.roomId || null,
      roomId: s.roomId || null,
      is_reschedule_eligible: isRescheduleEligible,
      reschedule_ineligibility_reason: rescheduleIneligibilityReason,
      tanggal: s.scheduleDate || scheduleDate || curDate,
    };
  });
}

export function buildTimelineAndMetrics(
  _contextProjections: any[] = [],
  sesiHarian: any[] = [],
) {
  const totalBooked = sesiHarian.reduce(
    (acc, s) => acc + (s.pasien_terdaftar || 0),
    0,
  );

  const dayMetrics = {
    totalBookedPatients: totalBooked,
    activeSessionsCount: sesiHarian.length,
    unscheduledNotice: 'Semua sesi telah terjadwal',
  };

  return { timelineIntervals: [], dayMetrics };
}
