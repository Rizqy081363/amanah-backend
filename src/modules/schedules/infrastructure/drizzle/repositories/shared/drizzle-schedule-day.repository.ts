import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
} from '@database/schema';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  DEFAULT_TARGET_QUOTA,
} from '@modules/schedules/domain/constants/schedule.constants';
import {
  type CalendarSummaryResponse,
  type DayScheduleSettingEntity,
  ScheduleOperationalStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import {
  resolveAggregateOperationalStatus,
  resolveSessionOperationalStatus,
} from '@modules/schedules/domain/schedule-status';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, eq, gte, inArray, lte } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleDayRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
  ) {}

  async getCalendarSummary(
    staffId: string,
    month: string,
  ): Promise<CalendarSummaryResponse> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      return {
        month,
        days: [],
      };
    }
    const practitionerId = practitioner.id;

    // Month format: YYYY-MM
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const startDate = `${month}-01`;
    const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const [sessions, daySettings] = await Promise.all([
      this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
          gte(practitionerScheduleSessions.scheduleDate, startDate),
          lte(practitionerScheduleSessions.scheduleDate, endDate),
        ),
      }),
      this.db.query.practitionerScheduleDaySettings.findMany({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          gte(practitionerScheduleDaySettings.scheduleDate, startDate),
          lte(practitionerScheduleDaySettings.scheduleDate, endDate),
        ),
      }),
    ]);

    // Fetch actual appointment counts per session in one batch query.
    // The formula `capacity - availableSlots` is incorrect for CLOSED sessions
    // because availableSlots is forced to 0 on close, falsely reporting
    // bookedPatientCount = capacity (e.g. 12) even when no patients booked.
    const sessionIds = sessions.map((s) => s.id);
    const appointmentCountRows =
      sessionIds.length > 0
        ? await this.db
            .select({
              sessionId: appointments.scheduleSessionId,
              appointmentCount: count(appointments.id),
            })
            .from(appointments)
            .where(
              and(
                inArray(appointments.scheduleSessionId, sessionIds),
                inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
              ),
            )
            .groupBy(appointments.scheduleSessionId)
        : [];

    const appointmentCountBySessionId = new Map<string, number>(
      appointmentCountRows
        .filter((r) => r.sessionId !== null)
        .map((r) => [r.sessionId as string, Number(r.appointmentCount)]),
    );

    const days = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      const daySessions = sessions.filter((s) => s.scheduleDate === date);
      const daySetting = daySettings.find((ds) => ds.scheduleDate === date);

      const hasSchedule = daySessions.length > 0;
      const isCuti = daySetting?.isLeave ?? false;
      const cutiReason = isCuti ? (daySetting?.leaveReason ?? null) : null;
      const sessionCount = daySessions.length;
      const targetQuota =
        daySetting?.targetQuota ?? (hasSchedule ? DEFAULT_TARGET_QUOTA : 0);

      // Use actual appointment count (source of truth) instead of
      // capacity - availableSlots which is wrong for CLOSED sessions.
      const bookedPatientCount = daySessions.reduce(
        (acc, s) => acc + (appointmentCountBySessionId.get(s.id) ?? 0),
        0,
      );

      const capacityPercentage =
        targetQuota > 0
          ? Math.min(100, Math.round((bookedPatientCount / targetQuota) * 100))
          : 0;

      const daySessionStatuses = daySessions.map((s) =>
        resolveSessionOperationalStatus({
          isClosedForLeave: isCuti,
          availableSlots: isCuti
            ? 0
            : (s.availableSlots ?? s.capacity ?? DEFAULT_TARGET_QUOTA),
          persistedStatus: s.status,
        }),
      );

      const dayOpStatus = resolveAggregateOperationalStatus({
        isClosedForLeave: isCuti,
        sessionStatuses: daySessionStatuses,
      });

      const isClosed = dayOpStatus === ScheduleOperationalStatus.CLOSED;
      let dayNotes: string | null = null;

      if (isCuti) {
        dayNotes = cutiReason || 'Cuti Dokter';
      } else if (daySessions.length === 0) {
        dayNotes = null;
      } else if (dayOpStatus === ScheduleOperationalStatus.CLOSED) {
        dayNotes =
          daySetting?.leaveReason || 'Jadwal ditutup oleh dokter/admin';
      } else if (dayOpStatus === ScheduleOperationalStatus.OCCUPIED) {
        dayNotes = 'Interval terisi oleh pasien reservasi';
      }

      days.push({
        date,
        hasSchedule,
        isCuti,
        cutiReason,
        sessionCount,
        targetQuota,
        bookedPatientCount,
        capacityPercentage,
        status: dayOpStatus,
        isClosed,
        notes: dayNotes,
      });
    }

    return {
      month,
      days,
    };
  }

  async getDaySettings(
    staffId: string,
    date: string,
  ): Promise<DayScheduleSettingEntity> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      return {
        practitionerId: staffId,
        scheduleDate: date,
        targetQuota: DEFAULT_TARGET_QUOTA,
        isCuti: false,
        cutiReason: null,
        totalBookedPatients: 0,
        capacityPercentage: 0,
      };
    }
    const practitionerId = practitioner.id;

    const [daySetting, sessions] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      }),
      this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
          eq(practitionerScheduleSessions.scheduleDate, date),
        ),
      }),
    ]);

    // Use actual appointment count (source of truth).
    // The formula `capacity - availableSlots` is incorrect for CLOSED sessions
    // because availableSlots is forced to 0 on close, falsely reporting
    // totalBookedPatients = capacity even when no patients booked.
    const sessionIds = sessions.map((s) => s.id);
    const appointmentCountRows =
      sessionIds.length > 0
        ? await this.db
            .select({
              sessionId: appointments.scheduleSessionId,
              appointmentCount: count(appointments.id),
            })
            .from(appointments)
            .where(
              and(
                inArray(appointments.scheduleSessionId, sessionIds),
                inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
              ),
            )
            .groupBy(appointments.scheduleSessionId)
        : [];

    const totalBookedPatients = appointmentCountRows.reduce(
      (acc, r) => acc + Number(r.appointmentCount),
      0,
    );

    const targetQuota = daySetting?.targetQuota ?? DEFAULT_TARGET_QUOTA;
    const isCuti = daySetting?.isLeave ?? false;
    const cutiReason = isCuti ? (daySetting?.leaveReason ?? null) : null;
    const capacityPercentage =
      targetQuota > 0
        ? Math.min(100, Math.round((totalBookedPatients / targetQuota) * 100))
        : 0;

    return {
      id: daySetting?.id,
      practitionerId,
      scheduleDate: date,
      targetQuota,
      isCuti,
      cutiReason,
      totalBookedPatients,
      capacityPercentage,
    };
  }

  async upsertDaySettings(
    staffId: string,
    date: string,
    data: {
      targetQuota?: number;
      isCuti?: boolean;
      cutiReason?: string | null;
      userId?: string;
    },
  ): Promise<DayScheduleSettingEntity> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }
    const practitionerId = practitioner.id;

    const existing =
      await this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, date),
        ),
      });

    const targetQuota =
      data.targetQuota !== undefined
        ? data.targetQuota
        : (existing?.targetQuota ?? DEFAULT_TARGET_QUOTA);
    const isLeave =
      data.isCuti !== undefined ? data.isCuti : (existing?.isLeave ?? false);
    const leaveReason =
      data.cutiReason !== undefined
        ? data.cutiReason
        : (existing?.leaveReason ?? null);

    let settingId: string;

    if (existing) {
      const [updated] = await this.db
        .update(practitionerScheduleDaySettings)
        .set({
          targetQuota,
          isLeave,
          leaveReason,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleDaySettings.id, existing.id))
        .returning();
      settingId = updated.id;
    } else {
      const [inserted] = await this.db
        .insert(practitionerScheduleDaySettings)
        .values({
          practitionerId,
          scheduleDate: date,
          targetQuota,
          isLeave,
          leaveReason,
          createdBy: data.userId || null,
        })
        .returning();
      settingId = inserted.id;
    }

    // Attach daySettingId to any sessions on that date that do not have one
    await this.db
      .update(practitionerScheduleSessions)
      .set({
        daySettingId: settingId,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(practitionerScheduleSessions.practitionerId, practitionerId),
          eq(practitionerScheduleSessions.scheduleDate, date),
        ),
      );

    return this.getDaySettings(staffId, date);
  }
}
