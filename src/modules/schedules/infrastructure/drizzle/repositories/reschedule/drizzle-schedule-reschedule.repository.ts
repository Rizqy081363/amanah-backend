import { generateEntityVersion } from '@common/occ';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  clinicClosures,
  doctorAssignments,
  queueTickets,
  sessionDefs,
} from '@database/schema';
import { type NotificationPublisher } from '@modules/notifications/contracts/domain-event.interface';
import { NOTIFICATION_PUBLISHER } from '@modules/notifications/notifications.constants';
import { ACTIVE_APPOINTMENT_STATUSES } from '@modules/schedules/domain/constants/schedule.constants';
import type { RescheduleEligibilityEntity } from '@modules/schedules/domain/entities/schedule.entity';
import { ScheduleSessionFactory } from '@modules/schedules/domain/factories/schedule-session.factory';
import {
  formatClockTime,
  parseClockTime,
} from '@modules/schedules/domain/schedule-projection';
import { ScheduleContextResolver } from '@modules/schedules/domain/services/schedule-context-resolver';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { DrizzleScheduleAvailabilityRepository } from '@modules/schedules/infrastructure/drizzle/repositories/capacity/drizzle-schedule-availability.repository';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { CheckRescheduleEligibilityQueryDto } from '@modules/schedules/presentation/dto/check-reschedule-eligibility-query.dto';
import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { DrizzleRescheduleEligibilityEvaluator } from './drizzle-reschedule-eligibility.evaluator';
import { publishRescheduleNotifications } from './reschedule-notification.helper';
import { mutateRescheduleSessionRecords } from './reschedule-session-mutation.helper';

