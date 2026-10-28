import { ClinicConfigService } from '@common/clinic-config/clinic-config.service';
import { ClinicTimeService } from '@common/time/clinic-time.service';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  clinicClosures,
  clinicUnits,
  doctorAssignments,
  masterDays,
  sessionDefs,
  sessionSchedules,
  shiftExceptions,
} from '@database/schema';
import { filterEffectiveDoctorAssignments } from '@modules/schedules/domain/services/doctor-session-operational.resolver';
import {
  type DateDisplayFormatStyle,
  formatIndoDate,
} from '@modules/schedules/domain/services/schedule-date.formatter';
import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { and, asc, eq, isNull, or } from 'drizzle-orm';

interface BookingPractitionerItem {
  id: string;
  staffProfileId?: string;
  sessionId: string;
  name: string;
  avatarUrl: string | null;
  specialty: string;
  roomName: string;
  startTime: string;
  endTime: string;
}

interface BookingOptionSessionItem {
  session: string;
  shift: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  isPast: boolean;
  isDisabled: boolean;
  disabledReason: string | null;
  loadStatus: string;
  practitioners: BookingPractitionerItem[];
}

export interface BookingOptionsResponse {
  success: boolean;
  data: {
    date: string;
    dateFormatted?: string;
    dayOfWeek: number;
    dayName: string;
    poliklinikId: string | null;
    poliklinikName: string | null;
    estimatedDurationMinutes: number;
    sessions: BookingOptionSessionItem[];
  };
}

