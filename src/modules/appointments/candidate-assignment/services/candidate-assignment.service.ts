import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { RedisService } from '../../../../common/redis/redis.service';
import { AppointmentNotificationPublisher } from '../../application/appointment-notification.publisher';
import {
  REALTIME_EMITTER_PORT,
  type RealtimeEmitterPort,
} from '../../application/ports/realtime-emitter.port';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { toDomainStatus } from '../../domain/types/appointment.types';
import {
  DB_APPOINTMENT_STATUS,
  isTerminalAppointmentStatus,
} from '../../domain/constants/appointment-lifecycle.constants';
import {
  AppointmentNotFoundException,
  AppointmentTerminalStateException,
  DoctorCollisionException,
} from '../../domain/errors/appointment-assignment.errors';
import type {
  ChangeDoctorOptions,
  ICandidateAssignmentPort,
} from '../contracts/candidate-assignment.contract';
import { DrizzleCandidateAssignmentRepository } from '../infrastructure/drizzle-candidate-assignment.repository';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';

@Injectable()
export class CandidateAssignmentService implements ICandidateAssignmentPort {
  constructor(
    private readonly repository: DrizzleCandidateAssignmentRepository,
    private readonly redisService: RedisService,
    private readonly notificationPublisher: AppointmentNotificationPublisher,
    @Inject('FIND_APPOINTMENT_BY_ID')
    private readonly findAppointmentById: (
      id: string,
    ) => Promise<AppointmentEntity | null>,
    @Optional()
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter?: RealtimeEmitterPort,
    @Optional()
    private readonly queueRecalculationService?: QueuePositionRecalculationService,
  ) {}

  async changeDoctor(
    appointmentId: string,
    targetDoctorId: string,
    options?: ChangeDoctorOptions,
    user?: any,
  ): Promise<AppointmentEntity> {
    const context =
      await this.repository.findAppointmentWithContext(appointmentId);
    if (!context || !context.appointment) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const { appointment: apt } = context;

    if (isTerminalAppointmentStatus(apt.status)) {
      throw new AppointmentTerminalStateException(apt.status);
    }

    if (apt.status === DB_APPOINTMENT_STATUS.IN_SERVICE) {
      throw new BadRequestException(
        'Pasien sedang diperiksa oleh dokter (in_service) dan tidak dapat dialihkan',
      );
    }

    if (apt.practitionerId === targetDoctorId) {
      const existing = await this.findAppointmentById(appointmentId);
      if (!existing) throw new AppointmentNotFoundException(appointmentId);
      return existing;
    }

    // Validate target doctor exists and accepts appointments
    const allPractitioners =
      await this.repository.findAllActivePractitioners();
    const targetDoc = allPractitioners.find((p) => p.id === targetDoctorId);

    if (!targetDoc) {
      throw new DoctorCollisionException(
        'Target Dokter',
        'Dokter tidak ditemukan atau tidak aktif menerima janji temu',
      );
    }

    // Check if target doctor is on leave on this service date
    const leaves = await this.repository.findActiveDoctorLeaves(
      apt.scheduledDate,
      context.queueTicket?.sessionId,
    );
    const isDocOnLeave = leaves.some((l) => l.doctorId === targetDoctorId);
    if (isDocOnLeave) {
      throw new BadRequestException(
        `Dokter ${targetDoc.displayName || 'terpilih'} sedang cuti pada tanggal ${apt.scheduledDate}.`,
      );
    }

    // Auto-resolve room if appointment has no room assigned yet
    let targetRoomId = apt.roomId;
    if (!targetRoomId) {
      targetRoomId = await this.repository.findDoctorPreferredRoomId(
        targetDoctorId,
        context.queueTicket?.sessionId,
      );
    }

    const defaultReason = `Tugaskan dokter ke ${targetDoc.displayName || targetDoc.staffProfile?.fullName || targetDoctorId}`;
    const finalReason = options?.reason
      ? `${options.reason} (Target: ${targetDoc.displayName || targetDoctorId})`
      : defaultReason;

    const currentUserId = user?.id || user?.sub || null;

    const previousDoctorId = apt.practitionerId;

    // Transactional atomic assignment without fragile slot collision locks
    await this.repository.updateAppointmentDoctorTransactional({
      appointmentId,
      targetDoctorId,
      previousDoctorId,
      targetRoomId,
      updatedBy: currentUserId,
      reason: finalReason,
      previousStatus: apt.status,
    });

    // Recalculate doctor queues to ensure sequential 1..N FIFO compaction
    if (this.queueRecalculationService) {
      // Recalculate target doctor's queue
      await this.queueRecalculationService.recalculateDoctorQueue({
        serviceDate: apt.scheduledDate,
        practitionerId: targetDoctorId,
      });

      // If appointment was previously assigned to another doctor, compact that doctor's queue
      if (previousDoctorId && previousDoctorId !== targetDoctorId) {
        await this.queueRecalculationService.recalculateDoctorQueue({
          serviceDate: apt.scheduledDate,
          practitionerId: previousDoctorId,
        });
      }
    }

    // Invalidate Redis caches
    await Promise.allSettled([
      this.redisService.deleteByPrefix('queue:'),
      this.redisService.deleteByPrefix('appointments:'),
      this.redisService.invalidateTags(
        'queue',
        'daily',
        'display',
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'appointments',
        'appointments:me',
      ),
    ]);

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    // Publish real-time events via Socket.IO & NotificationPublisher
    await this.notificationPublisher.publishAssignmentChanged(
      updated,
      {
        doctorName: updated.doctorName,
        roomName: updated.roomName,
        type: 'doctor',
      },
      user,
    );

    if (this.realtimeEmitter) {
      await this.realtimeEmitter.emitStatusChanged({
        appointmentId: updated.id,
        status: updated.status,
        previousStatus: toDomainStatus(apt.status),
        queueNumber: Number(updated.queueNumber) || 1,
        practitionerId: updated.staffId || '',
      });
    }

    return updated;
  }

