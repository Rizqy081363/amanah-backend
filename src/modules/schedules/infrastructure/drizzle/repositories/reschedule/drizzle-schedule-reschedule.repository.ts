import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, or } from 'drizzle-orm';
import { generateEntityVersion } from '../../../../../../common/occ';
import { DRIZZLE_SOURCE } from '../../../../../../database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '../../../../../../database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
} from '../../../../../../database/schema';
import { ACTIVE_APPOINTMENT_STATUSES } from '../../../../domain/constants/schedule.constants';
import type { RescheduleEligibilityEntity } from '../../../../domain/entities/schedule.entity';
import { ScheduleSlotFactory } from '../../../../domain/factories/schedule-slot.factory';
import {
  formatClockTime,
  parseClockTime,
} from '../../../../domain/schedule-projection';
import {
  isClosedScheduleStatus,
  SchedulePersistenceStatus,
} from '../../../../domain/schedule-status';
import { ScheduleContextResolver } from '../../../../domain/services/schedule-context-resolver';
import type { CheckRescheduleEligibilityQueryDto } from '../../../../presentation/dto/check-reschedule-eligibility-query.dto';
import type { RescheduleAdminDoctorSessionDto } from '../../../../presentation/dto/reschedule-admin-doctor-session.dto';
import { ScheduleConflictQuery } from '../../queries/schedule-conflict.query';
import { PractitionerResolver } from '../../resolvers/practitioner.resolver';
import { DrizzleScheduleAvailabilityRepository } from '../occupancy/drizzle-schedule-availability.repository';
import { DrizzleRescheduleEligibilityEvaluator } from './drizzle-reschedule-eligibility.evaluator';

