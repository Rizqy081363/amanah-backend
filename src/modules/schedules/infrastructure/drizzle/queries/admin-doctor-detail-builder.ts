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
} from '@modules/schedules/domain/factories/schedule-session.factory';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';
import {
  filterEffectiveDoctorAssignments,
  resolveDoctorSessionOperability,
} from '@modules/schedules/domain/services/doctor-session-operational.resolver';

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
  masterDays?: Array<{ dow: number; isActive: boolean }>;
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
    doctorAssignments,
    shiftExceptions,
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
      const dayDow = new Date(
        Date.UTC(targetYear, targetMonth - 1, d),
      ).getUTCDay();
      const assignments = filterEffectiveDoctorAssignments(
        doctorAssignments,
        dayDow,
      );

      const dayActive =
        ctx.masterDays?.find((md) => md.dow === dayDow)?.isActive ?? true;

      daySessions = assignments
        .filter((da) => da.sessionDef && da.sessionDef.isActive)
        .map((da) => {
          const res = resolveDoctorSessionOperability({
            targetDow: dayDow,
            targetDate: dateStr,
            doctorAssignment: da,
            shiftExceptions: shiftExceptions || [],
            isDayActive: dayActive,
          });

          return {
            id: da.sessionDef.id,
            practitionerId: da.doctorId,
            scheduleDate: dateStr,
            startTime: res.startTime,
            endTime: res.endTime,
            sessionShift: res.sessionShift,
            sessionLabel: res.sessionLabel,
            status: res.status,
            clinicRoom: da.preferredRoom,
            notes: res.notes,
            closureReason: res.closureReason,
          };
        });
    }

    const isOnLeave = Boolean(daySetting?.isLeave || leave);
    let dayNotes: string | null = null;

    const daySessionStatuses = daySessions.map((s) => {
      return resolveSessionOperationalStatus({
        isClosedForLeave: isOnLeave,
        persistedStatus: s.status,
      });
    });

    const dayOpStatus = resolveAggregateOperationalStatus({
      isClosedForLeave: isOnLeave,
      sessionStatuses: daySessionStatuses,
    });

    if (isOnLeave) {
      dayNotes = daySetting?.leaveReason || leave?.reason || null;
    } else if (daySessions.length === 0) {
      dayNotes = null;
    } else if (dayOpStatus === ScheduleOperationalStatus.CLOSED) {
      dayNotes = daySetting?.leaveReason || null;
    }

    monthlySchedule.push({
      day: d,
      date: dateStr,
      status: dayOpStatus,
      notes: dayNotes,
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
  } = ctx;
  const isEvalOnLeave = ctx.isEvalOnLeave ?? ctx.isOnLeave ?? false;
  const validDuration =
    consultationDurationMinutes || DEFAULT_CONSULTATION_DURATION_MINUTES;

  return evalSessions.map((s) => {
    const sessionStart = s.startTime;
    const sessionEnd = s.endTime;

    const matchingAppts = evalAppts.filter((a) => {
      if (a.practitionerId !== s.practitionerId) return false;
      return (
        a.scheduledStartTime >= sessionStart &&
        a.scheduledStartTime < sessionEnd
      );
    });

    const metrics = ScheduleSessionFactory.calculateSessionMetrics({
      startTime: sessionStart,
      endTime: sessionEnd,
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
    const sessionTitle = s.sessionLabel;

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
      sessionName: sessionTitle,
      startTime: sessionStart,
      endTime: sessionEnd,
      timeRange: `${sessionStart} - ${sessionEnd}`,
      bookedPatients: metrics.bookedCount,
      sessionStatus: sessionOpStatus,
      closureReason: closureReason,
      roomName: roomName,
      roomId: s.roomId || null,
      isRescheduleEligible: isRescheduleEligible,
      rescheduleIneligibilityReason: rescheduleIneligibilityReason,
      date: s.scheduleDate || scheduleDate || currentDate || '',
    };
  });
}

export function buildTimelineAndMetrics(
  _contextProjections: any[] = [],
  dailySessions: any[] = [],
) {
  const totalBooked = dailySessions.reduce(
    (acc, s) => acc + (s.bookedPatients || 0),
    0,
  );

  const dayMetrics = {
    totalBookedPatients: totalBooked,
    activeSessionsCount: dailySessions.length,
    unscheduledNotice: 'Semua sesi telah terjadwal',
  };

  return { timelineIntervals: [], dayMetrics };
}
