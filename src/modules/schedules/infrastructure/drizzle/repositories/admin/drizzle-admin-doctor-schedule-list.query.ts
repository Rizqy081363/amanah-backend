import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerLeavePeriods,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  practitioners,
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
import { ScheduleSlotFactory } from '@modules/schedules/domain/factories/schedule-slot.factory';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';
import {
  computeUpcomingSchedule,
  formatIndoDate,
  formatIndoMonthYear,
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
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    let targetDate = todayStr;

    if (query.date) {
      targetDate = query.date;
    } else if (query.month) {
      if (todayStr.startsWith(query.month)) {
        targetDate = todayStr;
      } else {
        targetDate = `${query.month}-01`;
      }
    }

    const [targetYear, targetMonth] = targetDate.split('-').map(Number);

    const [
      pracs,
      allDaySettings,
      allActiveLeaves,
      allSessions,
      allAppointments,
      clinicPolicy,
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
      this.db.query.practitionerScheduleDaySettings.findMany({
        where: eq(practitionerScheduleDaySettings.scheduleDate, targetDate),
      }),
      this.db.query.practitionerLeavePeriods.findMany({
        where: and(
          lte(practitionerLeavePeriods.startDate, targetDate),
          gte(practitionerLeavePeriods.endDate, targetDate),
        ),
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
    ]);

    const cards: AdminDoctorScheduleCardEntity[] = [];

    for (const p of pracs) {
      const daySetting = allDaySettings.find(
        (ds) => ds.practitionerId === p.id,
      );
      const activeLeave = allActiveLeaves.find(
        (al) => al.practitionerId === p.id,
      );
      const sessions = allSessions.filter((s) => s.practitionerId === p.id);

      const isCuti = Boolean(daySetting?.isLeave || activeLeave);
      const cutiReason = isCuti
        ? daySetting?.leaveReason || activeLeave?.reason || 'Cuti Dokter'
        : null;
      const cutiStart = activeLeave?.startDate || (isCuti ? targetDate : null);
      const cutiEnd = activeLeave?.endDate || (isCuti ? targetDate : null);

      const defaultRoomName = p.clinicRoom
        ? `${p.clinicRoom.name}${p.clinicRoom.location ? `, ${p.clinicRoom.location}` : ''}`
        : 'Belum Ditentukan';

      const sesiHarian: AdminDoctorDailySession[] = sessions.map((s) => {
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

        const matchingAppts = allAppointments.filter((a) => {
          if (a.scheduleSessionId && a.scheduleSessionId === s.id) return true;
          if (a.practitionerId !== s.practitionerId) return false;
          const aStart =
            a.scheduledStartTime?.length === 5
              ? `${a.scheduledStartTime}:00`
              : a.scheduledStartTime || '08:00:00';
          return aStart >= sessStart && aStart < sessEnd;
        });

        const durationMinutes =
          p.consultationDurationMinutes ||
          clinicPolicy.durationMinutes ||
          DEFAULT_CONSULTATION_DURATION_MINUTES;

        const metrics = ScheduleSlotFactory.calculateSessionMetrics({
          startTime: jamMulai,
          endTime: jamSelesai,
          durationMinutes,
          persistedCapacity: s.capacity,
          persistedAvailableSlots: s.availableSlots,
          bookedCount: matchingAppts.length,
          isCuti,
          isClosed: s.status === 'closed',
        });

        const roomName = s.clinicRoom
          ? `${s.clinicRoom.name}${s.clinicRoom.location ? `, ${s.clinicRoom.location}` : ''}`
          : defaultRoomName;

        const sessionOpStatus = resolveSessionOperationalStatus({
          isClosedForLeave: isCuti,
          availableSlots: metrics.availableSlots,
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

      const sessionOpStatuses = sesiHarian.map((s) => s.status_sesi);

      const totalCapacity =
        sesiHarian.length > 0
          ? sesiHarian.reduce((acc, s) => acc + s.kuota_pasien, 0)
          : (daySetting?.targetQuota ?? 0);
      const totalAvailable = isCuti
        ? 0
        : sesiHarian.reduce((acc, s) => acc + s.slot_tersedia, 0);
      const totalBooked = isCuti
        ? 0
        : sesiHarian.reduce((acc, s) => acc + s.pasien_terdaftar, 0);

      const aggregateOpStatus = resolveAggregateOperationalStatus({
        isClosedForLeave: isCuti,
        sessionStatuses: sessionOpStatuses,
      });

      const isClosed = aggregateOpStatus === ScheduleOperationalStatus.CLOSED;
      const scheduleStatus = aggregateOpStatus;

      let slotTerisiAkumulasi = 0;
      let slotKapasitasAkumulasi = 0;
      let displayAkumulasiSlot = '-';
      let jadwalHariIni = '-';
      let jadwalPraktikMendatang = 'Tidak Ada Jadwal';

      if (isCuti) {
        jadwalPraktikMendatang = 'Cuti Dokter';
      } else if (isClosed) {
        jadwalPraktikMendatang =
          sesiHarian.length === 0 ? 'Tidak Ada Jadwal' : 'Praktik Ditutup';
      } else {
        slotTerisiAkumulasi = totalBooked;
        slotKapasitasAkumulasi = totalCapacity;
        displayAkumulasiSlot = `${slotTerisiAkumulasi} / ${slotKapasitasAkumulasi}`;
        jadwalPraktikMendatang = computeUpcomingSchedule(
          targetDate,
          todayStr,
          sesiHarian,
          isCuti,
        );
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

      // Filters
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
        slot_tersedia: isClosed ? 0 : totalAvailable,
        kapasitas_per_hari: isClosed ? 0 : totalCapacity,
        jadwal_hari_ini: jadwalHariIni,
        jadwal_praktik_mendatang: jadwalPraktikMendatang,
        slot_terisi_akumulasi: slotTerisiAkumulasi,
        slot_kapasitas_akumulasi: slotKapasitasAkumulasi,
        display_akumulasi_slot: displayAkumulasiSlot,
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
