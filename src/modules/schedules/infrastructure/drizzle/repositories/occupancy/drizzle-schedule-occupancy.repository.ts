import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicRooms,
  practitionerLeavePeriods,
  practitionerScheduleClosures,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  scheduleRescheduleEvents,
} from '@database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import { SCHEDULE_CONTEXT_DEFINITIONS } from '@modules/schedules/domain/constants/schedule-context.constants';
import {
  type ScheduleOccupancyOverviewData,
  type ScheduleShiftOccupancyEntity,
} from '@modules/schedules/domain/entities/schedule.entity';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { ScheduleOccupancyQueryDto } from '@modules/schedules/presentation/dto/schedule-occupancy-query.dto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, inArray, lte, or } from 'drizzle-orm';

@Injectable()
export class DrizzleScheduleOccupancyRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly policyReader: SchedulePolicyReader,
  ) {}

  async getOccupancyOverview(
    staffId: string,
    query: ScheduleOccupancyQueryDto,
  ): Promise<ScheduleOccupancyOverviewData> {
    const practitioner = await this.practitionerResolver.resolve(staffId);
    if (!practitioner) {
      throw new NotFoundException(
        `Praktisi medis dengan ID staf ${staffId} tidak ditemukan`,
      );
    }

    const practitionerId = practitioner.id;
    const practitionerName =
      practitioner.staffProfile?.fullName ||
      practitioner.displayName ||
      'Dokter';
    const policy = await this.policyReader.getPolicy(practitioner);
    const durationMinutes = policy.durationMinutes;

    // 1. Check if doctor is on leave on target date
    const [daySetting, activeLeave] = await Promise.all([
      this.db.query.practitionerScheduleDaySettings.findFirst({
        where: and(
          eq(practitionerScheduleDaySettings.practitionerId, practitionerId),
          eq(practitionerScheduleDaySettings.scheduleDate, query.date),
        ),
      }),
      this.db.query.practitionerLeavePeriods.findFirst({
        where: and(
          eq(practitionerLeavePeriods.practitionerId, practitionerId),
          lte(practitionerLeavePeriods.startDate, query.date),
          gte(practitionerLeavePeriods.endDate, query.date),
        ),
      }),
    ]);

    const isCuti = Boolean(daySetting?.isLeave || activeLeave);
    const cutiReason = isCuti
      ? daySetting?.leaveReason || activeLeave?.reason || 'Cuti'
      : null;

    // 2. Resolve room name if roomId provided
    let targetRoomName: string | null = null;
    if (query.roomId) {
      const room = await this.db.query.clinicRooms.findFirst({
        where: eq(clinicRooms.id, query.roomId),
      });
      targetRoomName = room?.name || 'Ruangan';
    }

    // 3. Fetch active sessions, appointments, closures, and reschedules on target date
    const [activeSessions, dayAppointments, dayClosures, dayReschedules] =
      await Promise.all([
        this.db.query.practitionerScheduleSessions.findMany({
          where: eq(practitionerScheduleSessions.scheduleDate, query.date),
          with: {
            practitioner: {
              with: {
                staffProfile: true,
              },
            },
            clinicRoom: true,
          },
        }),
        this.db.query.appointments.findMany({
          where: and(
            eq(appointments.scheduledDate, query.date),
            inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
          ),
          with: {
            patientProfile: true,
            queueTickets: true,
          },
        }),
        this.db.query.practitionerScheduleClosures?.findMany
          ? this.db.query.practitionerScheduleClosures.findMany({
              where: and(
                eq(practitionerScheduleClosures.practitionerId, practitionerId),
                eq(practitionerScheduleClosures.scheduleDate, query.date),
              ),
            })
          : Promise.resolve([]),
        this.db.query.scheduleRescheduleEvents?.findMany
          ? this.db.query.scheduleRescheduleEvents.findMany({
              where: and(
                eq(scheduleRescheduleEvents.practitionerId, practitionerId),
                or(
                  eq(scheduleRescheduleEvents.targetDate, query.date),
                  eq(scheduleRescheduleEvents.sourceDate, query.date),
                ),
              ),
            })
          : Promise.resolve([]),
      ]);

    // 4. Construct the 4 shifts and their slots using authoritative resolver
    const shifts: ScheduleShiftOccupancyEntity[] = [];

    const doctorSessions = activeSessions.filter(
      (s) => s.practitionerId === practitionerId,
    );
    const doctorAppts = dayAppointments.filter(
      (a) => a.practitionerId === practitionerId,
    );

    for (const ctxDef of SCHEDULE_CONTEXT_DEFINITIONS) {
      const shiftSessions = doctorSessions.filter(
        (s) => s.sessionShift === ctxDef.shift,
      );
      const shiftCap = shiftSessions.reduce(
        (acc, s) => acc + (s.capacity || 0),
        0,
      );
      const shiftAvail = shiftSessions.reduce(
        (acc, s) => acc + (s.availableSlots || 0),
        0,
      );
      const shiftOcc = Math.max(0, shiftCap - shiftAvail);

      shifts.push({
        contextId: ctxDef.contextId,
        contextLabel: ctxDef.contextLabel,
        sessionShift: ctxDef.sessionShift,
        timeRange: `${ctxDef.boundaryStartTime} - ${ctxDef.boundaryEndTime} WIB`,
        boundaryStartTime: ctxDef.boundaryStartTime,
        boundaryEndTime: ctxDef.boundaryEndTime,
        totalSlots: shiftCap,
        availableSlotsCount: isCuti ? 0 : shiftAvail,
        occupiedSlotsCount: isCuti ? 0 : shiftOcc,
        slots: [],
      });
    }

    const totalSlots = shifts.reduce((acc, s) => acc + s.totalSlots, 0);
    const availableSlots = shifts.reduce(
      (acc, s) => acc + s.availableSlotsCount,
      0,
    );
    const occupiedSlots = shifts.reduce(
      (acc, s) => acc + s.occupiedSlotsCount,
      0,
    );

    return {
      date: query.date,
      practitionerId,
      practitionerName,
      effectiveConsultationDurationMinutes: durationMinutes,
      roomId: query.roomId || null,
      roomName: targetRoomName,
      isCuti,
      cutiReason,
      summary: {
        totalShifts: shifts.length,
        totalSlots,
        availableSlots,
        occupiedSlots,
      },
      shifts,
    };
  }
}
