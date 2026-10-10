import { ClinicConfigService } from '@common/clinic-config';
import { DRIZZLE_SOURCE } from '@database/drizzle/drizzle.constants';
import { DrizzleDatabase } from '@database/drizzle/drizzle.provider';
import {
  appointmentStatusEvents,
  appointments,
  clinicRooms,
  practitioners,
  queueTickets,
} from '@database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, not } from 'drizzle-orm';
import { RedisService } from '../../../../common/redis/redis.service';
import { ACTIVE_APPOINTMENT_STATUSES } from '../../../schedules/domain/constants/schedule.constants';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
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

      // 3. Collision check: ensure target doctor is not already occupied at this exact time
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

      // 4. Resolve target room
      const targetRoomId =
        apt.roomId || targetDoc.defaultRoomId || null;

      // 5. Update appointment assignment (Clinic-owned schedule session, dynamic queue ticketing)
      await tx
        .update(appointments)
        .set({
          practitionerId: targetDoctorId,
          roomId: targetRoomId,
          updatedBy: currentUser?.id || currentUser?.sub,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appointments.id, appointmentId));

      await tx
        .update(queueTickets)
        .set({
          doctorId: targetDoctorId,
          roomId: targetRoomId,
        })
        .where(eq(queueTickets.appointmentId, appointmentId));

      // 6. Audit log event
      const defaultReason = `Perubahan dokter ke ${targetDoc.displayName || targetDoc.staffProfile?.fullName || targetDoctorId}`;
      const finalReason = opts?.reason
        ? `${opts.reason} (Target: ${targetDoc.displayName || targetDoctorId})`
        : defaultReason;

      await tx.insert(appointmentStatusEvents).values({
        appointmentId,
        previousStatus: apt.status,
        newStatus: apt.status,
        reason: finalReason,
        changedBy: currentUser?.id || currentUser?.sub,
      });
    });

    // 7. Invalidate Redis caches
    await this.redisService.deleteByPrefix('queue:');
    await this.redisService.invalidateTags('schedule', 'appointment', 'queue');

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    // 8. Publish real-time events via NotificationPublisher & Socket.IO
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

      // Check room collision: one active patient per room at runtime
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

      await tx
        .update(appointments)
        .set({
          roomId: targetRoomId,
          updatedBy: user?.id || user?.sub,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(appointments.id, appointmentId));

      await tx
        .update(queueTickets)
        .set({
          roomId: targetRoomId,
        })
        .where(eq(queueTickets.appointmentId, appointmentId));

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