@Injectable()
export class DrizzleBookingOptionsQuery {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly clinicConfig: ClinicConfigService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
  ) {}

  private getTimezone(): string {
    return (
      this.clinicTimeService?.getTimezone() ||
      process.env.CLINIC_TIMEZONE ||
      'Asia/Jakarta'
    );
  }

  async execute(
    dateStr: string,
    poliklinikId?: string,
    staffId?: string,
  ): Promise<BookingOptionsResponse> {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw new BadRequestException({
        code: 'INVALID_DATE_FORMAT',
        message: 'Parameter tanggal harus berformat YYYY-MM-DD.',
      });
    }

    const targetDate = new Date(`${dateStr}T00:00:00Z`);
    const targetDow = targetDate.getUTCDay();

    const [
      policy,
      activeDefs,
      dayRecord,
      activeSchedules,
      unitRecord,
      assignments,
      exceptions,
      closures,
      dateFormatStyle,
    ] = await Promise.all([
      this.clinicConfig.getSchedulePolicy().catch(() => null),
      this.db.query.sessionDefs.findMany({
        where: eq(sessionDefs.isActive, true),
        orderBy: [asc(sessionDefs.sortOrder)],
      }),
      this.db.query.masterDays.findFirst({
        where: eq(masterDays.dow, targetDow),
      }),
      this.db.query.sessionSchedules.findMany({
        where: and(
          eq(sessionSchedules.dow, targetDow),
          eq(sessionSchedules.isActive, true),
        ),
      }),
      poliklinikId
        ? this.db.query.clinicUnits.findFirst({
            where: eq(clinicUnits.id, poliklinikId),
          })
        : null,
      this.db.query.doctorAssignments.findMany({
        where: and(
          eq(doctorAssignments.isActive, true),
          or(
            eq(doctorAssignments.dow, targetDow),
            isNull(doctorAssignments.dow),
          ),
        ),
        with: {
          sessionDef: true,
          preferredRoom: {
            with: { clinicUnit: true },
          },
          practitioner: {
            with: {
              staffProfile: {
                with: { clinicUnit: true },
              },
              medicalSpecialty: true,
            },
          },
        },
      }),
      this.db.query.shiftExceptions.findMany({
        where: eq(shiftExceptions.serviceDate, dateStr),
      }),
      this.db.query.clinicClosures.findMany({
        where: isNull(clinicClosures.cancelledAt),
      }),
      this.clinicConfig.getDateFormatStyle().catch(() => 'human_full'),
    ]);

    const estimatedDuration = policy?.defaultConsultationDurationMinutes ?? 30;

    // Filter assignments by poliklinik or staff
    let filteredAssignments = assignments;
    if (poliklinikId) {
      filteredAssignments = filteredAssignments.filter((da) => {
        const primaryUnit = da.practitioner?.staffProfile?.primaryUnitId;
        const roomUnit = da.preferredRoom?.unitId;
        return primaryUnit === poliklinikId || roomUnit === poliklinikId;
      });
    }
    if (staffId) {
      filteredAssignments = filteredAssignments.filter(
        (da) => da.doctorId === staffId,
      );
    }

    // Apply effective doctor assignment overrides (explicit dow shadows generic dow = null)
    const effectiveAssignments = filterEffectiveDoctorAssignments(
      filteredAssignments,
      targetDow,
    );

    // Filter out practitioners on leave for targetDate
    const availableAssignments = effectiveAssignments.filter((da) => {
      const isLeave = exceptions.some(
        (ex) =>
          ex.doctorId === da.doctorId &&
          ex.type === 'leave' &&
          (!ex.sessionId || ex.sessionId === da.sessionId),
      );
      return !isLeave;
    });

    // Check clinic-level or category-level closures
    const dayStartIso = `${dateStr}T00:00:00Z`;
    const dayEndIso = `${dateStr}T23:59:59Z`;
    const activeDayClosure = closures.find((c) => {
      if (c.cancelledAt) return false;
      const starts =
        typeof c.startsAt === 'string'
          ? c.startsAt
          : new Date(c.startsAt).toISOString();
      const ends =
        typeof c.endsAt === 'string'
          ? c.endsAt
          : new Date(c.endsAt).toISOString();
      const overlaps = starts <= dayEndIso && ends >= dayStartIso;
      if (!overlaps) return false;
      if (c.scope === 'clinic') return true;
      if (
        c.scope === 'category' &&
        poliklinikId &&
        c.categoryId === poliklinikId
      )
        return true;
      return false;
    });

    // Calculate current time for temporal checks if dateStr is today
    const nowInTz = new Date(
      new Date().toLocaleString('en-US', { timeZone: this.getTimezone() }),
    );
    const todayStrInTz = `${nowInTz.getFullYear()}-${String(nowInTz.getMonth() + 1).padStart(2, '0')}-${String(nowInTz.getDate()).padStart(2, '0')}`;
    const isToday = dateStr === todayStrInTz;
    const currentClockTime = `${String(nowInTz.getHours()).padStart(2, '0')}:${String(nowInTz.getMinutes()).padStart(2, '0')}`;

    const mappedSessions: BookingOptionSessionItem[] = activeDefs.map((def) => {
      // Operating time: template schedule > def default
      const sched = activeSchedules.find((s) => s.sessionId === def.id);
      const startTimeRaw = sched?.startsAt || def.defaultStartsAt || '';
      const endTimeRaw = sched?.endsAt || def.defaultEndsAt || '';
      const startTime = startTimeRaw ? startTimeRaw.slice(0, 5) : '';
      const endTime = endTimeRaw ? endTimeRaw.slice(0, 5) : '';

      // Practitioners assigned to this session
      const sessionAssignments = availableAssignments.filter(
        (da) => da.sessionId === def.id,
      );
      const practitioners: BookingPractitionerItem[] = sessionAssignments.map(
        (da) => {
          const staff = da.practitioner?.staffProfile;
          const name = staff?.fullName || da.practitioner?.displayName || '';
          const specialty =
            da.practitioner?.medicalSpecialty?.name ||
            staff?.clinicUnit?.name ||
            staff?.positionTitle ||
            '';
          const roomName = da.preferredRoom?.name || '';

          return {
            id: da.doctorId,
            staffProfileId: staff?.id,
            sessionId: `session-${da.id}-${dateStr}`,
            name,
            avatarUrl: staff?.avatarUrl || null,
            specialty,
            roomName,
            startTime,
            endTime,
          };
        },
      );

      // Temporal checks
      const isPast = isToday && currentClockTime >= endTime;

      // Status resolution
      let isDisabled = false;
      let disabledReason: string | null = null;

      const hasExplicitOverride = sessionAssignments.some(
        (da) => da.dow === targetDow,
      );
      const isClinicDayActive = dayRecord?.isActive ?? true;

      if (activeDayClosure) {
        isDisabled = true;
        disabledReason = activeDayClosure.reason || null;
      } else if (!isClinicDayActive && !hasExplicitOverride) {
        isDisabled = true;
        disabledReason = 'Hari Operasional Tutup';
      } else if (isPast) {
        isDisabled = true;
        disabledReason = 'Waktu Terlewati';
      } else if (!sched && sessionAssignments.length === 0) {
        isDisabled = true;
        disabledReason = 'Sesi Tutup';
      }

      const capacity = Math.max(practitioners.length, sched ? 1 : 0);

      return {
        session: def.code,
        shift: def.code,
        label: def.label,
        startTime,
        endTime,
        capacity,
        isPast,
        isDisabled,
        disabledReason,
        loadStatus: 'NORMAL',
        practitioners,
      };
    });

    return {
      success: true,
      data: {
        date: dateStr,
        dateFormatted: formatIndoDate(
          dateStr,
          dateFormatStyle as DateDisplayFormatStyle,
        ),
        dayOfWeek: targetDow,
        dayName: dayRecord?.nameId || '',
        poliklinikId: poliklinikId || null,
        poliklinikName: unitRecord?.name || null,
        estimatedDurationMinutes: estimatedDuration,
        sessions: mappedSessions,
      },
    };
  }
}
