import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  clinicRooms,
  practitionerScheduleSessions,
  practitioners,
} from '@database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, not, sql } from 'drizzle-orm';
import { ClinicConfigService } from '@common/clinic-config';
import { RedisService } from '../../../../common/redis/redis.service';
import { ACTIVE_APPOINTMENT_STATUSES } from '../../../schedules/domain/constants/schedule.constants';
import {
  resolveSessionFromTime,
  SESSION_TO_SHIFT_MAP,
} from '../../../schedules/domain/constants/schedule-shift.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { SchedulePersistenceStatus } from '../../../schedules/domain/schedule-status';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
  DoctorCollisionException,
  RoomOccupiedException,
} from '../../domain/errors/appointment-assignment.errors';
import { AppointmentTemporalStatusHelper } from '../../domain/helpers/appointment-temporal-status.helper';
import { AppointmentNotificationPublisher } from '../appointment-notification.publisher';

export interface ChangeDoctorOptions {
  closeOldSchedule?: boolean;
  reason?: string;
}

@Injectable()
export class AppointmentAssignmentService {
  constructor(
    @Inject(DRIZZLE_SOURCE)
    private readonly db: DrizzleDatabase,
    private readonly redisService: RedisService,
    private readonly notificationPublisher: AppointmentNotificationPublisher,
    private readonly clinicConfig: ClinicConfigService,
    @Inject('FIND_APPOINTMENT_BY_ID')
    private readonly findAppointmentById: (
      id: string,
    ) => Promise<AppointmentEntity | null>,
  ) {}

