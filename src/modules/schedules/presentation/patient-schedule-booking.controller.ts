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
import { and, eq } from 'drizzle-orm';
import {
  CurrentUser,
  HybridAuthGuard,
  Roles,
  RolesGuard,
} from '../../../common/auth';
import { DRIZZLE_SOURCE } from '../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../database/drizzle/drizzle.provider';
import {
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

    // Fetch clinic policy for duration
    const policy = await this.db.query.clinicSchedulePolicies.findFirst({
      where: eq(clinicSchedulePolicies.code, 'default'),
    });
    const estimatedDuration = policy?.defaultConsultationDurationMinutes ?? 30;

    // Fetch poliklinik and rooms if specified
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

    // Query active schedule sessions on this date
    const sessions = await this.db.query.practitionerScheduleSessions.findMany({
      where: and(
        eq(practitionerScheduleSessions.scheduleDate, dateStr),
        eq(practitionerScheduleSessions.status, 'open'),
      ),
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
        if (
          staffId &&
          s.practitioner?.staffProfileId !== staffId &&
          s.practitionerId !== staffId
        ) {
          return false;
        }

        if (poliklinikId) {
          const roomUnitId = s.clinicRoom?.unitId;
          const matchesRoomUnit = roomUnitId ? roomUnitId === poliklinikId : false;
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

      if (matching.length === 0) {
        return {
          session: shiftDef.session,
          shift: shiftDef.shift,
          label: shiftDef.label,
          startTime: shiftDef.defaultStartTime,
          endTime: shiftDef.defaultEndTime,
          capacity: 0,
          availableSlots: 0,
          bookedSlots: 0,
          isDisabled: true,
          disabledReason: 'Dokter/bidan tidak ada jadwal praktik pada sesi ini',
          practitioners: [],
        };
      }

      const totalCapacity = matching.reduce((sum, s) => sum + s.capacity, 0);
      const totalAvailable = matching.reduce(
        (sum, s) => sum + s.availableSlots,
        0,
      );
      const totalBooked = Math.max(0, totalCapacity - totalAvailable);
      const isFull = totalAvailable <= 0;

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

      return {
        session: shiftDef.session,
        shift: shiftDef.shift,
        label: matching[0]?.sessionLabel || shiftDef.label,
        startTime: matching[0]?.startTime || shiftDef.defaultStartTime,
        endTime: matching[0]?.endTime || shiftDef.defaultEndTime,
        capacity: totalCapacity,
        availableSlots: totalAvailable,
        bookedSlots: totalBooked,
        isDisabled: isFull,
        disabledReason: isFull
          ? 'Kuota antrean pada sesi ini sudah penuh'
          : null,
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
