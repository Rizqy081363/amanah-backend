import { generateEntityVersion } from '@common/occ';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointments,
  practitionerScheduleDaySettings,
  practitionerScheduleSessions,
  queueTickets,
  scheduleRescheduleEvents,
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
import {
  isClosedScheduleStatus,
  SchedulePersistenceStatus,
} from '@modules/schedules/domain/schedule-status';
import { ScheduleContextResolver } from '@modules/schedules/domain/services/schedule-context-resolver';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { DrizzleScheduleAvailabilityRepository } from '@modules/schedules/infrastructure/drizzle/repositories/occupancy/drizzle-schedule-availability.repository';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import type { CheckRescheduleEligibilityQueryDto } from '@modules/schedules/presentation/dto/check-reschedule-eligibility-query.dto';
import type { RescheduleAdminDoctorSessionDto } from '@modules/schedules/presentation/dto/reschedule-admin-doctor-session.dto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { and, asc, eq, gt, gte, inArray, lt, not, or } from 'drizzle-orm';
import { DrizzleRescheduleEligibilityEvaluator } from './drizzle-reschedule-eligibility.evaluator';
import { publishRescheduleNotifications } from './reschedule-notification.helper';
import {
  mutateRescheduleSessionRecords,
} from './reschedule-session-mutation.helper';