  async changeDoctor(
    appointmentId: string,
    targetDoctorId: string,
    optionsOrUser?: ChangeDoctorOptions | any,
    user?: any,
  ): Promise<AppointmentEntity> {
    const opts: ChangeDoctorOptions | undefined =
      optionsOrUser &&
      ('closeOldSchedule' in optionsOrUser || 'reason' in optionsOrUser)
        ? optionsOrUser
        : undefined;
    const currentUser = opts ? user : optionsOrUser;

    await this.db.transaction(async (tx) => {
      // 1. Lock appointment row
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) throw new AppointmentNotFoundException(appointmentId);
      if (apt.status === 'cancelled' || apt.status === 'completed') {
        throw new AppointmentTerminalStateException(apt.status);
      }
      if (apt.practitionerId === targetDoctorId) {
        return; // Idempotent no-op
      }

      // 2. Validate target practitioner
      const targetDoc = await tx.query.practitioners.findFirst({
        where: eq(practitioners.id, targetDoctorId),
        with: { staffProfile: true, clinicRoom: true },
      });
      if (!targetDoc?.isAcceptingAppointments) {
        throw new DoctorCollisionException(
          targetDoc?.displayName || 'Target',
          'Dokter tidak tersedia atau tidak menerima janji temu',
        );
      }

      // 3. Collision check: ensure target doctor is not already occupied at this exact slot
      const existingConflict = await tx.query.appointments.findFirst({
        where: and(
          eq(appointments.practitionerId, targetDoctorId),
          eq(appointments.scheduledDate, apt.scheduledDate),
          eq(appointments.scheduledStartTime, apt.scheduledStartTime),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
          not(eq(appointments.id, appointmentId)),
        ),
      });

      if (existingConflict) {
        const isConflictFinished =
          ['completed', 'cancelled', 'no_show'].includes(
            existingConflict.status,
          ) ||
          AppointmentTemporalStatusHelper.isElapsed({
            scheduledDate: existingConflict.scheduledDate,
            scheduledStartTime: existingConflict.scheduledStartTime,
            scheduledEndTime: existingConflict.scheduledEndTime,
          });

        if (!isConflictFinished) {
          throw new DoctorCollisionException(
            targetDoc.displayName ||
              targetDoc.staffProfile?.fullName ||
              'Dokter',
            `${apt.scheduledStartTime.slice(0, 5)} WIB`,
          );
        }
      }

      // 4. Resolve or create target schedule session
      let targetSessionId = apt.scheduleSessionId;
      let targetRoomId = apt.roomId;

      const matchingSession =
        await tx.query.practitionerScheduleSessions.findFirst({
          where: and(
            eq(practitionerScheduleSessions.practitionerId, targetDoctorId),
            eq(practitionerScheduleSessions.scheduleDate, apt.scheduledDate),
            sql`${practitionerScheduleSessions.startTime} <= ${apt.scheduledStartTime}`,
            sql`${practitionerScheduleSessions.endTime} > ${apt.scheduledStartTime}`,
          ),
        });

      if (matchingSession) {
        targetSessionId = matchingSession.id;
        targetRoomId =
          apt.roomId || matchingSession.roomId || targetDoc.defaultRoomId;
      } else {
        // Create canonical schedule session on-the-fly for target doctor
        const sessionName = resolveSessionFromTime(apt.scheduledStartTime);
        const shift = SESSION_TO_SHIFT_MAP[sessionName] || 'morning';
        const policy = await this.clinicConfig.getSchedulePolicy();
        const duration = policy.defaultConsultationDurationMinutes;

        const effectiveRoomId = apt.roomId || targetDoc.defaultRoomId;

        const [createdSession] = await tx
          .insert(practitionerScheduleSessions)
          .values({
            practitionerId: targetDoctorId,
            scheduleDate: apt.scheduledDate,
            sessionLabel: `Sesi ${shift.toUpperCase()}`,
            sessionShift: shift,
            startTime: apt.scheduledStartTime,
            endTime:
              apt.scheduledEndTime ||
              sql`${apt.scheduledStartTime}::time + interval '${duration} minutes'`,
            capacity: 1,
            status: SchedulePersistenceStatus.OPEN,
            roomId: effectiveRoomId,
          })
          .returning();

        targetSessionId = createdSession.id;
        targetRoomId = effectiveRoomId;
      }

      // 5. Transfer session status (old session close if requested)
      if (apt.scheduleSessionId && apt.scheduleSessionId !== targetSessionId) {
        if (opts?.closeOldSchedule) {
          await tx
            .update(practitionerScheduleSessions)
            .set({
              status: SchedulePersistenceStatus.CLOSED,
              notes: opts?.reason || 'Sesi ditutup saat pengalihan dokter',
            })
            .where(eq(practitionerScheduleSessions.id, apt.scheduleSessionId));
        }
      }

      // 6. Update appointment assignment
      await tx
        .update(appointments)
        .set({
          practitionerId: targetDoctorId,
          scheduleSessionId: targetSessionId,
          roomId: targetRoomId,
          updatedBy: currentUser?.id || currentUser?.sub,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appointments.id, appointmentId));

      // 7. Audit log event
      const defaultReason = `Perubahan dokter ke ${targetDoc.displayName || targetDoc.staffProfile?.fullName || targetDoctorId}`;
      const finalReason = opts?.reason
        ? `${opts.reason} (Target: ${targetDoc.displayName || targetDoctorId})`
        : defaultReason;

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus: apt.status,
        newStatus: apt.status,
        reason: opts?.closeOldSchedule
          ? `${finalReason} - Sesi dokter sebelumnya ditutup`
          : finalReason,
        changedBy: currentUser?.id || currentUser?.sub,
      });
    });

    // 8. Invalidate Redis caches
    await this.redisService.deleteByPrefix('queue:');
    await this.redisService.invalidateTags('schedule', 'appointment', 'queue');

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    // 9. Publish real-time events via NotificationPublisher & Socket.IO
    await this.notificationPublisher.publishAssignmentChanged(
      updated,
      {
        doctorName: updated.doctorName,
        roomName: updated.roomName,
        type: 'doctor',
      },
      currentUser,
    );

    return updated;
  }

  async changeRoom(
    appointmentId: string,
    targetRoomId: string,
    user?: any,
  ): Promise<AppointmentEntity> {
    await this.db.transaction(async (tx) => {
      const [apt] = await tx
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .for('update');

      if (!apt) throw new AppointmentNotFoundException(appointmentId);
      if (apt.status === 'cancelled' || apt.status === 'completed') {
        throw new AppointmentTerminalStateException(apt.status);
      }
      if (apt.roomId === targetRoomId) {
        return; // Idempotent no-op
      }

      // Check room collision
      const conflictingAppt = await tx.query.appointments.findFirst({
        where: and(
          eq(appointments.roomId, targetRoomId),
          eq(appointments.scheduledDate, apt.scheduledDate),
          eq(appointments.scheduledStartTime, apt.scheduledStartTime),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
          not(eq(appointments.id, appointmentId)),
        ),
      });

      if (conflictingAppt) {
        const isApptFinished =
          ['completed', 'cancelled', 'no_show'].includes(
            conflictingAppt.status,
          ) ||
          AppointmentTemporalStatusHelper.isElapsed({
            scheduledDate: conflictingAppt.scheduledDate,
            scheduledStartTime: conflictingAppt.scheduledStartTime,
            scheduledEndTime: conflictingAppt.scheduledEndTime,
          });

        if (!isApptFinished) {
          const room = await tx.query.clinicRooms.findFirst({
            where: eq(clinicRooms.id, targetRoomId),
          });
          throw new RoomOccupiedException(
            room?.name || 'Ruangan',
            `${apt.scheduledStartTime.slice(0, 5)} WIB`,
          );
        }
      }

      // Check room collision with other doctor schedule sessions
      const conflictingSession = tx.query.practitionerScheduleSessions
        ?.findFirst
        ? await tx.query.practitionerScheduleSessions.findFirst({
            where: and(
              eq(practitionerScheduleSessions.roomId, targetRoomId),
              eq(practitionerScheduleSessions.scheduleDate, apt.scheduledDate),
              eq(practitionerScheduleSessions.status, 'open'),
              sql`${practitionerScheduleSessions.startTime} <= ${apt.scheduledStartTime}::time AND ${practitionerScheduleSessions.endTime} > ${apt.scheduledStartTime}::time`,
              apt.practitionerId
                ? not(
                    eq(
                      practitionerScheduleSessions.practitionerId,
                      apt.practitionerId,
                    ),
                  )
                : sql`true`,
            ),
          })
        : null;

      if (conflictingSession) {
        const isSessionFinished =
          conflictingSession.status !== 'open' ||
          AppointmentTemporalStatusHelper.isElapsed({
            scheduledDate: conflictingSession.scheduleDate,
            scheduledStartTime: conflictingSession.startTime,
            scheduledEndTime: conflictingSession.endTime,
          });

        if (!isSessionFinished) {
          const room = await tx.query.clinicRooms.findFirst({
            where: eq(clinicRooms.id, targetRoomId),
          });
          throw new RoomOccupiedException(
            room?.name || 'Ruangan',
            `${apt.scheduledStartTime.slice(0, 5)} WIB`,
          );
        }
      }

      await tx
        .update(appointments)
        .set({
          roomId: targetRoomId,
          updatedBy: user?.id || user?.sub,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appointments.id, appointmentId));

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus: apt.status,
        newStatus: apt.status,
        reason: 'Perubahan ruangan janji temu',
        changedBy: user?.id || user?.sub,
      });
    });

    await this.redisService.deleteByPrefix('queue:');
    await this.redisService.invalidateTags('schedule', 'appointment', 'queue');

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    await this.notificationPublisher.publishAssignmentChanged(
      updated,
      {
        doctorName: updated.doctorName,
        roomName: updated.roomName,
        type: 'room',
      },
      user,
    );

    return updated;
  }
}
