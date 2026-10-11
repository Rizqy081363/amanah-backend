import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../../../../common/redis/redis.service';
import { AppointmentNotificationPublisher } from '../../application/appointment-notification.publisher';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { isTerminalAppointmentStatus } from '../../domain/constants/appointment-lifecycle.constants';
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

    // Transactional atomic assignment without fragile slot collision locks
    await this.repository.updateAppointmentDoctorTransactional({
      appointmentId,
      targetDoctorId,
      targetRoomId,
      updatedBy: currentUserId,
      reason: finalReason,
      previousStatus: apt.status,
    });

    // Invalidate Redis caches
    await this.redisService.deleteByPrefix('queue:');
    await this.redisService.invalidateTags('schedule', 'appointment', 'queue');

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
    await this.redisService.deleteByPrefix('queue:');
    await this.redisService.invalidateTags('schedule', 'appointment', 'queue');

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

    return updated;
  }
}