@Injectable()
export class DrizzleScheduleRescheduleRepository {
  private readonly logger = new Logger(
    DrizzleScheduleRescheduleRepository.name,
  );
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
      targetContextId = ScheduleSessionFactory.resolveShiftFromClockTime(
        body.targetStartTime,
      ).contextId;
    }

    const context = ScheduleContextResolver.resolve(targetContextId);
    const targetRoomId =
      body.targetRoomId || session.roomId || practitioner.defaultRoomId || null;

    const durationMinutes =
      practitioner.consultationDurationMinutes &&
      practitioner.consultationDurationMinutes > 0
        ? practitioner.consultationDurationMinutes
        : 30;

    const sessStart =
      session.startTime.length === 5
        ? `${session.startTime}:00`
        : session.startTime;
    const sessEnd =
      session.endTime.length === 5 ? `${session.endTime}:00` : session.endTime;
    const sessStartMin = parseClockTime(session.startTime);
    const sessEndMin = parseClockTime(session.endTime);

    const sessionSlotsCount = Math.max(
      1,
      Math.floor((sessEndMin - sessStartMin) / durationMinutes),
    );
    const isSingleSlotMode = Boolean(body.sourceStartTime);

    const sourceSlotStartMin = isSingleSlotMode
      ? parseClockTime(body.sourceStartTime!)
      : sessStartMin;
    const sourceSlotEndMin = isSingleSlotMode
      ? sourceSlotStartMin + durationMinutes
      : sessEndMin;

    const timing = ScheduleSessionFactory.calculateSessionTiming(
      context,
      body.targetStartTime,
      { durationMinutes },
      {
        slotsCount: isSingleSlotMode ? 1 : sessionSlotsCount,
      },
    );

    const targetEndTime = timing.endTime;
    const targetSlotsCount = timing.capacity;

    const preview = await this.availabilityRepo.projectAvailability(
      practitioner.id,
      {
        date: body.targetDate,
        scheduleContextId: targetContextId,
        startTime: body.targetStartTime,
        endTime: targetEndTime,
        slotsCount: targetSlotsCount,
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

    const targetStartFormatted =
      body.targetStartTime.length === 5
        ? `${body.targetStartTime}:00`
        : body.targetStartTime;
    const targetEndFormatted =
      targetEndTime.length === 5 ? `${targetEndTime}:00` : targetEndTime;

    // Check if practitioner already has an open session on targetDate that covers targetStartTime..targetEndTime
    const candidateTargetSessions =
      await this.db.query.practitionerScheduleSessions.findMany({
        where: and(
          eq(practitionerScheduleSessions.practitionerId, practitioner.id),
          eq(practitionerScheduleSessions.scheduleDate, body.targetDate),
          eq(
            practitionerScheduleSessions.status,
            SchedulePersistenceStatus.OPEN,
          ),
        ),
      });

    const existingTargetSession = candidateTargetSessions.find((s) => {
      const sStart =
        s.startTime.length === 5 ? `${s.startTime}:00` : s.startTime;
      const sEnd = s.endTime.length === 5 ? `${s.endTime}:00` : s.endTime;
      return sStart <= targetStartFormatted && sEnd >= targetEndFormatted;
    });

    if (existingTargetSession) {
      // Check room conflict with other doctors
      if (targetRoomId) {
        const otherDoctorInRoom =
          await this.db.query.practitionerScheduleSessions.findFirst({
            where: and(
              eq(practitionerScheduleSessions.roomId, targetRoomId),
              eq(practitionerScheduleSessions.scheduleDate, body.targetDate),
              eq(
                practitionerScheduleSessions.status,
                SchedulePersistenceStatus.OPEN,
              ),
              not(
                eq(
                  practitionerScheduleSessions.practitionerId,
                  practitioner.id,
                ),
              ),
              lt(practitionerScheduleSessions.startTime, targetEndFormatted),
              gt(practitionerScheduleSessions.endTime, targetStartFormatted),
            ),
            with: {
              practitioner: { with: { staffProfile: true } },
              clinicRoom: true,
            },
          });
        if (otherDoctorInRoom) {
          const roomName = otherDoctorInRoom.clinicRoom?.name || 'Ruangan';
          const docName =
            otherDoctorInRoom.practitioner?.staffProfile?.fullName ||
            otherDoctorInRoom.practitioner?.displayName ||
            'Dokter lain';
          throw new ConflictException({
            code: 'ROOM_ALREADY_OCCUPIED',
            message: `${roomName} sudah dijadwalkan untuk ${docName} pada jam ${body.targetStartTime} - ${targetEndTime}.`,
          });
        }
      }
    } else {
      await this.conflictQuery.checkConflicts(
        practitioner.id,
        body.targetDate,
        body.targetStartTime,
        preview.projectedEndTime,
        targetRoomId,
        sessionId,
      );
    }

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
      with: {
        patientProfile: true,
      },
      orderBy: [asc(appointments.scheduledStartTime)],
    });

    const sourceSlotStartFormatted = `${formatClockTime(sourceSlotStartMin)}:00`;
    const sourceSlotEndFormatted = `${formatClockTime(sourceSlotEndMin)}:00`;

    const appointmentsToMove = isSingleSlotMode
      ? activeAppointments.filter((a) => {
          const aStart =
            a.scheduledStartTime.length === 5
              ? `${a.scheduledStartTime}:00`
              : a.scheduledStartTime;
          return (
            aStart >= sourceSlotStartFormatted &&
            aStart < sourceSlotEndFormatted
          );
        })
      : activeAppointments;

    const remainingAppointments = activeAppointments.filter(
      (a) => !appointmentsToMove.some((m) => m.id === a.id),
    );

    const previousSchedule = {
      date: session.scheduleDate,
      startTime: formatClockTime(sourceSlotStartMin),
      endTime: formatClockTime(sourceSlotEndMin),
      roomId: session.roomId,
    };

    let effectiveTargetSessionId = existingTargetSession
      ? existingTargetSession.id
      : sessionId;

    const updatedSession = await this.db.transaction(async (tx) => {
      if (existingTargetSession) {
        if (
          body.rescheduleActiveAppointments !== false &&
          appointmentsToMove.length > 0
        ) {
          await tx
            .update(appointments)
            .set({
              scheduleSessionId: existingTargetSession.id,
              scheduledDate: body.targetDate,
              scheduledStartTime: `${body.targetStartTime}:00`,
              scheduledEndTime: `${targetEndTime}:00`,
              roomId:
                targetRoomId || existingTargetSession.roomId || null,
              updatedAt: new Date().toISOString(),
            })
            .where(
              inArray(
                appointments.id,
                appointmentsToMove.map((a) => a.id),
              ),
            );

          await tx
            .update(queueTickets)
            .set({
              queueDate: body.targetDate,
              roomId: targetRoomId || existingTargetSession.roomId || undefined,
              carriedOver: true,
              updatedAt: new Date().toISOString(),
            })
            .where(
              inArray(
                queueTickets.appointmentId,
                appointmentsToMove.map((a) => a.id),
              ),
            );

          if (existingTargetSession.id !== session.id) {
            await tx
              .update(practitionerScheduleSessions)
              .set({
                availableSlots: Math.max(
                  0,
                  (existingTargetSession.availableSlots ?? 0) -
                    appointmentsToMove.length,
                ),
                updatedAt: new Date().toISOString(),
              })
              .where(
                eq(practitionerScheduleSessions.id, existingTargetSession.id),
              );
          }
        }

        if (existingTargetSession.id === session.id) {
          await tx
            .update(practitionerScheduleSessions)
            .set({
              scheduleDate: body.targetDate,
              startTime: `${body.targetStartTime}:00`,
              endTime: `${targetEndTime}:00`,
              roomId: targetRoomId || session.roomId,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(practitionerScheduleSessions.id, session.id));
        } else if (appointmentsToMove.length > 0) {
          await tx
            .update(practitionerScheduleSessions)
            .set({
              availableSlots: Math.min(
                session.capacity,
                (session.availableSlots ?? 0) + appointmentsToMove.length,
              ),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(practitionerScheduleSessions.id, session.id));
        }

        await tx.insert(scheduleRescheduleEvents).values({
          id: randomUUID(),
          scheduleSessionId: existingTargetSession.id,
          practitionerId: practitioner.id,
          sourceDate: session.scheduleDate,
          sourceStartTime: formatClockTime(sourceSlotStartMin),
          sourceEndTime: formatClockTime(sourceSlotEndMin),
          sourceRoomId: session.roomId,
          targetDate: body.targetDate,
          targetStartTime: body.targetStartTime,
          targetEndTime: preview.projectedEndTime,
          targetRoomId: targetRoomId || existingTargetSession.roomId,
          reasonCode: 'RESCHEDULE',
          reasonText:
            body.notes || body.reason || 'Reschedule jadwal janji temu pasien',
          movedAppointmentsCount: appointmentsToMove.length,
          createdAt: new Date().toISOString(),
        });

        const [refetchedTarget] = await tx
          .select()
          .from(practitionerScheduleSessions)
          .where(eq(practitionerScheduleSessions.id, existingTargetSession.id));

        return refetchedTarget || existingTargetSession;
      }

      if (
        body.rescheduleActiveAppointments !== false &&
        appointmentsToMove.length > 0
      ) {
        await tx
          .update(appointments)
          .set({
            scheduledDate: '1970-01-01',
          })
          .where(
            inArray(
              appointments.id,
              appointmentsToMove.map((a) => a.id),
            ),
          );
      }

      if (isSingleSlotMode) {
        effectiveTargetSessionId = randomUUID();
      }

      const targetSessionRecord = await mutateRescheduleSessionRecords({
        tx,
        isSingleSlotMode,
        sessionId,
        effectiveTargetSessionId,
        practitionerId: practitioner.id,
        session,
        body,
        context,
        preview,
        targetRoomId,
        appointmentsToMoveCount: appointmentsToMove.length,
        sourceSlotStartMin,
        sourceSlotEndMin,
        sessStartMin,
        sessEndMin,
        durationMinutes,
        remainingAppointments,
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
              scheduleSessionId: effectiveTargetSessionId,
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
            updatedAt: new Date().toISOString(),
          })
          .where(
            inArray(
              queueTickets.appointmentId,
              appointmentsToMove.map((a) => a.id),
            ),
          );
      }

      await tx.insert(scheduleRescheduleEvents).values({
        id: randomUUID(),
        scheduleSessionId: effectiveTargetSessionId,
        practitionerId: practitioner.id,
        sourceDate: session.scheduleDate,
        sourceStartTime: formatClockTime(sourceSlotStartMin),
        sourceEndTime: formatClockTime(sourceSlotEndMin),
        sourceRoomId: session.roomId,
        targetDate: body.targetDate,
        targetStartTime: body.targetStartTime,
        targetEndTime: preview.projectedEndTime,
        targetRoomId: targetRoomId,
        reasonCode: 'RESCHEDULE',
        reasonText: body.notes || body.reason || 'Reschedule jadwal dokter',
        movedAppointmentsCount: appointmentsToMove.length,
        createdAt: new Date().toISOString(),
      });

      const remainingOpenOnSource =
        await tx.query.practitionerScheduleSessions.findMany({
          where: and(
            eq(practitionerScheduleSessions.practitionerId, practitioner.id),
            eq(practitionerScheduleSessions.scheduleDate, session.scheduleDate),
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
                session.scheduleDate,
              ),
              eq(practitionerScheduleDaySettings.isLeave, false),
            ),
          );
      }

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

    const updatedProjection =
      await this.availabilityRepo.buildProjectionForSession(
        effectiveTargetSessionId,
        true,
      );

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
          capacity: updatedSession.capacity,
          availableSlots: updatedSession.availableSlots,
          status: updatedSession.status,
          roomId: updatedSession.roomId,
          notes: updatedSession.notes,
          version: generateEntityVersion(updatedSession.updatedAt),
        },
        rescheduledAppointmentsCount: appointmentsToMove.length,
        projection: updatedProjection,
      },
    };
  }
}