@Injectable()
export class DrizzleScheduleRescheduleRepository {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly practitionerResolver: PractitionerResolver,
    private readonly conflictQuery: ScheduleConflictQuery,
    private readonly availabilityRepo: DrizzleScheduleAvailabilityRepository,
    private readonly eligibilityEvaluator: DrizzleRescheduleEligibilityEvaluator = new DrizzleRescheduleEligibilityEvaluator(
      db,
      practitionerResolver,
      conflictQuery,
    ),
  ) {}

  async checkRescheduleEligibility(
    id: string,
    sessionId: string,
    query: CheckRescheduleEligibilityQueryDto,
  ): Promise<RescheduleEligibilityEntity> {
    return this.eligibilityEvaluator.evaluate(id, sessionId, query);
  }

  async rescheduleAdminDoctorSession(
    id: string,
    sessionId: string,
    body: RescheduleAdminDoctorSessionDto,
  ): Promise<any> {
    const practitioner = await this.practitionerResolver.resolve(id);
    if (!practitioner) {
      throw new NotFoundException(`Dokter dengan ID ${id} tidak ditemukan`);
    }

    const session = await this.db.query.practitionerScheduleSessions.findFirst({
      where: and(
        eq(practitionerScheduleSessions.id, sessionId),
        eq(practitionerScheduleSessions.practitionerId, practitioner.id),
      ),
    });

    if (!session) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    if (isClosedScheduleStatus(session.status)) {
      throw new UnprocessableEntityException({
        code: 'SESSION_NOT_ELIGIBLE_FOR_RESCHEDULE',
        message:
          'Sesi berstatus Tutup. Sesi yang sudah ditutup tidak dapat di-reschedule. Silakan gunakan menu Edit Jadwal untuk membuka sesi.',
        metadata: {
          sessionId: session.id,
          status: session.status,
        },
      });
    }

    let targetContextId = body.targetScheduleContextId;
    if (!targetContextId) {
      targetContextId = ScheduleSlotFactory.resolveShiftFromClockTime(
        body.targetStartTime,
      ).contextId;
    }

    const context = ScheduleContextResolver.resolve(targetContextId);
    const targetRoomId =
      body.targetRoomId || session.roomId || practitioner.defaultRoomId || null;

    const sessionDurationMinutes =
      parseClockTime(session.endTime) - parseClockTime(session.startTime);
    const targetEndMinutes =
      parseClockTime(body.targetStartTime) + sessionDurationMinutes;
    const targetEndTime = formatClockTime(targetEndMinutes);

    const preview = await this.availabilityRepo.projectAvailability(
      practitioner.id,
      {
        date: body.targetDate,
        scheduleContextId: targetContextId,
        startTime: body.targetStartTime,
        endTime: targetEndTime,
        slotsCount: session.capacity,
        fillShift: false,
        roomId: targetRoomId || undefined,
      },
      true,
    );

    if (
      preview.intervals.some((interval) => interval.closedReason === 'LEAVE')
    ) {
      throw new ConflictException({
        code: 'DATE_CLOSED',
        message:
          'Jadwal tidak dapat di-reschedule karena dokter tercatat sedang cuti pada tanggal target.',
        metadata: {
          targetDate: body.targetDate,
          closedReason: 'LEAVE',
        },
      });
    }

    await this.conflictQuery.checkConflicts(
      practitioner.id,
      body.targetDate,
      body.targetStartTime,
      preview.projectedEndTime,
      targetRoomId,
      sessionId,
    );

    const sessStart =
      session.startTime.length === 5
        ? `${session.startTime}:00`
        : session.startTime;
    const sessEnd =
      session.endTime.length === 5 ? `${session.endTime}:00` : session.endTime;

    const activeAppointments = await this.db.query.appointments.findMany({
      where: and(
        or(
          eq(appointments.scheduleSessionId, sessionId),
          and(
            eq(appointments.practitionerId, practitioner.id),
            eq(appointments.scheduledDate, session.scheduleDate),
            gte(appointments.scheduledStartTime, sessStart),
            lt(appointments.scheduledStartTime, sessEnd),
          ),
        ),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
      ),
      orderBy: [asc(appointments.scheduledStartTime)],
    });

    const previousSchedule = {
      date: session.scheduleDate,
      startTime: session.startTime.slice(0, 5),
      endTime: session.endTime.slice(0, 5),
      roomId: session.roomId,
    };

    const updatedSession = await this.db.transaction(async (tx) => {
      // 1. Shift active appointments if requested
      if (
        body.rescheduleActiveAppointments !== false &&
        activeAppointments.length > 0
      ) {
        const duration = preview.effectiveConsultationDurationMinutes;
        const startMin = parseClockTime(body.targetStartTime);

        for (let i = 0; i < activeAppointments.length; i++) {
          const appt = activeAppointments[i];
          const apptStartMin = startMin + i * duration;
          const apptEndMin = apptStartMin + duration;
          const apptStartTime = formatClockTime(apptStartMin);
          const apptEndTime = formatClockTime(apptEndMin);

          await tx
            .update(appointments)
            .set({
              scheduleSessionId: sessionId,
              scheduledDate: body.targetDate,
              scheduledStartTime: `${apptStartTime}:00`,
              scheduledEndTime: `${apptEndTime}:00`,
              roomId: targetRoomId || appt.roomId,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(appointments.id, appt.id));
        }
      }

      // 2. Update practitionerScheduleSessions
      const startTimeFormatted =
        body.targetStartTime.length === 5
          ? `${body.targetStartTime}:00`
          : body.targetStartTime;
      const endTimeFormatted =
        preview.projectedEndTime.length === 5
          ? `${preview.projectedEndTime}:00`
          : preview.projectedEndTime;

      const [rescheduled] = await tx
        .update(practitionerScheduleSessions)
        .set({
          scheduleDate: body.targetDate,
          startTime: startTimeFormatted,
          endTime: endTimeFormatted,
          sessionLabel: context.contextLabel,
          sessionShift: context.sessionShift,
          capacity: preview.capacity,
          availableSlots: Math.max(
            0,
            preview.capacity - activeAppointments.length,
          ),
          roomId: targetRoomId,
          notes:
            body.notes || body.reason
              ? `[RESCHEDULED] ${body.notes || body.reason}`
              : session.notes,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(practitionerScheduleSessions.id, sessionId))
        .returning();

      // 3. Cascade synchronize source date when no open sessions remain.
      const remainingOpenOnSource =
        await tx.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(practitionerScheduleSessions.practitionerId, practitioner.id),
            eq(
              practitionerScheduleSessions.scheduleDate,
              previousSchedule.date,
            ),
            eq(
              practitionerScheduleSessions.status,
              SchedulePersistenceStatus.OPEN,
            ),
          ),
        });

      if (remainingOpenOnSource.length === 0) {
        await tx
          .update(practitionerScheduleDaySettings)
          .set({
            leaveReason: null,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(
                practitionerScheduleDaySettings.practitionerId,
                practitioner.id,
              ),
              eq(
                practitionerScheduleDaySettings.scheduleDate,
                previousSchedule.date,
              ),
              eq(practitionerScheduleDaySettings.isLeave, false),
            ),
          );
      }

      return rescheduled;
    });

    const updatedProjection =
      await this.availabilityRepo.buildProjectionForSession(sessionId, true);

    return {
      success: true,
      message: 'Jadwal dokter berhasil dijadwalkan ulang (rescheduled)',
      data: {
        sessionId,
        practitionerId: practitioner.id,
        previousSchedule,
        rescheduledSchedule: {
          id: updatedSession.id,
          scheduleDate: updatedSession.scheduleDate,
          startTime: updatedSession.startTime.slice(0, 5),
          endTime: updatedSession.endTime.slice(0, 5),
          timeRange: `${updatedSession.startTime.slice(0, 5)} - ${updatedSession.endTime.slice(0, 5)} WIB`,
          sessionLabel: updatedSession.sessionLabel,
          sessionShift: updatedSession.sessionShift,
          capacity: updatedSession.capacity,
          availableSlots: updatedSession.availableSlots,
          status: updatedSession.status,
          roomId: updatedSession.roomId,
          notes: updatedSession.notes,
          version: generateEntityVersion(updatedSession.updatedAt),
        },
        rescheduledAppointmentsCount: activeAppointments.length,
        projection: updatedProjection,
      },
    };
  }
}
