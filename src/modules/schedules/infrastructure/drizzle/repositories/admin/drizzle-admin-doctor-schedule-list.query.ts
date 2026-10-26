import { NameInitialsHelper } from '@common/utils/name-initials.helper';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  masterDays,
  practitioners,
  sessionDefs,
  shiftExceptions,
  staffInvitations,
  staffLeaveRequests,
} from '@database/schema';
import { replacementOpportunities } from '@database/schema/leave-payroll.schema';
import {
  DEFAULT_CONSULTATION_DURATION_MINUTES,
  INACTIVE_APPOINTMENT_STATUSES,
} from '@modules/schedules/domain/constants/schedule.constants';
import {
  type AdminDoctorDailySession,
  type AdminDoctorScheduleCardEntity,
  type AdminDoctorScheduleListResponse,
  ScheduleClosureReason,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import {
  ScheduleSessionFactory,
  SHIFT_DEFINITIONS,
} from '@modules/schedules/domain/factories/schedule-session.factory';
import { SchedulePatientEligibilityHelper } from '@modules/schedules/domain/helpers/schedule-patient-eligibility.helper';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';
import {
  filterEffectiveDoctorAssignments,
  resolveDoctorSessionOperability,
} from '@modules/schedules/domain/services/doctor-session-operational.resolver';
import {
  type DateDisplayFormatStyle,
  formatIndoDate,
  formatIndoMonthYear,
  getClinicNow,
} from '@modules/schedules/domain/services/schedule-date.formatter';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import type { AdminDoctorSchedulesQueryDto } from '@modules/schedules/presentation/dto/admin-doctor-schedules-query.dto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lte, not } from 'drizzle-orm';

@Injectable()
export class DrizzleAdminDoctorScheduleListQuery {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

  async execute(
    query: AdminDoctorSchedulesQueryDto,
  ): Promise<AdminDoctorScheduleListResponse> {
    const { date: clinicTodayStr } = getClinicNow();
    let targetDate = clinicTodayStr;

    if (query.date) {
      targetDate = query.date;
    } else if (query.month) {
      if (clinicTodayStr.startsWith(query.month)) {
        targetDate = clinicTodayStr;
      } else {
        targetDate = `${query.month}-01`;
      }
    }

    const [targetYear, targetMonth] = targetDate.split('-').map(Number);
    const [tYear, tMonth, tDay] = targetDate.split('-').map(Number);
    const targetDow = new Date(Date.UTC(tYear, tMonth - 1, tDay)).getUTCDay();

    const [
      pracs,
      allAppointments,
      clinicPolicy,
      allDoctorAssignments,
      allShiftExceptions,
      dateFormatStyle,
      dayRecord,
      activeSessionDefs,
      pendingInvitations,
      allApprovedLeaves,
      allReplacementOpportunities,
    ] = await Promise.all([
      this.db.query.practitioners.findMany({
        with: {
          staffProfile: {
            with: {
              clinicUnit: true,
            },
          },
          medicalSpecialty: true,
          clinicRoom: true,
        },
        orderBy: [asc(practitioners.displayName)],
      }),
      this.db.query.appointments.findMany({
        where: and(
          eq(appointments.scheduledDate, targetDate),
          not(inArray(appointments.status, [...INACTIVE_APPOINTMENT_STATUSES])),
        ),
        with: {
          patientProfile: {
            with: {
              user: true,
            },
          },
        },
      }),
      this.policyReader.getClinicSchedulePolicy(),
      this.db.query.doctorAssignments.findMany({
        with: {
          sessionDef: {
            with: {
              schedules: true,
            },
          },
          preferredRoom: true,
        },
      }),
      this.db.query.shiftExceptions.findMany({
        where: eq(shiftExceptions.serviceDate, targetDate),
      }),
      this.policyReader.getDateFormatStyle().catch(() => 'human_full'),
      this.db.query.masterDays.findFirst({
        where: eq(masterDays.dow, targetDow),
      }),
      this.db.query.sessionDefs.findMany({
        where: eq(sessionDefs.isActive, true),
        with: {
          schedules: true,
        },
      }),
      this.db.query.staffInvitations.findMany({
        where: eq(staffInvitations.status, 'pending'),
      }),
      this.db.query.staffLeaveRequests.findMany({
        where: and(
          eq(staffLeaveRequests.status, 'approved'),
          lte(staffLeaveRequests.startDate, targetDate),
          gte(staffLeaveRequests.endDate, targetDate),
        ),
      }),
      this.db.query.replacementOpportunities.findMany({
        where: eq(replacementOpportunities.workDate, targetDate),
        with: {
          claimedByStaffProfile: true,
        },
      }),
    ]);

    const pendingInvitationEmails = new Set(
      pendingInvitations
        .map((inv) => inv.email?.toLowerCase().trim())
        .filter(Boolean),
    );

    const cards: AdminDoctorScheduleCardEntity[] = [];

    for (const p of pracs) {
      const activeLeave = allShiftExceptions.find(
        (se) => se.doctorId === p.id && se.type === 'leave',
      );
      const doctorAppointments = allAppointments.filter((a) =>
        SchedulePatientEligibilityHelper.isEligibleForDoctorCard(a, p.id),
      );
      const totalPatients = doctorAppointments.length;
      const patientPreviews = doctorAppointments.slice(0, 4).map((a: any) => {
        const rawName =
          a.patientProfile?.user?.name ||
          a.patientProfile?.fullName ||
          'Pasien';
        return {
          id: a.id,
          patientId: a.patientId,
          name: rawName,
          initials: NameInitialsHelper.getInitials(rawName),
          avatarUrl:
            a.patientProfile?.user?.image ||
            a.patientProfile?.avatarUrl ||
            null,
        };
      });

      const doctorEmail = (p.staffProfile?.email || '').toLowerCase().trim();
      const hasPendingInvitation = Boolean(
        doctorEmail && pendingInvitationEmails.has(doctorEmail),
      );
      const isPending =
        !p.isAcceptingAppointments ||
        p.staffProfile?.status === 'inactive' ||
        hasPendingInvitation;

      const doctorAssignmentsForP = allDoctorAssignments.filter(
        (da) => da.doctorId === p.id,
      );

      const assignments: any[] = filterEffectiveDoctorAssignments<any>(
        doctorAssignmentsForP as any,
        targetDow,
      );

      const sessions = assignments
        .filter((da) => da.sessionDef?.isActive)
        .map((da: any) => {
          const res = resolveDoctorSessionOperability({
            targetDow,
            targetDate,
            doctorAssignment: da,
            shiftExceptions: allShiftExceptions,
            isDayActive: dayRecord?.isActive ?? true,
          });

          return {
            id: da.sessionDef.id,
            sessionCode: da.sessionDef.code,
            practitionerId: p.id,
            scheduleDate: targetDate,
            startTime: res.startTime,
            endTime: res.endTime,
            sessionShift: res.sessionShift,
            sessionLabel: res.sessionLabel,
            status: res.status,
            clinicRoom: da.preferredRoom || p.clinicRoom,
            notes: res.notes,
            closureReason: res.closureReason,
          };
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime)) as any;

      const approvedLeave = allApprovedLeaves.find(
        (l) => l.practitionerId === p.id || l.staffProfileId === p.staffProfileId,
      );
      const isOnLeave = Boolean(approvedLeave || activeLeave);
      const leaveReason =
        approvedLeave?.reason ||
        activeLeave?.note ||
        (isOnLeave ? 'Dokter Cuti' : null);
      const leaveStart =
        approvedLeave?.startDate || (isOnLeave ? targetDate : null);
      const leaveEnd = approvedLeave?.endDate || (isOnLeave ? targetDate : null);
      const leaveType = approvedLeave?.requestType || null;

      const repOpp = allReplacementOpportunities.find(
        (ro) =>
          ro.originalPractitionerId === p.id ||
          ro.originalStaffProfileId === p.staffProfileId,
      );
      const replacementStatus = repOpp?.status || null;
      const substituteDoctorName =
        repOpp?.claimedByStaffProfile?.fullName ||
        approvedLeave?.substituteNameSnapshot ||
        null;

      const defaultRoomName = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : '';

      const dailySessions: AdminDoctorDailySession[] = sessions.map((s: any) => {
        const shiftDef = SHIFT_DEFINITIONS.find(
          (d) => d.shift === s.sessionShift,
        );
        const boundaryStart =
          shiftDef?.boundaryStartTime || SHIFT_DEFINITIONS[1].boundaryStartTime;
        const boundaryEnd =
          shiftDef?.boundaryEndTime || SHIFT_DEFINITIONS[1].boundaryEndTime;

        const sessionStart = s.startTime ? s.startTime.slice(0, 5) : boundaryStart;
        const sessionEnd = s.endTime ? s.endTime.slice(0, 5) : boundaryEnd;
        const sessStart = s.startTime
          ? s.startTime.length === 5
            ? `${s.startTime}:00`
            : s.startTime
          : `${boundaryStart}:00`;
        const sessEnd = s.endTime
          ? s.endTime.length === 5
            ? `${s.endTime}:00`
            : s.endTime
          : `${boundaryEnd}:00`;

        const matchingAppts = allAppointments.filter((a) =>
          SchedulePatientEligibilityHelper.isEligibleForDoctorSession(
            a,
            s.practitionerId,
            sessStart,
            sessEnd,
          ),
        );

        const durationMinutes =
          p.consultationDurationMinutes ||
          clinicPolicy.durationMinutes ||
          DEFAULT_CONSULTATION_DURATION_MINUTES;

        const metrics = ScheduleSessionFactory.calculateSessionMetrics({
          startTime: sessionStart,
          endTime: sessionEnd,
          durationMinutes,
          bookedCount: matchingAppts.length,
          isOnLeave,
          isClosed: s.status === 'closed',
        });

        const roomName = s.clinicRoom
          ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
          : defaultRoomName;

        const sessionOpStatus = resolveSessionOperationalStatus({
          isClosedForLeave: isOnLeave,
          persistedStatus: s.status,
        });

        const isRescheduleEligible =
          !isOnLeave && sessionOpStatus !== ScheduleOperationalStatus.CLOSED;
        const rescheduleIneligibilityReason = isOnLeave
          ? 'Sesi tidak dapat di-reschedule karena dokter sedang cuti.'
          : sessionOpStatus === ScheduleOperationalStatus.CLOSED
            ? 'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.'
            : null;

        let closureReason: ScheduleClosureReason | null = null;
        if (sessionOpStatus === ScheduleOperationalStatus.CLOSED) {
          if (isOnLeave) {
            closureReason = ScheduleClosureReason.DOCTOR_LEAVE;
          } else if (s.closureReason) {
            closureReason = s.closureReason;
          } else {
            closureReason = ScheduleClosureReason.ADMIN_OVERRIDE;
          }
        }

        return {
          id: s.id,
          sessionName: s.sessionLabel || metrics.sessionLabel,
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
          date: targetDate,
        };
      });

      const sessionOpStatuses = dailySessions.map((s) => s.sessionStatus);

      const aggregateOpStatus = resolveAggregateOperationalStatus({
        isClosedForLeave: isOnLeave,
        sessionStatuses: sessionOpStatuses,
      });

      const isClosed = aggregateOpStatus === ScheduleOperationalStatus.CLOSED;
      const scheduleStatus = isPending
        ? ScheduleOperationalStatus.PENDING
        : aggregateOpStatus;

      let todaySchedule = '-';
      let upcomingSchedule = 'Tidak Ada Jadwal';

      if (isPending) {
        todaySchedule = '-';
        upcomingSchedule = 'Menunggu Verifikasi';
      } else if (isOnLeave) {
        upcomingSchedule = 'Dokter Cuti';
      } else if (isClosed) {
        upcomingSchedule =
          dailySessions.length === 0 ? 'Tidak Ada Jadwal' : 'Praktik Ditutup';
      } else {
        upcomingSchedule = '-';
        if (dailySessions.length > 0) {
          const starts = dailySessions.map((s) => s.startTime).sort();
          const ends = dailySessions.map((s) => s.endTime).sort();
          todaySchedule = `${starts[0]} - ${ends[ends.length - 1]}`;
        }
      }

      const practiceRoom =
        dailySessions.length > 0 ? dailySessions[0].roomName : defaultRoomName;
      const specialty =
        p.medicalSpecialty?.name ||
        p.staffProfile?.clinicUnit?.name ||
        p.staffProfile?.positionTitle ||
        '';
      const doctorFullName = p.staffProfile?.fullName || p.displayName || '';
      if (query.search) {
        const q = query.search.toLowerCase();
        const matchSearch =
          doctorFullName.toLowerCase().includes(q) ||
          specialty.toLowerCase().includes(q) ||
          practiceRoom.toLowerCase().includes(q);
        if (!matchSearch) continue;
      }

      if (query.poli) {
        const poliList = query.poli
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean);
        if (poliList.length > 0) {
          const matchPoli = poliList.some(
            (item) =>
              specialty.toLowerCase().includes(item) ||
              (p.staffProfile?.clinicUnit?.name || '')
                .toLowerCase()
                .includes(item),
          );
          if (!matchPoli) continue;
        }
      }

      if (query.session) {
        if (isPending || dailySessions.length === 0) continue;
        const sessionFilters = query.session
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (sessionFilters.length > 0) {
          const hasMatchingSession = sessions.some((s: any) => {
            if (s.status === 'closed') return false;
            const matchId = sessionFilters.includes(s.id.toLowerCase());
            const matchCode =
              s.sessionCode &&
              sessionFilters.includes(s.sessionCode.toLowerCase());
            const matchShift =
              s.sessionShift &&
              sessionFilters.includes(s.sessionShift.toLowerCase());
            const matchLabel =
              s.sessionLabel &&
              sessionFilters.includes(s.sessionLabel.toLowerCase());
            return matchId || matchCode || matchShift || matchLabel;
          });
          if (!hasMatchingSession) continue;
        }
      }

      if (query.status) {
        const statusList = query.status
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        const validCanonicalStatuses = [
          ...Object.values(ScheduleOperationalStatus),
          'ACTIVE',
          'INACTIVE',
        ];
        const invalidStatuses = statusList.filter(
          (status) => !validCanonicalStatuses.includes(status as any),
        );
        if (invalidStatuses.length > 0) {
          throw new BadRequestException({
            code: 'INVALID_SCHEDULE_STATUS_FILTER',
            message:
              'Status filter must use canonical values: OPEN, CLOSED, PENDING, ON_LEAVE, ACTIVE, INACTIVE.',
            metadata: { invalidStatuses },
          });
        }

        const isDocActive =
          !isPending &&
          (p.isAcceptingAppointments ?? true) &&
          p.staffProfile?.status !== 'inactive';

        const matchesStatus = statusList.some((st) => {
          if (st === 'ACTIVE') return isDocActive;
          if (st === 'INACTIVE') return !isDocActive;
          if (st === ScheduleOperationalStatus.ON_LEAVE) {
            return (
              isOnLeave || scheduleStatus === ScheduleOperationalStatus.ON_LEAVE
            );
          }
          return st === scheduleStatus;
        });

        if (!matchesStatus) continue;
      }

      cards.push({
        id: p.id,
        practitionerId: p.id,
        staffProfileId: p.staffProfileId,
        staffId: p.staffProfileId,
        staffCode: p.staffProfile?.staffCode || null,
        staffType: p.staffProfile?.staffType,
        fullName: doctorFullName,
        specialty,
        doctorStatus: scheduleStatus,
        email: p.staffProfile?.email || null,
        phone: p.staffProfile?.phone || null,
        practiceRoom,
        practiceDate: formatIndoDate(
          targetDate,
          dateFormatStyle as DateDisplayFormatStyle,
        ),
        avatar: ScheduleRecordMapper.toAvatarUrl(p.staffProfile),
        todaySchedule,
        upcomingSchedule,
        scheduleStatus,
        scheduleMonth: formatIndoMonthYear(targetYear, targetMonth),
        isOnLeave,
        leaveReason,
        leaveStart,
        leaveEnd,
        leaveType,
        substituteDoctorName,
        replacementStatus,
        dailySessions: isPending ? [] : dailySessions,
        totalPatients: isPending ? 0 : totalPatients,
        patientPreviews: isPending ? [] : patientPreviews,
        isAcceptingAppointments: p.isAcceptingAppointments,
      });
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const totalDoctors = cards.length;
    const totalPages = Math.ceil(totalDoctors / limit) || 1;
    const paginated = cards.slice((page - 1) * limit, page * limit);

    return {
      success: true,
      data: {
        doctors: paginated,
        meta: {
          page,
          limit,
          totalDoctors: totalDoctors,
          totalPages: totalPages,
        },
      },
    };
  }
}