@Injectable()
export class DrizzleScheduleRescheduleRepository {
  private readonly practitionerResolver: PractitionerResolver;
  private readonly conflictQuery: ScheduleConflictQuery;
  private readonly availabilityRepo: DrizzleScheduleAvailabilityRepository;
  private readonly eligibilityEvaluator: DrizzleRescheduleEligibilityEvaluator;
  private notificationPublisher?: NotificationPublisher;

  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    @Optional()
    @Inject(NOTIFICATION_PUBLISHER)
    notificationPublisher?: NotificationPublisher,
    @Optional() practitionerResolver?: PractitionerResolver,
    @Optional() conflictQuery?: ScheduleConflictQuery,
    @Optional() availabilityRepo?: DrizzleScheduleAvailabilityRepository,
    @Optional() eligibilityEvaluator?: DrizzleRescheduleEligibilityEvaluator,
  ) {
    this.practitionerResolver =
      practitionerResolver ?? new PractitionerResolver(db);
    this.conflictQuery = conflictQuery ?? new ScheduleConflictQuery(db);
    this.availabilityRepo = availabilityRepo!;
    this.eligibilityEvaluator =
      eligibilityEvaluator ??
      new DrizzleRescheduleEligibilityEvaluator(
        db,
        this.practitionerResolver,
        this.conflictQuery,
      );
    this.notificationPublisher = notificationPublisher;
  }

  public setNotificationPublisher(publisher?: NotificationPublisher): void {
    this.notificationPublisher = publisher;
  }

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

    const sessionDef = await this.db.query.sessionDefs.findFirst({
      where: eq(sessionDefs.id, sessionId),
    });

    const assignment = sessionDef
      ? null
      : await this.db.query.doctorAssignments.findFirst({
          where: and(
            eq(doctorAssignments.id, sessionId),
            eq(doctorAssignments.doctorId, practitioner.id),
          ),
          with: {
            sessionDef: true,
          },
        });

    const effectiveSessionDef = sessionDef ?? assignment?.sessionDef;
    if (!effectiveSessionDef) {
      throw new NotFoundException(
        `Sesi jadwal dengan ID ${sessionId} tidak ditemukan untuk dokter ini`,
      );
    }

    const session = {
      id: effectiveSessionDef.id,
      scheduleDate: body.sourceDate,
      startTime: effectiveSessionDef.defaultStartsAt.slice(0, 5),
      endTime: effectiveSessionDef.defaultEndsAt.slice(0, 5),
      sessionShift: effectiveSessionDef.code,
      sessionLabel: effectiveSessionDef.code,
      roomId: assignment?.preferredRoomId || practitioner.defaultRoomId || null,
      notes: null as string | null,
    };

    const allDefs = await this.db.query.sessionDefs.findMany({
      where: eq(sessionDefs.isActive, true),
      orderBy: [asc(sessionDefs.sortOrder)],
    });

    const shiftDefs = allDefs.map((sd) => {
      const boundaryStartTime = (sd.defaultStartsAt || '00:00').slice(0, 5);
      const boundaryEndTime = (sd.defaultEndsAt || '24:00').slice(0, 5);
      const label = sd.label || sd.code;
      return {
        shift: sd.code,
        sessionShift: sd.code,
        contextId: sd.id,
        label,
        contextLabel: label,
        boundaryStartTime,
        boundaryEndTime,
        boundaryStartMinutes: parseClockTime(boundaryStartTime),
        boundaryEndMinutes: parseClockTime(boundaryEndTime),
        aliases: [sd.code],
      };
    });

    let targetContextId = body.targetScheduleContextId;
    if (!targetContextId) {
      targetContextId = ScheduleSessionFactory.resolveShiftFromClockTime(
        body.targetStartTime,
        shiftDefs,
      ).contextId;
    }

    const context = ScheduleContextResolver.resolve(targetContextId, shiftDefs);
    const targetRoomId =
      body.targetRoomId || session.roomId || practitioner.defaultRoomId || null;

    const durationMinutes =
      practitioner.consultationDurationMinutes &&
      practitioner.consultationDurationMinutes > 0
        ? practitioner.consultationDurationMinutes
        : 30;

    const sessStart = `${session.startTime}:00`;
    const sessEnd = `${session.endTime}:00`;
    const sessStartMin = parseClockTime(session.startTime);
    const sessEndMin = parseClockTime(session.endTime);

    const isPartialShiftMode = Boolean(body.sourceStartTime);

    const sourceRangeStartMin = isPartialShiftMode
      ? parseClockTime(body.sourceStartTime!)
      : sessStartMin;
    const sourceRangeEndMin = isPartialShiftMode
      ? sourceRangeStartMin + durationMinutes
      : sessEndMin;

    const timing = ScheduleSessionFactory.calculateSessionTiming(
      context,
      body.targetStartTime,
      { durationMinutes },
    );

    const targetEndTime = timing.endTime;

    const preview = await this.availabilityRepo.projectAvailability(
      practitioner.id,
      {
        date: body.targetDate,
        scheduleContextId: targetContextId,
        startTime: body.targetStartTime,
        endTime: targetEndTime,
        fillShift: false,
        roomId: targetRoomId || undefined,
      },
      true,
    );

    if (
      preview.closedReason === 'LEAVE' ||
      preview.intervals?.some((interval) => interval.closedReason === 'LEAVE')
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

    const activeAppointments = await this.db.query.appointments.findMany({
      where: and(
        eq(appointments.practitionerId, practitioner.id),
        eq(appointments.scheduledDate, session.scheduleDate),
        gte(appointments.scheduledStartTime, sessStart),
        lt(appointments.scheduledStartTime, sessEnd),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
      ),
      with: {
        patientProfile: true,
      },
      orderBy: [asc(appointments.scheduledStartTime)],
    });

    const sourceRangeStartFormatted = `${formatClockTime(sourceRangeStartMin)}:00`;
    const sourceRangeEndFormatted = `${formatClockTime(sourceRangeEndMin)}:00`;

    const appointmentsToMove = isPartialShiftMode
      ? activeAppointments.filter((a) => {
          const aStart =
            a.scheduledStartTime.length === 5
              ? `${a.scheduledStartTime}:00`
              : a.scheduledStartTime;
          return (
            aStart >= sourceRangeStartFormatted &&
            aStart < sourceRangeEndFormatted
          );
        })
      : activeAppointments;

    const previousSchedule = {
      date: session.scheduleDate,
      startTime: formatClockTime(sourceRangeStartMin),
      endTime: formatClockTime(sourceRangeEndMin),
      roomId: session.roomId,
    };

    let effectiveTargetSessionId = sessionId;
    if (isPartialShiftMode) {
      effectiveTargetSessionId = randomUUID();
    }

    const updatedSession = await this.db.transaction(async (tx) => {
      const targetSessionRecord = await mutateRescheduleSessionRecords({
        tx,
        isPartialShiftMode,
        sessionId,
        effectiveTargetSessionId,
        practitionerId: practitioner.id,
        session,
        body,
        context,
        preview,
        targetRoomId,
      });

      if (
        body.rescheduleActiveAppointments !== false &&
        appointmentsToMove.length > 0
      ) {
        const duration = preview.effectiveConsultationDurationMinutes;
        const startMin = parseClockTime(body.targetStartTime);

        for (let i = 0; i < appointmentsToMove.length; i++) {
          const appt = appointmentsToMove[i];
          const apptStartMin = startMin + i * duration;
          const apptEndMin = apptStartMin + duration;
          const apptStartTime = formatClockTime(apptStartMin);
          const apptEndTime = formatClockTime(apptEndMin);

          await tx
            .update(appointments)
            .set({
              scheduledDate: body.targetDate,
              scheduledStartTime: `${apptStartTime}:00`,
              scheduledEndTime: `${apptEndTime}:00`,
              roomId: targetRoomId || appt.roomId,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(appointments.id, appt.id));
        }

        await tx
          .update(queueTickets)
          .set({
            queueDate: body.targetDate,
            roomId: targetRoomId || undefined,
            carriedOver: true,
            updatedAt: new Date().toISOString(),
          })
          .where(
            inArray(
              queueTickets.appointmentId,
              appointmentsToMove.map((a) => a.id),
            ),
          );
      }

      await tx.insert(clinicClosures).values({
        scope: 'doctor',
        doctorId: practitioner.id,
        startsAt: `${session.scheduleDate}T${formatClockTime(sourceRangeStartMin)}:00Z`,
        endsAt: `${session.scheduleDate}T${formatClockTime(sourceRangeEndMin)}:00Z`,
        inputKind: 'session',
        reason: body.notes ? body.notes : 'Reschedule',
      });

      return targetSessionRecord;
    });

    if (body.rescheduleActiveAppointments !== false) {
      await publishRescheduleNotifications({
        notificationPublisher: this.notificationPublisher,
        db: this.db,
        appointmentsToMove,
        targetDate: body.targetDate,
        targetStartTime: body.targetStartTime,
        durationMinutes: preview.effectiveConsultationDurationMinutes,
        practitioner,
        notes: body.notes,
        reason: body.reason,
      });
    }

    return {
      success: true,
      message: 'Jadwal dokter berhasil dijadwalkan ulang (rescheduled)',
      data: {
        sessionId: effectiveTargetSessionId,
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
          status: updatedSession.status,
          roomId: updatedSession.roomId,
          notes: updatedSession.notes,
          version: generateEntityVersion(updatedSession.updatedAt),
        },
        rescheduledAppointmentsCount: appointmentsToMove.length,
        projection: preview,
      },
    };
  }
}
