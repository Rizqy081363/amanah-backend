import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { and, eq, sql } from 'drizzle-orm';
import { HybridAuthGuard, Roles, RolesGuard } from '../../../common/auth';
import { HttpCache } from '../../../common/decorators/http-cache.decorator';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  clinicSchedulePolicies,
  clinicUnits,
  practitionerScheduleSessions,
} from '../../../database/schema';
import {
  CANONICAL_STAFF_SHIFTS,
  type CanonicalSessionName,
  type CanonicalStaffShift,
  SHIFT_TIMING_CONFIGS,
} from '../domain/constants/schedule-shift.constants';
import {
  calculateDoctorSessionAvailableSlots,
  evaluateSessionTemporalAvailability,
} from '../domain/services/schedule-temporal-availability.service';
import {
  DEFAULT_FALLBACK_CAPACITY,
  resolveQueueLoadStatus,
} from '../../queue-engine/domain/constants/queue-load.constants';

interface BookingShiftDef {
  session: CanonicalSessionName;
  shift: CanonicalStaffShift;
  label: string;
  defaultStartTime: string;
  defaultEndTime: string;
}

const INDONESIAN_DAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

@ApiTags('Schedules (Jadwal Dokter & Antrean)')
@ApiBearerAuth('access-token')
@UseGuards(HybridAuthGuard, RolesGuard)
@Controller({ path: 'schedules', version: '1' })
export class PatientScheduleBookingController {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
  ) {}

  @Get('booking-options')
  @Roles('PATIENT', 'STAF', 'ADMIN')
  @ApiOperation({
    summary:
      'Mendapatkan opsi sesi booking jadwal per shift dengan flag isDisabled',
    description:
      'Menghasilkan 4 sesi (PAGI, SIANG, SORE, MALAM) lengkap dengan kuota, ketersediaan, daftar dokter, dan flag isDisabled. Front-end Flutter tidak perlu menghitung kalkulasi slot.',
  })
  @ApiQuery({ name: 'date', required: true, example: '2026-09-28' })
  @ApiQuery({ name: 'poliklinikId', required: false })
  @ApiQuery({ name: 'staffId', required: false })
  @ApiOkResponse({ description: 'Opsi sesi booking berhasil dimuat' })
  @HttpCache({
    ttlSeconds: 20,
    isPrivate: false,
    tags: ['schedule', 'booking'],
  })
  async getBookingOptions(
    @Query('date') dateStr: string,
    @Query('poliklinikId') poliklinikId?: string,
    @Query('staffId') staffId?: string,
  ) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_FORMAT',
        message: 'Parameter tanggal harus berformat YYYY-MM-DD.',
      });
    }

    const targetDate = new Date(`${dateStr}T00:00:00Z`);
    const dayOfWeek = targetDate.getUTCDay();
    const dayName = INDONESIAN_DAY_NAMES[dayOfWeek];

    const policy = await this.db.query.clinicSchedulePolicies.findFirst({
      where: eq(clinicSchedulePolicies.code, 'default'),
    });
    const estimatedDuration = policy?.defaultConsultationDurationMinutes ?? 30;

    let unitName: string | null = null;
    let unitRooms: Array<typeof clinicRooms.$inferSelect> = [];
    if (poliklinikId) {
      const unit = await this.db.query.clinicUnits.findFirst({
        where: eq(clinicUnits.id, poliklinikId),
      });
      if (unit) {
        unitName = unit.name;
        unitRooms = await this.db.query.clinicRooms.findMany({
          where: eq(clinicRooms.unitId, poliklinikId),
        });
      }
    }
    const unitRoomIds = new Set(unitRooms.map((r) => r.id));

    const sessionConditions = [
      eq(practitionerScheduleSessions.scheduleDate, dateStr),
      eq(practitionerScheduleSessions.status, 'open'),
      ...(staffId
        ? [eq(practitionerScheduleSessions.practitionerId, staffId)]
        : []),
    ];

    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(...sessionConditions),
      with: {
        practitioner: {
          with: {
            staffProfile: true,
            medicalSpecialty: true,
          },
        },
        clinicRoom: true,
      },
    });

    const existingAppointments =
      sessions.length > 0 && this.db.query.appointments
        ? await this.db.query.appointments.findMany({
            where: and(
              eq(appointments.scheduledDate, dateStr),
              sql`${appointments.status} NOT IN ('cancelled', 'no_show')`,
            ),
            columns: {
              id: true,
              scheduleSessionId: true,
              practitionerId: true,
              scheduledStartTime: true,
            },
          })
        : [];

    const bookingShifts: BookingShiftDef[] = CANONICAL_STAFF_SHIFTS.map(
      (shift) => {
        const config = SHIFT_TIMING_CONFIGS[shift];
        let startTime = `${config.defaultStartTime}:00`;
        let endTime = `${config.defaultEndTime}:00`;

        if (policy) {
          if (shift === 'early_morning') {
            startTime = `${policy.earlyMorningStart}:00`;
            endTime = `${policy.earlyMorningEnd}:00`;
          } else if (shift === 'morning') {
            startTime = `${policy.morningStart}:00`;
            endTime = `${policy.morningEnd}:00`;
          } else if (shift === 'afternoon') {
            startTime = `${policy.afternoonStart}:00`;
            endTime = `${policy.afternoonEnd}:00`;
          } else if (shift === 'night') {
            startTime = `${policy.nightStart}:00`;
            endTime = `${policy.nightEnd}:00`;
          }
        }

        return {
          session: config.session,
          shift: config.shift,
          label: `Shift ${config.label}`,
          defaultStartTime: startTime,
          defaultEndTime: endTime,
        };
      },
    );

    const mappedSessions = bookingShifts.map((shiftDef) => {
      const matching = sessions.filter((s) => {
        if (poliklinikId) {
          const roomUnitId = s.clinicRoom?.unitId;
          const matchesRoomUnit = roomUnitId
            ? roomUnitId === poliklinikId
            : false;
          const matchesRoomId = s.roomId ? unitRoomIds.has(s.roomId) : false;
          if (!matchesRoomUnit && !matchesRoomId) {
            return false;
          }
        }

        if (s.sessionShift) {
          return s.sessionShift === shiftDef.shift;
        }

        const startPrefix = s.startTime.slice(0, 5);
        const shiftStart = shiftDef.defaultStartTime.slice(0, 5);
        const shiftEnd = shiftDef.defaultEndTime.slice(0, 5);
        return startPrefix >= shiftStart && startPrefix < shiftEnd;
      });

      let totalCapacity = 0;
      let totalAvailable = 0;

      for (const s of matching) {
        totalCapacity += s.capacity;

        const bookedTimes = new Set(
          existingAppointments
            .filter(
              (a) =>
                (a.scheduleSessionId && a.scheduleSessionId === s.id) ||
                (a.practitionerId === s.practitionerId &&
                  a.scheduledStartTime &&
                  a.scheduledStartTime >= s.startTime &&
                  a.scheduledStartTime < s.endTime),
            )
            .map((a) => a.scheduledStartTime?.slice(0, 5))
            .filter(Boolean) as string[],
        );

        const doctorAvailable = calculateDoctorSessionAvailableSlots({
          scheduleDate: dateStr,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: s.capacity,
          availableSlots: s.availableSlots,
          durationMinutes: estimatedDuration,
          bookedStartTimes: bookedTimes,
        });

        totalAvailable += doctorAvailable;
      }

      const totalBooked = Math.max(0, totalCapacity - totalAvailable);

      const temporalResult = evaluateSessionTemporalAvailability({
        scheduleDate: dateStr,
        defaultTiming: {
          startTime: shiftDef.defaultStartTime,
          endTime: shiftDef.defaultEndTime,
        },
        practitionerSessions: matching.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        totalAvailableSlots: totalAvailable,
      });

      const practitionersList = matching.map((s) => ({
        id: s.practitionerId,
        staffProfileId: s.practitioner.staffProfileId,
        sessionId: s.id,
        name: s.practitioner.displayName,
        avatarUrl: s.practitioner.staffProfile?.avatarUrl || null,
        specialty: s.practitioner.medicalSpecialty?.name || '',
        roomName: s.clinicRoom?.name || 'Ruang Konsultasi',
        startTime: s.startTime,
        endTime: s.endTime,
      }));

      const effectiveCapacity =
        totalCapacity > 0 ? totalCapacity : DEFAULT_FALLBACK_CAPACITY;
      const loadRatio = totalBooked / effectiveCapacity;
      const loadStatus = resolveQueueLoadStatus(loadRatio);

      return {
        session: shiftDef.session,
        shift: shiftDef.shift,
        label: matching[0]?.sessionLabel || shiftDef.label,
        startTime: matching[0]?.startTime || shiftDef.defaultStartTime,
        endTime: matching[0]?.endTime || shiftDef.defaultEndTime,
        capacity: effectiveCapacity,
        availableSlots: temporalResult.effectiveAvailableSlots,
        bookedSlots: totalBooked,
        isPast: temporalResult.isPast,
        isDisabled: temporalResult.isDisabled,
        disabledReason: temporalResult.disabledReason,
        loadStatus,
        practitioners: practitionersList,
      };
    });

    return {
      success: true,
      data: {
        date: dateStr,
        dayOfWeek,
        dayName,
        poliklinikId: poliklinikId || null,
        poliklinikName: unitName,
        estimatedDurationMinutes: estimatedDuration,
        sessions: mappedSessions,
      },
    };
  }
}