  async changeRoom(
    appointmentId: string,
    targetRoomId: string,
    user?: any,
  ): Promise<AppointmentEntity> {
    const context =
      await this.repository.findAppointmentWithContext(appointmentId);
    if (!context || !context.appointment) {
      throw new AppointmentNotFoundException(appointmentId);
    }

    const { appointment: apt } = context;

    if (isTerminalAppointmentStatus(apt.status)) {
      throw new AppointmentTerminalStateException(apt.status);
    }

    if (apt.roomId === targetRoomId) {
      const existing = await this.findAppointmentById(appointmentId);
      if (!existing) throw new AppointmentNotFoundException(appointmentId);
      return existing;
    }

    // Validate target room exists and is active
    const activeRooms = await this.repository.findAllActiveClinicRooms();
    const targetRoom = activeRooms.find((r) => r.id === targetRoomId);
    if (!targetRoom) {
      throw new BadRequestException('Ruangan tidak ditemukan atau tidak aktif');
    }

    const currentUserId = user?.id || user?.sub || null;

    // Transactional atomic assignment without fragile slot collision locks
    await this.repository.updateAppointmentRoomTransactional({
      appointmentId,
      targetRoomId,
      updatedBy: currentUserId,
      reason: `Tugaskan ruangan ke ${targetRoom.name}`,
      previousStatus: apt.status,
    });

    // Invalidate Redis caches
    await Promise.allSettled([
      this.redisService.deleteByPrefix('queue:'),
      this.redisService.deleteByPrefix('appointments:'),
      this.redisService.invalidateTags(
        'queue',
        'daily',
        'display',
        'schedule',
        'schedule:list',
        'schedule:detail',
        'schedule:patients',
        'appointments',
        'appointments:me',
      ),
    ]);

    const updated = await this.findAppointmentById(appointmentId);
    if (!updated) throw new AppointmentNotFoundException(appointmentId);

    // Publish real-time event
    await this.notificationPublisher.publishAssignmentChanged(
      updated,
      {
        doctorName: updated.doctorName,
        roomName: updated.roomName,
        type: 'room',
      },
      user,
    );

    if (this.realtimeEmitter) {
      await this.realtimeEmitter.emitStatusChanged({
        appointmentId: updated.id,
        status: updated.status,
        previousStatus: toDomainStatus(apt.status),
        queueNumber: Number(updated.queueNumber) || 1,
        practitionerId: updated.staffId || '',
      });
    }

    return updated;
  }
}
