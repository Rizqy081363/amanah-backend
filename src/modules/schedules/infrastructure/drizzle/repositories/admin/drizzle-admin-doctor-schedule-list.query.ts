import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  practitionerScheduleSessions,
  practitioners,
  shiftExceptions,
} from '@database/schema';
import {
  DEFAULT_CONSULTATION_DURATION_MINUTES,
  INACTIVE_APPOINTMENT_STATUSES,
} from '@modules/schedules/domain/constants/schedule.constants';
import {
  type AdminDoctorDailySession,
  type AdminDoctorScheduleCardEntity,
  type AdminDoctorScheduleListResponse,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import {
  ScheduleSessionFactory,
  SHIFT_DEFINITIONS,
  type SessionShiftType,
} from '@modules/schedules/domain/factories/schedule-session.factory';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';
import {
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
      allSessions,
      allAppointments,
      clinicPolicy,
      allDoctorAssignments,
      allShiftExceptions,
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
      this.db.query.practitionerScheduleSessions.findMany({
        where: eq(practitionerScheduleSessions.scheduleDate, targetDate),
        with: {
          clinicRoom: true,
        },
        orderBy: [asc(practitionerScheduleSessions.startTime)],
      }),
      this.db.query.appointments.findMany({
        where: and(
          eq(appointments.scheduledDate, targetDate),
          not(inArray(appointments.status, [...INACTIVE_APPOINTMENT_STATUSES])),
        ),
      }),
      this.policyReader.getClinicSchedulePolicy(),
      this.db.query.doctorAssignments.findMany({
        where: eq(doctorAssignments.isActive, true),
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
    ]);

    const cards: AdminDoctorScheduleCardEntity[] = [];

    for (const p of pracs) {
      const activeLeave = allShiftExceptions.find(
        (se) => se.doctorId === p.id && se.type === 'leave',
      );
      let sessions = allSessions.filter(
        (s) => s.practitionerId === p.id && s.scheduleDate === targetDate,
      );

      // Recurring Roster SSOT: when no explicit manual session exists for target date,
      // dynamically resolve sessions from doctor_assignment + session_schedule
      if (sessions.length === 0) {
        const assignments = allDoctorAssignments.filter(
          (da) =>
            da.doctorId === p.id &&
            (da.dow === null || da.dow === targetDow),
        );

        sessions = assignments
          .filter((da) => da.sessionDef && da.sessionDef.isActive)
          .map((da) => {
            const sched = da.sessionDef.schedules?.find(
              (s) => s.dow === targetDow && s.isActive,
            );
            if (!sched) return null;

            const exception = allShiftExceptions.find(
              (se) =>
                se.doctorId === p.id &&
                (!se.sessionId || se.sessionId === da.sessionId),
            );
            if (exception?.type === 'leave') return null;

            const shiftCode = da.sessionDef.code as SessionShiftType;
            const shiftDef =
              SHIFT_DEFINITIONS.find((sd) => sd.shift === shiftCode) ||
              SHIFT_DEFINITIONS[1];
            const startTime = (
              sched.startsAt || shiftDef.boundaryStartTime
            ).slice(0, 5);
            const endTime = (
              sched.endsAt || shiftDef.boundaryEndTime
            ).slice(0, 5);

            let sessionLabel = shiftDef.label;
            if (da.sessionDef.labelKey === 'session.morning') {
              sessionLabel = 'Sesi Pagi';
            } else if (da.sessionDef.labelKey === 'session.afternoon') {
              sessionLabel = 'Sesi Siang';
            } else if (da.sessionDef.labelKey === 'session.night') {
              sessionLabel = 'Sesi Malam';
            } else if (da.sessionDef.labelKey === 'session.early_morning') {
              sessionLabel = 'Sesi Dini Hari';
            }

            return {
              id: `recurring-${da.id}-${targetDate}`,
              practitionerId: p.id,
              scheduleDate: targetDate,
              startTime,
              endTime,
              sessionShift: shiftCode,
              sessionLabel,
              status: 'open',
              clinicRoom: da.preferredRoom || p.clinicRoom,
              notes: null,
            };
          })
          .filter((s): s is NonNullable<typeof s> => s !== null)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)) as any;
      }

      const isCuti = Boolean(activeLeave);
      const cutiReason = isCuti ? activeLeave?.note || 'Cuti Dokter' : null;
      const cutiStart = isCuti ? targetDate : null;
      const cutiEnd = isCuti ? targetDate : null;

      const defaultRoomName = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : 'Belum Ditentukan';

      const sesiHarian: AdminDoctorDailySession[] = sessions.map((s) => {
        const shiftDef = SHIFT_DEFINITIONS.find((d) => d.shift === s.sessionShift);
        const boundaryStart = shiftDef?.boundaryStartTime || SHIFT_DEFINITIONS[1].boundaryStartTime;
        const boundaryEnd = shiftDef?.boundaryEndTime || SHIFT_DEFINITIONS[1].boundaryEndTime;

        const jamMulai = s.startTime ? s.startTime.slice(0, 5) : boundaryStart;
        const jamSelesai = s.endTime ? s.endTime.slice(0, 5) : boundaryEnd;
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

        const matchingAppts = allAppointments.filter((a) => {
          if (a.practitionerId !== s.practitionerId) return false;
          const aStart =
            a.scheduledStartTime?.length === 5
              ? `${a.scheduledStartTime}:00`
              : a.scheduledStartTime || `${boundaryStart}:00`;
          return aStart >= sessStart && aStart < sessEnd;
        });

        const durationMinutes =
          p.consultationDurationMinutes ||
          clinicPolicy.durationMinutes ||
          DEFAULT_CONSULTATION_DURATION_MINUTES;

        const metrics = ScheduleSessionFactory.calculateSessionMetrics({
          startTime: jamMulai,
          endTime: jamSelesai,
          durationMinutes,
          bookedCount: matchingAppts.length,
          isCuti,
          isClosed: s.status === 'closed',
        });

        const roomName = s.clinicRoom
          ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
          : defaultRoomName;

        const sessionOpStatus = resolveSessionOperationalStatus({
          isClosedForLeave: isCuti,
          persistedStatus: s.status,
        });

        const isRescheduleEligible =
          !isCuti && sessionOpStatus !== ScheduleOperationalStatus.CLOSED;
        const rescheduleIneligibilityReason = isCuti
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
          pasien_terdaftar: metrics.bookedCount,
          status_sesi: sessionOpStatus,
          ruang: roomName,
          is_reschedule_eligible: isRescheduleEligible,
          reschedule_ineligibility_reason: rescheduleIneligibilityReason,
        };
      });

      const sessionOpStatuses = sesiHarian.map((s) => s.status_sesi);

      const aggregateOpStatus = resolveAggregateOperationalStatus({
        isClosedForLeave: isCuti,
        sessionStatuses: sessionOpStatuses,
      });

      const isClosed = aggregateOpStatus === ScheduleOperationalStatus.CLOSED;
      const scheduleStatus = aggregateOpStatus;

      let jadwalHariIni = '-';
      let jadwalPraktikMendatang = 'Tidak Ada Jadwal';

      if (isCuti) {
        jadwalPraktikMendatang = 'Cuti Dokter';
      } else if (isClosed) {
        jadwalPraktikMendatang =
          sesiHarian.length === 0 ? 'Tidak Ada Jadwal' : 'Praktik Ditutup';
      } else {
        jadwalPraktikMendatang = '-';
        if (sesiHarian.length > 0) {
          const starts = sesiHarian.map((s) => s.jam_mulai).sort();
          const ends = sesiHarian.map((s) => s.jam_selesai).sort();
          jadwalHariIni = `${starts[0]} - ${ends[ends.length - 1]}`;
        }
      }

      const ruangPraktik =
        sesiHarian.length > 0 ? sesiHarian[0].ruang : defaultRoomName;
      const spesialisasi =
        p.medicalSpecialty?.name ||
        p.staffProfile?.clinicUnit?.name ||
        'Dokter Umum';
      const namaDokter =
        p.staffProfile?.fullName || p.displayName || 'Dokter Amanah';
      if (query.search) {
        const q = query.search.toLowerCase();
        const matchSearch =
          namaDokter.toLowerCase().includes(q) ||
          spesialisasi.toLowerCase().includes(q) ||
          ruangPraktik.toLowerCase().includes(q);
        if (!matchSearch) continue;
      }

      if (query.poli) {
        const poliFilter = query.poli.toLowerCase();
        const matchPoli =
          spesialisasi.toLowerCase().includes(poliFilter) ||
          (p.staffProfile?.clinicUnit?.name || '')
            .toLowerCase()
            .includes(poliFilter);
        if (!matchPoli) continue;
      }

      if (query.status) {
        const statusList = query.status
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const invalidStatuses = statusList.filter(
          (status) =>
            !Object.values(ScheduleOperationalStatus).includes(
              status as ScheduleOperationalStatus,
            ),
        );
        if (invalidStatuses.length > 0) {
          throw new BadRequestException({
            code: 'INVALID_SCHEDULE_STATUS_FILTER',
            message:
              'Status filter must use canonical values: OPEN, OCCUPIED, CLOSED.',
            metadata: { invalidStatuses },
          });
        }
        if (!statusList.includes(scheduleStatus)) continue;
      }

      cards.push({
        id: p.id,
        practitioner_id: p.id,
        nama_dokter: namaDokter,
        spesialisasi,
        status_dokter: scheduleStatus,
        email: p.staffProfile?.email || null,
        nomor_telepon: p.staffProfile?.phone || null,
        ruang_praktik: ruangPraktik,
        tanggal_praktik: formatIndoDate(targetDate),
        avatar: ScheduleRecordMapper.toAvatarUrl(p.staffProfile),
        jadwal_hari_ini: jadwalHariIni,
        jadwal_praktik_mendatang: jadwalPraktikMendatang,
        status_jadwal: scheduleStatus,
        bulan_jadwal: formatIndoMonthYear(targetYear, targetMonth),
        is_cuti: isCuti,
        cuti_reason: cutiReason,
        cuti_start: cutiStart,
        cuti_end: cutiEnd,
        sesi_harian: sesiHarian,
      });
    }

    const page = query.page || 1;
    const limit = query.limit || 6;
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
          total_doctors: totalDoctors,
          total_pages: totalPages,
        },
      },
    };
  }
}
