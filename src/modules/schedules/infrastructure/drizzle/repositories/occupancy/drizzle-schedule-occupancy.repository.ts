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
  type ScheduleShiftSlotEntity,
  type ScheduleSlotConflictInfoEntity,
  type ScheduleSlotStatus,
} from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSlotStateResolver } from '@modules/schedules/domain/resolvers/schedule-slot-state.resolver';
import { parseClockTime } from '@modules/schedules/domain/schedule-projection';
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
      const proj = ScheduleSlotStateResolver.resolveContextProjection({
        scheduleDate: query.date,
        context: ctxDef,
        intervalMinutes: durationMinutes,
        openedRanges: doctorSessions.map((s) => ({
          id: s.id,
          startTime: s.startTime ? s.startTime.slice(0, 5) : '08:00',
          endTime: s.endTime ? s.endTime.slice(0, 5) : '12:00',
          status: s.status,
          sessionShift: s.sessionShift || undefined,
          notes: s.notes,
        })),
        appointments: doctorAppts.map((a) => ({
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
        leavePeriods: isCuti
          ? [
              {
                id: activeLeave?.id || daySetting?.id || 'leave',
                startDate: activeLeave?.startDate || query.date,
                endDate: activeLeave?.endDate || query.date,
                reason: cutiReason,
              },
            ]
          : [],
        closures: dayClosures.map((c) => ({
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
        rescheduleEvents: dayReschedules.map((r) => ({
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

      const slots: ScheduleShiftSlotEntity[] = proj.slots.map((slot) => {
        let isAvailable = true;
        let status: ScheduleSlotStatus = 'AVAILABLE';
        let displayLabel = 'Tersedia';
        let conflictInfo: ScheduleSlotConflictInfoEntity | null = null;

        const selfSession = activeSessions.find((s) => {
          if (s.practitionerId !== practitionerId) return false;
          const sessStart = parseClockTime(s.startTime.slice(0, 5));
          const sessEnd = parseClockTime(s.endTime.slice(0, 5));
          return sessStart < slot.endMinutes && sessEnd > slot.startMinutes;
        });

        if (slot.closure?.category === 'LEAVE' || isCuti) {
          isAvailable = false;
          status = 'CLOSED_LEAVE';
          displayLabel = 'Cuti';
          conflictInfo = {
            type: 'LEAVE',
            message:
              slot.closure?.reasonText ||
              cutiReason ||
              'Dokter tercatat sedang cuti',
            practitionerId,
            practitionerName,
          };
        } else if (selfSession) {
          isAvailable = false;
          status = 'OCCUPIED_BY_SELF';
          displayLabel = `Jadwal Anda (${selfSession.clinicRoom?.name || 'Ruangan'})`;
          conflictInfo = {
            type: 'SELF',
            message: 'Anda telah memiliki jadwal pada jam ini',
            sessionId: selfSession.id,
            practitionerId,
            practitionerName,
            roomId: selfSession.roomId,
            roomName: selfSession.clinicRoom?.name,
          };
        } else if (query.roomId) {
          const otherSession = activeSessions.find((s) => {
            if (s.roomId !== query.roomId) return false;
            if (s.practitionerId === practitionerId) return false;
            const sessStart = parseClockTime(s.startTime.slice(0, 5));
            const sessEnd = parseClockTime(s.endTime.slice(0, 5));
            return sessStart < slot.endMinutes && sessEnd > slot.startMinutes;
          });

          if (otherSession) {
            isAvailable = false;
            status = 'OCCUPIED_BY_OTHER';
            const otherDoctorName =
              otherSession.practitioner?.staffProfile?.fullName ||
              otherSession.practitioner?.displayName ||
              'Dokter lain';
            const roomName =
              otherSession.clinicRoom?.name || targetRoomName || 'Ruangan';
            displayLabel = `Terisi (${otherDoctorName} - ${roomName})`;
            conflictInfo = {
              type: 'OTHER',
              message: `Ruangan telah digunakan oleh ${otherDoctorName}`,
              sessionId: otherSession.id,
              practitionerId: otherSession.practitionerId,
              practitionerName: otherDoctorName,
              roomId: otherSession.roomId,
              roomName,
            };
          }
        }

        return {
          slotIndex: slot.slotIndex,
          startTime: slot.startTime,
          endTime: slot.endTime,
          timeRange: slot.timeRange,
          isAvailable,
          status,
          displayLabel,
          conflictInfo,
        };
      });

      const shiftAvailableCount = slots.filter((s) => s.isAvailable).length;
      const shiftOccupiedCount = slots.filter((s) => !s.isAvailable).length;

      shifts.push({
        contextId: ctxDef.contextId,
        contextLabel: ctxDef.contextLabel,
        sessionShift: ctxDef.sessionShift,
        timeRange: `${ctxDef.boundaryStartTime} - ${ctxDef.boundaryEndTime} WIB`,
        boundaryStartTime: ctxDef.boundaryStartTime,
        boundaryEndTime: ctxDef.boundaryEndTime,
        totalSlots: slots.length,
        availableSlotsCount: shiftAvailableCount,
        occupiedSlotsCount: shiftOccupiedCount,
        slots,
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
