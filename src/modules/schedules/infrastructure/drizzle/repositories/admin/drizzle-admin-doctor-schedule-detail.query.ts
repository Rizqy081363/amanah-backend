import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  practitioners,
  shiftExceptions,
} from '@database/schema';
import { DEFAULT_CONSULTATION_DURATION_MINUTES } from '@modules/schedules/domain/constants/schedule.constants';
import {
  type AdminDoctorScheduleDetailResponse,
  ScheduleClosureReason,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { resolveAggregateOperationalStatus } from '@modules/schedules/domain/schedule-status';
import { formatIndoMonthYear } from '@modules/schedules/domain/services/schedule-date.formatter';
import { ScheduleRecordMapper } from '@modules/schedules/infrastructure/drizzle/mappers/schedule-record.mapper';
import {
  buildDailySessions,
  buildMonthlySchedule,
  buildTimelineAndMetrics,
} from '@modules/schedules/infrastructure/drizzle/queries/admin-doctor-detail-builder';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { AdminDoctorScheduleDetailQueryDto } from '@modules/schedules/presentation/dto/admin-doctor-schedule-detail-query.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lte } from 'drizzle-orm';

@Injectable()
export class DrizzleAdminDoctorScheduleDetailQuery {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

  async execute(
    id: string,
    query: AdminDoctorScheduleDetailQueryDto,
  ): Promise<AdminDoctorScheduleDetailResponse> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const prac = await this.db.query.practitioners.findFirst({
      where: eq(practitioners.id, practitioner.id),
      with: {
        staffProfile: {
          with: {
            clinicUnit: true,
          },
        },
        medicalSpecialty: true,
        clinicRoom: true,
      },
    });

    if (!prac) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const now = new Date();
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth() + 1;

    if (query.date?.includes('-')) {
      const parts = query.date.split('-').map(Number);
      if (
        parts.length >= 2 &&
        !Number.isNaN(parts[0]) &&
        !Number.isNaN(parts[1])
      ) {
        targetYear = parts[0];
        targetMonth = parts[1];
      }
    }

    if (query.year) {
      targetYear = query.year;
    }
    if (query.month) {
      if (query.month.includes('-')) {
        const [y, m] = query.month.split('-').map(Number);
        targetYear = y;
        targetMonth = m;
      } else {
        const mNum = parseInt(query.month, 10);
        if (!Number.isNaN(mNum) && mNum >= 1 && mNum <= 12) {
          targetMonth = mNum;
        }
      }
    }

    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [
      monthExceptions,
      assignments,
      monthAppointments,
      clinicPolicy,
    ] = await Promise.all([
      this.db.query.shiftExceptions.findMany({
        where: and(
          eq(shiftExceptions.doctorId, prac.id),
          gte(shiftExceptions.serviceDate, startDate),
          lte(shiftExceptions.serviceDate, endDate),
        ),
      }),
      this.db.query.doctorAssignments.findMany({
        where: and(
          eq(doctorAssignments.doctorId, prac.id),
          eq(doctorAssignments.isActive, true),
        ),
        with: {
          sessionDef: {
            with: {
              schedules: true,
            },
          },
          preferredRoom: true,
        },
      }),
      this.db.query.appointments.findMany({
        where: and(
          eq(appointments.practitionerId, prac.id),
          gte(appointments.scheduledDate, startDate),
          lte(appointments.scheduledDate, endDate),
        ),
        with: {
          patientProfile: true,
          queueTickets: true,
        },
      }),
      this.policyReader.getClinicSchedulePolicy(),
    ]);

    const monthSessions: any[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDow = new Date(dayDate).getDay();

      const dayAssignments = assignments.filter(
        (da) => da.dow === null || da.dow === dayDow,
      );

      for (const da of dayAssignments) {
        if (!da.sessionDef || !da.sessionDef.isActive) continue;
        const exception = monthExceptions.find(
          (e) =>
            e.serviceDate === dayDate &&
            (!e.sessionId || e.sessionId === da.sessionId),
        );
        const isLeave = exception?.type === 'leave';

        const sched = da.sessionDef.schedules?.find(
          (s) => s.dow === dayDow,
        );
        const isMasterActive = Boolean(sched && sched.isActive);

        const startTime = (
          sched?.startsAt || da.sessionDef.defaultStartsAt
        ).slice(0, 5);
        const endTime = (
          sched?.endsAt || da.sessionDef.defaultEndsAt
        ).slice(0, 5);

        const isClosed = !isMasterActive || isLeave;
        let closureReason: ScheduleClosureReason | null = null;
        if (isLeave) {
          closureReason = ScheduleClosureReason.DOCTOR_LEAVE;
        } else if (!isMasterActive) {
          closureReason = ScheduleClosureReason.CLINIC_CLOSED;
        }

        monthSessions.push({
          id: da.id,
          practitionerId: prac.id,
          scheduleDate: dayDate,
          startTime,
          endTime,
          sessionShift: da.sessionDef.code,
          sessionLabel: da.sessionDef.labelKey,
          status: isClosed ? 'closed' : 'open',
          clinicRoom: da.preferredRoom || prac.clinicRoom,
          notes: isLeave ? 'Dokter isOnLeave' : !isMasterActive ? 'Klinik Tutup' : null,
          closureReason,
        });
      }
    }

    const effectiveConsultationDuration =
      prac.consultationDurationMinutes ||
      clinicPolicy.durationMinutes ||
      DEFAULT_CONSULTATION_DURATION_MINUTES;

    const monthLeaves = monthExceptions.map((e) => ({
      startDate: e.serviceDate,
      endDate: e.serviceDate,
      reason: e.note,
    }));

    const monthlySchedule = buildMonthlySchedule({
      targetYear,
      targetMonth,
      daysInMonth,
      monthSettings: [],
      monthLeaves,
      monthSessions,
      monthAppointments,
      consultationDurationMinutes: effectiveConsultationDuration,
    });

    const todayStr = now.toISOString().slice(0, 10);
    const evalDate =
      query.date ||
      (todayStr.startsWith(
        `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      )
        ? todayStr
        : startDate);

    const evalLeave = monthExceptions.find((e) => e.serviceDate === evalDate);
    const evalSessions = monthSessions.filter(
      (s) => s.scheduleDate === evalDate,
    );
    const evalAppts = monthAppointments.filter(
      (a) => a.scheduledDate === evalDate,
    );

    const isEvalOnLeave = Boolean(evalLeave);
    const evalLeaveReason = evalLeave?.note || (isEvalOnLeave ? 'Dokter Cuti' : null);
    const evalLeaveStart = isEvalOnLeave ? evalDate : null;
    const evalLeaveEnd = isEvalOnLeave ? evalDate : null;

    const defaultRoomName = prac.clinicRoom
      ? `${prac.clinicRoom.name}${prac.clinicRoom.location ? `, ${prac.clinicRoom.location}` : ''}`
      : 'Belum Ditentukan';

    const sesiHarian = buildDailySessions({
      evalSessions,
      evalAppts,
      consultationDurationMinutes: effectiveConsultationDuration,
      isOnLeave: isEvalOnLeave,
      defaultRoomName,
      scheduleDate: evalDate,
    });

    const evalSessionOpStatuses = sesiHarian.map((s) => s.status_sesi);

    const evalAggregateOpStatus = resolveAggregateOperationalStatus({
      isClosedForLeave: isEvalOnLeave,
      sessionStatuses: evalSessionOpStatuses,
    });

    const statusDokter = evalAggregateOpStatus;

    const { timelineIntervals, dayMetrics } = buildTimelineAndMetrics(
      [],
      sesiHarian,
    );
    const contextProjections: any[] = [];

    return {
      success: true,
      data: {
        id: prac.id,
        practitioner_id: prac.id,
        nama_dokter:
          prac.staffProfile?.fullName || prac.displayName || 'Dokter Amanah',
        spesialisasi:
          prac.medicalSpecialty?.name ||
          prac.staffProfile?.clinicUnit?.name ||
          'Dokter Umum',
        status_dokter: statusDokter,
        email: prac.staffProfile?.email || null,
        nomor_telepon: prac.staffProfile?.phone || null,
        ruang_praktik:
          sesiHarian.length > 0 ? sesiHarian[0].ruang : defaultRoomName,
        avatar: ScheduleRecordMapper.toAvatarUrl(prac.staffProfile),
        bulan_jadwal: formatIndoMonthYear(targetYear, targetMonth),
        is_on_leave: isEvalOnLeave,
        leave_reason: evalLeaveReason,
        leave_start: evalLeaveStart,
        leave_end: evalLeaveEnd,
        monthly_schedule: monthlySchedule,
        sesi_harian: sesiHarian,
        timeline_intervals: timelineIntervals,
        shifts: contextProjections,
        context_projections: contextProjections,
        metrics: dayMetrics,
        summary: dayMetrics,
      },
    };
  }
}
