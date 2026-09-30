import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerLeavePeriods,
  practitionerScheduleClosures,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
  scheduleRescheduleEvents,
} from '@database/schema';
import {
  DEFAULT_CONSULTATION_DURATION_MINUTES,
} from '@modules/schedules/domain/constants/schedule.constants';
import { SCHEDULE_CONTEXT_DEFINITIONS } from '@modules/schedules/domain/constants/schedule-context.constants';
import {
  type AdminDoctorScheduleDetailResponse,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSlotStateResolver } from '@modules/schedules/domain/resolvers/schedule-slot-state.resolver';
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
import { and, asc, eq, gte, lte, or } from 'drizzle-orm';

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
      monthSettings,
      monthLeaves,
      monthSessions,
      monthAppointments,
      clinicPolicy,
    ] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findMany({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, prac.id),
          gte(practitionerScheduleDaySettings.scheduleDate, startDate),
          lte(practitionerScheduleDaySettings.scheduleDate, endDate),
        ),
      }),
      this.db.query.practitionerLeavePeriods.findMany({
        where: and(
          eq(practitionerLeavePeriods.practitionerId, prac.id),
          lte(practitionerLeavePeriods.startDate, endDate),
          gte(practitionerLeavePeriods.endDate, startDate),
        ),
      }),
      this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.practitionerId, prac.id),
          gte(practitionerScheduleSessions.scheduleDate, startDate),
          lte(practitionerScheduleSessions.scheduleDate, endDate),
        ),
        with: {
          clinicRoom: true,
        },
        orderBy: [asc(practitionerScheduleSessions.startTime)],
      }),
      this.db.query.appointments.findMany({
        where: and(
          eq(appointments.practitionerId, prac.id),
          gte(appointments.scheduledDate, startDate),
          lte(appointments.scheduledDate, endDate),
          // Include cancelled/no_show so registeredPatientsCount stays accurate
          // even after cancellation. The resolver separates active vs. all internally.
        ),
        with: {
          patientProfile: true,
          queueTickets: true,
        },
      }),
      this.policyReader.getClinicSchedulePolicy(),
    ]);

    const effectiveConsultationDuration =
      prac.consultationDurationMinutes ||
      clinicPolicy.durationMinutes ||
      DEFAULT_CONSULTATION_DURATION_MINUTES;

    const monthlySchedule = buildMonthlySchedule({
      targetYear,
      targetMonth,
      daysInMonth,
      monthSettings,
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

    const evalDaySetting = monthSettings.find(
      (s) => s.scheduleDate === evalDate,
    );
    const evalLeave = monthLeaves.find(
      (l) => l.startDate <= evalDate && l.endDate >= evalDate,
    );
    const evalSessions = monthSessions.filter(
      (s) => s.scheduleDate === evalDate,
    );
    const evalAppts = monthAppointments.filter(
      (a) => a.scheduledDate === evalDate,
    );

    const isEvalCuti = Boolean(evalDaySetting?.isLeave || evalLeave);
    const evalCutiReason = isEvalCuti
      ? evalDaySetting?.leaveReason || evalLeave?.reason || 'Cuti Dokter'
      : null;
    const evalCutiStart =
      evalLeave?.startDate || (isEvalCuti ? evalDate : null);
    const evalCutiEnd = evalLeave?.endDate || (isEvalCuti ? evalDate : null);

    const defaultRoomName = prac.clinicRoom
      ? `${prac.clinicRoom.name}${prac.clinicRoom.location ? `, ${prac.clinicRoom.location}` : ''}`
      : 'Belum Ditentukan';

    const sesiHarian = buildDailySessions({
      evalSessions,
      evalAppts,
      consultationDurationMinutes: effectiveConsultationDuration,
      isEvalCuti,
      defaultRoomName,
    });

    const evalSessionOpStatuses = sesiHarian.map((s) => s.status_sesi);

    const totalCapacity =
      sesiHarian.length > 0
        ? sesiHarian.reduce((acc, s) => acc + s.kuota_pasien, 0)
        : (evalDaySetting?.targetQuota ?? 0);
    const totalAvailable = isEvalCuti
      ? 0
      : sesiHarian.reduce((acc, s) => acc + s.slot_tersedia, 0);

    const evalAggregateOpStatus = resolveAggregateOperationalStatus({
      isClosedForLeave: isEvalCuti,
      sessionStatuses: evalSessionOpStatuses,
    });

    const isEvalClosed =
      evalAggregateOpStatus === ScheduleOperationalStatus.CLOSED;
    const statusDokter = evalAggregateOpStatus;

    const [evalClosures, evalReschedules] = await Promise.all([
      this.db.query.practitionerScheduleClosures?.findMany
        ? this.db.query.practitionerScheduleClosures.findMany({
            where: and(
              eq(practitionerScheduleClosures.practitionerId, prac.id),
              eq(practitionerScheduleClosures.scheduleDate, evalDate),
            ),
          })
        : Promise.resolve([]),
      this.db.query.scheduleRescheduleEvents?.findMany
        ? this.db.query.scheduleRescheduleEvents.findMany({
            where: and(
              eq(scheduleRescheduleEvents.practitionerId, prac.id),
              or(
                eq(scheduleRescheduleEvents.targetDate, evalDate),
                eq(scheduleRescheduleEvents.sourceDate, evalDate),
              ),
            ),
          })
        : Promise.resolve([]),
    ]);

    const contextProjections = SCHEDULE_CONTEXT_DEFINITIONS.map((ctxDef) => {
      return ScheduleSlotStateResolver.resolveContextProjection({
        scheduleDate: evalDate,
        context: ctxDef,
        intervalMinutes: effectiveConsultationDuration,
        openedRanges: evalSessions.map((s) => ({
          id: s.id,
          startTime: s.startTime ? s.startTime.slice(0, 5) : '08:00',
          endTime: s.endTime ? s.endTime.slice(0, 5) : '12:00',
          status: s.status,
          sessionShift: s.sessionShift || undefined,
          notes: s.notes,
        })),
        appointments: evalAppts.map((a) => ({
          id: a.id,
          bookingCode: a.bookingCode || undefined,
          patientId: a.patientId,
          patientName: a.patientProfile?.fullName || undefined,
          startTime: a.scheduledStartTime
            ? a.scheduledStartTime.slice(0, 5)
            : '08:00',
          endTime: a.scheduledEndTime ? a.scheduledEndTime.slice(0, 5) : null,
          status: a.status,
          queueNumber: a.queueTickets?.[0]?.queueNumber || null,
        })),
        leavePeriods: evalLeave
          ? [
              {
                id: evalLeave.id,
                startDate: evalLeave.startDate,
                endDate: evalLeave.endDate,
                reason: evalLeave.reason,
              },
            ]
          : evalDaySetting?.isLeave
            ? [
                {
                  id: evalDaySetting.id,
                  startDate: evalDate,
                  endDate: evalDate,
                  reason: evalDaySetting.leaveReason || 'Cuti Dokter',
                },
              ]
            : [],
        closures: evalClosures.map((c) => ({
          id: c.id,
          scheduleDate: c.scheduleDate,
          scope: c.scope as any,
          contextCode: c.contextCode,
          startTime: c.startTime ? c.startTime.slice(0, 5) : null,
          endTime: c.endTime ? c.endTime.slice(0, 5) : null,
          category: 'OTHER',
          reasonCode: c.reasonCode,
          reasonText: c.reasonText,
        })),
        rescheduleEvents: evalReschedules.map((r) => ({
          id: r.id,
          scheduleSessionId: r.scheduleSessionId,
          sourceDate: r.sourceDate,
          sourceStartTime: r.sourceStartTime.slice(0, 5),
          sourceEndTime: r.sourceEndTime.slice(0, 5),
          sourceRoomId: r.sourceRoomId,
          targetDate: r.targetDate,
          targetStartTime: r.targetStartTime.slice(0, 5),
          targetEndTime: r.targetEndTime.slice(0, 5),
          targetRoomId: r.targetRoomId,
          reasonCode: r.reasonCode,
          reasonText: r.reasonText,
        })),
      });
    });

    const { timelineIntervals, dayMetrics } =
      buildTimelineAndMetrics(contextProjections);

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
        slot_tersedia: isEvalClosed ? 0 : totalAvailable,
        kapasitas_per_hari: isEvalClosed ? 0 : totalCapacity,
        bulan_jadwal: formatIndoMonthYear(targetYear, targetMonth),
        is_cuti: isEvalCuti,
        cuti_reason: evalCutiReason,
        cuti_start: evalCutiStart,
        cuti_end: evalCutiEnd,
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
