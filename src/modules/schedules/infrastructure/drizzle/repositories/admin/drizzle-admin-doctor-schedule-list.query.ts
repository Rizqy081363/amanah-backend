import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  doctorAssignments,
  masterDays,
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
  ScheduleClosureReason,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import {
  ScheduleSessionFactory,
  SHIFT_DEFINITIONS,
  type SessionShiftType,
} from '@modules/schedules/domain/factories/schedule-session.factory';
import {
  filterEffectiveDoctorAssignments,
  resolveDoctorSessionOperability,
} from '@modules/schedules/domain/services/doctor-session-operational.resolver';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';
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
      this.policyReader.getDateFormatStyle().catch(() => 'human_full'),
      this.db.query.masterDays.findFirst({
        where: eq(masterDays.dow, targetDow),
      }),
    ]);

    const cards: AdminDoctorScheduleCardEntity[] = [];

    for (const p of pracs) {
      const activeLeave = allShiftExceptions.find(
        (se) => se.doctorId === p.id && se.type === 'leave',
      );
      const assignments = filterEffectiveDoctorAssignments(
        allDoctorAssignments.filter((da) => da.doctorId === p.id),
        targetDow,
      );

      const sessions = assignments
        .filter((da) => da.sessionDef && da.sessionDef.isActive)
        .map((da) => {
          const res = resolveDoctorSessionOperability({
            targetDow,
            targetDate,
            doctorAssignment: da,
            shiftExceptions: allShiftExceptions,
            isDayActive: dayRecord?.isActive ?? true,
          });

          return {
            id: `recurring-${da.id}-${targetDate}`,
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

      const isOnLeave = Boolean(activeLeave);
      const leaveReason = isOnLeave ? activeLeave?.note || 'Dokter Cuti' : null;
      const leaveStart = isOnLeave ? targetDate : null;
      const leaveEnd = isOnLeave ? targetDate : null;

      const defaultRoomName = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : 'Belum Ditentukan';

      const sesiHarian: AdminDoctorDailySession[] = sessions.map((s: any) => {
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
          nama_sesi: s.sessionLabel || metrics.sessionLabel,
          jam_mulai: jamMulai,
          jam_selesai: jamSelesai,
          waktu: `${jamMulai} - ${jamSelesai}`,
          pasien_terdaftar: metrics.bookedCount,
          status_sesi: sessionOpStatus,
          closure_reason: closureReason,
          ruang: roomName,
          is_reschedule_eligible: isRescheduleEligible,
          reschedule_ineligibility_reason: rescheduleIneligibilityReason,
        };
      });

      const sessionOpStatuses = sesiHarian.map((s) => s.status_sesi);

      const aggregateOpStatus = resolveAggregateOperationalStatus({
        isClosedForLeave: isOnLeave,
        sessionStatuses: sessionOpStatuses,
      });

      const isClosed = aggregateOpStatus === ScheduleOperationalStatus.CLOSED;
      const scheduleStatus = aggregateOpStatus;

      let jadwalHariIni = '-';
      let jadwalPraktikMendatang = 'Tidak Ada Jadwal';

      if (isOnLeave) {
        jadwalPraktikMendatang = 'Dokter Cuti';
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
              'Status filter must use canonical values: OPEN, CLOSED.',
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
        tanggal_praktik: formatIndoDate(
          targetDate,
          dateFormatStyle as DateDisplayFormatStyle,
        ),
        avatar: ScheduleRecordMapper.toAvatarUrl(p.staffProfile),
        jadwal_hari_ini: jadwalHariIni,
        jadwal_praktik_mendatang: jadwalPraktikMendatang,
        status_jadwal: scheduleStatus,
        bulan_jadwal: formatIndoMonthYear(targetYear, targetMonth),
        is_on_leave: isOnLeave,
        leave_reason: leaveReason,
        leave_start: leaveStart,
        leave_end: leaveEnd,
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
